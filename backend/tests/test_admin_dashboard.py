"""
Tests for the admin dashboard's auth gate and failed-attempt alerting
(app/api/admin.py). Uses a fixed test secret via monkeypatch rather than
relying on whatever ADMIN_SECRET happens to be in the local .env, so this
suite behaves the same in CI (no .env at all) as it does locally.
"""

import pytest
from app.api import admin
from app.config import settings
from app.services import admin_stats

TEST_SECRET = "test-secret-do-not-use-in-prod"

EMPTY_STATS = {"users": {}, "tours": {}, "engagement": {}, "top_cities": [],
               "top_neighborhoods": [], "top_streets": [], "cache": {}, "storage": {}}


@pytest.fixture(autouse=True)
def _reset_admin_state(monkeypatch):
    """admin.py's failed-attempt tracker is module-level state, so it must
    be reset between tests or an earlier test's failures bleed into the
    next one's assertions."""
    monkeypatch.setattr(settings, "ADMIN_SECRET", TEST_SECRET)
    admin._failed_attempts.clear()
    admin._alerted_since_last_reset = False


def test_stats_rejects_missing_key(client):
    resp = client.get("/api/admin/stats")
    assert resp.status_code == 401


def test_stats_rejects_wrong_key(client):
    resp = client.get("/api/admin/stats", headers={"X-Admin-Key": "wrong"})
    assert resp.status_code == 401


def test_stats_rejects_everything_when_secret_unset(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_SECRET", "")
    resp = client.get("/api/admin/stats", headers={"X-Admin-Key": ""})
    assert resp.status_code == 401


def test_stats_accepts_correct_key(client, monkeypatch):
    async def _fake_stats():
        return EMPTY_STATS
    monkeypatch.setattr(admin_stats, "get_dashboard_stats", _fake_stats)

    resp = client.get("/api/admin/stats", headers={"X-Admin-Key": TEST_SECRET})
    assert resp.status_code == 200


def test_admin_page_serves_without_a_key(client):
    # The page shell has no data — only /api/admin/stats is gated.
    resp = client.get("/admin")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]


def test_alert_fires_once_at_threshold_not_on_every_failure(client, monkeypatch):
    captured = []
    monkeypatch.setattr(admin.sentry_sdk, "capture_message", lambda msg, level=None: captured.append(msg))

    for _ in range(admin._FAILED_ATTEMPT_ALERT_THRESHOLD + 1):
        client.get("/api/admin/stats", headers={"X-Admin-Key": "wrong"})

    assert len(captured) == 1
