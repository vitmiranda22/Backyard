-- =============================================================================
-- Backyard Database Migration — v1.2
-- =============================================================================
-- Adds cross-block narrative continuity within a tour.
--
-- Each tour now carries a short rolling summary of what's been narrated so
-- far. /narrate-block reads it to write a transition into the next block and
-- writes back an updated summary — see backend/app/api/narrate.py. NULL means
-- "no predecessor block yet" (a brand new tour), so no backfill is needed.
--
-- Run this in the Supabase SQL Editor after 002_mood_rename_and_block_city.sql.
-- This migration is idempotent — safe to run multiple times.
-- =============================================================================

ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS narrative_summary TEXT;
