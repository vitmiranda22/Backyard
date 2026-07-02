-- =============================================================================
-- Backyard Database Migration — v1.0
-- =============================================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- It creates all tables, indexes, RLS policies, and triggers.
--
-- Prerequisites:
--   - PostGIS extension is enabled (Database → Extensions → postgis → ON)
--
-- This migration is idempotent — safe to run multiple times.
-- =============================================================================


-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable PostGIS (should already be on, but just in case)
CREATE EXTENSION IF NOT EXISTS postgis;


-- =============================================================================
-- USERS
-- Created automatically by Supabase Auth, but we add our custom columns.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    display_name TEXT DEFAULT '',
    avatar_url TEXT,
    preferred_voice TEXT DEFAULT 'neutral'
        CHECK (preferred_voice IN ('neutral', 'dramatic', 'warm')),
    content_safety BOOLEAN DEFAULT false,
    anonymous_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Automatically create a user profile when someone signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- TOURS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.tours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT DEFAULT '',
    mood TEXT NOT NULL CHECK (mood IN ('informative', 'haunted', 'celebrity', 'curiosities')),
    tour_type TEXT NOT NULL CHECK (tour_type IN ('walking', 'virtual')),
    city TEXT DEFAULT '',
    center_lat FLOAT8,
    center_lng FLOAT8,
    location GEOGRAPHY(Point, 4326),  -- PostGIS point for spatial queries
    total_distance_m INT,
    duration_sec INT,
    blocks_visited INT DEFAULT 0,
    is_public BOOLEAN DEFAULT true,
    is_anonymous BOOLEAN DEFAULT false,
    content_safety_on BOOLEAN DEFAULT false,
    share_code TEXT UNIQUE,
    avg_rating FLOAT4 DEFAULT 0,
    rating_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tours_location ON public.tours USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_tours_mood ON public.tours (mood);
CREATE INDEX IF NOT EXISTS idx_tours_type ON public.tours (tour_type);
CREATE INDEX IF NOT EXISTS idx_tours_share_code ON public.tours (share_code) WHERE share_code IS NOT NULL;


-- =============================================================================
-- TOUR BLOCKS (narration segments within a tour)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.tour_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
    sequence INT NOT NULL,
    street_name TEXT DEFAULT '',
    neighborhood TEXT DEFAULT '',
    lat FLOAT8 NOT NULL,
    lng FLOAT8 NOT NULL,
    narration_text TEXT DEFAULT '',
    audio_r2_key TEXT,
    voice TEXT DEFAULT 'neutral' CHECK (voice IN ('neutral', 'dramatic', 'warm')),
    mood TEXT NOT NULL CHECK (mood IN ('informative', 'haunted', 'celebrity', 'curiosities')),
    trigger_type TEXT DEFAULT 'auto' CHECK (trigger_type IN ('auto', 'manual')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tour_blocks_tour_seq ON public.tour_blocks (tour_id, sequence);


-- =============================================================================
-- ZONE DATA CACHE (Layer 1 — raw data per zone, mood-agnostic)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.zone_data_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    geo_hash TEXT UNIQUE NOT NULL,
    street_name TEXT DEFAULT '',
    neighborhood TEXT DEFAULT '',
    city TEXT DEFAULT '',
    country TEXT DEFAULT '',
    raw_data JSONB DEFAULT '{}'::jsonb,
    sources_queried TEXT[] DEFAULT '{}',
    sources_failed TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_zone_data_hash ON public.zone_data_cache (geo_hash);
CREATE INDEX IF NOT EXISTS idx_zone_data_expires ON public.zone_data_cache (expires_at);


-- =============================================================================
-- NARRATION CACHE (Layer 2 — AI-generated narration per zone + mood + safety)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.narration_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    geo_hash TEXT NOT NULL,
    mood TEXT NOT NULL CHECK (mood IN ('informative', 'haunted', 'celebrity', 'curiosities')),
    content_safety BOOLEAN NOT NULL DEFAULT false,
    narration_text TEXT NOT NULL,
    data_highlights JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    UNIQUE (geo_hash, mood, content_safety)
);

CREATE INDEX IF NOT EXISTS idx_narration_cache_lookup
    ON public.narration_cache (geo_hash, mood, content_safety);
CREATE INDEX IF NOT EXISTS idx_narration_cache_expires ON public.narration_cache (expires_at);


-- =============================================================================
-- AUDIO FILES (Layer 3 — MP3 files on R2, one per narration + voice)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.audio_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    narration_cache_id UUID NOT NULL REFERENCES public.narration_cache(id) ON DELETE CASCADE,
    voice TEXT NOT NULL CHECK (voice IN ('neutral', 'dramatic', 'warm')),
    r2_key TEXT NOT NULL,
    r2_bucket TEXT DEFAULT 'backyard-audio',
    file_size_bytes INT,
    duration_ms INT,
    tts_provider TEXT DEFAULT 'google',
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    UNIQUE (narration_cache_id, voice)
);

CREATE INDEX IF NOT EXISTS idx_audio_lookup ON public.audio_files (narration_cache_id, voice);
CREATE INDEX IF NOT EXISTS idx_audio_expires ON public.audio_files (expires_at);


-- =============================================================================
-- RATINGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    score INT NOT NULL CHECK (score >= 1 AND score <= 5),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (tour_id, user_id)
);

-- Trigger: recalculate avg_rating when a rating is inserted or updated
CREATE OR REPLACE FUNCTION public.recalculate_tour_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.tours
    SET
        avg_rating = (SELECT COALESCE(AVG(score)::float4, 0) FROM public.ratings WHERE tour_id = COALESCE(NEW.tour_id, OLD.tour_id)),
        rating_count = (SELECT COUNT(*) FROM public.ratings WHERE tour_id = COALESCE(NEW.tour_id, OLD.tour_id))
    WHERE id = COALESCE(NEW.tour_id, OLD.tour_id);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_rating_change ON public.ratings;
CREATE TRIGGER on_rating_change
    AFTER INSERT OR UPDATE OR DELETE ON public.ratings
    FOR EACH ROW EXECUTE FUNCTION public.recalculate_tour_rating();


-- =============================================================================
-- COMMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(body) <= 500),
    is_anonymous BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- =============================================================================
-- VIRTUAL CITIES (pre-seeded, read-only)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.virtual_cities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    hero_image_url TEXT,
    description TEXT DEFAULT '',
    notable_streets JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- =============================================================================
-- TOUR SHARES (deep link tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.tour_shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
    share_code TEXT UNIQUE NOT NULL,
    shared_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    share_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shares_code ON public.tour_shares (share_code);


-- =============================================================================
-- CONTENT REPORTS (moderation)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.content_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('tour', 'comment', 'narration')),
    target_id UUID NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('inaccurate', 'offensive', 'spam', 'other')),
    detail TEXT CHECK (detail IS NULL OR char_length(detail) <= 500),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.content_reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_target ON public.content_reports (target_type, target_id);


-- =============================================================================
-- NEARBY TOURS function (PostGIS spatial query)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nearby_tours(
    user_lat FLOAT8,
    user_lng FLOAT8,
    radius_m INT DEFAULT 5000,
    mood_filter TEXT DEFAULT NULL,
    tour_type_filter TEXT DEFAULT NULL,
    limit_count INT DEFAULT 20,
    offset_count INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    mood TEXT,
    tour_type TEXT,
    city TEXT,
    avg_rating FLOAT4,
    rating_count INT,
    blocks_visited INT,
    duration_sec INT,
    total_distance_m INT,
    is_anonymous BOOLEAN,
    content_safety_on BOOLEAN,
    creator_display_name TEXT,
    creator_avatar_url TEXT,
    distance_m FLOAT8,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.title,
        t.mood,
        t.tour_type,
        t.city,
        t.avg_rating,
        t.rating_count,
        t.blocks_visited,
        t.duration_sec,
        t.total_distance_m,
        t.is_anonymous,
        t.content_safety_on,
        CASE WHEN t.is_anonymous THEN 'Anonymous Explorer' ELSE u.display_name END,
        CASE WHEN t.is_anonymous THEN NULL ELSE u.avatar_url END,
        ST_Distance(
            t.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) AS distance_m,
        t.created_at
    FROM public.tours t
    JOIN public.users u ON t.creator_id = u.id
    WHERE t.is_public = true
        AND ST_DWithin(
            t.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            radius_m
        )
        AND (mood_filter IS NULL OR t.mood = mood_filter)
        AND (tour_type_filter IS NULL OR t.tour_type = tour_type_filter)
    ORDER BY distance_m ASC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tour_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
-- Cache tables: service role only (no RLS policies = only service role can access)
ALTER TABLE public.narration_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zone_data_cache ENABLE ROW LEVEL SECURITY;

-- USERS: own row only
CREATE POLICY IF NOT EXISTS "users_select_own" ON public.users
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY IF NOT EXISTS "users_update_own" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- TOURS: public tours visible to all, own tours always visible
CREATE POLICY IF NOT EXISTS "tours_select_public" ON public.tours
    FOR SELECT USING (is_public = true OR auth.uid() = creator_id);
CREATE POLICY IF NOT EXISTS "tours_insert" ON public.tours
    FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY IF NOT EXISTS "tours_update_own" ON public.tours
    FOR UPDATE USING (auth.uid() = creator_id);
CREATE POLICY IF NOT EXISTS "tours_delete_own" ON public.tours
    FOR DELETE USING (auth.uid() = creator_id);

-- TOUR BLOCKS: visible if parent tour is visible
CREATE POLICY IF NOT EXISTS "blocks_select" ON public.tour_blocks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tours
            WHERE tours.id = tour_blocks.tour_id
            AND (tours.is_public = true OR tours.creator_id = auth.uid())
        )
    );
CREATE POLICY IF NOT EXISTS "blocks_insert" ON public.tour_blocks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tours
            WHERE tours.id = tour_blocks.tour_id AND tours.creator_id = auth.uid()
        )
    );

-- RATINGS: all visible, own insert/delete
CREATE POLICY IF NOT EXISTS "ratings_select" ON public.ratings FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "ratings_insert" ON public.ratings
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "ratings_delete_own" ON public.ratings
    FOR DELETE USING (auth.uid() = user_id);

-- COMMENTS: all visible, own insert/delete
CREATE POLICY IF NOT EXISTS "comments_select" ON public.comments FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "comments_insert" ON public.comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "comments_delete_own" ON public.comments
    FOR DELETE USING (auth.uid() = user_id);

-- VIRTUAL CITIES: public read-only
CREATE POLICY IF NOT EXISTS "cities_select" ON public.virtual_cities
    FOR SELECT USING (true);

-- TOUR SHARES: authenticated users can read
CREATE POLICY IF NOT EXISTS "shares_select" ON public.tour_shares FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "shares_insert" ON public.tour_shares
    FOR INSERT WITH CHECK (auth.uid() = shared_by);

-- CONTENT REPORTS: own reports only
CREATE POLICY IF NOT EXISTS "reports_select_own" ON public.content_reports
    FOR SELECT USING (auth.uid() = reporter_id);
CREATE POLICY IF NOT EXISTS "reports_insert" ON public.content_reports
    FOR INSERT WITH CHECK (auth.uid() = reporter_id);


-- =============================================================================
-- Done! 🎉
-- =============================================================================
-- To verify, run: SELECT tablename FROM pg_tables WHERE schemaname = 'public';
