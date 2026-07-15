-- =============================================================================
-- Backyard Database Migration — v1.9
-- =============================================================================
-- Security hardening found during a full audit. Two distinct problems:
--
-- 1. users_update_own and tours_update_own (001_initial_schema.sql) allow
--    a user to update ANY column on their own row, not just the ones the
--    app's own UI lets them change. 008_social_and_voices.sql's own
--    comment claims these policies are merely "defense-in-depth... against
--    the anon/authenticated keys ever being used to query the tables
--    directly" -- that assumption is wrong: the mobile app ships the
--    Supabase anon key + URL client-side (mobile/src/config.ts, used for
--    auth) which makes the PostgREST endpoint directly reachable by
--    anyone who extracts it, regardless of what the shipped app's own
--    code happens to call today. Concretely, without this fix, any
--    authenticated user could call
--    `supabase.from('users').update({is_premium: true}).eq('id', myId)`
--    directly and it would pass RLS -- a full monetization bypass,
--    independent of the backend's own correct logic that keeps
--    is_premium out of PATCH /user/settings.
--
--    Fixed with BEFORE UPDATE triggers (not just a WITH CHECK clause)
--    that silently revert server-controlled columns to their prior value
--    whenever the caller is an end-user (auth.role() = 'authenticated'),
--    while leaving the backend's own service-role writes (which is how
--    is_premium is legitimately set, via the RevenueCat webhook) fully
--    unaffected -- service_role requests don't carry an 'authenticated'
--    role claim, so the trigger no-ops for them. A trigger is used
--    instead of a plain WITH CHECK because comparing OLD vs NEW per
--    column isn't expressible in a USING/WITH CHECK clause alone.
--
-- 2. ratings_select / comments_select / tour_likes_select / shares_select
--    are all `USING (true)` -- unlike tour_blocks (which correctly
--    re-derives the parent tour's is_public boundary), a private tour's
--    ratings/comments/likes/shares are still fully world-readable to
--    anyone with the tour's UUID. Since create_tour() defaults new tours
--    to is_public=false, this is the common case, not an edge case.
--    Fixed by mirroring tour_blocks' EXISTS pattern.
--
-- Run this in the Supabase SQL Editor after 014_tiered_narration_cache.sql.
-- Idempotent — safe to run multiple times.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1a. Protect server-controlled columns on users
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_user_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() = 'authenticated' THEN
        NEW.is_premium := OLD.is_premium;
        NEW.email := OLD.email;
        NEW.id := OLD.id;
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_user_columns_trigger ON public.users;
CREATE TRIGGER protect_user_columns_trigger
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.protect_user_columns();

-- -----------------------------------------------------------------------------
-- 1b. Protect server/trigger-controlled columns on tours
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_tour_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() = 'authenticated' THEN
        NEW.id := OLD.id;
        NEW.creator_id := OLD.creator_id;
        NEW.avg_rating := OLD.avg_rating;
        NEW.rating_count := OLD.rating_count;
        NEW.blocks_visited := OLD.blocks_visited;
        NEW.total_distance_m := OLD.total_distance_m;
        NEW.duration_sec := OLD.duration_sec;
        NEW.center_lat := OLD.center_lat;
        NEW.center_lng := OLD.center_lng;
        NEW.location := OLD.location;
        NEW.path_points := OLD.path_points;
        NEW.narrative_summary := OLD.narrative_summary;
        NEW.used_connector_openers := OLD.used_connector_openers;
        NEW.last_connector_transition := OLD.last_connector_transition;
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_tour_columns_trigger ON public.tours;
CREATE TRIGGER protect_tour_columns_trigger
    BEFORE UPDATE ON public.tours
    FOR EACH ROW EXECUTE FUNCTION public.protect_tour_columns();

-- -----------------------------------------------------------------------------
-- 2. Gate ratings/comments/tour_likes/shares SELECT behind the parent
--    tour's is_public flag, same pattern as tour_blocks' blocks_select.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "ratings_select" ON public.ratings;
CREATE POLICY "ratings_select" ON public.ratings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tours
            WHERE tours.id = ratings.tour_id
            AND (tours.is_public = true OR tours.creator_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tours
            WHERE tours.id = comments.tour_id
            AND (tours.is_public = true OR tours.creator_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "tour_likes_select" ON public.tour_likes;
CREATE POLICY "tour_likes_select" ON public.tour_likes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tours
            WHERE tours.id = tour_likes.tour_id
            AND (tours.is_public = true OR tours.creator_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "shares_select" ON public.tour_shares;
CREATE POLICY "shares_select" ON public.tour_shares
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tours
            WHERE tours.id = tour_shares.tour_id
            AND (tours.is_public = true OR tours.creator_id = auth.uid())
        )
    );
