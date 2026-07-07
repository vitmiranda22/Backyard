"""
POST /narrate-block — The core endpoint of Backyard.

Full pipeline:
1. Compute geohash from GPS coordinates
2. Check narration cache → HIT? Skip to step 7
3. Reverse geocode → street name, neighborhood, city
4. Check zone data cache → HIT? Skip to step 6
5. Fetch ALL 23 data sources in parallel (~2-4 seconds)
6. Feed zone data to Gemini → generate narration
7. TTS → MP3
8. Upload to R2 → signed URL
9. Return to client

Two cache layers:
- Zone data cache: raw data per zone (mood-agnostic, shared across moods)
- Narration cache: AI-generated text per zone + mood + safety combo
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
from app.services.zone_data import fetch_all_zone_data, format_zone_data_for_prompt

logger = logging.getLogger(__name__)

router = APIRouter()

GEOHASH_PRECISION = 7


@router.post(
    "/narrate-block",
    response_model=NarrateBlockResponse,
    responses={
        429: {"model": ErrorResponse},
        408: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Generate a narration for the user's current location",
)
async def narrate_block(
    request: NarrateBlockRequest,
    user_id: AuthenticatedUser,
):
    # --- Step 1: Compute geohash ---
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
    country = ""
    was_cached = False
    zone_data_used = None

    if cached_narration:
        narration_text = cached_narration["narration_text"]
        narration_cache_id = cached_narration["id"]
        was_cached = True

    # --- Step 3: Reverse geocode ---
    geo_result = await geocode.reverse_geocode(request.lat, request.lng)
    if geo_result:
        street_name = geo_result.street
        neighborhood = geo_result.neighborhood
        city = geo_result.city
        country = geo_result.country
    else:
        street_name = f"Location ({request.lat:.4f}, {request.lng:.4f})"
        neighborhood = "Unknown"
        city = "Unknown"
        country = "Unknown"

    # --- Step 4-6: Generate narration if not cached ---
    if narration_text is None:
        # Step 4: Check zone data cache
        zone_data_str = None
        cached_zone = await supabase_db.get_cached_zone_data(geo_hash)

        if cached_zone:
            # Zone data cache HIT — use stored data
            logger.info(f"Zone data cache HIT for {geo_hash}")
            raw_data = cached_zone.get("raw_data", {})
            zone_data_str = format_zone_data_for_prompt(raw_data)

            sources_hit = [k for k, v in raw_data.items() if v]
            zone_data_used = ZoneDataUsed(
                sources_hit=sources_hit,
            )
        else:
            # Step 5: Fetch ALL 23 sources in parallel
            logger.info(f"Zone data cache MISS for {geo_hash} — fetching all sources...")
            result = await fetch_all_zone_data(
                lat=request.lat,
                lng=request.lng,
                street_name=street_name,
                neighborhood=neighborhood,
                city=city,
            )

            raw_data = result["zone_data"]
            sources_queried = result["sources_queried"]
            sources_failed = result["sources_failed"]

            # Format for prompt
            zone_data_str = format_zone_data_for_prompt(raw_data)

            # Store in zone data cache
            await supabase_db.store_zone_data(
                geo_hash=geo_hash,
                street_name=street_name,
                neighborhood=neighborhood,
                city=city,
                country=country,
                raw_data=raw_data,
                sources_queried=sources_queried,
                sources_failed=sources_failed,
            )

            sources_hit = [k for k, v in raw_data.items() if v]
            zone_data_used = ZoneDataUsed(
                sources_hit=sources_hit,
            )

            logger.info(
                f"Zone data fetched: {len(sources_hit)} sources with data, "
                f"{len(sources_failed)} failed"
            )

        # Step 6: Call Gemini with zone data
        narration_text = await gemini.generate_narration(
            street=street_name,
            neighborhood=neighborhood,
            city=city,
            country=country,
            mood=request.mood.value,
            content_safety=request.content_safety,
            zone_data=zone_data_str,
        )

        if narration_text is None:
            raise HTTPException(
                status_code=408,
                detail={
                    "error": "Couldn't generate a narration for this spot. Keep walking — we'll try again at the next block.",
                    "code": "generation_failed",
                    "retry": True,
                },
            )

        # Cache the narration
        stored = await supabase_db.store_narration(
            geo_hash=geo_hash,
            mood=request.mood.value,
            content_safety=request.content_safety,
            narration_text=narration_text,
        )
        if stored:
            narration_cache_id = stored["id"]

    # --- Step 7-8: Handle audio ---
    audio_url = None
    audio_duration_ms = None

    r2_key = r2.build_r2_key(
        geo_hash=geo_hash,
        mood=request.mood.value,
        content_safety=request.content_safety,
        voice=request.voice.value,
    )

    audio_exists = await r2.check_audio_exists(r2_key)

    if audio_exists:
        audio_url = r2.generate_signed_url(r2_key)
        if narration_cache_id:
            cached_audio = await supabase_db.get_cached_audio(
                narration_cache_id, request.voice.value
            )
            if cached_audio:
                audio_duration_ms = cached_audio.get("duration_ms")
        if not audio_duration_ms:
            audio_duration_ms = tts.estimate_duration_ms(narration_text, request.voice.value)
    else:
        audio_bytes = await tts.synthesize_speech(
            text=narration_text,
            voice=request.voice.value,
        )

        if audio_bytes:
            upload_ok = await r2.upload_audio(audio_bytes, r2_key)
            if upload_ok:
                audio_url = r2.generate_signed_url(r2_key)
                audio_duration_ms = tts.estimate_duration_ms(narration_text, request.voice.value)

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
            logger.warning("TTS failed — returning text-only response")

    # --- Step 9: Return ---
    return NarrateBlockResponse(
        street_name=street_name,
        neighborhood=neighborhood,
        city=city,
        narration_text=narration_text,
        audio_url=audio_url,
        audio_r2_key=r2_key if audio_url else None,
        audio_duration_ms=audio_duration_ms,
        mood=request.mood,
        content_safety_applied=request.content_safety,
        cached=was_cached,
        zone_data_used=zone_data_used,
    )