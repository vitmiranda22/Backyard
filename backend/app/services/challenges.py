"""
Challenges -- a rotating weekly goal (Week 1 idea #23).

Which challenge is active any given week needs no stored state at all: it's
a pure function of the calendar (TEMPLATES[iso_week_number % len(TEMPLATES)]),
so any past or future week's active challenge is always reconstructable.
Progress is a live, time-windowed query against data that already exists
and is already timestamped (user_explored_cells, tours, user_discoveries)
-- the raw queries live in supabase_db.py per this codebase's own
convention (this module orchestrates, supabase_db.py executes).

The one thing that genuinely needs persistence is a permanent record that
a user actually completed a challenge -- see migrations/036_challenge_completions.sql
and supabase_db.record_challenge_completion.

All three v1 templates share the same (weekly) window deliberately -- a
monthly-window challenge rotating on a weekly cadence would create a real
mismatch (does its window reset with the rotation, or on its own monthly
clock?) not worth solving for v1.
"""

from datetime import datetime, timezone, timedelta

from app.services import supabase_db


def get_week_start(at: datetime = None) -> datetime:
    """Monday 00:00 UTC of the ISO week containing `at` (defaults to now)."""
    at = at or datetime.now(timezone.utc)
    iso_year, iso_week, iso_weekday = at.isocalendar()
    monday = at - timedelta(days=iso_weekday - 1)
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def get_week_key(at: datetime = None) -> str:
    """A stable identifier for the ISO week containing `at`, e.g. '2026-W40'."""
    at = at or datetime.now(timezone.utc)
    iso_year, iso_week, _ = at.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"


async def _blocks_progress(user_id: str, week_start_iso: str) -> int:
    return await supabase_db.get_weekly_explored_cell_count(user_id, week_start_iso)


async def _km_progress(user_id: str, week_start_iso: str) -> int:
    meters = await supabase_db.get_weekly_distance_sum(user_id, week_start_iso)
    # floor(meters / 1000) >= goal_count is exactly equivalent to
    # meters >= goal_count * 1000 for a non-negative real and integer goal
    # -- flooring here for display never creates a false complete/incomplete.
    return int(meters // 1000)


async def _discoveries_progress(user_id: str, week_start_iso: str) -> int:
    return await supabase_db.get_weekly_discovery_count(user_id, week_start_iso)


# Ordered so TEMPLATES[iso_week_number % len(TEMPLATES)] is the active
# challenge for any given week -- adding a new challenge is a one-line
# addition here, same shape as mobile's own BADGE_DEFS.
TEMPLATES = [
    {"id": "weekly_blocks", "goal_count": 5, "compute_progress": _blocks_progress},
    {"id": "weekly_km", "goal_count": 5, "compute_progress": _km_progress},
    {"id": "weekly_discoveries", "goal_count": 3, "compute_progress": _discoveries_progress},
]


def get_active_template(at: datetime = None) -> dict:
    at = at or datetime.now(timezone.utc)
    _, iso_week, _ = at.isocalendar()
    return TEMPLATES[iso_week % len(TEMPLATES)]


async def get_challenge_progress(user_id: str) -> dict:
    """
    This week's active challenge, this user's progress toward it, and
    their all-time completed count. Records a completion as a side effect
    if progress just reached the goal (idempotent -- see
    supabase_db.record_challenge_completion).
    """
    now = datetime.now(timezone.utc)
    template = get_active_template(now)
    week_start_iso = get_week_start(now).isoformat()

    progress = await template["compute_progress"](user_id, week_start_iso)
    goal_count = template["goal_count"]
    is_complete = progress >= goal_count

    if is_complete:
        await supabase_db.record_challenge_completion(user_id, template["id"], get_week_key(now))

    total_completed = await supabase_db.get_challenge_completion_count(user_id)

    return {
        "challenge_id": template["id"],
        "goal_count": goal_count,
        "progress": progress,
        "is_complete": is_complete,
        "total_completed": total_completed,
    }
