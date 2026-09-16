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

import time
from typing import List

from fastapi import APIRouter, HTTPException, Query, Request

from app.models.schemas import NearbyEventSummary, PublicEventsByCityResponse, ErrorResponse
from app.services import supabase_db, geocode
from app.services.events import compute_event_phase

router = APIRouter()

# GET /public/events?city= is the one endpoint here that calls
# geocode.forward_geocode(), which shares reverse_geocode()'s single
# process-wide Nominatim throttle/lock -- the same lock the real,
# billed narration pipeline depends on for every walking tour. This
# endpoint is fully unauthenticated (the marketing site has no logged-
# in user), so with no guard at all a tight loop of garbage city
# queries (each one a guaranteed cache miss, since a failed lookup is
# never cached) queues up on that shared lock and can stall narration
# for every real user on this single-instance deployment. In-memory,
# not DB-backed -- this is a low-stakes public marketing endpoint, not
# worth a database round trip per pageview, and matches admin.py's own
# in-memory abuse-tracking pattern for the same reason.
_IP_RATE_LIMIT_WINDOW_SEC = 60
_IP_RATE_LIMIT_MAX_REQUESTS = 10
_ip_request_log: dict = {}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _enforce_ip_rate_limit(request: Request):
    ip = _client_ip(request)
    now = time.time()
    cutoff = now - _IP_RATE_LIMIT_WINDOW_SEC
    log = _ip_request_log.setdefault(ip, [])
    while log and log[0] < cutoff:
        log.pop(0)
    if len(log) >= _IP_RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=429,
            detail={"error": "Too many requests — try again in a moment.", "code": "rate_limited", "retry": True},
        )
    log.append(now)

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
    request: Request,
    city: str = Query(..., min_length=1, max_length=100),
):
    _enforce_ip_rate_limit(request)

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
