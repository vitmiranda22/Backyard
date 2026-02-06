"""
POST /narrate-block — The core endpoint of WanderVox.

This is where the magic happens. A user sends their GPS coordinates and
preferences, and we return a narration with streamable audio. Here's the
full pipeline this endpoint orchestrates:

1. Validate the request (Pydantic does this automatically)
2. Compute a geohash from the GPS coordinates (for caching)
3. Check narration cache → if HIT, skip to step 6
4. Reverse geocode the coordinates → street name, neighborhood, city
5. Call Gemini AI to generate a narration (with web search grounding)
6. Store the narration in cache
7. Check audio cache → if HIT, return signed URL immediately
8. Call Google TTS to convert narration text → MP3
9. Upload MP3 to Cloudflare R2
10. Store audio file record in database
11. Generate a signed URL for the MP3
12. Return everything to the client

On a cache hit (step 3), the response time is ~200ms.
On a full miss (all steps), the response time is ~8-12 seconds.
After the first user visits a zone, everyone else gets cache hits.
"""

import logging
import geohash2

from fastapi import APIRouter, HTTPException

from app.api.auth import AuthenticatedUser
from app.models.schemas import (
    NarrateBlockRequest,
    NarrateBlockResponse,
    ErrorResponse,
    ZoneDataUsed,
)
from app.services import geocode, gemini, tts, r2, supabase_db

logger = logging.getLogger(__name__)

router = APIRouter()

# Geohash precision 7 = roughly 150m × 150m zones.
# This is the "zone size" — users within the same 150m square share narrations.
# Too small = too many unique zones, cache never hits.
# Too big = narrations feel generic ("you're somewhere in the Mission").
GEOHASH_PRECISION = 7


@router.post(
    "/narrate-block",
    response_model=NarrateBlockResponse,
    responses={
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
        408: {"model": ErrorResponse, "description": "Generation timed out"},
        500: {"model": ErrorResponse, "description": "Internal error"},
    },
    summary="Generate a narration for the user's current location",
    description=(
        "The core endpoint. Send GPS coordinates + mood + voice, "
        "get back a narration with streamable audio."
    ),
)
async def narrate_block(
    request: NarrateBlockRequest,
    user_id: AuthenticatedUser,
):
    """
    Main narration pipeline. See module docstring for the full flow.
    """
    # --- Step 1: Compute geohash for this location ---
    geo_hash = geohash2.encode(request.lat, request.lng, precision=GEOHASH_PRECISION)
    logger.info(
        f"Narration request: user={user_id[:8]}... "
        f"location=({request.lat}, {request.lng}) "
        f"geohash={geo_hash} mood={request.mood.value} "
        f"voice={request.voice.value} safety={'on' if request.content_safety else 'off'}"
    )

    # --- Step 2: Check narration cache ---
    cached_narration = await supabase_db.get_cached_narration(
        geo_hash=geo_hash,
        mood=request.mood.value,
        content_safety=request.content_safety,
    )

    narration_text = None
    narration_cache_id = None
    street_name = ""
    neighborhood = ""
    city = ""
    was_cached = False

    if cached_narration:
        # Cache hit — we already have a narration for this zone + mood
        narration_text = cached_narration["narration_text"]
        narration_cache_id = cached_narration["id"]
        # We still need location info for the response.
        # In a full implementation we'd store this in the cache too.
        # For now, do a quick geocode anyway (it's fast and free).
        was_cached = True

    # --- Step 3: Reverse geocode (always, even on cache hit, for response data) ---
    geo_result = await geocode.reverse_geocode(request.lat, request.lng)
    if geo_result:
        street_name = geo_result.street
        neighborhood = geo_result.neighborhood
        city = geo_result.city
    else:
        # Geocoding failed — use generic location info
        street_name = f"Location ({request.lat:.4f}, {request.lng:.4f})"
        neighborhood = "Unknown"
        city = "Unknown"

    # --- Step 4: Generate narration if not cached ---
    if narration_text is None:
        narration_text = await gemini.generate_narration(
            street=street_name,
            neighborhood=neighborhood,
            city=city,
            country=geo_result.country if geo_result else "Unknown",
            mood=request.mood.value,
            content_safety=request.content_safety,
            zone_data=None,  # Week 3: this will have DataSF data
        )

        if narration_text is None:
            # Gemini failed — return an error but keep the tour alive
            raise HTTPException(
                status_code=408,
                detail={
                    "error": "Couldn't generate a narration for this spot. Keep walking — we'll try again at the next block.",
                    "code": "generation_failed",
                    "retry": True,
                },
            )

        # --- Step 5: Cache the narration ---
        stored = await supabase_db.store_narration(
            geo_hash=geo_hash,
            mood=request.mood.value,
            content_safety=request.content_safety,
            narration_text=narration_text,
        )
        if stored:
            narration_cache_id = stored["id"]

    # --- Step 6: Handle audio ---
    audio_url = None
    audio_duration_ms = None

    # Build the R2 key for this specific narration + voice combo
    r2_key = r2.build_r2_key(
        geo_hash=geo_hash,
        mood=request.mood.value,
        content_safety=request.content_safety,
        voice=request.voice.value,
    )

    # Check if audio already exists on R2
    audio_exists = await r2.check_audio_exists(r2_key)

    if audio_exists:
        # Audio cache hit — just generate a signed URL
        audio_url = r2.generate_signed_url(r2_key)
        # Try to get duration from DB
        if narration_cache_id:
            cached_audio = await supabase_db.get_cached_audio(
                narration_cache_id, request.voice.value
            )
            if cached_audio:
                audio_duration_ms = cached_audio.get("duration_ms")
        if not audio_duration_ms:
            audio_duration_ms = tts.estimate_duration_ms(narration_text, request.voice.value)
    else:
        # Audio cache miss — generate TTS, upload to R2
        audio_bytes = await tts.synthesize_speech(
            text=narration_text,
            voice=request.voice.value,
        )

        if audio_bytes:
            # Upload to R2
            upload_ok = await r2.upload_audio(audio_bytes, r2_key)
            if upload_ok:
                audio_url = r2.generate_signed_url(r2_key)
                audio_duration_ms = tts.estimate_duration_ms(
                    narration_text, request.voice.value
                )

                # Track the audio file in the database
                if narration_cache_id:
                    await supabase_db.store_audio_file(
                        narration_cache_id=narration_cache_id,
                        voice=request.voice.value,
                        r2_key=r2_key,
                        file_size_bytes=len(audio_bytes),
                        duration_ms=audio_duration_ms,
                        tts_provider="google",
                    )
        else:
            # TTS failed — we still return the narration text.
            # The client can fall back to device TTS.
            logger.warning("TTS failed — returning text-only response")

    # --- Step 7: Build and return the response ---
    return NarrateBlockResponse(
        street_name=street_name,
        neighborhood=neighborhood,
        city=city,
        narration_text=narration_text,
        audio_url=audio_url,
        audio_duration_ms=audio_duration_ms,
        mood=request.mood,
        content_safety_applied=request.content_safety,
        cached=was_cached,
        zone_data_used=None,  # Week 3: will include data source highlights
    )
