"""
Supabase database service.

Handles all database operations: cache lookups, narration storage, tour
management, and user settings.

We use the SERVICE_ROLE_KEY (which bypasses RLS) because the backend is
a trusted server — it already authenticated the user via JWT before
calling any of these functions.
"""

import logging
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client

from app.config import settings

logger = logging.getLogger(__name__)

_supabase = None


def _get_client() -> Client:
    """Lazy-initialize the Supabase client."""
    global _supabase
    if _supabase is None:
        _supabase = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
    return _supabase


# =============================================================================
# Rate limiting
# =============================================================================

async def check_rate_limit(user_id: str, minute_limit: int, daily_limit: int) -> tuple:
    """
    Atomically check-and-increment a user's narration rate limit.

    The check and increment happen in one Postgres function call (a single
    transaction with a row lock), so concurrent requests from the same user
    can't race past the limit — see check_and_increment_rate_limit() in
    migrations/005_rate_limiting.sql.

    Returns:
        (allowed, reason). If the RPC call itself fails (DB hiccup), fails
        OPEN (allowed=True) — a rate limiter shouldn't take down narration
        entirely if its own bookkeeping table has a problem.
    """
    try:
        client = _get_client()
        result = client.rpc("check_and_increment_rate_limit", {
            "p_user_id": user_id,
            "p_minute_limit": minute_limit,
            "p_daily_limit": daily_limit,
        }).execute()
        if result.data:
            row = result.data[0]
            return row["allowed"], row["reason"]
        return True, ""
    except Exception as e:
        logger.error(f"Rate limit check failed for {user_id}: {e}")
        return True, ""


async def check_question_rate_limit(user_id: str, daily_limit: int) -> tuple:
    """
    Same atomic check-and-increment pattern as check_rate_limit, but against
    the separate question_count/question_window_start columns — /ask-question
    has its own daily ceiling instead of sharing the narration one (see
    migrations/010_question_rate_limit.sql). Also fails open on RPC error.
    """
    try:
        client = _get_client()
        result = client.rpc("check_and_increment_question_limit", {
            "p_user_id": user_id,
            "p_daily_limit": daily_limit,
        }).execute()
        if result.data:
            row = result.data[0]
            return row["allowed"], row["reason"]
        return True, ""
    except Exception as e:
        logger.error(f"Question rate limit check failed for {user_id}: {e}")
        return True, ""


# =============================================================================
# Narration cache operations (Week 1)
# =============================================================================

async def get_cached_narration(geo_hash: str, mood: str, content_safety: bool):
    """Check if we already have a narration for this zone + mood + safety combo."""
    try:
        client = _get_client()
        result = (
            client.table("narration_cache")
            .select("*")
            .eq("geo_hash", geo_hash)
            .eq("mood", mood)
            .eq("content_safety", content_safety)
            .gt("expires_at", datetime.now(timezone.utc).isoformat())
            .limit(1)
            .execute()
        )
        if result.data and len(result.data) > 0:
            logger.info(f"Cache HIT for narration: {geo_hash}/{mood}")
            return result.data[0]
        logger.info(f"Cache MISS for narration: {geo_hash}/{mood}")
        return None
    except Exception as e:
        logger.error(f"Narration cache lookup failed: {e}")
        return None


async def store_narration(
    geo_hash: str,
    mood: str,
    content_safety: bool,
    narration_text: str,
):
    """Store a freshly generated narration in the cache (expires in 30 days)."""
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    try:
        client = _get_client()
        result = (
            client.table("narration_cache")
            .upsert({
                "geo_hash": geo_hash,
                "mood": mood,
                "content_safety": content_safety,
                "narration_text": narration_text,
                "expires_at": expires_at.isoformat(),
            })
            .execute()
        )
        if result.data:
            logger.info(f"Stored narration in cache: {geo_hash}/{mood}")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to store narration: {e}")
        return None


# =============================================================================
# Audio file tracking (Week 1)
# =============================================================================

async def get_cached_audio(narration_cache_id: str, voice: str):
    """Check if we already have an audio file for this narration + voice."""
    try:
        client = _get_client()
        result = (
            client.table("audio_files")
            .select("*")
            .eq("narration_cache_id", narration_cache_id)
            .eq("voice", voice)
            .gt("expires_at", datetime.now(timezone.utc).isoformat())
            .limit(1)
            .execute()
        )
        if result.data and len(result.data) > 0:
            logger.info(f"Cache HIT for audio: {narration_cache_id}/{voice}")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Audio cache lookup failed: {e}")
        return None


async def store_audio_file(
    narration_cache_id: str,
    voice: str,
    r2_key: str,
    file_size_bytes: int,
    duration_ms: int,
    tts_provider: str = "google",
):
    """Store a record of a generated audio file."""
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    try:
        client = _get_client()
        result = (
            client.table("audio_files")
            .upsert({
                "narration_cache_id": narration_cache_id,
                "voice": voice,
                "r2_key": r2_key,
                "r2_bucket": settings.R2_BUCKET_NAME,
                "file_size_bytes": file_size_bytes,
                "duration_ms": duration_ms,
                "tts_provider": tts_provider,
                "expires_at": expires_at.isoformat(),
            })
            .execute()
        )
        if result.data:
            logger.info(f"Stored audio file record: {r2_key}")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to store audio file record: {e}")
        return None


# =============================================================================
# Zone data cache (Week 3) — raw data per zone, mood-agnostic
# =============================================================================

async def get_cached_zone_data(geo_hash: str):
    """Check if we have zone data for this geohash. Returns dict or None."""
    try:
        client = _get_client()
        result = (
            client.table("zone_data_cache")
            .select("*")
            .eq("geo_hash", geo_hash)
            .gt("expires_at", datetime.now(timezone.utc).isoformat())
            .limit(1)
            .execute()
        )
        if result.data and len(result.data) > 0:
            logger.info(f"Zone data cache HIT: {geo_hash}")
            return result.data[0]
        logger.info(f"Zone data cache MISS: {geo_hash}")
        return None
    except Exception as e:
        logger.error(f"Zone data cache lookup failed: {e}")
        return None


async def store_zone_data(
    geo_hash: str,
    street_name: str,
    neighborhood: str,
    city: str,
    country: str,
    raw_data: dict,
    sources_queried: list,
    sources_failed: list,
):
    """Store zone data bundle in cache (expires in 30 days)."""
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    try:
        client = _get_client()
        result = (
            client.table("zone_data_cache")
            .upsert({
                "geo_hash": geo_hash,
                "street_name": street_name,
                "neighborhood": neighborhood,
                "city": city,
                "country": country,
                "raw_data": raw_data,
                "sources_queried": sources_queried,
                "sources_failed": sources_failed,
                "expires_at": expires_at.isoformat(),
            })
            .execute()
        )
        if result.data:
            logger.info(f"Stored zone data: {geo_hash} ({len(sources_queried)} sources)")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to store zone data: {e}")
        return None


async def store_zone_image(geo_hash: str, image_r2_key: str):
    """
    Persist a zone's cached street-view photo key.

    Only touches geo_hash/image_r2_key/expires_at on conflict — a partial
    upsert like this can't wipe raw_data/sources_queried on an existing
    row. expires_at is included (same 30-day window as store_zone_data)
    so this also works standalone if this is the very first time we've
    ever seen this geohash (zone_data_cache.expires_at is NOT NULL).
    """
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    try:
        client = _get_client()
        result = (
            client.table("zone_data_cache")
            .upsert({
                "geo_hash": geo_hash,
                "image_r2_key": image_r2_key,
                "expires_at": expires_at.isoformat(),
            })
            .execute()
        )
        if result.data:
            logger.info(f"Stored zone image: {geo_hash}")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to store zone image: {e}")
        return None


# =============================================================================
# Tour session management (Week 2)
# =============================================================================

async def create_tour(
    creator_id: str,
    mood: str,
    voice: str,
    tour_type: str,
    content_safety: bool,
):
    """
    Create a new tour record. Returns the tour dict or None.

    Starts private (is_public=False) — publishing as a discoverable route
    is an explicit opt-in action via publish_tour(), not the default.
    """
    try:
        client = _get_client()
        result = (
            client.table("tours")
            .insert({
                "creator_id": creator_id,
                "mood": mood,
                "tour_type": tour_type,
                "content_safety_on": content_safety,
                "is_public": False,
                "is_anonymous": False,
                "blocks_visited": 0,
            })
            .execute()
        )
        if result.data:
            logger.info(f"Created tour: {result.data[0]['id']}")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to create tour: {e}")
        return None


async def get_tour(tour_id: str):
    """Get a tour by ID. Returns the tour dict or None."""
    try:
        client = _get_client()
        result = (
            client.table("tours")
            .select("*")
            .eq("id", tour_id)
            .limit(1)
            .execute()
        )
        if result.data and len(result.data) > 0:
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to get tour: {e}")
        return None


async def update_tour_narrative_summary(
    tour_id: str,
    summary: str,
    used_connector_openers: list = None,
    last_connector_transition: str = None,
):
    """
    Persist the tour's rolling narrative summary for the next block to
    build on, plus (optionally) the shuffle-bag state tracking which
    connector opener categories have been used so far this tour, and the
    literal text of the most recent connector transition — see
    generate_connector() in app/services/openai_service.py.

    Tries progressively smaller sets of fields, newest-first, and keeps
    whichever subset the current schema actually supports — e.g. if
    012_connector_last_transition.sql hasn't been run yet but
    011_connector_opener_rotation.sql has, a single combined update
    would fail on the missing column and (with a single all-or-nothing
    fallback) silently drop used_connector_openers too, even though
    that one IS supported. A layered fallback keeps each already-shipped
    feature working independently of whether a newer one's migration
    has landed yet.
    """
    client = _get_client()
    attempts = [{"narrative_summary": summary}]
    if used_connector_openers is not None:
        attempts.append({**attempts[-1], "used_connector_openers": used_connector_openers})
    if last_connector_transition is not None:
        attempts.append({**attempts[-1], "last_connector_transition": last_connector_transition})

    for updates in reversed(attempts):
        try:
            client.table("tours").update(updates).eq("id", tour_id).execute()
            return True
        except Exception as e:
            logger.error(f"Failed to update narrative summary (fields={list(updates.keys())}) for tour {tour_id}: {e}")

    return False


async def get_tours_by_user(creator_id: str, limit: int = 20):
    """Get a user's tours, most recent first. Returns a list (empty on failure)."""
    try:
        client = _get_client()
        result = (
            client.table("tours")
            .select("*")
            .eq("creator_id", creator_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data if result.data else []
    except Exception as e:
        logger.error(f"Failed to get tours for user: {e}")
        return []


async def save_tour_block(
    tour_id: str,
    sequence: int,
    street_name: str,
    neighborhood: str,
    city: str,
    lat: float,
    lng: float,
    narration_text: str,
    audio_r2_key: str,
    voice: str,
    mood: str,
    trigger_type: str,
    image_r2_key: str = None,
):
    """Save a narrated block as part of an active tour."""
    try:
        client = _get_client()
        result = (
            client.table("tour_blocks")
            .insert({
                "tour_id": tour_id,
                "sequence": sequence,
                "street_name": street_name,
                "neighborhood": neighborhood,
                "city": city,
                "lat": lat,
                "lng": lng,
                "narration_text": narration_text,
                "audio_r2_key": audio_r2_key,
                "voice": voice,
                "mood": mood,
                "trigger_type": trigger_type,
                "image_r2_key": image_r2_key,
            })
            .execute()
        )
        if result.data:
            logger.info(f"Saved block #{sequence} for tour {tour_id[:8]}...")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to save tour block: {e}")
        return None


async def get_tour_blocks(tour_id: str):
    """Get all blocks for a tour, ordered by sequence."""
    try:
        client = _get_client()
        result = (
            client.table("tour_blocks")
            .select("*")
            .eq("tour_id", tour_id)
            .order("sequence")
            .execute()
        )
        return result.data if result.data else []
    except Exception as e:
        logger.error(f"Failed to get tour blocks: {e}")
        return []


async def end_tour(
    tour_id: str,
    title: str,
    blocks_visited: int,
    total_distance_m: int = None,
    duration_sec: int = None,
    center_lat: float = None,
    center_lng: float = None,
    city: str = None,
    location: str = None,
    path_points: list = None,
):
    """Finalize a tour with stats and title.

    `location` is an EWKT string (e.g. "SRID=4326;POINT(lng lat)") — PostGIS
    parses this directly through PostgREST, verified against the live DB.
    Populating it is what makes the tour findable via the nearby_tours()
    spatial query once published.
    """
    try:
        client = _get_client()
        update_data = {
            "title": title,
            "blocks_visited": blocks_visited,
        }
        if total_distance_m is not None:
            update_data["total_distance_m"] = total_distance_m
        if duration_sec is not None:
            update_data["duration_sec"] = duration_sec
        if center_lat is not None:
            update_data["center_lat"] = center_lat
        if center_lng is not None:
            update_data["center_lng"] = center_lng
        if city is not None:
            update_data["city"] = city
        if location is not None:
            update_data["location"] = location
        if path_points is not None:
            update_data["path_points"] = path_points

        result = (
            client.table("tours")
            .update(update_data)
            .eq("id", tour_id)
            .execute()
        )
        if result.data:
            logger.info(f"Ended tour {tour_id[:8]}...: '{title}' ({blocks_visited} blocks)")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to end tour: {e}")
        return None


async def delete_tour(tour_id: str) -> bool:
    """Permanently delete a tour row. Blocks/likes/comments/ratings cascade from it."""
    try:
        client = _get_client()
        client.table("tours").delete().eq("id", tour_id).execute()
        logger.info(f"Deleted tour {tour_id[:8]}...")
        return True
    except Exception as e:
        logger.error(f"Failed to delete tour: {e}")
        return False


# =============================================================================
# Routes — publish, discover, rate (reuses ratings table + nearby_tours() SQL
# function already defined in 001_initial_schema.sql)
# =============================================================================

async def publish_tour(tour_id: str, is_public: bool, title: str = None):
    """Flip a tour's visibility and optionally rename it. Returns the updated row or None."""
    try:
        client = _get_client()
        update_data = {"is_public": is_public}
        if title is not None:
            update_data["title"] = title

        result = (
            client.table("tours")
            .update(update_data)
            .eq("id", tour_id)
            .execute()
        )
        if result.data:
            logger.info(f"Tour {tour_id[:8]}... publish set to is_public={is_public}")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to publish tour: {e}")
        return None


async def get_tour_with_creator(tour_id: str):
    """Get a tour joined with its creator's display_name/avatar_url. Returns dict or None."""
    try:
        client = _get_client()
        result = (
            client.table("tours")
            # Explicit relationship name required since tour_likes (added in
            # 008_social_and_voices.sql) also has FKs to both tours and
            # users, making the bare "users(...)" embed shorthand ambiguous
            # — PostgREST error PGRST201, "more than one relationship found".
            .select("*, users!tours_creator_id_fkey(display_name, avatar_url)")
            .eq("id", tour_id)
            .limit(1)
            .execute()
        )
        if result.data and len(result.data) > 0:
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to get tour with creator: {e}")
        return None


async def get_nearby_tours(
    user_lat: float,
    user_lng: float,
    radius_m: int = 5000,
    mood_filter: str = None,
    tour_type_filter: str = None,
    limit_count: int = 20,
    offset_count: int = 0,
    sort_by: str = "distance",
):
    """
    Find public routes near a location via the nearby_tours() SQL function.

    sort_by: "distance" (default — closest first, what Discover uses) or
    "rating" (highest avg_rating first, ties broken by rating_count — what
    the home screen's map pins use). Returns a list.
    """
    try:
        client = _get_client()
        result = client.rpc("nearby_tours", {
            "user_lat": user_lat,
            "user_lng": user_lng,
            "radius_m": radius_m,
            "mood_filter": mood_filter,
            "tour_type_filter": tour_type_filter,
            "limit_count": limit_count,
            "offset_count": offset_count,
            "sort_by": sort_by,
        }).execute()
        return result.data if result.data else []
    except Exception as e:
        logger.error(f"Failed to get nearby tours: {e}")
        return []


async def rate_tour(tour_id: str, user_id: str, score: int):
    """
    Upsert a 1-5 rating for a tour. The on_rating_change trigger (see
    001_initial_schema.sql) automatically recalculates tours.avg_rating and
    rating_count — we just re-fetch the tour afterward to return them.
    """
    try:
        client = _get_client()
        client.table("ratings").upsert(
            {"tour_id": tour_id, "user_id": user_id, "score": score},
            on_conflict="tour_id,user_id",
        ).execute()

        tour = await get_tour(tour_id)
        if tour:
            return {
                "tour_id": tour_id,
                "score": score,
                "avg_rating": tour.get("avg_rating", 0),
                "rating_count": tour.get("rating_count", 0),
            }
        return None
    except Exception as e:
        logger.error(f"Failed to rate tour: {e}")
        return None


# =============================================================================
# User settings (Week 2)
# =============================================================================

async def get_user_settings(user_id: str):
    """Get user settings. Returns dict or None."""
    try:
        client = _get_client()
        result = (
            client.table("users")
            .select("preferred_voice, content_safety, anonymous_default, display_name, is_premium")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if result.data and len(result.data) > 0:
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to get user settings: {e}")
        return None


async def get_user_premium_status(user_id: str) -> bool:
    """
    Whether the user currently has an active premium entitlement.

    Fails closed (False) on any error or missing row — deny premium
    access on uncertainty rather than risk granting it.
    """
    try:
        client = _get_client()
        result = (
            client.table("users")
            .select("is_premium")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if result.data and len(result.data) > 0:
            return bool(result.data[0].get("is_premium"))
        return False
    except Exception as e:
        logger.error(f"Failed to get premium status: {e}")
        return False


async def update_user_settings(user_id: str, updates: dict):
    """Update user settings. Returns updated dict or None."""
    try:
        client = _get_client()
        result = (
            client.table("users")
            .update(updates)
            .eq("id", user_id)
            .execute()
        )
        if result.data:
            logger.info(f"Updated settings for user {user_id[:8]}...")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Failed to update user settings: {e}")
        return None


async def set_premium_status(user_id: str, is_premium: bool) -> bool:
    """
    Sets a user's premium entitlement. Only called from the RevenueCat
    webhook handler (app/api/webhooks.py) after verifying the request —
    deliberately separate from update_user_settings, whose request schema
    has no is_premium field, so a client can never set this on itself.
    """
    try:
        client = _get_client()
        client.table("users").update({"is_premium": is_premium}).eq("id", user_id).execute()
        logger.info(f"Set is_premium={is_premium} for user {user_id[:8]}...")
        return True
    except Exception as e:
        logger.error(f"Failed to set premium status: {e}")
        return False


async def delete_user_account(user_id: str) -> bool:
    """
    Permanently deletes the user's auth record. Every foreign key in the
    schema (tours, ratings, comments, tour_likes, tour_shares,
    content_reports, user_rate_limits) cascades from auth.users, so this
    alone removes all of a user's data cleanly — no separate cleanup needed.
    """
    try:
        client = _get_client()
        client.auth.admin.delete_user(user_id)
        logger.info(f"Deleted account for user {user_id[:8]}...")
        return True
    except Exception as e:
        logger.error(f"Failed to delete user account: {e}")
        return False


async def get_user_stats(user_id: str) -> dict:
    """
    Aggregate stats for gamification badges, computed from existing tour
    rows rather than a separate stats table. Only counts tours that were
    actually walked (blocks_visited > 0), so an abandoned tour that never
    got past start-tour doesn't inflate the count.
    """
    empty = {
        "tours_completed": 0,
        "total_distance_m": 0,
        "cities_visited": 0,
        "moods_tried": [],
        "routes_published": 0,
        "total_likes_received": 0,
        "walked_at_night": False,
        "walked_early": False,
    }
    try:
        client = _get_client()
        result = (
            client.table("tours")
            .select("id, total_distance_m, city, blocks_visited, mood, is_public, created_at")
            .eq("creator_id", user_id)
            .gt("blocks_visited", 0)
            .execute()
        )
        rows = result.data if result.data else []
        if not rows:
            return empty

        tour_ids = [r["id"] for r in rows if r.get("id")]

        walked_at_night = False
        walked_early = False
        for r in rows:
            created_at = r.get("created_at")
            if not created_at:
                continue
            try:
                hour = datetime.fromisoformat(created_at.replace("Z", "+00:00")).hour
            except ValueError:
                continue
            if hour >= 20 or hour < 5:
                walked_at_night = True
            if 5 <= hour < 8:
                walked_early = True

        total_likes_received = 0
        if tour_ids:
            likes_result = (
                client.table("tour_likes")
                .select("tour_id", count="exact")
                .in_("tour_id", tour_ids)
                .execute()
            )
            total_likes_received = likes_result.count or 0

        return {
            "tours_completed": len(rows),
            "total_distance_m": sum(r.get("total_distance_m") or 0 for r in rows),
            "cities_visited": len({r["city"] for r in rows if r.get("city")}),
            "moods_tried": sorted({r["mood"] for r in rows if r.get("mood")}),
            "routes_published": sum(1 for r in rows if r.get("is_public")),
            "total_likes_received": total_likes_received,
            "walked_at_night": walked_at_night,
            "walked_early": walked_early,
        }
    except Exception as e:
        logger.error(f"Failed to get user stats: {e}")
        return empty


# =============================================================================
# Social — comments and likes
# =============================================================================

async def get_comments(tour_id: str):
    """Get all comments on a tour, oldest first, with commenter display name."""
    try:
        client = _get_client()
        result = (
            client.table("comments")
            .select("*, users(display_name)")
            .eq("tour_id", tour_id)
            .order("created_at")
            .execute()
        )
        return result.data if result.data else []
    except Exception as e:
        logger.error(f"Failed to get comments: {e}")
        return []


async def create_comment(tour_id: str, user_id: str, body: str, is_anonymous: bool = False):
    """Post a comment. Returns the created row or None."""
    try:
        client = _get_client()
        result = (
            client.table("comments")
            .insert({
                "tour_id": tour_id,
                "user_id": user_id,
                "body": body,
                "is_anonymous": is_anonymous,
            })
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as e:
        logger.error(f"Failed to create comment: {e}")
        return None


async def get_like_status(tour_id: str, user_id: str):
    """Returns (like_count: int, liked_by_me: bool) without mutating anything."""
    try:
        client = _get_client()
        count_result = (
            client.table("tour_likes")
            .select("tour_id", count="exact")
            .eq("tour_id", tour_id)
            .execute()
        )
        mine = (
            client.table("tour_likes")
            .select("tour_id")
            .eq("tour_id", tour_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return (count_result.count or 0), bool(mine.data)
    except Exception as e:
        logger.error(f"Failed to get like status: {e}")
        return 0, False


async def toggle_like(tour_id: str, user_id: str):
    """
    Toggle a like: insert if not already liked, delete if already liked.
    Returns (liked: bool, like_count: int) reflecting the state after the
    change.
    """
    try:
        client = _get_client()
        existing = (
            client.table("tour_likes")
            .select("tour_id")
            .eq("tour_id", tour_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            client.table("tour_likes").delete().eq("tour_id", tour_id).eq("user_id", user_id).execute()
            liked = False
        else:
            client.table("tour_likes").insert({"tour_id": tour_id, "user_id": user_id}).execute()
            liked = True

        count_result = (
            client.table("tour_likes")
            .select("tour_id", count="exact")
            .eq("tour_id", tour_id)
            .execute()
        )
        return liked, (count_result.count or 0)
    except Exception as e:
        logger.error(f"Failed to toggle like: {e}")
        return False, 0


# =============================================================================
# Voice preview samples
# =============================================================================

async def get_voice_sample_key(voice: str):
    """Returns the cached R2 key for a voice's sample clip, or None if it hasn't been generated yet."""
    try:
        client = _get_client()
        result = (
            client.table("voice_samples")
            .select("r2_key")
            .eq("voice", voice)
            .limit(1)
            .execute()
        )
        return result.data[0]["r2_key"] if result.data else None
    except Exception as e:
        logger.error(f"Failed to get voice sample: {e}")
        return None


async def store_voice_sample_key(voice: str, r2_key: str) -> bool:
    try:
        client = _get_client()
        client.table("voice_samples").upsert(
            {"voice": voice, "r2_key": r2_key},
            on_conflict="voice",
        ).execute()
        return True
    except Exception as e:
        logger.error(f"Failed to store voice sample: {e}")
        return False