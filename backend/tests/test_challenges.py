"""
Tests for Challenges: the rotation formula, progress computation, the
completion-recording side effect, and GET /api/challenges.
"""

from datetime import datetime, timedelta, timezone

import pytest
from app.services import challenges, supabase_db

USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


# --- rotation / calendar helpers (pure functions, no DB) ---------------------

def test_active_template_is_deterministic_for_a_given_week():
    at = datetime(2026, 9, 28, 12, 0, tzinfo=timezone.utc)  # a Monday
    assert challenges.get_active_template(at) == challenges.get_active_template(at)


def test_active_template_wraps_around_the_pool_size():
    # Two dates exactly len(TEMPLATES) ISO weeks apart must land on the
    # same template -- proves the modulo wraps, not just "picks index 0
    # by coincidence." Safely mid-year so the ISO week number advances by
    # exactly pool_size with no year-boundary edge case.
    pool_size = len(challenges.TEMPLATES)
    week1 = datetime(2026, 6, 1, tzinfo=timezone.utc)
    week2 = week1 + timedelta(weeks=pool_size)
    assert challenges.get_active_template(week1) == challenges.get_active_template(week2)


def test_week_key_format():
    at = datetime(2026, 9, 28, 12, 0, tzinfo=timezone.utc)
    key = challenges.get_week_key(at)
    assert key.startswith("2026-W")


def test_week_start_is_monday_midnight():
    # A Thursday -- week start must be the Monday of the same ISO week.
    thursday = datetime(2026, 10, 1, 15, 30, tzinfo=timezone.utc)
    start = challenges.get_week_start(thursday)
    assert start.isoweekday() == 1
    assert (start.hour, start.minute, start.second, start.microsecond) == (0, 0, 0, 0)
    assert start.date().isocalendar()[:2] == thursday.date().isocalendar()[:2]


# --- km progress rounding (the one non-trivial unit conversion) -------------

@pytest.mark.asyncio
async def test_km_progress_floors_without_a_false_complete(monkeypatch):
    # 4999m is genuinely short of a 5km goal -- flooring to km must never
    # show (or count) this as complete.
    monkeypatch.setattr(supabase_db, "get_weekly_distance_sum", _async(4999.0))
    progress = await challenges._km_progress(USER_ID, "2026-09-21T00:00:00+00:00")
    assert progress == 4
    assert progress < 5  # goal_count for weekly_km


@pytest.mark.asyncio
async def test_km_progress_counts_complete_at_exactly_the_goal(monkeypatch):
    monkeypatch.setattr(supabase_db, "get_weekly_distance_sum", _async(5000.0))
    progress = await challenges._km_progress(USER_ID, "2026-09-21T00:00:00+00:00")
    assert progress == 5


# --- get_challenge_progress orchestration ------------------------------------

@pytest.mark.asyncio
async def test_progress_below_goal_does_not_record_a_completion(monkeypatch):
    monkeypatch.setattr(challenges, "get_active_template", lambda at=None: {
        "id": "weekly_blocks", "goal_count": 5, "compute_progress": _async(3),
    })
    recorded = []
    async def _record(user_id, challenge_id, week_key):
        recorded.append((user_id, challenge_id, week_key))
        return True
    monkeypatch.setattr(supabase_db, "record_challenge_completion", _record)
    monkeypatch.setattr(supabase_db, "get_challenge_completion_count", _async(2))

    result = await challenges.get_challenge_progress(USER_ID)

    assert result["progress"] == 3
    assert result["is_complete"] is False
    assert recorded == []
    assert result["total_completed"] == 2


@pytest.mark.asyncio
async def test_progress_at_goal_records_a_completion(monkeypatch):
    monkeypatch.setattr(challenges, "get_active_template", lambda at=None: {
        "id": "weekly_blocks", "goal_count": 5, "compute_progress": _async(5),
    })
    recorded = []
    async def _record(user_id, challenge_id, week_key):
        recorded.append((user_id, challenge_id, week_key))
        return True
    monkeypatch.setattr(supabase_db, "record_challenge_completion", _record)
    monkeypatch.setattr(supabase_db, "get_challenge_completion_count", _async(3))

    result = await challenges.get_challenge_progress(USER_ID)

    assert result["is_complete"] is True
    assert len(recorded) == 1
    assert recorded[0][0] == USER_ID
    assert recorded[0][1] == "weekly_blocks"
    assert result["total_completed"] == 3


@pytest.mark.asyncio
async def test_progress_past_the_goal_is_still_complete(monkeypatch):
    monkeypatch.setattr(challenges, "get_active_template", lambda at=None: {
        "id": "weekly_discoveries", "goal_count": 3, "compute_progress": _async(7),
    })
    monkeypatch.setattr(supabase_db, "record_challenge_completion", _async(True))
    monkeypatch.setattr(supabase_db, "get_challenge_completion_count", _async(1))

    result = await challenges.get_challenge_progress(USER_ID)

    assert result["progress"] == 7
    assert result["is_complete"] is True


# --- record_challenge_completion idempotency (real upsert semantics) --------

class _FakeResult:
    def __init__(self, data=None, count=None):
        self.data = data or []
        self.count = count


class _FakeTable:
    def __init__(self, store, name):
        self.store = store
        self.name = name
        self._filters = {}
        self._count = None
        self._pending_upsert = None

    def select(self, cols, count=None):
        self._count = count
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def upsert(self, row, on_conflict=None, ignore_duplicates=False):
        self._pending_upsert = (row, on_conflict, ignore_duplicates)
        return self

    def execute(self):
        if self._pending_upsert is not None:
            row, on_conflict, ignore_duplicates = self._pending_upsert
            rows = self.store.setdefault(self.name, [])
            key_cols = on_conflict.split(",") if on_conflict else []
            for existing in rows:
                if all(existing.get(k) == row.get(k) for k in key_cols):
                    if ignore_duplicates:
                        return _FakeResult(data=[])
                    existing.update(row)
                    return _FakeResult(data=[existing])
            rows.append(dict(row))
            return _FakeResult(data=[row])

        rows = self.store.get(self.name, [])
        matched = [r for r in rows if all(r.get(k) == v for k, v in self._filters.items())]
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


@pytest.mark.asyncio
async def test_record_challenge_completion_is_idempotent_for_the_same_week(fake_client):
    for _ in range(3):
        await supabase_db.record_challenge_completion(USER_ID, "weekly_blocks", "2026-W40")

    assert len(fake_client.store["user_challenge_completions"]) == 1


@pytest.mark.asyncio
async def test_a_different_week_is_a_separate_completion(fake_client):
    await supabase_db.record_challenge_completion(USER_ID, "weekly_blocks", "2026-W40")
    await supabase_db.record_challenge_completion(USER_ID, "weekly_km", "2026-W41")

    assert len(fake_client.store["user_challenge_completions"]) == 2


@pytest.mark.asyncio
async def test_get_challenge_completion_count_matches_real_rows(fake_client):
    await supabase_db.record_challenge_completion(USER_ID, "weekly_blocks", "2026-W40")
    await supabase_db.record_challenge_completion(USER_ID, "weekly_km", "2026-W41")

    assert await supabase_db.get_challenge_completion_count(USER_ID) == 2


# --- GET /api/challenges ------------------------------------------------------

def test_challenge_endpoint_returns_the_expected_shape(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(challenges, "get_challenge_progress", _async({
        "challenge_id": "weekly_blocks", "goal_count": 5, "progress": 3,
        "is_complete": False, "total_completed": 2,
    }))

    resp = client.get("/api/challenges")

    assert resp.status_code == 200
    assert resp.json() == {
        "challenge_id": "weekly_blocks", "goal_count": 5, "progress": 3,
        "is_complete": False, "total_completed": 2,
    }


def test_challenge_endpoint_requires_auth(client):
    resp = client.get("/api/challenges")
    assert resp.status_code == 401
