-- =============================================================================
-- Tier-aware narration/audio caching
-- =============================================================================
-- Free tier now gets a genuinely shorter narration (90-115 words, 35-45s)
-- and a cheaper Standard-tier voice, instead of the full 150-225 word /
-- Journey-voice narration premium gets (see backend/app/core/prompts.py's
-- is_premium param and backend/app/services/tts.py's VOICE_MAP_STANDARD).
--
-- Both narration_cache and audio_files are shared across every user who
-- hits the same geohash+mood(+voice) — without a tier dimension in the
-- cache identity, whichever tier generated a zone first would silently
-- serve its length/voice quality to the other tier too. Rather than add
-- new columns and rewrite the existing UNIQUE constraints/indexes, this
-- folds tier into the existing mood/voice values themselves (a "-short"
-- suffix on mood, a "-standard" suffix on voice) — see
-- narrate.py's _cache_mood_key() and tts.py's cache_voice_key(). Both
-- columns are CHECK-constrained to a fixed enum, so those checks need to
-- be widened to allow the new suffixed values; the existing
-- UNIQUE(geo_hash, mood, content_safety) / UNIQUE(narration_cache_id,
-- voice) constraints need no change, since a suffixed string is already
-- distinct from the unsuffixed one.
-- =============================================================================

ALTER TABLE public.narration_cache DROP CONSTRAINT IF EXISTS narration_cache_mood_check;
ALTER TABLE public.narration_cache ADD CONSTRAINT narration_cache_mood_check
    CHECK (mood IN (
        'time_machine', 'hidden_city', 'dark_side', 'behind_scenes', 'unfiltered',
        'time_machine-short', 'hidden_city-short', 'dark_side-short', 'behind_scenes-short', 'unfiltered-short'
    ));

ALTER TABLE public.audio_files DROP CONSTRAINT IF EXISTS audio_files_voice_check;
ALTER TABLE public.audio_files ADD CONSTRAINT audio_files_voice_check
    CHECK (voice IN ('neutral', 'dramatic', 'warm', 'neutral-standard'));
