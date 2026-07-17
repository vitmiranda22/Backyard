"""
User settings endpoints.

  GET    /api/user/settings  — Get current user preferences
  PATCH  /api/user/settings  — Update user preferences
  DELETE /api/user/account   — Permanently delete the account
  GET    /api/user/stats     — Aggregate stats for gamification badges
  GET    /api/voices/sample  — Preview clip for a narration voice
  GET    /api/moods/sample   — Preview clip for a mood's distinct voice
"""

import logging
from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.api.auth import AuthenticatedUser
from app.models.schemas import (
    UserSettingsResponse,
    UpdateSettingsRequest,
    UserStatsResponse,
    VoiceSampleResponse,
    ErrorResponse,
)
from app.services import supabase_db, tts, r2, elevenlabs_service

logger = logging.getLogger(__name__)

router = APIRouter()

# Fixed, non-personal phrases — synthesized once per voice and cached
# forever in voice_samples, so previewing a voice costs nothing after
# the first request. "signature" isn't a real Voice enum member (see
# app/models/schemas.py) — it's a preview-only teaser for the ElevenLabs
# voice, accepted here but nowhere a narration voice is actually selected.
SAMPLE_PHRASES = {
    "neutral": "This is the Neutral voice. Clear and balanced narration.",
    "dramatic": "This is the Dramatic voice. Bold, cinematic delivery.",
    "warm": "This is the Warm voice. A friendly, conversational tone.",
    "signature": "Explore your neighborhood with Backyard!",
}

SampleVoice = Literal["neutral", "dramatic", "warm", "signature"]

# One short, mood-flavored phrase per mood — synthesized once per
# (mood, tier) combo and cached forever in voice_samples, same pattern as
# SAMPLE_PHRASES above. Premium hears each mood's distinct ElevenLabs
# voice (elevenlabs_service.MOOD_VOICE_IDS); everyone else, and any
# ElevenLabs failure, falls back to the existing Google TTS sample
# mechanism (tts.synthesize_speech) instead of returning nothing.
MOOD_SAMPLE_PHRASES = {
    "time_machine": "Step back in time and see this street as it once was.",
    "hidden_city": "There's more to this block than meets the eye.",
    "dark_side": "Every street has its secrets — some darker than others.",
    "behind_scenes": "Lights, camera, history. Let's go behind the scenes.",
    "unfiltered": "No filter, no fluff. Just the real story.",
}

MoodKey = Literal["time_machine", "hidden_city", "dark_side", "behind_scenes", "unfiltered"]


@router.get(
    "/user/settings",
    response_model=UserSettingsResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Get current user settings",
)
async def get_settings(user_id: AuthenticatedUser):
    """
    Returns the user's current preferences:
    voice, content safety, anonymous default, display name.
    """
    user = await supabase_db.get_user_settings(user_id)

    if not user:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "User not found.",
                "code": "user_not_found",
                "retry": False,
            },
        )

    return UserSettingsResponse(
        preferred_voice=user.get("preferred_voice", "neutral"),
        content_safety=user.get("content_safety", False),
        anonymous_default=user.get("anonymous_default", False),
        display_name=user.get("display_name", ""),
        date_of_birth=user.get("date_of_birth"),
        is_premium=user.get("is_premium", False),
    )


@router.patch(
    "/user/settings",
    response_model=UserSettingsResponse,
    responses={
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Update user settings",
)
async def update_settings(
    request: UpdateSettingsRequest,
    user_id: AuthenticatedUser,
):
    """
    Update one or more user preferences.
    Only fields included in the request body are updated.
    """
    # Build update dict from only the fields that were provided
    updates = {}
    if request.preferred_voice is not None:
        updates["preferred_voice"] = request.preferred_voice.value
    if request.content_safety is not None:
        updates["content_safety"] = request.content_safety
    if request.anonymous_default is not None:
        updates["anonymous_default"] = request.anonymous_default
    if request.display_name is not None:
        updates["display_name"] = request.display_name.strip()[:50]
    if request.date_of_birth is not None:
        # Validated here rather than in the Pydantic model so a bad value
        # gets this endpoint's normal error shape instead of a generic
        # FastAPI 422 -- mirrors SignupScreen's client-side check, but
        # this is the version that actually matters (a client is never
        # trusted to have validated its own input).
        try:
            parsed = date.fromisoformat(request.date_of_birth)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={"error": "Invalid date of birth.", "code": "invalid_date_of_birth", "retry": False},
            )
        if parsed > date.today() or parsed.year < 1900:
            raise HTTPException(
                status_code=400,
                detail={"error": "Invalid date of birth.", "code": "invalid_date_of_birth", "retry": False},
            )
        updates["date_of_birth"] = parsed.isoformat()

    if not updates:
        # Nothing to update — just return current settings
        return await get_settings(user_id)

    logger.info(f"Updating settings for user={user_id[:8]}...: {list(updates.keys())}")

    updated = await supabase_db.update_user_settings(user_id, updates)

    if not updated:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to update settings.",
                "code": "settings_update_failed",
                "retry": True,
            },
        )

    return UserSettingsResponse(
        preferred_voice=updated.get("preferred_voice", "neutral"),
        content_safety=updated.get("content_safety", False),
        anonymous_default=updated.get("anonymous_default", False),
        display_name=updated.get("display_name", ""),
        date_of_birth=updated.get("date_of_birth"),
        is_premium=updated.get("is_premium", False),
    )


@router.delete(
    "/user/account",
    responses={500: {"model": ErrorResponse}},
    summary="Permanently delete the current user's account and all their data",
)
async def delete_account(user_id: AuthenticatedUser):
    """
    Deletes the auth.users row. Every foreign key in the schema cascades
    from there (tours, ratings, comments, likes, shares, reports, rate
    limits), so this alone removes all of a user's data — irreversible.
    """
    ok = await supabase_db.delete_user_account(user_id)
    if not ok:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to delete account. Please try again or contact support.",
                "code": "account_delete_failed",
                "retry": True,
            },
        )
    return {"deleted": True}


@router.get(
    "/user/stats",
    response_model=UserStatsResponse,
    summary="Aggregate stats for the current user, used for gamification badges",
)
async def get_user_stats(user_id: AuthenticatedUser):
    stats = await supabase_db.get_user_stats(user_id)
    return UserStatsResponse(**stats)


@router.get(
    "/voices/sample",
    response_model=VoiceSampleResponse,
    responses={500: {"model": ErrorResponse}},
    summary="Get a short preview clip for a narration voice",
)
async def get_voice_sample(user_id: AuthenticatedUser, voice: SampleVoice = Query(...)):
    r2_key = await supabase_db.get_voice_sample_key(voice)

    if not r2_key:
        phrase = SAMPLE_PHRASES.get(voice, SAMPLE_PHRASES["neutral"])
        if voice == "signature":
            audio_bytes = await elevenlabs_service.synthesize_speech(phrase)
            if not audio_bytes:
                # ELEVENLABS_VOICE_ID isn't set (or ElevenLabs failed) --
                # fall back to Google TTS's premium (Journey) voice rather
                # than failing outright, same graceful-degradation pattern
                # already used for the per-mood previews.
                audio_bytes = await tts.synthesize_speech(text=phrase, voice="neutral")
        else:
            audio_bytes = await tts.synthesize_speech(text=phrase, voice=voice)
        if not audio_bytes:
            raise HTTPException(
                status_code=500,
                detail={"error": "Couldn't generate a voice sample right now.", "code": "sample_failed", "retry": True},
            )
        r2_key = f"voice-samples/{voice}.mp3"
        if not await r2.upload_audio(audio_bytes, r2_key):
            raise HTTPException(
                status_code=500,
                detail={"error": "Couldn't generate a voice sample right now.", "code": "sample_failed", "retry": True},
            )
        await supabase_db.store_voice_sample_key(voice, r2_key)

    return VoiceSampleResponse(voice=voice, audio_url=r2.generate_signed_url(r2_key))


@router.get(
    "/moods/sample",
    response_model=VoiceSampleResponse,
    responses={500: {"model": ErrorResponse}},
    summary="Get a short preview clip for a mood's distinct voice",
)
async def get_mood_sample(user_id: AuthenticatedUser, mood: MoodKey = Query(...)):
    is_premium = await supabase_db.get_user_premium_status(user_id)

    # Cache key reflects which engine actually produced the audio, NOT
    # just the requesting user's tier -- premium (ElevenLabs) and
    # free/fallback (Google TTS) audio for the same mood aren't
    # interchangeable, same reasoning as narrate.py's tier-aware
    # narration/audio cache keys. This distinction matters because
    # ElevenLabs can fail for a premium user too (e.g. account not
    # upgraded yet, rate limited) -- if that fallback got cached under
    # the premium key, every future premium request for this mood would
    # keep serving Google TTS forever, never retrying ElevenLabs once it
    # starts working. A premium request checks the premium key first,
    # then falls back to checking the standard key (so a premium user
    # doesn't regenerate audio a free user already cached).
    premium_key = f"mood_{mood}"
    standard_key = f"mood_{mood}_standard"

    r2_key = await supabase_db.get_voice_sample_key(premium_key) if is_premium else None
    if not r2_key:
        r2_key = await supabase_db.get_voice_sample_key(standard_key)

    if not r2_key:
        phrase = MOOD_SAMPLE_PHRASES.get(mood, MOOD_SAMPLE_PHRASES["time_machine"])

        audio_bytes = None
        used_elevenlabs = False
        if is_premium:
            audio_bytes = await elevenlabs_service.synthesize_mood_preview(phrase, mood)
            used_elevenlabs = bool(audio_bytes)
        if not audio_bytes:
            # Free tier, or ElevenLabs unavailable/failed for a premium
            # user -- fall back to the same Google TTS mechanism the
            # neutral/dramatic/warm samples above already use, rather
            # than returning nothing.
            audio_bytes = await tts.synthesize_speech(text=phrase, voice="neutral", is_premium=is_premium)

        if not audio_bytes:
            raise HTTPException(
                status_code=500,
                detail={"error": "Couldn't generate a mood sample right now.", "code": "sample_failed", "retry": True},
            )
        cache_key = premium_key if used_elevenlabs else standard_key
        r2_key = f"voice-samples/{cache_key}.mp3"
        if not await r2.upload_audio(audio_bytes, r2_key):
            raise HTTPException(
                status_code=500,
                detail={"error": "Couldn't generate a mood sample right now.", "code": "sample_failed", "retry": True},
            )
        await supabase_db.store_voice_sample_key(cache_key, r2_key)

    return VoiceSampleResponse(voice=mood, audio_url=r2.generate_signed_url(r2_key))