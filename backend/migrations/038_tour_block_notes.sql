-- =============================================================================
-- Powers the Notes feature: a free-text note the walker can write for
-- whatever block is currently playing, mid-tour (see the Notes icon next
-- to Ask Bosco on ActiveTourScreen). One note per block -- writing again
-- for the same block overwrites it rather than creating a second row
-- (see supabase_db.upsert_tour_block_note's on_conflict).
--
-- tour_id + sequence is the natural key (same shape as tour_blocks itself)
-- rather than a foreign key to a specific tour_blocks row -- save_tour_block
-- is a fire-and-forget background write (see ActiveTourScreen.tsx), so the
-- tour_blocks row for the block being noted might not have landed yet.
-- =============================================================================
-- Idempotent -- safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tour_block_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tour_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_tour_block_notes_tour_id ON public.tour_block_notes(tour_id);

-- A personal, freeform note is real personal data (see this migration's own
-- header comment) -- same reasoning as user_explored_cells (029). The
-- backend always goes through the service-role key (bypasses RLS
-- regardless), so this is defense in depth against the anon/authenticated
-- keys, not something the app's own endpoints depend on. Includes an
-- UPDATE policy (unlike explored_cells' insert-only) since editing an
-- existing note on the same block is the expected upsert behavior.
ALTER TABLE public.tour_block_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tour_block_notes_select_own" ON public.tour_block_notes;
CREATE POLICY "tour_block_notes_select_own" ON public.tour_block_notes
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tour_block_notes_insert_own" ON public.tour_block_notes;
CREATE POLICY "tour_block_notes_insert_own" ON public.tour_block_notes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tour_block_notes_update_own" ON public.tour_block_notes;
CREATE POLICY "tour_block_notes_update_own" ON public.tour_block_notes
    FOR UPDATE USING (auth.uid() = user_id);
