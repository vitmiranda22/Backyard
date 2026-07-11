"""
DataSF SODA API integration — San Francisco datasets.

Fixed dataset IDs and query patterns. Not all datasets support
within_circle — some need simple text queries or different geo columns.
Each function handles its own query pattern.
"""

import logging
import httpx

logger = logging.getLogger(__name__)

TIMEOUT = 5.0
# Sized to roughly match one geohash-7 zone (~153m x 153m, see
# GEOHASH_PRECISION in app/api/narrate.py). This used to be 200m (400m
# diameter) — comfortably wider than a zone, so adjacent zones' queries
# overlapped and could pull the same top record, producing near-identical
# narration for two different blocks in the same tour. Revisit this if
# GEOHASH_PRECISION changes again.
RADIUS_METERS = 100
LIMIT = 10

BASE_URL = "https://data.sfgov.org/resource"


async def _query_soda_geo(dataset_id: str, geo_column: str, lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Query using within_circle on a geo column."""
    url = f"{BASE_URL}/{dataset_id}.json"
    where = f"within_circle({geo_column}, {lat}, {lng}, {RADIUS_METERS})"
    try:
        r = await client.get(url, params={"$where": where, "$limit": str(LIMIT)}, timeout=TIMEOUT)
        if r.status_code == 200:
            data = r.json()
            return data if isinstance(data, list) else []
        logger.warning(f"DataSF {dataset_id} returned {r.status_code}")
        return []
    except Exception as e:
        logger.warning(f"DataSF {dataset_id} failed: {e}")
        return []


async def _query_soda_simple(dataset_id: str, params: dict, client: httpx.AsyncClient) -> list:
    """Simple query with custom params (no geo filter)."""
    url = f"{BASE_URL}/{dataset_id}.json"
    params["$limit"] = str(LIMIT)
    try:
        r = await client.get(url, params=params, timeout=TIMEOUT)
        if r.status_code == 200:
            data = r.json()
            return data if isinstance(data, list) else []
        logger.warning(f"DataSF {dataset_id} returned {r.status_code}")
        return []
    except Exception as e:
        logger.warning(f"DataSF {dataset_id} failed: {e}")
        return []


# =============================================================================
# Individual dataset fetchers — correct IDs verified Feb 2026
# =============================================================================

async def fetch_film_locations(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Movies and TV shows filmed in SF. ID: yitu-d5am. No geo column — grab recent entries."""
    results = await _query_soda_simple("yitu-d5am", {"$order": "release_year DESC"}, client)
    return [{"title": f.get("title", ""), "release_year": f.get("release_year", ""),
             "locations": f.get("locations", ""), "fun_facts": f.get("fun_facts", "")}
            for f in results if f.get("locations")]


async def fetch_landmarks(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Historic landmarks. ID: 3aun-qh6z"""
    return await _query_soda_simple("3aun-qh6z", {"$limit": "10"}, client)


async def fetch_cultural_districts(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Cultural districts. ID: v5dn-kg7e"""
    return await _query_soda_simple("v5dn-kg7e", {"$limit": "10"}, client)


async def fetch_building_permits(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Building permits nearby. ID: i98e-djp9. Has 'location' geo column."""
    return await _query_soda_geo("i98e-djp9", "location", lat, lng, client)


async def fetch_businesses(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Registered businesses. ID: g8m3-pdis. Has 'business_location' but query format differs."""
    # This dataset's geo column doesn't support within_circle well
    # Use a simple query instead
    return await _query_soda_simple("g8m3-pdis", {
        "$order": "location_start_date DESC",
    }, client)


async def fetch_police_incidents(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Police incident reports. ID: wg3w-h783. Has 'point' geo column."""
    return await _query_soda_geo("wg3w-h783", "point", lat, lng, client)


async def fetch_street_trees(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Street trees. ID: tkzw-k3nq. Has 'location' geo column but may use different format."""
    # Try latitude/longitude columns directly
    url = f"{BASE_URL}/tkzw-k3nq.json"
    try:
        r = await client.get(url, params={
            "$where": f"latitude > {lat - 0.002} AND latitude < {lat + 0.002} AND longitude > {lng - 0.002} AND longitude < {lng + 0.002}",
            "$limit": str(LIMIT),
        }, timeout=TIMEOUT)
        if r.status_code == 200:
            data = r.json()
            return data if isinstance(data, list) else []
        # Fallback: try within_circle
        return await _query_soda_geo("tkzw-k3nq", "location", lat, lng, client)
    except Exception:
        return await _query_soda_geo("tkzw-k3nq", "location", lat, lng, client)


async def fetch_public_art(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Public art installations. ID: gfan-jd9y"""
    return await _query_soda_simple("gfan-jd9y", {"$limit": "10"}, client)


async def fetch_311_complaints(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """311 service requests. ID: vw6y-z8j6. Has 'point' geo column."""
    return await _query_soda_geo("vw6y-z8j6", "point", lat, lng, client)


async def fetch_evictions(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Eviction notices. ID: 5cei-gny5. Has 'shape' geo column."""
    return await _query_soda_geo("5cei-gny5", "shape", lat, lng, client)


async def fetch_parks(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Parks and rec. ID: gtr9-ntp6. Has 'shape' but may not support within_circle."""
    return await _query_soda_simple("gtr9-ntp6", {"$limit": "10"}, client)


async def fetch_fire_incidents(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Fire incidents. ID: wr8u-xric. Has 'point' geo column."""
    return await _query_soda_geo("wr8u-xric", "point", lat, lng, client)


async def fetch_civic_art(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """Civic Art Collection. ID: zfw6-95su"""
    return await _query_soda_simple("zfw6-95su", {"$limit": "10"}, client)


async def fetch_addresses(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    Enterprise addressing — active addresses. ID: dv2e-n9cv

    Box half-width ~0.0009deg (~100m) — sized to match one geohash-7 zone,
    same reasoning as RADIUS_METERS above. Used to be 0.002deg (~444m x
    222m box), wide enough to overlap adjacent zones and pull the same
    address into two different blocks' data.
    """
    return await _query_soda_simple("dv2e-n9cv", {
        "$where": f"latitude > {lat - 0.0009} AND latitude < {lat + 0.0009} AND longitude > {lng - 0.0009} AND longitude < {lng + 0.0009}",
    }, client)


async def fetch_neighborhoods(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """SF neighborhoods (analysis). ID: p5b7-5n3h"""
    return await _query_soda_simple("p5b7-5n3h", {"$limit": "5"}, client)