"""
Admin dashboard stats.

Aggregates everything the /admin dashboard shows: users, tours, engagement,
top places, and storage. Pulled fresh on every request — there's no caching
layer here because at current scale (dozens to low thousands of rows) a
handful of Supabase queries is well under a second, and staleness would be
more confusing than a slightly slower page load. Revisit with a materialized
view or scheduled snapshot if the tables grow into the hundreds of thousands
of rows.

Aggregation (group-by-mood, top cities, etc.) happens here in Python rather
than via a Postgres RPC — simpler to maintain at current scale, and it keeps
every raw table read in supabase_db.py's public functions.
"""

import asyncio
from collections import Counter
from datetime import datetime, timedelta, timezone

from app.services import supabase_db, r2


def _parse_ts(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _top_n(values, n=8):
    counts = Counter(v for v in values if v)
    return [{"name": name, "count": count} for name, count in counts.most_common(n)]


async def get_dashboard_stats() -> dict:
    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)
    since_7d = now - timedelta(days=7)
    since_30d = now - timedelta(days=30)

    users, tours, tour_blocks, total_comments, total_likes, storage, cache_counts = await asyncio.gather(
        supabase_db.get_all_users_summary(),
        supabase_db.get_all_tours_summary(),
        supabase_db.get_all_tour_blocks_places(),
        supabase_db.count_comments(),
        supabase_db.count_likes(),
        r2.get_bucket_usage(),
        asyncio.gather(
            supabase_db.count_rows("narration_cache"),
            supabase_db.count_rows("zone_data_cache"),
            supabase_db.count_rows("audio_files"),
            supabase_db.count_rows("voice_samples"),
        ),
    )
    narration_cache_count, zone_data_cache_count, audio_files_count, voice_samples_count = cache_counts

    # --- Users ---
    users_total = len(users)
    users_premium = sum(1 for u in users if u.get("is_premium"))
    users_new_7d = sum(1 for u in users if (_parse_ts(u.get("created_at")) or now) >= since_7d)
    users_new_30d = sum(1 for u in users if (_parse_ts(u.get("created_at")) or now) >= since_30d)

    # --- Tours ---
    tours_total = len(tours)
    tours_today = sum(1 for t in tours if (_parse_ts(t.get("created_at")) or now) >= since_24h)
    tours_7d = sum(1 for t in tours if (_parse_ts(t.get("created_at")) or now) >= since_7d)
    tours_30d = sum(1 for t in tours if (_parse_ts(t.get("created_at")) or now) >= since_30d)

    mood_counts = Counter(t["mood"] for t in tours if t.get("mood"))
    type_counts = Counter(t["tour_type"] for t in tours if t.get("tour_type"))

    total_distance_km = sum(t.get("total_distance_m") or 0 for t in tours) / 1000
    blocks = [t.get("blocks_visited") or 0 for t in tours]
    avg_blocks_visited = round(sum(blocks) / len(blocks), 1) if blocks else 0

    rated_tours = [t for t in tours if (t.get("rating_count") or 0) > 0]
    total_ratings = sum(t.get("rating_count") or 0 for t in tours)
    weighted_rating_sum = sum((t.get("avg_rating") or 0) * (t.get("rating_count") or 0) for t in rated_tours)
    avg_rating = round(weighted_rating_sum / total_ratings, 2) if total_ratings else None

    top_cities = _top_n(t.get("city") for t in tours)
    top_neighborhoods = _top_n(b.get("neighborhood") for b in tour_blocks)
    top_streets = _top_n(b.get("street_name") for b in tour_blocks)

    return {
        "generated_at": now.isoformat(),
        "users": {
            "total": users_total,
            "premium": users_premium,
            "free": users_total - users_premium,
            "premium_conversion_pct": round(100 * users_premium / users_total, 1) if users_total else 0,
            "new_last_7d": users_new_7d,
            "new_last_30d": users_new_30d,
        },
        "tours": {
            "total": tours_total,
            "today": tours_today,
            "last_7d": tours_7d,
            "last_30d": tours_30d,
            "avg_blocks_visited": avg_blocks_visited,
            "total_distance_km": round(total_distance_km, 1),
            "by_mood": dict(mood_counts.most_common()),
            "by_type": dict(type_counts.most_common()),
            "public_pct": round(100 * sum(1 for t in tours if t.get("is_public")) / tours_total, 1) if tours_total else 0,
        },
        "engagement": {
            "avg_rating": avg_rating,
            "total_ratings": total_ratings,
            "total_comments": total_comments,
            "total_likes": total_likes,
        },
        "top_cities": top_cities,
        "top_neighborhoods": top_neighborhoods,
        "top_streets": top_streets,
        "cache": {
            "narration_cache_rows": narration_cache_count,
            "zone_data_cache_rows": zone_data_cache_count,
            "audio_files_rows": audio_files_count,
            "voice_samples_rows": voice_samples_count,
        },
        "storage": storage,
    }
