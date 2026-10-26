import asyncio
import importlib.util
import math
from pathlib import Path
from types import SimpleNamespace

import geohash2

_spec = importlib.util.spec_from_file_location(
    "prefill_zone_data", Path(__file__).parent.parent / "scripts" / "prefill_zone_data.py"
)
prefill = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(prefill)

LAT, LNG = 37.7955, -122.3937


def _distance_m(lat1, lng1, lat2, lng2):
    dy = (lat2 - lat1) * prefill.METERS_PER_DEGREE_LAT
    dx = (lng2 - lng1) * prefill.METERS_PER_DEGREE_LAT * math.cos(math.radians(lat1))
    return math.hypot(dx, dy)


def test_zero_radius_is_just_the_center_block():
    assert prefill.blocks_in_radius(LAT, LNG, 0) == [geohash2.encode(LAT, LNG, precision=7)]


def test_radius_covers_the_area_without_duplicates_or_far_cells():
    blocks = prefill.blocks_in_radius(LAT, LNG, 500)

    assert len(blocks) == len(set(blocks))
    assert geohash2.encode(LAT, LNG, precision=7) in blocks
    # Every cell center sits within the radius plus one cell's diagonal (~220 m).
    for gh in blocks:
        lat, lng, _, _ = geohash2.decode_exactly(gh)
        assert _distance_m(LAT, LNG, lat, lng) < 500 + 220


def test_already_cached_block_is_skipped(monkeypatch):
    async def cached(_):
        return {"raw_data": {}}

    async def must_not_fetch(**_):
        raise AssertionError("should not fetch a cached block")

    monkeypatch.setattr(prefill.supabase_db, "get_cached_zone_data", cached)
    monkeypatch.setattr(prefill, "fetch_all_zone_data", must_not_fetch)

    assert asyncio.run(prefill.prefill_block("9q8znd2")) == "already cached"


def test_uncached_block_is_fetched_and_stored(monkeypatch):
    stored = {}

    async def not_cached(_):
        return None

    async def geocoded(lat, lng):
        return SimpleNamespace(street="Market St", neighborhood="FiDi", city="San Francisco", country="US")

    async def fetched(**_):
        return {"zone_data": {"wikipedia": [1]}, "sources_queried": ["wikipedia"], "sources_failed": [],
                "sources_skipped": ["x"], "hit_count": 1, "total": 3}

    async def store(**kwargs):
        stored.update(kwargs)

    monkeypatch.setattr(prefill.supabase_db, "get_cached_zone_data", not_cached)
    monkeypatch.setattr(prefill.geocode, "reverse_geocode", geocoded)
    monkeypatch.setattr(prefill, "fetch_all_zone_data", fetched)
    monkeypatch.setattr(prefill.supabase_db, "store_zone_data", store)

    asyncio.run(prefill.prefill_block("9q8znd2"))

    assert stored["geo_hash"] == "9q8znd2"
    assert stored["sources_eligible_count"] == 2  # total minus skipped, as narrate.py computes it
    assert stored["city"] == "San Francisco"
