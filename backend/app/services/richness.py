"""
Data richness signal — a static, instant classification of how much of
the app's 23-source zone-data pipeline is likely to return real content
for a given city.

This deliberately reuses the same city-gating logic zone_data.py already
runs on (DataSF sources are always queried but only return results near
SF; city_data.py's sources are gated on a city-name substring match)
rather than querying zone_data_cache for real coverage stats — that table
has no index on city and rows expire after 30 days, so a live aggregate
would be both slow and an inaccurate proxy for "how rich COULD this city
be," skewed by how many users have already visited it.
"""

from typing import Literal

from app.services.city_data import CITY_DATASETS

Tier = Literal["full", "partial", "global"]

RICHNESS_MESSAGES: dict[Tier, str] = {
    "full": "Full local detail available here — every Backyard data source covers this city.",
    "partial": "Good local detail here, with extra city data on top of the global sources.",
    "global": "Standard detail here — Dark Side and Unfiltered shine brightest in San Francisco, New York, and Chicago.",
}


def get_richness_tier(city: str) -> Tier:
    if not city:
        return "global"
    city_lower = city.lower()
    if "san francisco" in city_lower:
        return "full"
    if any(key in city_lower for key in CITY_DATASETS):
        return "partial"
    return "global"


def get_richness_message(tier: Tier) -> str:
    return RICHNESS_MESSAGES.get(tier, RICHNESS_MESSAGES["global"])
