"""
Tests for admin_stats.get_dashboard_stats()'s aggregation math — pure
Python over fixture data, no real Supabase/R2 involved. This is exactly the
kind of logic that's easy to get subtly wrong (a real bug here during
development: count_rows assumed every table had an "id" column, which
voice_samples doesn't — caught by manual testing that time, pinned here so
it can't regress silently).
"""

from app.services import admin_stats, supabase_db, r2, revenuecat_service

FAKE_USERS = [
    {"id": "u1", "is_premium": True, "created_at": "2026-07-01T00:00:00+00:00"},
    {"id": "u2", "is_premium": False, "created_at": "2026-07-10T00:00:00+00:00"},
    {"id": "u3", "is_premium": False, "created_at": "2020-01-01T00:00:00+00:00"},
]

FAKE_TOURS = [
    {"id": "t1", "mood": "time_machine", "tour_type": "walking", "city": "San Francisco",
     "is_public": True, "blocks_visited": 5, "total_distance_m": 1000,
     "avg_rating": 4.0, "rating_count": 2, "created_at": "2026-07-14T00:00:00+00:00"},
    {"id": "t2", "mood": "time_machine", "tour_type": "walking", "city": "San Francisco",
     "is_public": False, "blocks_visited": 3, "total_distance_m": 500,
     "avg_rating": 0, "rating_count": 0, "created_at": "2020-01-01T00:00:00+00:00"},
    {"id": "t3", "mood": "dark_side", "tour_type": "walking", "city": "Oakland",
     "is_public": True, "blocks_visited": 4, "total_distance_m": 800,
     "avg_rating": 5.0, "rating_count": 1, "created_at": "2026-07-14T00:00:00+00:00"},
]

FAKE_BLOCKS = [
    {"neighborhood": "Mission", "street_name": "24th Street"},
    {"neighborhood": "Mission", "street_name": "Valencia Street"},
    {"neighborhood": "Richmond", "street_name": None},
]


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


async def test_dashboard_stats_aggregation(monkeypatch):
    monkeypatch.setattr(supabase_db, "get_all_users_summary", _async(FAKE_USERS))
    monkeypatch.setattr(supabase_db, "get_all_tours_summary", _async(FAKE_TOURS))
    monkeypatch.setattr(supabase_db, "get_all_tour_blocks_places", _async(FAKE_BLOCKS))
    monkeypatch.setattr(supabase_db, "count_comments", _async(7))
    monkeypatch.setattr(supabase_db, "count_likes", _async(3))
    monkeypatch.setattr(supabase_db, "count_rows", _async(10))
    monkeypatch.setattr(r2, "get_bucket_usage", _async({"total_objects": 5, "total_mb": 1.0, "by_prefix": {}}))
    monkeypatch.setattr(revenuecat_service, "get_overview_metrics", _async({"configured": False}))

    stats = await admin_stats.get_dashboard_stats()

    assert stats["users"]["total"] == 3
    assert stats["users"]["premium"] == 1
    assert stats["users"]["free"] == 2
    assert stats["users"]["premium_conversion_pct"] == round(100 / 3, 1)

    assert stats["tours"]["total"] == 3
    assert stats["tours"]["by_mood"] == {"time_machine": 2, "dark_side": 1}
    assert stats["tours"]["total_distance_km"] == 2.3  # (1000+500+800)/1000
    assert stats["tours"]["public_pct"] == round(100 * 2 / 3, 1)

    # weighted avg: (4.0*2 + 5.0*1) / 3 = 4.33
    assert stats["engagement"]["avg_rating"] == round((4.0 * 2 + 5.0 * 1) / 3, 2)
    assert stats["engagement"]["total_ratings"] == 3
    assert stats["engagement"]["total_comments"] == 7
    assert stats["engagement"]["total_likes"] == 3

    assert stats["top_cities"][0] == {"name": "San Francisco", "count": 2}
    assert {"name": "Mission", "count": 2} in stats["top_neighborhoods"]
    # None values must never surface as a fake "place"
    assert all(s["name"] is not None for s in stats["top_streets"])


async def test_dashboard_stats_handles_empty_data(monkeypatch):
    monkeypatch.setattr(supabase_db, "get_all_users_summary", _async([]))
    monkeypatch.setattr(supabase_db, "get_all_tours_summary", _async([]))
    monkeypatch.setattr(supabase_db, "get_all_tour_blocks_places", _async([]))
    monkeypatch.setattr(supabase_db, "count_comments", _async(0))
    monkeypatch.setattr(supabase_db, "count_likes", _async(0))
    monkeypatch.setattr(supabase_db, "count_rows", _async(0))
    monkeypatch.setattr(r2, "get_bucket_usage", _async({"total_objects": None, "total_mb": None, "by_prefix": {}}))
    monkeypatch.setattr(revenuecat_service, "get_overview_metrics", _async({"configured": False}))

    stats = await admin_stats.get_dashboard_stats()

    # Division-by-zero guards — a fresh/empty DB must never 500 the dashboard.
    assert stats["users"]["premium_conversion_pct"] == 0
    assert stats["tours"]["public_pct"] == 0
    assert stats["engagement"]["avg_rating"] is None
    assert stats["top_cities"] == []
    assert stats["content_integrity_issues"] == []


# --- content_integrity_issues --------------------------------------------------
# Regression coverage for a real incident: an offline seeding script
# published tours whose blocks_visited claimed more stops than actually
# got saved (in one case, 4 tours claiming 12 stops each with ZERO real
# blocks). blocks_visited is meant to always equal the tour's real
# tour_blocks row count — this flags it on the dashboard whenever it
# doesn't, instead of requiring another manual DB investigation.

INTEGRITY_TOURS = [
    {"id": "broken-1", "title": "SoHo Afternoon", "mood": "time_machine", "tour_type": "walking",
     "city": "New York", "is_public": True, "blocks_visited": 12, "total_distance_m": 0,
     "avg_rating": 0, "rating_count": 0, "created_at": "2026-08-01T00:00:00+00:00"},
    {"id": "broken-2-unpublished", "title": "Already Hidden", "mood": "time_machine", "tour_type": "walking",
     "city": "New York", "is_public": False, "blocks_visited": 12, "total_distance_m": 0,
     "avg_rating": 0, "rating_count": 0, "created_at": "2026-08-01T00:00:00+00:00"},
    {"id": "healthy-1", "title": "Mission Murals", "mood": "time_machine", "tour_type": "walking",
     "city": "San Francisco", "is_public": True, "blocks_visited": 3, "total_distance_m": 500,
     "avg_rating": 0, "rating_count": 0, "created_at": "2026-08-01T00:00:00+00:00"},
]

INTEGRITY_BLOCKS = [
    # broken-1 and broken-2-unpublished: zero real blocks despite claiming 12.
    # healthy-1: exactly matches its claimed count of 3.
    {"tour_id": "healthy-1", "neighborhood": "Mission", "street_name": "24th Street"},
    {"tour_id": "healthy-1", "neighborhood": "Mission", "street_name": "Valencia Street"},
    {"tour_id": "healthy-1", "neighborhood": "Mission", "street_name": "Dolores Street"},
]


async def _stats_with(tours, blocks, monkeypatch):
    monkeypatch.setattr(supabase_db, "get_all_users_summary", _async([]))
    monkeypatch.setattr(supabase_db, "get_all_tours_summary", _async(tours))
    monkeypatch.setattr(supabase_db, "get_all_tour_blocks_places", _async(blocks))
    monkeypatch.setattr(supabase_db, "count_comments", _async(0))
    monkeypatch.setattr(supabase_db, "count_likes", _async(0))
    monkeypatch.setattr(supabase_db, "count_rows", _async(0))
    monkeypatch.setattr(r2, "get_bucket_usage", _async({"total_objects": 0, "total_mb": 0, "by_prefix": {}}))
    monkeypatch.setattr(revenuecat_service, "get_overview_metrics", _async({"configured": False}))
    return await admin_stats.get_dashboard_stats()


async def test_flags_tours_whose_claimed_blocks_exceed_what_was_actually_saved(monkeypatch):
    stats = await _stats_with(INTEGRITY_TOURS, INTEGRITY_BLOCKS, monkeypatch)

    issue_ids = {issue["tour_id"] for issue in stats["content_integrity_issues"]}
    assert issue_ids == {"broken-1", "broken-2-unpublished"}
    assert "healthy-1" not in issue_ids


async def test_content_integrity_issue_reports_claimed_vs_real_and_visibility(monkeypatch):
    stats = await _stats_with(INTEGRITY_TOURS, INTEGRITY_BLOCKS, monkeypatch)

    by_id = {issue["tour_id"]: issue for issue in stats["content_integrity_issues"]}
    assert by_id["broken-1"]["title"] == "SoHo Afternoon"
    assert by_id["broken-1"]["blocks_claimed"] == 12
    assert by_id["broken-1"]["blocks_real"] == 0
    assert by_id["broken-1"]["is_public"] is True
    # Already unpublished (e.g. by a prior fix) still shows up -- worth
    # keeping visible on the dashboard rather than silently dropping it
    # once it's no longer live, so it isn't rediscovered from scratch.
    assert by_id["broken-2-unpublished"]["is_public"] is False


async def test_a_tour_with_more_real_blocks_than_claimed_is_not_flagged(monkeypatch):
    # Only over-claiming is a bug; under-claiming (blocks_visited lower
    # than the real count) isn't the failure mode this guards against and
    # must never false-positive.
    tours = [{"id": "t1", "title": "Extra Blocks", "mood": "time_machine", "tour_type": "walking",
              "city": "SF", "is_public": True, "blocks_visited": 1, "total_distance_m": 0,
              "avg_rating": 0, "rating_count": 0, "created_at": "2026-08-01T00:00:00+00:00"}]
    blocks = [
        {"tour_id": "t1", "neighborhood": "Mission", "street_name": "24th Street"},
        {"tour_id": "t1", "neighborhood": "Mission", "street_name": "Valencia Street"},
    ]

    stats = await _stats_with(tours, blocks, monkeypatch)

    assert stats["content_integrity_issues"] == []
