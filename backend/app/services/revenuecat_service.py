"""
RevenueCat REST API v2 client — read-only, powers the admin dashboard's
revenue card. Separate from the webhook handler in app/api/webhooks.py,
which only receives push events and never calls RevenueCat's API itself.

https://www.revenuecat.com/docs/api-v2
"""

import logging
import httpx

from app.config import settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 8.0


async def get_overview_metrics() -> dict:
    """
    Fetches MRR, active subscriptions, revenue, and a few other headline
    numbers from RevenueCat's project-wide metrics/overview endpoint.
    Returns {"configured": False} if the key/project ID aren't set, or
    {"configured": True, "metrics": {...}} on success — metrics is a dict
    keyed by RevenueCat's own metric id (e.g. "mrr", "active_subscriptions")
    so the dashboard doesn't need to know every possible metric up front.
    """
    if not settings.REVENUECAT_SECRET_API_KEY or not settings.REVENUECAT_PROJECT_ID:
        return {"configured": False}

    url = f"https://api.revenuecat.com/v2/projects/{settings.REVENUECAT_PROJECT_ID}/metrics/overview"
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.get(
                url,
                headers={"Authorization": f"Bearer {settings.REVENUECAT_SECRET_API_KEY}"},
            )
            response.raise_for_status()
            data = response.json()

        metrics = {
            m["id"]: {"name": m["name"], "value": m["value"], "unit": m["unit"], "period": m["period"]}
            for m in data.get("metrics", [])
        }
        return {"configured": True, "currency": data.get("currency", "USD"), "metrics": metrics}
    except Exception as e:
        logger.error(f"Failed to fetch RevenueCat overview metrics: {e}")
        return {"configured": True, "error": True, "metrics": {}}
