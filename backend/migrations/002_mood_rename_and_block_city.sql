-- =============================================================================
-- Backyard Database Migration — v1.1
-- =============================================================================
-- Fixes two issues introduced when the mood taxonomy was redesigned:
--
-- 1. tours.mood, tour_blocks.mood, and narration_cache.mood still enforced
--    the OLD mood set ('informative', 'haunted', 'celebrity', 'curiosities').
--    The app now uses ('time_machine', 'hidden_city', 'dark_side',
--    'behind_scenes', 'unfiltered'). Every insert with a new mood value was
--    failing the CHECK constraint.
--
-- 2. tour_blocks had no column to store the city a block was narrated in,
--    so end_tour() was forced to (incorrectly) reuse the neighborhood value
--    as the tour's city.
--
-- Run this in the Supabase SQL Editor after 001_initial_schema.sql.
-- This migration is idempotent — safe to run multiple times.
-- =============================================================================

-- --- 1. Replace the mood CHECK constraints -----------------------------------

ALTER TABLE public.tours DROP CONSTRAINT IF EXISTS tours_mood_check;
ALTER TABLE public.tours ADD CONSTRAINT tours_mood_check
    CHECK (mood IN ('time_machine', 'hidden_city', 'dark_side', 'behind_scenes', 'unfiltered'));

ALTER TABLE public.tour_blocks DROP CONSTRAINT IF EXISTS tour_blocks_mood_check;
ALTER TABLE public.tour_blocks ADD CONSTRAINT tour_blocks_mood_check
    CHECK (mood IN ('time_machine', 'hidden_city', 'dark_side', 'behind_scenes', 'unfiltered'));

ALTER TABLE public.narration_cache DROP CONSTRAINT IF EXISTS narration_cache_mood_check;
ALTER TABLE public.narration_cache ADD CONSTRAINT narration_cache_mood_check
    CHECK (mood IN ('time_machine', 'hidden_city', 'dark_side', 'behind_scenes', 'unfiltered'));

-- --- 2. Add a city column to tour_blocks -------------------------------------

ALTER TABLE public.tour_blocks ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';
