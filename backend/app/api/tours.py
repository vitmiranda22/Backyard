"""
Tour session management endpoints.

These endpoints manage the lifecycle of a walking tour:
  POST /api/start-tour   — Create a new tour session
  POST /api/save-block   — Record a narrated block during the tour
  POST /api/end-tour     — Finalize the tour with stats

The mobile app calls these in sequence as the user walks.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.api.auth import AuthenticatedUser
from app.models.schemas import (
    StartTourRequest,
    StartTourResponse,
    SaveBlockRequest,
    SaveBlockResponse,
    EndTourRequest,
    EndTourResponse,
    ErrorResponse,
)
from app.services import supabase_db

logger = logging.getLogger(__name__)

router = APIRouter()


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

    block = await supabase_db.save_tour_block(
        tour_id=request.tour_id,
        sequence=request.sequence,
        street_name=request.street_name,
        neighborhood=request.neighborhood,
        city=request.city,
        lat=request.lat,
        lng=request.lng,
        narration_text=request.narration_text,
        audio_r2_key=request.audio_r2_key,
        voice=request.voice.value if request.voice else "neutral",
        mood=request.mood.value,
        trigger_type=request.trigger_type.value,
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
    if blocks:
        lats = [b["lat"] for b in blocks if b.get("lat")]
        lngs = [b["lng"] for b in blocks if b.get("lng")]
        if lats and lngs:
            center_lat = sum(lats) / len(lats)
            center_lng = sum(lngs) / len(lngs)
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