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
    data_highlights: dict = None,
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
                "data_highlights": data_highlights,
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
# Tour session management (Week 2)
# =============================================================================

async def create_tour(
    creator_id: str,
    mood: str,
    voice: str,
    tour_type: str,
    content_safety: bool,
):
    """Create a new tour record. Returns the tour dict or None."""
    try:
        client = _get_client()
        result = (
            client.table("tours")
            .insert({
                "creator_id": creator_id,
                "mood": mood,
                "tour_type": tour_type,
                "content_safety_on": content_safety,
                "is_public": True,
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


async def save_tour_block(
    tour_id: str,
    sequence: int,
    street_name: str,
    neighborhood: str,
    lat: float,
    lng: float,
    narration_text: str,
    audio_r2_key: str,
    voice: str,
    mood: str,
    trigger_type: str,
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
                "lat": lat,
                "lng": lng,
                "narration_text": narration_text,
                "audio_r2_key": audio_r2_key,
                "voice": voice,
                "mood": mood,
                "trigger_type": trigger_type,
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
):
    """Finalize a tour with stats and title."""
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


# =============================================================================
# User settings (Week 2)
# =============================================================================

async def get_user_settings(user_id: str):
    """Get user settings. Returns dict or None."""
    try:
        client = _get_client()
        result = (
            client.table("users")
            .select("preferred_voice, content_safety, anonymous_default, display_name")
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