"""
Metropolitan Museum of Art Collection API — real object facts + images for
Museum Tours (see scripts/plant_museum_tours.py). Fully open, no API key.

Standalone module, not folded into global_sources.py: everything there is
called from zone_data.fetch_all_zone_data's per-request (lat, lng, client)
fan-out. A Met object lookup is a one-off-script call shape (object_id ->
one object's facts), never part of that live per-narration pipeline.

Base URL and field names verified live against the real API:
    https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}
`GalleryNumber` is non-empty exactly when a piece is on physical display
(confirmed live: Van Gogh's "Sunflowers", object 436524, on permanent
display, has GalleryNumber "825"; an object with no gallery assigned has
GalleryNumber "").
"""

import httpx
import logging

logger = logging.getLogger(__name__)

MET_API_BASE = "https://collectionapi.metmuseum.org/public/collection/v1"
TIMEOUT = 10.0

# The Met's API sits behind bot-detection that 403s httpx's default UA
# string (confirmed live: identical request succeeds with a browser UA,
# fails with httpx's own "python-httpx/x.y" default) -- not an auth
# requirement, the API itself is still genuinely free/keyless.
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
}


async def fetch_met_object(object_id: int, client: httpx.AsyncClient) -> dict:
    """
    Fetch one object's real facts from the Met's Collection API.

    Returns a dict with title, artist_display_name, artist_display_bio,
    object_date, medium, culture, department, classification, primary_image,
    object_url, gallery_number, and is_on_view (bool). None on any HTTP or
    parse failure -- logged as a warning, never raised, matching this
    project's other external-source fetchers (see global_sources.fetch_smithsonian).
    """
    try:
        response = await client.get(f"{MET_API_BASE}/objects/{object_id}", headers=_HEADERS, timeout=TIMEOUT)
        response.raise_for_status()
        data = response.json()

        gallery_number = data.get("GalleryNumber", "") or ""

        return {
            "object_id": object_id,
            "title": data.get("title", ""),
            "artist_display_name": data.get("artistDisplayName", ""),
            "artist_display_bio": data.get("artistDisplayBio", ""),
            "object_date": data.get("objectDate", ""),
            "medium": data.get("medium", ""),
            "culture": data.get("culture", ""),
            "department": data.get("department", ""),
            "classification": data.get("classification", ""),
            "primary_image": data.get("primaryImage", ""),
            "object_url": data.get("objectURL", ""),
            "gallery_number": gallery_number,
            "is_on_view": bool(gallery_number),
        }
    except Exception as e:
        logger.warning(f"Met Museum API failed for object {object_id}: {e}")
        return None


async def fetch_met_image_bytes(image_url: str, client: httpx.AsyncClient) -> bytes:
    """
    Download the Met's own primaryImage JPEG bytes for re-upload to R2 --
    same reasoning as streetview.fetch_street_view_image: never hotlink an
    external image from the app, keep our own signed-URL lifecycle.

    Returns None if image_url is empty or the download fails.
    """
    if not image_url:
        return None

    try:
        response = await client.get(image_url, headers=_HEADERS, timeout=TIMEOUT)
        response.raise_for_status()
        return response.content
    except Exception as e:
        logger.warning(f"Failed to download Met image {image_url}: {e}")
        return None
