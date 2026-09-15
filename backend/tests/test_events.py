"""
Tests for the Backyard Events feature's browsing endpoints
(GET /events/nearby, GET /events/{id}) and the compute_event_phase()
helper that labels an event as upcoming/happening/ended. The
narrate-block-time behavior (premium fallback, cache bypass, prompt
injection) is covered in test_narrate_block.py instead, since it's a
branch inside that endpoint, not this router.
"""

import datetime

from app.services import supabase_db
from app.services.events import compute_event_phase

USER_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd"

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
    "source_url": "https://example.com/festival",
    "distance_m": 42.5,
}


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


def test_nearby_events_happy_path(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_nearby_events", _async([RAW_EVENT_ROW]))
    auth_as(app, USER_ID)

    resp = client.get("/api/events/nearby", params={"lat": 37.7749, "lng": -122.4194, "radius_m": 1000})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["name"] == "Sunset Street Festival"
    assert body[0]["description"] == "Live music and food stalls."
    assert body[0]["phase"] == "happening"
    assert body[0]["distance_m"] == 42.5


def test_nearby_events_empty_result(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_nearby_events", _async([]))
    auth_as(app, USER_ID)

    resp = client.get("/api/events/nearby", params={"lat": 37.7749, "lng": -122.4194})

    assert resp.status_code == 200
    assert resp.json() == []


def test_event_detail_happy_path(app, client, auth_as, monkeypatch):
    detail_row = {**RAW_EVENT_ROW, "description": "Live music and food stalls.", "source": "predicthq"}
    del detail_row["distance_m"]
    monkeypatch.setattr(supabase_db, "get_event", _async(detail_row))
    auth_as(app, USER_ID)

    resp = client.get(f"/api/events/{RAW_EVENT_ROW['id']}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Sunset Street Festival"
    assert body["description"] == "Live music and food stalls."
    assert body["source"] == "predicthq"
    assert body["distance_m"] is None  # no caller location on the detail endpoint


def test_event_detail_404_when_missing(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_event", _async(None))
    auth_as(app, USER_ID)

    resp = client.get("/api/events/does-not-exist")

    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "event_not_found"


def _event(start_offset_hours: float, end_offset_hours: float) -> dict:
    now = datetime.datetime.now(datetime.timezone.utc)
    return {
        "start_time": (now + datetime.timedelta(hours=start_offset_hours)).isoformat(),
        "end_time": (now + datetime.timedelta(hours=end_offset_hours)).isoformat(),
    }


def test_compute_event_phase_upcoming():
    assert compute_event_phase(_event(start_offset_hours=1, end_offset_hours=3)) == "upcoming"


def test_compute_event_phase_happening():
    assert compute_event_phase(_event(start_offset_hours=-1, end_offset_hours=1)) == "happening"


def test_compute_event_phase_ended():
    assert compute_event_phase(_event(start_offset_hours=-3, end_offset_hours=-1)) == "ended"
