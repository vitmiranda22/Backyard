"""
Pre-fetch block facts (the ~34 data sources) into zone_data_cache for an
area, so a walker's first narration there skips the slow source fetch and
GPT writes from the same facts it would have fetched live. Generates no
narration and calls no LLM.

Usage (from backend/):
    python scripts/prefill_zone_data.py --lat 37.7955 --lng -122.3937 --radius-m 500 --dry-run
    python scripts/prefill_zone_data.py --lat 37.7955 --lng -122.3937 --radius-m 500

Safe to re-run: blocks already cached are skipped. Cache rows expire after
30 days (store_zone_data), so re-run monthly to keep an area warm. Runs one
block at a time on purpose -- every block reverse-geocodes through Nominatim,
whose usage policy caps bulk use at 1 request/second.
"""

import argparse
import asyncio
import math
import sys

sys.path.insert(0, ".")

import geohash2

from app.services import geocode, supabase_db
from app.services.zone_data import fetch_all_zone_data

GEOHASH_PRECISION = 7  # must match app/api/narrate.py
SAMPLE_STEP_M = 100  # finer than a ~153m cell, so no cell inside the radius is missed
METERS_PER_DEGREE_LAT = 111_320


def blocks_in_radius(lat: float, lng: float, radius_m: float) -> list[str]:
    """Every geohash-7 cell whose sampled points fall within radius_m of (lat, lng)."""
    steps = int(radius_m // SAMPLE_STEP_M)
    cells = set()
    for i in range(-steps, steps + 1):
        for j in range(-steps, steps + 1):
            dy, dx = i * SAMPLE_STEP_M, j * SAMPLE_STEP_M
            if dx * dx + dy * dy > radius_m * radius_m:
                continue
            p_lat = lat + dy / METERS_PER_DEGREE_LAT
            p_lng = lng + dx / (METERS_PER_DEGREE_LAT * math.cos(math.radians(lat)))
            cells.add(geohash2.encode(p_lat, p_lng, precision=GEOHASH_PRECISION))
    return sorted(cells)


async def prefill_block(geo_hash: str) -> str:
    if await supabase_db.get_cached_zone_data(geo_hash):
        return "already cached"

    lat, lng, _, _ = geohash2.decode_exactly(geo_hash)  # cell center
    place = await geocode.reverse_geocode(lat, lng)
    if not place:
        return "skipped (reverse geocode failed; the live request will fetch it)"

    result = await fetch_all_zone_data(
        lat=lat, lng=lng, street_name=place.street, neighborhood=place.neighborhood,
        city=place.city, country=place.country,
    )
    # Same row narrate.py writes on a live cache miss.
    await supabase_db.store_zone_data(
        geo_hash=geo_hash,
        street_name=place.street,
        neighborhood=place.neighborhood,
        city=place.city,
        country=place.country,
        raw_data=result["zone_data"],
        sources_queried=result["sources_queried"],
        sources_failed=result["sources_failed"],
        sources_hit_count=result["hit_count"],
        sources_eligible_count=result["total"] - len(result["sources_skipped"]),
        sources_skipped=result["sources_skipped"],
    )
    return f"cached {result['hit_count']} sources with data ({place.street}, {place.neighborhood})"


async def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lng", type=float, required=True)
    parser.add_argument("--radius-m", type=float, default=500)
    parser.add_argument("--dry-run", action="store_true", help="only list the blocks, fetch nothing")
    args = parser.parse_args()

    blocks = blocks_in_radius(args.lat, args.lng, args.radius_m)
    print(f"{len(blocks)} blocks within {args.radius_m:.0f} m")
    if args.dry_run:
        print("\n".join(blocks))
        return

    for n, geo_hash in enumerate(blocks, 1):
        print(f"[{n}/{len(blocks)}] {geo_hash}: {await prefill_block(geo_hash)}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
