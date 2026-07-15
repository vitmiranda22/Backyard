"""
Admin dashboard — a solo-founder read-only view of users, tours, engagement,
top places, and storage.

Not user-authenticated (there's no per-founder account system) — gated
behind a single shared secret (ADMIN_SECRET) the same way the RevenueCat
webhook is gated behind its own shared secret. The HTML page itself is
served unauthenticated (it contains no data, just structure/JS) and prompts
for the key client-side; the actual data only ever comes from the
X-Admin-Key-protected JSON endpoint below.
"""

import hmac
import logging
import os
import time
from collections import deque

import sentry_sdk
from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse, FileResponse

from app.config import settings
from app.services import admin_stats, supabase_db

logger = logging.getLogger(__name__)

router = APIRouter()

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")

# --- Failed-attempt alerting ---
# Process-local (not DB-backed) — fine for a single-instance deployment like
# this one; a real brute-force attempt is anyway hopeless against a 32-char
# random secret, so this is an early-warning tripwire, not a rate limiter.
# Fires exactly once per "flood" (not once per failed request past the
# threshold) so a sustained probe doesn't spam Sentry with one issue per
# attempt.
_FAILED_ATTEMPT_WINDOW_SEC = 300
_FAILED_ATTEMPT_ALERT_THRESHOLD = 5
_failed_attempts = deque()
_alerted_since_last_reset = False


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _record_failed_attempt(request: Request):
    global _alerted_since_last_reset
    now = time.time()
    _failed_attempts.append(now)
    while _failed_attempts and _failed_attempts[0] < now - _FAILED_ATTEMPT_WINDOW_SEC:
        _failed_attempts.popleft()

    if len(_failed_attempts) < _FAILED_ATTEMPT_ALERT_THRESHOLD:
        _alerted_since_last_reset = False
        return

    if _alerted_since_last_reset:
        return

    _alerted_since_last_reset = True
    ip = _client_ip(request)
    message = (
        f"Admin dashboard: {len(_failed_attempts)} failed X-Admin-Key attempts "
        f"in {_FAILED_ATTEMPT_WINDOW_SEC // 60} min (latest from {ip})"
    )
    logger.error(message)
    # capture_message is a documented no-op if sentry_sdk.init() was never
    # called (blank SENTRY_DSN) — same reliance as main.py's exception handler.
    sentry_sdk.capture_message(message, level="warning")


def _is_authorized(x_admin_key: str) -> bool:
    # Fails closed if ADMIN_SECRET is unset — same pattern as
    # REVENUECAT_WEBHOOK_SECRET in app/config.py. Constant-time compare
    # since this guards real business data, not just a webhook replay.
    if not settings.ADMIN_SECRET:
        return False
    return hmac.compare_digest(x_admin_key or "", settings.ADMIN_SECRET)


@router.get("/admin", include_in_schema=False)
async def admin_page():
    return FileResponse(os.path.join(STATIC_DIR, "admin.html"))


@router.get("/api/admin/stats", include_in_schema=False)
async def get_stats(request: Request, x_admin_key: str = Header(default="")):
    if not _is_authorized(x_admin_key):
        logger.warning(f"Rejected /api/admin/stats request from {_client_ip(request)} with invalid/missing X-Admin-Key")
        _record_failed_attempt(request)
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    stats = await admin_stats.get_dashboard_stats()
    return stats


@router.post("/api/admin/cleanup-cache", include_in_schema=False)
async def cleanup_cache(request: Request, x_admin_key: str = Header(default="")):
    """
    Prunes expired rows (and their R2 objects) from narration_cache/
    zone_data_cache/audio_files — see supabase_db.delete_expired_cache_rows.
    Called on a schedule by .github/workflows/cleanup-cache.yml, same
    pattern as keep-alive.yml pinging /health. Reuses ADMIN_SECRET rather
    than a separate secret — this is a maintenance action, not new exposed
    data, and a solo-founder app doesn't need a secret per cron job.
    """
    if not _is_authorized(x_admin_key):
        logger.warning(f"Rejected /api/admin/cleanup-cache request from {_client_ip(request)} with invalid/missing X-Admin-Key")
        _record_failed_attempt(request)
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    counts = await supabase_db.delete_expired_cache_rows()
    logger.info(f"Cache cleanup: {counts}")
    return {"deleted": counts}
