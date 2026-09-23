"""
Offline, one-time (per region) data-population script for
region_boundaries (migration 033) -- never run as part of a live
request. Populates a real "% of this city explored" wherever a real OSM
administrative boundary exists.

Unlike the earlier, abandoned neighborhood-level attempt, this needs NO
AI/LLM step at all: real city administrative boundaries are reliably
present in OpenStreetMap, confirmed live against San Francisco, Chicago,
Los Angeles, and New York -- all four resolved cleanly. Pure OSM query
+ geometry math, zero tokens spent.

Two real correctness issues were caught live before this shipped, both
worth keeping in mind if this is ever extended:

  1. A bare name query is dangerous: `relation[name="San Francisco"]`
     with no geographic anchor matched a same-named relation in PERU,
     not California -- OSM has many places sharing a city name
     worldwide. Always anchor with is_in(lat,lng) at a real coordinate
     first, then filter to the relation(s) that actually contain it.

  2. A real administrative boundary is usually a `relation` made of
     several disjoint `outer`-role way segments, not one contiguous
     geometry array (San Francisco: 19 segments) -- and can have
     multiple genuinely separate closed rings, not just one (San
     Francisco's official boundary includes a second ring for the
     Farallon Islands, ~30mi offshore). This script stitches segments
     into ring(s) by matching endpoints, and treats "inside the region"
     as "inside ANY of its rings."

Usage (from backend/): python scripts/map_region_boundaries.py
"""

import sys
import asyncio
import logging

sys.path.insert(0, ".")
import httpx
import geohash2
from app.services import supabase_db, geocode

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

GEOHASH_PRECISION = 7
# Comfortably smaller than a precision-7 cell's own ~0.00137 degree span
# (confirmed via geohash2.decode_exactly) -- guarantees the enumeration
# below samples inside every cell in the bounding box at least once.
_CELL_ENUM_STEP_DEG = 0.0006

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
_HEADERS = {"User-Agent": "BackyardApp/1.0 (tour guide app; contact@backyard.app)"}

# Verified live this session -- every one of these resolved cleanly via
# is_in() + a real administrative relation with full geometry.
PILOT_CITIES = ["San Francisco", "Chicago", "Los Angeles", "New York"]

# A real city's admin_level varies by place (San Francisco is 6, Chicago
# and Los Angeles are 8) -- tried in this order, first relation whose
# name actually matches the target city wins, rather than assuming one
# fixed level works everywhere.
_CANDIDATE_ADMIN_LEVELS = ["6", "7", "8"]


def point_in_polygon(lat: float, lng: float, ring: list) -> bool:
    """Standard ray-casting point-in-polygon test against one ring."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        lat_i, lng_i = ring[i]["lat"], ring[i]["lng"]
        lat_j, lng_j = ring[j]["lat"], ring[j]["lng"]
        if ((lng_i > lng) != (lng_j > lng)) and (
            lat < (lat_j - lat_i) * (lng - lng_i) / (lng_j - lng_i) + lat_i
        ):
            inside = not inside
        j = i
    return inside


def point_in_any_ring(lat: float, lng: float, rings: list) -> bool:
    return any(point_in_polygon(lat, lng, ring) for ring in rings)


def count_cells_in_rings(rings: list) -> int:
    """
    Enumerates every geohash-7 cell whose CENTER falls inside any of
    `rings`, by sampling the COMBINED bounding box of all rings at a
    sub-cell resolution and testing each candidate cell's own center
    (not the sample point) against every ring.

    This assumes a region's rings are geographically close together
    (true for every real case seen so far -- San Francisco's mainland +
    Farallon Islands are only ~0.5 degrees apart). A ring genuinely far
    from the others would blow the combined bounding box up to a huge
    sample grid -- a real bug hit once during development, when a test
    placed two "disjoint ring" squares 13 degrees of latitude apart and
    hung the whole suite for several minutes.
    """
    all_points = [p for ring in rings for p in ring]
    min_lat = min(p["lat"] for p in all_points)
    max_lat = max(p["lat"] for p in all_points)
    min_lng = min(p["lng"] for p in all_points)
    max_lng = max(p["lng"] for p in all_points)

    candidate_hashes = set()
    lat = min_lat
    while lat <= max_lat:
        lng = min_lng
        while lng <= max_lng:
            candidate_hashes.add(geohash2.encode(lat, lng, precision=GEOHASH_PRECISION))
            lng += _CELL_ENUM_STEP_DEG
        lat += _CELL_ENUM_STEP_DEG

    count = 0
    for h in candidate_hashes:
        center_lat, center_lng, _, _ = geohash2.decode_exactly(h)
        if point_in_any_ring(center_lat, center_lng, rings):
            count += 1
    return count


def stitch_segments_into_rings(segments: list, eps: float = 1e-6) -> list:
    """
    Real administrative boundaries commonly arrive as several disjoint
    `outer`-role way segments (not one contiguous geometry), in
    arbitrary order and direction. This walks the segment pool,
    repeatedly attaching whichever remaining segment's start or end
    point matches (within `eps`) the current ring's open end -- reversing
    it if needed -- until no more segments attach, then starts a new
    ring with whatever's left. Confirmed live against San Francisco's
    real 19-segment boundary: correctly produced 2 closed rings (the
    main peninsula, and a separate one for the Farallon Islands).

    `segments`: list of lists of (lat, lng) tuples.
    Returns: list of rings, each a list of {"lat", "lng"} dicts.
    """
    pool = [list(s) for s in segments]
    rings = []
    while pool:
        ring = pool.pop(0)
        changed = True
        while changed:
            changed = False
            for i, seg in enumerate(pool):
                if abs(ring[-1][0] - seg[0][0]) < eps and abs(ring[-1][1] - seg[0][1]) < eps:
                    ring += seg[1:]
                    pool.pop(i)
                    changed = True
                    break
                elif abs(ring[-1][0] - seg[-1][0]) < eps and abs(ring[-1][1] - seg[-1][1]) < eps:
                    ring += list(reversed(seg))[1:]
                    pool.pop(i)
                    changed = True
                    break
                elif abs(ring[0][0] - seg[-1][0]) < eps and abs(ring[0][1] - seg[-1][1]) < eps:
                    ring = seg[:-1] + ring
                    pool.pop(i)
                    changed = True
                    break
                elif abs(ring[0][0] - seg[0][0]) < eps and abs(ring[0][1] - seg[0][1]) < eps:
                    ring = list(reversed(seg))[:-1] + ring
                    pool.pop(i)
                    changed = True
                    break
        rings.append([{"lat": lat, "lng": lng} for lat, lng in ring])
    return rings


async def _overpass_query(query: str):
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(endpoint, data={"data": query}, headers=_HEADERS, timeout=30.0)
                if r.status_code != 200:
                    continue
                return r.json()
        except Exception as e:
            logger.warning(f"Overpass endpoint {endpoint} failed: {e}")
            continue
    return None


async def fetch_city_boundary(city: str, hint_lat: float, hint_lng: float):
    """
    1. is_in() anchored at the city's own real coordinate -- never a bare
       name query, see this module's own docstring on the Peru near-miss.
    2. Among the administrative relations containing that point, picks
       the one whose name actually matches `city` (case-insensitive),
       trying each plausible admin_level in turn rather than assuming
       one fixed level works everywhere.
    3. Fetches that exact relation's full geometry by its numeric ID.
    4. Stitches its outer-role segments into closed ring(s).
    Returns (rings, admin_level) or (None, None) if nothing confident
    was found.
    """
    lookup = await _overpass_query(f"""
    [out:json][timeout:25];
    is_in({hint_lat},{hint_lng})->.a;
    rel(pivot.a)[boundary=administrative];
    out tags;
    """)
    if not lookup:
        return None, None

    match = None
    for el in lookup.get("elements", []):
        tags = el.get("tags", {})
        if tags.get("name", "").strip().lower() == city.strip().lower() and tags.get("admin_level") in _CANDIDATE_ADMIN_LEVELS:
            match = el
            break
    if not match:
        return None, None

    geom = await _overpass_query(f"""
    [out:json][timeout:25];
    relation({match['id']});
    out geom;
    """)
    if not geom:
        return None, None

    relation = next((el for el in geom.get("elements", []) if el.get("type") == "relation"), None)
    if not relation:
        return None, None

    outer_segments = [
        [(p["lat"], p["lon"]) for p in m["geometry"]]
        for m in relation.get("members", [])
        if m.get("role") == "outer" and "geometry" in m
    ]
    if not outer_segments:
        return None, None

    rings = stitch_segments_into_rings(outer_segments)
    return rings, match["tags"].get("admin_level")


async def main():
    results = {"success": [], "failed": []}

    for city in PILOT_CITIES:
        print(f"\n--- {city} ---")
        hint = await geocode.forward_geocode(city)
        if not hint:
            print("  Could not geocode the city name itself -- skipping.")
            results["failed"].append((city, "no geocode hint"))
            continue

        rings, admin_level = await fetch_city_boundary(city, hint.lat, hint.lng)
        if not rings:
            print("  No real administrative boundary found -- skipping.")
            results["failed"].append((city, "no boundary found"))
            continue

        total_cells = count_cells_in_rings(rings)
        if total_cells <= 0:
            print("  Boundary resolved but contains zero real cells -- skipping.")
            results["failed"].append((city, "degenerate polygon"))
            continue

        saved = await supabase_db.store_region_boundary(
            region_name=city, city=city, region_type="city",
            source="osm", osm_admin_level=admin_level,
            boundary_polygon=rings, total_cells=total_cells,
        )
        if not saved:
            print("  Computed a boundary but FAILED TO SAVE IT -- has migration 033 been run?")
            results["failed"].append((city, "save failed (migration not run?)"))
            continue

        print(f"  Stored: admin_level={admin_level}, {len(rings)} ring(s), total_cells={total_cells}")
        results["success"].append((city, total_cells, len(rings)))

    print("\n=== SUMMARY ===")
    print(f"Mapped ({len(results['success'])}):")
    for city, cells, ring_count in results["success"]:
        print(f"  {city} -- {cells} cells, {ring_count} ring(s)")
    print(f"Failed ({len(results['failed'])}):")
    for city, reason in results["failed"]:
        print(f"  {city} -- {reason}")


if __name__ == "__main__":
    asyncio.run(main())
