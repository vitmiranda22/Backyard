-- =============================================================================
-- Backyard Database Migration — v1.3
-- =============================================================================
-- Adds a cached street-level photo per zone, so the narration UI can show a
-- picture of the spot being discussed alongside the text/audio.
--
-- image_r2_key on zone_data_cache: one photo per geohash, mood-agnostic,
-- shared across every user/tour that ever visits that cell — same caching
-- model as raw_data on the same table. See backend/app/api/narrate.py and
-- backend/app/services/streetview.py.
--
-- image_r2_key on tour_blocks: a copy of the cache pointer at save-block
-- time, mirroring how audio_r2_key already works on this table, so Replay
-- and the tour detail/log view can re-sign it later without recomputing.
--
-- Run this in the Supabase SQL Editor after 003_narrative_continuity.sql.
-- This migration is idempotent — safe to run multiple times.
-- =============================================================================

ALTER TABLE public.zone_data_cache ADD COLUMN IF NOT EXISTS image_r2_key TEXT;
ALTER TABLE public.tour_blocks ADD COLUMN IF NOT EXISTS image_r2_key TEXT;
