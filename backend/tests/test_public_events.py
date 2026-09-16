"""
Tests for GET /api/public/events — the unauthenticated events lookup
that powers the marketing site. No auth_as fixture needed here: the
whole point of this endpoint is that it works with no logged-in user.
"""

from app.services import geocode, supabase_db

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
    "distance_m": 42.5,
}


class _FakeGeocodeResult:
    def __init__(self, lat, lng, city):
        self.lat = lat
        self.lng = lng
        self.city = city


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


def test_returns_events_for_a_geocodable_city_with_no_auth(client, monkeypatch):
    monkeypatch.setattr(geocode, "forward_geocode", _async(_FakeGeocodeResult(37.7749, -122.4194, "San Francisco")))
    monkeypatch.setattr(supabase_db, "get_nearby_events", _async([RAW_EVENT_ROW]))

    resp = client.get("/api/public/events", params={"city": "San Francisco"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["city"] == "San Francisco"
    assert body["lat"] == 37.7749
    assert body["lng"] == -122.4194
    assert len(body["events"]) == 1
    assert body["events"][0]["name"] == "Sunset Street Festival"
    assert body["events"][0]["phase"] == "happening"


def test_returns_404_for_a_place_nominatim_cant_find(client, monkeypatch):
    monkeypatch.setattr(geocode, "forward_geocode", _async(None))

    resp = client.get("/api/public/events", params={"city": "nonexistent-place-xyzzy"})

    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "place_not_found"


def test_returns_empty_events_list_for_a_real_place_with_nothing_synced(client, monkeypatch):
    monkeypatch.setattr(geocode, "forward_geocode", _async(_FakeGeocodeResult(34.05, -118.24, "Los Angeles")))
    monkeypatch.setattr(supabase_db, "get_nearby_events", _async([]))

    resp = client.get("/api/public/events", params={"city": "Los Angeles"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["city"] == "Los Angeles"
    assert body["events"] == []


def test_geocodes_the_typed_city_not_hardcoded_coordinates(client, monkeypatch):
    captured = {}

    async def _track_geocode(place_name):
        captured["place_name"] = place_name
        return _FakeGeocodeResult(40.7128, -74.0060, "New York")

    monkeypatch.setattr(geocode, "forward_geocode", _track_geocode)
    monkeypatch.setattr(supabase_db, "get_nearby_events", _async([]))

    client.get("/api/public/events", params={"city": "new york city"})

    assert captured["place_name"] == "new york city"


def test_rejects_an_empty_city_query(client):
    resp = client.get("/api/public/events", params={"city": ""})

    assert resp.status_code == 422
