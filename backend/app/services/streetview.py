"""
Google Street View Static API — one photo per zone.

Gives the listener a real street-level photo of roughly the spot the
narration is discussing. The API searches a ~50m radius for the nearest
available photo to a coordinate, so it can occasionally show a neighboring
building rather than the exact one — an accepted approximation.

Cached per photo_geo_hash (precision 8, ~19m — deliberately much finer
than narration's own ~153m geohash cells, since a photo is viewpoint-
specific in a way narration text isn't; see migration 030) once fetched —
see store_zone_photo()/get_cached_zone_photo() in supabase_db.py and the
wiring in narrate.py.
"""

import httpx
import logging

from app.config import settings

logger = logging.getLogger(__name__)

STREETVIEW_METADATA_URL = "https://maps.googleapis.com/maps/api/streetview/metadata"
STREETVIEW_IMAGE_URL = "https://maps.googleapis.com/maps/api/streetview"
REQUEST_TIMEOUT = 8.0  # seconds


async def fetch_street_view_image(lat: float, lng: float) -> bytes:
    """
    Fetch a street-level JPEG photo for a coordinate, or None if unavailable.

    Checks the free metadata endpoint first — it doesn't count against
    quota — so we never pay for (or cache) Google's "no imagery available"
    placeholder when there's genuinely no coverage at this location.

    Returns:
        Raw JPEG bytes, or None if there's no imagery here or the request failed.
    """
    location = f"{lat},{lng}"

    try:
        async with httpx.AsyncClient() as client:
            metadata_response = await client.get(
                STREETVIEW_METADATA_URL,
                params={
                    "location": location,
                    "key": settings.GOOGLE_STREETVIEW_API_KEY,
                    # Without this, Google's nearest-panorama search can
                    # return an indoor business photosphere (a shop/cafe's
                    # own 360 tour, often through a third-party vendor like
                    # "VR2GO" or "Threshold 360") instead of a real street-
                    # level shot -- confirmed happening in production: two
                    # zones on the same tour got random business interiors
                    # nowhere near the walker's actual address.
                    "source": "outdoor",
                },
                timeout=REQUEST_TIMEOUT,
            )
            metadata_response.raise_for_status()
            metadata = metadata_response.json()

            if metadata.get("status") != "OK":
                logger.info(f"No Street View coverage at ({lat}, {lng}): {metadata.get('status')}")
                return None

            # `source=outdoor` above doesn't reliably exclude business-
            # contributed 360 tours (a pro photographer's indoor shoot for
            # a hotel/restaurant can still come back tagged "outdoor").
            # A genuine Google-captured street-level photo's copyright
            # field says "Google"; anything else (confirmed in production:
            # a Las Vegas Strip resort's metadata came back with the
            # photographer's initials instead) is someone's own photosphere
            # and just as likely to be an interior shot nowhere near what
            # the narration is actually describing.
            copyright_field = metadata.get("copyright") or ""
            if "google" not in copyright_field.lower():
                logger.info(
                    f"Rejecting non-Google Street View imagery at ({lat}, {lng}): "
                    f"copyright={copyright_field!r}"
                )
                return None

            image_response = await client.get(
                STREETVIEW_IMAGE_URL,
                params={
                    "size": "640x400",
                    "location": location,
                    "key": settings.GOOGLE_STREETVIEW_API_KEY,
                    "source": "outdoor",
                },
                timeout=REQUEST_TIMEOUT,
            )
            image_response.raise_for_status()

            image_bytes = image_response.content
            logger.info(f"Fetched Street View image for ({lat}, {lng}): {len(image_bytes)} bytes")
            return image_bytes

    except httpx.TimeoutException:
        logger.warning(f"Street View timeout for ({lat}, {lng})")
        return None
    except httpx.HTTPError as e:
        logger.error(f"Street View HTTP error for ({lat}, {lng}): {e}")
        return None
