-- =============================================================================
-- Adds neighborhood/city to each explored cell, powering per-neighborhood
-- exploration counts (Map/journal). Backfilled from zone_data_cache at
-- report time -- see explored.py's report_explored_cell -- never from a
-- fresh geocode call, since reverse_geocode shares one global 1 req/sec
-- Nominatim throttle with the live narration pipeline; a per-cell-report
-- geocode call here would contend with that on every single fog reveal.
-- Nullable: a cell explored before this shipped, or one whose exact
-- geo_hash was never narrated (so zone_data_cache has no row for it yet),
-- simply has no neighborhood on file -- it still counts as explored for
-- the map, just doesn't attribute to any neighborhood's count until (if
-- ever) that same cell gets narrated and this can be backfilled.
-- =============================================================================
-- Idempotent -- safe to run multiple times.
-- =============================================================================

ALTER TABLE public.user_explored_cells ADD COLUMN IF NOT EXISTS neighborhood TEXT;
ALTER TABLE public.user_explored_cells ADD COLUMN IF NOT EXISTS city TEXT;

CREATE INDEX IF NOT EXISTS idx_user_explored_cells_user_neighborhood
    ON public.user_explored_cells(user_id, neighborhood)
    WHERE neighborhood IS NOT NULL;
