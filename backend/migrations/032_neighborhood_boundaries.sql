-- =============================================================================
-- Real (or best-effort AI-derived) neighborhood boundary polygons, powering
-- a genuine "% of this neighborhood explored" wherever a boundary exists --
-- see backend/scripts/map_neighborhood_boundaries.py, the offline script
-- that populates this table. Never written to from a live request path;
-- report_explored_cell only ever reads user_explored_cells/zone_data_cache.
--
-- total_cells is precomputed by the mapping script (a count of geohash-7
-- cells whose center falls inside boundary_polygon), not computed live --
-- the read path (GET /explored-cells/neighborhoods) is a single row lookup
-- plus one division, never live polygon math.
--
-- source='ai_derived' rows are lower-confidence than source='osm' ones --
-- see the mapping script's own docstring for why (extracting a boundary
-- from a natural-language description is a real, imperfect process) --
-- source_url lets anyone trace exactly which real source an AI-derived
-- boundary came from.
-- =============================================================================
-- Idempotent -- safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.neighborhood_boundaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    neighborhood TEXT NOT NULL,
    city TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('osm', 'ai_derived')),
    source_url TEXT,
    boundary_polygon JSONB NOT NULL,
    total_cells INT NOT NULL CHECK (total_cells > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (neighborhood, city)
);

-- Public read data (like unesco_heritage or any other reference dataset),
-- not user-generated -- no RLS needed, this table has no user_id column
-- and nothing in it is sensitive. Written only by the offline mapping
-- script via the service-role key, same as zone_data_cache.
