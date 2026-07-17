"""
Regression tests for start-tour's rate limit (security audit, 2026-07).
Before this fix, start-tour had no rate limiting at all. It deliberately
uses a dedicated minute-only RPC (check_minute_rate_limit) rather than
narrate-block's check_rate_limit, because that one shares the daily
narration-budget counter — see supabase_db.check_minute_rate_limit's
docstring. These tests pin both the 429 behavior and that a legitimate
request still succeeds.
"""

from app.services import supabase_db, tts, r2

USER_ID = "44444444-4444-4444-4444-444444444444"


def _async(return_value):
    async def _fn(*args, **kwargs):
        return return_value
    return _fn


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
    monkeypatch.setattr(supabase_db, "get_user_premium_status", _async(False))
    monkeypatch.setattr(supabase_db, "is_user_underage", _async(False))
    monkeypatch.setattr(supabase_db, "get_voice_sample_key", _async(None))
    monkeypatch.setattr(supabase_db, "store_voice_sample_key", _async(True))
    monkeypatch.setattr(tts, "synthesize_speech", _async(b"fake-mp3-bytes"))
    monkeypatch.setattr(r2, "upload_audio", _async(True))
    monkeypatch.setattr(r2, "generate_signed_url", lambda key: f"https://example.com/{key}")
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
    assert body["intro_audio_url"] == "https://example.com/guide-intros/welcome_time_machine_neutral_free.mp3"


def test_start_tour_premium_mode_gets_named_persona_intro(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    monkeypatch.setattr(
        supabase_db, "create_tour",
        _async({"id": "tour-456", "created_at": "2026-07-15T00:00:00Z"}),
    )
    monkeypatch.setattr(supabase_db, "get_user_premium_status", _async(True))
    monkeypatch.setattr(supabase_db, "is_user_underage", _async(False))
    monkeypatch.setattr(supabase_db, "get_voice_sample_key", _async(None))
    monkeypatch.setattr(supabase_db, "store_voice_sample_key", _async(True))
    monkeypatch.setattr(tts, "synthesize_speech", _async(b"fake-mp3-bytes"))
    monkeypatch.setattr(r2, "upload_audio", _async(True))
    monkeypatch.setattr(r2, "generate_signed_url", lambda key: f"https://example.com/{key}")
    auth_as(app, USER_ID)

    resp = client.post("/api/start-tour", json={"mood": "dark_side", "voice": "dramatic"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["guide_name"] == "Silas"
    assert body["intro_audio_url"] == "https://example.com/guide-intros/dark_side_dramatic.mp3"


def test_start_tour_underage_user_gets_content_safety_forced_on(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    monkeypatch.setattr(supabase_db, "get_user_premium_status", _async(False))
    monkeypatch.setattr(supabase_db, "is_user_underage", _async(True))
    monkeypatch.setattr(supabase_db, "get_voice_sample_key", _async(None))
    monkeypatch.setattr(supabase_db, "store_voice_sample_key", _async(True))
    monkeypatch.setattr(tts, "synthesize_speech", _async(b"fake-mp3-bytes"))
    monkeypatch.setattr(r2, "upload_audio", _async(True))
    monkeypatch.setattr(r2, "generate_signed_url", lambda key: f"https://example.com/{key}")

    captured = {}
    async def _track_create_tour(**kwargs):
        captured.update(kwargs)
        return {"id": "tour-789", "created_at": "2026-07-15T00:00:00Z"}
    monkeypatch.setattr(supabase_db, "create_tour", _track_create_tour)
    auth_as(app, USER_ID)

    resp = client.post("/api/start-tour", json={"mood": "time_machine", "content_safety": False})

    assert resp.status_code == 200
    assert captured["content_safety"] is True
