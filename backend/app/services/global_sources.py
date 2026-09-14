"""
Global data sources — work at ANY coordinate on Earth, not a city list.
Deliberately verified this session against a Wikipedia-thin rural-Peru
coordinate as well as well-documented cities, since the whole point of
this layer is raising the floor in undocumented places, not just adding
convenience in already-rich ones.

19 sources:
- Wikipedia Geosearch: articles about places within 200m
- Wikivoyage Geosearch: travel-guide entries near these coordinates —
  local-color/"what to notice" voice, distinct from Wikipedia's tone
- Wikimedia Commons: historical photos near coordinates
- OpenStreetMap Overpass: building + memorial + mural + ghost-sign +
  park/garden + individually-mapped-tree metadata
- Google Knowledge Graph: entity enrichment
- Wikidata SPARQL: structured facts (architect, construction date, type),
  notable people (born/died/lived here), and film locations for entities
  near this coordinate
- TMDb: films/TV associated with the city (city-level only — TMDb's public
  API has no per-address filming-location endpoint, so it can't pinpoint
  exact street locations the way the SF-specific film dataset does)
- UNESCO World Heritage List: ~1,250 sites worldwide, live geo-distance query
- GeoNames: nearby named places/features from the global gazetteer
- Europeana: digitized European museum/archive/library items near this spot
- GBIF: nearby wildlife/plant occurrence records — broader geographic
  coverage than a community-observation app alone (see fetch_gbif_occurrences)
- USGS Earthquake Catalog: notable historical seismic events in the
  region — genuinely global despite the name, confirmed at both Tokyo
  and rural Peru
- USGS Elevation Point Query Service: the elevation, in meters, at this
  exact coordinate — also global despite the "national map" name
- Open-Meteo Historical Weather: real recorded weather for this exact
  spot, one year ago today — global reanalysis-model coverage, works
  even where there's no nearby weather station
- MusicBrainz: musicians/bands tied to this city (formed/based here)
- Open Library: real books set in or about this city
- Smithsonian Open Access: museum/library artifact metadata mentioning
  this city (guidebooks, art collections, exhibition catalogs)
- Library of Congress: real historic photos/documents mentioning this
  exact street/neighborhood
- NYT Article Search: real news coverage mentioning this street/
  neighborhood
- US Census ACS: a real demographic snapshot (population, median
  income, median age) for this exact location's county — US-only,
  self-gated on country like the UK sources below

All free. Wikipedia/Wikivoyage/Wikimedia/OSM/Wikidata/UNESCO/GBIF/USGS
(earthquakes and elevation)/Open-Meteo/MusicBrainz/Open Library/Library
of Congress need no API key
(MusicBrainz just needs a real User-Agent header and respects a ~1req/sec
rate limit). Knowledge Graph reuses your Google Cloud TTS key. TMDb,
GeoNames, Europeana, Smithsonian, NYT, and US Census each need their own
free key/username (optional — each source is skipped entirely if its
credential is unset).

Plus two country-gated sources, `fetch_uk_police_data` and
`fetch_uk_planning_data` — not global, but not city-specific either:
each is a single API covering all of the UK at once, so they live here
rather than in city_data.py's per-city registry. Both self-gate
internally (return [] with no network call outside the UK) rather than
needing zone_data.py's task-dict-level gating.
"""

import datetime
import logging
import httpx

from app.config import settings

logger = logging.getLogger(__name__)

TIMEOUT = 5.0
RADIUS_METERS = 200


async def fetch_wikipedia(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    Wikipedia Geosearch — find articles about places within 200m.
    Returns article titles and short extracts, plus each article's real
    lat/lng (used by zone_data.pick_suggested_next for the map's
    suggested-waypoint marker, not just narration text).
    Wikipedia requires a User-Agent header.
    """
    headers = {"User-Agent": "BackyardApp/1.0 (tour guide app; contact@backyard.app)"}
    try:
        # Step 1: Find nearby articles
        r = await client.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "list": "geosearch",
                "gscoord": f"{lat}|{lng}",
                "gsradius": str(RADIUS_METERS),
                "gslimit": "5",
                "format": "json",
            },
            headers=headers,
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            logger.warning(f"Wikipedia geosearch returned {r.status_code}")
            return []

        articles = r.json().get("query", {}).get("geosearch", [])
        if not articles:
            return []

        # Step 2: Get extracts for each article
        page_ids = "|".join(str(a["pageid"]) for a in articles)
        r2 = await client.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "pageids": page_ids,
                "prop": "extracts",
                "exintro": "true",
                "explaintext": "true",
                "exsentences": "3",
                "format": "json",
            },
            headers=headers,
            timeout=TIMEOUT,
        )
        if r2.status_code != 200:
            return [{"title": a["title"], "dist_m": a.get("dist", 0), "lat": a.get("lat"), "lng": a.get("lon")} for a in articles]

        pages = r2.json().get("query", {}).get("pages", {})
        results = []
        for a in articles:
            page = pages.get(str(a["pageid"]), {})
            results.append({
                "title": a["title"],
                "extract": page.get("extract", ""),
                "dist_m": a.get("dist", 0),
                # Already present on every geosearch result -- previously
                # discarded. Now used by zone_data.pick_suggested_next to
                # place a real waypoint marker, not just narration text.
                "lat": a.get("lat"),
                "lng": a.get("lon"),
            })
        return results

    except Exception as e:
        logger.warning(f"Wikipedia geosearch failed: {e}")
        return []


async def fetch_wikimedia_commons(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    Wikimedia Commons — find historical photos near these coordinates.
    Returns image titles and URLs. Requires User-Agent.
    """
    headers = {"User-Agent": "BackyardApp/1.0 (tour guide app; contact@backyard.app)"}
    try:
        r = await client.get(
            "https://commons.wikimedia.org/w/api.php",
            params={
                "action": "query",
                "list": "geosearch",
                "gscoord": f"{lat}|{lng}",
                "gsradius": str(RADIUS_METERS),
                "gslimit": "5",
                "gsnamespace": "6",  # File namespace
                "format": "json",
            },
            headers=headers,
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        results = r.json().get("query", {}).get("geosearch", [])
        return [{"title": r["title"], "dist_m": r.get("dist", 0)} for r in results]

    except Exception as e:
        logger.warning(f"Wikimedia Commons failed: {e}")
        return []


OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    # Public fallback mirror — the primary instance has no SLA and is
    # known to rate-limit/time out under load. Since this query runs for
    # every non-cached location worldwide (it's one of the few sources
    # with zero city-specific gating), losing it to a transient outage
    # would quietly degrade every global-tier city at once.
    "https://overpass.kumi.systems/api/interpreter",
]


async def fetch_osm_buildings(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    OpenStreetMap Overpass API — building + street-level detail nearby.
    Returns building names/ages/styles plus the "notice this" layer: war
    memorials and plaques, murals, ghost signs (disused shops still bearing
    old signage), cemeteries, parks/gardens, individually-mapped trees, and
    (added this pass) live shops/cafes/restaurants/bars. That last group is
    what makes "local business texture" global instead of SF/city_data.py
    -only: DataSF's `businesses` dataset and city_data.py's per-city
    registries only exist for a handful of cities, but OSM has real shop/
    amenity tags almost everywhere it has any coverage at all — so this one
    query now gives every city on Earth roughly the same texture that used
    to be SF-exclusive, no registry entry required. Works anywhere OSM has
    coverage — no per-city configuration, unlike DataSF/city_data.py. The
    tree tag in particular gives real, current tree data anywhere OSM
    contributors have mapped it, not just the handful of cities with a
    municipal tree-inventory dataset (SF, Austin, Paris today).
    """
    query = f"""
    [out:json][timeout:8];
    (
      way(around:{RADIUS_METERS},{lat},{lng})["building"];
      node(around:{RADIUS_METERS},{lat},{lng})["historic"];
      way(around:{RADIUS_METERS},{lat},{lng})["historic"];
      node(around:{RADIUS_METERS},{lat},{lng})["tourism"];
      node(around:{RADIUS_METERS},{lat},{lng})["memorial"];
      way(around:{RADIUS_METERS},{lat},{lng})["memorial"];
      node(around:{RADIUS_METERS},{lat},{lng})["artwork_type"];
      node(around:{RADIUS_METERS},{lat},{lng})["disused:shop"];
      way(around:{RADIUS_METERS},{lat},{lng})["disused:shop"];
      node(around:{RADIUS_METERS},{lat},{lng})["amenity"="grave_yard"];
      way(around:{RADIUS_METERS},{lat},{lng})["landuse"="cemetery"];
      way(around:{RADIUS_METERS},{lat},{lng})["leisure"="park"];
      way(around:{RADIUS_METERS},{lat},{lng})["leisure"="garden"];
      node(around:{RADIUS_METERS},{lat},{lng})["natural"="tree"];
      node(around:{RADIUS_METERS},{lat},{lng})["shop"];
      node(around:{RADIUS_METERS},{lat},{lng})["amenity"~"^(cafe|restaurant|bar|pub)$"];
    );
    out body center 20;
    """

    # Confirmed live: Overpass returns a bare 406 Not Acceptable with no
    # User-Agent header at all (not a rate-limit or query problem) — this
    # was silently killing every OSM fetch before this fix, worldwide,
    # since this source has no gating and ran on every zone.
    headers = {"User-Agent": "BackyardApp/1.0 (tour guide app; contact@backyard.app)"}

    for i, endpoint in enumerate(OVERPASS_ENDPOINTS):
        try:
            r = await client.post(endpoint, data={"data": query}, headers=headers, timeout=TIMEOUT + 3)
            if r.status_code != 200:
                logger.warning(f"Overpass endpoint {endpoint} returned {r.status_code}")
                continue

            elements = r.json().get("elements", [])
            results = []
            for el in elements[:20]:
                tags = el.get("tags", {})
                if tags:
                    # Nodes carry lat/lon directly; ways/relations only get
                    # a computed centroid because the query now asks for
                    # "out center" too -- either way, this is a real
                    # coordinate (not narration text), used by
                    # zone_data.pick_suggested_next for the map's
                    # suggested-waypoint marker.
                    center = el.get("center") or {}
                    results.append({
                        "type": el.get("type", ""),
                        "name": tags.get("name", ""),
                        "building": tags.get("building", ""),
                        "architect": tags.get("architect", ""),
                        "start_date": tags.get("start_date", ""),
                        "heritage": tags.get("heritage", ""),
                        "historic": tags.get("historic", ""),
                        "tourism": tags.get("tourism", ""),
                        "memorial": tags.get("memorial", ""),
                        "artwork_type": tags.get("artwork_type", ""),
                        "disused_shop": tags.get("disused:shop", ""),
                        "amenity": tags.get("amenity", ""),
                        "shop": tags.get("shop", ""),
                        "cuisine": tags.get("cuisine", ""),
                        "landuse": tags.get("landuse", ""),
                        "leisure": tags.get("leisure", ""),
                        "description": tags.get("description", ""),
                        "old_name": tags.get("old_name", ""),
                        "natural": tags.get("natural", ""),
                        "species": tags.get("species") or tags.get("species:en", ""),
                        "genus": tags.get("genus", ""),
                        "leaf_type": tags.get("leaf_type", ""),
                        "lat": el.get("lat", center.get("lat")),
                        "lng": el.get("lon", center.get("lon")),
                    })
            return results

        except Exception as e:
            logger.warning(f"Overpass endpoint {endpoint} failed: {e}")
            continue

    return []


async def fetch_knowledge_graph(street: str, neighborhood: str, client: httpx.AsyncClient) -> list:
    """
    Google Knowledge Graph API — entity enrichment.
    Searches for the street/neighborhood and returns related entities.
    Uses your Google Cloud API key. 100k queries/day free.
    """
    # Use the TTS API key (same Google Cloud project)
    api_key = getattr(settings, "GOOGLE_TTS_API_KEY", None)
    if not api_key:
        return []

    try:
        query = f"{street} {neighborhood}"
        r = await client.get(
            "https://kgsearch.googleapis.com/v1/entities:search",
            params={
                "query": query,
                "key": api_key,
                "limit": "3",
                "indent": "true",
            },
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        items = r.json().get("itemListElement", [])
        results = []
        for item in items:
            entity = item.get("result", {})
            results.append({
                "name": entity.get("name", ""),
                "type": entity.get("@type", []),
                "description": entity.get("description", ""),
                "detail": entity.get("detailedDescription", {}).get("articleBody", ""),
            })
        return results

    except Exception as e:
        logger.warning(f"Knowledge Graph failed: {e}")
        return []


async def fetch_wikidata(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    Wikidata Query Service (SPARQL) — structured facts about entities near
    this coordinate: what something is, when it was built, who designed it,
    which notable people were born/died/lived here (P19/P20/P551), and
    which films were shot here (P915 filming location) — the last one is
    more geographically precise than TMDb's city-level data below, since
    it's tied to the exact nearby entity rather than just the city name.
    No API key, works anywhere Wikidata has coverage (most of the world).

    Returns a flat list of dicts distinguished by "kind": "place" | "person" | "film".
    """
    radius_km = RADIUS_METERS / 1000
    query = f"""
    SELECT ?itemLabel ?typeLabel ?inceptionLabel ?architectLabel
           ?personLabel ?personRelation ?filmLabel ?dist WHERE {{
      SERVICE wikibase:around {{
        ?item wdt:P625 ?coord .
        bd:serviceParam wikibase:center "Point({lng} {lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "{radius_km}" .
      }}
      BIND(geof:distance("Point({lng} {lat})"^^geo:wktLiteral, ?coord) AS ?dist)
      OPTIONAL {{ ?item wdt:P31 ?type . }}
      OPTIONAL {{ ?item wdt:P571 ?inception . }}
      OPTIONAL {{ ?item wdt:P84 ?architect . }}
      OPTIONAL {{
        {{ ?person wdt:P19 ?item . BIND("born here" AS ?personRelation) }}
        UNION
        {{ ?person wdt:P20 ?item . BIND("died here" AS ?personRelation) }}
        UNION
        {{ ?person wdt:P551 ?item . BIND("lived here" AS ?personRelation) }}
      }}
      OPTIONAL {{ ?film wdt:P915 ?item . }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}
    ORDER BY ?dist
    LIMIT 25
    """
    headers = {
        "User-Agent": "BackyardApp/1.0 (tour guide app; contact@backyard.app)",
        "Accept": "application/sparql-results+json",
    }
    try:
        r = await client.get(
            "https://query.wikidata.org/sparql",
            params={"query": query, "format": "json"},
            headers=headers,
            timeout=TIMEOUT + 5,
        )
        if r.status_code != 200:
            logger.warning(f"Wikidata SPARQL returned {r.status_code}")
            return []

        bindings = r.json().get("results", {}).get("bindings", [])
        results = []
        seen = set()
        for b in bindings:
            item_name = b.get("itemLabel", {}).get("value", "")
            person_name = b.get("personLabel", {}).get("value", "")
            film_name = b.get("filmLabel", {}).get("value", "")

            if item_name and ("place", item_name) not in seen:
                seen.add(("place", item_name))
                results.append({
                    "kind": "place",
                    "name": item_name,
                    "type": b.get("typeLabel", {}).get("value", ""),
                    "inception": b.get("inceptionLabel", {}).get("value", "")[:10],
                    "architect": b.get("architectLabel", {}).get("value", ""),
                })

            if person_name and ("person", person_name, item_name) not in seen:
                seen.add(("person", person_name, item_name))
                results.append({
                    "kind": "person",
                    "name": person_name,
                    "relation": b.get("personRelation", {}).get("value", ""),
                    "place": item_name,
                })

            if film_name and ("film", film_name, item_name) not in seen:
                seen.add(("film", film_name, item_name))
                results.append({
                    "kind": "film",
                    "name": film_name,
                    "place": item_name,
                })

        return results

    except Exception as e:
        logger.warning(f"Wikidata SPARQL failed: {e}")
        return []


async def fetch_unesco_heritage(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    UNESCO World Heritage List — official OpenDataSoft-hosted API
    (data.unesco.org), ~1,250 sites worldwide. No API key needed, and it
    supports a native geo-distance filter, so this is a normal live
    per-request query like the other global sources rather than something
    that needs bundling locally. Verified live: geofilter.distance returns
    real nearby results (e.g. 2 hits within 5km of central Paris).
    """
    try:
        r = await client.get(
            "https://data.unesco.org/api/records/1.0/search/",
            params={
                "dataset": "whc001",
                "rows": 3,
                "geofilter.distance": f"{lat},{lng},3000",
            },
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        records = r.json().get("records", [])
        results = []
        for rec in records:
            f = rec.get("fields", {})
            if not f.get("name_en"):
                continue
            results.append({
                "name": f.get("name_en", ""),
                "states": f.get("states_names", ""),
                "inscribed": f.get("secondary_dates", ""),
                "justification": (f.get("justification_en") or "")[:400],
            })
        return results

    except Exception as e:
        logger.warning(f"UNESCO World Heritage lookup failed: {e}")
        return []


async def fetch_geonames(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    GeoNames findNearby — named places/features close to this coordinate
    (populated places, physical geography, points of interest), classified
    by feature type. Global gazetteer coverage that often fills in gaps
    where OSM/Wikipedia are sparse. Requires a free username (register at
    geonames.org, confirm by email, enable the webservice) — skipped
    entirely if GEONAMES_USERNAME isn't set.
    """
    username = getattr(settings, "GEONAMES_USERNAME", None)
    if not username:
        return []

    try:
        r = await client.get(
            "http://api.geonames.org/findNearbyJSON",
            params={"lat": lat, "lng": lng, "radius": 1, "maxRows": 10, "username": username},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        geonames = r.json().get("geonames", [])
        return [
            {
                "name": g.get("name", ""),
                "feature_class": g.get("fclName", ""),
                "feature_type": g.get("fCodeName", ""),
                "distance_km": g.get("distance", ""),
            }
            for g in geonames
            if g.get("name")
        ]

    except Exception as e:
        logger.warning(f"GeoNames lookup failed: {e}")
        return []


async def fetch_europeana(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    Europeana — digitized museum/archive/library items across Europe, the
    closest thing to "DataSF for the whole EU." Geo-filtered via the
    distance() query function on items with a currentLocation. Requires a
    free API key (register at pro.europeana.eu/get-api) — skipped entirely
    if EUROPEANA_API_KEY isn't set.
    """
    api_key = getattr(settings, "EUROPEANA_API_KEY", None)
    if not api_key:
        return []

    try:
        r = await client.get(
            "https://api.europeana.eu/record/v2/search.json",
            params={
                "wskey": api_key,
                "query": "*:*",
                "qf": f"distance(currentLocation,{lat},{lng},2)",
                "rows": 8,
                "profile": "minimal",
            },
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        items = r.json().get("items", [])
        results = []
        for item in items:
            title = (item.get("title") or [""])[0]
            if not title:
                continue
            results.append({
                "title": title,
                "provider": (item.get("dataProvider") or [""])[0],
                "year": (item.get("year") or [""])[0] if item.get("year") else "",
            })
        return results

    except Exception as e:
        logger.warning(f"Europeana lookup failed: {e}")
        return []


async def fetch_tmdb_films(city: str, client: httpx.AsyncClient) -> list:
    """
    TMDb — films/TV associated with this city, via keyword tagging.

    City-level only: TMDb's public API has no per-address filming-location
    endpoint, so unlike the SF-specific film dataset (or Wikidata's P915
    above), this can't pinpoint an exact street. It's a broader "movies set
    in or shot around this city" signal. Optional — skipped entirely if
    TMDB_API_KEY isn't set.
    """
    api_key = getattr(settings, "TMDB_API_KEY", None)
    if not api_key or not city:
        return []

    try:
        r = await client.get(
            "https://api.themoviedb.org/3/search/keyword",
            params={"api_key": api_key, "query": city},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []
        keywords = r.json().get("results", [])
        if not keywords:
            return []
        keyword_id = keywords[0]["id"]

        r2 = await client.get(
            "https://api.themoviedb.org/3/discover/movie",
            params={
                "api_key": api_key,
                "with_keywords": keyword_id,
                "sort_by": "popularity.desc",
            },
            timeout=TIMEOUT,
        )
        if r2.status_code != 200:
            return []

        movies = r2.json().get("results", [])[:8]
        return [
            {
                "title": m.get("title", ""),
                "release_year": (m.get("release_date") or "")[:4],
                "overview": m.get("overview", "")[:200],
            }
            for m in movies
            if m.get("title")
        ]

    except Exception as e:
        logger.warning(f"TMDb lookup failed: {e}")
        return []


async def fetch_wikivoyage(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    Wikivoyage Geosearch — travel-guide entries near these coordinates.
    Same MediaWiki geosearch+extracts pattern as fetch_wikipedia, pointed
    at Wikivoyage instead — a local-color, "what to notice/do here" voice
    distinct from Wikipedia's encyclopedic tone. No API key, works anywhere
    Wikivoyage has coverage (dense in touristed areas, thin elsewhere).
    """
    headers = {"User-Agent": "BackyardApp/1.0 (tour guide app; contact@backyard.app)"}
    try:
        r = await client.get(
            "https://en.wikivoyage.org/w/api.php",
            params={
                "action": "query",
                "list": "geosearch",
                "gscoord": f"{lat}|{lng}",
                "gsradius": str(RADIUS_METERS),
                "gslimit": "3",
                "format": "json",
            },
            headers=headers,
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        articles = r.json().get("query", {}).get("geosearch", [])
        if not articles:
            return []

        page_ids = "|".join(str(a["pageid"]) for a in articles)
        r2 = await client.get(
            "https://en.wikivoyage.org/w/api.php",
            params={
                "action": "query",
                "pageids": page_ids,
                "prop": "extracts",
                "exintro": "true",
                "explaintext": "true",
                "exsentences": "3",
                "format": "json",
            },
            headers=headers,
            timeout=TIMEOUT,
        )
        if r2.status_code != 200:
            return [{"title": a["title"], "dist_m": a.get("dist", 0)} for a in articles]

        pages = r2.json().get("query", {}).get("pages", {})
        results = []
        for a in articles:
            page = pages.get(str(a["pageid"]), {})
            results.append({
                "title": a["title"],
                "extract": page.get("extract", ""),
                "dist_m": a.get("dist", 0),
            })
        return results

    except Exception as e:
        logger.warning(f"Wikivoyage geosearch failed: {e}")
        return []


async def fetch_gbif_occurrences(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    GBIF (Global Biodiversity Information Facility) — nearby wildlife/
    plant occurrence records, free and keyless. Replaces an earlier
    iNaturalist-only version of this source: GBIF aggregates iNaturalist's
    own observations PLUS museum specimen records and many other
    biodiversity databases, giving meaningfully broader geographic
    coverage — confirmed live that a rural-Peru coordinate with almost no
    Wikipedia presence still returned 1,378 real GBIF occurrence records,
    far more than a community-observation app alone would likely surface
    in a region with less iNaturalist user activity.

    GBIF occurrence records essentially never include a plain-English
    vernacular name (confirmed live at both Tokyo and Peru) — rather than
    drop every result the way the old "must have a common name" filter
    would, this uses the scientific species name plus taxonomic class
    (e.g. "Aves" -> "bird") so the model gets a friendly, narratable
    category alongside a real, verifiable species name.
    """
    try:
        r = await client.get(
            "https://api.gbif.org/v1/occurrence/search",
            params={
                "decimalLatitude": f"{lat - 0.0015},{lat + 0.0015}",
                "decimalLongitude": f"{lng - 0.0015},{lng + 0.0015}",
                "limit": 8,
            },
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        results = []
        for rec in r.json().get("results", []):
            species = rec.get("species")
            if not species:
                continue
            results.append({
                "species": species,
                "taxon_class": rec.get("class", ""),
                "kingdom": rec.get("kingdom", ""),
            })
        return results

    except Exception as e:
        logger.warning(f"GBIF lookup failed: {e}")
        return []


async def fetch_uk_police_data(lat: float, lng: float, country: str, client: httpx.AsyncClient) -> list:
    """
    UK Police street-level crime data (data.police.uk) — free, keyless,
    no rate limit, and NOT a per-city integration: one endpoint covers
    London, Manchester, Birmingham, Edinburgh, and every other UK city at
    once. Gated on country (checked here, not in zone_data.py's task
    dict) since this is a single source — an early return achieves the
    same zero-wasted-network-calls result as DataSF's dict-level gate did
    for its 15 sources, without needing the same dict-construction
    machinery for just one function. Defaults to the latest available
    month if no date is given.
    """
    if not country or "united kingdom" not in country.lower():
        return []

    try:
        r = await client.get(
            "https://data.police.uk/api/crimes-street/all-crime",
            params={"lat": lat, "lng": lng},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        results = []
        for crime in r.json()[:10]:
            category = crime.get("category", "")
            street = (crime.get("location") or {}).get("street", {}).get("name", "")
            month = crime.get("month", "")
            if not category:
                continue
            results.append({
                "category": category.replace("-", " "),
                "street": street,
                "month": month,
            })
        return results

    except Exception as e:
        logger.warning(f"UK Police data lookup failed: {e}")
        return []


async def fetch_earthquake_history(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    USGS Earthquake Catalog — despite the name, genuinely global (not
    US-limited), free, no key. Confirmed live at both Tokyo and rural
    Peru, so this is a real floor-raiser in exactly the places with the
    thinnest Wikipedia/OSM coverage, not just a convenience for well-
    documented cities.

    Seismic history is regional, not hyperlocal — unlike the ~150m zone
    radius used elsewhere, this queries 100km out and the prompt-facing
    framing should say "this region" felt/experienced the quake, never
    "this exact spot." An explicit starttime is required: the API's
    default window without one is only the last ~30 days, which reads as
    "no data" for basically every location and would make this look
    broken rather than just under-queried.
    """
    try:
        r = await client.get(
            "https://earthquake.usgs.gov/fdsnws/event/1/query",
            params={
                "format": "geojson",
                "latitude": lat,
                "longitude": lng,
                "maxradiuskm": 100,
                "minmagnitude": 5.5,
                "starttime": "1900-01-01",
                "orderby": "magnitude",
                "limit": 5,
            },
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        results = []
        for feature in r.json().get("features", []):
            props = feature.get("properties", {})
            place = props.get("place", "")
            mag = props.get("mag")
            time_ms = props.get("time")
            if not place or mag is None:
                continue
            year = None
            if time_ms:
                # datetime.utcfromtimestamp() throws OSError [Errno 22] on
                # Windows for negative timestamps (pre-1970 dates) -- and
                # USGS's catalog is full of them (the 1906 SF earthquake is
                # -2010394053700ms). That exception used to propagate out of
                # this whole function's try block, silently discarding every
                # earthquake for the zone, not just the unparseable one.
                # Pure epoch arithmetic works the same on every platform.
                year = (datetime.datetime(1970, 1, 1) + datetime.timedelta(milliseconds=time_ms)).year
            results.append({"place": place, "mag": mag, "year": year})
        return results

    except Exception as e:
        logger.warning(f"USGS earthquake lookup failed: {e}")
        return []


async def fetch_elevation(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    USGS Elevation Point Query Service — the elevation, in meters, at this
    exact coordinate. Free, no key, global (despite the "national map"
    name, confirmed live it answers for non-US coordinates too). Returns
    at most one row, same singular shape as fetch_weather_history — this
    is a fact about the exact point, not a list of nearby things.
    """
    try:
        r = await client.get(
            "https://epqs.nationalmap.gov/v1/json",
            params={"x": lng, "y": lat, "units": "Meters", "wkid": 4326, "includeDate": "false"},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        value = r.json().get("value")
        if value is None:
            return []
        try:
            meters = float(value)
        except (TypeError, ValueError):
            return []
        # The service returns a large negative sentinel (-1000000) for
        # coordinates outside its raster coverage (open ocean, etc.)
        # rather than an error status -- treat that as no data.
        if meters <= -9999:
            return []
        return [{"meters": round(meters)}]

    except Exception as e:
        logger.warning(f"USGS elevation lookup failed: {e}")
        return []


async def fetch_uk_planning_data(lat: float, lng: float, country: str, client: httpx.AsyncClient) -> list:
    """
    UK Planning Data (planning.data.gov.uk) — a separate national API
    from fetch_uk_police_data, England-wide, covering 100+ planning and
    heritage datasets through one consistent coordinate-based interface.
    Confirmed live: a real conservation area ("Trafalgar Square") near
    central London. Gated on country, same self-gating pattern as the
    police source — early return outside the UK, no network call.

    Curated to the heritage/character categories most useful for
    narration (conservation areas, listed buildings, tree preservation
    zones, article 4 directions, scheduled monuments) — skips green-belt/
    flood-risk-zone/brownfield-land, which are real planning categories
    but not narratively interesting.

    Each entity's response includes a large geometry/point WKT field —
    dropped entirely here, it's irrelevant to the prompt and just bulk.
    """
    if not country or "united kingdom" not in country.lower():
        return []

    try:
        r = await client.get(
            "https://www.planning.data.gov.uk/entity.json",
            params=[
                ("latitude", lat),
                ("longitude", lng),
                ("dataset", "conservation-area"),
                ("dataset", "listed-building"),
                ("dataset", "tree-preservation-zone"),
                ("dataset", "article-4-direction-area"),
                ("dataset", "scheduled-monument"),
                ("limit", 8),
            ],
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        results = []
        for entity in r.json().get("entities", []):
            name = entity.get("name", "")
            dataset = entity.get("dataset", "")
            if not name:
                continue
            results.append({
                "name": name,
                "planning_category": dataset.replace("-", " "),
                "entry_date": entity.get("entry-date", ""),
            })
        return results

    except Exception as e:
        logger.warning(f"UK Planning Data lookup failed: {e}")
        return []


async def fetch_weather_history(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    Open-Meteo Historical Weather Archive — real recorded weather for this
    exact spot, one year ago today. No API key, genuinely global coverage
    (verified against Paris; Open-Meteo's archive is reanalysis-model
    based, so it has data everywhere, not just station-dense countries).

    Deliberately a fixed past date rather than "today's weather": current
    conditions would be stale within hours, but zone_data_cache holds
    this for 30 days, so the fact needs to stay true for the whole cache
    lifetime. "One year ago today" is a real, verifiable, permanently-true
    fact the moment it's fetched — narration should frame it that way
    ("around this time last year"), never as current conditions.
    """
    target = datetime.date.today() - datetime.timedelta(days=365)
    date_str = target.isoformat()
    try:
        r = await client.get(
            "https://archive-api.open-meteo.com/v1/archive",
            params={
                "latitude": lat,
                "longitude": lng,
                "start_date": date_str,
                "end_date": date_str,
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
                "timezone": "auto",
            },
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        daily = r.json().get("daily", {})
        highs = daily.get("temperature_2m_max") or []
        if not highs or highs[0] is None:
            return []
        lows = daily.get("temperature_2m_min") or []
        precip = daily.get("precipitation_sum") or []
        return [{
            "date": date_str,
            "high_c": highs[0],
            "low_c": lows[0] if lows else None,
            "precip_mm": precip[0] if precip else None,
        }]

    except Exception as e:
        logger.warning(f"Open-Meteo weather history failed: {e}")
        return []


async def fetch_musicbrainz_artists(city: str, client: httpx.AsyncClient) -> list:
    """
    MusicBrainz — musicians/bands tied to this city (formed here, or
    based here). No API key, but requires a real User-Agent per their
    usage policy, and their public server is rate-limited to roughly one
    request per second — fine for the single call this makes per
    zone-data fetch, but never call this in a tight loop.

    City-level only, same granularity as fetch_tmdb_films below —
    MusicBrainz's area search matches by place name text, not coordinates,
    so this can't pin down "this exact block," only "this city."
    """
    if not city:
        return []

    headers = {"User-Agent": "BackyardApp/1.0 (tour guide app; contact@backyard.app)"}
    try:
        r = await client.get(
            "https://musicbrainz.org/ws/2/artist/",
            params={
                "query": f'area:"{city}" AND type:(Group OR Person)',
                "fmt": "json",
                "limit": "6",
            },
            headers=headers,
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        results = []
        for a in r.json().get("artists", []):
            name = a.get("name", "")
            if not name:
                continue
            life_span = a.get("life-span") or {}
            results.append({
                "name": name,
                "type": a.get("type", ""),
                "disambiguation": a.get("disambiguation", ""),
                "begin": life_span.get("begin", ""),
            })
        return results

    except Exception as e:
        logger.warning(f"MusicBrainz lookup failed: {e}")
        return []


async def fetch_smithsonian(city: str, client: httpx.AsyncClient) -> list:
    """
    Smithsonian Open Access — real museum/library artifact metadata
    mentioning this city (guidebooks, art collections, exhibition
    catalogs). Optional, free key from api.data.gov/signup. City-level
    only, same granularity as fetch_tmdb_films/fetch_musicbrainz_artists.
    Deliberately does NOT fall back to the public "DEMO_KEY" the docs
    mention -- that key is shared globally across every developer testing
    the API and rate-limited accordingly, unreliable for real traffic.
    """
    api_key = getattr(settings, "SMITHSONIAN_API_KEY", None)
    if not api_key or not city:
        return []

    try:
        r = await client.get(
            "https://api.si.edu/openaccess/api/v1.0/search",
            params={"q": city, "api_key": api_key, "rows": "6"},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        results = []
        for row in r.json().get("response", {}).get("rows", []):
            title = row.get("title", "")
            if not title:
                continue
            freetext = row.get("content", {}).get("freetext", {})
            dates = freetext.get("date", [])
            topics = freetext.get("topic", [])
            results.append({
                "title": title,
                "date": dates[0].get("content", "") if dates else "",
                "topic": topics[0].get("content", "") if topics else "",
            })
        return results

    except Exception as e:
        logger.warning(f"Smithsonian Open Access failed: {e}")
        return []


async def fetch_library_of_congress(street: str, neighborhood: str, city: str, client: httpx.AsyncClient) -> list:
    """
    Library of Congress (loc.gov) — real historic photos/documents whose
    catalog description mentions this exact street/neighborhood. No API
    key needed, confirmed live (a real 1987 "Lombard Street, San
    Francisco" photo came back for that exact query).
    """
    query = " ".join(p for p in (street, neighborhood, city) if p).strip()
    if not query:
        return []

    try:
        r = await client.get(
            "https://www.loc.gov/photos/",
            params={"q": query, "fo": "json", "c": "6"},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        results = []
        for item in r.json().get("results", [])[:6]:
            title = item.get("title", "")
            if not title:
                continue
            results.append({"title": title, "date": item.get("date", "")})
        return results

    except Exception as e:
        logger.warning(f"Library of Congress failed: {e}")
        return []


async def fetch_nyt_articles(street: str, neighborhood: str, city: str, client: httpx.AsyncClient) -> list:
    """
    NYT Article Search — real news coverage whose headline/body mentions
    this street/neighborhood. Optional, free key from developer.nytimes.com.
    """
    api_key = getattr(settings, "NYT_API_KEY", None)
    query = " ".join(p for p in (street, neighborhood, city) if p).strip()
    if not api_key or not query:
        return []

    try:
        r = await client.get(
            "https://api.nytimes.com/svc/search/v2/articlesearch.json",
            params={"q": query, "api-key": api_key},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        results = []
        for doc in r.json().get("response", {}).get("docs", [])[:5]:
            headline = (doc.get("headline") or {}).get("main", "")
            if not headline:
                continue
            results.append({
                "headline": headline,
                "date": (doc.get("pub_date") or "")[:10],
            })
        return results

    except Exception as e:
        logger.warning(f"NYT Article Search failed: {e}")
        return []


async def fetch_us_census(lat: float, lng: float, country: str, client: httpx.AsyncClient) -> list:
    """
    US Census Bureau ACS 5-year estimates — a real demographic snapshot
    (population, median household income, median age) for this exact
    location's county. Two real HTTP calls: the coordinates-to-county
    geocoder (confirmed live, no key needed) feeds the actual ACS data
    query (confirmed live too, but needs a free key -- api.census.gov
    started requiring one for this endpoint; skipped if unset, same
    pattern as every other optional-key source here). Gated on country,
    same self-gating pattern as the UK-only sources -- US Census data
    genuinely doesn't exist for anywhere else.
    """
    if not country or "united states" not in country.lower():
        return []

    api_key = getattr(settings, "CENSUS_API_KEY", None)
    if not api_key:
        return []

    try:
        geo_r = await client.get(
            "https://geocoding.geo.census.gov/geocoder/geographies/coordinates",
            params={
                "x": lng, "y": lat,
                "benchmark": "Public_AR_Current",
                "vintage": "Current_Current",
                "format": "json",
            },
            timeout=TIMEOUT,
        )
        if geo_r.status_code != 200:
            return []

        counties = geo_r.json().get("result", {}).get("geographies", {}).get("Counties", [])
        if not counties:
            return []
        state_fips = counties[0].get("STATE")
        county_fips = counties[0].get("COUNTY")
        if not state_fips or not county_fips:
            return []

        acs_r = await client.get(
            "https://api.census.gov/data/2022/acs/acs5",
            params={
                "get": "NAME,B01003_001E,B19013_001E,B01002_001E",
                "for": f"county:{county_fips}",
                "in": f"state:{state_fips}",
                "key": api_key,
            },
            timeout=TIMEOUT,
        )
        if acs_r.status_code != 200:
            return []

        rows = acs_r.json()
        if len(rows) < 2:
            return []
        record = dict(zip(rows[0], rows[1]))
        return [{
            "county": record.get("NAME", counties[0].get("NAME", "")),
            "population": record.get("B01003_001E"),
            "median_income": record.get("B19013_001E"),
            "median_age": record.get("B01002_001E"),
        }]

    except Exception as e:
        logger.warning(f"US Census lookup failed: {e}")
        return []


async def fetch_open_library_books(city: str, client: httpx.AsyncClient) -> list:
    """
    Open Library (archive.org) — real books set in or about this place.
    No API key, global coverage (works for any place name in their
    catalog, not just literary capitals — verified against Paris).

    City-level only, same granularity as fetch_tmdb_films/
    fetch_musicbrainz_artists above.
    """
    if not city:
        return []

    try:
        r = await client.get(
            "https://openlibrary.org/search.json",
            params={
                "q": f'place:"{city}"',
                "limit": "6",
                "fields": "title,author_name,first_publish_year",
            },
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        results = []
        for d in r.json().get("docs", []):
            title = d.get("title", "")
            if not title:
                continue
            authors = d.get("author_name") or []
            results.append({
                "title": title,
                "author": authors[0] if authors else "",
                "year": d.get("first_publish_year", ""),
            })
        return results

    except Exception as e:
        logger.warning(f"Open Library lookup failed: {e}")
        return []