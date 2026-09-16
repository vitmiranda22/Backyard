"""
Tests for Terra Incognita (fog-of-war map discovery):
POST/GET /api/explored-cells, and the discovery filter this powers on
GET /api/routes/nearby (tours.py) that hides a tour until the caller has
personally walked through its geohash cell.
"""

import geohash2
import pytest
from app.services import supabase_db

USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
GEOHASH_PRECISION = 7


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


def _route(**overrides):
    row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "title": "Wharf Secrets",
        "mood": "hidden_city",
        "tour_type": "walking",
        "city": "San Francisco",
        "avg_rating": 4.8,
        "rating_count": 12,
        "blocks_visited": 5,
        "total_distance_m": 900,
        "duration_sec": 1200,
        "is_anonymous": False,
        "content_safety_on": False,
        "creator_display_name": "A Walker",
        "creator_avatar_url": None,
        "distance_m": 120.0,
        "created_at": "2026-01-01T00:00:00+00:00",
        "lat": 37.8087,
        "lng": -122.4098,
    }
    row.update(overrides)
    return row


# --- POST /explored-cells ---------------------------------------------------

def test_reports_the_geohash_for_the_given_point(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    captured = {}

    async def _track(user_id, geo_hashes):
        captured["user_id"] = user_id
        captured["geo_hashes"] = geo_hashes
    monkeypatch.setattr(supabase_db, "mark_cells_explored", _track)

    resp = client.post("/api/explored-cells", json={"lat": 37.8087, "lng": -122.4098})

    assert resp.status_code == 200
    expected_hash = geohash2.encode(37.8087, -122.4098, precision=GEOHASH_PRECISION)
    assert resp.json() == {"geo_hash": expected_hash}
    assert captured["user_id"] == USER_ID
    assert captured["geo_hashes"] == [expected_hash]


def test_rejects_an_out_of_range_coordinate(client, auth_as, app):
    auth_as(app, USER_ID)
    resp = client.post("/api/explored-cells", json={"lat": 200.0, "lng": 0.0})
    assert resp.status_code == 422


# --- GET /explored-cells -----------------------------------------------------

def test_returns_the_callers_full_explored_history(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_explored_geohashes", _async(["9q8yyk8", "9q8yyk9"]))

    resp = client.get("/api/explored-cells")

    assert resp.status_code == 200
    assert resp.json() == {"geo_hashes": ["9q8yyk8", "9q8yyk9"]}


def test_returns_an_empty_list_for_a_brand_new_user(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_explored_geohashes", _async([]))

    resp = client.get("/api/explored-cells")

    assert resp.status_code == 200
    assert resp.json() == {"geo_hashes": []}


# --- GET /routes/nearby discovery filter ------------------------------------

def test_hides_a_tour_the_caller_has_not_explored(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_nearby_tours", _async([_route()]))
    monkeypatch.setattr(supabase_db, "get_zone_richness_batch", _async({}))
    monkeypatch.setattr(supabase_db, "get_explored_cells_among", _async(set()))  # nothing discovered

    resp = client.get("/api/routes/nearby", params={"lat": 37.8, "lng": -122.4})

    assert resp.status_code == 200
    assert resp.json() == []


def test_shows_a_tour_the_caller_has_explored(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    route = _route()
    expected_hash = geohash2.encode(route["lat"], route["lng"], precision=GEOHASH_PRECISION)
    monkeypatch.setattr(supabase_db, "get_nearby_tours", _async([route]))
    monkeypatch.setattr(supabase_db, "get_zone_richness_batch", _async({}))
    monkeypatch.setattr(supabase_db, "get_explored_cells_among", _async({expected_hash}))

    resp = client.get("/api/routes/nearby", params={"lat": 37.8, "lng": -122.4})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["tour_id"] == route["id"]


def test_shows_only_the_explored_tour_among_several_candidates(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    discovered = _route(id="discovered-1", lat=37.8087, lng=-122.4098)
    undiscovered = _route(id="undiscovered-1", lat=40.7128, lng=-74.0060)
    discovered_hash = geohash2.encode(discovered["lat"], discovered["lng"], precision=GEOHASH_PRECISION)

    monkeypatch.setattr(supabase_db, "get_nearby_tours", _async([discovered, undiscovered]))
    monkeypatch.setattr(supabase_db, "get_zone_richness_batch", _async({}))
    monkeypatch.setattr(supabase_db, "get_explored_cells_among", _async({discovered_hash}))

    resp = client.get("/api/routes/nearby", params={"lat": 37.8, "lng": -122.4})

    body = resp.json()
    assert [r["tour_id"] for r in body] == ["discovered-1"]


# --- POST /explored-cells: abuse guards --------------------------------------

def test_rate_limited_caller_gets_429(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((False, "minute_limit_exceeded")))

    resp = client.post("/api/explored-cells", json={"lat": 37.7749, "lng": -122.4194})

    assert resp.status_code == 429


def test_an_implausible_jump_is_not_persisted(client, auth_as, app, monkeypatch):
    """
    The caller's last explored cell was San Francisco 5 seconds ago; this
    report claims New York -- physically impossible, so it should be
    silently dropped (still 200, still returns the geo_hash, but never
    reaches mark_cells_explored).
    """
    import datetime
    auth_as(app, USER_ID)
    sf_hash = geohash2.encode(37.7749, -122.4194, precision=GEOHASH_PRECISION)
    monkeypatch.setattr(supabase_db, "get_most_recently_explored_cell", _async({
        "geo_hash": sf_hash,
        "first_explored_at": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=5)).isoformat(),
    }))

    called = []
    async def _track_mark(*args, **kwargs):
        called.append((args, kwargs))
    monkeypatch.setattr(supabase_db, "mark_cells_explored", _track_mark)

    resp = client.post("/api/explored-cells", json={"lat": 40.7128, "lng": -74.0060})  # New York

    assert resp.status_code == 200
    assert called == []


def test_a_plausible_report_with_no_prior_history_is_persisted(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_most_recently_explored_cell", _async(None))

    called = []
    async def _track_mark(user_id, geo_hashes):
        called.append((user_id, geo_hashes))
    monkeypatch.setattr(supabase_db, "mark_cells_explored", _track_mark)

    resp = client.post("/api/explored-cells", json={"lat": 37.7749, "lng": -122.4194})

    assert resp.status_code == 200
    assert len(called) == 1
    assert called[0][0] == USER_ID


def test_a_plausible_nearby_report_is_persisted(client, auth_as, app, monkeypatch):
    """A few real blocks away, a minute later -- an ordinary walking pace, must still be recorded."""
    import datetime
    auth_as(app, USER_ID)
    prior_hash = geohash2.encode(37.7749, -122.4194, precision=GEOHASH_PRECISION)
    monkeypatch.setattr(supabase_db, "get_most_recently_explored_cell", _async({
        "geo_hash": prior_hash,
        "first_explored_at": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1)).isoformat(),
    }))

    called = []
    async def _track_mark(user_id, geo_hashes):
        called.append((user_id, geo_hashes))
    monkeypatch.setattr(supabase_db, "mark_cells_explored", _track_mark)

    resp = client.post("/api/explored-cells", json={"lat": 37.7760, "lng": -122.4194})

    assert resp.status_code == 200
    assert len(called) == 1
