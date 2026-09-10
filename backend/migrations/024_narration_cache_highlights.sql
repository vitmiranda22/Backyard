-- =============================================================================
-- Narration cache: store matched Wikipedia highlights alongside the text
-- =============================================================================
-- New feature: premium users can tap certain terms in the narration
-- (e.g. "Colosseum") to open the real Wikipedia article, matched against
-- Wikipedia entries already fetched for that block — never a model-
-- invented link (see zone_data.find_wikipedia_highlights).
--
-- Like the block's structure moves, this has to be computed once at
-- generation time and cached alongside narration_text, not recomputed
-- per-request: narrate.py only fetches zone data (where the real
-- Wikipedia titles live) on a narration_cache MISS — a cache HIT skips
-- zone-data fetching entirely as a cost optimization, so there'd be
-- nothing to match against on the (dominant, for popular blocks) hit
-- path without storing the result from generation time.
-- =============================================================================

ALTER TABLE public.narration_cache ADD COLUMN IF NOT EXISTS highlights JSONB NOT NULL DEFAULT '[]'::jsonb;
