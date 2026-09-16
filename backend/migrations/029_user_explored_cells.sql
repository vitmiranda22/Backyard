-- =============================================================================
-- Powers the Map tab's fog-of-war reveal ("Terra Incognita"): a permanent,
-- per-user record of which ~153m geohash cells (GEOHASH_PRECISION=7, same
-- grid narrate.py/tours.py already use for zones) they've physically
-- walked through. Plain string membership -- no PostGIS geography column
-- needed here, since discovery is a same-cell check, not a spatial radius
-- query (see supabase_db.mark_cells_explored / get_explored_cells_among).
-- =============================================================================
-- Idempotent -- safe to run multiple times.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_explored_cells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    geo_hash TEXT NOT NULL,
    first_explored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, geo_hash)
);

CREATE INDEX IF NOT EXISTS idx_user_explored_cells_user_id ON public.user_explored_cells(user_id);

-- Strictly private per user -- someone's real-world walking history is
-- personal data, and the rest of this schema already treats RLS as
-- mandatory (see tours/tour_blocks in 001_initial_schema.sql). The
-- backend itself always goes through the service-role key (bypasses
-- RLS regardless), so this is defense in depth against the anon/
-- authenticated keys, not something the app's own endpoints depend on.
-- No UPDATE/DELETE policy -- nothing in the app ever does either; a
-- cell, once explored, is permanent.
ALTER TABLE public.user_explored_cells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "explored_cells_select_own" ON public.user_explored_cells;
CREATE POLICY "explored_cells_select_own" ON public.user_explored_cells
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "explored_cells_insert_own" ON public.user_explored_cells;
CREATE POLICY "explored_cells_insert_own" ON public.user_explored_cells
    FOR INSERT WITH CHECK (auth.uid() = user_id);
