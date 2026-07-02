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
    SUPABASE_JWT_SECRET: str  # Found in Supabase → Settings → API → JWT Secret

    # -------------------------------------------------------------------------
    # Gemini (AI narration)
    # -------------------------------------------------------------------------
    GEMINI_API_KEY: str

    # -------------------------------------------------------------------------
    # Google Cloud Text-to-Speech
    # -------------------------------------------------------------------------
    GOOGLE_TTS_API_KEY: str

    # -------------------------------------------------------------------------
    # Cloudflare R2 (audio file storage)
    # -------------------------------------------------------------------------
    R2_ACCOUNT_ID: str
    R2_ACCESS_KEY_ID: str
    R2_SECRET_ACCESS_KEY: str
    R2_BUCKET_NAME: str = "backyard-audio"

    # -------------------------------------------------------------------------
    # Rate limiting
    # -------------------------------------------------------------------------
    DAILY_NARRATION_LIMIT: int = 50
    MINUTE_NARRATION_LIMIT: int = 5

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
