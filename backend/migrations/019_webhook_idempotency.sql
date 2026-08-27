-- =============================================================================
-- Backyard Database Migration — v1.11
-- =============================================================================
-- RevenueCat webhook replay protection (security audit finding) —
-- /api/webhooks/revenuecat verifies its shared-secret Authorization header,
-- but never checked whether it had already processed a given event. A
-- captured valid request (leaked from logs, a compromised integration,
-- etc.) could be replayed to re-toggle a user's premium status — e.g.
-- replaying an old EXPIRATION event to knock out someone's still-active
-- subscription, or replaying a grant to extend premium past a real
-- cancellation.
--
-- RevenueCat's own event payload carries a unique `event.id` per delivery
-- (including retries of the SAME event, which reuse the same id) — this
-- table just remembers which ids have already been acted on.
--
-- Run this in the Supabase SQL Editor after 018_min_signup_age.sql.
-- Idempotent — safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_events_processed (
    event_id TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS policy needed -- this table is never queried through PostgREST
-- with a user's anon-key session, only via the backend's service-role
-- client (same access pattern as user_rate_limits).
ALTER TABLE public.webhook_events_processed ENABLE ROW LEVEL SECURITY;
