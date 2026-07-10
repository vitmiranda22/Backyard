-- =============================================================================
-- Backyard Database Migration — v1.5
-- =============================================================================
-- Adds a separate daily cap for /ask-question, distinct from the narration
-- rate limit in 005_rate_limiting.sql. Ask-question is the one narration-
-- adjacent surface with zero caching (Whisper + GPT + TTS on every single
-- call, never reused), so it needs its own tighter ceiling rather than
-- sharing the narration daily_count pool.
--
-- Run this in the Supabase SQL Editor after 009_tour_path.sql.
-- This migration is idempotent — safe to run multiple times.
-- =============================================================================

ALTER TABLE public.user_rate_limits
    ADD COLUMN IF NOT EXISTS question_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS question_window_start TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.check_and_increment_question_limit(
    p_user_id UUID,
    p_daily_limit INT
) RETURNS TABLE(allowed BOOLEAN, reason TEXT) AS $$
DECLARE
    v_row public.user_rate_limits;
BEGIN
    INSERT INTO public.user_rate_limits (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_row FROM public.user_rate_limits WHERE user_id = p_user_id FOR UPDATE;

    IF now() - v_row.question_window_start > INTERVAL '1 day' THEN
        v_row.question_count := 0;
        v_row.question_window_start := now();
    END IF;

    IF v_row.question_count >= p_daily_limit THEN
        UPDATE public.user_rate_limits
        SET question_count = v_row.question_count,
            question_window_start = v_row.question_window_start
        WHERE user_id = p_user_id;
        RETURN QUERY SELECT FALSE, 'daily_question_limit_exceeded';
        RETURN;
    END IF;

    UPDATE public.user_rate_limits
    SET question_count = v_row.question_count + 1,
        question_window_start = v_row.question_window_start
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT TRUE, ''::TEXT;
END;
$$ LANGUAGE plpgsql;
