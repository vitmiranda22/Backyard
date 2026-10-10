-- =============================================================================
-- Backyard Database Migration — v2.0
-- =============================================================================
-- Reverts 039_signup_age_fail_closed.sql's "fail closed on missing
-- date_of_birth" change. Real incident, 2026-10-10: it silently rejected
-- EVERY Apple and Google sign-in since it shipped (2026-10-07) -- Sign in
-- with Apple only ever requests name + email (see mobile/src/services/
-- auth.ts's signInWithApple, FULL_NAME + EMAIL scopes only), and Google
-- sign-in requests nothing beyond the OAuth identity token. Neither path
-- has ever collected date_of_birth, so raw_user_meta_data->>'date_of_birth'
-- is NULL for every OAuth signup -- 039's `dob IS NULL OR age < 13` check
-- rejected all of them outright, rolling back the whole auth.users insert
-- (the "database not working" error a real user hit trying to sign up).
--
-- 039 wasn't closing a real gap it thought it was: an OAuth account with
-- no date_of_birth was already the app's normal, designed-for state (see
-- ProfileScreen's "Add date of birth" follow-up prompt, and
-- is_user_underage()'s own fail-closed-to-restricted default for a
-- missing DOB) -- mature content was already correctly blocked for these
-- accounts at the content-generation layer (narrate.py/tours.py's age
-- gate), which is the right place to enforce it, not at account creation,
-- where OAuth structurally can't supply a date of birth up front.
--
-- Run this in the Supabase SQL Editor after 039_signup_age_fail_closed.sql.
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
