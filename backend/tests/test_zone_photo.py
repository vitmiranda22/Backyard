"""
Tests for narrate.py's zone-photo caching (_resolve_zone_photo) — split off
into its own (finer-grained) cache from zone_data_cache after a real
incident: two different, nearby real addresses (~50m apart, same ~153m
narration geohash cell) served the exact same cached Street View photo,
taken from the OTHER address's viewpoint a month earlier. See migration
030 and PHOTO_GEOHASH_PRECISION's own comment in narrate.py.
"""

import geohash2
import pytest
from app.api import narrate
from app.services import supabase_db, r2, streetview

# Real coordinates from the incident this fix addresses (1723 Polk Street).
REAL_LAT, REAL_LNG = 37.7927423080555, -122.421418937223


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


def test_two_nearby_addresses_share_a_narration_cell_but_not_a_photo_cell():
    """
    The actual geometric claim this whole fix rests on: two points ~11m
    apart (well within a single ~153m geohash-7 cell) must land in the
    SAME narration/zone-data cell but DIFFERENT photo cells -- otherwise
    the fix doesn't actually change anything for a real nearby-address
    scenario like the one that was reported.
    """
    lat_a, lng_a = REAL_LAT, REAL_LNG
    lat_b, lng_b = REAL_LAT + 0.0001, REAL_LNG  # ~11m away

    narration_hash_a = geohash2.encode(lat_a, lng_a, precision=narrate.GEOHASH_PRECISION)
    narration_hash_b = geohash2.encode(lat_b, lng_b, precision=narrate.GEOHASH_PRECISION)
    assert narration_hash_a == narration_hash_b  # same ~153m cell

    photo_hash_a = geohash2.encode(lat_a, lng_a, precision=narrate.PHOTO_GEOHASH_PRECISION)
    photo_hash_b = geohash2.encode(lat_b, lng_b, precision=narrate.PHOTO_GEOHASH_PRECISION)
    assert photo_hash_a != photo_hash_b  # different ~19m cell -- no longer share a photo


async def test_resolve_zone_photo_returns_the_cached_signed_url_on_a_hit(monkeypatch):
    monkeypatch.setattr(
        supabase_db, "get_cached_zone_photo",
        _async({"geo_hash": "9q8yypzq", "image_r2_key": "images/9q8yypzq.jpg"}),
    )
    monkeypatch.setattr(r2, "generate_signed_url", lambda key, expires_in=3600: f"https://signed/{key}")

    fetch_called = []
    monkeypatch.setattr(streetview, "fetch_street_view_image", _async(None))

    async def _track_fetch(*args, **kwargs):
        fetch_called.append(True)
        return None
    monkeypatch.setattr(streetview, "fetch_street_view_image", _track_fetch)

    url, key = await narrate._resolve_zone_photo("9q8yypzq", REAL_LAT, REAL_LNG)

    assert url == "https://signed/images/9q8yypzq.jpg"
    assert key == "images/9q8yypzq.jpg"
    assert fetch_called == []  # never hits Street View on a cache hit


async def test_resolve_zone_photo_fetches_and_caches_fresh_on_a_miss(monkeypatch):
    monkeypatch.setattr(supabase_db, "get_cached_zone_photo", _async(None))
    monkeypatch.setattr(streetview, "fetch_street_view_image", _async(b"fake-jpeg-bytes"))
    monkeypatch.setattr(r2, "build_image_r2_key", lambda geo_hash: f"images/{geo_hash}.jpg")
    monkeypatch.setattr(r2, "upload_image", _async(True))
    monkeypatch.setattr(r2, "generate_signed_url", lambda key, expires_in=3600: f"https://signed/{key}")

    stored = []
    async def _track_store(photo_geo_hash, image_r2_key):
        stored.append((photo_geo_hash, image_r2_key))
        return True
    monkeypatch.setattr(supabase_db, "store_zone_photo", _track_store)

    url, key = await narrate._resolve_zone_photo("9q8yypzq", REAL_LAT, REAL_LNG)

    assert url == "https://signed/images/9q8yypzq.jpg"
    assert key == "images/9q8yypzq.jpg"
    assert stored == [("9q8yypzq", "images/9q8yypzq.jpg")]


async def test_resolve_zone_photo_returns_none_when_street_view_has_no_coverage(monkeypatch):
    monkeypatch.setattr(supabase_db, "get_cached_zone_photo", _async(None))
    monkeypatch.setattr(streetview, "fetch_street_view_image", _async(None))

    url, key = await narrate._resolve_zone_photo("9q8yypzq", REAL_LAT, REAL_LNG)

    assert (url, key) == (None, None)


async def test_resolve_zone_photo_returns_none_when_the_r2_upload_fails(monkeypatch):
    monkeypatch.setattr(supabase_db, "get_cached_zone_photo", _async(None))
    monkeypatch.setattr(streetview, "fetch_street_view_image", _async(b"fake-jpeg-bytes"))
    monkeypatch.setattr(r2, "build_image_r2_key", lambda geo_hash: f"images/{geo_hash}.jpg")
    monkeypatch.setattr(r2, "upload_image", _async(False))

    stored = []
    monkeypatch.setattr(supabase_db, "store_zone_photo", lambda *a, **k: stored.append(True))

    url, key = await narrate._resolve_zone_photo("9q8yypzq", REAL_LAT, REAL_LNG)

    assert (url, key) == (None, None)
    assert stored == []  # never persists a key for a photo that never actually uploaded
