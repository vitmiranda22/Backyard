-- =============================================================================
-- Backyard Database Migration — v1.14
-- =============================================================================
-- Security audit finding: end_tour trusts client-reported total_distance_m/
-- duration_sec/path with only range validation, no plausibility check.
-- GPS spoofing is trivial (any mock-location app), which could let a bot
-- farm badges or mass-generate cheap narration content by "walking"
-- through cities at impossible speed.
--
-- flagged_implausible_speed is set server-side in end_tour (see
-- app/api/tours.py) when the actual GPS path implies a speed well above
-- real walking/light-jogging pace. It never blocks the save -- the tour
-- still finalizes normally for its own creator -- it just excludes the
-- tour from badge/streak stats and from nearby-routes ranking (see
-- get_user_stats and nearby_tours()).
--
-- Run this in the Supabase SQL Editor after 021_content_moderation.sql.
-- Idempotent — safe to run multiple times.
-- =============================================================================

ALTER TABLE public.tours
    ADD COLUMN IF NOT EXISTS flagged_implausible_speed BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.protect_tour_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() = 'authenticated' THEN
        NEW.id := OLD.id;
        NEW.creator_id := OLD.creator_id;
        NEW.avg_rating := OLD.avg_rating;
        NEW.rating_count := OLD.rating_count;
        NEW.blocks_visited := OLD.blocks_visited;
        NEW.total_distance_m := OLD.total_distance_m;
        NEW.duration_sec := OLD.duration_sec;
        NEW.center_lat := OLD.center_lat;
        NEW.center_lng := OLD.center_lng;
        NEW.location := OLD.location;
        NEW.path_points := OLD.path_points;
        NEW.narrative_summary := OLD.narrative_summary;
        NEW.used_connector_openers := OLD.used_connector_openers;
        NEW.last_connector_transition := OLD.last_connector_transition;
        NEW.created_at := OLD.created_at;
        NEW.is_hidden := OLD.is_hidden;
        NEW.flagged_implausible_speed := OLD.flagged_implausible_speed;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Exclude flagged tours from the Discover/home-map feed, same reasoning
-- as is_hidden in 021_content_moderation.sql. Same signature/return type
-- as before, so CREATE OR REPLACE is safe (no DROP needed).
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
        AND t.is_hidden = false
        AND t.flagged_implausible_speed = false
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
