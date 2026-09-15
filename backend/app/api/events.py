"""
Backyard Events endpoints.

  GET /api/events/nearby     — discover events near a location (map pins)
  GET /api/events/{event_id} — full detail for one event

The narration-time check (is this block inside an active event zone right
now?) lives in narrate.py, not here — these two endpoints are purely for
browsing/discovery.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.api.auth import AuthenticatedUser
from app.models.schemas import NearbyEventSummary, EventDetail, ErrorResponse
from app.services import supabase_db
from app.services.events import compute_event_phase

router = APIRouter()


@router.get(
    "/events/nearby",
    response_model=List[NearbyEventSummary],
    summary="Discover events near a location",
)
async def nearby_events(
    user_id: AuthenticatedUser,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(5000, ge=1),
    category: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
):
    rows = await supabase_db.get_nearby_events(lat, lng, radius_m, category, limit)
    return [
        NearbyEventSummary(
            id=r["id"],
            name=r["name"],
            description=r.get("description", ""),
            category=r["category"],
            city=r.get("city"),
            center_lat=r["center_lat"],
            center_lng=r["center_lng"],
            radius_m=r["radius_m"],
            start_time=r["start_time"],
            end_time=r["end_time"],
            source_url=r.get("source_url"),
            distance_m=r["distance_m"],
            phase=compute_event_phase(r),
        )
        for r in rows
    ]


@router.get(
    "/events/{event_id}",
    response_model=EventDetail,
    responses={404: {"model": ErrorResponse}},
    summary="Get one event's full detail",
)
async def event_detail(user_id: AuthenticatedUser, event_id: str):
    event = await supabase_db.get_event(event_id)
    if not event:
        raise HTTPException(
            status_code=404,
            detail={"error": "Event not found.", "code": "event_not_found", "retry": False},
        )

    return EventDetail(
        id=event["id"],
        name=event["name"],
        category=event["category"],
        city=event.get("city"),
        center_lat=event["center_lat"],
        center_lng=event["center_lng"],
        radius_m=event["radius_m"],
        start_time=event["start_time"],
        end_time=event["end_time"],
        source_url=event.get("source_url"),
        phase=compute_event_phase(event),
        description=event.get("description", ""),
        source=event["source"],
    )
