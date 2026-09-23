-- =============================================================================
-- Replaces migration 032's neighborhood_boundaries (kept in place, unused --
-- dropping a live table is heavier than leaving one empty behind; it had 0
-- rows anyway since the neighborhood-boundary pilot never succeeded).
--
-- region_boundaries is deliberately generic on region_type rather than
-- hard-coded to "city" -- see backend/scripts/map_region_boundaries.py's
-- own docstring. City-level (region_type='city') is the only kind mapped
-- today; borough/district-level real OSM boundaries (confirmed live to
-- exist for at least some cities -- NYC's "Manhattan" is its own real
-- admin_level=7 polygon) are a natural later addition to the same table,
-- not a schema change.
--
-- boundary_polygon is a list of RINGS (each a list of {lat,lng} points),
-- not a single ring -- a real administrative boundary can be disjoint
-- (confirmed live: San Francisco's official boundary includes a separate
-- ring for the Farallon Islands, ~30mi offshore). total_cells is
-- precomputed by the mapping script (never live) across all rings.
--
-- source is constrained to 'osm' only -- unlike the old neighborhood
-- table, no AI-derived fallback exists at this level; real administrative
-- boundaries are reliably present in OSM, confirmed live for San
-- Francisco, Chicago, Los Angeles, and New York.
-- =============================================================================
-- Idempotent -- safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.region_boundaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_name TEXT NOT NULL,
    city TEXT NOT NULL,
    region_type TEXT NOT NULL CHECK (region_type IN ('city', 'borough', 'district')),
    source TEXT NOT NULL CHECK (source IN ('osm')),
    osm_admin_level TEXT,
    boundary_polygon JSONB NOT NULL,
    total_cells INT NOT NULL CHECK (total_cells > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (region_name, city, region_type)
);

-- Public read data (like unesco_heritage or any other reference dataset),
-- not user-generated -- no RLS needed. Written only by the offline
-- mapping script via the service-role key, same as zone_data_cache.
