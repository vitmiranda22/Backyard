-- =============================================================================
-- Backyard Database Migration — v1.5 (finer zone-photo cache)
-- =============================================================================
-- Splits the cached Street View photo off from zone_data_cache into its own
-- table, keyed at a MUCH finer geohash precision than zone_data_cache's own
-- geo_hash (precision 7, ~153m x 153m).
--
-- Real incident this fixes: zone_data_cache.image_r2_key was shared by
-- EVERY address inside the same ~153m cell -- fine for narration text (a
-- story about "this block" reads fine across 150m), but wrong for a photo,
-- which is viewpoint-specific. Confirmed live: 1723 Polk Street and 1732
-- Polk Street (two different, nearby addresses, ~50m apart, same geohash
-- cell) served the exact same cached photo, taken from the OTHER address's
-- viewpoint a month earlier. A walker standing at 1723 saw a picture of a
-- completely different building.
--
-- zone_photos is keyed at precision 8 (~19m x 19m) instead -- tight enough
-- that two addresses on the same block essentially never share a cell,
-- while still caching (and reusing R2/Street View cost) for anyone who
-- revisits the exact same few-meter spot.
--
-- zone_data_cache.image_r2_key is left in place but deprecated -- the
-- application no longer reads or writes it after this migration ships.
-- Not dropped: dropping a column on a live table is a heavier, harder-to-
-- undo operation than leaving an unused one behind, and the existing
-- values are keyed at the old (imprecise) precision anyway, so there's
-- nothing worth migrating out of it.
--
-- Run this in the Supabase SQL Editor after 029_user_explored_cells.sql.
-- This migration is idempotent — safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.zone_photos (
    geo_hash TEXT PRIMARY KEY,  -- precision 8 (~19m x 19m) -- NOT the same precision as zone_data_cache.geo_hash
    image_r2_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

ALTER TABLE public.zone_photos ENABLE ROW LEVEL SECURITY;
-- No policies — this table is only ever touched by the backend's
-- service-role key, same as zone_data_cache/narration_cache/audio_files.
