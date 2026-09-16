"""
Public (unauthenticated) events endpoints — power the marketing site's
Events page, which has no logged-in user to gate behind AuthenticatedUser
the way GET /events/nearby does. Event listings aren't sensitive/personal
data, so a read-only public view is safe.

  GET /public/events/top       — the biggest events worldwide right now
  GET /public/events?city=...  — the biggest events near a typed place

Both cap results to a handful of genuinely significant events (PredictHQ's
own real-world impact rank, see supabase_db.MIN_PUBLIC_EVENT_RANK) rather
than a long list -- confirmed live this session that an unranked list is
dominated by small private parties/club nights, not the public/cultural/
city-scale events this page is meant to showcase.
"""

from typing import List

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import NearbyEventSummary, PublicEventsByCityResponse, ErrorResponse
from app.services import supabase_db, geocode
from app.services.events import compute_event_phase

router = APIRouter()

# A metro-area-sized radius, not user-configurable -- matches the radius
# used when seeding this data (scripts/sync_events.py), so "events near
# San Francisco" surfaces the same real Bay Area events (Sausalito, etc.)
# that were synced together as one metro area.
METRO_RADIUS_M = 25000

# How many of the biggest events to actually show -- both endpoints below
# cap to this rather than returning everything within range.
TOP_EVENTS_LIMIT = 6


def _rank_sort_key(row: dict):
    """Highest rank first; events with no rank at all sort last, never
    displacing a genuinely-ranked event just to fill out the list."""
    rank = row.get("rank")
    return (rank is None, -(rank or 0))


@router.get(
    "/public/events/top",
    response_model=List[NearbyEventSummary],
    summary="The biggest real events happening worldwide right now",
)
async def public_top_events():
    rows = await supabase_db.get_top_events_globally(TOP_EVENTS_LIMIT)
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
            distance_m=None,
            phase=compute_event_phase(r),
        )
        for r in rows
    ]


@router.get(
    "/public/events",
    response_model=PublicEventsByCityResponse,
    responses={404: {"model": ErrorResponse}},
    summary="The biggest real events near a place name, for the public marketing site",
)
async def public_events_by_city(
    city: str = Query(..., min_length=1, max_length=100),
):
    place = await geocode.forward_geocode(city)
    if not place:
        raise HTTPException(
            status_code=404,
            detail={"error": f"Couldn't find a place called \"{city}\".", "code": "place_not_found", "retry": False},
        )

    rows = await supabase_db.get_nearby_events(place.lat, place.lng, METRO_RADIUS_M, None, 50)
    ranked_rows = [r for r in rows if (r.get("rank") or 0) >= supabase_db.MIN_PUBLIC_EVENT_RANK]
    ranked_rows.sort(key=_rank_sort_key)
    top_rows = ranked_rows[:TOP_EVENTS_LIMIT]

    events = [
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
        for r in top_rows
    ]

    return PublicEventsByCityResponse(city=place.city, lat=place.lat, lng=place.lng, events=events)
