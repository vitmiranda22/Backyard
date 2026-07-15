"""
Regression tests for start-tour's rate limit (security audit, 2026-07).
Before this fix, start-tour had no rate limiting at all. It deliberately
uses a dedicated minute-only RPC (check_minute_rate_limit) rather than
narrate-block's check_rate_limit, because that one shares the daily
narration-budget counter — see supabase_db.check_minute_rate_limit's
docstring. These tests pin both the 429 behavior and that a legitimate
request still succeeds.
"""

from app.services import supabase_db

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
    auth_as(app, USER_ID)

    # time_machine is a free mood with no guide persona (GUIDE_PERSONAS
    # only covers the 3 premium moods), so _get_tour_intro short-circuits
    # without needing get_user_premium_status or get_voice_sample_key mocked.
    resp = client.post("/api/start-tour", json={"mood": "time_machine"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["tour_id"] == "tour-123"
    assert body["guide_name"] is None
