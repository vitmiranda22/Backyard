"""
Terra Incognita -- fog-of-war map discovery.

  POST /api/explored-cells -- report that the caller is physically here
  GET  /api/explored-cells -- the caller's entire fog-of-war history

The Map tab starts completely dark; a cell only ever gets marked explored
by a real GPS reading while the app is open and foregrounded, or during
an active tour (see mobile's MapScreen.tsx / ActiveTourScreen.tsx) --
never from a background process. Once explored, a cell stays explored
forever (see supabase_db.mark_cells_explored).

The actual "hide undiscovered tours" enforcement lives in
GET /routes/nearby (tours.py), not here -- these two endpoints only
read/write the discovery record itself.
"""

import logging
import math
from datetime import datetime, timezone

import geohash2
from fastapi import APIRouter

from app.api.auth import AuthenticatedUser
from app.api.tours import _enforce_minute_rate_limit
from app.models.schemas import (
    ExploredCellRequest,
    ExploredCellResponse,
    ExploredCellsListResponse,
    ExploredCityCount,
    ExploredCitiesResponse,
)
from app.services import supabase_db

logger = logging.getLogger(__name__)

GEOHASH_PRECISION = 7  # must match backend/app/api/narrate.py

router = APIRouter()

# Generous on purpose -- explored.py's whole contract is "a real GPS
# reading while the app is open," not "walking pace." Someone riding as
# a passenger through a new city, or flying with the app open, is a
# legitimate way to reveal fog here (unlike end_tour's much stricter
# _is_speed_implausible, which is specifically about ONE recorded WALK).
# This threshold only needs to catch an obviously spoofed instant jump
# between two arbitrary points -- comfortably above the fastest real
# commercial flight (~290 m/s), never a real mode of travel.
_IMPLAUSIBLE_TELEPORT_MPS = 400.0


async def _is_teleport_implausible(user_id: str, lat: float, lng: float) -> bool:
    """
    Compares this report against the user's own single most-recently
    explored cell -- if the implied speed to get here from there is
    beyond anything real travel could produce, this is almost certainly
    a spoofed/scripted report, not a real walk (or flight, or car ride).
    Fails open (returns False) on any error or on a user's first-ever
    report, since there's nothing to compare against yet.
    """
    try:
        prior = await supabase_db.get_most_recently_explored_cell(user_id)
        if not prior:
            return False
        prior_lat, prior_lng, _, _ = geohash2.decode_exactly(prior["geo_hash"])
        prior_at = datetime.fromisoformat(prior["first_explored_at"].replace("Z", "+00:00"))
        elapsed_sec = (datetime.now(timezone.utc) - prior_at).total_seconds()
        if elapsed_sec <= 0:
            return False
        r = 6371000
        phi1, phi2 = math.radians(prior_lat), math.radians(lat)
        d_phi = math.radians(lat - prior_lat)
        d_lambda = math.radians(lng - prior_lng)
        a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
        distance_m = r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return (distance_m / elapsed_sec) > _IMPLAUSIBLE_TELEPORT_MPS
    except Exception as e:
        logger.error(f"Teleport-plausibility check failed, failing open: {e}")
        return False


@router.post(
    "/explored-cells",
    response_model=ExploredCellResponse,
    summary="Report the caller's real position as explored",
)
async def report_explored_cell(request: ExploredCellRequest, user_id: AuthenticatedUser):
    await _enforce_minute_rate_limit(user_id)

    geo_hash = geohash2.encode(request.lat, request.lng, precision=GEOHASH_PRECISION)

    # Silently skip persisting an implausible jump rather than erroring --
    # the client already updates its local fog optimistically regardless
    # of this response (see mobile's reportIfNewCell), and GET /routes/
    # nearby's discovery filter is the real, server-side source of truth
    # either way, so a rejected report here just never becomes real
    # discovery, without needing to surface a confusing error to a caller
    # that's almost certainly not the one deciding whether to spoof.
    if await _is_teleport_implausible(user_id, request.lat, request.lng):
        logger.warning(f"Rejected implausible explored-cell jump for user={user_id[:8]}...")
        return ExploredCellResponse(geo_hash=geo_hash)

    # Best-effort neighborhood/city attribution -- reused from whatever
    # narration already resolved for this exact cell, never a fresh
    # geocode call here (see mark_cells_explored's own docstring: this
    # endpoint fires on every new fog-of-war cell across every walking
    # user, and reverse_geocode shares one global 1 req/sec Nominatim
    # throttle with the live narration pipeline).
    cached_zone = await supabase_db.get_cached_zone_data(geo_hash)
    neighborhood = (cached_zone.get("neighborhood") or None) if cached_zone else None
    city = (cached_zone.get("city") or None) if cached_zone else None

    await supabase_db.mark_cells_explored(user_id, geo_hash, neighborhood, city)
    return ExploredCellResponse(geo_hash=geo_hash)


@router.get(
    "/explored-cells",
    response_model=ExploredCellsListResponse,
    summary="The caller's entire fog-of-war history",
)
async def list_explored_cells(user_id: AuthenticatedUser):
    geo_hashes = await supabase_db.get_explored_geohashes(user_id)
    return ExploredCellsListResponse(geo_hashes=geo_hashes)


@router.get(
    "/explored-cells/cities",
    response_model=ExploredCitiesResponse,
    summary="The caller's explored cells grouped by city, with counts",
)
async def list_explored_cities(user_id: AuthenticatedUser):
    raw_counts = await supabase_db.get_explored_city_counts(user_id)

    results = []
    for row in raw_counts:
        percentage = None
        # A boundary only exists for the pilot set
        # backend/scripts/map_region_boundaries.py has mapped so far --
        # absent for any city outside that list, which is the expected
        # common case, not an error.
        boundary = await supabase_db.get_region_boundary(row["city"])
        if boundary and boundary.get("total_cells"):
            percentage = min(100, round(row["count"] / boundary["total_cells"] * 100))
        results.append(ExploredCityCount(
            city=row["city"],
            count=row["count"],
            percentage=percentage,
        ))

    return ExploredCitiesResponse(cities=results)
