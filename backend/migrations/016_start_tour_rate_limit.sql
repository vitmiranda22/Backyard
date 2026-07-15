-- =============================================================================
-- Backyard Database Migration — v1.10
-- =============================================================================
-- start-tour had no rate limiting at all (security audit finding #6) —
-- unlike narrate-block/ask-question, a user could call it unlimited times,
-- spamming tour rows and (for premium moods) repeatedly hitting the
-- guide-intro TTS path.
--
-- This does NOT reuse check_and_increment_rate_limit() from
-- 005_rate_limiting.sql, because that function increments BOTH
-- minute_count and daily_count on the same user_rate_limits row that
-- narrate-block's real daily narration budget is checked against
-- (DAILY_NARRATION_LIMIT_FREE/PREMIUM). Calling it from start-tour would
-- silently burn one of a free user's 5 daily narration slots just for
-- starting a tour. start-tour only needs the generic per-minute abuse
-- guard, not its own daily budget — so this variant only touches
-- minute_count, sharing the same minute bucket (a generous, resettable
-- abuse guard, not a scarce resource) without ever touching daily_count.
--
-- Run this in the Supabase SQL Editor after 015_rls_hardening.sql.
-- Idempotent — safe to run multiple times.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_and_increment_minute_limit(
    p_user_id UUID,
    p_minute_limit INT
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

    IF v_row.minute_count >= p_minute_limit THEN
        UPDATE public.user_rate_limits
        SET minute_count = v_row.minute_count,
            minute_window_start = v_row.minute_window_start
        WHERE user_id = p_user_id;
        RETURN QUERY SELECT FALSE, 'minute_limit_exceeded';
        RETURN;
    END IF;

    UPDATE public.user_rate_limits
    SET minute_count = v_row.minute_count + 1,
        minute_window_start = v_row.minute_window_start
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT TRUE, '';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
