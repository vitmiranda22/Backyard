-- =============================================================================
-- Drops 3 tables confirmed dead by direct code search (not just an old audit's
-- say-so) on 2026-10-01: zero live queries against any of them anywhere in
-- app/, re-verified with `grep -rl 'table("<name>")' app/` before writing
-- this migration, not assumed from a prior report.
--
-- neighborhood_boundaries (032_neighborhood_boundaries.sql): its own
--   docstring says it's populated by backend/scripts/map_neighborhood_
--   boundaries.py, which no longer exists in the repo (only an orphaned
--   compiled .pyc remains) -- superseded by region_boundaries
--   (033_region_boundaries.sql) + map_region_boundaries.py, which is what
--   the shipped "Cities explored" feature actually reads from.
--
-- virtual_cities (001_initial_schema.sql): no code anywhere ever queried
--   this table. Never wired to a real endpoint.
--
-- tour_shares (001_initial_schema.sql): no code anywhere ever queried this
--   table either -- the only mention in app/ is a comment in
--   delete_user_account() documenting that it WOULD cascade-delete if rows
--   existed, not evidence of real usage. A deep-link-sharing feature that
--   was never actually built.
--
-- Safe to run multiple times (IF EXISTS). No other table has a foreign key
-- pointing at any of these three (confirmed via grep for "REFERENCES
-- tour_shares/virtual_cities/neighborhood_boundaries" across every
-- migration), so no CASCADE is needed to avoid an unexpected side effect.
-- =============================================================================

DROP TABLE IF EXISTS public.neighborhood_boundaries;
DROP TABLE IF EXISTS public.tour_shares;
DROP TABLE IF EXISTS public.virtual_cities;
