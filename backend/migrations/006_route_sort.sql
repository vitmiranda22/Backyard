-- =============================================================================
-- Backyard Database Migration — v1.5
-- =============================================================================
-- Adds a rating-based sort mode to nearby_tours(), and exposes each route's
-- lat/lng — needed for the home screen's map pins (sorted by rating,
-- "most voted") while the Discover tab keeps using the existing
-- distance-only default ("closest shared routes").
--
-- Run this in the Supabase SQL Editor after 005_rate_limiting.sql.
-- This migration is idempotent — safe to run multiple times.
-- =============================================================================

-- CREATE OR REPLACE can't change an existing function's return type (we're
-- adding lat/lng columns), so the old signature has to be dropped first.
DROP FUNCTION IF EXISTS public.nearby_tours(FLOAT8, FLOAT8, INT, TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.nearby_tours(
    user_lat FLOAT8,
    user_lng FLOAT8,
    radius_m INT DEFAULT 5000,
    mood_filter TEXT DEFAULT NULL,
    tour_type_filter TEXT DEFAULT NULL,
    limit_count INT DEFAULT 20,
    offset_count INT DEFAULT 0,
    sort_by TEXT DEFAULT 'distance'
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
    created_at TIMESTAMPTZ,
    lat FLOAT8,
    lng FLOAT8
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
        t.created_at,
        ST_Y(t.location::geometry) AS lat,
        ST_X(t.location::geometry) AS lng
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
    ORDER BY
        CASE WHEN sort_by = 'rating' THEN t.avg_rating END DESC NULLS LAST,
        CASE WHEN sort_by = 'rating' THEN t.rating_count END DESC NULLS LAST,
        distance_m ASC
    LIMIT limit_count
    OFFSET offset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
