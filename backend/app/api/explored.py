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

import geohash2
from fastapi import APIRouter

from app.api.auth import AuthenticatedUser
from app.models.schemas import ExploredCellRequest, ExploredCellResponse, ExploredCellsListResponse
from app.services import supabase_db

GEOHASH_PRECISION = 7  # must match backend/app/api/narrate.py

router = APIRouter()


@router.post(
    "/explored-cells",
    response_model=ExploredCellResponse,
    summary="Report the caller's real position as explored",
)
async def report_explored_cell(request: ExploredCellRequest, user_id: AuthenticatedUser):
    geo_hash = geohash2.encode(request.lat, request.lng, precision=GEOHASH_PRECISION)
    await supabase_db.mark_cells_explored(user_id, [geo_hash])
    return ExploredCellResponse(geo_hash=geo_hash)


@router.get(
    "/explored-cells",
    response_model=ExploredCellsListResponse,
    summary="The caller's entire fog-of-war history",
)
async def list_explored_cells(user_id: AuthenticatedUser):
    geo_hashes = await supabase_db.get_explored_geohashes(user_id)
    return ExploredCellsListResponse(geo_hashes=geo_hashes)
