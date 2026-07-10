"""
Reverse geocoding via Nominatim (OpenStreetMap).

Converts GPS coordinates → street name, neighborhood, city.
This is the first step in every narration request.

Nominatim is free with no API key. The only rule: be polite.
We rate-limit ourselves to 1 request/second and always send a User-Agent.
"""

import asyncio
import time
import httpx
import logging

logger = logging.getLogger(__name__)

# Be a good citizen — identify ourselves and don't hammer the server.
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "BackyardApp/1.0 (tour guide app; contact@backyard.app)"
REQUEST_TIMEOUT = 5.0  # seconds

# Nominatim's usage policy caps us at 1 request/second — this used to be a
# comment with no code behind it. A flood of concurrent narrate-block calls
# (whether legitimate traffic or someone hammering the endpoint) would blow
# past that limit from this single server IP and risk an outright ban,
# which would break reverse geocoding — and therefore most of the narration
# pipeline — for every user, not just whoever caused it. This lock+delay
# pattern serializes all outbound Nominatim calls to at most 1/second
# across every concurrent request this process is handling.
_last_request_at = 0.0
_throttle_lock = asyncio.Lock()
MIN_REQUEST_INTERVAL = 1.0  # seconds


async def _throttle():
    global _last_request_at
    async with _throttle_lock:
        wait = MIN_REQUEST_INTERVAL - (time.monotonic() - _last_request_at)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_request_at = time.monotonic()


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

    # One retry on a transient failure — Nominatim is a free, best-effort
    # public instance with no SLA, and a single blip here used to fall all
    # the way through to showing the walker raw coordinates instead of a
    # street name.
    data = None
    for attempt in range(2):
        try:
            await _throttle()
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    NOMINATIM_URL,
                    params=params,
                    headers={"User-Agent": USER_AGENT},
                    timeout=REQUEST_TIMEOUT,
                )
                response.raise_for_status()
                data = response.json()
            break
        except httpx.TimeoutException:
            logger.warning(f"Nominatim timeout for ({lat}, {lng}), attempt {attempt + 1}/2")
        except httpx.HTTPError as e:
            logger.warning(f"Nominatim HTTP error for ({lat}, {lng}), attempt {attempt + 1}/2: {e}")

    if data is None:
        logger.error(f"Nominatim failed for ({lat}, {lng}) after 2 attempts")
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