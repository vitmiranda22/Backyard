-- =============================================================================
-- Adds country to each explored cell, powering per-country exploration
-- counts (Region rollup -- Journal's new "Places" tab). Same pattern as
-- migration 031's neighborhood/city columns: backfilled from
-- zone_data_cache at report time (explored.py's report_explored_cell),
-- never a fresh geocode call -- zone_data_cache.country already exists
-- and is already populated on every row, this just copies it forward.
--
-- Deliberately count-only at this level -- no country-level boundary/
-- percentage was ever built or planned (see
-- docs/impact-reports/2026-09-28-region-rollup.md): a real country's cell
-- count is orders of magnitude larger than a city's, so a "% of country
-- explored" figure would functionally always read as ~0.00000x%, not a
-- smaller version of the city stat but a different, discouraging kind of
-- number. Nothing in region_boundaries changes for this feature.
--
-- Nullable, same reasoning as neighborhood/city: a cell explored before
-- this shipped, or one whose geo_hash was never narrated, simply has no
-- country on file yet -- still counts as explored for the map either way.
-- =============================================================================
-- Idempotent -- safe to run multiple times.
-- =============================================================================

ALTER TABLE public.user_explored_cells ADD COLUMN IF NOT EXISTS country TEXT;

CREATE INDEX IF NOT EXISTS idx_user_explored_cells_user_country
    ON public.user_explored_cells(user_id, country)
    WHERE country IS NOT NULL;
