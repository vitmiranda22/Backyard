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
    monkeypatch.setattr(supabase_db, "get_cached_narration", _async(None))
    monkeypatch.setattr(supabase_db, "store_zone_data", _async(True))
    monkeypatch.setattr(supabase_db, "store_narration", _async({"id": "narration-1"}))
    monkeypatch.setattr(supabase_db, "get_cached_audio", _async(None))
    monkeypatch.setattr(supabase_db, "store_audio_file", _async(True))
    monkeypatch.setattr(supabase_db, "store_zone_image", _async(True))

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

    # No cached zone photo and Street View comes up empty — the photo task
    # then resolves to (None, None) without a real HTTP call.
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
    monkeypatch.setattr(supabase_db, "get_cached_narration", _async({"id": "cached-1", "narration_text": "Cached text."}))

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
    but nothing from that tour is read or written. Without this check, any
    authenticated user could pass another user's tour_id to read fragments
    of their narrative back in the connector text.
    """
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


def test_own_tour_with_prior_summary_gets_connector_stitched(app, client, auth_as, monkeypatch):
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
    resp = client.post("/api/narrate-block", json=_request_body(tour_id=TOUR_ID))

    assert resp.status_code == 200
    assert resp.json()["narration_text"] == "Meanwhile, Generated narration text."
    assert len(update_called) == 1
    assert update_called[0][0] == TOUR_ID
    assert update_called[0][1] == "Updated summary."


def test_own_tour_first_block_seeds_summary_without_connector(app, client, auth_as, monkeypatch):
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


def test_suggested_next_is_null_when_zone_data_has_no_qualifying_item(app, client, auth_as):
    # Baseline mocks already return an empty zone_data -- nothing to mine.
    auth_as(app, USER_ID)

    resp = client.post("/api/narrate-block", json=_request_body())

    assert resp.status_code == 200
    assert resp.json()["suggested_next"] is None


def test_suggested_next_appears_when_zone_data_has_a_qualifying_item(app, client, auth_as, monkeypatch):
    lat, lng = _request_body()["lat"], _request_body()["lng"]

    async def _fake_fetch_all(**kwargs):
        return {
            "zone_data": {
                "wikipedia": [{"title": "Nearby Landmark", "lat": lat + 0.0005, "lng": lng}],
            },
            "sources_queried": ["wikipedia"], "sources_failed": [],
            "sources_skipped": [], "hit_count": 1, "total": 1,
        }
    monkeypatch.setattr(narrate, "fetch_all_zone_data", _fake_fetch_all)

    auth_as(app, USER_ID)
    resp = client.post("/api/narrate-block", json=_request_body())

    assert resp.status_code == 200
    suggested = resp.json()["suggested_next"]
    assert suggested is not None
    assert suggested["name"] == "Nearby Landmark"
    assert suggested["lat"] == lat + 0.0005
    assert suggested["lng"] == lng


def test_suggested_next_is_null_on_narration_cache_hit_when_no_zone_row_cached(app, client, auth_as, monkeypatch):
    # Cache-hit path skips fetch_all_zone_data entirely; raw_data can only
    # come from an existing get_cached_zone_data row. With none cached
    # (baseline default), suggested_next must stay null rather than error.
    monkeypatch.setattr(supabase_db, "get_cached_narration", _async({"id": "cached-1", "narration_text": "Cached text."}))
    auth_as(app, USER_ID)

    resp = client.post("/api/narrate-block", json=_request_body())

    assert resp.status_code == 200
    assert resp.json()["suggested_next"] is None
