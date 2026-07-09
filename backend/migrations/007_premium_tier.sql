-- =============================================================================
-- Backyard Database Migration — v1.6
-- =============================================================================
-- Adds the premium entitlement flag backing the new server-side mood/voice
-- gating (dark_side, behind_scenes, unfiltered moods + dramatic, warm voices
-- are premium-only). Run this in the Supabase SQL Editor after
-- 006_route_sort.sql. Idempotent — safe to run multiple times.
-- =============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

-- No one has legitimately unlocked a premium voice yet (there was no
-- gating or payment system before this), so it's correct — not a
-- limitation — to reset every existing preference to the new free
-- default here, rather than grandfathering stale values in from the
-- ungated era.
UPDATE public.users SET preferred_voice = 'neutral' WHERE preferred_voice != 'neutral';
