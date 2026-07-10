-- =============================================================================
-- Backyard Database Migration — v1.8
-- =============================================================================
-- Stores the actual dense GPS trace walked during a tour, separate from
-- tour_blocks (which only has a point per narration trigger, often 50-100m+
-- apart — connecting those with straight lines cuts through buildings
-- whenever the street curves). A simple JSONB array of {lat, lng} points is
-- enough here; unlike `tours.location` this never needs spatial querying,
-- just to be read back and drawn as a polyline.
--
-- Run this in the Supabase SQL Editor after 008_social_and_voices.sql.
-- Idempotent — safe to run multiple times.
-- =============================================================================

ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS path_points JSONB;
