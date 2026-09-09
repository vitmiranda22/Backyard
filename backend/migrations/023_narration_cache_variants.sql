-- =============================================================================
-- Narration cache: multiple variants per block instead of exactly one
-- =============================================================================
-- narration_cache used to store exactly one row per (geo_hash, mood,
-- content_safety) forever — every user who ever walked past a given block
-- in a given mood got the identical stored text. Combined with
-- backend/app/core/prompts.py's per-mood structure move pools (each
-- narration now gets a randomly-picked OPENER/PIVOT/CLOSER baked in at
-- generation time), a single frozen row per block meant that random pick
-- only ever happened once per block, ever — no real variety in practice
-- for popular, already-cached locations.
--
-- This migration lets up to 4 independently-generated variants exist per
-- (geo_hash, mood, content_safety). backend/app/services/supabase_db.py's
-- get_cached_narration() now returns a random one of the existing variants
-- once 4 exist, and generates a new one (at the next variant_index) when
-- fewer than 4 exist yet. audio_files needs no change — it's keyed by
-- narration_cache_id, and each variant already gets its own row id, so
-- per-variant audio caching works automatically.
-- =============================================================================

ALTER TABLE public.narration_cache ADD COLUMN IF NOT EXISTS variant_index SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.narration_cache DROP CONSTRAINT IF EXISTS narration_cache_geo_hash_mood_content_safety_key;

ALTER TABLE public.narration_cache ADD CONSTRAINT narration_cache_geo_hash_mood_content_safety_variant_key
    UNIQUE (geo_hash, mood, content_safety, variant_index);

-- The existing idx_narration_cache_lookup (geo_hash, mood, content_safety)
-- already covers the "fetch all variants for this key" query pattern —
-- variant_index doesn't need to be part of that index.
