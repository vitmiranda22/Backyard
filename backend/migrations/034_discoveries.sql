-- =============================================================================
-- Collectible Discoveries (Group B idea #6)
--
-- Turns narration from disposable re-readable cache text into a permanent,
-- ownable item per user. Identity is deliberately (geo_hash, mood) only --
-- NOT tied to narration_cache's own (geo_hash, mood, content_safety,
-- variant_index) identity (migration 023). content_safety and variant_index
-- are rendering/tier differences of the same underlying story; the real
-- 5-mood system is what makes two stories at the same spot genuinely
-- different (already shipped). A free user who later goes premium and
-- re-hears the same spot/mood does not get a second discovery.
--
-- discoveries is shared/global (like zone_data_cache) -- one row per real
-- place+mood combination that has ever been narrated for ANY user.
-- user_discoveries is the per-user ownership record, same shape as
-- ratings' UNIQUE(tour_id, user_id) (migration 001).
-- =============================================================================
-- Idempotent -- safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.discoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    geo_hash TEXT NOT NULL,
    mood TEXT NOT NULL CHECK (mood IN ('time_machine', 'hidden_city', 'dark_side', 'behind_scenes', 'unfiltered')),
    street_name TEXT NOT NULL DEFAULT '',
    neighborhood TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    -- A short truncation of whichever narration text happened to generate
    -- it first -- never overwritten on conflict (see record_discovery),
    -- since the underlying facts are the same regardless of which of
    -- narration_cache's variants was actually used.
    teaser TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (geo_hash, mood)
);

CREATE TABLE IF NOT EXISTS public.user_discoveries (
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    discovery_id UUID NOT NULL REFERENCES public.discoveries(id) ON DELETE CASCADE,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, discovery_id)
);

CREATE INDEX IF NOT EXISTS idx_user_discoveries_user
    ON public.user_discoveries (user_id, discovered_at DESC);

-- Both tables are written only by the backend's service-role key (from
-- narrate.py's narrate_block, as a background task) -- same posture as
-- narration_cache/zone_data_cache. No RLS policies needed.
