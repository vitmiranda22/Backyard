"""
Regression tests for the missing rate limits on comments/likes/ratings
(found in a follow-up gap-finding pass, 2026-07). Before this fix,
post_comment had no throttle at all — any authenticated user could flood a
tour's comments at whatever rate they could sustain. toggle_like and
rate_tour had the same gap, just lower-severity (both are naturally
row-bounded by DB constraints, but still had no call-frequency limit).
"""

from app.services import supabase_db

OWNER_ID = "66666666-6666-6666-6666-666666666666"
USER_ID = "77777777-7777-7777-7777-777777777777"
TOUR_ID = "88888888-8888-8888-8888-888888888888"


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


def _deny_rate_limit(monkeypatch):
    monkeypatch.setattr(supabase_db, "check_minute_rate_limit", _async((False, "minute_limit_exceeded")))


def test_post_comment_blocked_when_rate_limited(app, client, auth_as, monkeypatch):
    _deny_rate_limit(monkeypatch)
    auth_as(app, USER_ID)

    resp = client.post(f"/api/tours/{TOUR_ID}/comments", json={"body": "hi", "is_anonymous": False})

    assert resp.status_code == 429
    # Confirms the rate-limit check runs before the tour lookup — get_tour
    # was never mocked, so a 404 here would mean the ordering regressed.
    assert resp.json()["detail"]["code"] == "minute_limit_exceeded"


def test_toggle_like_blocked_when_rate_limited(app, client, auth_as, monkeypatch):
    _deny_rate_limit(monkeypatch)
    auth_as(app, USER_ID)

    resp = client.post(f"/api/tours/{TOUR_ID}/like")

    assert resp.status_code == 429


def test_rate_tour_blocked_when_rate_limited(app, client, auth_as, monkeypatch):
    _deny_rate_limit(monkeypatch)
    auth_as(app, USER_ID)

    resp = client.post("/api/rate-tour", json={"tour_id": TOUR_ID, "score": 5})

    assert resp.status_code == 429


def test_post_comment_succeeds_when_under_limit(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_tour", _async({"id": TOUR_ID, "creator_id": OWNER_ID, "is_public": True}))
    monkeypatch.setattr(
        supabase_db, "create_comment",
        _async({"id": "c1", "body": "hi", "is_anonymous": False, "created_at": "2026-07-15T00:00:00Z"}),
    )
    auth_as(app, USER_ID)

    resp = client.post(f"/api/tours/{TOUR_ID}/comments", json={"body": "hi", "is_anonymous": False})

    assert resp.status_code == 200
