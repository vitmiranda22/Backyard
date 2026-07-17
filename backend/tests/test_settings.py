"""
Tests for PATCH /api/user/settings's date_of_birth handling -- the
follow-up path for accounts that predate the signup redesign (migration
017) and have no date_of_birth on file. Validated server-side, not just
trusted from the client, same reasoning as everything else in this app
that's enforced twice (see is_user_underage's own docstring).
"""

from app.services import supabase_db

USER_ID = "99999999-9999-9999-9999-999999999999"


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


def test_get_settings_includes_date_of_birth(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_user_settings", _async({
        "preferred_voice": "neutral", "content_safety": False,
        "anonymous_default": False, "display_name": "Ada",
        "date_of_birth": "1990-03-05", "is_premium": False,
    }))
    auth_as(app, USER_ID)

    resp = client.get("/api/user/settings")

    assert resp.status_code == 200
    assert resp.json()["date_of_birth"] == "1990-03-05"


def test_get_settings_date_of_birth_is_null_when_never_set(app, client, auth_as, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_user_settings", _async({
        "preferred_voice": "neutral", "content_safety": False,
        "anonymous_default": False, "display_name": "Ada", "is_premium": False,
    }))
    auth_as(app, USER_ID)

    resp = client.get("/api/user/settings")

    assert resp.status_code == 200
    assert resp.json()["date_of_birth"] is None


def test_update_settings_saves_a_valid_date_of_birth(app, client, auth_as, monkeypatch):
    captured = {}
    async def _track_update(user_id, updates):
        captured.update(updates)
        return {"preferred_voice": "neutral", "content_safety": False,
                "anonymous_default": False, "display_name": "Ada",
                "date_of_birth": "1990-03-05", "is_premium": False}
    monkeypatch.setattr(supabase_db, "update_user_settings", _track_update)
    auth_as(app, USER_ID)

    resp = client.patch("/api/user/settings", json={"date_of_birth": "1990-03-05"})

    assert resp.status_code == 200
    assert captured["date_of_birth"] == "1990-03-05"
    assert resp.json()["date_of_birth"] == "1990-03-05"


def test_update_settings_rejects_malformed_date(app, client, auth_as, monkeypatch):
    called = []
    async def _track_update(*args, **kwargs):
        called.append(True)
        return {}
    monkeypatch.setattr(supabase_db, "update_user_settings", _track_update)
    auth_as(app, USER_ID)

    resp = client.patch("/api/user/settings", json={"date_of_birth": "not-a-date"})

    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_date_of_birth"
    assert called == []


def test_update_settings_rejects_a_future_date(app, client, auth_as, monkeypatch):
    called = []
    async def _track_update(*args, **kwargs):
        called.append(True)
        return {}
    monkeypatch.setattr(supabase_db, "update_user_settings", _track_update)
    auth_as(app, USER_ID)

    resp = client.patch("/api/user/settings", json={"date_of_birth": "2099-01-01"})

    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_date_of_birth"
    assert called == []


def test_update_settings_rejects_an_implausibly_old_date(app, client, auth_as, monkeypatch):
    called = []
    async def _track_update(*args, **kwargs):
        called.append(True)
        return {}
    monkeypatch.setattr(supabase_db, "update_user_settings", _track_update)
    auth_as(app, USER_ID)

    resp = client.patch("/api/user/settings", json={"date_of_birth": "1899-01-01"})

    assert resp.status_code == 400
    assert called == []
