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
    # Rate limiting
    # -------------------------------------------------------------------------
    # Raised alongside the geohash precision bump (7->8): smaller ~19-38m
    # zones mean a normal walk crosses roughly 5x more zone boundaries than
    # before, so the same limits would rate-limit a normal user mid-walk.
    # MINUTE stays more conservative than the 5x daily bump on purpose — it's
    # the main defense against rapid scripted abuse, and walking speed itself
    # didn't change.
    DAILY_NARRATION_LIMIT: int = 250
    MINUTE_NARRATION_LIMIT: int = 15

    # -------------------------------------------------------------------------
    # App settings
    # -------------------------------------------------------------------------
    # Set to "development" for verbose logging, "production" to quiet down
    ENVIRONMENT: str = "development"

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
