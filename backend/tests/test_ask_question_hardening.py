"""
Regression tests for ask-question's two hardening fixes (2026-10):

1. A per-minute rate limit that was never actually enforced despite a
   comment claiming it was -- nothing stopped a premium user from
   spending their whole daily question quota (fresh Whisper + GPT + TTS
   every call, zero caching) in a handful of seconds.
2. content_safety/age-gate enforcement, which didn't exist at all on this
   endpoint -- a free-form question has no fixed topic the way narration
   does, so a walker could ask their way around the age gate entirely.
"""

from app.services import supabase_db, openai_service

USER_ID = "66666666-6666-6666-6666-666666666666"


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


def _mock_happy_path(monkeypatch, *, is_premium=True, is_underage=False):
    monkeypatch.setattr(supabase_db, "get_user_premium_status", _async(is_premium))
    monkeypatch.setattr(supabase_db, "check_question_rate_limit", _async((True, "")))
    monkeypatch.setattr(supabase_db, "is_user_underage", _async(is_underage))
    monkeypatch.setattr(openai_service, "transcribe_audio", _async("What is this building?"))
    monkeypatch.setattr(
        openai_service,
        "answer_question",
        _async("That's the old Main Street theater, built in 1920."),
    )


def _post(client, **data):
    body = {"lat": "37.7", "lng": "-122.4"}
    body.update(data)
    return client.post(
        "/api/ask-question",
        data=body,
        files={"audio": ("q.m4a", b"small clip", "audio/m4a")},
    )


# --- minute rate limit ---

def test_hits_the_shared_minute_bucket_not_just_the_daily_cap(app, client, auth_as, monkeypatch):
    _mock_happy_path(monkeypatch)
    captured = {}

    async def _track_minute(user_id, minute_limit):
        captured["minute_limit"] = minute_limit
        return True, ""
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _track_minute)
    auth_as(app, USER_ID)

    resp = _post(client)

    assert resp.status_code == 200
    assert captured  # check_minute_rate_limit was actually called


def test_429s_when_the_minute_bucket_is_exhausted_even_with_daily_quota_left(app, client, auth_as, monkeypatch):
    _mock_happy_path(monkeypatch)
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((False, "minute_limit_exceeded")))
    auth_as(app, USER_ID)

    resp = _post(client)

    assert resp.status_code == 429
    assert resp.json()["detail"]["code"] == "minute_limit_exceeded"


# --- content safety / age gate ---

def test_underage_user_gets_content_safety_forced_to_restricted(app, client, auth_as, monkeypatch):
    _mock_happy_path(monkeypatch, is_underage=True)
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    captured = {}

    async def _track_answer(**kwargs):
        captured.update(kwargs)
        return "An answer."
    monkeypatch.setattr(openai_service, "answer_question", _track_answer)
    auth_as(app, USER_ID)

    resp = _post(client, content_safety="true")

    assert resp.status_code == 200
    assert captured["content_safety"] is False


def test_adult_users_mature_choice_passes_through_untouched(app, client, auth_as, monkeypatch):
    _mock_happy_path(monkeypatch, is_underage=False)
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    captured = {}

    async def _track_answer(**kwargs):
        captured.update(kwargs)
        return "An answer."
    monkeypatch.setattr(openai_service, "answer_question", _track_answer)
    auth_as(app, USER_ID)

    resp = _post(client, content_safety="true")

    assert resp.status_code == 200
    assert captured["content_safety"] is True


def test_defaults_to_restricted_when_the_client_sends_nothing(app, client, auth_as, monkeypatch):
    _mock_happy_path(monkeypatch)
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((True, "")))
    captured = {}

    async def _track_answer(**kwargs):
        captured.update(kwargs)
        return "An answer."
    monkeypatch.setattr(openai_service, "answer_question", _track_answer)
    auth_as(app, USER_ID)

    resp = _post(client)  # no content_safety field at all

    assert resp.status_code == 200
    assert captured["content_safety"] is False
