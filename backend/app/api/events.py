"""
Backyard Events (authenticated, in-app) -- real-world runs/parades/
festivals near the caller's own GPS position.

  GET /api/events/nearby      -- events near the caller's current location
  GET /api/events/{event_id}  -- a single event's detail

Distinct from app/api/public_events.py's GET /public/events*, which is
unauthenticated and powers the marketing site (no logged-in caller, so no
GPS position to measure distance from -- it geocodes a typed city name
instead). This router is what mobile's own map is meant to call once it
has a real UI for it (see EventDetailSheet references in schemas.py) --
the schemas, the nearby_events() SQL function (migrations/025_events.sql),
and compute_event_phase() already existed; this was the missing piece.

Unlike public_events.py, no per-IP rate limit is needed here -- the
caller is already authenticated and subject to whatever general abuse
controls the rest of the API has, and there's no shared Nominatim
throttle in this path (lat/lng come straight from the caller's own GPS,
never geocoded).
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.api.auth import AuthenticatedUser
from app.models.schemas import NearbyEventSummary, EventDetail, ErrorResponse
from app.services import supabase_db
from app.services.events import compute_event_phase

router = APIRouter()

# Same default as /routes/nearby -- a comfortable walking/driving radius,
# not public_events.py's public-site-only METRO_RADIUS_M (that one exists
# to match how scripts/sync_events.py seeded data per metro area, not to
# scope a single caller's live GPS position).
DEFAULT_RADIUS_M = 5000


@router.get(
    "/events/nearby",
    response_model=List[NearbyEventSummary],
    summary="Real-world events near the caller's current location",
)
async def nearby_events(
    user_id: AuthenticatedUser,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(DEFAULT_RADIUS_M, ge=1),
    category: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=50),
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
    summary="A single event's detail",
)
async def event_detail(event_id: str, user_id: AuthenticatedUser):
    row = await supabase_db.get_event_by_id(event_id)
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"error": "That event doesn't exist or is no longer active.", "code": "event_not_found", "retry": False},
        )
    return EventDetail(
        id=row["id"],
        name=row["name"],
        description=row.get("description", ""),
        category=row["category"],
        city=row.get("city"),
        center_lat=row["center_lat"],
        center_lng=row["center_lng"],
        radius_m=row["radius_m"],
        start_time=row["start_time"],
        end_time=row["end_time"],
        source_url=row.get("source_url"),
        distance_m=None,
        phase=compute_event_phase(row),
        source=row["source"],
    )
