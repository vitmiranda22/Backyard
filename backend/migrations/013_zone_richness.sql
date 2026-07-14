-- =============================================================================
-- Backyard Database Migration — v1.8
-- =============================================================================
-- Persists the data-richness signal zone_data.py already computes on every
-- cache-miss narration (how many of the ~26-30 sources returned real data
-- for this exact geohash) but previously only logged and discarded.
--
-- sources_eligible_count excludes regionally-skipped sources (e.g. DataSF
-- outside San Francisco) from the denominator — a zone outside the deep-
-- data tier should be judged against sources that were actually attempted,
-- not penalized for sources that were never applicable to begin with.
--
-- All three columns are nullable: zones cached before this migration ships
-- simply read as "unknown, don't flag" until they're next refreshed (30-day
-- TTL) or re-visited — same graceful partial-coverage principle used
-- throughout this session for city_data.py's per-city entries.
--
-- Run this in the Supabase SQL Editor after 012_connector_last_transition.sql.
-- This migration is idempotent — safe to run multiple times.
-- =============================================================================

ALTER TABLE public.zone_data_cache
    ADD COLUMN IF NOT EXISTS sources_hit_count INT,
    ADD COLUMN IF NOT EXISTS sources_eligible_count INT,
    ADD COLUMN IF NOT EXISTS sources_skipped TEXT[] DEFAULT '{}';
