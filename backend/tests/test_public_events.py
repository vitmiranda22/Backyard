"""
Tests for the public (unauthenticated) events endpoints that power the
marketing site: GET /api/public/events/top (global) and
GET /api/public/events?city=... (by place name). No auth_as fixture
needed anywhere here: the whole point of these endpoints is that they
work with no logged-in user.
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
    "rank": 75,
}


def _event(**overrides):
    row = dict(RAW_EVENT_ROW)
    row.update(overrides)
    return row


class _FakeGeocodeResult:
    def __init__(self, lat, lng, city):
        self.lat = lat
        self.lng = lng
        self.city = city


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


# --- GET /public/events/top -------------------------------------------------

def test_top_events_returns_the_ranked_global_list(client, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_top_events_globally", _async([_event()]))

    resp = client.get("/api/public/events/top")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["name"] == "Sunset Street Festival"
    assert body[0]["distance_m"] is None  # no center point for a worldwide query


def test_top_events_works_with_no_query_params_at_all(client, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_top_events_globally", _async([]))

    resp = client.get("/api/public/events/top")

    assert resp.status_code == 200
    assert resp.json() == []


# --- GET /public/events?city=... --------------------------------------------

def test_returns_events_for_a_geocodable_city_with_no_auth(client, monkeypatch):
    monkeypatch.setattr(geocode, "forward_geocode", _async(_FakeGeocodeResult(37.7749, -122.4194, "San Francisco")))
    monkeypatch.setattr(supabase_db, "get_nearby_events", _async([_event()]))

    resp = client.get("/api/public/events", params={"city": "San Francisco"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["city"] == "San Francisco"
    assert body["lat"] == 37.7749
    assert body["lng"] == -122.4194
    assert len(body["events"]) == 1
    assert body["events"][0]["name"] == "Sunset Street Festival"
    assert body["events"][0]["phase"] == "happening"


def test_filters_out_low_rank_events_like_small_private_parties(client, monkeypatch):
    # A real regression this session: an unranked list was dominated by
    # small private parties/club nights, not public/cultural events.
    monkeypatch.setattr(geocode, "forward_geocode", _async(_FakeGeocodeResult(37.7749, -122.4194, "San Francisco")))
    monkeypatch.setattr(supabase_db, "get_nearby_events", _async([
        _event(id="a", name="City Cultural Festival", rank=80),
        _event(id="b", name="Someone's Birthday Party", rank=5),
        _event(id="c", name="No Rank At All", rank=None),
    ]))

    resp = client.get("/api/public/events", params={"city": "San Francisco"})

    body = resp.json()
    names = [e["name"] for e in body["events"]]
    assert names == ["City Cultural Festival"]


def test_caps_results_at_the_top_events_limit_sorted_by_rank(client, monkeypatch):
    monkeypatch.setattr(geocode, "forward_geocode", _async(_FakeGeocodeResult(37.7749, -122.4194, "San Francisco")))
    rows = [_event(id=str(i), name=f"Event {i}", rank=r) for i, r in enumerate([50, 90, 60, 100, 70, 55, 99])]
    monkeypatch.setattr(supabase_db, "get_nearby_events", _async(rows))

    resp = client.get("/api/public/events", params={"city": "San Francisco"})

    body = resp.json()
    assert len(body["events"]) == 6  # 7 qualify, capped to 6
    ranks_in_order = [rows[int(e["id"])]["rank"] for e in body["events"]]
    assert ranks_in_order == sorted(ranks_in_order, reverse=True)


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


# --- IP rate limit -----------------------------------------------------------
# This endpoint is fully unauthenticated and shares a process-wide Nominatim
# throttle/lock with the real narration pipeline's reverse-geocoding -- a
# tight loop of requests here can stall narration for every real user.

def test_ip_rate_limit_kicks_in_after_repeated_requests(client, monkeypatch):
    from app.api import public_events
    public_events._ip_request_log.clear()  # isolate from any earlier test in this file

    monkeypatch.setattr(geocode, "forward_geocode", _async(_FakeGeocodeResult(37.7749, -122.4194, "San Francisco")))
    monkeypatch.setattr(supabase_db, "get_nearby_events", _async([]))

    statuses = [
        client.get("/api/public/events", params={"city": "San Francisco"}).status_code
        for _ in range(public_events._IP_RATE_LIMIT_MAX_REQUESTS + 3)
    ]

    assert statuses[:public_events._IP_RATE_LIMIT_MAX_REQUESTS] == [200] * public_events._IP_RATE_LIMIT_MAX_REQUESTS
    assert all(s == 429 for s in statuses[public_events._IP_RATE_LIMIT_MAX_REQUESTS:])
