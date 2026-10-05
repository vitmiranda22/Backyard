"""
Tests for streetview.fetch_street_view_image() — mocks httpx.AsyncClient
entirely, never makes a real call to Google.
"""

import httpx
import pytest
from app.services import streetview


class _FakeResponse:
    def __init__(self, json_data=None, content=b"", status_code=200):
        self._json = json_data
        self.content = content
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)

    def json(self):
        return self._json


class _FakeAsyncClient:
    """Returns each queued response in order -- metadata call first, then
    the image call, matching fetch_street_view_image's own two-call shape."""

    def __init__(self, responses):
        self._responses = list(responses)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, params=None, timeout=None):
        return self._responses.pop(0)


def _metadata(status="OK", copyright_field="© Google, Inc."):
    return _FakeResponse(json_data={"status": status, "copyright": copyright_field})


async def test_fetches_the_image_when_metadata_is_ok_and_google_owned(monkeypatch):
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *a, **k: _FakeAsyncClient([_metadata(), _FakeResponse(content=b"real-jpeg-bytes")]),
    )

    result = await streetview.fetch_street_view_image(36.12, -115.16)

    assert result == b"real-jpeg-bytes"


async def test_returns_none_when_theres_no_coverage(monkeypatch):
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *a, **k: _FakeAsyncClient([_metadata(status="ZERO_RESULTS")]),
    )

    result = await streetview.fetch_street_view_image(36.12, -115.16)

    assert result is None


async def test_rejects_a_business_contributed_photosphere_not_owned_by_google(monkeypatch):
    # Real incident: a Las Vegas Strip resort's nearest "outdoor"-tagged
    # panorama came back as a professional photographer's indoor tour
    # (copyright held by the photographer, not Google) -- source=outdoor
    # alone didn't filter this out, so the copyright field is the real
    # signal that this isn't a genuine street-level capture.
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *a, **k: _FakeAsyncClient([_metadata(copyright_field="© P M")]),
    )

    result = await streetview.fetch_street_view_image(36.1267317, -115.165060962658)

    assert result is None


async def test_accepts_copyright_regardless_of_case(monkeypatch):
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *a, **k: _FakeAsyncClient(
            [_metadata(copyright_field="GOOGLE"), _FakeResponse(content=b"real-jpeg-bytes")]
        ),
    )

    result = await streetview.fetch_street_view_image(36.12, -115.16)

    assert result == b"real-jpeg-bytes"


async def test_returns_none_on_timeout(monkeypatch):
    class _TimeoutClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, *a, **k):
            raise httpx.TimeoutException("timeout")

    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: _TimeoutClient())

    result = await streetview.fetch_street_view_image(36.12, -115.16)

    assert result is None
