"""
Go deeper -- an opt-in, multi-chapter story about one rich place, the way a
human guide stops and spends 10 minutes on a single building.

  POST /api/deep-dive/outline -- story title + chapter titles (no audio)
  POST /api/deep-dive/chapter -- one ~2 min chapter: text + audio

Premium only. Built from the block's cached zone data (narrate-block always
fills that cache before it can say deep_dive_available=true), and chapters
are generated one at a time as the walker reaches them, so a walker who
leaves after chapter 1 never pays for chapters 2-4. Stateless: the client
sends the outline back with each chapter request.
"""

import uuid

import geohash2
from fastapi import APIRouter, HTTPException

from app.api.auth import AuthenticatedUser
from app.config import settings, UNLIMITED_TEST_ACCOUNT_IDS
from app.models.schemas import (
    DeepDiveOutlineRequest,
    DeepDiveOutlineResponse,
    DeepDiveChapterRequest,
    DeepDiveChapterResponse,
)
from app.services import openai_service, tts, r2, supabase_db
from app.services.zone_data import format_zone_data_for_prompt, should_skip_web_search

router = APIRouter()

GEOHASH_PRECISION = 7  # must match narrate.py: same cell, same zone_data_cache row
MAX_CHAPTER_TITLE_CHARS = 120


async def _require_premium(user_id: str):
    if not await supabase_db.get_user_premium_status(user_id):
        raise HTTPException(
            status_code=403,
            detail={"error": "Go deeper is a premium feature. Upgrade to unlock it.", "code": "premium_required", "retry": False},
        )


async def _rich_zone(lat: float, lng: float, mood: str) -> tuple:
    """(cached zone row, zone data formatted for the prompt), or 404 when this spot isn't rich enough."""
    zone = await supabase_db.get_cached_zone_data(geohash2.encode(lat, lng, precision=GEOHASH_PRECISION))
    if not zone or not should_skip_web_search(zone.get("sources_hit_count"), zone.get("sources_eligible_count")):
        raise HTTPException(
            status_code=404,
            detail={"error": "There isn't enough history here for a deeper story.", "code": "deep_dive_unavailable", "retry": False},
        )
    return zone, format_zone_data_for_prompt(zone.get("raw_data") or {}, mode=mood)


@router.post("/deep-dive/outline", response_model=DeepDiveOutlineResponse, summary="Plan a Go deeper story")
async def deep_dive_outline(request: DeepDiveOutlineRequest, user_id: AuthenticatedUser):
    await _require_premium(user_id)
    # Per-minute guard only: an outline is one small LLM call, not worth a
    # slot of the daily narration budget the chapters draw from.
    if user_id not in UNLIMITED_TEST_ACCOUNT_IDS:
        allowed, _ = await supabase_db.check_minute_rate_limit(user_id, settings.MINUTE_NARRATION_LIMIT)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail={"error": "Slow down a bit and try again in a moment.", "code": "minute_limit_exceeded", "retry": True},
            )

    zone, zone_data = await _rich_zone(request.lat, request.lng, request.mood.value)
    outline = await openai_service.generate_deep_dive_outline(
        street=zone.get("street_name") or "this spot",
        neighborhood=zone.get("neighborhood") or "",
        city=zone.get("city") or "",
        mood=request.mood.value,
        zone_data=zone_data,
    )
    if not outline:
        raise HTTPException(
            status_code=408,
            detail={"error": "Couldn't plan that story. Try again.", "code": "outline_failed", "retry": True},
        )
    return DeepDiveOutlineResponse(**outline)


@router.post("/deep-dive/chapter", response_model=DeepDiveChapterResponse, summary="Generate one Go deeper chapter")
async def deep_dive_chapter(request: DeepDiveChapterRequest, user_id: AuthenticatedUser):
    # Client-supplied outline goes straight into a prompt: bound it.
    if request.index >= len(request.chapters) or any(
        not c.strip() or len(c) > MAX_CHAPTER_TITLE_CHARS for c in request.chapters
    ):
        raise HTTPException(
            status_code=400,
            detail={"error": "That chapter doesn't exist.", "code": "invalid_chapter", "retry": False},
        )

    await _require_premium(user_id)
    # A chapter costs about what two narrations do, so it draws from the same
    # daily narration budget instead of opening a separate unmetered pool.
    if user_id not in UNLIMITED_TEST_ACCOUNT_IDS:
        allowed, reason = await supabase_db.check_rate_limit(
            user_id,
            minute_limit=settings.MINUTE_NARRATION_LIMIT,
            daily_limit=settings.DAILY_NARRATION_LIMIT_PREMIUM,
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "Slow down a bit and try again in a moment."
                    if reason == "minute_limit_exceeded"
                    else "You've hit today's narration limit. Try again tomorrow.",
                    "code": reason,
                    "retry": reason == "minute_limit_exceeded",
                },
            )

    # Same age gate as narrate_block's Step 0.6: mature content is a ceiling
    # only a confirmed adult can raise.
    content_safety = request.content_safety
    if content_safety and await supabase_db.is_user_underage(user_id):
        content_safety = False

    zone, zone_data = await _rich_zone(request.lat, request.lng, request.mood.value)
    text = await openai_service.generate_deep_dive_chapter(
        street=zone.get("street_name") or "this spot",
        neighborhood=zone.get("neighborhood") or "",
        city=zone.get("city") or "",
        mood=request.mood.value,
        content_safety=content_safety,
        zone_data=zone_data,
        title=request.title,
        chapters=request.chapters,
        index=request.index,
    )
    if not text:
        raise HTTPException(
            status_code=408,
            detail={"error": "Couldn't tell that chapter. Try again.", "code": "chapter_failed", "retry": True},
        )

    audio_url = None
    audio_duration_ms = None
    audio_bytes = await tts.synthesize_speech(text=text, voice=request.voice.value)
    if audio_bytes:
        r2_key = f"audio/deep-dive/{uuid.uuid4().hex}.mp3"
        if await r2.upload_audio(audio_bytes, r2_key):
            audio_url = r2.generate_signed_url(r2_key)
            audio_duration_ms = tts.estimate_duration_ms(text, request.voice.value)

    return DeepDiveChapterResponse(text=text, audio_url=audio_url, audio_duration_ms=audio_duration_ms)
