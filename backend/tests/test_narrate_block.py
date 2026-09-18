"""
Tests for POST /narrate-block, the core endpoint of the app. Covers the
meaningful decision branches (not every internal combination): rate
limiting, premium gating, the two-layer cache (zone data + narration),
cross-block tour continuity (including the IDOR guard on a foreign
tour_id — the security-sensitive branch), and graceful TTS failure. Every
external service (Supabase, OpenAI, Google TTS, R2, Nominatim, Street
View, the 26 zone-data sources) is mocked; nothing here makes a real
network call.
"""

import time

import pytest
from app.api import narrate
from app.config import UNLIMITED_TEST_ACCOUNT_IDS
from app.services import supabase_db, geocode, openai_service, tts, r2
from app.services.geocode import GeocodingResult

USER_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd"
OWNER_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
TOUR_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff"

GEO_RESULT = GeocodingResult(street="Main St", neighborhood="Downtown", city="San Francisco", country="US")


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


@pytest.fixture(autouse=True)
def _baseline_mocks(monkeypatch):
    """
    Every test starts from a fully-mocked, happy-path baseline (free user,
    cache miss, no tour, TTS/upload succeed) — individual tests override
    just the piece they're exercising, which keeps each test focused on
    one branch instead of re-declaring the whole pipeline every time.
    """
    monkeypatch.setattr(supabase_db, "get_user_premium_status", _async(False))
    monkeypatch.setattr(supabase_db, "is_user_underage", _async(False))
    monkeypatch.setattr(supabase_db, "check_rate_limit", _async((True, "")))
    monkeypatch.setattr(supabase_db, "get_cached_zone_data", _async(None))
    monkeypatch.setattr(supabase_db, "get_cached_narration", _async((None, 0)))
    monkeypatch.setattr(supabase_db, "store_zone_data", _async(True))
    monkeypatch.setattr(supabase_db, "store_narration", _async({"id": "narration-1"}))
    monkeypatch.setattr(supabase_db, "get_cached_audio", _async(None))
    monkeypatch.setattr(supabase_db, "store_audio_file", _async(True))
    monkeypatch.setattr(supabase_db, "get_cached_zone_photo", _async(None))
    monkeypatch.setattr(supabase_db, "store_zone_photo", _async(True))

    monkeypatch.setattr(geocode, "reverse_geocode", _async(GEO_RESULT))

    async def _fake_fetch_all(**kwargs):
        return {
            "zone_data": {}, "sources_queried": [], "sources_failed": [],
            "sources_skipped": [], "hit_count": 0, "total": 0,
        }
    monkeypatch.setattr(narrate, "fetch_all_zone_data", _fake_fetch_all)

    monkeypatch.setattr(openai_service, "generate_narration", _async("Generated narration text."))

    monkeypatch.setattr(tts, "synthesize_speech", _async(b"fake-mp3-bytes"))
    monkeypatch.setattr(tts, "estimate_duration_ms", lambda text, voice: 5000)
    monkeypatch.setattr(r2, "upload_audio", _async(True))
    monkeypatch.setattr(r2, "generate_signed_url", lambda key, expires_in=3600: f"https://signed/{key}")

    # No cached zone photo (get_cached_zone_photo above) and Street View
    # comes up empty — the photo task then resolves to (None, None)
    # without a real HTTP call.
    from app.services import streetview
    monkeypatch.setattr(streetview, "fetch_street_view_image", _async(None))


def _request_body(**overrides):
    body = {"lat": 37.7749, "lng": -122.4194, "mood": "time_machine", "voice": "neutral"}
    body.update(overrides)
    return body


def test_rate_limited_returns_429(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "check_rate_limit", _async((False, "daily_limit_exceeded")))
    auth_as(app, USER_ID)

    resp = client.post("/api/narrate-block", json=_request_body())

    assert resp.status_code == 429
    assert resp.json()["detail"]["code"] == "daily_limit_exceeded"


def test_premium_mood_rejected_for_free_user(app, client, auth_as):
    auth_as(app, USER_ID)  # baseline mocks: get_user_premium_status -> False

    resp = client.post("/api/narrate-block", json=_request_body(mood="dark_side"))

    assert resp.status_code == 403
    assert resp.json()["detail"]["code"] == "premium_required"


def test_premium_voice_rejected_for_free_user(app, client, auth_as):
    auth_as(app, USER_ID)

    resp = client.post("/api/narrate-block", json=_request_body(voice="dramatic"))

    assert resp.status_code == 403


def test_premium_user_can_use_premium_mood(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_user_premium_status", _async(True))
    auth_as(app, USER_ID)

    resp = client.post("/api/narrate-block", json=_request_body(mood="dark_side"))

    assert resp.status_code == 200


def test_narration_cache_hit_skips_generation_entirely(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_cached_narration", _async(({"id": "cached-1", "narration_text": "Cached text."}, 4)))

    generation_called = []
    async def _track(**kwargs):
        generation_called.append(True)
        return "should not be used"
    monkeypatch.setattr(openai_service, "generate_narration", _track)

    fetch_called = []
    async def _track_fetch(**kwargs):
        fetch_called.append(True)
        return {"zone_data": {}, "sources_queried": [], "sources_failed": [], "sources_skipped": [], "hit_count": 0, "total": 0}
    monkeypatch.setattr(narrate, "fetch_all_zone_data", _track_fetch)

    auth_as(app, USER_ID)
    resp = client.post("/api/narrate-block", json=_request_body())

    assert resp.status_code == 200
    assert resp.json()["narration_text"] == "Cached text."
    assert generation_called == []
    assert fetch_called == []


def test_narration_cache_miss_fetches_zone_data_and_generates(app, client, auth_as, monkeypatch):
    fetch_called = []
    async def _track_fetch(**kwargs):
        fetch_called.append(kwargs)
        return {"zone_data": {}, "sources_queried": ["wikipedia"], "sources_failed": [], "sources_skipped": [], "hit_count": 1, "total": 1}
    monkeypatch.setattr(narrate, "fetch_all_zone_data", _track_fetch)

    auth_as(app, USER_ID)
    resp = client.post("/api/narrate-block", json=_request_body())

    assert resp.status_code == 200
    assert len(fetch_called) == 1
    assert resp.json()["narration_text"] == "Generated narration text."


def test_generation_failure_returns_408(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(openai_service, "generate_narration", _async(None))
    auth_as(app, USER_ID)

    resp = client.post("/api/narrate-block", json=_request_body())

    assert resp.status_code == 408
    assert resp.json()["detail"]["code"] == "generation_failed"


def test_foreign_tour_id_is_ignored_not_stitched(app, client, auth_as, monkeypatch):
    """
    The IDOR guard: a tour_id belonging to a DIFFERENT user must be
    treated as if no tour_id were sent at all — narration still succeeds,
    and the background connector job (see _generate_connector_in_background)
    never reads or writes anything from that tour. Without this check, any
    authenticated user could pass another user's tour_id to read fragments
    of their narrative back in the connector text.
    """
    narrate._pending_transitions.clear()
    monkeypatch.setattr(supabase_db, "get_tour", _async({"id": TOUR_ID, "creator_id": OWNER_ID, "narrative_summary": "Secret prior story."}))

    connector_called = []
    async def _track_connector(**kwargs):
        connector_called.append(kwargs)
        return "connector", "summary", []
    monkeypatch.setattr(openai_service, "generate_connector", _track_connector)

    update_called = []
    async def _track_update(*args, **kwargs):
        update_called.append((args, kwargs))
        return True
    monkeypatch.setattr(supabase_db, "update_tour_narrative_summary", _track_update)

    auth_as(app, USER_ID)  # NOT the tour's owner
    resp = client.post("/api/narrate-block", json=_request_body(tour_id=TOUR_ID))

    assert resp.status_code == 200
    assert connector_called == []
    assert update_called == []
    assert resp.json()["narration_text"] == "Generated narration text."  # no connector prefix
    assert narrate._pending_transitions == {}


def test_narrate_block_never_waits_on_the_connector(app, client, auth_as, monkeypatch):
    """
    The core behavior change of this endpoint: narration_text always comes
    back exactly as generated, regardless of what generate_connector does or
    returns — connector generation is scheduled as a background task (see
    _generate_connector_in_background), never stitched into THIS response.
    """
    monkeypatch.setattr(supabase_db, "get_tour", _async({
        "id": TOUR_ID, "creator_id": USER_ID,
        "narrative_summary": "Prior story so far.",
        "used_connector_openers": [], "last_connector_transition": None,
    }))
    monkeypatch.setattr(openai_service, "generate_connector", _async(("Meanwhile,", "Updated summary.", ["meanwhile"])))

    auth_as(app, USER_ID)
    resp = client.post("/api/narrate-block", json=_request_body(tour_id=TOUR_ID))

    assert resp.status_code == 200
    assert resp.json()["narration_text"] == "Generated narration text."  # never stitched


def test_own_tour_with_prior_summary_generates_connector_in_background(app, client, auth_as, monkeypatch):
    """
    TestClient runs BackgroundTasks synchronously before returning, so this
    can assert on _generate_connector_in_background's effects directly:
    generate_connector gets called, the tour's summary is persisted, and the
    resulting transition text lands in _pending_transitions for the poll
    endpoint to pick up — all without touching the response itself.
    """
    narrate._pending_transitions.clear()
    monkeypatch.setattr(supabase_db, "get_tour", _async({
        "id": TOUR_ID, "creator_id": USER_ID,
        "narrative_summary": "Prior story so far.",
        "used_connector_openers": [], "last_connector_transition": None,
    }))
    monkeypatch.setattr(openai_service, "generate_connector", _async(("Meanwhile,", "Updated summary.", ["meanwhile"])))

    update_called = []
    async def _track_update(tour_id, summary, **kwargs):
        update_called.append((tour_id, summary, kwargs))
        return True
    monkeypatch.setattr(supabase_db, "update_tour_narrative_summary", _track_update)

    auth_as(app, USER_ID)
    resp = client.post("/api/narrate-block", json=_request_body(lat=37.7749, lng=-122.4194, tour_id=TOUR_ID))
    import geohash2
    expected_hash = geohash2.encode(37.7749, -122.4194, precision=7)

    assert resp.status_code == 200
    assert len(update_called) == 1
    assert update_called[0][0] == TOUR_ID
    assert update_called[0][1] == "Updated summary."
    stored = narrate._pending_transitions[f"{TOUR_ID}:{expected_hash}"]
    assert stored["transition_text"] == "Meanwhile,"
    assert stored["closing_text"] is None
    assert "stored_at" in stored


def test_final_block_also_generates_a_closing_beat_alongside_the_connector(app, client, auth_as, monkeypatch):
    """
    is_final_block signals the client expects this request's sequence to
    hit the tour's block cap -- the one ending path knowable in advance.
    Both the normal connector (transition INTO this block) and a new
    closing beat (resolving the whole walk, appended AFTER this block's
    narration) should be generated from the same background task.
    """
    narrate._pending_transitions.clear()
    monkeypatch.setattr(supabase_db, "get_tour", _async({
        "id": TOUR_ID, "creator_id": USER_ID,
        "narrative_summary": "Prior story so far.",
        "used_connector_openers": [], "last_connector_transition": None,
    }))
    monkeypatch.setattr(openai_service, "generate_connector", _async(("Meanwhile,", "Updated summary.", ["meanwhile"])))

    closing_calls = []
    async def _track_closing(**kwargs):
        closing_calls.append(kwargs)
        return "And that's the whole walk, right there."
    monkeypatch.setattr(openai_service, "generate_closing_beat", _track_closing)

    auth_as(app, USER_ID)
    resp = client.post("/api/narrate-block", json=_request_body(
        lat=37.7749, lng=-122.4194, tour_id=TOUR_ID, is_final_block=True,
    ))
    import geohash2
    expected_hash = geohash2.encode(37.7749, -122.4194, precision=7)

    assert resp.status_code == 200
    assert len(closing_calls) == 1
    assert closing_calls[0]["prior_summary"] == "Prior story so far."
    assert closing_calls[0]["current_narration"] == "Generated narration text."
    stored = narrate._pending_transitions[f"{TOUR_ID}:{expected_hash}"]
    assert stored["transition_text"] == "Meanwhile,"
    assert stored["closing_text"] == "And that's the whole walk, right there."


def test_non_final_block_never_generates_a_closing_beat(app, client, auth_as, monkeypatch):
    narrate._pending_transitions.clear()
    monkeypatch.setattr(supabase_db, "get_tour", _async({
        "id": TOUR_ID, "creator_id": USER_ID,
        "narrative_summary": "Prior story so far.",
        "used_connector_openers": [], "last_connector_transition": None,
    }))
    monkeypatch.setattr(openai_service, "generate_connector", _async(("Meanwhile,", "Updated summary.", ["meanwhile"])))

    closing_calls = []
    async def _track_closing(**kwargs):
        closing_calls.append(kwargs)
        return "should not be called"
    monkeypatch.setattr(openai_service, "generate_closing_beat", _track_closing)

    auth_as(app, USER_ID)
    resp = client.post("/api/narrate-block", json=_request_body(tour_id=TOUR_ID, is_final_block=False))

    assert resp.status_code == 200
    assert closing_calls == []


@pytest.mark.asyncio
async def test_concurrent_background_tasks_for_the_same_tour_dont_clobber_each_others_write(monkeypatch):
    """
    Regression test for a real race: two blocks triggered close together
    for the SAME tour (a brisk walking pace, or a manual "Tell me about
    here" landing right after an auto-trigger) each schedule their own
    _generate_connector_in_background call. Before the per-tour lock, both
    could read the tour row before either wrote back, and whichever
    finished last would silently overwrite the other's
    used_connector_openers/last_connector_transition update.

    Simulates this directly (bypassing the HTTP layer) by running two
    calls concurrently against a shared mutable "DB" dict, with
    generate_connector for the FIRST call deliberately delayed so it would
    still be in flight when the second call's own read happens -- exactly
    the overlap window the lock exists to close.
    """
    import asyncio

    narrate._tour_locks.clear()
    tour_state = {
        "creator_id": USER_ID,
        "narrative_summary": "Start of the story.",
        "used_connector_openers": [],
        "last_connector_transition": None,
    }

    async def _fake_get_tour(tour_id):
        return dict(tour_state)  # a fresh snapshot each read, like a real DB row

    async def _fake_update(tour_id, summary, used_connector_openers=None, last_connector_transition=None):
        tour_state["narrative_summary"] = summary
        tour_state["used_connector_openers"] = used_connector_openers
        tour_state["last_connector_transition"] = last_connector_transition
        return True

    call_order = []

    async def _fake_generate_connector(prior_summary, mood, current_narration, used_openers, last_transition):
        call_order.append(list(used_openers))
        if current_narration == "First block text.":
            # Long enough that, without the lock, the second call's own
            # get_tour would race ahead and read the pre-write state.
            await asyncio.sleep(0.05)
            return "First transition.", "Summary after first.", used_openers + ["first"]
        return "Second transition.", "Summary after second.", used_openers + ["second"]

    monkeypatch.setattr(supabase_db, "get_tour", _fake_get_tour)
    monkeypatch.setattr(supabase_db, "update_tour_narrative_summary", _fake_update)
    monkeypatch.setattr(openai_service, "generate_connector", _fake_generate_connector)

    await asyncio.gather(
        narrate._generate_connector_in_background(TOUR_ID, "hashA", USER_ID, "time_machine", "First block text."),
        narrate._generate_connector_in_background(TOUR_ID, "hashB", USER_ID, "time_machine", "Second block text."),
    )

    # If truly serialized, the second call only ever starts its own read
    # AFTER the first call's write has landed -- so it must have seen the
    # first call's contribution already in used_connector_openers, not an
    # empty list from a stale pre-write snapshot.
    assert call_order[0] == []
    assert call_order[1] == ["first"]
    assert tour_state["used_connector_openers"] == ["first", "second"]


def test_own_tour_first_block_seeds_summary_without_connector(app, client, auth_as, monkeypatch):
    narrate._pending_transitions.clear()
    monkeypatch.setattr(supabase_db, "get_tour", _async({
        "id": TOUR_ID, "creator_id": USER_ID,
        "narrative_summary": None, "used_connector_openers": [], "last_connector_transition": None,
    }))
    connector_called = []
    async def _track_connector(**kwargs):
        connector_called.append(True)
        return "should not be called", "x", []
    monkeypatch.setattr(openai_service, "generate_connector", _track_connector)

    update_called = []
    async def _track_update(tour_id, summary, **kwargs):
        update_called.append(summary)
        return True
    monkeypatch.setattr(supabase_db, "update_tour_narrative_summary", _track_update)

    auth_as(app, USER_ID)
    resp = client.post("/api/narrate-block", json=_request_body(tour_id=TOUR_ID))

    assert resp.status_code == 200
    assert connector_called == []
    assert resp.json()["narration_text"] == "Generated narration text."  # unmodified, no connector
    assert update_called == ["Generated narration text."[:200]]
    assert narrate._pending_transitions == {}


# --- GET /narrate-block/transition -------------------------------------------

def test_transition_not_ready_when_nothing_pending(app, client, auth_as, monkeypatch):
    narrate._pending_transitions.clear()
    monkeypatch.setattr(supabase_db, "get_tour", _async({"id": TOUR_ID, "creator_id": USER_ID}))
    auth_as(app, USER_ID)

    resp = client.get("/api/narrate-block/transition", params={"tour_id": TOUR_ID, "geo_hash": "9q8yyk8"})

    assert resp.status_code == 200
    assert resp.json() == {"ready": False, "transition_text": None, "closing_text": None}


def test_transition_ready_and_popped_exactly_once(app, client, auth_as, monkeypatch):
    narrate._pending_transitions.clear()
    narrate._pending_transitions[f"{TOUR_ID}:9q8yyk8"] = {
        "transition_text": "Meanwhile,", "closing_text": None, "stored_at": time.monotonic(),
    }
    monkeypatch.setattr(supabase_db, "get_tour", _async({"id": TOUR_ID, "creator_id": USER_ID}))
    auth_as(app, USER_ID)

    first = client.get("/api/narrate-block/transition", params={"tour_id": TOUR_ID, "geo_hash": "9q8yyk8"})
    second = client.get("/api/narrate-block/transition", params={"tour_id": TOUR_ID, "geo_hash": "9q8yyk8"})

    assert first.json() == {"ready": True, "transition_text": "Meanwhile,", "closing_text": None}
    assert second.json() == {"ready": False, "transition_text": None, "closing_text": None}


def test_transition_expired_entry_is_discarded_not_served(app, client, auth_as, monkeypatch):
    """
    Regression test: a walking route that loops or doubles back can revisit
    the exact same geohash cell later in the same tour. Without an expiry,
    a poll for that LATER, unrelated block could pop a stale entry left
    behind by an EARLIER visit -- an entry older than the client's own
    ~10s poll window is either abandoned or dangerously stale, so it must
    never be served, regardless of how it got there.
    """
    narrate._pending_transitions.clear()
    narrate._pending_transitions[f"{TOUR_ID}:9q8yyk8"] = {
        "transition_text": "Stale, from an earlier visit to this exact spot.",
        "closing_text": None,
        "stored_at": time.monotonic() - (narrate._TRANSITION_TTL_SEC + 1),
    }
    monkeypatch.setattr(supabase_db, "get_tour", _async({"id": TOUR_ID, "creator_id": USER_ID}))
    auth_as(app, USER_ID)

    resp = client.get("/api/narrate-block/transition", params={"tour_id": TOUR_ID, "geo_hash": "9q8yyk8"})

    assert resp.json() == {"ready": False, "transition_text": None, "closing_text": None}
    # Also popped (not left behind) -- an expired entry is just as dead
    # once observed as one that was never there in the first place.
    assert f"{TOUR_ID}:9q8yyk8" not in narrate._pending_transitions


def test_transition_ready_with_a_closing_beat_for_a_final_block(app, client, auth_as, monkeypatch):
    narrate._pending_transitions.clear()
    narrate._pending_transitions[f"{TOUR_ID}:9q8yyk8"] = {
        "transition_text": "Meanwhile,",
        "closing_text": "And that's the whole walk, right there.",
        "stored_at": time.monotonic(),
    }
    monkeypatch.setattr(supabase_db, "get_tour", _async({"id": TOUR_ID, "creator_id": USER_ID}))
    auth_as(app, USER_ID)

    resp = client.get("/api/narrate-block/transition", params={"tour_id": TOUR_ID, "geo_hash": "9q8yyk8"})

    assert resp.json() == {
        "ready": True,
        "transition_text": "Meanwhile,",
        "closing_text": "And that's the whole walk, right there.",
    }


def test_transition_poll_for_a_foreign_tour_never_reveals_it(app, client, auth_as, monkeypatch):
    """
    Same IDOR guard as narration itself: a tour_id belonging to another user
    must never leak that user's pending transition text, even if one exists.
    """
    narrate._pending_transitions.clear()
    narrate._pending_transitions[f"{TOUR_ID}:9q8yyk8"] = {
        "transition_text": "Someone else's transition.",
        "closing_text": None,
        "stored_at": time.monotonic(),
    }
    monkeypatch.setattr(supabase_db, "get_tour", _async({"id": TOUR_ID, "creator_id": OWNER_ID}))
    auth_as(app, USER_ID)  # NOT the tour's owner

    resp = client.get("/api/narrate-block/transition", params={"tour_id": TOUR_ID, "geo_hash": "9q8yyk8"})

    assert resp.status_code == 200
    assert resp.json() == {"ready": False, "transition_text": None, "closing_text": None}
    # Still there -- an unauthorized poll must not pop it out from under the real owner.
    assert narrate._pending_transitions[f"{TOUR_ID}:9q8yyk8"]["transition_text"] == "Someone else's transition."


def test_tts_failure_returns_text_only_response(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(tts, "synthesize_speech", _async(None))
    auth_as(app, USER_ID)

    resp = client.post("/api/narrate-block", json=_request_body())

    assert resp.status_code == 200
    body = resp.json()
    assert body["narration_text"] == "Generated narration text."
    assert body["audio_url"] is None


def test_underage_user_gets_content_safety_forced_on_even_when_requesting_it_off(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "is_user_underage", _async(True))
    captured = {}

    async def _track_generate(**kwargs):
        captured.update(kwargs)
        return "Generated narration text."
    monkeypatch.setattr(openai_service, "generate_narration", _track_generate)

    auth_as(app, USER_ID)
    resp = client.post("/api/narrate-block", json=_request_body(content_safety=False))

    assert resp.status_code == 200
    assert resp.json()["content_safety_applied"] is True
    assert captured["content_safety"] is True


def test_adult_users_content_safety_choice_passes_through_untouched(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "is_user_underage", _async(False))
    captured = {}

    async def _track_generate(**kwargs):
        captured.update(kwargs)
        return "Generated narration text."
    monkeypatch.setattr(openai_service, "generate_narration", _track_generate)

    auth_as(app, USER_ID)
    resp = client.post("/api/narrate-block", json=_request_body(content_safety=False))

    assert resp.status_code == 200
    assert resp.json()["content_safety_applied"] is False
    assert captured["content_safety"] is False


def test_underage_user_who_already_requested_safety_on_is_unaffected(app, client, auth_as, monkeypatch):
    # is_user_underage should never even need to be consulted when the
    # client already asked for safety on -- there's nothing to force.
    checked = []
    async def _track_underage(*args, **kwargs):
        checked.append(True)
        return True
    monkeypatch.setattr(supabase_db, "is_user_underage", _track_underage)

    auth_as(app, USER_ID)
    resp = client.post("/api/narrate-block", json=_request_body(content_safety=True))

    assert resp.status_code == 200
    assert resp.json()["content_safety_applied"] is True
    assert checked == []


def test_allowlisted_test_account_bypasses_the_daily_narration_limit(app, client, auth_as, monkeypatch):
    # check_rate_limit itself is never even consulted for this account --
    # a normal user's daily/minute ceiling doesn't apply to it.
    checked = []
    async def _track_rate_limit(*args, **kwargs):
        checked.append(True)
        return (False, "daily_limit_exceeded")  # would 429 a normal user
    monkeypatch.setattr(supabase_db, "check_rate_limit", _track_rate_limit)

    test_account_id = next(iter(UNLIMITED_TEST_ACCOUNT_IDS))
    auth_as(app, test_account_id)
    resp = client.post("/api/narrate-block", json=_request_body())

    assert resp.status_code == 200
    assert checked == []


def test_ordinary_account_still_gets_rate_limited(app, client, auth_as, monkeypatch):
    # Regression guard on the allowlist itself -- an ordinary user_id
    # (not in UNLIMITED_TEST_ACCOUNT_IDS) must still hit the real check.
    monkeypatch.setattr(supabase_db, "check_rate_limit", _async((False, "daily_limit_exceeded")))
    auth_as(app, USER_ID)

    resp = client.post("/api/narrate-block", json=_request_body())

    assert resp.status_code == 429


# --- GET /narrate-block/quota -------------------------------------------------
# Read-only pre-flight check so the client can warn before the walker ever
# reaches MoodPickerScreen or taps Start Replay, instead of only finding out
# via a 429 mid-flow.

def test_quota_reports_full_daily_limit_for_a_brand_new_user(app, client, auth_as, monkeypatch):
    # baseline mocks: get_user_premium_status -> False (free, limit 5)
    monkeypatch.setattr(supabase_db, "get_daily_narration_usage", _async(None))
    auth_as(app, USER_ID)

    resp = client.get("/api/narrate-block/quota")

    assert resp.status_code == 200
    assert resp.json() == {"remaining": 5, "daily_limit": 5}


def test_quota_subtracts_todays_usage(app, client, auth_as, monkeypatch):
    import datetime
    monkeypatch.setattr(supabase_db, "get_daily_narration_usage", _async({
        "daily_count": 3,
        "daily_window_start": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }))
    auth_as(app, USER_ID)

    resp = client.get("/api/narrate-block/quota")

    assert resp.json() == {"remaining": 2, "daily_limit": 5}


def test_quota_floors_at_zero_when_the_daily_limit_is_fully_spent(app, client, auth_as, monkeypatch):
    import datetime
    monkeypatch.setattr(supabase_db, "get_daily_narration_usage", _async({
        "daily_count": 5,
        "daily_window_start": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }))
    auth_as(app, USER_ID)

    resp = client.get("/api/narrate-block/quota")

    assert resp.json() == {"remaining": 0, "daily_limit": 5}


def test_quota_resets_once_the_24h_window_has_rolled_over(app, client, auth_as, monkeypatch):
    # A stale row from a prior day, never touched since (no request has
    # come in yet to trigger the atomic RPC's own reset) -- this endpoint
    # has to apply the same rolling-window rule itself, or a walker who
    # hasn't narrated anything yet today would see yesterday's spent quota.
    import datetime
    monkeypatch.setattr(supabase_db, "get_daily_narration_usage", _async({
        "daily_count": 5,
        "daily_window_start": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=2)).isoformat(),
    }))
    auth_as(app, USER_ID)

    resp = client.get("/api/narrate-block/quota")

    assert resp.json() == {"remaining": 5, "daily_limit": 5}


def test_quota_uses_the_premium_daily_limit_for_a_premium_user(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_user_premium_status", _async(True))
    monkeypatch.setattr(supabase_db, "get_daily_narration_usage", _async(None))
    auth_as(app, USER_ID)

    resp = client.get("/api/narrate-block/quota")

    assert resp.json() == {"remaining": 36, "daily_limit": 36}


def test_quota_reports_full_for_the_unlimited_test_allowlist(app, client, auth_as, monkeypatch):
    # This account is never actually decremented (see narrate_block's own
    # bypass) -- reporting a full quota is more honest than a sentinel.
    monkeypatch.setattr(supabase_db, "get_daily_narration_usage", _async({"daily_count": 5, "daily_window_start": None}))
    test_account_id = next(iter(UNLIMITED_TEST_ACCOUNT_IDS))
    auth_as(app, test_account_id)

    resp = client.get("/api/narrate-block/quota")

    assert resp.json() == {"remaining": 5, "daily_limit": 5}


