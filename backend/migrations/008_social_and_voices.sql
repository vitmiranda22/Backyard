-- =============================================================================
-- Backyard Database Migration — v1.7
-- =============================================================================
-- Adds likes (comments/tour_shares/content_reports already existed since
-- 001 but were never wired up to any endpoint) and a cache table for
-- one-time-generated voice preview clips.
--
-- Run this in the Supabase SQL Editor after 007_premium_tier.sql.
-- Idempotent — safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tour_likes (
    tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (tour_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tour_likes_tour_id ON public.tour_likes(tour_id);

CREATE TABLE IF NOT EXISTS public.voice_samples (
    voice TEXT PRIMARY KEY,
    r2_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Matches the pattern every other table already uses (001_initial_schema.sql):
-- the backend talks to Supabase with the service-role key, which bypasses RLS
-- entirely, so these policies are defense-in-depth against the anon/
-- authenticated keys ever being used to query the tables directly.

ALTER TABLE public.tour_likes ENABLE ROW LEVEL SECURITY;
-- Cache table, no user column — service role only, same as narration_cache/
-- audio_files/zone_data_cache (no policies = no anon/authenticated access).
ALTER TABLE public.voice_samples ENABLE ROW LEVEL SECURITY;

-- TOUR LIKES: like counts are public, own insert/delete (mirrors ratings' policies)
DROP POLICY IF EXISTS "tour_likes_select" ON public.tour_likes;
CREATE POLICY "tour_likes_select" ON public.tour_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "tour_likes_insert" ON public.tour_likes;
CREATE POLICY "tour_likes_insert" ON public.tour_likes
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "tour_likes_delete_own" ON public.tour_likes;
CREATE POLICY "tour_likes_delete_own" ON public.tour_likes
    FOR DELETE USING (auth.uid() = user_id);
