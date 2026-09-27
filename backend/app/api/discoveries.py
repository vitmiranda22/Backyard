"""
Collectible Discoveries -- the caller's personal collection of narrated
places+moods (see migrations/034_discoveries.sql).

  GET /api/discoveries -- the caller's collection, newest-collected first

Recording a discovery happens entirely inside narrate.py's narrate_block
(a background task on every narration response) -- there is no POST here,
since a discovery is never something the client asserts on its own.
"""

import logging

from fastapi import APIRouter

from app.api.auth import AuthenticatedUser
from app.models.schemas import Discovery, DiscoveriesResponse
from app.services import supabase_db

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/discoveries",
    response_model=DiscoveriesResponse,
    summary="The caller's collected discoveries, newest first",
)
async def list_discoveries(user_id: AuthenticatedUser):
    rows, total_count = await supabase_db.get_user_discoveries(user_id)
    discoveries = [
        Discovery(
            id=row["id"],
            geo_hash=row["geo_hash"],
            mood=row["mood"],
            street_name=row["street_name"],
            neighborhood=row["neighborhood"],
            city=row["city"],
            teaser=row["teaser"],
            discovered_at=row["discovered_at"],
        )
        for row in rows
    ]
    return DiscoveriesResponse(discoveries=discoveries, total_count=total_count)
