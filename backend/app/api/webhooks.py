"""
Webhooks from third-party services.

  POST /api/webhooks/revenuecat — purchase/renewal/expiration events

Not user-authenticated (there's no end-user JWT on a server-to-server
callback) — instead verified against a shared secret configured as this
webhook's Authorization header value in the RevenueCat dashboard.
"""

import logging

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.services import supabase_db

logger = logging.getLogger(__name__)

router = APIRouter()

# RevenueCat event types that mean the entitlement should be active.
_GRANTS_PREMIUM = {
    "INITIAL_PURCHASE",
    "RENEWAL",
    "PRODUCT_CHANGE",
    "UNCANCELLATION",
    "NON_RENEWING_PURCHASE",
    "TRANSFER",
}
# Only EXPIRATION means access has actually ended — CANCELLATION just turns
# off auto-renew, the entitlement stays active until the paid period is up
# and RevenueCat sends EXPIRATION at that point.
_REVOKES_PREMIUM = {"EXPIRATION"}


@router.post("/webhooks/revenuecat", include_in_schema=False)
async def revenuecat_webhook(request: Request, authorization: str = Header(default="")):
    if not settings.REVENUECAT_WEBHOOK_SECRET or authorization != f"Bearer {settings.REVENUECAT_WEBHOOK_SECRET}":
        logger.warning("Rejected RevenueCat webhook with invalid/missing auth header")
        return JSONResponse(status_code=401, content={"error": "unauthorized"})

    body = await request.json()
    event = body.get("event", {})
    event_type = event.get("type")
    app_user_id = event.get("app_user_id")

    if not app_user_id:
        return JSONResponse(status_code=200, content={"ok": True})

    if event_type in _GRANTS_PREMIUM:
        await supabase_db.set_premium_status(app_user_id, True)
    elif event_type in _REVOKES_PREMIUM:
        await supabase_db.set_premium_status(app_user_id, False)
    else:
        logger.info(f"Ignoring RevenueCat event type={event_type} for user={app_user_id[:8]}...")

    return JSONResponse(status_code=200, content={"ok": True})
