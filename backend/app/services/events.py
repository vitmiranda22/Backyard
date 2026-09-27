"""
Backyard Events — helpers for app/api/events.py and app/api/public_events.py.

The actual geo/time filtering happens in Postgres (see
migrations/025_events.sql's nearby_events(), called via
supabase_db.get_nearby_events()) — this module only labels which phase an
already-windowed event result is in, for the API response.

narrate.py no longer has any active-event check -- that live narration-
override system (and the active_event_at_point() SQL function backing it)
was removed in migration 028, replaced by pre-authored curated event
tours (see backend/scripts/plant_event_tours.py).
"""

import datetime


def compute_event_phase(event: dict, at: datetime.datetime = None) -> str:
    """
    'upcoming' if `at` is before the event starts, 'happening' if it's
    within the start/end window, else 'ended'.

    `active_event_at_point()` already restricts results to events within
    a fixed buffer of their start/end (so this is never called on an
    event that's wildly far in the past or future) — this just picks
    which side of the raw start_time/end_time `at` falls on, for the
    phase-specific prompt instructions in prompts.py.
    """
    if at is None:
        at = datetime.datetime.now(datetime.timezone.utc)

    start = _parse_timestamp(event["start_time"])
    end = _parse_timestamp(event["end_time"])

    if at < start:
        return "upcoming"
    if at > end:
        return "ended"
    return "happening"


def _parse_timestamp(value) -> datetime.datetime:
    """
    Supabase RPC results come back as ISO-8601 strings over the REST
    client, not native datetimes -- accept either so this also works if
    a caller already has a real datetime (e.g. in a unit test).
    """
    if isinstance(value, datetime.datetime):
        return value
    return datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
