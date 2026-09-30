-- =============================================================================
-- Challenges -- a rotating weekly goal (Week 1 idea #23).
--
-- WHICH challenge is active any given week needs no table at all: it's a
-- pure function of the calendar (see app/services/challenges.py's
-- get_active_challenge_id -- TEMPLATES[iso_week_number % len(TEMPLATES)]),
-- so any past or future week's active challenge is always reconstructable
-- with zero stored state. Same for progress -- a live, time-windowed count
-- against user_explored_cells/tours/user_discoveries, all of which already
-- exist and are already timestamped.
--
-- The ONE thing that genuinely can't be reconstructed after the fact is a
-- permanent record that a user actually completed a challenge -- once a
-- week ends, nothing "remembers" the goal was hit unless something wrote
-- it down. That's what this table is for, and it's the only new state
-- this feature needs.
--
-- PRIMARY KEY (user_id, week_key) rather than including challenge_id in
-- the key -- a user can complete at most one challenge per week, since
-- only one challenge is ever active at a time (challenge_id is still
-- stored as a plain column, for a readable record of *which* challenge
-- was completed, without needing to recompute it from the rotation
-- formula every time it's displayed).
-- =============================================================================
-- Idempotent -- safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_challenge_completions (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    challenge_id TEXT NOT NULL,
    week_key TEXT NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, week_key)
);

CREATE INDEX IF NOT EXISTS idx_user_challenge_completions_user
    ON public.user_challenge_completions (user_id);

-- Written only by the backend's service-role key (from GET /challenges,
-- as a side effect) -- same posture as user_discoveries: gamification/
-- ownership data, not real-world location history (unlike
-- user_explored_cells, which enables RLS specifically because a walking
-- history is personal data). No RLS policies needed.
