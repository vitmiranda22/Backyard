"""
POST /narrate-block — The core endpoint of Backyard.

Full pipeline:
0. Check + increment the caller's rate limit — every fresh narration
   below triggers billed OpenAI/Street View/TTS calls, so this runs
   before any of that work starts
1. Compute geohash from GPS coordinates
2. Kick off zone-photo resolution (cached sign, or fetch+cache from
   Street View) as a CONCURRENT background task — it shares no data
   dependency with narration generation (steps 3-9 below), so its
   Street View/R2 round trip (up to ~16s on a cache miss) runs
   alongside the narration pipeline instead of blocking it. Joined
   in step 10, right before the response needs it.
3. Check narration cache → HIT? Skip to step 8
4. Reverse geocode → street name, neighborhood, city
5. Check zone data cache → HIT? Skip to step 7
6. Fetch ALL 26 data sources in parallel (~2-4 seconds)
7. Feed zone data to OpenAI → generate narration
8. If part of an active tour (tour_id given, and it belongs to this
   user), stitch in a short transition connecting this block to the
   tour's running story so far — the core narration_text above stays
   untouched/cacheable, this is a thin tour-scoped layer added on top
9. TTS → MP3 (a stitched block gets fresh audio under a tour-scoped R2
   key instead of the shared cache, since it's no longer generic text)
   → Upload to R2 → signed URL
10. Join the zone-photo task from step 2, then return to client

Two cache layers:
- Zone data cache: raw data + photo per zone (mood-agnostic, shared across moods)
- Narration cache: AI-generated text per zone + mood + safety combo
"""

import asyncio
import logging
import uuid
import geohash2

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from app.api.auth import AuthenticatedUser
from app.config import settings, PREMIUM_MOODS, PREMIUM_VOICES, UNLIMITED_TEST_ACCOUNT_IDS
from app.models.schemas import (
    NarrateBlockRequest,
    NarrateBlockResponse,
    AskQuestionResponse,
    ErrorResponse,
    ZoneDataUsed,
    SuggestedNextResponse,
)
from app.services import geocode, openai_service, tts, r2, supabase_db, streetview
from app.services.zone_data import (
    fetch_all_zone_data,
    format_zone_data_for_prompt,
    pick_suggested_next,
    DATASF_SOURCE_NAMES,
    is_san_francisco,
    should_skip_web_search,
)

logger = logging.getLogger(__name__)

router = APIRouter()

GEOHASH_PRECISION = 7  # ~153m x 153m zones (must match tours.py and mobile/src/config.ts)


def _cache_mood_key(mood: str, is_premium: bool) -> str:
    """
    narration_cache identity for a (mood, length-tier) pair — NOT the
    same as the true mood passed everywhere else (OpenAI, the response,
    tour_blocks, r2 keys for audio).

    narration_cache is shared across every user who hits this
    geohash+mood+safety (see build_prompt's is_premium: free tier now
    gets a genuinely shorter 90-115 word narration, not just a shorter
    voice). Without a tier-aware cache identity, whichever tier generated
    a zone first would permanently serve its length to the other tier
    too. Requires narration_cache_mood_check (migration 014) to allow
    these "-short" suffixed values alongside the 5 real moods — the
    UNIQUE(geo_hash, mood, content_safety) constraint needs no change,
    since a suffixed string is already a distinct value from the
    unsuffixed one.
    """
    return mood if is_premium else f"{mood}-short"


async def _resolve_zone_photo(geo_hash: str, lat: float, lng: float, existing_image_r2_key: str = None):
    """
    Resolve (image_url, image_r2_key) for a zone — sign the already-cached
    key if we have one, or fetch+upload+cache a fresh one from Street View.

    Meant to be run as a concurrent asyncio task alongside the narration
    pipeline in narrate_block(), since the two share no data dependency:
    narration generation never needs the photo, and the photo never needs
    the street name/zone data. On a cache miss this chain is two sequential
    Street View calls plus an R2 upload (~16s worst case) — there's no
    reason for that to block narration generation from even starting.
    """
    if existing_image_r2_key:
        return r2.generate_signed_url(existing_image_r2_key), existing_image_r2_key

    image_bytes = await streetview.fetch_street_view_image(lat, lng)
    if not image_bytes:
        return None, None

    image_r2_key = r2.build_image_r2_key(geo_hash)
    upload_ok = await r2.upload_image(image_bytes, image_r2_key)
    if not upload_ok:
        return None, None

    await supabase_db.store_zone_image(geo_hash, image_r2_key)
    return r2.generate_signed_url(image_r2_key), image_r2_key


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
    # --- Step 0: Rate limit ---
    # Fetched once, up front — needed both to size today's daily quota by
    # plan tier and for the premium mood/voice check right below.
    is_premium = await supabase_db.get_user_premium_status(user_id)

    # Every fresh (non-cached) narration triggers billed OpenAI/Street
    # View/TTS calls, so this has to be checked before any of that work
    # starts, not just logged/measured after the fact. Skipped entirely
    # for the fixed server-side test-account allowlist (see its docstring
    # in config.py) — a normal walker's daily/minute ceiling doesn't apply
    # to an account whose whole job is generating lots of content at once.
    if user_id not in UNLIMITED_TEST_ACCOUNT_IDS:
        allowed, reason = await supabase_db.check_rate_limit(
            user_id,
            minute_limit=settings.MINUTE_NARRATION_LIMIT,
            daily_limit=settings.DAILY_NARRATION_LIMIT_PREMIUM if is_premium else settings.DAILY_NARRATION_LIMIT_FREE,
        )
        if not allowed:
            retry_message = (
                "Too many requests — slow down a bit and try again in a moment."
                if reason == "minute_limit_exceeded"
                else "You've hit today's narration limit. Try again tomorrow."
            )
            raise HTTPException(
                status_code=429,
                detail={"error": retry_message, "code": reason, "retry": reason == "minute_limit_exceeded"},
            )

    # --- Step 0.5: Premium entitlement check ---
    # Defense-in-depth: the client gates premium moods/voices behind a
    # paywall before it ever gets here, so this only fires for a stale
    # client or a direct API call. Reject outright rather than silently
    # substituting a different mood/voice the user didn't ask for.
    if request.mood.value in PREMIUM_MOODS or request.voice.value in PREMIUM_VOICES:
        if not is_premium:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "This mood or voice is a premium feature. Upgrade to unlock it.",
                    "code": "premium_required",
                    "retry": False,
                },
            )

    # --- Step 0.6: Age gate ---
    # A ceiling, not a full override -- an adult's actual content_safety
    # preference (on OR off) passes through untouched. Only forces safety
    # ON when the client asked for it off and the account isn't a
    # confirmed adult, regardless of what the request claims.
    if not request.content_safety and await supabase_db.is_user_underage(user_id):
        request.content_safety = True

    # --- Step 1: Compute geohash ---
    geo_hash = geohash2.encode(request.lat, request.lng, precision=GEOHASH_PRECISION)
    logger.info(
        f"Narration request: user={user_id[:8]}... "
        f"location=({request.lat}, {request.lng}) "
        f"geohash={geo_hash} mood={request.mood.value} "
        f"voice={request.voice.value} safety={'on' if request.content_safety else 'off'}"
    )

    # --- Zone photo (kicked off concurrently — see below) ---
    # Zone data (and now the photo) live in zone_data_cache, keyed only by
    # geo_hash, mood-agnostic. This lookup used to happen only inside the
    # "narration_text is None" branch further down, which meant it never ran
    # at all on a narration cache HIT — a photo would never come back for an
    # already-cached location. Doing it once, unconditionally, here fixes
    # that and lets the branch below reuse the same row instead of a second
    # DB round trip.
    cached_zone = await supabase_db.get_cached_zone_data(geo_hash)

    # Available whenever cached_zone has a row, regardless of whether
    # narration itself is a cache hit or miss below -- suggested_next
    # (the map's waypoint marker) is computed from this near the end of
    # the function. The cache-miss branch further down overwrites this
    # with freshly-fetched data; this early assignment is what covers the
    # narration-cache-HIT path, which otherwise never touches raw_data at
    # all.
    raw_data = cached_zone.get("raw_data") if cached_zone else None

    # The actual photo fetch/upload (on a cache miss) shares no data
    # dependency with narration generation below, so it runs as a
    # background task instead of blocking the pipeline — joined right
    # before the response is built, once both sides are done.
    photo_task = asyncio.create_task(
        _resolve_zone_photo(
            geo_hash,
            request.lat,
            request.lng,
            existing_image_r2_key=cached_zone.get("image_r2_key") if cached_zone else None,
        )
    )

    # --- Step 2: Check narration cache ---
    cache_mood = _cache_mood_key(request.mood.value, is_premium)
    cached_narration = await supabase_db.get_cached_narration(
        geo_hash=geo_hash,
        mood=cache_mood,
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
        # Nominatim failed even after a retry — degrade gracefully instead
        # of showing the walker raw coordinates.
        street_name = "this block"
        neighborhood = ""
        city = ""
        country = ""

    # --- Step 4-6: Generate narration if not cached ---
    if narration_text is None:
        # Step 4: Check zone data cache (reuses the lookup done above for
        # the zone photo — same geo_hash, same row, no need to fetch twice)
        zone_data_str = None

        if cached_zone:
            # Zone data cache HIT — use stored data
            logger.info(f"Zone data cache HIT for {geo_hash}")
            raw_data = cached_zone.get("raw_data", {})
            zone_data_str = format_zone_data_for_prompt(raw_data, mode=request.mood.value)

            sources_hit = [k for k, v in raw_data.items() if v]
            skipped = [] if is_san_francisco(city) else DATASF_SOURCE_NAMES
            zone_data_used = ZoneDataUsed(
                sources_hit=sources_hit,
                sources_skipped=skipped,
            )

            # None for any row cached before migration 013 — treated as
            # "richness unknown" by should_skip_web_search(), not "thin".
            zone_hit_count = cached_zone.get("sources_hit_count")
            zone_eligible_count = cached_zone.get("sources_eligible_count")
        else:
            # Step 5: Fetch ALL 26 sources in parallel
            logger.info(f"Zone data cache MISS for {geo_hash} — fetching all sources...")
            result = await fetch_all_zone_data(
                lat=request.lat,
                lng=request.lng,
                street_name=street_name,
                neighborhood=neighborhood,
                city=city,
                country=country,
            )

            raw_data = result["zone_data"]
            sources_queried = result["sources_queried"]
            sources_failed = result["sources_failed"]
            sources_skipped = result["sources_skipped"]
            zone_hit_count = result["hit_count"]
            zone_eligible_count = result["total"] - len(sources_skipped)

            # Format for prompt
            zone_data_str = format_zone_data_for_prompt(raw_data, mode=request.mood.value)

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
                sources_hit_count=zone_hit_count,
                sources_eligible_count=zone_eligible_count,
                sources_skipped=sources_skipped,
            )

            sources_hit = [k for k, v in raw_data.items() if v]
            zone_data_used = ZoneDataUsed(
                sources_hit=sources_hit,
                sources_skipped=sources_skipped,
            )

            logger.info(
                f"Zone data fetched: {len(sources_hit)} sources with data, "
                f"{len(sources_failed)} failed"
            )

        # Step 6: Call OpenAI with zone data
        narration_text = await openai_service.generate_narration(
            street=street_name,
            neighborhood=neighborhood,
            city=city,
            country=country,
            mood=request.mood.value,
            content_safety=request.content_safety,
            zone_data=zone_data_str,
            skip_web_search=should_skip_web_search(zone_hit_count, zone_eligible_count),
            is_premium=is_premium,
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
            mood=cache_mood,
            content_safety=request.content_safety,
            narration_text=narration_text,
        )
        if stored:
            narration_cache_id = stored["id"]

    # --- Step 6.5: Cross-block narrative continuity (only within an active tour) ---
    # The core narration_text above is untouched and stays fully cacheable —
    # continuity is a thin layer added on top, keyed off the tour, not the
    # geohash. A request with no tour_id (older client, or a one-off request
    # outside a tour) skips this entirely and behaves exactly as before.
    final_narration_text = narration_text
    connector_added = False

    if request.tour_id:
        tour = await supabase_db.get_tour(request.tour_id)
        # A tour_id that doesn't belong to this user (foreign, stale, or
        # guessed) is treated the same as no tour_id at all — narration
        # still succeeds, it just isn't stitched into anyone else's story.
        # Without this check, any authenticated user could pass another
        # user's tour_id to read fragments of their narrative back in the
        # connector text, overwrite that tour's running summary, or cause
        # audio to be generated under the victim's tour-scoped storage key.
        owns_tour = bool(tour) and tour.get("creator_id") == user_id

        if owns_tour:
            prior_summary = tour.get("narrative_summary")
            used_openers = tour.get("used_connector_openers") or []
            new_used_openers = used_openers
            last_transition = tour.get("last_connector_transition")

            if prior_summary:
                connector_text, updated_summary, new_used_openers = await openai_service.generate_connector(
                    prior_summary=prior_summary,
                    mood=request.mood.value,
                    current_narration=narration_text,
                    used_openers=used_openers,
                    last_transition=last_transition,
                )
                if connector_text:
                    final_narration_text = f"{connector_text} {narration_text}"
                    connector_added = True
                    # Persist THIS transition so the next block's connector
                    # can avoid repeating its sentence shape too — see
                    # migration 012.
                    last_transition = connector_text
            else:
                # First block of this tour — nothing to connect to yet. Seed
                # the summary from this block's own text so block 2 has
                # something to build on.
                updated_summary = narration_text[:200]

            await supabase_db.update_tour_narrative_summary(
                request.tour_id,
                updated_summary,
                used_connector_openers=new_used_openers,
                last_connector_transition=last_transition,
            )

    # --- Step 7-8: Handle audio ---
    audio_url = None
    audio_duration_ms = None

    if connector_added:
        # This block's audio is stitched with a tour-specific transition, so
        # it can never be shared across tours at the same geohash — always
        # synthesize fresh and store it under a tour-scoped key instead of
        # the shared narration_cache/audio_files path. No cache-key tier
        # disambiguation needed here (unlike the shared path below) since
        # this key is already unique per tour, and one tour belongs to one
        # user/tier.
        r2_key = r2.build_tour_r2_key(
            tour_id=request.tour_id,
            geo_hash=geo_hash,
            content_safety=request.content_safety,
            voice=request.voice.value,
        )
        audio_bytes = await tts.synthesize_speech(
            text=final_narration_text,
            voice=request.voice.value,
            is_premium=is_premium,
        )
        if audio_bytes:
            upload_ok = await r2.upload_audio(audio_bytes, r2_key)
            if upload_ok:
                audio_url = r2.generate_signed_url(r2_key)
                audio_duration_ms = tts.estimate_duration_ms(final_narration_text, request.voice.value)
        else:
            logger.warning("TTS failed — returning text-only response")
    else:
        # This audio is cached and shared across every user who hits this
        # geohash+mood+safety+voice — "neutral" is reachable by both free
        # and premium requests, so the cache identity has to fold in tier
        # too (tts.cache_voice_key), or whichever tier generates it first
        # would silently serve its audio quality to the other tier.
        cache_voice = tts.cache_voice_key(request.voice.value, is_premium)

        r2_key = r2.build_r2_key(
            geo_hash=geo_hash,
            mood=request.mood.value,
            content_safety=request.content_safety,
            voice=cache_voice,
        )

        # Only reuse R2 audio when the DB confirms it was generated for THIS
        # exact cached narration (get_cached_audio is keyed by narration_cache_id,
        # not just geo_hash/mood/voice). Raw R2 existence alone isn't proof the
        # audio matches the current text — R2 objects never expire on their own,
        # so a narration_cache reset or expiry can produce different text while
        # older, unrelated audio silently keeps getting served for the same
        # geohash+mood+safety+voice path.
        cached_audio = None
        if narration_cache_id:
            cached_audio = await supabase_db.get_cached_audio(narration_cache_id, cache_voice)

        if cached_audio:
            audio_url = r2.generate_signed_url(r2_key)
            audio_duration_ms = cached_audio.get("duration_ms") or tts.estimate_duration_ms(
                final_narration_text, request.voice.value
            )
        else:
            audio_bytes = await tts.synthesize_speech(
                text=final_narration_text,
                voice=request.voice.value,
                is_premium=is_premium,
            )

            if audio_bytes:
                upload_ok = await r2.upload_audio(audio_bytes, r2_key)
                if upload_ok:
                    audio_url = r2.generate_signed_url(r2_key)
                    audio_duration_ms = tts.estimate_duration_ms(final_narration_text, request.voice.value)

                    if narration_cache_id:
                        await supabase_db.store_audio_file(
                            narration_cache_id=narration_cache_id,
                            voice=cache_voice,
                            r2_key=r2_key,
                            file_size_bytes=len(audio_bytes),
                            duration_ms=audio_duration_ms,
                            tts_provider="google",
                        )
            else:
                logger.warning("TTS failed — returning text-only response")

    # --- Step 9: Return ---
    # Join the concurrent zone-photo task — by this point the narration
    # pipeline above has taken at least as long as the photo chain in every
    # realistic case, so this rarely adds any wait at all.
    image_url, image_r2_key = await photo_task

    # Mines this block's own already-fetched zone data for a real nearby
    # waypoint (map's green arrow) — no new fetch, just reusing raw_data,
    # which is available whether narration itself was a cache hit or miss
    # (see the early assignment near cached_zone above). None often, and
    # that's fine — not every block has a qualifying nearby item.
    suggested_next = None
    if raw_data:
        picked = pick_suggested_next(raw_data, request.lat, request.lng)
        if picked:
            suggested_next = SuggestedNextResponse(**picked)

    return NarrateBlockResponse(
        street_name=street_name,
        neighborhood=neighborhood,
        city=city,
        narration_text=final_narration_text,
        audio_url=audio_url,
        audio_r2_key=r2_key if audio_url else None,
        audio_duration_ms=audio_duration_ms,
        image_url=image_url,
        image_r2_key=image_r2_key,
        mood=request.mood,
        content_safety_applied=request.content_safety,
        cached=was_cached,
        zone_data_used=zone_data_used,
        suggested_next=suggested_next,
    )


MAX_QUESTION_AUDIO_BYTES = 15 * 1024 * 1024  # comfortably under Whisper's 25MB cap


@router.post(
    "/ask-question",
    response_model=AskQuestionResponse,
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        408: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Ask a spoken follow-up question about the current location",
)
async def ask_question(
    user_id: AuthenticatedUser,
    audio: UploadFile = File(...),
    lat: float = Form(...),
    lng: float = Form(...),
    mood: str = Form("time_machine"),
    voice: str = Form("neutral"),
    tour_id: str = Form(None),
):
    """
    Hold-to-ask voice question — transcribes the recording, answers it
    using the walker's current location as context, and speaks the answer
    back through the same TTS/R2 pipeline narration uses.
    """
    is_premium = await supabase_db.get_user_premium_status(user_id)

    # The costliest narration-adjacent feature in the app — fresh Whisper
    # transcription + GPT answer + TTS on every single call, zero caching
    # (unlike narrate-block, which reuses cached audio for a revisited
    # zone). Gated behind Premium entirely, not just the mood/voice check
    # further down — the client is expected to gate this before ever
    # reaching here, so this only fires for a stale client or a direct
    # API call.
    if not is_premium:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "Asking questions is a premium feature. Upgrade to unlock it.",
                "code": "premium_required",
                "retry": False,
            },
        )

    # Unlike narrate-block, this has zero caching (fresh Whisper + GPT + TTS
    # on every call), so it gets its own tighter daily ceiling rather than
    # sharing the narration pool — still shares the minute limit, since
    # that's about rapid-fire abuse, not daily cost. (Kept as a backstop
    # even though free users never reach it now that the whole feature is
    # premium-gated above — cheap insurance if that gate ever regresses.)
    if user_id not in UNLIMITED_TEST_ACCOUNT_IDS:
        allowed, reason = await supabase_db.check_question_rate_limit(
            user_id,
            daily_limit=settings.DAILY_QUESTION_LIMIT_PREMIUM if is_premium else settings.DAILY_QUESTION_LIMIT_FREE,
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "You've asked a lot of questions today — try again tomorrow.",
                    "code": reason,
                    "retry": False,
                },
            )

    # Defense-in-depth, same as narrate-block: the client is expected to
    # gate premium moods/voices before ever reaching here, so this only
    # fires for a stale client or a direct API call — reject rather than
    # silently downgrading to a mood/voice the user didn't ask for.
    if (mood in PREMIUM_MOODS or voice in PREMIUM_VOICES) and not is_premium:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "This mood or voice is a premium feature. Upgrade to unlock it.",
                "code": "premium_required",
                "retry": False,
            },
        )

    # Light validation before spending anything on Whisper — a cost/memory
    # amplification vector otherwise, since the daily/minute rate limits
    # above bound call COUNT but not per-call size or type.
    if audio.content_type and not audio.content_type.startswith("audio/"):
        raise HTTPException(
            status_code=400,
            detail={"error": "That doesn't look like an audio recording.", "code": "invalid_audio_type", "retry": False},
        )

    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_QUESTION_AUDIO_BYTES:
        raise HTTPException(
            status_code=400,
            detail={"error": "That recording is too long — try a shorter question.", "code": "audio_too_large", "retry": False},
        )

    # tour_id is optional, caller-supplied context — validate its shape
    # before it flows into the R2 key / a DB lookup rather than trusting it.
    if tour_id is not None:
        try:
            uuid.UUID(tour_id)
        except ValueError:
            tour_id = None

    question_text = await openai_service.transcribe_audio(audio_bytes, audio.filename or "question.m4a")

    if not question_text:
        raise HTTPException(
            status_code=408,
            detail={
                "error": "Couldn't hear that clearly — try holding the button again.",
                "code": "transcription_failed",
                "retry": True,
            },
        )

    logger.info(f"Question from user={user_id[:8]}...: {question_text[:100]}")

    # Reuse the tour's running narrative summary for grounding if there is
    # one. Deliberately NOT fetching all 23 zone-data sources fresh here —
    # a question should feel snappy, not pay narration's full latency.
    geo_result = await geocode.reverse_geocode(lat, lng)
    street_name = geo_result.street if geo_result else "this spot"
    neighborhood = geo_result.neighborhood if geo_result else ""
    city = geo_result.city if geo_result else ""

    recent_narration = None
    if tour_id:
        tour = await supabase_db.get_tour(tour_id)
        if tour and tour.get("creator_id") == user_id:
            recent_narration = tour.get("narrative_summary")

    answer_text = await openai_service.answer_question(
        question=question_text,
        street=street_name,
        neighborhood=neighborhood,
        city=city,
        mood=mood,
        recent_narration=recent_narration,
    )

    if not answer_text:
        raise HTTPException(
            status_code=408,
            detail={
                "error": "Couldn't come up with an answer to that. Try asking again.",
                "code": "answer_failed",
                "retry": True,
            },
        )

    audio_url = None
    audio_duration_ms = None
    audio_bytes_out = await tts.synthesize_speech(text=answer_text, voice=voice)
    if audio_bytes_out:
        question_id = uuid.uuid4().hex[:12]
        r2_key = r2.build_question_r2_key(tour_id, question_id)
        upload_ok = await r2.upload_audio(audio_bytes_out, r2_key)
        if upload_ok:
            audio_url = r2.generate_signed_url(r2_key)
            audio_duration_ms = tts.estimate_duration_ms(answer_text, voice)

    return AskQuestionResponse(
        question_text=question_text,
        answer_text=answer_text,
        audio_url=audio_url,
        audio_duration_ms=audio_duration_ms,
    )