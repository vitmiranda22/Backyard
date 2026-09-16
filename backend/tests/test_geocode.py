"""
Tests for geocode.forward_geocode() — mocks httpx.AsyncClient entirely,
never makes a real call to Nominatim.
"""

import httpx
import pytest
from app.services import geocode


class _FakeResponse:
    def __init__(self, json_data, status_code=200):
        self._json = json_data
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)

    def json(self):
        return self._json


class _FakeAsyncClient:
    def __init__(self, response=None, exc=None):
        self._response = response
        self._exc = exc

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, params=None, headers=None, timeout=None):
        if self._exc:
            raise self._exc
        return self._response


@pytest.fixture(autouse=True)
def _no_real_delay_or_stale_cache(monkeypatch):
    # forward_geocode shares reverse_geocode's real 1 req/sec Nominatim
    # throttle -- without this, back-to-back tests in this file would
    # each pay a real sleep. Cache is also module-level and would
    # otherwise leak results between tests.
    async def _instant(*args, **kwargs):
        return None

    monkeypatch.setattr(geocode, "_throttle", _instant)
    geocode._forward_geocode_cache.clear()


def _sf_result_json():
    return [{
        "lat": "37.7749",
        "lon": "-122.4194",
        "display_name": "San Francisco, California, United States",
        "address": {"city": "San Francisco"},
    }]


async def test_returns_coordinates_and_a_clean_city_label(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: _FakeAsyncClient(response=_FakeResponse(_sf_result_json())))

    result = await geocode.forward_geocode("San Francisco")

    assert result.lat == 37.7749
    assert result.lng == -122.4194
    assert result.city == "San Francisco"
    assert result.display_name == "San Francisco, California, United States"


async def test_falls_back_through_town_village_municipality_then_the_query_itself(monkeypatch):
    data = [{"lat": "1.0", "lon": "2.0", "display_name": "Somewhere", "address": {}}]
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: _FakeAsyncClient(response=_FakeResponse(data)))

    result = await geocode.forward_geocode("  Somewhere Rural  ")

    assert result.city == "Somewhere Rural"


async def test_returns_none_when_nominatim_finds_nothing(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: _FakeAsyncClient(response=_FakeResponse([])))

    result = await geocode.forward_geocode("nonexistent-place-xyzzy")

    assert result is None


async def test_returns_none_on_request_failure_after_retries(monkeypatch):
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: _FakeAsyncClient(exc=httpx.TimeoutException("timeout")))

    result = await geocode.forward_geocode("San Francisco")

    assert result is None


async def test_returns_none_for_an_empty_query_without_calling_nominatim(monkeypatch):
    calls = []
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda *a, **k: calls.append(1) or _FakeAsyncClient(response=_FakeResponse(_sf_result_json())),
    )

    result = await geocode.forward_geocode("   ")

    assert result is None
    assert calls == []


async def test_caches_by_normalized_query_so_a_second_call_skips_the_network(monkeypatch):
    call_count = {"n": 0}

    class _CountingClient(_FakeAsyncClient):
        async def get(self, *args, **kwargs):
            call_count["n"] += 1
            return await super().get(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: _CountingClient(response=_FakeResponse(_sf_result_json())))

    first = await geocode.forward_geocode("San Francisco")
    second = await geocode.forward_geocode("  SAN FRANCISCO  ")

    assert call_count["n"] == 1
    assert first.city == second.city == "San Francisco"
