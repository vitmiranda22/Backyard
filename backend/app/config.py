"""
Configuration loader for the Backyard backend.

All environment variables are loaded here and validated on startup.
If a required variable is missing, the app won't start — you'll get a clear
error message telling you exactly what's missing.

Usage:
    from app.config import settings
    print(settings.SUPABASE_URL)
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    Every environment variable the backend needs.

    Required vars will cause a startup crash if missing (that's intentional —
    better to fail loudly than silently serve broken responses).

    Optional vars have defaults that work for local development.
    """

    # -------------------------------------------------------------------------
    # Supabase
    # -------------------------------------------------------------------------
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    # Not actually used for verification (auth.py validates via the JWKS
    # endpoint instead), and newer Supabase projects on asymmetric signing
    # keys don't expose a shared secret at all — optional to avoid a
    # startup crash on those projects.
    SUPABASE_JWT_SECRET: str = ""

    # -------------------------------------------------------------------------
    # OpenAI (AI narration)
    # -------------------------------------------------------------------------
    OPENAI_API_KEY: str
    # Separate from OPENAI_API_KEY above -- narration generation uses a
    # regular project key, but the Costs API requires an Admin API key
    # (Organization > API keys > "Create admin key" on platform.openai.com,
    # not a project key) with usage.read scope. Optional: the admin
    # dashboard's Costs section just shows OpenAI as untracked until this
    # is set, same as it always has.
    OPENAI_ADMIN_API_KEY: str = ""

    # -------------------------------------------------------------------------
    # Google Cloud Text-to-Speech
    # -------------------------------------------------------------------------
    GOOGLE_TTS_API_KEY: str

    # -------------------------------------------------------------------------
    # Google Street View Static API (zone photos)
    # -------------------------------------------------------------------------
    GOOGLE_STREETVIEW_API_KEY: str

    # -------------------------------------------------------------------------
    # Cloudflare R2 (audio file storage)
    # -------------------------------------------------------------------------
    R2_ACCOUNT_ID: str
    R2_ACCESS_KEY_ID: str
    R2_SECRET_ACCESS_KEY: str
    R2_BUCKET_NAME: str = "backyard-audio"

    # -------------------------------------------------------------------------
    # TMDb (film/TV enrichment) — optional, free key from themoviedb.org.
    # The city-level TMDb source is silently skipped if this is left blank.
    # -------------------------------------------------------------------------
    TMDB_API_KEY: str = ""

    # -------------------------------------------------------------------------
    # GeoNames (nearby named places/features) — optional, free username from
    # geonames.org (register, confirm by email, then enable the free
    # webservice on your account page). Source is skipped if left blank.
    # -------------------------------------------------------------------------
    GEONAMES_USERNAME: str = ""

    # -------------------------------------------------------------------------
    # Europeana (digitized European cultural heritage) — optional, free API
    # key from pro.europeana.eu/get-api. Source is skipped if left blank.
    # -------------------------------------------------------------------------
    EUROPEANA_API_KEY: str = ""

    # -------------------------------------------------------------------------
    # Rate limiting
    # -------------------------------------------------------------------------
    # Tiered by premium status, and now sized to exactly match the real
    # fixed-length tour shape below rather than being a loose ceiling: free
    # gets one 5-block tour/day, premium gets three 12-block tours/day.
    # MINUTE stays flat and conservative for both tiers — it's the main
    # defense against rapid scripted abuse, and walking speed doesn't change
    # with plan tier.
    DAILY_NARRATION_LIMIT_FREE: int = 5
    DAILY_NARRATION_LIMIT_PREMIUM: int = 36
    MINUTE_NARRATION_LIMIT: int = 15

    # A tour ends itself (mobile auto-completes, same path as the manual
    # "End Tour" button) once it reaches this many blocks. Free and premium
    # get different tour LENGTHS, not just different daily frequencies — see
    # ActiveTourScreen.tsx's MAX_BLOCKS, which must match these two values.
    FREE_TOUR_BLOCK_LIMIT: int = 5
    PREMIUM_TOUR_BLOCK_LIMIT: int = 12

    # Below this fraction of eligible sources actually returning data, a
    # zone gets flagged as "low info" on the Home map (see
    # zone_data.is_low_info). A starting guess, not derived from real
    # data — sources_hit_count/sources_eligible_count were never
    # persisted before this was added, so there's no distribution yet to
    # calibrate against. Revisit once enough zones have real numbers on
    # file.
    LOW_INFO_RATIO_THRESHOLD: float = 0.3

    # At or above this fraction of eligible sources hitting, a zone's
    # zone_data bundle already has enough real facts that the narration
    # call skips OpenAI's web_search tool entirely (a separate billed
    # per-call cost) — see zone_data.should_skip_web_search(). Set higher
    # than LOW_INFO_RATIO_THRESHOLD deliberately: "not flagged as thin on
    # the map" and "rich enough to trust without a live search" are
    # different bars, and conflating them would mean any zone that merely
    # clears the low-info floor silently loses its web-search grounding.
    # A starting guess, not derived from real data — revisit once there's
    # real signal on how narration quality changes with this on vs off.
    WEB_SEARCH_SKIP_MIN_HIT_RATIO: float = 0.5

    # /ask-question has zero caching (fresh Whisper + GPT + TTS on every
    # single call, unlike narrate-block which reuses cached audio for a
    # revisited zone) — it gets its own tighter daily ceiling instead of
    # sharing the narration pool above.
    DAILY_QUESTION_LIMIT_FREE: int = 8
    DAILY_QUESTION_LIMIT_PREMIUM: int = 25

    # -------------------------------------------------------------------------
    # App settings
    # -------------------------------------------------------------------------
    # Set to "development" for verbose logging, "production" to quiet down
    ENVIRONMENT: str = "development"

    # -------------------------------------------------------------------------
    # Crash reporting — scaffolded, inactive until a Sentry account exists.
    # A blank DSN is a no-op (see main.py's lifespan startup).
    # -------------------------------------------------------------------------
    SENTRY_DSN: str = ""

    # -------------------------------------------------------------------------
    # RevenueCat webhook — the shared secret configured as this webhook's
    # Authorization header value in the RevenueCat dashboard (Project
    # Settings > Integrations > Webhooks). A blank value makes the webhook
    # endpoint reject every request (see app/api/webhooks.py) rather than
    # silently trust an unauthenticated caller.
    # -------------------------------------------------------------------------
    REVENUECAT_WEBHOOK_SECRET: str = ""

    # -------------------------------------------------------------------------
    # RevenueCat REST API v2 (read-only, for the admin dashboard's revenue
    # card) — a separate secret key from the webhook secret above. Create at
    # RevenueCat dashboard > Project Settings > API keys > + New secret API
    # key, scoped to metrics read-only if that option exists. Project ID is
    # visible in the dashboard URL. Blank values just make the dashboard
    # show "not configured" for revenue rather than failing the whole page.
    # -------------------------------------------------------------------------
    REVENUECAT_SECRET_API_KEY: str = ""
    REVENUECAT_PROJECT_ID: str = ""

    # -------------------------------------------------------------------------
    # ElevenLabs — powers only the "Signature" voice's cached preview sample
    # for now (see app/services/elevenlabs_service.py for why it's not yet
    # wired into real narration). Blank values are a no-op — the sample
    # endpoint returns an error for "signature" until both are set.
    # -------------------------------------------------------------------------
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = ""

    # -------------------------------------------------------------------------
    # Admin dashboard — the shared secret required in the X-Admin-Key header
    # to read /api/admin/stats. A blank value makes the endpoint reject every
    # request (same fail-closed pattern as REVENUECAT_WEBHOOK_SECRET above)
    # rather than silently serve business data to anyone who finds the URL.
    # -------------------------------------------------------------------------
    ADMIN_SECRET: str = ""

    class Config:
        env_file = ".env"
        # If a .env file doesn't exist, that's fine — vars might come from
        # actual environment (e.g., Docker, Railway, Render)
        env_file_encoding = "utf-8"


# Singleton instance. Import this everywhere:
#   from app.config import settings
settings = Settings()


# -------------------------------------------------------------------------
# Premium tier boundary
# -------------------------------------------------------------------------
# Single source of truth for which moods/voices require an active premium
# entitlement — imported by both narrate.py and tours.py so the two
# enforcement points can't drift out of sync.
PREMIUM_MOODS = {"dark_side", "behind_scenes", "unfiltered"}
PREMIUM_VOICES = {"dramatic", "warm"}

# Fixed server-side allowlist (not client-controllable) of accounts exempt
# from narration rate limiting -- devtest@backyard.app, used to generate
# real content across many cities/modes in one sitting (field testing,
# seeding Discover). The daily/minute limits exist to bound cost/abuse
# from a normal walker's real usage pattern; this account's usage pattern
# is deliberately not that, so it shouldn't be held to the same ceiling.
# Add more IDs here if other dedicated test/content accounts show up --
# never make this client-settable.
UNLIMITED_TEST_ACCOUNT_IDS = {"a48f80c3-fad6-4a41-b31c-3889667cc314"}  # devtest@backyard.app
