"""
Tour session management endpoints.

These endpoints manage the lifecycle of a walking tour:
  POST /api/start-tour   — Create a new tour session
  POST /api/save-block   — Record a narrated block during the tour
  POST /api/end-tour     — Finalize the tour with stats

The mobile app calls these in sequence as the user walks.
"""

import logging
import geohash2
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.api.auth import AuthenticatedUser
from app.models.schemas import (
    StartTourRequest,
    StartTourResponse,
    SaveBlockRequest,
    SaveBlockResponse,
    EndTourRequest,
    EndTourResponse,
    TourSummary,
    PublishTourRequest,
    PublishTourResponse,
    TourDetailResponse,
    TourBlockDetail,
    NearbyRouteSummary,
    RateTourRequest,
    RateTourResponse,
    ErrorResponse,
)
from app.services import supabase_db, r2

logger = logging.getLogger(__name__)

router = APIRouter()

GEOHASH_PRECISION = 8  # must match backend/app/api/narrate.py


def _expected_r2_keys(tour_id: str, lat: float, lng: float, mood: str, voice: str, content_safety: bool):
    """
    Recompute the R2 keys narrate-block would have generated for this exact
    block, so save-block can confirm a client-supplied audio_r2_key/
    image_r2_key actually points at real Backyard-issued storage for this
    location/tour rather than an arbitrary client-supplied string.
    """
    geo_hash = geohash2.encode(lat, lng, precision=GEOHASH_PRECISION)
    valid_audio_keys = {
        r2.build_r2_key(geo_hash, mood, content_safety, voice),
        r2.build_tour_r2_key(tour_id, geo_hash, content_safety, voice),
    }
    valid_image_key = r2.build_image_r2_key(geo_hash)
    return valid_audio_keys, valid_image_key


@router.get(
    "/tours",
    response_model=List[TourSummary],
    summary="List the current user's past tours, most recent first",
)
async def list_tours(user_id: AuthenticatedUser):
    tours = await supabase_db.get_tours_by_user(user_id)
    return [
        TourSummary(
            tour_id=t["id"],
            title=t.get("title") or "Untitled Tour",
            mood=t.get("mood", "time_machine"),
            city=t.get("city"),
            blocks_visited=t.get("blocks_visited", 0),
            total_distance_m=t.get("total_distance_m"),
            duration_sec=t.get("duration_sec"),
            created_at=t["created_at"],
        )
        for t in tours
    ]


@router.post(
    "/start-tour",
    response_model=StartTourResponse,
    responses={500: {"model": ErrorResponse}},
    summary="Start a new walking or virtual tour",
)
async def start_tour(
    request: StartTourRequest,
    user_id: AuthenticatedUser,
):
    """
    Creates a tour record in the database.
    Returns a tour_id that the app uses for all subsequent requests.
    """
    logger.info(
        f"Starting tour: user={user_id[:8]}... "
        f"mood={request.mood.value} voice={request.voice.value} "
        f"type={request.tour_type.value}"
    )

    tour = await supabase_db.create_tour(
        creator_id=user_id,
        mood=request.mood.value,
        voice=request.voice.value,
        tour_type=request.tour_type.value,
        content_safety=request.content_safety,
    )

    if not tour:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to create tour. Please try again.",
                "code": "tour_create_failed",
                "retry": True,
            },
        )

    return StartTourResponse(
        tour_id=tour["id"],
        mood=request.mood,
        voice=request.voice,
        tour_type=request.tour_type,
        started_at=tour["created_at"],
    )


@router.post(
    "/save-block",
    response_model=SaveBlockResponse,
    responses={
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Save a narrated block during an active tour",
)
async def save_block(
    request: SaveBlockRequest,
    user_id: AuthenticatedUser,
):
    """
    Records a narration block as part of an active tour.
    Called by the app after each successful narration (auto or manual).
    """
    logger.info(
        f"Saving block: tour={request.tour_id[:8]}... "
        f"seq={request.sequence} street={request.street_name}"
    )

    # Verify the tour belongs to this user
    tour = await supabase_db.get_tour(request.tour_id)
    if not tour:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "Tour not found.",
                "code": "tour_not_found",
                "retry": False,
            },
        )

    if tour["creator_id"] != user_id:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "This tour doesn't belong to you.",
                "code": "forbidden",
                "retry": False,
            },
        )

    # Confirm any client-supplied storage keys actually point at real
    # Backyard-issued audio/image for this exact location/tour, rather than
    # trusting an arbitrary string. Doesn't reject the save outright on a
    # mismatch — just drops the bogus key, since audio/image are optional
    # (the block itself is still worth recording without them).
    voice_value = request.voice.value if request.voice else "neutral"
    valid_audio_keys, valid_image_key = _expected_r2_keys(
        tour_id=request.tour_id,
        lat=request.lat,
        lng=request.lng,
        mood=request.mood.value,
        voice=voice_value,
        content_safety=tour.get("content_safety_on", False),
    )
    audio_r2_key = request.audio_r2_key if request.audio_r2_key in valid_audio_keys else None
    image_r2_key = request.image_r2_key if request.image_r2_key == valid_image_key else None
    if request.audio_r2_key and not audio_r2_key:
        logger.warning(f"Rejected mismatched audio_r2_key on save-block for tour {request.tour_id[:8]}...")
    if request.image_r2_key and not image_r2_key:
        logger.warning(f"Rejected mismatched image_r2_key on save-block for tour {request.tour_id[:8]}...")

    block = await supabase_db.save_tour_block(
        tour_id=request.tour_id,
        sequence=request.sequence,
        street_name=request.street_name,
        neighborhood=request.neighborhood,
        city=request.city,
        lat=request.lat,
        lng=request.lng,
        narration_text=request.narration_text,
        audio_r2_key=audio_r2_key,
        voice=voice_value,
        mood=request.mood.value,
        trigger_type=request.trigger_type.value,
        image_r2_key=image_r2_key,
    )

    if not block:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to save block. The tour is still active.",
                "code": "block_save_failed",
                "retry": True,
            },
        )

    return SaveBlockResponse(
        block_id=block["id"],
        sequence=request.sequence,
    )


@router.post(
    "/end-tour",
    response_model=EndTourResponse,
    responses={
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="End an active tour and finalize stats",
)
async def end_tour(
    request: EndTourRequest,
    user_id: AuthenticatedUser,
):
    """
    Finalizes the tour: updates stats, generates a title based on
    the neighborhoods visited, and marks the tour as complete.
    """
    logger.info(f"Ending tour: tour={request.tour_id[:8]}... user={user_id[:8]}...")

    # Verify ownership
    tour = await supabase_db.get_tour(request.tour_id)
    if not tour:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "Tour not found.",
                "code": "tour_not_found",
                "retry": False,
            },
        )

    if tour["creator_id"] != user_id:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "This tour doesn't belong to you.",
                "code": "forbidden",
                "retry": False,
            },
        )

    # Get all blocks to generate title and count
    blocks = await supabase_db.get_tour_blocks(request.tour_id)
    blocks_visited = len(blocks) if blocks else 0

    # Auto-generate title from mood + neighborhoods
    title = _generate_tour_title(
        mood=tour.get("mood", "time_machine"),
        blocks=blocks,
    )

    # Calculate center point from blocks
    center_lat = None
    center_lng = None
    city = None
    location = None
    if blocks:
        lats = [b["lat"] for b in blocks if b.get("lat")]
        lngs = [b["lng"] for b in blocks if b.get("lng")]
        if lats and lngs:
            center_lat = sum(lats) / len(lats)
            center_lng = sum(lngs) / len(lngs)
            # EWKT — PostGIS parses this directly through PostgREST for a
            # geography column. This is what makes the tour findable via
            # nearby_tours() once it's published.
            location = f"SRID=4326;POINT({center_lng} {center_lat})"
        city = blocks[0].get("city", "Unknown")

    # Update the tour record
    updated = await supabase_db.end_tour(
        tour_id=request.tour_id,
        title=title,
        blocks_visited=blocks_visited,
        total_distance_m=request.total_distance_m,
        duration_sec=request.duration_sec,
        center_lat=center_lat,
        center_lng=center_lng,
        city=city,
        location=location,
    )

    if not updated:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to finalize tour.",
                "code": "tour_end_failed",
                "retry": True,
            },
        )

    return EndTourResponse(
        tour_id=request.tour_id,
        title=title,
        blocks_visited=blocks_visited,
        total_distance_m=request.total_distance_m,
        duration_sec=request.duration_sec,
        mood=tour.get("mood", "time_machine"),
    )


@router.post(
    "/publish-tour",
    response_model=PublishTourResponse,
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Publish (or unpublish) a finished tour as a discoverable route",
)
async def publish_tour(
    request: PublishTourRequest,
    user_id: AuthenticatedUser,
):
    """
    Flips a tour's visibility and optionally renames it. Called from the
    Tour Complete screen — publishing is an explicit opt-in action, never
    automatic (tours start private; see create_tour()).
    """
    tour = await supabase_db.get_tour(request.tour_id)
    if not tour:
        raise HTTPException(
            status_code=404,
            detail={"error": "Tour not found.", "code": "tour_not_found", "retry": False},
        )

    if tour["creator_id"] != user_id:
        raise HTTPException(
            status_code=403,
            detail={"error": "This tour doesn't belong to you.", "code": "forbidden", "retry": False},
        )

    updated = await supabase_db.publish_tour(
        tour_id=request.tour_id,
        is_public=request.is_public,
        title=request.title,
    )

    if not updated:
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to update tour.", "code": "publish_failed", "retry": True},
        )

    return PublishTourResponse(
        tour_id=request.tour_id,
        is_public=updated.get("is_public", request.is_public),
        title=updated.get("title", ""),
    )


@router.get(
    "/routes/nearby",
    response_model=List[NearbyRouteSummary],
    summary="Discover public routes near a location",
)
async def nearby_routes(
    user_id: AuthenticatedUser,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(5000, ge=1),
    mood: Optional[str] = Query(None),
    tour_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    sort_by: str = Query("distance", pattern="^(distance|rating)$"),
):
    rows = await supabase_db.get_nearby_tours(
        user_lat=lat,
        user_lng=lng,
        radius_m=radius_m,
        mood_filter=mood,
        tour_type_filter=tour_type,
        limit_count=limit,
        offset_count=offset,
        sort_by=sort_by,
    )
    return [
        NearbyRouteSummary(
            tour_id=r["id"],
            title=r.get("title") or "Untitled Route",
            mood=r.get("mood", "time_machine"),
            tour_type=r.get("tour_type", "walking"),
            city=r.get("city"),
            avg_rating=r.get("avg_rating", 0),
            rating_count=r.get("rating_count", 0),
            blocks_visited=r.get("blocks_visited", 0),
            total_distance_m=r.get("total_distance_m"),
            duration_sec=r.get("duration_sec"),
            is_anonymous=r.get("is_anonymous", False),
            content_safety_on=r.get("content_safety_on", False),
            creator_display_name=r.get("creator_display_name"),
            creator_avatar_url=r.get("creator_avatar_url"),
            distance_m=r.get("distance_m", 0),
            created_at=r["created_at"],
            lat=r.get("lat", 0.0),
            lng=r.get("lng", 0.0),
        )
        for r in rows
    ]


@router.get(
    "/tours/{tour_id}",
    response_model=TourDetailResponse,
    responses={
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
    summary="Get a tour's full detail + ordered blocks, for replay",
)
async def get_tour_detail(tour_id: str, user_id: AuthenticatedUser):
    tour = await supabase_db.get_tour_with_creator(tour_id)
    if not tour:
        raise HTTPException(
            status_code=404,
            detail={"error": "Tour not found.", "code": "tour_not_found", "retry": False},
        )

    is_own_tour = tour["creator_id"] == user_id
    if not tour.get("is_public") and not is_own_tour:
        raise HTTPException(
            status_code=403,
            detail={"error": "This tour isn't public.", "code": "forbidden", "retry": False},
        )

    blocks = await supabase_db.get_tour_blocks(tour_id)
    block_details = []
    for b in blocks:
        audio_url = r2.generate_signed_url(b["audio_r2_key"], expires_in=14400) if b.get("audio_r2_key") else None
        image_url = r2.generate_signed_url(b["image_r2_key"], expires_in=14400) if b.get("image_r2_key") else None
        block_details.append(TourBlockDetail(
            block_id=b["id"],
            sequence=b["sequence"],
            street_name=b.get("street_name", ""),
            neighborhood=b.get("neighborhood", ""),
            lat=b["lat"],
            lng=b["lng"],
            narration_text=b.get("narration_text", ""),
            audio_url=audio_url,
            image_url=image_url,
            voice=b.get("voice", "neutral"),
            mood=b.get("mood", "time_machine"),
        ))

    is_anonymous = tour.get("is_anonymous", False)
    creator = tour.get("users") or {}

    return TourDetailResponse(
        tour_id=tour["id"],
        title=tour.get("title") or "Untitled Route",
        mood=tour.get("mood", "time_machine"),
        tour_type=tour.get("tour_type", "walking"),
        city=tour.get("city"),
        avg_rating=tour.get("avg_rating", 0),
        rating_count=tour.get("rating_count", 0),
        blocks_visited=tour.get("blocks_visited", 0),
        total_distance_m=tour.get("total_distance_m"),
        duration_sec=tour.get("duration_sec"),
        is_own_tour=is_own_tour,
        is_anonymous=is_anonymous,
        creator_display_name="Anonymous Explorer" if is_anonymous else creator.get("display_name"),
        creator_avatar_url=None if is_anonymous else creator.get("avatar_url"),
        created_at=tour["created_at"],
        blocks=block_details,
    )


@router.post(
    "/rate-tour",
    response_model=RateTourResponse,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    summary="Rate a route 1-5 stars",
)
async def rate_tour(request: RateTourRequest, user_id: AuthenticatedUser):
    tour = await supabase_db.get_tour(request.tour_id)
    if not tour:
        raise HTTPException(
            status_code=404,
            detail={"error": "Tour not found.", "code": "tour_not_found", "retry": False},
        )

    if tour["creator_id"] == user_id:
        raise HTTPException(
            status_code=400,
            detail={"error": "You can't rate your own route.", "code": "cannot_rate_own_tour", "retry": False},
        )

    result = await supabase_db.rate_tour(request.tour_id, user_id, request.score)
    if not result:
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to submit rating.", "code": "rate_failed", "retry": True},
        )

    return RateTourResponse(**result)


def _generate_tour_title(mood: str, blocks: list) -> str:
    """
    Auto-generate a tour title from mood + neighborhoods visited.

    Examples:
      - "Haunted Haight-Ashbury"
      - "Celebrity Marina & Pacific Heights"
      - "Curiosities of the Mission"
      - "Exploring SoMa"
    """
    mood_labels = {
        "time_machine": "Time Machine:",
        "hidden_city": "Hidden",
        "dark_side": "Dark Side of",
        "behind_scenes": "Behind the Scenes:",
        "unfiltered": "Unfiltered",
    }

    mood_prefix = mood_labels.get(mood, "Exploring")

    if not blocks:
        return f"{mood_prefix} Tour"

    # Get unique neighborhoods from blocks
    neighborhoods = []
    seen = set()
    for block in blocks:
        hood = block.get("neighborhood", "")
        if hood and hood not in seen and hood != "Unknown":
            neighborhoods.append(hood)
            seen.add(hood)

    if not neighborhoods:
        return f"{mood_prefix} Tour"

    if len(neighborhoods) == 1:
        if mood == "dark_side":
            return f"Dark Side of {neighborhoods[0]}"
        return f"{mood_prefix} {neighborhoods[0]}"

    if len(neighborhoods) == 2:
        if mood == "dark_side":
            return f"Dark Side of {neighborhoods[0]} & {neighborhoods[1]}"
        return f"{mood_prefix} {neighborhoods[0]} & {neighborhoods[1]}"

    # 3+ neighborhoods: use first two + "& more"
    if mood == "dark_side":
        return f"Dark Side of {neighborhoods[0]}, {neighborhoods[1]} & More"
    return f"{mood_prefix} {neighborhoods[0]}, {neighborhoods[1]} & More"