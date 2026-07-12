-- =============================================================================
-- Backyard Database Migration — v1.7
-- =============================================================================
-- Stores the actual text of the most recent connector transition, on top
-- of the category-level shuffle bag from 011_connector_opener_rotation.sql.
-- A live test tour showed category variety alone isn't quite enough — two
-- blocks assigned different categories both converged on the same
-- template ("Just beyond the X, you find yourself...") because that's a
-- phrasing the model gravitates to regardless of assigned category.
-- Passing the literal last transition back in lets the model explicitly
-- avoid repeating its own sentence shape, not just its category.
--
-- Run this in the Supabase SQL Editor after 011_connector_opener_rotation.sql.
-- This migration is idempotent — safe to run multiple times.
-- =============================================================================

ALTER TABLE public.tours
    ADD COLUMN IF NOT EXISTS last_connector_transition TEXT;
