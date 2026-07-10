"""
Global data sources — work in ANY city worldwide.

6 sources:
- Wikipedia Geosearch: articles about places within 200m
- Wikimedia Commons: historical photos near coordinates
- OpenStreetMap Overpass: building + memorial + mural + ghost-sign +
  park/garden metadata
- Google Knowledge Graph: entity enrichment
- Wikidata SPARQL: structured facts (architect, construction date, type),
  notable people (born/died/lived here), and film locations for entities
  near this coordinate
- TMDb: films/TV associated with the city (city-level only — TMDb's public
  API has no per-address filming-location endpoint, so it can't pinpoint
  exact street locations the way the SF-specific film dataset does)

All free. Wikipedia/Wikimedia/OSM/Wikidata need no API key.
Knowledge Graph reuses your Google Cloud TTS key. TMDb needs its own free
API key (optional — the source is skipped entirely if unset).
"""

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
    old signage), cemeteries, and parks/gardens. Works anywhere OSM has
    coverage — no per-city configuration, unlike DataSF/city_data.py.
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