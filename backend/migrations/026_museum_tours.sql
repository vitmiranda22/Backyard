-- =============================================================================
-- MUSEUM TOURS -- widen tours.tour_type to allow 'museum' alongside the
-- existing 'walking'/'virtual' values. A museum tour is a fixed,
-- pre-written, manually-advanced (trigger_type='manual', already a valid
-- tour_blocks value -- see 001_initial_schema.sql) tour of a museum's
-- permanent collection, authored offline by scripts/plant_museum_tours.py
-- rather than generated live from GPS. No other schema change is needed:
-- mood/trigger_type already support what this feature needs, and
-- nearby_tours() already filters on any tour_type_filter string with no
-- enum check on the SQL side.
-- =============================================================================
-- Idempotent -- safe to run multiple times. Follows the same DROP/ADD
-- CONSTRAINT pattern as 002_mood_rename_and_block_city.sql.
-- =============================================================================

ALTER TABLE public.tours DROP CONSTRAINT IF EXISTS tours_tour_type_check;
ALTER TABLE public.tours ADD CONSTRAINT tours_tour_type_check
    CHECK (tour_type IN ('walking', 'virtual', 'museum'));
