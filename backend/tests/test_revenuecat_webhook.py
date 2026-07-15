"""
Tests for the RevenueCat webhook (app/api/webhooks.py) — the entire
mechanism by which premium status gets granted or revoked based on real
payments. A bug here means either a paying customer never gets what they
paid for, or someone keeps premium forever after canceling — this is the
one place in the app where an untested regression directly costs money in
either direction, and it's small enough to cover completely.
"""

import pytest
from app.config import settings
from app.services import supabase_db

TEST_SECRET = "test-webhook-secret-do-not-use-in-prod"
USER_ID = "99999999-9999-9999-9999-999999999999"


@pytest.fixture(autouse=True)
def _set_test_secret(monkeypatch):
    monkeypatch.setattr(settings, "REVENUECAT_WEBHOOK_SECRET", TEST_SECRET)


def _event(event_type: str, app_user_id: str = USER_ID):
    return {"event": {"type": event_type, "app_user_id": app_user_id}}


def _track_calls(monkeypatch):
    calls = []

    async def _fake(user_id, is_premium):
        calls.append((user_id, is_premium))
        return True

    monkeypatch.setattr(supabase_db, "set_premium_status", _fake)
    return calls


def test_rejects_missing_auth_header(client, monkeypatch):
    calls = _track_calls(monkeypatch)

    resp = client.post("/api/webhooks/revenuecat", json=_event("INITIAL_PURCHASE"))

    assert resp.status_code == 401
    assert calls == []


def test_rejects_wrong_auth_header(client, monkeypatch):
    calls = _track_calls(monkeypatch)

    resp = client.post(
        "/api/webhooks/revenuecat",
        json=_event("INITIAL_PURCHASE"),
        headers={"Authorization": "Bearer wrong-secret"},
    )

    assert resp.status_code == 401
    assert calls == []


def test_fails_closed_when_secret_unset(client, monkeypatch):
    monkeypatch.setattr(settings, "REVENUECAT_WEBHOOK_SECRET", "")
    calls = _track_calls(monkeypatch)

    resp = client.post(
        "/api/webhooks/revenuecat",
        json=_event("INITIAL_PURCHASE"),
        headers={"Authorization": "Bearer "},
    )

    assert resp.status_code == 401
    assert calls == []


@pytest.mark.parametrize("event_type", [
    "INITIAL_PURCHASE",
    "RENEWAL",
    "PRODUCT_CHANGE",
    "UNCANCELLATION",
    "NON_RENEWING_PURCHASE",
    "TRANSFER",
])
def test_grants_premium_on_purchase_events(client, monkeypatch, event_type):
    calls = _track_calls(monkeypatch)

    resp = client.post(
        "/api/webhooks/revenuecat",
        json=_event(event_type),
        headers={"Authorization": f"Bearer {TEST_SECRET}"},
    )

    assert resp.status_code == 200
    assert calls == [(USER_ID, True)]


def test_revokes_premium_on_expiration(client, monkeypatch):
    calls = _track_calls(monkeypatch)

    resp = client.post(
        "/api/webhooks/revenuecat",
        json=_event("EXPIRATION"),
        headers={"Authorization": f"Bearer {TEST_SECRET}"},
    )

    assert resp.status_code == 200
    assert calls == [(USER_ID, False)]


def test_cancellation_does_not_revoke_premium(client, monkeypatch):
    # CANCELLATION only turns off auto-renew — access stays active until
    # the paid period actually ends, at which point RevenueCat sends
    # EXPIRATION. Treating CANCELLATION as a revoke would cut off access
    # the customer already paid for.
    calls = _track_calls(monkeypatch)

    resp = client.post(
        "/api/webhooks/revenuecat",
        json=_event("CANCELLATION"),
        headers={"Authorization": f"Bearer {TEST_SECRET}"},
    )

    assert resp.status_code == 200
    assert calls == []


def test_unknown_event_type_is_ignored_not_errored(client, monkeypatch):
    calls = _track_calls(monkeypatch)

    resp = client.post(
        "/api/webhooks/revenuecat",
        json=_event("BILLING_ISSUE"),
        headers={"Authorization": f"Bearer {TEST_SECRET}"},
    )

    assert resp.status_code == 200
    assert calls == []


def test_missing_app_user_id_is_a_no_op(client, monkeypatch):
    calls = _track_calls(monkeypatch)

    resp = client.post(
        "/api/webhooks/revenuecat",
        json={"event": {"type": "INITIAL_PURCHASE"}},
        headers={"Authorization": f"Bearer {TEST_SECRET}"},
    )

    assert resp.status_code == 200
    assert calls == []
