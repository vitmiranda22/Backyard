"""
Zone data fetcher — orchestrates all data sources in parallel.

For any geographic zone, we:
1. Fire off 15 DataSF queries (only when the geocoded city is San
   Francisco — see `is_san_francisco`/`DATASF_SOURCE_NAMES`, skipped
   entirely with zero network calls everywhere else) + 12 always-on
   global queries + 1 UK-gated query + N other-city queries (no-op
   instantly unless the geocoded city matches the registry in
   city_data.py, which now spans multiple platforms — Socrata and
   OpenDataSoft; GeoNames/Europeana no-op instantly unless their
   optional API keys are set)
2. Wait for all of them (with timeouts — if one fails, others continue)
3. Bundle everything into a single JSON blob
4. Store it in zone_data_cache (reused across all moods for 30 days)

The zone data is mood-agnostic — the AI curates different pieces for
different moods from the same underlying data.
"""

import logging
import asyncio
import httpx

from app.config import settings
from app.services import datasf, global_sources, city_data

logger = logging.getLogger(__name__)


# DataSF's 15 fetchers hit data.sfgov.org directly with no location check
# of their own — unlike city_data.py's NYC/Chicago sources, which gate on
# a city-name match before making any network call. Gating here, once,
# before the task dict is even built, means a non-SF location makes zero
# of these 15 HTTP calls instead of 15 calls that always come back empty.
DATASF_SOURCE_NAMES = [
    "film_locations", "landmarks", "cultural_districts", "building_permits",
    "businesses", "police_incidents", "street_trees", "public_art",
    "complaints_311", "evictions", "parks", "fire_incidents", "civic_art",
    "addresses", "neighborhoods",
]


def is_san_francisco(city: str) -> bool:
    return bool(city) and "san francisco" in city.lower()


async def fetch_all_zone_data(
    lat: float,
    lng: float,
    street_name: str,
    neighborhood: str,
    city: str,
    country: str = "",
) -> dict:
    """
    Query all data sources in parallel for a geographic zone.

    Returns a dict with all results bundled together, plus metadata
    about which sources succeeded, failed, or were skipped as
    regionally irrelevant (e.g. DataSF outside San Francisco).
    """
    sources_queried = []
    sources_failed = []
    sources_skipped = []

    is_sf = is_san_francisco(city)
    if not is_sf:
        sources_skipped.extend(DATASF_SOURCE_NAMES)

    async with httpx.AsyncClient() as client:
        # Define all tasks — each returns (name, result)
        tasks = {}

        if is_sf:
            # --- DataSF (15 sources, SF only) ---
            tasks.update({
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
            })

        tasks.update({
            # --- Global sources (11 sources, any city, zero gating) ---
            "wikipedia": global_sources.fetch_wikipedia(lat, lng, client),
            "wikimedia_photos": global_sources.fetch_wikimedia_commons(lat, lng, client),
            "osm_buildings": global_sources.fetch_osm_buildings(lat, lng, client),
            "knowledge_graph": global_sources.fetch_knowledge_graph(street_name, neighborhood, client),
            "wikidata": global_sources.fetch_wikidata(lat, lng, client),
            "tmdb_films": global_sources.fetch_tmdb_films(city, client),
            "unesco_heritage": global_sources.fetch_unesco_heritage(lat, lng, client),
            "geonames": global_sources.fetch_geonames(lat, lng, client),
            "europeana": global_sources.fetch_europeana(lat, lng, client),
            "wikivoyage": global_sources.fetch_wikivoyage(lat, lng, client),
            "gbif": global_sources.fetch_gbif_occurrences(lat, lng, client),
            "earthquake_history": global_sources.fetch_earthquake_history(lat, lng, client),
            "uk_police": global_sources.fetch_uk_police_data(lat, lng, country, client),
            "uk_planning": global_sources.fetch_uk_planning_data(lat, lng, country, client),
        })

        # --- Other-city Socrata (gated on city match — NYC/Chicago/LA/
        # Seattle/Austin today). One task per category in CITY_CATEGORIES;
        # fetch_city_category() itself returns [] with zero network call
        # for any (city, category) pair that was never verified/added to
        # city_data.CITY_DATASETS, so partial per-city coverage is free —
        # adding a new category to the list is the only step needed to
        # roll it out everywhere it's been verified.
        for category in city_data.CITY_CATEGORIES:
            tasks[f"city_{category}"] = city_data.fetch_city_category(lat, lng, city, category, client)

        # Run all in parallel
        names = list(tasks.keys())
        results = await asyncio.gather(
            *tasks.values(),
            return_exceptions=True,
        )

        # Bundle results
        zone_data = {name: [] for name in sources_skipped}
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
        f"{len(sources_failed)} failed, {len(sources_skipped)} skipped (regional)"
    )

    return {
        "zone_data": zone_data,
        "sources_queried": sources_queried,
        "sources_failed": sources_failed,
        "sources_skipped": sources_skipped,
        # Data-richness signal — how much of the pipeline actually returned
        # something for this exact zone. Previously computed for the log
        # line above and then discarded; now returned so callers can
        # persist it (see supabase_db.store_zone_data /
        # narrate.py's cache-miss path) and, eventually, flag thin zones
        # on the map. See is_low_info() below for how this gets judged.
        "hit_count": hit_count,
        "total": total,
    }


def is_low_info(hit_count: int, eligible_count: int) -> bool:
    """
    Whether a zone's data turned out thin enough to flag on the map —
    deliberately named "zone signal" rather than reusing richness.py's
    "richness tier" language, since that's a different, unrelated concept
    (a static per-CITY classification for setting expectations before a
    tour starts, not a per-ZONE measurement of what actually came back).

    eligible_count should already exclude regionally-skipped sources
    (total minus len(sources_skipped)) — a zone outside the deep-data
    tier shouldn't be penalized for sources that were never applicable.

    settings.LOW_INFO_RATIO_THRESHOLD is a documented starting guess, not
    derived from real data — nothing has ever persisted this signal
    before, so there's no distribution yet to derive a threshold from.
    Revisit once enough zones have sources_hit_count on file to look at
    an actual spread, rather than a live aggregate query at request time
    (richness.py deliberately avoids exactly that, for the same reasons
    that would apply here).
    """
    if eligible_count <= 0:
        return False
    return (hit_count / eligible_count) < settings.LOW_INFO_RATIO_THRESHOLD


def format_zone_data_for_prompt(zone_data: dict) -> str:
    """
    Convert the raw zone data dict into a readable string for the narration prompt.

    We don't dump raw JSON — we format it so the model can actually read it.
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
        "osm_buildings": ("🏠 BUILDING & STREET-LEVEL DETAIL (OpenStreetMap)", _format_osm),
        "knowledge_graph": ("🔍 KNOWLEDGE GRAPH ENTITIES", _format_kg),
        "wikidata": ("🗂️ WIKIDATA FACTS (places, people, film locations)", _format_wikidata),
        "tmdb_films": ("🎬 FILMS/TV ASSOCIATED WITH THIS CITY", _format_tmdb),
        "unesco_heritage": ("🏛️ UNESCO WORLD HERITAGE", _format_unesco),
        "geonames": ("📌 NEARBY NAMED PLACES (GeoNames)", _format_geonames),
        "europeana": ("🏺 EUROPEAN CULTURAL HERITAGE (Europeana)", _format_europeana),
        "wikivoyage": ("🧭 TRAVEL-GUIDE NOTES NEARBY (Wikivoyage)", _format_wikivoyage),
        "gbif": ("🦋 WILDLIFE RECORDED NEARBY (GBIF)", _format_gbif),
        "earthquake_history": ("🌎 NOTABLE EARTHQUAKES IN THIS REGION (USGS)", _format_earthquakes),
        "city_311": ("📞 311 COMPLAINTS", _format_city_311),
        "city_building_permits": ("🏗️ BUILDING PERMITS", _format_city_permits),
        "city_police_incidents": ("🚔 POLICE INCIDENTS", _format_generic),
        "city_fire_incidents": ("🔥 FIRE INCIDENTS", _format_generic),
        "city_street_trees": ("🌳 STREET TREES", _format_generic),
        "uk_police": ("🚔 POLICE INCIDENTS (UK-wide)", _format_uk_police),
        "uk_planning": ("🏛️ PLANNING & HERITAGE DATA (UK-wide)", _format_uk_planning),
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
    for b in data[:8]:
        name = b.get("name", "")
        building_type = b.get("building", "")
        architect = b.get("architect", "")
        start = b.get("start_date", "")
        old_name = b.get("old_name", "")
        historic = b.get("historic", "")
        memorial = b.get("memorial", "")
        artwork_type = b.get("artwork_type", "")
        disused_shop = b.get("disused_shop", "")
        amenity = b.get("amenity", "")
        landuse = b.get("landuse", "")
        leisure = b.get("leisure", "")
        natural = b.get("natural", "")
        species = b.get("species", "")
        genus = b.get("genus", "")
        leaf_type = b.get("leaf_type", "")
        parts = []
        if natural == "tree":
            tree_desc = species or genus or (f"{leaf_type} tree" if leaf_type else "a mapped tree")
            parts.append(f"tree: {tree_desc}")
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
        if memorial:
            parts.append(f"memorial: {memorial}")
        if artwork_type:
            parts.append(f"artwork: {artwork_type}")
        if disused_shop:
            parts.append(f"ghost sign — formerly a {disused_shop} shop")
        if amenity == "grave_yard" or landuse == "cemetery":
            parts.append("cemetery/graveyard nearby")
        if leisure in ("park", "garden"):
            parts.append(f"{leisure} nearby")
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


def _format_wikidata(data: list) -> str:
    lines = []
    for item in data[:12]:
        name = item.get("name", "")
        if not name:
            continue
        kind = item.get("kind", "place")
        if kind == "person":
            relation = item.get("relation", "connected to this place")
            place = item.get("place", "")
            line = f"- {name} — {relation}"
            if place:
                line += f" ({place})"
        elif kind == "film":
            place = item.get("place", "")
            line = f"- \"{name}\" — filmed at {place}" if place else f"- \"{name}\" — filmed nearby"
        else:
            details = []
            if item.get("type"):
                details.append(f"type: {item['type']}")
            if item.get("inception"):
                details.append(f"built: {item['inception']}")
            if item.get("architect"):
                details.append(f"architect: {item['architect']}")
            line = f"- {name}"
            if details:
                line += f" ({', '.join(details)})"
        lines.append(line)
    return "\n".join(lines)


def _format_tmdb(data: list) -> str:
    lines = []
    for m in data[:5]:
        title = m.get("title", "")
        year = m.get("release_year", "")
        overview = m.get("overview", "")
        line = f"- \"{title}\" ({year})" if year else f"- \"{title}\""
        if overview:
            line += f" — {overview}"
        lines.append(line)
    return "\n".join(lines)


def _format_unesco(data: list) -> str:
    lines = []
    for site in data[:3]:
        name = site.get("name", "")
        inscribed = site.get("inscribed", "")
        justification = site.get("justification", "")
        line = f"- \"{name}\""
        if inscribed:
            line += f" (inscribed {inscribed})"
        if justification:
            line += f" — {justification}"
        lines.append(line)
    return "\n".join(lines)


def _format_geonames(data: list) -> str:
    lines = []
    for g in data[:8]:
        name = g.get("name", "")
        feature = g.get("feature_type", "") or g.get("feature_class", "")
        line = f"- {name}"
        if feature:
            line += f" ({feature})"
        lines.append(line)
    return "\n".join(lines)


def _format_europeana(data: list) -> str:
    lines = []
    for item in data[:6]:
        title = item.get("title", "")
        provider = item.get("provider", "")
        year = item.get("year", "")
        line = f"- \"{title}\""
        details = [d for d in (year, provider) if d]
        if details:
            line += f" ({', '.join(details)})"
        lines.append(line)
    return "\n".join(lines)


def _format_wikivoyage(data: list) -> str:
    lines = []
    for a in data[:3]:
        title = a.get("title", "")
        extract = a.get("extract", "")
        dist = a.get("dist_m", 0)
        line = f"- \"{title}\" ({dist}m away): {extract[:200]}"
        lines.append(line)
    return "\n".join(lines)


def _format_gbif(data: list) -> str:
    lines = []
    for obs in data[:5]:
        species = obs.get("species", "")
        taxon_class = obs.get("taxon_class", "")
        line = f"- {species}"
        if taxon_class:
            line += f" ({taxon_class})"
        lines.append(line)
    return "\n".join(lines)


def _format_earthquakes(data: list) -> str:
    lines = []
    for eq in data[:5]:
        place = eq.get("place", "")
        mag = eq.get("mag")
        year = eq.get("year")
        line = f"- M{mag} — {place}" if mag is not None else f"- {place}"
        if year:
            line += f" ({year})"
        lines.append(line)
    return "\n".join(lines)


def _format_uk_police(data: list) -> str:
    lines = []
    for c in data[:8]:
        category = c.get("category", "")
        street = c.get("street", "")
        line = f"- {category}"
        if street:
            line += f" (near {street})"
        lines.append(line)
    return "\n".join(lines)


def _format_uk_planning(data: list) -> str:
    lines = []
    for entity in data[:8]:
        name = entity.get("name", "")
        category = entity.get("planning_category", "")
        line = f"- \"{name}\""
        if category:
            line += f" ({category})"
        lines.append(line)
    return "\n".join(lines)


def _format_city_311(data: list) -> str:
    lines = []
    for c in data[:8]:
        category = c.get("complaint_type") or c.get("sr_type") or ""
        desc = c.get("descriptor") or c.get("sr_short_code") or ""
        date = (c.get("created_date") or "")[:10]
        line = f"- [{date}] {category}" if date else f"- {category}"
        if desc:
            line += f": {desc}"
        lines.append(line)
    return "\n".join(lines)


def _format_city_permits(data: list) -> str:
    lines = []
    for p in data[:8]:
        permit_type = p.get("job_type") or p.get("permit_type") or ""
        desc = p.get("work_description") or ""
        date = (p.get("issue_date") or p.get("application_start_date") or "")[:10]
        street = p.get("street_name") or ""
        line = f"- [{date}] {permit_type}" if date else f"- {permit_type}"
        if street:
            line += f" at {street}"
        if desc:
            line += f" — {desc}"
        lines.append(line)
    return "\n".join(lines)


def _format_generic(data: list) -> str:
    """
    Fallback formatter — dumps key fields from each record. Also the
    formatter for every city_data.py category beyond 311/permits (police,
    fire, trees): field names vary meaningfully city to city, so rather
    than hand-write a bespoke formatter per city per category, this key
    list is kept broad enough to catch the useful field under whatever
    name each city happens to use for it.
    """
    lines = []
    for item in data[:8]:
        if isinstance(item, dict):
            # Pick the most interesting-looking fields
            parts = []
            for key in ["name", "title", "description", "category", "type",
                         "address", "location_description", "dba_name",
                         "landmark_name", "art_title",
                         # city police/crime datasets (NYC, Chicago, LA, Seattle)
                         "primary_type", "crm_cd_desc", "ofns_desc",
                         "offense_sub_category", "nibrs_offense_code_description",
                         "block", "block_address",
                         # city fire datasets (Austin)
                         "issue_reported",
                         # city tree datasets (Austin)
                         "species",
                         # Paris (OpenDataSoft, French field names)
                         "espece", "libellefrancais", "objet", "adresse",
                         "type_dossier",
                         # Vancouver (OpenDataSoft) — "species" above already
                         # covers Brussels' matching field name
                         "common_name", "genus_name",
                         # Brussels (OpenDataSoft, French field name)
                         "address_fr",
                         # 18-city OpenDataSoft batch — tree species/name
                         # fields across France/Belgium/Sweden
                         "nom_vernaculaire", "nom_latin", "lib_espece",
                         "lib_genre", "straatnaam", "sortiment",
                         "tree_species", "genespvar", "vernaculaire",
                         "adresse_du_terrain", "nature_de_l_acte"]:
                val = item.get(key, "")
                if val and str(val).strip():
                    parts.append(f"{key}: {str(val)[:100]}")
            if parts:
                lines.append(f"- {', '.join(parts[:3])}")
    return "\n".join(lines)
