-- =============================================================================
-- Backyard Database Migration — v1.9
-- =============================================================================
-- Closes a narrow gap in 018_min_signup_age.sql's COPPA enforcement: that
-- trigger only rejects a signup when date_of_birth is PRESENT and under 13
-- (`IF dob IS NOT NULL AND age < 13`). A signup that omits date_of_birth
-- entirely -- not reachable through the real SignupScreen, which always
-- sends it, but reachable by calling the Supabase Auth signup API directly
-- -- skipped the check completely and created an account with no age
-- verification at all.
--
-- Same fail-closed posture as is_user_underage() already uses for an
-- account with no date_of_birth on file: unknown age is never treated as
-- "assume it's fine," it's treated as the thing being guarded against.
--
-- Run this in the Supabase SQL Editor after 038_tour_block_notes.sql.
-- Idempotent -- safe to run multiple times.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    dob DATE;
BEGIN
    dob := NULLIF(NEW.raw_user_meta_data->>'date_of_birth', '')::DATE;

    IF dob IS NULL OR date_part('year', age(dob)) < 13 THEN
        RAISE EXCEPTION 'Backyard requires a verified date of birth of at least 13 years old.'
            USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.users (id, email, display_name, date_of_birth, privacy_accepted_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        dob,
        CASE WHEN (NEW.raw_user_meta_data->>'privacy_accepted')::BOOLEAN THEN now() ELSE NULL END
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
