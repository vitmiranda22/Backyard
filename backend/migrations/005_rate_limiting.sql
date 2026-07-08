-- =============================================================================
-- Backyard Database Migration — v1.4
-- =============================================================================
-- Enforces the narration rate limits that were previously only declared as
-- config (DAILY_NARRATION_LIMIT / MINUTE_NARRATION_LIMIT) and never actually
-- checked anywhere — see backend/app/api/narrate.py. Every /narrate-block
-- call went straight to billed OpenAI/Street View/TTS requests with no cap.
--
-- One row per user, two rolling windows (minute + day). The check-and-
-- increment happens atomically in a single Postgres function (below) using
-- a row lock (FOR UPDATE), so concurrent requests from the same user can't
-- race past the limit.
--
-- Run this in the Supabase SQL Editor after 004_zone_images.sql.
-- This migration is idempotent — safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_rate_limits (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    minute_count INT NOT NULL DEFAULT 0,
    minute_window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    daily_count INT NOT NULL DEFAULT 0,
    daily_window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies — this table is only ever touched by the backend's
-- service-role key, same as narration_cache/zone_data_cache/audio_files.

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
    p_user_id UUID,
    p_minute_limit INT,
    p_daily_limit INT
) RETURNS TABLE(allowed BOOLEAN, reason TEXT) AS $$
DECLARE
    v_row public.user_rate_limits;
BEGIN
    INSERT INTO public.user_rate_limits (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_row FROM public.user_rate_limits WHERE user_id = p_user_id FOR UPDATE;

    IF now() - v_row.minute_window_start > INTERVAL '1 minute' THEN
        v_row.minute_count := 0;
        v_row.minute_window_start := now();
    END IF;

    IF now() - v_row.daily_window_start > INTERVAL '1 day' THEN
        v_row.daily_count := 0;
        v_row.daily_window_start := now();
    END IF;

    IF v_row.minute_count >= p_minute_limit THEN
        UPDATE public.user_rate_limits
        SET minute_count = v_row.minute_count,
            minute_window_start = v_row.minute_window_start,
            daily_count = v_row.daily_count,
            daily_window_start = v_row.daily_window_start
        WHERE user_id = p_user_id;
        RETURN QUERY SELECT FALSE, 'minute_limit_exceeded';
        RETURN;
    END IF;

    IF v_row.daily_count >= p_daily_limit THEN
        UPDATE public.user_rate_limits
        SET minute_count = v_row.minute_count,
            minute_window_start = v_row.minute_window_start,
            daily_count = v_row.daily_count,
            daily_window_start = v_row.daily_window_start
        WHERE user_id = p_user_id;
        RETURN QUERY SELECT FALSE, 'daily_limit_exceeded';
        RETURN;
    END IF;

    UPDATE public.user_rate_limits
    SET minute_count = v_row.minute_count + 1,
        minute_window_start = v_row.minute_window_start,
        daily_count = v_row.daily_count + 1,
        daily_window_start = v_row.daily_window_start
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT TRUE, ''::TEXT;
END;
$$ LANGUAGE plpgsql;
