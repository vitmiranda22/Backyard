"""
Tests for the tour completion flow: save-block, end-tour, publish-tour.
This is where a tour's data becomes permanent — a regression here doesn't
just misbehave, it can silently drop or corrupt a real user's completed
tour (lost path points, a bogus R2 key accepted, a publish that silently
no-ops). No prior coverage existed for any of these three endpoints.
"""

from app.services import supabase_db, r2, osrm_service, tts

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


def test_save_block_accepts_a_genuinely_backyard_issued_image_key(app, client, auth_as, monkeypatch):
    """Regression test: image_r2_key is keyed at PHOTO_GEOHASH_PRECISION (8,
    ~19m), finer than audio's GEOHASH_PRECISION (7, ~153m) -- see narrate.py's
    _resolve_zone_photo. _expected_r2_keys previously validated the image key
    against the coarse precision instead, so every real image_r2_key a client
    ever sent back failed this check and was silently dropped."""
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    captured = {}

    async def _fake_save(**kwargs):
        captured.update(kwargs)
        return {"id": "block-1"}
    monkeypatch.setattr(supabase_db, "save_tour_block", _fake_save)
    auth_as(app, OWNER_ID)

    import geohash2
    photo_geo_hash = geohash2.encode(LAT, LNG, precision=8)
    real_image_key = r2.build_image_r2_key(photo_geo_hash)

    resp = client.post("/api/save-block", json=_save_block_body(image_r2_key=real_image_key))

    assert resp.status_code == 200
    assert captured["image_r2_key"] == real_image_key


def test_save_block_drops_an_image_key_built_from_the_coarse_audio_precision(app, client, auth_as, monkeypatch):
    """The exact shape of the fixed bug: a key that LOOKS plausible (it's a
    real geohash, just the wrong one) must still be rejected, not silently
    accepted because it happens to match some other valid zone."""
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    captured = {}

    async def _fake_save(**kwargs):
        captured.update(kwargs)
        return {"id": "block-1"}
    monkeypatch.setattr(supabase_db, "save_tour_block", _fake_save)
    auth_as(app, OWNER_ID)

    import geohash2
    coarse_geo_hash = geohash2.encode(LAT, LNG, precision=7)
    wrong_precision_key = r2.build_image_r2_key(coarse_geo_hash)

    resp = client.post("/api/save-block", json=_save_block_body(image_r2_key=wrong_precision_key))

    assert resp.status_code == 200
    assert captured["image_r2_key"] is None


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


# --- save-note ---

def test_save_note_rejects_non_owner(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    auth_as(app, OTHER_ID)

    resp = client.post(f"/api/tours/{TOUR_ID}/notes", json={"sequence": 1, "note_text": "hi"})

    assert resp.status_code == 403


def test_save_note_404s_on_missing_tour(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(None))
    auth_as(app, OWNER_ID)

    resp = client.post(f"/api/tours/{TOUR_ID}/notes", json={"sequence": 1, "note_text": "hi"})

    assert resp.status_code == 404


def test_save_note_persists_sequence_and_text(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    captured = {}

    async def _fake_upsert(tour_id, sequence, user_id, note_text):
        captured.update(tour_id=tour_id, sequence=sequence, user_id=user_id, note_text=note_text)
        return {"id": "note-1"}
    monkeypatch.setattr(supabase_db, "upsert_tour_block_note", _fake_upsert)
    auth_as(app, OWNER_ID)

    resp = client.post(f"/api/tours/{TOUR_ID}/notes", json={"sequence": 2, "note_text": "the old theater used to be here"})

    assert resp.status_code == 200
    assert resp.json() == {"sequence": 2, "note_text": "the old theater used to be here"}
    assert captured == {
        "tour_id": TOUR_ID,
        "sequence": 2,
        "user_id": OWNER_ID,
        "note_text": "the old theater used to be here",
    }


def test_save_note_500s_cleanly_when_persistence_fails(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    monkeypatch.setattr(supabase_db, "upsert_tour_block_note", _async(None))
    auth_as(app, OWNER_ID)

    resp = client.post(f"/api/tours/{TOUR_ID}/notes", json={"sequence": 1, "note_text": "hi"})

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


def test_end_tour_generates_outro_using_last_blocks_voice(app, client, auth_as, monkeypatch):
    """The outro's voice comes from tour_blocks, not the tour row --
    tours.voice is accepted by create_tour but never actually persisted
    (a pre-existing gap), so the last narrated block is the only real
    source of truth for which voice this tour has used."""
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour(mood="dark_side")))
    monkeypatch.setattr(supabase_db, "get_tour_blocks", _async([
        {"city": "San Francisco", "lat": LAT, "lng": LNG, "neighborhood": "Mission", "voice": "dramatic"},
        {"city": "San Francisco", "lat": LAT, "lng": LNG, "neighborhood": "Mission", "voice": "dramatic"},
    ]))
    monkeypatch.setattr(supabase_db, "end_tour", _async({"id": TOUR_ID}))
    monkeypatch.setattr(supabase_db, "get_user_premium_status", _async(True))

    captured = {}

    async def _fake_synthesize(text, voice, is_premium):
        captured["text"] = text
        captured["voice"] = voice
        captured["is_premium"] = is_premium
        return b"fake-mp3-bytes"
    monkeypatch.setattr(tts, "synthesize_speech", _fake_synthesize)
    monkeypatch.setattr(r2, "upload_audio", _async(True))
    monkeypatch.setattr(r2, "generate_signed_url", lambda key: f"https://example.com/{key}")
    auth_as(app, OWNER_ID)

    resp = client.post("/api/end-tour", json={"tour_id": TOUR_ID})

    assert resp.status_code == 200
    body = resp.json()
    assert body["outro_audio_url"] == f"https://example.com/guide-outros/{TOUR_ID}.mp3"
    assert captured["voice"] == "dramatic"
    assert captured["is_premium"] is True
    assert "2" in captured["text"]  # references the real block count


def test_end_tour_omits_outro_when_no_blocks_visited(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    monkeypatch.setattr(supabase_db, "get_tour_blocks", _async([]))
    monkeypatch.setattr(supabase_db, "end_tour", _async({"id": TOUR_ID}))
    monkeypatch.setattr(supabase_db, "get_user_premium_status", _async(False))

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("TTS should not run for a zero-block tour")
    monkeypatch.setattr(tts, "synthesize_speech", _fail_if_called)
    auth_as(app, OWNER_ID)

    resp = client.post("/api/end-tour", json={"tour_id": TOUR_ID})

    assert resp.status_code == 200
    assert resp.json()["outro_audio_url"] is None


# --- publish-tour ---

def test_publish_tour_rejects_non_owner(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    auth_as(app, OTHER_ID)

    resp = client.post("/api/publish-tour", json={"tour_id": TOUR_ID, "is_public": True})

    assert resp.status_code == 403


def test_publish_tour_flips_visibility(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    monkeypatch.setattr(supabase_db, "get_tour_blocks", _async([{"id": "b1"}]))
    monkeypatch.setattr(supabase_db, "publish_tour", _async({"is_public": True, "title": "My Route"}))
    auth_as(app, OWNER_ID)

    resp = client.post("/api/publish-tour", json={"tour_id": TOUR_ID, "is_public": True})

    assert resp.status_code == 200
    assert resp.json()["is_public"] is True


def test_publish_tour_500s_cleanly_when_persistence_fails(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    monkeypatch.setattr(supabase_db, "get_tour_blocks", _async([{"id": "b1"}]))
    monkeypatch.setattr(supabase_db, "publish_tour", _async(None))
    auth_as(app, OWNER_ID)

    resp = client.post("/api/publish-tour", json={"tour_id": TOUR_ID, "is_public": False})

    assert resp.status_code == 500


def test_publish_tour_rejects_when_no_blocks_were_narrated(app, client, auth_as, monkeypatch):
    # Regression guard: a tour ended seconds after it started (0 narrated
    # blocks) has nothing real to save or share -- Save shouldn't silently
    # succeed and leave an empty "tour" in someone's history/journal.
    monkeypatch.setattr(supabase_db, "get_tour", _async(_own_tour()))
    monkeypatch.setattr(supabase_db, "get_tour_blocks", _async([]))
    auth_as(app, OWNER_ID)

    resp = client.post("/api/publish-tour", json={"tour_id": TOUR_ID, "is_public": True})

    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "empty_tour"


# --- get-tour-detail (notes visibility) ---

def _tour_with_creator(**overrides):
    tour = {
        "id": TOUR_ID,
        "creator_id": OWNER_ID,
        "is_public": True,
        "is_hidden": False,
        "title": "A Walk",
        "mood": MOOD,
        "tour_type": "walking",
        "city": "San Francisco",
        "avg_rating": 0,
        "rating_count": 0,
        "blocks_visited": 1,
        "total_distance_m": None,
        "duration_sec": None,
        "is_anonymous": False,
        "users": {"display_name": "Explorer"},
        "created_at": "2026-10-05T00:00:00+00:00",
        "path_points": [],
    }
    tour.update(overrides)
    return tour


_ONE_BLOCK = [{
    "id": "block-1", "sequence": 1, "street_name": "Main St", "neighborhood": "",
    "lat": LAT, "lng": LNG, "narration_text": "Some narration.", "voice": VOICE, "mood": MOOD,
}]


def test_get_tour_detail_includes_the_owners_own_note(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour_with_creator", _async(_tour_with_creator()))
    monkeypatch.setattr(supabase_db, "get_tour_blocks", _async(_ONE_BLOCK))
    monkeypatch.setattr(supabase_db, "get_tour_block_notes", _async({1: "the old theater used to be here"}))
    monkeypatch.setattr(supabase_db, "get_like_status", _async((0, False)))
    auth_as(app, OWNER_ID)

    resp = client.get(f"/api/tours/{TOUR_ID}")

    assert resp.status_code == 200
    assert resp.json()["blocks"][0]["note_text"] == "the old theater used to be here"


def test_get_tour_detail_never_shows_notes_to_a_non_owner_viewing_a_public_tour(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour_with_creator", _async(_tour_with_creator(is_public=True)))
    monkeypatch.setattr(supabase_db, "get_tour_blocks", _async(_ONE_BLOCK))
    # If the endpoint ever queried notes for a non-owner, this would be
    # the first sign -- the real get_tour_block_notes is never called at
    # all for a non-owner, but asserting the response stays None either
    # way pins the actual contract that matters.
    monkeypatch.setattr(supabase_db, "get_tour_block_notes", _async({1: "should never leak"}))
    monkeypatch.setattr(supabase_db, "get_like_status", _async((0, False)))
    auth_as(app, OTHER_ID)

    resp = client.get(f"/api/tours/{TOUR_ID}")

    assert resp.status_code == 200
    assert resp.json()["blocks"][0]["note_text"] is None
