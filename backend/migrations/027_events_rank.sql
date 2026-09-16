-- =============================================================================
-- Adds PredictHQ's own real-world impact rank (0-100) to events, and
-- surfaces it from nearby_events() -- powers the marketing site's
-- "biggest events" ranking (both the global top-6 default view and
-- ranking a specific city's results), which previously had no real
-- significance signal to sort by.
-- =============================================================================
-- Idempotent -- safe to run multiple times.
-- =============================================================================

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS rank INT;

-- Postgres won't let CREATE OR REPLACE change a function's RETURNS TABLE
-- column set (adding `rank` here) -- confirmed live: "cannot change
-- return type of existing function... Use DROP FUNCTION ... first."
-- Drop the old signature explicitly before recreating it.
DROP FUNCTION IF EXISTS public.nearby_events(double precision, double precision, integer, text, boolean, integer);

CREATE OR REPLACE FUNCTION public.nearby_events(
    user_lat FLOAT8,
    user_lng FLOAT8,
    p_radius_m INT DEFAULT 5000,
    category_filter TEXT DEFAULT NULL,
    include_past BOOLEAN DEFAULT false,
    limit_count INT DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    category TEXT,
    city TEXT,
    center_lat FLOAT8,
    center_lng FLOAT8,
    radius_m INT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    source_url TEXT,
    rank INT,
    distance_m FLOAT8
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.name,
        e.description,
        e.category,
        e.city,
        e.center_lat,
        e.center_lng,
        e.radius_m,
        e.start_time,
        e.end_time,
        e.source_url,
        e.rank,
        ST_Distance(
            e.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) AS distance_m
    FROM public.events e
    WHERE e.is_active = true
        AND ST_DWithin(
            e.location,
            ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
            p_radius_m
        )
        AND (category_filter IS NULL OR e.category = category_filter)
        AND (include_past OR e.end_time > now())
    ORDER BY distance_m ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
