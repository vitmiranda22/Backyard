"""
Multi-city Socrata open data — extends DataSF's approach to other major
US cities that run the same Socrata/SODA platform, under different domains
and dataset IDs. Currently covers New York City and Chicago.

Unlike DataSF (always queried, since our origin city is SF), these sources
are gated on the geocoded city name matching the registry below — for any
other city they return [] immediately without making a network call.

Dataset IDs verified live against each city's open data portal:
- NYC 311 Service Requests: erm2-nwe9 (data.cityofnewyork.us)
- NYC DOB Permit Issuance: ipu4-2q9a (data.cityofnewyork.us)
- Chicago 311 Service Requests: v6vf-nfxy (data.cityofchicago.org)
- Chicago Building Permits: ydr8-5enu (data.cityofchicago.org)
"""

import logging
import httpx

logger = logging.getLogger(__name__)

TIMEOUT = 5.0
LIMIT = 10
BOX_DEGREES = 0.002  # ~200m, matching RADIUS_METERS elsewhere

# City registry: matched by substring against the geocoded city name
# (case-insensitive). Each dataset entry is (dataset_id, lat_field, lon_field) —
# these cities expose plain lat/lon columns rather than a SODA Point column,
# so we filter with a bounding box (same approach as DataSF's tree/address
# datasets) rather than within_circle.
CITY_DATASETS = {
    "new york": {
        "domain": "data.cityofnewyork.us",
        "complaints_311": ("erm2-nwe9", "latitude", "longitude"),
        "building_permits": ("ipu4-2q9a", "gis_latitude", "gis_longitude"),
    },
    "chicago": {
        "domain": "data.cityofchicago.org",
        "complaints_311": ("v6vf-nfxy", "latitude", "longitude"),
        "building_permits": ("ydr8-5enu", "latitude", "longitude"),
    },
}


def _match_city(city: str):
    if not city:
        return None
    city_lower = city.lower()
    for key, config in CITY_DATASETS.items():
        if key in city_lower:
            return config
    return None


async def _query_box(
    domain: str,
    dataset_id: str,
    lat_field: str,
    lon_field: str,
    lat: float,
    lng: float,
    client: httpx.AsyncClient,
) -> list:
    url = f"https://{domain}/resource/{dataset_id}.json"
    where = (
        f"{lat_field} > {lat - BOX_DEGREES} AND {lat_field} < {lat + BOX_DEGREES} AND "
        f"{lon_field} > {lng - BOX_DEGREES} AND {lon_field} < {lng + BOX_DEGREES}"
    )
    try:
        r = await client.get(url, params={"$where": where, "$limit": str(LIMIT)}, timeout=TIMEOUT)
        if r.status_code == 200:
            data = r.json()
            return data if isinstance(data, list) else []
        logger.warning(f"{domain}/{dataset_id} returned {r.status_code}")
        return []
    except Exception as e:
        logger.warning(f"{domain}/{dataset_id} failed: {e}")
        return []


async def fetch_city_311(lat: float, lng: float, city: str, client: httpx.AsyncClient) -> list:
    """311 service requests for supported non-SF cities (currently NYC, Chicago)."""
    config = _match_city(city)
    if not config:
        return []
    dataset_id, lat_field, lon_field = config["complaints_311"]
    return await _query_box(config["domain"], dataset_id, lat_field, lon_field, lat, lng, client)


async def fetch_city_building_permits(lat: float, lng: float, city: str, client: httpx.AsyncClient) -> list:
    """Building permits for supported non-SF cities (currently NYC, Chicago)."""
    config = _match_city(city)
    if not config:
        return []
    dataset_id, lat_field, lon_field = config["building_permits"]
    return await _query_box(config["domain"], dataset_id, lat_field, lon_field, lat, lng, client)
