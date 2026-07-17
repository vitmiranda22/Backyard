-- =============================================================================
-- Backyard Database Migration — v1.7
-- =============================================================================
-- Adds date_of_birth (backs the server-side age-gate on mature content --
-- see narrate.py/tours.py's is_user_underage check) and privacy_accepted_at
-- (proof of ToS/Privacy Policy acceptance at signup) to public.users, and
-- teaches the existing handle_new_user() trigger to populate both from the
-- signup call's user_metadata, alongside full_name which it already reads.
-- Run this in the Supabase SQL Editor after 016_start_tour_rate_limit.sql.
-- Idempotent -- safe to run multiple times.
-- =============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, display_name, date_of_birth, privacy_accepted_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NULLIF(NEW.raw_user_meta_data->>'date_of_birth', '')::DATE,
        CASE WHEN (NEW.raw_user_meta_data->>'privacy_accepted')::BOOLEAN THEN now() ELSE NULL END
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
