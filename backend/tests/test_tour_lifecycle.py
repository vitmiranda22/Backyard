"""
Tests for the tour completion flow: save-block, end-tour, publish-tour.
This is where a tour's data becomes permanent — a regression here doesn't
just misbehave, it can silently drop or corrupt a real user's completed
tour (lost path points, a bogus R2 key accepted, a publish that silently
no-ops). No prior coverage existed for any of these three endpoints.
"""

from app.services import supabase_db, r2, osrm_service

OWNER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
OTHER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
TOUR_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"

LAT, LNG = 37.7749, -122.4194
MOOD = "time_machine"
VOICE = "neutral"


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


def _own_tour(**overrides):
    tour = {"id": TOUR_ID, "creator_id": OWNER_ID, "mood": MOOD, "content_safety_on": False}
    tour.update(overrides)
    return tour


def _save_block_body(**overrides):
    body = {
        "tour_id": TOUR_ID,
        "sequence": 1,
        "lat": LAT,
        "lng": LNG,
        "street_name": "Main St",
        "narration_text": "Some narration text.",
        "mood": MOOD,
        "voice": VOICE,
    }
    body.update(overrides)
    return body


# --- save-block ---

def test_save_block_rejects_non_owner(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    auth_as(app, OTHER_ID)

    resp = client.post("/api/save-block", json=_save_block_body())

    assert resp.status_code == 403


def test_save_block_404s_on_missing_tour(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(None))
    auth_as(app, OWNER_ID)

    resp = client.post("/api/save-block", json=_save_block_body())

    assert resp.status_code == 404


def test_save_block_accepts_a_genuinely_backyard_issued_key(app, client, auth_as, monkeypatch):
    """A client-supplied audio_r2_key that matches what narrate-block would
    have generated for this exact zone/mood/voice must be kept, not dropped."""
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    captured = {}

    async def _fake_save(**kwargs):
        captured.update(kwargs)
        return {"id": "block-1"}
    monkeypatch.setattr(supabase_db, "save_tour_block", _fake_save)
    auth_as(app, OWNER_ID)

    import geohash2
    geo_hash = geohash2.encode(LAT, LNG, precision=7)
    real_key = r2.build_r2_key(geo_hash, MOOD, False, VOICE)

    resp = client.post("/api/save-block", json=_save_block_body(audio_r2_key=real_key))

    assert resp.status_code == 200
    assert captured["audio_r2_key"] == real_key


def test_save_block_drops_a_forged_audio_key(app, client, auth_as, monkeypatch):
    """The actual regression this endpoint exists to prevent: an
    attacker-supplied (or simply stale/mismatched) R2 key must be silently
    dropped, not trusted and stored."""
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    captured = {}

    async def _fake_save(**kwargs):
        captured.update(kwargs)
        return {"id": "block-1"}
    monkeypatch.setattr(supabase_db, "save_tour_block", _fake_save)
    auth_as(app, OWNER_ID)

    resp = client.post("/api/save-block", json=_save_block_body(audio_r2_key="audio/someone-elses-zone/evil.mp3"))

    assert resp.status_code == 200
    assert captured["audio_r2_key"] is None


def test_save_block_500s_cleanly_when_persistence_fails(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    monkeypatch.setattr(supabase_db, "save_tour_block", _async(None))
    auth_as(app, OWNER_ID)

    resp = client.post("/api/save-block", json=_save_block_body())

    assert resp.status_code == 500


# --- end-tour ---

def test_end_tour_rejects_non_owner(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    auth_as(app, OTHER_ID)

    resp = client.post("/api/end-tour", json={"tour_id": TOUR_ID})

    assert resp.status_code == 403


def test_end_tour_snaps_path_and_uses_first_point_as_center(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    monkeypatch.setattr(supabase_db, "get_tour_blocks", _async([
        {"city": "San Francisco", "lat": LAT, "lng": LNG, "neighborhood": "Mission"},
    ]))

    snapped = [{"lat": LAT, "lng": LNG}, {"lat": LAT + 0.001, "lng": LNG + 0.001}]

    async def _fake_snap(raw_points):
        return snapped
    monkeypatch.setattr(osrm_service, "snap_path_to_roads", _fake_snap)

    captured = {}

    async def _fake_end(**kwargs):
        captured.update(kwargs)
        return {"id": TOUR_ID}
    monkeypatch.setattr(supabase_db, "end_tour", _fake_end)
    auth_as(app, OWNER_ID)

    raw_path = [{"lat": 37.70, "lng": -122.40}, {"lat": 37.71, "lng": -122.41}]
    resp = client.post("/api/end-tour", json={"tour_id": TOUR_ID, "path": raw_path})

    assert resp.status_code == 200
    # The map pin uses the first RAW GPS sample, not a block or the
    # snapped trace — a looping/zigzagging route's centroid could land
    # nowhere near the actual starting point.
    assert captured["center_lat"] == 37.70
    assert captured["center_lng"] == -122.40
    assert captured["path_points"] == snapped
    assert captured["location"] == "SRID=4326;POINT(-122.4 37.7)"


def test_end_tour_falls_back_to_first_block_when_no_path_sent(app, client, auth_as, monkeypatch):
    """Older clients (or a tour with no GPS trace) must still get a
    sensible map pin from the first block instead of crashing or leaving
    it null."""
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    monkeypatch.setattr(supabase_db, "get_tour_blocks", _async([
        {"city": "Oakland", "lat": 37.80, "lng": -122.27, "neighborhood": "Uptown"},
    ]))
    captured = {}

    async def _fake_end(**kwargs):
        captured.update(kwargs)
        return {"id": TOUR_ID}
    monkeypatch.setattr(supabase_db, "end_tour", _fake_end)
    auth_as(app, OWNER_ID)

    resp = client.post("/api/end-tour", json={"tour_id": TOUR_ID})

    assert resp.status_code == 200
    assert captured["center_lat"] == 37.80
    assert captured["center_lng"] == -122.27
    assert captured["city"] == "Oakland"
    assert captured["path_points"] is None


def test_end_tour_500s_cleanly_when_persistence_fails(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    monkeypatch.setattr(supabase_db, "get_tour_blocks", _async([]))
    monkeypatch.setattr(supabase_db, "end_tour", _async(None))
    auth_as(app, OWNER_ID)

    resp = client.post("/api/end-tour", json={"tour_id": TOUR_ID})

    assert resp.status_code == 500


# --- publish-tour ---

def test_publish_tour_rejects_non_owner(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    auth_as(app, OTHER_ID)

    resp = client.post("/api/publish-tour", json={"tour_id": TOUR_ID, "is_public": True})

    assert resp.status_code == 403


def test_publish_tour_flips_visibility(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    monkeypatch.setattr(supabase_db, "publish_tour", _async({"is_public": True, "title": "My Route"}))
    auth_as(app, OWNER_ID)

    resp = client.post("/api/publish-tour", json={"tour_id": TOUR_ID, "is_public": True})

    assert resp.status_code == 200
    assert resp.json()["is_public"] is True


def test_publish_tour_500s_cleanly_when_persistence_fails(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    monkeypatch.setattr(supabase_db, "publish_tour", _async(None))
    auth_as(app, OWNER_ID)

    resp = client.post("/api/publish-tour", json={"tour_id": TOUR_ID, "is_public": False})

    assert resp.status_code == 500
