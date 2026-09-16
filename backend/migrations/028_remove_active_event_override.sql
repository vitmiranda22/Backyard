-- =============================================================================
-- Removes the live event-narration-override system. narrate.py no longer
-- checks whether a walker's GPS point falls inside an active event's zone
-- (that ambient, premium-only, never-cached background effect is being
-- replaced by real pre-authored curated tours for the top 6 events -- see
-- backend/scripts/plant_event_tours.py). Confirmed via grep that nothing
-- else in migrations/ references this function.
-- =============================================================================
-- Idempotent -- safe to run multiple times.
-- =============================================================================

DROP FUNCTION IF EXISTS public.active_event_at_point(double precision, double precision, timestamptz, integer, integer);
