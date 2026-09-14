"""
Tests for the JWKS-fetch resilience in app/api/auth.py -- a transient
network blip talking to Supabase's JWKS endpoint (a 504, a DNS hiccup)
should not turn into a hard "please sign in again" for the user. Written
for the Sentry issue "Auth error: Fail to fetch data from the url, err:
'HTTP Error 504: Gateway Timeout'", which was falling through to a
misleading 401 auth_failed instead of a retryable error.
"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from jwt.exceptions import PyJWKClientConnectionError

from app.api import auth as auth_module


class _FlakyJWKSClient:
    """Raises PyJWKClientConnectionError a fixed number of times before succeeding."""

    def __init__(self, fail_times, key="fake-signing-key"):
        self.fail_times = fail_times
        self.calls = 0
        self._key = key

    def get_signing_key_from_jwt(self, token):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise PyJWKClientConnectionError("HTTP Error 504: Gateway Timeout")
        return SimpleNamespace(key=self._key)


def _fake_request(token="sometoken"):
    return SimpleNamespace(headers={"Authorization": f"Bearer {token}"})


async def test_get_signing_key_retries_once_on_connection_error():
    client = _FlakyJWKSClient(fail_times=1)

    key = await auth_module._get_signing_key(client, "sometoken")

    assert key.key == "fake-signing-key"
    assert client.calls == 2


async def test_get_signing_key_raises_when_retry_also_fails():
    client = _FlakyJWKSClient(fail_times=5)

    with pytest.raises(PyJWKClientConnectionError):
        await auth_module._get_signing_key(client, "sometoken")

    assert client.calls == 2


async def test_get_current_user_id_returns_503_retry_true_when_jwks_unreachable(monkeypatch):
    client = _FlakyJWKSClient(fail_times=5)
    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: client)

    with pytest.raises(HTTPException) as exc_info:
        await auth_module.get_current_user_id(_fake_request())

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail["code"] == "auth_unavailable"
    assert exc_info.value.detail["retry"] is True


async def test_get_current_user_id_succeeds_after_one_transient_failure(monkeypatch):
    # A single blip should be invisible to the caller once decode succeeds.
    client = _FlakyJWKSClient(fail_times=1)
    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: client)
    monkeypatch.setattr(
        auth_module.pyjwt, "decode", lambda token, key, algorithms, audience: {"sub": "user-123"}
    )

    user_id = await auth_module.get_current_user_id(_fake_request())

    assert user_id == "user-123"
    assert client.calls == 2
