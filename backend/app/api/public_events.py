"""
Public (unauthenticated) events endpoint — powers the marketing site's
Events page, which has no logged-in user to gate behind AuthenticatedUser
the way GET /events/nearby does. Event listings aren't sensitive/personal
data, so a read-only public view is safe.

Takes a free-text place name (what a visitor types into the marketing
page's search box) rather than lat/lng, since the caller here is a web
page, not the mobile app with a real GPS fix.
"""

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


@router.get(
    "/public/events",
    response_model=PublicEventsByCityResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Real events near a place name, for the public marketing site",
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
        for r in rows
    ]

    return PublicEventsByCityResponse(city=place.city, lat=place.lat, lng=place.lng, events=events)
