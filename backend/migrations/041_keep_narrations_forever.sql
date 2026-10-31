-- =============================================================================
-- Keep narrations (and their audio) forever
-- =============================================================================
-- narration_cache and audio_files used to expire after 30 days, so every
-- block's stories were paid for again each month. A block's history doesn't
-- go stale, so cached stories are now permanent: expires_at is NULL.
-- delete_expired_cache_rows() filters on expires_at < now(), which never
-- matches NULL, so the cleanup job leaves these rows alone automatically.
-- zone_data_cache keeps its 30-day expiry (it holds live data like 311
-- complaints and permits that does go stale).
--
-- No RLS change: same backend-only cache tables as before.
-- =============================================================================

ALTER TABLE public.narration_cache ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE public.narration_cache ALTER COLUMN expires_at DROP DEFAULT;
UPDATE public.narration_cache SET expires_at = NULL;

ALTER TABLE public.audio_files ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE public.audio_files ALTER COLUMN expires_at DROP DEFAULT;
UPDATE public.audio_files SET expires_at = NULL;
