"""
Shared pytest fixtures.

Nothing here talks to real Supabase/R2/OpenAI/etc. — every test mocks the
service-layer functions it needs via monkeypatch. That's deliberate: this
project's only prior "tests" (see scripts/manual_checks/) hit the live
production database and R2 bucket directly, which is how test data kept
ending up in prod all session. A real suite has to be safe to run
unattended, repeatedly, without a human cleaning up after it.
"""

import os
import sys
import types

# Must run before ANY `app.*` import: main.py calls sentry_sdk.init() as
# unconditional top-level module code the first time it's imported, and
# that init is real once sentry_sdk is actually installed — it would
# report every test run's requests to the real production Sentry project
# (confirmed live: a full test run queued 14 real events before this
# guard existed). pydantic-settings prefers a real environment variable
# over the .env file's value, so this reliably forces settings.SENTRY_DSN
# to "" regardless of what's configured for the real app.
os.environ["SENTRY_DSN"] = ""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# sentry_sdk is a real requirements.txt dependency (main.py imports it
# unconditionally), but this project's local venv predates it being added
# and hasn't been re-synced. Stub it only if genuinely missing — never
# shadows a real install — so the suite doesn't require a pip install just
# to run app.main. `pip install -r requirements.txt` clears the need for
# this shim entirely.
try:
    import sentry_sdk  # noqa: F401
except ImportError:
    _stub = types.ModuleType("sentry_sdk")
    _stub.init = lambda **kwargs: None
    _stub.capture_exception = lambda *a, **k: None
    _stub.capture_message = lambda *a, **k: None
    sys.modules["sentry_sdk"] = _stub


@pytest.fixture
def app() -> FastAPI:
    """The real app, routes and all — imported fresh per test so route-level
    module state (e.g. admin.py's failed-attempt counter) doesn't leak
    between tests that rely on app.main directly."""
    from app.main import app as real_app
    return real_app


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth_as():
    """
    Override the JWT auth dependency to act as a given user_id, without a
    real Supabase JWT. Usage: auth_as(app, "user-123").
    Caller is responsible for the fixture teardown being automatic — this
    clears dependency_overrides after the test via the returned cleanup.
    """
    from app.api.auth import get_current_user_id

    def _apply(app: FastAPI, user_id: str):
        app.dependency_overrides[get_current_user_id] = lambda: user_id
        return user_id

    yield _apply
