"""
Tests for start-tour: the minute rate limit (security audit, 2026-07 --
before that fix, start-tour had no rate limiting at all; deliberately
uses a dedicated minute-only RPC, check_minute_rate_limit, rather than
narrate-block's check_rate_limit, because that one shares the daily
narration-budget counter -- see supabase_db.check_minute_rate_limit's
docstring), the age gate, and the personalized guide intro (greets the
walker by their own display_name, generated fresh per tour -- see
_get_tour_intro's docstring for why it's no longer cached).
"""

from app.config import UNLIMITED_TEST_ACCOUNT_IDS
from app.services import supabase_db, tts, r2

USER_ID = "44444444-4444-4444-4444-444444444444"


def _async(return_value):
    async def _fn(*args, **kwargs):
        return return_value
    return _fn


def _settings(is_premium=False, display_name="Ada"):
    return {"is_premium": is_premium, "display_name": display_name}


def _mock_intro_pipeline(monkeypatch, settings=None):
    monkeypatch.setattr(supabase_db, "get_user_settings", _async(settings or _settings()))
    monkeypatch.setattr(supabase_db, "is_user_underage", _async(False))
    monkeypatch.setattr(tts, "synthesize_speech", _async(b"fake-mp3-bytes"))
    monkeypatch.setattr(r2, "upload_audio", _async(True))
    monkeypatch.setattr(r2, "generate_signed_url", lambda key: f"https://example.com/{key}")


def test_start_tour_blocked_when_minute_limit_exceeded(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((False, "minute_limit_exceeded")))
    auth_as(app, USER_ID)

    resp = client.post("/api/start-tour", json={"mood": "time_machine"})

    assert resp.status_code == 429
    assert resp.json()["detail"]["code"] == "minute_limit_exceeded"


def test_start_tour_succeeds_when_under_limit(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    monkeypatch.setattr(
        supabase_db, "create_tour",
        _async({"id": "tour-123", "created_at": "2026-07-15T00:00:00Z"}),
    )
    _mock_intro_pipeline(monkeypatch)
    auth_as(app, USER_ID)

    # time_machine has no named guide persona (GUIDE_PERSONAS only covers
    # the 3 premium moods) but does get a generic, unnamed welcome line
    # (_GENERIC_WELCOMES) -- every mode gets a spoken intro now, only
    # premium modes get a named character.
    resp = client.post("/api/start-tour", json={"mood": "time_machine"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["tour_id"] == "tour-123"
    assert body["guide_name"] is None
    assert body["intro_audio_url"] == "https://example.com/guide-intros/tours/tour-123.mp3"


def test_start_tour_premium_mode_gets_named_persona_intro(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    monkeypatch.setattr(
        supabase_db, "create_tour",
        _async({"id": "tour-456", "created_at": "2026-07-15T00:00:00Z"}),
    )
    _mock_intro_pipeline(monkeypatch, _settings(is_premium=True))
    auth_as(app, USER_ID)

    resp = client.post("/api/start-tour", json={"mood": "dark_side", "voice": "dramatic"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["guide_name"] == "Silas"
    assert body["intro_audio_url"] == "https://example.com/guide-intros/tours/tour-456.mp3"


def test_start_tour_intro_greets_the_walker_by_their_display_name(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    monkeypatch.setattr(
        supabase_db, "create_tour",
        _async({"id": "tour-name-1", "created_at": "2026-07-15T00:00:00Z"}),
    )
    _mock_intro_pipeline(monkeypatch, _settings(is_premium=True, display_name="Ada Lovelace"))

    captured = {}
    async def _track_synthesize(text, voice, is_premium):
        captured["text"] = text
        return b"fake-mp3-bytes"
    monkeypatch.setattr(tts, "synthesize_speech", _track_synthesize)
    auth_as(app, USER_ID)

    resp = client.post("/api/start-tour", json={"mood": "dark_side", "voice": "dramatic"})

    assert resp.status_code == 200
    assert captured["text"].startswith("Hey Ada Lovelace. I'm Silas.")


def test_start_tour_intro_has_no_greeting_when_display_name_is_blank(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    monkeypatch.setattr(
        supabase_db, "create_tour",
        _async({"id": "tour-name-2", "created_at": "2026-07-15T00:00:00Z"}),
    )
    _mock_intro_pipeline(monkeypatch, _settings(is_premium=True, display_name=""))

    captured = {}
    async def _track_synthesize(text, voice, is_premium):
        captured["text"] = text
        return b"fake-mp3-bytes"
    monkeypatch.setattr(tts, "synthesize_speech", _track_synthesize)
    auth_as(app, USER_ID)

    resp = client.post("/api/start-tour", json={"mood": "dark_side", "voice": "dramatic"})

    assert resp.status_code == 200
    assert captured["text"].startswith("I'm Silas.")
    assert "Hey" not in captured["text"].split(".")[0]


def test_start_tour_underage_user_gets_content_safety_forced_on(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    _mock_intro_pipeline(monkeypatch)

    captured = {}
    async def _track_create_tour(**kwargs):
        captured.update(kwargs)
        return {"id": "tour-789", "created_at": "2026-07-15T00:00:00Z"}
    monkeypatch.setattr(supabase_db, "create_tour", _track_create_tour)
    monkeypatch.setattr(supabase_db, "is_user_underage", _async(True))
    auth_as(app, USER_ID)

    resp = client.post("/api/start-tour", json={"mood": "time_machine", "content_safety": False})

    assert resp.status_code == 200
    assert captured["content_safety"] is True


def test_allowlisted_test_account_bypasses_the_minute_rate_limit(app, client, auth_as, monkeypatch):
    # check_minute_rate_limit is never even consulted for this account.
    checked = []
    async def _track_minute_limit(*args, **kwargs):
        checked.append(True)
        return (False, "minute_limit_exceeded")  # would 429 a normal user
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _track_minute_limit)
    monkeypatch.setattr(supabase_db, "create_tour", _async({"id": "tour-999", "created_at": "2026-07-15T00:00:00Z"}))
    _mock_intro_pipeline(monkeypatch)

    test_account_id = next(iter(UNLIMITED_TEST_ACCOUNT_IDS))
    auth_as(app, test_account_id)

    resp = client.post("/api/start-tour", json={"mood": "time_machine"})

    assert resp.status_code == 200
    assert checked == []
