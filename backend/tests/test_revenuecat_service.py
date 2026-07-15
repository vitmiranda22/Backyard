"""
Tests for revenuecat_service.get_overview_metrics() — mocks httpx entirely,
never makes a real call to RevenueCat's API.
"""

from app.config import settings
from app.services import revenuecat_service


class _FakeResponse:
    def __init__(self, json_data, status_code=200):
        self._json = json_data
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")

    def json(self):
        return self._json


class _FakeAsyncClient:
    def __init__(self, response=None, exc=None, **kwargs):
        self._response = response
        self._exc = exc

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, headers=None):
        if self._exc:
            raise self._exc
        return self._response


async def test_returns_not_configured_when_key_or_project_id_missing(monkeypatch):
    monkeypatch.setattr(settings, "REVENUECAT_SECRET_API_KEY", "")
    monkeypatch.setattr(settings, "REVENUECAT_PROJECT_ID", "proj123")

    result = await revenuecat_service.get_overview_metrics()

    assert result == {"configured": False}


async def test_parses_metrics_into_a_dict_keyed_by_id(monkeypatch):
    monkeypatch.setattr(settings, "REVENUECAT_SECRET_API_KEY", "sk_test")
    monkeypatch.setattr(settings, "REVENUECAT_PROJECT_ID", "proj123")

    fake_response = _FakeResponse({
        "object": "overview_metrics",
        "currency": "USD",
        "metrics": [
            {"object": "overview_metric", "id": "mrr", "name": "MRR", "description": "x", "unit": "$", "period": "P28D", "value": 42.5, "last_updated_at": None, "last_updated_at_iso8601": None},
            {"object": "overview_metric", "id": "active_subscriptions", "name": "Active Subscriptions", "description": "x", "unit": "#", "period": "P0D", "value": 3, "last_updated_at": None, "last_updated_at_iso8601": None},
        ],
    })
    monkeypatch.setattr(revenuecat_service.httpx, "AsyncClient", lambda **kw: _FakeAsyncClient(response=fake_response))

    result = await revenuecat_service.get_overview_metrics()

    assert result["configured"] is True
    assert result["currency"] == "USD"
    assert result["metrics"]["mrr"]["value"] == 42.5
    assert result["metrics"]["active_subscriptions"]["value"] == 3


async def test_returns_error_flag_on_request_failure(monkeypatch):
    monkeypatch.setattr(settings, "REVENUECAT_SECRET_API_KEY", "sk_test")
    monkeypatch.setattr(settings, "REVENUECAT_PROJECT_ID", "proj123")
    monkeypatch.setattr(revenuecat_service.httpx, "AsyncClient", lambda **kw: _FakeAsyncClient(exc=Exception("network error")))

    result = await revenuecat_service.get_overview_metrics()

    assert result == {"configured": True, "error": True, "metrics": {}}
