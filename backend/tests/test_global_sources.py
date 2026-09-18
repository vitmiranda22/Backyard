"""
Tests for the three data sources added to global_sources.py this pass:
OpenHistoricalMap (Overpass), Chronicling America, and DPLA. Each fetch_*
function takes an already-constructed httpx.AsyncClient, so these tests
pass a small fake client directly rather than monkeypatching httpx itself
(contrast with test_geocode.py, whose function builds its own client).
"""

import pytest
from app.config import settings
from app.services import global_sources


class _FakeResponse:
    def __init__(self, json_data, status_code=200):
        self._json = json_data
        self.status_code = status_code

    def json(self):
        return self._json


class _FakeClient:
    def __init__(self, response=None, exc=None):
        self._response = response
        self._exc = exc
        self.calls = []

    async def get(self, url, params=None, headers=None, timeout=None):
        self.calls.append(("GET", url, params))
        if self._exc:
            raise self._exc
        return self._response

    async def post(self, url, data=None, headers=None, timeout=None):
        self.calls.append(("POST", url, data))
        if self._exc:
            raise self._exc
        return self._response


# --- fetch_openhistoricalmap ---

def _ohm_element(name="Childs Restaurant", start_date="1930", end_date="", **extra_tags):
    tags = {"name": name, "start_date": start_date, **extra_tags}
    if end_date:
        tags["end_date"] = end_date
    return {"type": "node", "lat": 40.7484, "lon": -73.9892, "tags": tags}


async def test_fetch_openhistoricalmap_parses_a_real_dated_feature():
    client = _FakeClient(response=_FakeResponse({"elements": [
        _ohm_element(amenity="restaurant", source="1930 G.W. Bromley & Co. map of Manhattan"),
    ]}))

    result = await global_sources.fetch_openhistoricalmap(40.7484, -73.9857, client)

    assert result == [{
        "name": "Childs Restaurant",
        "start_date": "1930",
        "end_date": "",
        "kind": "restaurant",
        "source": "1930 G.W. Bromley & Co. map of Manhattan",
        "lat": 40.7484,
        "lng": -73.9892,
    }]


async def test_fetch_openhistoricalmap_skips_elements_missing_a_name_or_date():
    client = _FakeClient(response=_FakeResponse({"elements": [
        {"type": "node", "tags": {"start_date": "1930"}},  # no name
        {"type": "node", "tags": {"name": "Undated Building"}},  # no start_date
    ]}))

    result = await global_sources.fetch_openhistoricalmap(40.7484, -73.9857, client)

    assert result == []


async def test_fetch_openhistoricalmap_returns_empty_on_non_200():
    client = _FakeClient(response=_FakeResponse({}, status_code=500))

    result = await global_sources.fetch_openhistoricalmap(40.7484, -73.9857, client)

    assert result == []


async def test_fetch_openhistoricalmap_returns_empty_on_request_failure():
    client = _FakeClient(exc=Exception("network error"))

    result = await global_sources.fetch_openhistoricalmap(40.7484, -73.9857, client)

    assert result == []


# --- fetch_chronicling_america ---

async def test_fetch_chronicling_america_is_skipped_outside_the_united_states():
    client = _FakeClient(response=_FakeResponse({"results": [{"title": "Should not be reached"}]}))

    result = await global_sources.fetch_chronicling_america("Polk Street", "Polk Gulch", "San Francisco", "France", client)

    assert result == []
    assert client.calls == []


async def test_fetch_chronicling_america_parses_real_newspaper_pages():
    client = _FakeClient(response=_FakeResponse({"results": [
        {
            "title": "Image 16 of The San Francisco call (San Francisco [Calif.]), October 25, 1903",
            "date": "1903-10-25",
            "partof": ["chronicling america", "serial and government publications division",
                       "the san francisco call (san francisco [calif.]) 1895-1913"],
        },
    ]}))

    result = await global_sources.fetch_chronicling_america(
        "Polk Street", "Polk Gulch", "San Francisco", "United States", client,
    )

    assert result == [{
        "title": "Image 16 of The San Francisco call (San Francisco [Calif.]), October 25, 1903",
        "date": "1903-10-25",
        "newspaper": "the san francisco call (san francisco [calif.]) 1895-1913",
    }]


async def test_fetch_chronicling_america_returns_empty_with_no_street_neighborhood_or_city():
    client = _FakeClient(response=_FakeResponse({"results": [{"title": "irrelevant"}]}))

    result = await global_sources.fetch_chronicling_america("", "", "", "United States", client)

    assert result == []
    assert client.calls == []


# --- fetch_dpla ---

async def test_fetch_dpla_is_skipped_outside_the_united_states(monkeypatch):
    monkeypatch.setattr(settings, "DPLA_API_KEY", "fake-key")
    client = _FakeClient(response=_FakeResponse({"docs": [{"sourceResource": {"title": "irrelevant"}}]}))

    result = await global_sources.fetch_dpla(37.79, -122.42, "France", client)

    assert result == []
    assert client.calls == []


async def test_fetch_dpla_is_skipped_when_no_api_key_is_configured(monkeypatch):
    monkeypatch.setattr(settings, "DPLA_API_KEY", "")
    client = _FakeClient(response=_FakeResponse({"docs": [{"sourceResource": {"title": "irrelevant"}}]}))

    result = await global_sources.fetch_dpla(37.79, -122.42, "United States", client)

    assert result == []
    assert client.calls == []


async def test_fetch_dpla_parses_a_real_item_including_a_list_valued_title(monkeypatch):
    monkeypatch.setattr(settings, "DPLA_API_KEY", "fake-key")
    client = _FakeClient(response=_FakeResponse({"docs": [
        {
            "sourceResource": {"title": ["Polk Street streetcar, 1912"], "date": {"displayDate": "1912"}},
            "provider": {"name": "California Digital Library"},
        },
    ]}))

    result = await global_sources.fetch_dpla(37.79, -122.42, "United States", client)

    assert result == [{
        "title": "Polk Street streetcar, 1912",
        "date": "1912",
        "provider": "California Digital Library",
    }]


async def test_fetch_dpla_skips_docs_with_no_title(monkeypatch):
    monkeypatch.setattr(settings, "DPLA_API_KEY", "fake-key")
    client = _FakeClient(response=_FakeResponse({"docs": [
        {"sourceResource": {"date": {"displayDate": "1912"}}, "provider": {"name": "No Title Archive"}},
    ]}))

    result = await global_sources.fetch_dpla(37.79, -122.42, "United States", client)

    assert result == []


async def test_fetch_dpla_returns_empty_on_non_200(monkeypatch):
    monkeypatch.setattr(settings, "DPLA_API_KEY", "fake-key")
    client = _FakeClient(response=_FakeResponse({}, status_code=503))

    result = await global_sources.fetch_dpla(37.79, -122.42, "United States", client)

    assert result == []
