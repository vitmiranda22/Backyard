"""
OSRM (Open Source Routing Machine) map-matching — snaps a walked GPS
trace onto the real street/sidewalk network before it's saved as a
tour's path_points, so a route rendered later never appears to cut
through a building. Uses OSRM's free public demo server, the same
"free public geo API, no key, no SLA" pattern already used for Nominatim
(see geocode.py) — acceptable for this app's current low traffic, not
guaranteed uptime or rate limits.

Deliberately server-side and one-shot at end-of-tour, not live during
the walk (that's mobile's job — see mobile/src/services/roadSnap.ts,
which snaps individual points for the live trailing path via the
lighter /nearest endpoint instead of a full /match call).
"""

import logging

import httpx

logger = logging.getLogger(__name__)

OSRM_MATCH_URL = "https://router.project-osrm.org/match/v1/foot/{coords}"

# The public demo server hard-caps /match requests at exactly 10
# coordinates (confirmed empirically — 10 succeeds, 11 returns a 400
# "TooBig" error, consistently, regardless of trace density). This is
# NOT documented anywhere; found by bisecting real failures during this
# feature's own backfill. A normal walking tour at the mobile app's 5m
# GPS sampling interval blows past 10 points within the first couple of
# minutes, so every request MUST be chunked — there is no "just send it
# all at once" path here, unlike a naive first read of OSRM's docs
# would suggest.
OSRM_MAX_COORDS_PER_REQUEST = 10

# Sanity ceiling on total path length this will attempt to chunk-and-snap
# at all — a 12-block tour at 5m/5s sampling tops out around 300-400
# points, comfortably under this even with chunking overhead.
MAX_POINTS = 1000


async def _match_chunk(points: list[dict], client: httpx.AsyncClient) -> list[dict] | None:
    """
    One OSRM /match call for <= OSRM_MAX_COORDS_PER_REQUEST points.
    Returns None (not the original points) on failure, so the caller can
    tell "snap failed for this chunk" apart from "here are the results"
    and fall back per-chunk rather than losing the whole path's snapping
    over one bad segment.
    """
    coords = ";".join(f"{p['lng']},{p['lat']}" for p in points)
    url = OSRM_MATCH_URL.format(coords=coords)

    try:
        r = await client.get(url, params={"geometries": "geojson", "overview": "full"})
        if r.status_code != 200:
            logger.warning(f"OSRM match returned {r.status_code} for a {len(points)}-point chunk — keeping raw for this chunk")
            return None

        data = r.json()
        if data.get("code") != "Ok" or not data.get("matchings"):
            logger.warning(f"OSRM couldn't confidently match a {len(points)}-point chunk (code={data.get('code')}) — keeping raw for this chunk")
            return None

        # geojson coordinates are [lng, lat] pairs, in road-network order
        # (not 1:1 with the input points -- matching can add/merge points
        # to actually trace the road geometry).
        return [{"lat": lat, "lng": lng} for lng, lat in data["matchings"][0]["geometry"]["coordinates"]]

    except Exception as e:
        logger.warning(f"OSRM match request failed for a {len(points)}-point chunk ({e}) — keeping raw for this chunk")
        return None


async def snap_path_to_roads(points: list[dict]) -> list[dict]:
    """
    Snap a raw GPS trace onto the real road/sidewalk network.

    Splits the trace into <= OSRM_MAX_COORDS_PER_REQUEST-point chunks
    (overlapping by one point each, so consecutive chunks share a
    coordinate and the stitched result has no gap at the seam), snaps
    each chunk independently, and concatenates the results. A chunk that
    fails to match falls back to ITS OWN raw points rather than losing
    the whole path's snapping over one noisy segment.

    Args:
        points: [{"lat": float, "lng": float}, ...], in walked order.

    Returns:
        The snapped points in the same [{"lat", "lng"}, ...] shape.
        Never raises, never blocks end-tour from succeeding just because
        a free optional service had a bad moment — worst case, a chunk
        (or the whole path) comes back exactly as it went in.
    """
    if len(points) < 2:
        return points
    if len(points) > MAX_POINTS:
        logger.warning(f"Path has {len(points)} points, over MAX_POINTS={MAX_POINTS} -- skipping road-snap")
        return points

    if len(points) <= OSRM_MAX_COORDS_PER_REQUEST:
        async with httpx.AsyncClient(timeout=15.0) as client:
            snapped = await _match_chunk(points, client)
        result = snapped if snapped is not None else points
        logger.info(f"OSRM snapped {len(points)} raw points -> {len(result)} points (single request)")
        return result

    result: list[dict] = []
    step = OSRM_MAX_COORDS_PER_REQUEST - 1  # 1-point overlap between chunks
    async with httpx.AsyncClient(timeout=15.0) as client:
        i = 0
        while i < len(points) - 1:
            chunk = points[i : i + OSRM_MAX_COORDS_PER_REQUEST]
            if len(chunk) < 2:
                result.extend(chunk)
                break
            snapped_chunk = await _match_chunk(chunk, client)
            chunk_result = snapped_chunk if snapped_chunk is not None else chunk
            # Drop the first point of this chunk's result if it duplicates
            # the last point already appended (the intentional 1-point
            # overlap), so the seam doesn't produce a visible double-back.
            if result and chunk_result:
                result.extend(chunk_result[1:] if len(chunk_result) > 1 else chunk_result)
            else:
                result.extend(chunk_result)
            i += step

    logger.info(f"OSRM snapped {len(points)} raw points -> {len(result)} points ({-(-len(points) // step)} chunks)")
    return result or points
