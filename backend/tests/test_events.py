"""
Tests for the authenticated, in-app events endpoints:
GET /api/events/nearby and GET /api/events/{event_id}.

Distinct from test_public_events.py's unauthenticated marketing-site
endpoints -- every test here goes through auth_as, and there's no
geocoding/IP-rate-limit involved since the caller supplies its own
lat/lng directly (a real GPS position), never a typed city name.
"""

import pytest

from app.services import supabase_db

USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

RAW_EVENT_ROW = {
    "id": "11111111-1111-1111-1111-111111111111",
    "name": "Sunset Street Festival",
    "description": "Live music and food stalls.",
    "category": "festival",
    "city": "San Francisco",
    "center_lat": 37.7749,
    "center_lng": -122.4194,
    "radius_m": 300,
    "start_time": "2020-01-01T00:00:00+00:00",
    "end_time": "2999-01-01T00:00:00+00:00",
    "source_url": None,
    "source": "manual",
    "distance_m": 42.5,
}


def _event(**overrides):
    row = dict(RAW_EVENT_ROW)
    row.update(overrides)
    return row


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


# --- GET /events/nearby ------------------------------------------------------

def test_returns_nearby_events_for_an_authenticated_caller(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_nearby_events", _async([_event()]))

    resp = client.get("/api/events/nearby", params={"lat": 37.7749, "lng": -122.4194})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["name"] == "Sunset Street Festival"
    assert body[0]["distance_m"] == 42.5
    assert body[0]["phase"] == "happening"


def test_requires_auth(client):
    resp = client.get("/api/events/nearby", params={"lat": 37.7749, "lng": -122.4194})
    assert resp.status_code == 401


def test_returns_empty_list_when_nothing_nearby(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_nearby_events", _async([]))

    resp = client.get("/api/events/nearby", params={"lat": 37.7749, "lng": -122.4194})

    assert resp.status_code == 200
    assert resp.json() == []


def test_passes_query_params_through_to_the_db_call(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    captured = {}

    async def _track(lat, lng, radius_m, category, limit):
        captured.update(lat=lat, lng=lng, radius_m=radius_m, category=category, limit=limit)
        return []
    monkeypatch.setattr(supabase_db, "get_nearby_events", _track)

    client.get("/api/events/nearby", params={"lat": 40.7128, "lng": -74.006, "radius_m": 2000, "category": "run", "limit": 10})

    assert captured == {"lat": 40.7128, "lng": -74.006, "radius_m": 2000, "category": "run", "limit": 10}


def test_rejects_an_out_of_range_coordinate(client, auth_as, app):
    auth_as(app, USER_ID)
    resp = client.get("/api/events/nearby", params={"lat": 200.0, "lng": 0.0})
    assert resp.status_code == 422


def test_computes_phase_for_an_upcoming_event(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_nearby_events", _async([
        _event(start_time="2999-01-01T00:00:00+00:00", end_time="2999-01-02T00:00:00+00:00"),
    ]))

    resp = client.get("/api/events/nearby", params={"lat": 37.7749, "lng": -122.4194})

    assert resp.json()[0]["phase"] == "upcoming"


# --- GET /events/{event_id} --------------------------------------------------

def test_returns_a_single_events_detail(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_event_by_id", _async(_event()))

    resp = client.get(f"/api/events/{RAW_EVENT_ROW['id']}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Sunset Street Festival"
    assert body["source"] == "manual"
    assert body["distance_m"] is None  # no caller location to measure from on the detail endpoint


def test_detail_requires_auth(client):
    resp = client.get(f"/api/events/{RAW_EVENT_ROW['id']}")
    assert resp.status_code == 401


def test_returns_404_for_an_unknown_or_inactive_event(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_event_by_id", _async(None))

    resp = client.get("/api/events/nonexistent-id")

    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "event_not_found"


# --- get_event_by_id (service layer) -----------------------------------------

@pytest.mark.asyncio
async def test_get_event_by_id_only_matches_active_events(monkeypatch):
    """
    Real bug shape this guards against: a manually-killed event
    (is_active=false) shouldn't be reachable by a direct link just
    because its id is known -- it's already excluded from every list
    endpoint, the detail endpoint must match.
    """
    captured = {}

    class _FakeResult:
        data = []

    class _FakeQuery:
        def __init__(self):
            self.filters = {}

        def select(self, *a, **k):
            return self

        def eq(self, col, val):
            self.filters[col] = val
            return self

        def limit(self, n):
            captured["filters"] = dict(self.filters)
            return self

        def execute(self):
            return _FakeResult()

    class _FakeClient:
        def table(self, name):
            captured["table"] = name
            return _FakeQuery()

    monkeypatch.setattr(supabase_db, "_get_client", lambda: _FakeClient())

    await supabase_db.get_event_by_id("some-id")

    assert captured["table"] == "events"
    assert captured["filters"] == {"id": "some-id", "is_active": True}
