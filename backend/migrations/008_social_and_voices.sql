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
