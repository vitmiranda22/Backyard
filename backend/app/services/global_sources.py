"""
Global data sources — work at ANY coordinate on Earth, not a city list.
Deliberately verified this session against a Wikipedia-thin rural-Peru
coordinate as well as well-documented cities, since the whole point of
this layer is raising the floor in undocumented places, not just adding
convenience in already-rich ones.

12 sources:
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

All free. Wikipedia/Wikivoyage/Wikimedia/OSM/Wikidata/UNESCO/GBIF/USGS
need no API key. Knowledge Graph reuses your Google Cloud TTS key. TMDb,
GeoNames, and Europeana each need their own free key/username (optional —
each source is skipped entirely if its credential is unset).

Plus one country-gated source, `fetch_uk_police_data` — not global, but
not city-specific either: it's a single API covering all of the UK at
once, so it lives here rather than in city_data.py's per-city registry.
Gates itself internally (returns [] with no network call outside the UK)
rather than needing zone_data.py's task-dict-level gating.
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
    Returns article titles and short extracts.
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
    old signage), cemeteries, parks/gardens, and individually-mapped trees.
    Works anywhere OSM has coverage — no per-city configuration, unlike
    DataSF/city_data.py. The tree tag in particular gives real, current
    tree data anywhere OSM contributors have mapped it, not just the
    handful of cities with a municipal tree-inventory dataset (SF,
    Austin, Paris today).
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
    );
    out body 15;
    """

    for i, endpoint in enumerate(OVERPASS_ENDPOINTS):
        try:
            r = await client.post(endpoint, data={"data": query}, timeout=TIMEOUT + 3)
            if r.status_code != 200:
                logger.warning(f"Overpass endpoint {endpoint} returned {r.status_code}")
                continue

            elements = r.json().get("elements", [])
            results = []
            for el in elements[:15]:
                tags = el.get("tags", {})
                if tags:
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
                        "landuse": tags.get("landuse", ""),
                        "leisure": tags.get("leisure", ""),
                        "description": tags.get("description", ""),
                        "old_name": tags.get("old_name", ""),
                        "natural": tags.get("natural", ""),
                        "species": tags.get("species") or tags.get("species:en", ""),
                        "genus": tags.get("genus", ""),
                        "leaf_type": tags.get("leaf_type", ""),
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
                year = datetime.datetime.utcfromtimestamp(time_ms / 1000).year
            results.append({"place": place, "mag": mag, "year": year})
        return results

    except Exception as e:
        logger.warning(f"USGS earthquake lookup failed: {e}")
        return []