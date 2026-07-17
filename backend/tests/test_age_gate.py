"""
Direct tests for supabase_db.is_user_underage's date math -- the endpoint
tests (test_narrate_block.py, test_start_tour_rate_limit.py) mock this
function outright to check the *enforcement*, not the arithmetic itself.
Exercises the real birthday-boundary logic and the fail-closed defaults.
"""

from datetime import date, timedelta
from types import SimpleNamespace

from app.services import supabase_db


class _FakeQuery:
    def __init__(self, row):
        self._row = row

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=[self._row] if self._row else [])


class _FakeClient:
    def __init__(self, row):
        self._row = row

    def table(self, name):
        return _FakeQuery(self._row)


def _mock_dob(monkeypatch, dob_iso):
    monkeypatch.setattr(
        supabase_db, "_get_client",
        lambda: _FakeClient({"date_of_birth": dob_iso} if dob_iso is not None else {}),
    )


async def test_someone_who_turned_18_today_is_not_underage(monkeypatch):
    dob = date.today().replace(year=date.today().year - 18)
    _mock_dob(monkeypatch, dob.isoformat())

    assert await supabase_db.is_user_underage("user-1") is False


async def test_someone_who_turns_18_tomorrow_is_still_underage(monkeypatch):
    turns_18_tomorrow = date.today() + timedelta(days=1)
    dob = turns_18_tomorrow.replace(year=turns_18_tomorrow.year - 18)
    _mock_dob(monkeypatch, dob.isoformat())

    assert await supabase_db.is_user_underage("user-1") is True


async def test_clearly_adult_dob_is_not_underage(monkeypatch):
    _mock_dob(monkeypatch, "1980-01-01")

    assert await supabase_db.is_user_underage("user-1") is False


async def test_clearly_minor_dob_is_underage(monkeypatch):
    ten_years_ago = date.today().replace(year=date.today().year - 10)
    _mock_dob(monkeypatch, ten_years_ago.isoformat())

    assert await supabase_db.is_user_underage("user-1") is True


async def test_missing_date_of_birth_fails_closed_to_underage(monkeypatch):
    # An account created before this field existed, or one that just never
    # got a value -- unknown age must not be trusted with mature content.
    _mock_dob(monkeypatch, None)

    assert await supabase_db.is_user_underage("user-1") is True


async def test_lookup_error_fails_closed_to_underage(monkeypatch):
    def _raise():
        raise Exception("connection refused")
    monkeypatch.setattr(supabase_db, "_get_client", _raise)

    assert await supabase_db.is_user_underage("user-1") is True


async def test_custom_min_age_is_respected(monkeypatch):
    seventeen_years_ago = date.today().replace(year=date.today().year - 17)
    _mock_dob(monkeypatch, seventeen_years_ago.isoformat())

    assert await supabase_db.is_user_underage("user-1", min_age=17) is False
    assert await supabase_db.is_user_underage("user-1", min_age=18) is True
