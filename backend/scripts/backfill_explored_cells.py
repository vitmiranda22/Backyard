"""
One-time backfill for Terra Incognita (fog-of-war map discovery,
migrations/029_user_explored_cells.sql): marks every existing user's own
real walking history as already-explored, so long-time users don't wake
up to a 100% fogged map on a feature that shipped after they'd already
done all that walking.

Only covers tours a user actually CREATED (the only historical per-user
GPS record that exists in this schema) — prefers each tour's recorded
path_points (the real walked GPS trace, see supabase_db.end_tour), and
falls back to its tour_blocks' lat/lng for older tours recorded before
path persistence shipped. Same fallback order mobile's MapScreen.tsx
already uses for path rendering.

Usage (from backend/):
    python scripts/backfill_explored_cells.py

Safe to re-run: mark_cells_explored is an idempotent upsert.
"""

import sys
import asyncio
import geohash2

sys.path.insert(0, ".")

from app.services import supabase_db

GEOHASH_PRECISION = 7  # must match backend/app/api/narrate.py


async def main():
    client = supabase_db._get_client()

    tours = client.table("tours").select("id,creator_id,path_points").execute().data or []
    print(f"{len(tours)} tours found.")

    explored_by_user: dict[str, set[str]] = {}

    def _add(creator_id: str, lat, lng):
        if lat is None or lng is None:
            return
        geo_hash = geohash2.encode(lat, lng, precision=GEOHASH_PRECISION)
        explored_by_user.setdefault(creator_id, set()).add(geo_hash)

    tours_missing_path = []
    for tour in tours:
        path_points = tour.get("path_points") or []
        if path_points:
            for point in path_points:
                _add(tour["creator_id"], point.get("lat"), point.get("lng"))
        else:
            tours_missing_path.append(tour)

    print(f"{len(tours) - len(tours_missing_path)} tours used their recorded path; "
          f"{len(tours_missing_path)} fall back to tour_blocks.")

    creator_by_tour_id = {t["id"]: t["creator_id"] for t in tours_missing_path}
    ids_missing_path = list(creator_by_tour_id.keys())
    if ids_missing_path:
        # Chunked -- PostgREST's `in_` filter has a practical URL-length
        # ceiling well below what the full tour set could hit.
        CHUNK = 200
        for i in range(0, len(ids_missing_path), CHUNK):
            chunk_ids = ids_missing_path[i:i + CHUNK]
            blocks = (
                client.table("tour_blocks")
                .select("tour_id,lat,lng")
                .in_("tour_id", chunk_ids)
                .execute()
                .data or []
            )
            for block in blocks:
                creator_id = creator_by_tour_id.get(block["tour_id"])
                if creator_id:
                    _add(creator_id, block.get("lat"), block.get("lng"))

    total_cells = sum(len(cells) for cells in explored_by_user.values())
    print(f"{len(explored_by_user)} users, {total_cells} total explored cells to backfill.")

    for creator_id, cells in explored_by_user.items():
        await supabase_db.mark_cells_explored(creator_id, list(cells))

    print("Done.")


asyncio.run(main())
