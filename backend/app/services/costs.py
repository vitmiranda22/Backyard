"""
Cost estimation for the admin dashboard.

R2 storage is a precise local computation (bytes already tracked, fixed
public pricing). OpenAI is a real, live API call once OPENAI_ADMIN_API_KEY
is set (see config.py) -- same "configured / not configured" shape as
revenuecat_service.get_overview_metrics. Google Cloud (Street View + TTS)
stays an honest placeholder: unlike OpenAI, there's no single credential
that unlocks it -- the Cloud Billing API only returns historical cost data
once BigQuery billing export is enabled for the billing account (a GCP
console setup step, not just an API key), so faking that integration
without being able to test it against real GCP config would be worse than
just saying so.
"""

import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15.0

R2_FREE_GB = 10
R2_PRICE_PER_GB_MONTH = 0.015


def estimate_r2_storage_cost(total_mb) -> dict:
    """
    Cloudflare R2 pricing: first 10GB-month of storage is free, then
    $0.015/GB-month. Doesn't account for Class A/B operation costs (writes/
    reads) — this project doesn't track operation counts, only bytes
    stored, and at current traffic those are almost certainly still
    within R2's separate free operation allowances anyway.
    """
    if total_mb is None:
        return {"gb": None, "billable_gb": None, "monthly_usd": None}
    gb = total_mb / 1024
    billable_gb = max(0.0, gb - R2_FREE_GB)
    return {
        "gb": round(gb, 2),
        "billable_gb": round(billable_gb, 2),
        "monthly_usd": round(billable_gb * R2_PRICE_PER_GB_MONTH, 4),
    }


# Not pulled from any billing API (none of these are configured with
# billing-scoped credentials) — just the known free-tier ceilings, so the
# dashboard can show *something* rather than nothing. Update the "tier"
# field by hand if you upgrade any of these.
KNOWN_FREE_TIER_LIMITS = [
    {"service": "Render", "tier": "Free", "limit": "750 hrs/month, sleeps after 15 min idle",
     "note": "Cold starts observed this session confirm free tier"},
    {"service": "Supabase", "tier": "Free (assumed)", "limit": "500MB database, 5GB bandwidth, 1GB file storage",
     "note": "Not billing-verified"},
    {"service": "EAS (Expo)", "tier": "Free", "limit": "Monthly iOS build quota",
     "note": "Quota hit this cycle, resets Aug 1"},
    {"service": "Sentry", "tier": "Free (assumed)", "limit": "5K errors/month, 1 project",
     "note": "Not billing-verified"},
    {"service": "PostHog", "tier": "Free (assumed)", "limit": "1M events/month",
     "note": "Not billing-verified"},
    {"service": "RevenueCat", "tier": "Free", "limit": "Free until $2.5K tracked revenue/month",
     "note": "$0 actual revenue right now — see the Revenue section above"},
    {"service": "ElevenLabs", "tier": "Free (assumed)", "limit": "10K characters/month",
     "note": "Confirmed hitting the free-tier cap earlier (real synthesis returned 402 Payment Required)"},
]

UNTRACKED_VARIABLE_COSTS = [
    {"service": "Google Cloud (TTS + Street View)",
     "reason": "Needs BigQuery billing export enabled on the GCP billing account, not just an API key"},
]


async def fetch_openai_costs() -> dict:
    """
    Real OpenAI Costs API call (GET /v1/organization/costs), last 30 days.
    Requires an Admin API key with usage.read scope -- returns
    {"configured": False} if OPENAI_ADMIN_API_KEY isn't set, matching
    revenuecat_service.get_overview_metrics's shape so the dashboard
    handles both the same way.

    https://platform.openai.com/docs/api-reference/usage/costs
    """
    if not settings.OPENAI_ADMIN_API_KEY:
        return {"configured": False}

    start_time = int((datetime.now(timezone.utc) - timedelta(days=30)).timestamp())
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
            response = await client.get(
                "https://api.openai.com/v1/organization/costs",
                params={"start_time": start_time, "bucket_width": "1d", "limit": 31},
                headers={"Authorization": f"Bearer {settings.OPENAI_ADMIN_API_KEY}"},
            )
            response.raise_for_status()
            data = response.json()

        total = 0.0
        currency = "usd"
        for bucket in data.get("data", []):
            for result in bucket.get("results", []):
                amount = result.get("amount", {})
                total += amount.get("value") or 0
                currency = amount.get("currency", currency)

        return {"configured": True, "total_usd": round(total, 2), "currency": currency, "period_days": 30}
    except Exception as e:
        logger.error(f"Failed to fetch OpenAI costs: {e}")
        return {"configured": True, "error": True}


async def get_cost_summary(total_mb) -> dict:
    return {
        "r2_storage": estimate_r2_storage_cost(total_mb),
        "openai": await fetch_openai_costs(),
        "known_free_tier_limits": KNOWN_FREE_TIER_LIMITS,
        "untracked": UNTRACKED_VARIABLE_COSTS,
    }
