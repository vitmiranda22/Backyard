"""
Offline, one-time (per neighborhood) data-population script for
neighborhood_boundaries (migration 032) -- never run as part of a live
request. Populates a real "% of this neighborhood explored" wherever a
boundary can be found; GET /explored-cells/neighborhoods (explored.py)
falls back to a plain count for every neighborhood this script hasn't
(or can't) map.

Per neighborhood, in order:
  1. Try a real OpenStreetMap boundary (Overpass, place=* way/relation
     with real geometry) -- free, accurate, no LLM involved. Confirmed
     live this session: some SF neighborhoods have this (Western
     Addition), most don't (Mission, Potrero Hill are point-only).
  2. If none, ask an LLM (with web_search) to find a REAL documented
     boundary description (Wikipedia neighborhood articles commonly
     state "bounded by X, Y, Z streets") and extract the named
     boundary streets + the source URL. Each consecutive pair of
     streets is geocoded as a real intersection query via the existing
     forward_geocode -- this is a genuinely imperfect extraction
     process (street order, intersection pairing, curved boundaries
     can all go wrong), so these rows are stored as source='ai_derived'
     with their real source_url, lower-confidence than 'osm' rows by
     design.
  3. If neither yields a confident boundary, skip -- never store a
     fabricated guess. That neighborhood just stays count-only.

This is a PILOT run (5 SF neighborhoods) -- read the printed summary,
especially every ai_derived row's source_url and resulting polygon
shape, before trusting this data or deciding whether to map more.

Usage (from backend/): python scripts/map_neighborhood_boundaries.py
"""

import sys
import json
import asyncio
import logging

sys.path.insert(0, ".")
import httpx
import geohash2
from app.services import supabase_db, geocode, openai_service

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

GEOHASH_PRECISION = 7
# Comfortably smaller than a precision-7 cell's own ~0.00137 degree span
# (confirmed via geohash2.decode_exactly) -- guarantees the enumeration
# below samples inside every cell in the bounding box at least once.
_CELL_ENUM_STEP_DEG = 0.0006

# Same endpoint + fallback + User-Agent pattern already used by
# global_sources.fetch_osm_buildings/fetch_openhistoricalmap -- Overpass
# returns a bare 406 with no User-Agent header at all.
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
_HEADERS = {"User-Agent": "BackyardApp/1.0 (tour guide app; contact@backyard.app)"}

PILOT_NEIGHBORHOODS = [
    ("Mission", "San Francisco"),
    ("Potrero Hill", "San Francisco"),
    ("Western Addition", "San Francisco"),
    ("Haight-Ashbury", "San Francisco"),
    ("Chinatown", "San Francisco"),
]


def point_in_polygon(lat: float, lng: float, polygon: list) -> bool:
    """
    Standard ray-casting point-in-polygon test. `polygon` is a list of
    {"lat", "lng"} dicts forming a closed (or implicitly-closed) ring.
    No new dependency -- same hand-rolled-geo-math convention already
    used for haversine distance in both explored.py and mobile's
    utils/geo.ts.
    """
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        lat_i, lng_i = polygon[i]["lat"], polygon[i]["lng"]
        lat_j, lng_j = polygon[j]["lat"], polygon[j]["lng"]
        if ((lng_i > lng) != (lng_j > lng)) and (
            lat < (lat_j - lat_i) * (lng - lng_i) / (lng_j - lng_i) + lat_i
        ):
            inside = not inside
        j = i
    return inside


def count_cells_in_polygon(polygon: list) -> int:
    """
    Enumerates every geohash-7 cell whose CENTER falls inside `polygon`,
    by sampling the polygon's bounding box at a sub-cell resolution and
    deduplicating which cell each sample point belongs to, then testing
    each candidate cell's own center (not the sample point) against the
    polygon -- this is what makes the result a real per-cell count, not
    just a sampling density.
    """
    lats = [p["lat"] for p in polygon]
    lngs = [p["lng"] for p in polygon]
    min_lat, max_lat = min(lats), max(lats)
    min_lng, max_lng = min(lngs), max(lngs)

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
        if point_in_polygon(center_lat, center_lng, polygon):
            count += 1
    return count


async def fetch_osm_boundary(neighborhood: str, city: str, hint_lat: float, hint_lng: float):
    """
    Looks for a real place=*/boundary=administrative way or relation
    near (hint_lat, hint_lng) whose name matches `neighborhood`, with
    real geometry (not just a point). Returns a polygon (list of
    {"lat","lng"}) or None.
    """
    query = f"""
    [out:json][timeout:25];
    (
      way(around:2000,{hint_lat},{hint_lng})["name"="{neighborhood}"]["place"];
      relation(around:2000,{hint_lat},{hint_lng})["name"="{neighborhood}"]["place"];
      way(around:2000,{hint_lat},{hint_lng})["name"="{neighborhood}"]["boundary"="administrative"];
    );
    out geom;
    """
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(endpoint, data={"data": query}, headers=_HEADERS, timeout=30.0)
                if r.status_code != 200:
                    continue
                elements = r.json().get("elements", [])
                for el in elements:
                    geometry = el.get("geometry")
                    if geometry and len(geometry) >= 3:
                        return [{"lat": pt["lat"], "lng": pt["lon"]} for pt in geometry]
            return None  # got a real response, just no polygon -- don't try the fallback endpoint too
        except Exception as e:
            logger.warning(f"Overpass endpoint {endpoint} failed for {neighborhood}: {e}")
            continue
    return None


def _extract_output_text(response) -> str:
    """
    response.output_text is a convenience shortcut that can come back
    empty even when the model produced real content (confirmed live:
    2 of 5 pilot calls got "" here despite a real answer existing in
    response.output) -- same fallback already used by
    openai_service.generate_narration for exactly this reason.
    """
    text = getattr(response, "output_text", None)
    if text:
        return text
    parts = []
    for item in getattr(response, "output", []) or []:
        if getattr(item, "type", None) == "message":
            for part in getattr(item, "content", []):
                if getattr(part, "text", None):
                    parts.append(part.text)
    return " ".join(parts)


async def extract_ai_boundary(neighborhood: str, city: str):
    """
    Asks the model (with web_search) to find a REAL documented boundary
    for this neighborhood and return structured JSON: the boundary
    streets and the real source URL it came from. Returns
    (streets, source_url) or (None, None) if nothing confident was found
    -- never fabricates a boundary when no real source describes one.

    Deliberately does NOT trust the model's claimed street ORDER --
    confirmed live this pilot run that it can include a street that
    isn't actually near the neighborhood at all (a real ~5.6km miss),
    so geocode_polygon_from_streets re-derives adjacency itself instead
    of pairing consecutive list items.
    """
    prompt = (
        f'Search for the real, documented geographic boundary of the "{neighborhood}" '
        f'neighborhood in {city}. Many neighborhood Wikipedia articles state this directly, '
        f'e.g. "bounded by X Street, Y Street, Z Avenue, and W Street." '
        f'Respond with ONLY a JSON object, no other text: '
        f'{{"found": true/false, "source_url": "the exact URL you found this in", '
        f'"boundary_streets": ["Street A", "Street B", "Street C", "Street D"]}} '
        f'If you cannot find a real documented boundary, respond with {{"found": false}}. '
        f'Never guess or invent a boundary that isn\'t stated in a real source.'
    )
    try:
        response = await openai_service.client.responses.create(
            model=openai_service.MODEL,
            instructions=prompt,
            input=f"Find the real boundary of {neighborhood}, {city}.",
            tools=[{"type": "web_search"}],
            temperature=0.2,
        )
        text = _extract_output_text(response).strip()
        text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(text)
        if not data.get("found") or not data.get("boundary_streets") or not data.get("source_url"):
            return None, None
        return data["boundary_streets"], data["source_url"]
    except Exception as e:
        logger.warning(f"AI boundary extraction failed for {neighborhood}, {city}: {e}")
        return None, None


# Any resulting INTERSECTION point farther than this from the
# neighborhood's own hint coordinate is almost certainly a
# hallucinated/mismatched entry (confirmed live: an extracted "17th
# Street" for Haight-Ashbury produced no real intersection with the
# other real boundary streets at all, ~5.6km off). Deliberately checked
# on the intersection point, not on each individual street's own
# geocoded location -- a long arterial street (Geary Boulevard, Van
# Ness Avenue) can legitimately span many kilometers, so "where does
# Nominatim place this whole street" isn't a meaningful proxy for
# "does it border this specific neighborhood" the way a specific
# intersection point is.
_MAX_CORNER_DISTANCE_FROM_HINT_M = 2500


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    import math
    r = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def geocode_polygon_from_streets(streets: list, city: str, hint_lat: float, hint_lng: float):
    """
    Geocodes every PAIR of the given streets as a real intersection query
    -- not just consecutive list-order pairs, since the model's claimed
    order isn't trustworthy (confirmed live this pilot: it can include a
    street with no real intersection near the others at all). Each
    resulting real intersection is kept only if it's actually near the
    neighborhood (see _MAX_CORNER_DISTANCE_FROM_HINT_M) -- checked on the
    intersection point itself, not on either street's own ambiguous
    whole-street location. The surviving corners are ordered by angle
    around their own centroid, closing them into a valid polygon ring
    regardless of what order anything was originally given in.
    Returns a polygon or None if fewer than 3 real corners were found.
    """
    corners = []
    for i in range(len(streets)):
        for j in range(i + 1, len(streets)):
            result = await geocode.forward_geocode(f"{streets[i]} & {streets[j]}, {city}")
            if not result:
                continue
            if _haversine_m(result.lat, result.lng, hint_lat, hint_lng) > _MAX_CORNER_DISTANCE_FROM_HINT_M:
                logger.warning(
                    f"Discarding '{streets[i]} & {streets[j]}' -- resolves too far from the {city} neighborhood hint"
                )
                continue
            corners.append({"lat": result.lat, "lng": result.lng})

    if len(corners) < 3:
        return None

    centroid_lat = sum(c["lat"] for c in corners) / len(corners)
    centroid_lng = sum(c["lng"] for c in corners) / len(corners)
    import math
    corners.sort(key=lambda c: math.atan2(c["lat"] - centroid_lat, c["lng"] - centroid_lng))
    return corners


async def main():
    summary = {"osm": [], "ai_derived": [], "skipped": []}

    for neighborhood, city in PILOT_NEIGHBORHOODS:
        print(f"\n--- {neighborhood}, {city} ---")
        hint = await geocode.forward_geocode(f"{neighborhood}, {city}")
        if not hint:
            print("  Could not even geocode the neighborhood name itself -- skipping.")
            summary["skipped"].append((neighborhood, city, "no geocode hint"))
            continue

        polygon = await fetch_osm_boundary(neighborhood, city, hint.lat, hint.lng)
        source, source_url = "osm", None

        if not polygon:
            print("  No OSM boundary found -- trying AI-assisted extraction...")
            streets, source_url = await extract_ai_boundary(neighborhood, city)
            if streets:
                print(f"  Found documented boundary streets: {streets}")
                print(f"  Source: {source_url}")
                polygon = await geocode_polygon_from_streets(streets, city, hint.lat, hint.lng)
                source = "ai_derived"

        if not polygon:
            print("  No confident boundary found anywhere -- staying count-only.")
            summary["skipped"].append((neighborhood, city, "no boundary found"))
            continue

        total_cells = count_cells_in_polygon(polygon)
        if total_cells <= 0:
            print(f"  Polygon resolved but contains zero real cells (likely a bad extraction) -- skipping.")
            summary["skipped"].append((neighborhood, city, "degenerate polygon"))
            continue

        saved = await supabase_db.store_neighborhood_boundary(neighborhood, city, source, source_url, polygon, total_cells)
        if not saved:
            print(f"  Computed a boundary but FAILED TO SAVE IT -- has migration 032 been run? Check logs above.")
            summary["skipped"].append((neighborhood, city, "save failed (migration not run?)"))
            continue
        print(f"  Stored: source={source}, total_cells={total_cells}")
        summary[source].append((neighborhood, city, total_cells, source_url))

    print("\n=== SUMMARY (review before trusting this data) ===")
    print(f"OSM-sourced ({len(summary['osm'])}):")
    for n, c, cells, _ in summary["osm"]:
        print(f"  {n}, {c} -- {cells} cells")
    print(f"AI-derived ({len(summary['ai_derived'])}) -- verify each source_url before trusting:")
    for n, c, cells, url in summary["ai_derived"]:
        print(f"  {n}, {c} -- {cells} cells -- {url}")
    print(f"Skipped ({len(summary['skipped'])}):")
    for n, c, reason in summary["skipped"]:
        print(f"  {n}, {c} -- {reason}")


if __name__ == "__main__":
    asyncio.run(main())
