"""
Global data sources — work in ANY city worldwide.

4 sources:
- Wikipedia Geosearch: articles about places within 200m
- Wikimedia Commons: historical photos near coordinates
- OpenStreetMap Overpass: building metadata (age, style, names)
- Google Knowledge Graph: entity enrichment

All free. Wikipedia/Wikimedia/OSM need no API key.
Knowledge Graph uses your Google Cloud API key.
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


async def fetch_osm_buildings(lat: float, lng: float, client: httpx.AsyncClient) -> list:
    """
    OpenStreetMap Overpass API — get building metadata nearby.
    Returns building names, ages, styles, historical info.
    """
    query = f"""
    [out:json][timeout:5];
    (
      way(around:{RADIUS_METERS},{lat},{lng})["building"];
      node(around:{RADIUS_METERS},{lat},{lng})["historic"];
      node(around:{RADIUS_METERS},{lat},{lng})["tourism"];
    );
    out body 10;
    """
    try:
        r = await client.post(
            "https://overpass-api.de/api/interpreter",
            data={"data": query},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []

        elements = r.json().get("elements", [])
        results = []
        for el in elements[:10]:
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
                    "description": tags.get("description", ""),
                    "old_name": tags.get("old_name", ""),
                })
        return results

    except Exception as e:
        logger.warning(f"OSM Overpass failed: {e}")
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