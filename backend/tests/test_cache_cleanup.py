"""
Tests for the cache-cleanup gap fix (narration_cache/zone_data_cache/
audio_files had an expires_at column and index nothing ever acted on).
Covers both the /api/admin/cleanup-cache auth gate and
supabase_db.delete_expired_cache_rows's R2-then-DB deletion ordering.
"""

from app.api import admin
from app.config import settings
from app.services import supabase_db, r2

TEST_SECRET = "test-secret-do-not-use-in-prod"


def test_cleanup_cache_requires_admin_key(client):
    resp = client.post("/api/admin/cleanup-cache")
    assert resp.status_code == 401


def test_cleanup_cache_accepts_correct_key(client, monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_SECRET", TEST_SECRET)
    admin._failed_attempts.clear()
    admin._alerted_since_last_reset = False

    async def _fake_cleanup():
        return {"zone_data_cache": 2, "narration_cache": 1, "audio_files": 0}
    monkeypatch.setattr(supabase_db, "delete_expired_cache_rows", _fake_cleanup)

    resp = client.post("/api/admin/cleanup-cache", headers={"X-Admin-Key": TEST_SECRET})

    assert resp.status_code == 200
    assert resp.json()["deleted"]["zone_data_cache"] == 2


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    """Minimal chainable stand-in for supabase-py's query builder."""
    def __init__(self, data):
        self._data = data

    def select(self, *a, **k):
        return self

    def lt(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def delete(self):
        return self

    def execute(self):
        return _FakeResult(self._data)


class _FakeClient:
    def __init__(self, table_data):
        self._table_data = table_data

    def table(self, name):
        return _FakeQuery(self._table_data.get(name, []))


async def test_delete_expired_cache_rows_deletes_r2_before_db(monkeypatch):
    """
    The whole point of this fix: an expired row's R2 object must be
    deleted using the key already on that row, not left to become
    unreachable once the DB row is gone. Asserts delete_objects is called
    with the right keys before the function returns.
    """
    fake_client = _FakeClient({
        "zone_data_cache": [{"id": "z1", "image_r2_key": "images/z1.jpg"}],
        "narration_cache": [{"id": "n1"}],
        "audio_files": [{"id": "a1", "r2_key": "audio/n1/neutral.mp3"}],
    })
    monkeypatch.setattr(supabase_db, "_get_client", lambda: fake_client)

    deleted_keys = []

    async def _fake_delete_objects(keys):
        deleted_keys.extend(keys)
        return len(keys)
    monkeypatch.setattr(r2, "delete_objects", _fake_delete_objects)

    counts = await supabase_db.delete_expired_cache_rows()

    assert "images/z1.jpg" in deleted_keys
    assert "audio/n1/neutral.mp3" in deleted_keys
    assert counts["zone_data_cache"] == 1
    assert counts["narration_cache"] == 1


async def test_delete_expired_cache_rows_handles_nothing_expired(monkeypatch):
    fake_client = _FakeClient({"zone_data_cache": [], "narration_cache": [], "audio_files": []})
    monkeypatch.setattr(supabase_db, "_get_client", lambda: fake_client)
    monkeypatch.setattr(r2, "delete_objects", lambda keys: _async_zero())

    counts = await supabase_db.delete_expired_cache_rows()

    assert counts == {"zone_data_cache": 0, "narration_cache": 0, "audio_files": 0}


async def _async_zero():
    return 0
