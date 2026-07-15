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
(Socrata) and 21 OpenDataSoft cities across 8 countries: Paris, Nantes,
Angers, Rennes, Strasbourg, Tours, Issy-les-Moulineaux (France), Vancouver
(Canada), Brussels, Namur, Liège, Gent (Belgium), Leicester (UK), Umeå
(Sweden), Bologna (Italy), Potsdam (Germany), Salinas, Long Beach,
Jersey City, Morrisville, Cary (USA).

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
- London (data.london.gov.uk) and CKAN generally: CLOSED, not just
  deferred — do not re-evaluate CKAN again without genuinely new
  information. Re-checked directly (not just skipped from memory) by
  probing for a `datastore_active` resource via `package_search` — the
  flag CKAN uses to mark a resource as live-queryable rather than a
  static download. Every tree-related result came back as a raw `.xlsx`
  file with no datastore flag at all. CKAN's dataset search returns
  metadata about datasets, not a direct data-query endpoint — finding an
  actual geo-queryable resource inside a dataset needs per-dataset
  digging that Socrata/OpenDataSoft don't require, and integrating a
  static-file-only portal would mean downloading and parsing whole
  spreadsheets, a fundamentally different and heavier pattern than every
  other source in this codebase (all of which are instant geo-queries).
  This is a structural mismatch with how this module works, not a
  temporary gap. (London's crime data and heritage/planning data are
  both covered anyway — see `global_sources.fetch_uk_police_data` and
  `fetch_uk_planning_data`, UK-wide sources, not part of this per-city
  registry.)

OpenDataSoft cities — OpenDataSoft itself publishes a live directory of
every city running their platform (53 cities at last count, queried
directly, not guessed). All 53 were checked with an automated script
(catalog search for tree/permit keywords in English + likely local
language, then a real geo-distance test query) — but the *raw* script
output was NOT trusted directly: reviewing all 34 initial "hits" by hand
found roughly half were false positives or mislabeled (a keyword search
matching a dataset's metadata text doesn't mean the dataset is actually
about that category). Only entries confirmed to be genuinely about trees
or building/urbanism permits — not just keyword-adjacent — made it into
the registry below. 21 cities total (Paris/Vancouver/Brussels from the
prior pass, +18 here):
- Paris: Les arbres (street trees) — les-arbres, 1,429 hits within 500m
  of central Paris. Autorisations d'urbanisme récentes (recent building/
  urban-planning authorizations, the building_permits equivalent) —
  dossiers-recents-durbanisme.
- Vancouver: public-trees — refreshes daily on weekdays, confirmed real
  species-level records (e.g. European Beech with height/diameter).
- Brussels: arbres-bomen-vbx-be-bm — bilingual (French/Dutch) tree
  dataset, confirmed real records (e.g. Ginkgo biloba near Grand Place).
- Namur, Umeå, Nantes, Bologna: both categories verified real (Umeå's
  bygglov-inkomna-arenden = "building permit applications received";
  Bologna's permessi-di-costruire-rilasciati literally means "building
  permits issued").
- Leicester, Angers, Rennes, Salinas, Long Beach, Jersey City, Potsdam,
  Gent, Liège, Tours: street_trees only (no permit-equivalent dataset
  survived review for these).
- Morrisville, Cary, Strasbourg: building_permits only.
- Issy-les-Moulineaux: both categories, but with a caveat — this city's
  own OpenDataSoft-directory geopoint reverse-geocodes to neighboring
  Sèvres (a boundary-precision quirk, confirmed live), and Tours'
  geopoint similarly resolves to neighboring Fondettes. Both registry
  keys use the *correct* intended city name (the datasets are genuinely
  named after and about Issy-les-Moulineaux/Tours), not the mismatched
  centroid result — a real coordinate inside either city should still
  geocode correctly; only the one directory centroid point happened to
  sit near a boundary.
- Accent handling: Nominatim returns some of these cities with their
  native diacritics (Liège, Umeå) — `_match_city` now strips accents on
  both sides of the comparison (`_strip_accents`) rather than requiring
  registry keys to be hand-typed with the exact right accented
  characters, which is fragile and was already a source of real bugs
  during this verification pass (console/file encoding mangled several
  names before the underlying JSON was read directly).

Checked and rejected (verified live, not a fit — kept here so the
research isn't silently redone later): Basel (dataset was an events/
schedule table, not trees), Greater Geelong (yearly aggregate counts,
no per-location records), Toulouse (both "hits" were a weather station
and aggregate planting statistics), Fleury-sur-Orne (public poster-board
locations, not permits), Würzburg (a hiking-trail dataset, not trees),
Cachan (green-space polygons + a subsidy table, neither a fit),
Eindhoven (green-zone polygons + parking-permit zones, not building
permits), Aix-en-Provence (the French national business registry, not
permits), Bordeaux (both "hits" were generic zoning-plan-document
metadata layers, no individual permit records), Saint-Maur-des-Fossés
(a public-procurement dataset + an address database, neither trees nor
permits), Valenciennes/Chateauroux/Saint-Louis (zoning-document
reference layers only — real and geo-queryable, but no permit-specific
content like dates/applicants/addresses, so excluded on the same bar
used elsewhere). Also rejected per-category on otherwise-valid cities:
Leicester's "building_permits" match was actually an environmental
(waste/pollution) permits dataset; Rennes' matched permits dataset is
scoped to neighboring Cesson-Sévigné, not Rennes itself; Liège's
"building_permits" match was literally the same tree dataset ID as its
street_trees entry (a duplicate, not a second real category); Tours' and
Potsdam's permit matches were zoning-document-only, same bar as above.

All OpenDataSoft entries use the exact `geofilter.distance` query shape
already proven live by `fetch_unesco_heritage`, just against each city's
own OpenDataSoft domain instead of data.unesco.org.
"""

import logging
import unicodedata
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
    "vancouver": {
        "platform": "opendatasoft",
        "domain": "opendata.vancouver.ca",
        "street_trees": "public-trees",
    },
    # Nominatim returns this city as "Bruxelles - Brussel" (French/Dutch,
    # no English "Brussels" at all) — confirmed live, hence the "brussel"
    # substring key rather than the English name.
    "brussel": {
        "platform": "opendatasoft",
        "domain": "opendata.brussels.be",
        "street_trees": "arbres-bomen-vbx-be-bm",
    },
    "namur": {
        "platform": "opendatasoft",
        "domain": "data.namur.be",
        "street_trees": "nat_arbres_projet",
        "building_permits": "liste-urbanisme-urbaweb-permis-graphique",
    },
    "leicester": {
        "platform": "opendatasoft",
        "domain": "data.leicester.gov.uk",
        "street_trees": "tree_preservation_order",
    },
    "angers": {
        "platform": "opendatasoft",
        "domain": "data.angers.fr",
        "street_trees": "arbre-signal-angers",
    },
    "umea": {
        "platform": "opendatasoft",
        "domain": "opendata.umea.se",
        "street_trees": "trad-som-forvaltas-av-gator-och-parker",
        "building_permits": "bygglov-inkomna-arenden",
    },
    "morrisville": {
        "platform": "opendatasoft",
        "domain": "opendata.townofmorrisville.org",
        "building_permits": "tom_permit_data",
    },
    "rennes": {
        "platform": "opendatasoft",
        "domain": "data.rennesmetropole.fr",
        "street_trees": "mce_arbre_remarquable",
    },
    "cary": {
        "platform": "opendatasoft",
        "domain": "data.townofcary.org",
        "building_permits": "permit-inspections",
    },
    "salinas": {
        "platform": "opendatasoft",
        "domain": "cityofsalinas.opendatasoft.com",
        "street_trees": "tree-inventory",
    },
    "nantes": {
        "platform": "opendatasoft",
        "domain": "data.nantesmetropole.fr",
        "street_trees": "244400404_patrimoine-arbore-nantes-metropole",
        "building_permits": "244400404_demandes-autorisations-decisions-urbanisme-nantes-metropole",
    },
    # Nominatim returns this as "Long Beach" (two words) — "long beach"
    # used rather than a shorter fragment to avoid any collision risk.
    "long beach": {
        "platform": "opendatasoft",
        "domain": "longbeach.opendatasoft.com",
        "street_trees": "tree-inventory",
    },
    "jersey city": {
        "platform": "opendatasoft",
        "domain": "data.jerseycitynj.gov",
        "street_trees": "tree-planting-locations",
    },
    "bologna": {
        "platform": "opendatasoft",
        "domain": "opendata.comune.bologna.it",
        "street_trees": "alberi-manutenzioni",
        "building_permits": "permessi-di-costruire-rilasciati",
    },
    "potsdam": {
        "platform": "opendatasoft",
        "domain": "opendata.potsdam.de",
        "street_trees": "baeume-2-stadtkarte-potsdam",
    },
    "strasbourg": {
        "platform": "opendatasoft",
        "domain": "data.strasbourg.eu",
        "building_permits": "publiactes",
    },
    "gent": {
        "platform": "opendatasoft",
        "domain": "data.stad.gent",
        "street_trees": "locaties-bomen-gent",
    },
    "liege": {
        "platform": "opendatasoft",
        "domain": "opendata.liege.be",
        "street_trees": "arbustum",
    },
    # The city's own OpenDataSoft directory geopoint reverse-geocodes to
    # neighboring Sèvres (a boundary/precision quirk, confirmed live) —
    # using the correct intended city name here, not the mismatched one,
    # since the dataset itself is genuinely Issy-les-Moulineaux's own.
    "issy-les-moulineaux": {
        "platform": "opendatasoft",
        "domain": "issy-les-moulineaux.opendatasoft.com",
        "street_trees": "arbres-remarquables-issy-les-moulineaux",
        "building_permits": "ilm_grandes_operations0",
    },
    # Same directory-geopoint quirk as Issy-les-Moulineaux above — this
    # city's centroid reverse-geocodes to neighboring Fondettes.
    "tours": {
        "platform": "opendatasoft",
        "domain": "toursmetropole.opendatasoft.com",
        "street_trees": "arbres-tours",
    },
}


def _strip_accents(s: str) -> str:
    """
    Normalize accented characters to their plain-ASCII equivalent
    (Châteauroux -> Chateauroux, Würzburg -> Wurzburg, Liège -> Liege,
    Umeå -> Umea) so registry keys can be written in plain ASCII and
    still match Nominatim's actual (often accented) geocoded city names.
    Verifying the 53-city OpenDataSoft batch surfaced this as a real gap
    — several cities would have silently never matched without it.
    """
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")


def _match_city(city: str):
    if not city:
        return None
    city_lower = _strip_accents(city.lower())
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
