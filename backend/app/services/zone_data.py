"""
Zone data fetcher — orchestrates ALL 19 data sources in parallel.

This is the core of Week 3. For any geographic zone, we:
1. Fire off 15 DataSF queries + 4 global queries simultaneously
2. Wait for all of them (with timeouts — if one fails, others continue)
3. Bundle everything into a single JSON blob
4. Store it in zone_data_cache (reused across all moods for 30 days)

The zone data is mood-agnostic — the AI curates different pieces for
different moods from the same underlying data.
"""

import logging
import json
import asyncio
import httpx

from app.services import datasf, global_sources

logger = logging.getLogger(__name__)


async def fetch_all_zone_data(
    lat: float,
    lng: float,
    street_name: str,
    neighborhood: str,
    city: str,
) -> dict:
    """
    Query all 19 data sources in parallel for a geographic zone.

    Returns a dict with all results bundled together, plus metadata
    about which sources succeeded and which failed.
    """
    sources_queried = []
    sources_failed = []

    async with httpx.AsyncClient() as client:
        # Define all tasks — each returns (name, result)
        tasks = {
            # --- DataSF (15 sources, SF only) ---
            "film_locations": datasf.fetch_film_locations(lat, lng, client),
            "landmarks": datasf.fetch_landmarks(lat, lng, client),
            "cultural_districts": datasf.fetch_cultural_districts(lat, lng, client),
            "building_permits": datasf.fetch_building_permits(lat, lng, client),
            "businesses": datasf.fetch_businesses(lat, lng, client),
            "police_incidents": datasf.fetch_police_incidents(lat, lng, client),
            "street_trees": datasf.fetch_street_trees(lat, lng, client),
            "public_art": datasf.fetch_public_art(lat, lng, client),
            "complaints_311": datasf.fetch_311_complaints(lat, lng, client),
            "evictions": datasf.fetch_evictions(lat, lng, client),
            "parks": datasf.fetch_parks(lat, lng, client),
            "fire_incidents": datasf.fetch_fire_incidents(lat, lng, client),
            "civic_art": datasf.fetch_civic_art(lat, lng, client),
            "addresses": datasf.fetch_addresses(lat, lng, client),
            "neighborhoods": datasf.fetch_neighborhoods(lat, lng, client),
            # --- Global sources (4 sources, any city) ---
            "wikipedia": global_sources.fetch_wikipedia(lat, lng, client),
            "wikimedia_photos": global_sources.fetch_wikimedia_commons(lat, lng, client),
            "osm_buildings": global_sources.fetch_osm_buildings(lat, lng, client),
            "knowledge_graph": global_sources.fetch_knowledge_graph(street_name, neighborhood, client),
        }

        # Run all in parallel
        names = list(tasks.keys())
        results = await asyncio.gather(
            *tasks.values(),
            return_exceptions=True,
        )

        # Bundle results
        zone_data = {}
        for name, result in zip(names, results):
            if isinstance(result, Exception):
                logger.warning(f"Source '{name}' failed: {result}")
                sources_failed.append(name)
                zone_data[name] = []
            elif isinstance(result, list) and len(result) > 0:
                sources_queried.append(name)
                zone_data[name] = result
            else:
                sources_queried.append(name)
                zone_data[name] = []

    # Log summary
    hit_count = sum(1 for v in zone_data.values() if v)
    total = len(zone_data)
    logger.info(
        f"Zone data for ({lat:.4f}, {lng:.4f}): "
        f"{hit_count}/{total} sources returned data, "
        f"{len(sources_failed)} failed"
    )

    return {
        "zone_data": zone_data,
        "sources_queried": sources_queried,
        "sources_failed": sources_failed,
    }


def format_zone_data_for_prompt(zone_data: dict) -> str:
    """
    Convert the raw zone data dict into a readable string for the Gemini prompt.

    We don't dump raw JSON — we format it so Gemini can actually read it.
    Empty sources are skipped entirely.
    """
    sections = []

    formatters = {
        "film_locations": ("🎬 FILMS SHOT NEARBY", _format_films),
        "landmarks": ("🏛️ HISTORIC LANDMARKS", _format_generic),
        "cultural_districts": ("🎭 CULTURAL DISTRICTS", _format_generic),
        "building_permits": ("🏗️ BUILDING PERMITS", _format_generic),
        "businesses": ("🏪 BUSINESSES (PAST & PRESENT)", _format_generic),
        "police_incidents": ("🚔 POLICE INCIDENTS", _format_generic),
        "street_trees": ("🌳 STREET TREES", _format_trees),
        "public_art": ("🎨 PUBLIC ART", _format_generic),
        "complaints_311": ("📞 311 COMPLAINTS", _format_311),
        "evictions": ("🏠 EVICTION NOTICES", _format_generic),
        "parks": ("🌿 PARKS & GREEN SPACES", _format_generic),
        "fire_incidents": ("🔥 FIRE INCIDENTS", _format_generic),
        "civic_art": ("🗿 CIVIC ART & LANDSCAPE", _format_generic),
        "addresses": ("📍 ACTIVE ADDRESSES", _format_generic),
        "neighborhoods": ("📌 NEIGHBORHOOD INFO", _format_generic),
        "wikipedia": ("📚 WIKIPEDIA ARTICLES NEARBY", _format_wikipedia),
        "wikimedia_photos": ("📷 HISTORICAL PHOTOS NEARBY", _format_generic),
        "osm_buildings": ("🏠 BUILDING DATA (OpenStreetMap)", _format_osm),
        "knowledge_graph": ("🔍 KNOWLEDGE GRAPH ENTITIES", _format_kg),
    }

    for key, (header, formatter) in formatters.items():
        data = zone_data.get(key, [])
        if data:
            formatted = formatter(data)
            if formatted:
                sections.append(f"{header}\n{formatted}")

    if not sections:
        return "No specific data found for this location from public databases."

    return "\n\n".join(sections)


# =============================================================================
# Formatters — turn raw API responses into readable text
# =============================================================================

def _format_films(data: list) -> str:
    lines = []
    for f in data[:8]:
        title = f.get("title", "Unknown")
        year = f.get("release_year", "")
        location = f.get("locations", "")
        fact = f.get("fun_facts", "")
        line = f"- \"{title}\" ({year}) — filmed at: {location}"
        if fact:
            line += f" — Fun fact: {fact}"
        lines.append(line)
    return "\n".join(lines)


def _format_trees(data: list) -> str:
    lines = []
    for t in data[:5]:
        species = t.get("qSpecies", t.get("species", "Unknown species"))
        address = t.get("qAddress", t.get("address", ""))
        date = t.get("PlantDate", t.get("plant_date", ""))
        line = f"- {species} at {address}"
        if date:
            line += f" (planted {date})"
        lines.append(line)
    return "\n".join(lines)


def _format_311(data: list) -> str:
    lines = []
    for c in data[:8]:
        category = c.get("category", c.get("service_name", ""))
        desc = c.get("descriptor", c.get("service_details", ""))
        date = c.get("opened", c.get("requested_datetime", ""))[:10] if c.get("opened") or c.get("requested_datetime") else ""
        line = f"- [{date}] {category}: {desc}"
        lines.append(line)
    return "\n".join(lines)


def _format_wikipedia(data: list) -> str:
    lines = []
    for a in data[:5]:
        title = a.get("title", "")
        extract = a.get("extract", "")
        dist = a.get("dist_m", 0)
        line = f"- \"{title}\" ({dist}m away): {extract[:200]}"
        lines.append(line)
    return "\n".join(lines)


def _format_osm(data: list) -> str:
    lines = []
    for b in data[:5]:
        name = b.get("name", "")
        building_type = b.get("building", "")
        architect = b.get("architect", "")
        start = b.get("start_date", "")
        old_name = b.get("old_name", "")
        historic = b.get("historic", "")
        parts = []
        if name:
            parts.append(name)
        if building_type and building_type != "yes":
            parts.append(f"type: {building_type}")
        if architect:
            parts.append(f"architect: {architect}")
        if start:
            parts.append(f"built: {start}")
        if old_name:
            parts.append(f"formerly: {old_name}")
        if historic:
            parts.append(f"historic: {historic}")
        if parts:
            lines.append(f"- {', '.join(parts)}")
    return "\n".join(lines)


def _format_kg(data: list) -> str:
    lines = []
    for e in data[:3]:
        name = e.get("name", "")
        desc = e.get("description", "")
        detail = e.get("detail", "")
        line = f"- {name}: {desc}"
        if detail:
            line += f" — {detail[:200]}"
        lines.append(line)
    return "\n".join(lines)


def _format_generic(data: list) -> str:
    """Fallback formatter — dumps key fields from each record."""
    lines = []
    for item in data[:8]:
        if isinstance(item, dict):
            # Pick the most interesting-looking fields
            parts = []
            for key in ["name", "title", "description", "category", "type",
                         "address", "location_description", "dba_name",
                         "landmark_name", "art_title"]:
                val = item.get(key, "")
                if val and str(val).strip():
                    parts.append(f"{key}: {str(val)[:100]}")
            if parts:
                lines.append(f"- {', '.join(parts[:3])}")
    return "\n".join(lines)
