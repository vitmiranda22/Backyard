"""
Cost estimation for the admin dashboard.

Only computes what's precisely knowable from data already tracked (R2
storage, from the bucket-usage stats admin_stats.py already fetches).
OpenAI and Google Cloud (the two biggest variable costs — narration text
generation, Street View photos, TTS) need billing-scoped credentials this
project doesn't have yet (an OpenAI Admin key with usage.read scope, a
Google Cloud billing-viewer service account) — those are marked as
explicitly untracked rather than estimated, since a "Costs" dashboard
that quietly guesses is worse than one that's honest about its gaps.
"""

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
    {"service": "OpenAI", "reason": "API key lacks the usage.read scope — needs a separate org-level Admin key"},
    {"service": "Google Cloud (TTS + Street View)", "reason": "No billing API access configured"},
]


def get_cost_summary(total_mb) -> dict:
    return {
        "r2_storage": estimate_r2_storage_cost(total_mb),
        "known_free_tier_limits": KNOWN_FREE_TIER_LIMITS,
        "untracked": UNTRACKED_VARIABLE_COSTS,
    }
