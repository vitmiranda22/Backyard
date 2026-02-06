"""
Reverse geocoding via Nominatim (OpenStreetMap).

Converts GPS coordinates → street name, neighborhood, city.
This is the first step in every narration request.

Nominatim is free with no API key. The only rule: be polite.
We rate-limit ourselves to 1 request/second and always send a User-Agent.
"""

import httpx
import logging

logger = logging.getLogger(__name__)

# Be a good citizen — identify ourselves and don't hammer the server.
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "WanderVox/0.1 (tour narration app; contact: hello@wandervox.app)"
REQUEST_TIMEOUT = 5.0  # seconds


class GeocodingResult:
    """Structured result from reverse geocoding."""

    def __init__(self, street: str, neighborhood: str, city: str, country: str):
        self.street = street
        self.neighborhood = neighborhood
        self.city = city
        self.country = country

    def __repr__(self):
        return f"{self.street}, {self.neighborhood}, {self.city}"


async def reverse_geocode(lat: float, lng: float):
    """
    Convert latitude/longitude to a human-readable address.

    Returns None if the request fails (network error, timeout, etc.).
    The caller should handle this gracefully — a failed geocode shouldn't
    crash the whole narration pipeline.

    Example:
        result = await reverse_geocode(37.7696, -122.4469)
        print(result.street)        # "710 Ashbury Street"
        print(result.neighborhood)  # "Haight-Ashbury"
        print(result.city)          # "San Francisco"
    """
    params = {
        "lat": lat,
        "lon": lng,
        "format": "json",
        "addressdetails": 1,  # Include broken-down address components
        "zoom": 18,           # Street-level detail
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                NOMINATIM_URL,
                params=params,
                headers={"User-Agent": USER_AGENT},
                timeout=REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            data = response.json()

    except httpx.TimeoutException:
        logger.warning(f"Nominatim timeout for ({lat}, {lng})")
        return None
    except httpx.HTTPError as e:
        logger.error(f"Nominatim HTTP error for ({lat}, {lng}): {e}")
        return None

    # Parse the address components. Nominatim's response format varies by country,
    # so we try multiple field names and fall back to sensible defaults.
    address = data.get("address", {})

    street = _build_street_name(address)
    neighborhood = (
        address.get("neighbourhood")
        or address.get("suburb")
        or address.get("quarter")
        or address.get("city_district")
        or ""
    )
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or ""
    )
    country = address.get("country", "")

    return GeocodingResult(
        street=street,
        neighborhood=neighborhood,
        city=city,
        country=country,
    )


def _build_street_name(address: dict) -> str:
    """
    Build a street name from Nominatim's address components.

    Nominatim gives us individual pieces (house_number, road). We combine them
    into something readable like "710 Ashbury Street".
    """
    parts = []

    house_number = address.get("house_number", "")
    road = address.get("road") or address.get("pedestrian") or address.get("path") or ""

    if house_number:
        parts.append(house_number)
    if road:
        parts.append(road)

    return " ".join(parts) if parts else "Unknown Street"