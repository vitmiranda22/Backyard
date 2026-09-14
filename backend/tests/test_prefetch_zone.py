"""
Tests for POST /prefetch-zone — the speculative zone-data warmer
ActiveTourScreen.tsx calls with a point projected ahead of the walker's
heading. Covers: cache-already-warm short-circuit, the actual warm-the-cache
path, and rate limiting. Never touches OpenAI/TTS/Street View — this
endpoint only ever writes to zone_data_cache, never narration_cache.
"""

from app.api import narrate
from app.services import supabase_db, geocode
from app.services.geocode import GeocodingResult

USER_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd"

GEO_RESULT = GeocodingResult(street="Main St", neighborhood="Downtown", city="San Francisco", country="US")


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


def _request_body(**overrides):
    body = {"lat": 37.7749, "lng": -122.4194}
    body.update(overrides)
    return body


def test_already_cached_short_circuits_without_fetching(app, client, auth_as, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    monkeypatch.setattr(supabase_db, "get_cached_zone_data", _async({"geo_hash": "9q8yyk8"}))

    called = {"fetch": False, "store": False}

    async def _fail_if_called(*args, **kwargs):
        called["fetch"] = True
    monkeypatch.setattr(narrate, "fetch_all_zone_data", _fail_if_called)

    async def _store_called(*args, **kwargs):
        called["store"] = True
    monkeypatch.setattr(supabase_db, "store_zone_data", _store_called)

    resp = client.post("/api/prefetch-zone", json=_request_body())

    assert resp.status_code == 200
    assert resp.json() == {"cached": True}
    assert called["fetch"] is False
    assert called["store"] is False


def test_cache_miss_fetches_and_stores_zone_data(app, client, auth_as, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    monkeypatch.setattr(supabase_db, "get_cached_zone_data", _async(None))
    monkeypatch.setattr(geocode, "reverse_geocode", _async(GEO_RESULT))

    async def _fake_fetch_all(**kwargs):
        assert kwargs["street_name"] == "Main St"
        return {
            "zone_data": {"wikipedia": []}, "sources_queried": ["wikipedia"],
            "sources_failed": [], "sources_skipped": [], "hit_count": 0, "total": 1,
        }
    monkeypatch.setattr(narrate, "fetch_all_zone_data", _fake_fetch_all)

    stored = {}

    async def _capture_store(**kwargs):
        stored.update(kwargs)
        return True
    monkeypatch.setattr(supabase_db, "store_zone_data", _capture_store)

    resp = client.post("/api/prefetch-zone", json=_request_body())

    assert resp.status_code == 200
    assert resp.json() == {"cached": True}
    assert stored["street_name"] == "Main St"
    assert stored["city"] == "San Francisco"


def test_rate_limited_returns_429(app, client, auth_as, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((False, "minute_limit_exceeded")))

    resp = client.post("/api/prefetch-zone", json=_request_body())

    assert resp.status_code == 429
    assert resp.json()["detail"]["code"] == "minute_limit_exceeded"


def test_geocode_failure_still_warms_cache_with_blank_fields(app, client, auth_as, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    monkeypatch.setattr(supabase_db, "get_cached_zone_data", _async(None))
    monkeypatch.setattr(geocode, "reverse_geocode", _async(None))

    async def _fake_fetch_all(**kwargs):
        assert kwargs["street_name"] == ""
        return {
            "zone_data": {}, "sources_queried": [], "sources_failed": [],
            "sources_skipped": [], "hit_count": 0, "total": 0,
        }
    monkeypatch.setattr(narrate, "fetch_all_zone_data", _fake_fetch_all)
    monkeypatch.setattr(supabase_db, "store_zone_data", _async(True))

    resp = client.post("/api/prefetch-zone", json=_request_body())

    assert resp.status_code == 200
    assert resp.json() == {"cached": True}
