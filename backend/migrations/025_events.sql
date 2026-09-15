-- =============================================================================
-- EVENTS (Backyard Events — real-world runs/parades/festivals with a
-- geographic zone + time window; narration inside an active zone gets
-- overridden to be about the event instead of the spot's normal history)
-- =============================================================================
-- Backend-owned, same posture as zone_data_cache/narration_cache/
-- audio_files/user_rate_limits/voice_samples: RLS enabled, no policies,
-- so only the service-role key (used by the FastAPI backend) can touch
-- this table -- mobile clients never query Supabase directly for events,
-- only through GET /api/events/nearby and /api/events/{id}.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL CHECK (category IN ('run', 'parade', 'festival', 'market', 'community', 'other')),
    city TEXT DEFAULT '',
    center_lat FLOAT8 NOT NULL,
    center_lng FLOAT8 NOT NULL,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    radius_m INT NOT NULL DEFAULT 300,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    -- 'manual' for hand-entered rows (testing, launch seeding before the
    -- sync script is wired up); 'predicthq' once backend/scripts/sync_events.py
    -- is populating real data. source_event_id is the upstream API's own
    -- id, used for idempotent re-sync upserts -- never set for 'manual' rows.
    source TEXT NOT NULL DEFAULT 'manual',
    source_event_id TEXT,
    source_url TEXT,
    -- Manual kill switch, independent of the time window -- lets a bad
    -- sync result or a reported/incorrect event be hidden immediately
    -- without deleting the row.
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_time > start_time),
    UNIQUE (source, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_events_location ON public.events USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_events_time_window ON public.events (start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_events_active ON public.events (is_active) WHERE is_active = true;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
-- No policies -- service-role key only, see header comment.


-- =============================================================================
-- NEARBY EVENTS function (map browsing) -- same ST_DWithin pattern as
-- nearby_tours() in 001_initial_schema.sql, plus a time filter so map
-- browsing doesn't clutter with events that have already fully ended.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.nearby_events(
    user_lat FLOAT8,
    user_lng FLOAT8,
    -- Named p_radius_m, not radius_m -- a plpgsql function's parameters
    -- and its RETURNS TABLE columns share one namespace (both are OUT/IN
    -- parameters under the hood), and the table below already has its
    -- own radius_m column, so the search-radius INPUT had to take a
    -- different name to avoid "parameter name used more than once".
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


-- =============================================================================
-- ACTIVE EVENT AT POINT function -- called from narrate.py on every
-- narrate-block request. Widens the raw start/end window by fixed
-- buffers so a walker gets "starting soon"/"just wrapped up" framing
-- instead of the zone going silent right at the boundary. Ties (a point
-- inside two events' buffered windows at once) are broken in favor of
-- whichever is actually happening right now.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.active_event_at_point(
    p_lat FLOAT8,
    p_lng FLOAT8,
    p_at TIMESTAMPTZ DEFAULT now(),
    upcoming_window_minutes INT DEFAULT 180,
    ended_window_minutes INT DEFAULT 120
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    category TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.name,
        e.description,
        e.category,
        e.start_time,
        e.end_time
    FROM public.events e
    WHERE e.is_active = true
        AND ST_DWithin(
            e.location,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
            e.radius_m
        )
        AND p_at >= e.start_time - (upcoming_window_minutes * INTERVAL '1 minute')
        AND p_at <= e.end_time + (ended_window_minutes * INTERVAL '1 minute')
    ORDER BY
        CASE WHEN p_at BETWEEN e.start_time AND e.end_time THEN 0 ELSE 1 END,
        ABS(EXTRACT(EPOCH FROM (p_at - e.start_time)))
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
