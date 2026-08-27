-- =============================================================================
-- Backyard Database Migration — v1.12
-- =============================================================================
-- Security audit finding: `date_of_birth` gates mature-content access
-- (is_user_underage()) but wasn't in protect_user_columns()'s protected
-- list (015_rls_hardening.sql) -- same vulnerability class already fixed
-- there for is_premium. A user could bypass PATCH /user/settings entirely
-- and set date_of_birth directly via a raw PostgREST call using the
-- client-shipped anon key, since a `users_update_own` policy already
-- grants users UPDATE on their own row.
--
-- Also adds date_of_birth_updated_at so the backend (settings.py) can
-- enforce a cooldown between changes -- today a user can flip their
-- birthdate at will with zero friction, instantly unlocking mature
-- content and back again with no audit trail.
--
-- Run this in the Supabase SQL Editor after 019_webhook_idempotency.sql.
-- Idempotent — safe to run multiple times.
-- =============================================================================

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS date_of_birth_updated_at TIMESTAMPTZ;

-- Extends 015_rls_hardening.sql's protect_user_columns() -- both new
-- columns get the same treatment as is_premium/email/id/created_at: a
-- direct authenticated-role write reverts them to their prior value,
-- forcing every date_of_birth change through the backend's own validated,
-- cooldown-enforcing PATCH /user/settings endpoint (which uses the
-- service-role client, unaffected by this trigger).
CREATE OR REPLACE FUNCTION public.protect_user_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() = 'authenticated' THEN
        NEW.is_premium := OLD.is_premium;
        NEW.email := OLD.email;
        NEW.id := OLD.id;
        NEW.created_at := OLD.created_at;
        NEW.date_of_birth := OLD.date_of_birth;
        NEW.date_of_birth_updated_at := OLD.date_of_birth_updated_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
