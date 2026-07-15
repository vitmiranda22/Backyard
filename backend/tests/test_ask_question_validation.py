"""
Regression tests for ask-question's upload validation (security audit,
2026-07). Before this fix, there was no size cap or content-type check on
the uploaded audio before it was read fully into memory and forwarded to
Whisper — a cost/memory amplification vector bounded only by call COUNT,
not size. Also covers the tour_id UUID-shape validation added alongside it.
"""

from app.api import narrate
from app.services import supabase_db

USER_ID = "55555555-5555-5555-5555-555555555555"


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


def _mock_premium_and_rate_limit(monkeypatch):
    monkeypatch.setattr(supabase_db, "get_user_premium_status", _async(True))
    monkeypatch.setattr(supabase_db, "check_question_rate_limit", _async((True, "")))


def test_rejects_non_audio_content_type(app, client, auth_as, monkeypatch):
    _mock_premium_and_rate_limit(monkeypatch)
    auth_as(app, USER_ID)

    resp = client.post(
        "/api/ask-question",
        data={"lat": "37.7", "lng": "-122.4"},
        files={"audio": ("q.txt", b"not audio", "text/plain")},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_audio_type"


def test_rejects_oversized_audio(app, client, auth_as, monkeypatch):
    _mock_premium_and_rate_limit(monkeypatch)
    auth_as(app, USER_ID)

    oversized = b"0" * (narrate.MAX_QUESTION_AUDIO_BYTES + 1)
    resp = client.post(
        "/api/ask-question",
        data={"lat": "37.7", "lng": "-122.4"},
        files={"audio": ("q.m4a", oversized, "audio/m4a")},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "audio_too_large"


def test_accepts_audio_under_size_limit_with_no_content_type(app, client, auth_as, monkeypatch):
    # UploadFile.content_type can legitimately be empty/None depending on
    # the client — the check must not reject on absence, only on a
    # concrete non-audio type.
    _mock_premium_and_rate_limit(monkeypatch)
    monkeypatch.setattr(narrate.openai_service, "transcribe_audio", _async(None))
    auth_as(app, USER_ID)

    resp = client.post(
        "/api/ask-question",
        data={"lat": "37.7", "lng": "-122.4"},
        files={"audio": ("q.m4a", b"small clip", "")},
    )

    # Gets past validation to the (mocked) transcription step, which
    # returns None -> 408, not 400 -- proves validation didn't reject it.
    assert resp.status_code == 408


def test_malformed_tour_id_is_nulled_not_500(app, client, auth_as, monkeypatch):
    _mock_premium_and_rate_limit(monkeypatch)
    monkeypatch.setattr(narrate.openai_service, "transcribe_audio", _async(None))
    auth_as(app, USER_ID)

    resp = client.post(
        "/api/ask-question",
        data={"lat": "37.7", "lng": "-122.4", "tour_id": "not-a-uuid"},
        files={"audio": ("q.m4a", b"small clip", "audio/m4a")},
    )

    assert resp.status_code == 408  # reached transcription, didn't 500 on the bad tour_id
