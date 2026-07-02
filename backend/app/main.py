"""
Backyard API — FastAPI application entry point.

This is the file you run:
    uvicorn app.main:app --reload

It sets up:
- CORS (so the mobile app can talk to us)
- Logging (so we can debug issues)
- Route registration (connects URL paths to handler functions)
- Error handling (returns consistent JSON errors, never HTML stack traces)

The auto-generated docs are at:
    http://localhost:8000/docs     (Swagger UI — interactive, try endpoints here)
    http://localhost:8000/redoc    (ReDoc — prettier, read-only)
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import health, narrate, tours, settings as settings_api
from app.config import settings


# =============================================================================
# Logging setup
# =============================================================================

logging.basicConfig(
    level=logging.DEBUG if settings.ENVIRONMENT == "development" else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("backyard")


# =============================================================================
# Application lifecycle
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs on startup and shutdown.

    Startup: Log that we're alive and which environment we're in.
    Shutdown: Clean up any resources (database connections, etc.)
    """
    logger.info(f"🎙️ Backyard API starting up (env: {settings.ENVIRONMENT})")
    logger.info(f"   Supabase: {settings.SUPABASE_URL}")
    logger.info(f"   R2 bucket: {settings.R2_BUCKET_NAME}")
    yield
    logger.info("Backyard API shutting down")


# =============================================================================
# Create the FastAPI app
# =============================================================================

app = FastAPI(
    title="Backyard API",
    description=(
        "AI-powered guided tours anywhere in the world. "
        "Send GPS coordinates, get back a narrated story with streaming audio."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


# =============================================================================
# CORS — allow the mobile app to talk to us
# =============================================================================

# In development, we allow everything. In production, you'd restrict this
# to your actual domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Global error handler
# =============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all error handler. Ensures we never return an HTML stack trace
    to the mobile app — always JSON.

    In development, we include the error message for debugging.
    In production, we return a generic message.
    """
    logger.exception(f"Unhandled exception on {request.method} {request.url.path}")

    detail = str(exc) if settings.ENVIRONMENT == "development" else "Internal server error"

    # Nested under "detail" to match the envelope FastAPI produces for
    # HTTPException(detail={...}) — every error response has one shape.
    return JSONResponse(
        status_code=500,
        content={
            "detail": {
                "error": detail,
                "code": "internal_error",
                "retry": False,
            }
        },
    )


# =============================================================================
# Register routes
# =============================================================================

# Health check — no auth required
app.include_router(health.router, tags=["Health"])

# Narration — requires auth
app.include_router(narrate.router, prefix="/api", tags=["Narration"])

# Tour session management — requires auth
app.include_router(tours.router, prefix="/api", tags=["Tours"])

# User settings — requires auth
app.include_router(settings_api.router, prefix="/api", tags=["Settings"])


# =============================================================================
# Root redirect
# =============================================================================

@app.get("/", include_in_schema=False)
async def root():
    """Redirect root to docs for convenience."""
    return {
        "message": "Backyard API 🎙️",
        "docs": "/docs",
        "health": "/health",
    }