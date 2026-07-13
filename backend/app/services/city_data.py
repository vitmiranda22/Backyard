"""
Multi-city open municipal data — extends DataSF's approach to other major
cities, gated on the geocoded city name matching the registry below (for
any other city, [] immediately, no network call — same principle as
DataSF's SF-only gate in zone_data.py, just at per-city granularity).

Platform-aware: most registered cities run Socrata/SODA (the same
platform as DataSF, different domain/dataset IDs). Paris runs
OpenDataSoft instead — the same platform this codebase already queries
in production for `global_sources.fetch_unesco_heritage` (data.unesco.org).
Each `CITY_DATASETS` entry declares its `platform` (defaults to
"socrata" if omitted) and `fetch_city_category()` dispatches to the
matching query helper — adding a new platform means one new query
function, not a rewrite of the registry shape.

Currently covers New York City, Chicago, Los Angeles, Seattle, Austin
(Socrata) and Paris (OpenDataSoft).

Dataset IDs verified live against each city's open data portal (each
checked with a real API request, not assumed from documentation):
- NYC 311 Service Requests: erm2-nwe9 (data.cityofnewyork.us)
- NYC DOB Permit Issuance: ipu4-2q9a (data.cityofnewyork.us)
- NYC NYPD Complaint Data (current year-to-date): 5uac-w243 (data.cityofnewyork.us)
- Chicago 311 Service Requests: v6vf-nfxy (data.cityofchicago.org)
- Chicago Building Permits: ydr8-5enu (data.cityofchicago.org)
- Chicago Crimes (2001-present): ijzp-q8t2 (data.cityofchicago.org)
- LA MyLA311 Service Requests 2025: h73f-gn57 (data.lacity.org) — this one
  is year-siloed (a new dataset ID each year, unlike the others below),
  revisit when 2026's dataset goes live
- LA Building Permits (2020-present, continuously updated): pi9x-tg5x (data.lacity.org)
- LA Crime Data (2020-present): 2nrs-mtv8 (data.lacity.org)
- Seattle Customer Service Requests: 5ngg-rpne (data.seattle.gov)
- Seattle Building Permits: 76t5-zqzr (data.seattle.gov)
- Seattle SPD Crime Data (2008-present): tazs-3rd5 (data.seattle.gov)
- Austin 311 Public Data: xwdj-i9he (data.austintexas.gov)
- Austin Issued Construction Permits: 3syk-w9eu (data.austintexas.gov)
- Austin Real-Time Fire Incidents: wpu4-x69d (data.austintexas.gov)
- Austin Tree Inventory (as of March 2020 — note the dataset's own field
  is literally misspelled "longtitude", not a typo here): wrik-xasw
  (data.austintexas.gov)

Wave-1 enrichment categories (police_incidents, fire_incidents, parks,
street_trees) were researched across all 5 cities above; what actually
verified cleanly turned out to be uneven — documented here so the gaps
read as "checked, not available in usable form" rather than "forgotten":
- police_incidents: found for NYC, Chicago, LA, Seattle. Austin's Crime
  Reports dataset (fdj4-gpfu) has no lat/lon at all — only council
  district/census block — so it's not usable for our per-block geo query.
- fire_incidents: found only for Austin. NYC's Fire Incident Dispatch
  Data and LA's LAFD Response Metrics both aggregate location away (cross
  streets/boroughs, no coordinates) for privacy/CAD-system reasons; Chicago
  and Seattle don't publish a geocoded fire-incident dataset via Socrata
  at all (Socrata's own catalog search turns up nothing on-topic).
- parks: every candidate found (Chicago, LA, Seattle) is a polygon/
  boundary dataset (or a zip-code-level aggregate for Seattle), not point
  data — incompatible with this module's bounding-box query pattern,
  which needs plain lat/lon columns. Would need real polygon-query support
  to use, a bigger change than this pass — not attempted.
- street_trees: found only for Austin (2020 inventory, reasonably fresh).
  LA has one too (vt5t-mscf) but it's an inventory from the 1990s — old
  enough that a tree it lists may well be gone, which risks a present-tense
  narration claim ("that tree right there...") being wrong; skipped rather
  than risk an inaccurate claim. Chicago, NYC, and Seattle don't publish a
  tree inventory via Socrata.

Checked and deliberately excluded (verified live, not a fit):
- Boston: 311 data lives on Analyze Boston's CKAN-based portal
  (data.boston.gov), not Socrata — its resource IDs are CKAN-style UUIDs,
  incompatible with this module's SODA query pattern. Building permits
  ARE on a Socrata endpoint (permits.partner.socrata.com/ga54-wzas), but
  mixing platforms per-city adds real complexity for one partial city —
  skipped for now.
- Washington DC: opendata.dc.gov does not respond to Socrata's
  `/resource/*.json` pattern at all (confirmed via direct request) despite
  some documentation suggesting otherwise — not Socrata.
- London (data.london.gov.uk) and CKAN generally: real and responsive,
  but CKAN's dataset search returns metadata about datasets, not a direct
  data-query endpoint — finding an actual geo-queryable resource inside a
  dataset (does it have "datastore active" status, does it expose lat/lon
  columns) needs per-dataset digging that Socrata/OpenDataSoft don't
  require. Deferred, not attempted blind. (London's crime data is covered
  anyway — see `global_sources.fetch_uk_police_data`, a UK-wide source,
  not part of this per-city registry.)

Paris (OpenDataSoft) — verified live against opendata.paris.fr's own API:
- Les arbres (street trees): les-arbres — 1,429 hits within 500m of
  central Paris in verification
- Autorisations d'urbanisme récentes (recent building/urban-planning
  authorizations — the building_permits equivalent): dossiers-recents-durbanisme
Both use the exact `geofilter.distance` query shape already proven live
by `fetch_unesco_heritage`, just against Paris's own OpenDataSoft domain
instead of data.unesco.org.
"""

import logging
import httpx

logger = logging.getLogger(__name__)

TIMEOUT = 5.0
LIMIT = 10
BOX_DEGREES = 0.002  # ~200m, matching RADIUS_METERS elsewhere

# Canonical category list — zone_data.py loops over this to build one task
# per category per request. Adding a category here rolls it out to every
# city that has a verified entry for it; cities without one just return []
# for that category via fetch_city_category(), no extra plumbing needed.
# "parks" was researched but deliberately left out — every candidate
# dataset found across the registered cities was polygon/boundary data,
# not point data this module's bounding-box query can use. See the
# module docstring for the full per-category research notes.
CITY_CATEGORIES = [
    "complaints_311",
    "building_permits",
    "police_incidents",
    "fire_incidents",
    "street_trees",
]

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
        "police_incidents": ("5uac-w243", "latitude", "longitude"),
    },
    "chicago": {
        "domain": "data.cityofchicago.org",
        "complaints_311": ("v6vf-nfxy", "latitude", "longitude"),
        "building_permits": ("ydr8-5enu", "latitude", "longitude"),
        "police_incidents": ("ijzp-q8t2", "latitude", "longitude"),
    },
    "los angeles": {
        "domain": "data.lacity.org",
        "complaints_311": ("h73f-gn57", "latitude", "longitude"),
        "building_permits": ("pi9x-tg5x", "lat", "lon"),
        "police_incidents": ("2nrs-mtv8", "lat", "lon"),
    },
    "seattle": {
        "domain": "data.seattle.gov",
        "complaints_311": ("5ngg-rpne", "latitude", "longitude"),
        "building_permits": ("76t5-zqzr", "latitude", "longitude"),
        "police_incidents": ("tazs-3rd5", "latitude", "longitude"),
    },
    "austin": {
        "domain": "data.austintexas.gov",
        "complaints_311": ("xwdj-i9he", "sr_location_lat", "sr_location_long"),
        "building_permits": ("3syk-w9eu", "latitude", "longitude"),
        "fire_incidents": ("wpu4-x69d", "latitude", "longitude"),
        "street_trees": ("wrik-xasw", "latitude", "longtitude"),
    },
    "paris": {
        "platform": "opendatasoft",
        "domain": "opendata.paris.fr",
        # OpenDataSoft entries are just a dataset ID — no lat/lon field
        # names needed, geofilter.distance handles the geo query itself.
        "building_permits": "dossiers-recents-durbanisme",
        "street_trees": "les-arbres",
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


async def _query_opendatasoft(domain: str, dataset_id: str, lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    Query an OpenDataSoft-hosted portal via its native geo-distance
    filter — same API shape already proven live in production by
    global_sources.fetch_unesco_heritage (data.unesco.org), just pointed
    at a different OpenDataSoft domain. RADIUS_METERS mirrors the value
    used elsewhere for a ~one-geohash-zone-wide query.
    """
    RADIUS_METERS = 150
    url = f"https://{domain}/api/records/1.0/search/"
    try:
        r = await client.get(
            url,
            params={
                "dataset": dataset_id,
                "rows": LIMIT,
                "geofilter.distance": f"{lat},{lng},{RADIUS_METERS}",
            },
            timeout=TIMEOUT,
        )
        if r.status_code == 200:
            records = r.json().get("records", [])
            return [rec.get("fields", {}) for rec in records if rec.get("fields")]
        logger.warning(f"{domain}/{dataset_id} returned {r.status_code}")
        return []
    except Exception as e:
        logger.warning(f"{domain}/{dataset_id} failed: {e}")
        return []


async def fetch_city_category(lat: float, lng: float, city: str, category: str, client: httpx.AsyncClient) -> list:
    """
    Generic dispatcher for any verified category (complaints_311,
    building_permits, police_incidents, fire_incidents, parks,
    street_trees, ...) in any registered city, on any registered
    platform. Returns [] immediately, with no network call, if the city
    doesn't match the registry OR if that category was never verified/
    added for this particular city — partial per-city coverage is
    expected and fine, not an error state.
    """
    config = _match_city(city)
    if not config or category not in config:
        return []

    platform = config.get("platform", "socrata")
    if platform == "opendatasoft":
        dataset_id = config[category]
        return await _query_opendatasoft(config["domain"], dataset_id, lat, lng, client)

    dataset_id, lat_field, lon_field = config[category]
    return await _query_box(config["domain"], dataset_id, lat_field, lon_field, lat, lng, client)
