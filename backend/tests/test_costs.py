"""
Tests for costs.py — R2 pricing is pure math; fetch_openai_costs() mocks
httpx entirely, never makes a real call to OpenAI's API (mirrors
test_revenuecat_service.py's fake-client pattern).
"""

from app.config import settings
from app.services import costs


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

    async def get(self, url, params=None, headers=None):
        if self._exc:
            raise self._exc
        return self._response


def test_r2_cost_is_zero_within_the_free_tier():
    result = costs.estimate_r2_storage_cost(total_mb=5000)  # ~4.9GB, under 10GB free

    assert result["billable_gb"] == 0.0
    assert result["monthly_usd"] == 0.0


def test_r2_cost_bills_only_the_amount_over_the_free_tier():
    # 20GB total -> 10GB billable -> 10 * 0.015 = $0.15
    result = costs.estimate_r2_storage_cost(total_mb=20 * 1024)

    assert result["gb"] == 20.0
    assert result["billable_gb"] == 10.0
    assert result["monthly_usd"] == 0.15


def test_r2_cost_handles_missing_storage_data_without_crashing():
    result = costs.estimate_r2_storage_cost(total_mb=None)

    assert result == {"gb": None, "billable_gb": None, "monthly_usd": None}


async def test_cost_summary_still_lists_google_cloud_as_untracked(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_ADMIN_API_KEY", "")
    summary = await costs.get_cost_summary(total_mb=1000)

    untracked_names = [u["service"] for u in summary["untracked"]]
    assert "Google Cloud (TTS + Street View)" in untracked_names
    # OpenAI moved out of the untracked list -- it's now conditionally
    # tracked via fetch_openai_costs(), not permanently flagged as unknown.
    assert "OpenAI" not in untracked_names
    assert all(u["reason"] for u in summary["untracked"])


async def test_cost_summary_includes_openai_not_configured_when_key_missing(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_ADMIN_API_KEY", "")

    summary = await costs.get_cost_summary(total_mb=1000)

    assert summary["openai"] == {"configured": False}


async def test_fetch_openai_costs_returns_not_configured_without_admin_key(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_ADMIN_API_KEY", "")

    result = await costs.fetch_openai_costs()

    assert result == {"configured": False}


async def test_fetch_openai_costs_sums_amounts_across_buckets_and_results(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_ADMIN_API_KEY", "sk-admin-test")
    fake_response = _FakeResponse({
        "data": [
            {"results": [{"amount": {"value": 1.25, "currency": "usd"}}]},
            {"results": [
                {"amount": {"value": 0.50, "currency": "usd"}},
                {"amount": {"value": 2.00, "currency": "usd"}},
            ]},
        ],
    })
    monkeypatch.setattr(costs.httpx, "AsyncClient", lambda **kw: _FakeAsyncClient(response=fake_response))

    result = await costs.fetch_openai_costs()

    assert result["configured"] is True
    assert result["total_usd"] == 3.75
    assert result["currency"] == "usd"
    assert result["period_days"] == 30


async def test_fetch_openai_costs_returns_error_flag_on_request_failure(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_ADMIN_API_KEY", "sk-admin-test")
    monkeypatch.setattr(costs.httpx, "AsyncClient", lambda **kw: _FakeAsyncClient(exc=Exception("network error")))

    result = await costs.fetch_openai_costs()

    assert result == {"configured": True, "error": True}
