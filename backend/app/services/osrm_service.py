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

# OSRM's public demo isn't documented to have a hard coordinate cap, but
# very long requests are more likely to time out or get throttled on a
# shared free server -- a 12-block tour at the mobile app's 5m GPS
# sampling interval tops out around 300-400 raw points, comfortably
# under this.
MAX_POINTS = 500


async def snap_path_to_roads(points: list[dict]) -> list[dict]:
    """
    Snap a raw GPS trace onto the real road/sidewalk network.

    Args:
        points: [{"lat": float, "lng": float}, ...], in walked order.

    Returns:
        The snapped points in the same [{"lat", "lng"}, ...] shape, or
        the original `points` unchanged if OSRM is unavailable, errors,
        or can't confidently match this trace (e.g. too few points, or
        a walk with large GPS gaps) -- never raises, never blocks
        end-tour from succeeding just because a free optional service
        had a bad moment.
    """
    if len(points) < 2:
        return points
    if len(points) > MAX_POINTS:
        logger.warning(f"Path has {len(points)} points, over MAX_POINTS={MAX_POINTS} -- skipping road-snap")
        return points

    coords = ";".join(f"{p['lng']},{p['lat']}" for p in points)
    url = OSRM_MATCH_URL.format(coords=coords)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, params={"geometries": "geojson", "overview": "full"})
        if r.status_code != 200:
            logger.warning(f"OSRM match returned {r.status_code} — keeping raw path")
            return points

        data = r.json()
        if data.get("code") != "Ok" or not data.get("matchings"):
            logger.warning(f"OSRM match couldn't confidently snap this trace (code={data.get('code')}) — keeping raw path")
            return points

        # geojson coordinates are [lng, lat] pairs, in road-network order
        # (not 1:1 with the input points -- matching can add/merge points
        # to actually trace the road geometry).
        snapped = [{"lat": lat, "lng": lng} for lng, lat in data["matchings"][0]["geometry"]["coordinates"]]
        logger.info(f"OSRM snapped {len(points)} raw points -> {len(snapped)} road-matched points")
        return snapped

    except Exception as e:
        logger.warning(f"OSRM road-snap failed ({e}) — keeping raw path")
        return points
