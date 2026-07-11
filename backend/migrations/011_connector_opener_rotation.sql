-- =============================================================================
-- Backyard Database Migration — v1.6
-- =============================================================================
-- Tracks which connector-transition opener categories have already been
-- used in the current tour, so the backend can enforce true shuffle-bag
-- variety (don't repeat any category until all have been used once) --
-- see app/services/openai_service.py's generate_connector(). Prompt
-- wording alone couldn't fix this: each block's connector is a separate,
-- stateless API call with no visibility into what the previous block's
-- connector actually wrote, which is why a live test tour found 7 of 9
-- transitions starting with the same word ("Just").
--
-- Run this in the Supabase SQL Editor after 010_question_rate_limit.sql.
-- This migration is idempotent — safe to run multiple times.
-- =============================================================================

ALTER TABLE public.tours
    ADD COLUMN IF NOT EXISTS used_connector_openers TEXT[] DEFAULT '{}';
