"""
Tests for Collectible Discoveries: GET /api/discoveries, and
supabase_db.record_discovery's dedup/identity rules.
"""

import pytest
from app.services import supabase_db

USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
OTHER_USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


class _FakeResult:
    def __init__(self, data=None, count=None):
        self.data = data or []
        self.count = count


class _FakeTable:
    """
    Minimal fake of the postgrest query builder chain used by
    record_discovery/get_user_discoveries -- just enough to drive the two
    real code paths (upsert hits a fresh row vs. upsert conflicts and the
    fallback lookup runs) without a real Supabase client.
    """
    def __init__(self, store, name):
        self.store = store
        self.name = name
        self._filters = {}
        self._select = None
        self._count = None
        self._order = None
        self._limit = None
        self._pending_upsert = None

    def select(self, cols, count=None):
        self._select = cols
        self._count = count
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def upsert(self, row, on_conflict=None, ignore_duplicates=False):
        self._pending_upsert = (row, on_conflict, ignore_duplicates)
        return self

    def _do_upsert(self):
        row, on_conflict, ignore_duplicates = self._pending_upsert
        rows = self.store.setdefault(self.name, [])
        key_cols = on_conflict.split(",") if on_conflict else []
        for existing in rows:
            if all(existing.get(k) == row.get(k) for k in key_cols):
                if ignore_duplicates:
                    return _FakeResult(data=[])
                existing.update(row)
                return _FakeResult(data=[existing])
        new_row = dict(row)
        new_row.setdefault("id", f"{self.name}-{len(rows)}")
        rows.append(new_row)
        return _FakeResult(data=[new_row])

    def execute(self):
        if self._pending_upsert is not None:
            return self._do_upsert()

        rows = self.store.get(self.name, [])
        matched = [r for r in rows if all(r.get(k) == v for k, v in self._filters.items())]

        if self.name == "user_discoveries" and self._select and "discoveries(" in self._select:
            discoveries = {d["id"]: d for d in self.store.get("discoveries", [])}
            out = []
            for r in matched:
                d = discoveries.get(r["discovery_id"])
                if d:
                    out.append({"discovered_at": r["discovered_at"], "discoveries": d})
            if self._order and self._order[1]:
                out.sort(key=lambda x: x["discovered_at"], reverse=True)
            if self._limit:
                out = out[: self._limit]
            return _FakeResult(data=out)

        if self._count == "exact":
            return _FakeResult(data=matched, count=len(matched))
        return _FakeResult(data=matched)


class _FakeClient:
    def __init__(self):
        self.store = {}

    def table(self, name):
        return _FakeTable(self.store, name)


@pytest.fixture
def fake_client(monkeypatch):
    client = _FakeClient()
    monkeypatch.setattr(supabase_db, "_get_client", lambda: client)
    return client


# --- record_discovery / dedup rules ----------------------------------------

@pytest.mark.asyncio
async def test_first_narration_creates_a_discovery_and_ownership(fake_client):
    await supabase_db.record_discovery(
        USER_ID, "9q8yyk8", "time_machine", "Polk Street", "Polk Gulch", "San Francisco",
        "It's 1926. The Alhambra Theatre is about to open its doors.",
    )

    assert len(fake_client.store["discoveries"]) == 1
    assert len(fake_client.store["user_discoveries"]) == 1
    discovery = fake_client.store["discoveries"][0]
    assert discovery["geo_hash"] == "9q8yyk8"
    assert discovery["mood"] == "time_machine"
    assert discovery["teaser"].startswith("It's 1926.")


@pytest.mark.asyncio
async def test_a_repeat_visit_by_the_same_user_does_not_duplicate(fake_client):
    for _ in range(2):
        await supabase_db.record_discovery(
            USER_ID, "9q8yyk8", "time_machine", "Polk Street", "Polk Gulch", "San Francisco",
            "It's 1926. The Alhambra Theatre is about to open its doors.",
        )

    assert len(fake_client.store["discoveries"]) == 1
    assert len(fake_client.store["user_discoveries"]) == 1


@pytest.mark.asyncio
async def test_a_different_mood_at_the_same_spot_is_a_separate_discovery(fake_client):
    await supabase_db.record_discovery(
        USER_ID, "9q8yyk8", "time_machine", "Polk Street", "Polk Gulch", "San Francisco", "Story A",
    )
    await supabase_db.record_discovery(
        USER_ID, "9q8yyk8", "dark_side", "Polk Street", "Polk Gulch", "San Francisco", "Story B",
    )

    assert len(fake_client.store["discoveries"]) == 2
    assert len(fake_client.store["user_discoveries"]) == 2


@pytest.mark.asyncio
async def test_two_different_users_share_one_discovery_row_but_each_get_their_own_ownership_row(fake_client):
    await supabase_db.record_discovery(
        USER_ID, "9q8yyk8", "time_machine", "Polk Street", "Polk Gulch", "San Francisco", "Story A",
    )
    await supabase_db.record_discovery(
        OTHER_USER_ID, "9q8yyk8", "time_machine", "Polk Street", "Polk Gulch", "San Francisco", "Story A, reworded",
    )

    assert len(fake_client.store["discoveries"]) == 1
    assert len(fake_client.store["user_discoveries"]) == 2
    # First writer's teaser sticks -- never overwritten by a later variant.
    assert fake_client.store["discoveries"][0]["teaser"] == "Story A"


@pytest.mark.asyncio
async def test_teaser_is_truncated_with_an_ellipsis_when_over_the_max_length(fake_client):
    long_text = "A real narration sentence keeps going " * 10  # well over 140 chars, has spaces
    await supabase_db.record_discovery(
        USER_ID, "9q8yyk8", "time_machine", "Polk Street", "Polk Gulch", "San Francisco", long_text,
    )

    teaser = fake_client.store["discoveries"][0]["teaser"]
    body = teaser[:-1]  # strip the ellipsis
    assert teaser.endswith("…")
    assert len(teaser) <= 141
    assert long_text.strip().startswith(body)
    # Cut at a real word boundary -- the character immediately after the
    # trimmed body in the source text is a space, not mid-word.
    assert long_text.strip()[len(body):len(body) + 1] in (" ", "")


# --- _truncate_teaser (unit-level, no fake DB needed) ------------------------

def test_truncate_teaser_leaves_short_text_untouched():
    assert supabase_db._truncate_teaser("Short and sweet.", 140) == "Short and sweet."


def test_truncate_teaser_falls_back_to_a_hard_cut_with_no_word_boundary():
    # No spaces anywhere -- there's no word boundary to trim back to, so
    # the hard cut is the correct fallback, still marked with an ellipsis.
    long_text = "A" * 500
    result = supabase_db._truncate_teaser(long_text, 140)
    assert result == ("A" * 140) + "…"


@pytest.mark.asyncio
async def test_a_db_failure_never_raises(monkeypatch):
    class _BrokenClient:
        def table(self, name):
            raise Exception("connection refused")
    monkeypatch.setattr(supabase_db, "_get_client", lambda: _BrokenClient())

    await supabase_db.record_discovery(
        USER_ID, "9q8yyk8", "time_machine", "Polk Street", "Polk Gulch", "San Francisco", "text",
    )  # must not raise


# --- get_user_discoveries_count ----------------------------------------------

@pytest.mark.asyncio
async def test_get_user_discoveries_count_matches_the_real_row_count(fake_client):
    await supabase_db.record_discovery(
        USER_ID, "9q8yyk8", "time_machine", "Polk Street", "Polk Gulch", "San Francisco", "Story A",
    )
    await supabase_db.record_discovery(
        USER_ID, "9q8zn0z", "hidden_city", "Grant Avenue", "Chinatown", "San Francisco", "Story B",
    )
    await supabase_db.record_discovery(
        OTHER_USER_ID, "9q8yyk8", "time_machine", "Polk Street", "Polk Gulch", "San Francisco", "Story A",
    )

    assert await supabase_db.get_user_discoveries_count(USER_ID) == 2
    assert await supabase_db.get_user_discoveries_count(OTHER_USER_ID) == 1


@pytest.mark.asyncio
async def test_get_user_discoveries_count_is_zero_for_a_new_user(fake_client):
    assert await supabase_db.get_user_discoveries_count(USER_ID) == 0


# --- get_user_discoveries ---------------------------------------------------

@pytest.mark.asyncio
async def test_get_user_discoveries_returns_only_the_callers_own_newest_first(fake_client):
    await supabase_db.record_discovery(
        USER_ID, "9q8yyk8", "time_machine", "Polk Street", "Polk Gulch", "San Francisco", "Story A",
    )
    await supabase_db.record_discovery(
        USER_ID, "9q8zn0z", "hidden_city", "Grant Avenue", "Chinatown", "San Francisco", "Story B",
    )
    await supabase_db.record_discovery(
        OTHER_USER_ID, "9q8yyk8", "time_machine", "Polk Street", "Polk Gulch", "San Francisco", "Story A",
    )
    # Give the two of this user's rows distinct, ordered timestamps.
    rows = fake_client.store["user_discoveries"]
    rows[0]["discovered_at"] = "2026-09-01T00:00:00+00:00"
    rows[1]["discovered_at"] = "2026-09-02T00:00:00+00:00"

    rows, total_count = await supabase_db.get_user_discoveries(USER_ID)

    assert total_count == 2
    assert [r["geo_hash"] for r in rows] == ["9q8zn0z", "9q8yyk8"]


@pytest.mark.asyncio
async def test_get_user_discoveries_returns_empty_for_a_new_user(fake_client):
    rows, total_count = await supabase_db.get_user_discoveries(USER_ID)
    assert rows == []
    assert total_count == 0


# --- GET /api/discoveries ----------------------------------------------------

def test_list_discoveries_endpoint_returns_the_callers_collection(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_user_discoveries", _async((
        [{
            "id": "d1", "geo_hash": "9q8yyk8", "mood": "time_machine",
            "street_name": "Polk Street", "neighborhood": "Polk Gulch", "city": "San Francisco",
            "teaser": "It's 1926...", "discovered_at": "2026-09-14T12:00:00+00:00",
        }],
        1,
    )))

    resp = client.get("/api/discoveries")

    assert resp.status_code == 200
    body = resp.json()
    assert body["total_count"] == 1
    assert body["discoveries"][0]["geo_hash"] == "9q8yyk8"
    assert body["discoveries"][0]["mood"] == "time_machine"


def test_list_discoveries_endpoint_returns_an_empty_collection_for_a_new_user(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_user_discoveries", _async(([], 0)))

    resp = client.get("/api/discoveries")

    assert resp.status_code == 200
    assert resp.json() == {"discoveries": [], "total_count": 0}


# --- GET /api/discoveries/count ----------------------------------------------

def test_count_endpoint_returns_just_the_number(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_user_discoveries_count", _async(42))

    resp = client.get("/api/discoveries/count")

    assert resp.status_code == 200
    assert resp.json() == {"total_count": 42}


def test_count_endpoint_does_not_call_the_full_list_query(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_user_discoveries_count", _async(3))

    called = []
    async def _track(*args, **kwargs):
        called.append(args)
        return [], 0
    monkeypatch.setattr(supabase_db, "get_user_discoveries", _track)

    resp = client.get("/api/discoveries/count")

    assert resp.status_code == 200
    assert called == []  # the count endpoint never touches the full-list query
