-- =============================================================================
-- Backyard Database Migration — v1.8
-- =============================================================================
-- COPPA: 13 is the minimum age to create an account at all -- a separate,
-- stricter concern from is_user_underage()'s 18+ gate on mature content
-- (see narrate.py/tours.py). Once a signup form asks for and reads date
-- of birth (017_signup_dob_privacy.sql), the app has "actual knowledge" of
-- a user's stated age, and US law requires blocking account creation for
-- anyone under 13 rather than merely restricting content for them.
--
-- The mobile SignupScreen already blocks this client-side for a friendly
-- message, but that's bypassable by anyone calling the Supabase Auth API
-- directly -- this trigger is the real, unbypassable enforcement. Raising
-- inside the AFTER INSERT trigger rolls back the whole transaction,
-- including the auth.users row Supabase Auth just inserted, so the
-- account is never created at all.
--
-- Run this in the Supabase SQL Editor after 017_signup_dob_privacy.sql.
-- Idempotent -- safe to run multiple times.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    dob DATE;
BEGIN
    dob := NULLIF(NEW.raw_user_meta_data->>'date_of_birth', '')::DATE;

    IF dob IS NOT NULL AND date_part('year', age(dob)) < 13 THEN
        RAISE EXCEPTION 'Backyard requires users to be at least 13 years old.'
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
