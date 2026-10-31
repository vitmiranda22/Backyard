"""
Pre-fetch block facts (the ~34 data sources) into zone_data_cache for an
area, so a walker's first narration there skips the slow source fetch and
GPT writes from the same facts it would have fetched live. Generates no
narration and calls no LLM, unless --stories is passed.

--stories also writes every missing narration variant for each block into
narration_cache (kept forever), the same way a live walker's miss would:
same prompt, same model, same Wikipedia highlights. Only the combos walkers
actually hit are filled: content_safety off, free moods at free length,
all moods at premium length. Audio is left to the first real listen.

Usage (from backend/):
    python scripts/prefill_zone_data.py --lat 37.7955 --lng -122.3937 --radius-m 500 --dry-run
    python scripts/prefill_zone_data.py --lat 37.7955 --lng -122.3937 --radius-m 500
    python scripts/prefill_zone_data.py --lat 37.7955 --lng -122.3937 --radius-m 500 --stories

Safe to re-run: blocks already cached are skipped. Cache rows expire after
30 days (store_zone_data), so re-run monthly to keep an area warm. Runs one
block at a time on purpose -- every block reverse-geocodes through Nominatim,
whose usage policy caps bulk use at 1 request/second.
"""

import argparse
import asyncio
import math
import sys

sys.path.insert(0, ".")

import geohash2

from app.api.narrate import _cache_mood_key
from app.config import PREMIUM_MOODS
from app.models.schemas import Mood
from app.services import geocode, openai_service, supabase_db
from app.services.zone_data import (
    fetch_all_zone_data, find_wikipedia_highlights, format_zone_data_for_prompt, should_skip_web_search,
)

GEOHASH_PRECISION = 7  # must match app/api/narrate.py
SAMPLE_STEP_M = 100  # finer than a ~153m cell, so no cell inside the radius is missed
METERS_PER_DEGREE_LAT = 111_320


def blocks_in_radius(lat: float, lng: float, radius_m: float) -> list[str]:
    """Every geohash-7 cell whose sampled points fall within radius_m of (lat, lng)."""
    steps = int(radius_m // SAMPLE_STEP_M)
    cells = set()
    for i in range(-steps, steps + 1):
        for j in range(-steps, steps + 1):
            dy, dx = i * SAMPLE_STEP_M, j * SAMPLE_STEP_M
            if dx * dx + dy * dy > radius_m * radius_m:
                continue
            p_lat = lat + dy / METERS_PER_DEGREE_LAT
            p_lng = lng + dx / (METERS_PER_DEGREE_LAT * math.cos(math.radians(lat)))
            cells.add(geohash2.encode(p_lat, p_lng, precision=GEOHASH_PRECISION))
    return sorted(cells)


async def prefill_block(geo_hash: str) -> str:
    if await supabase_db.get_cached_zone_data(geo_hash):
        return "already cached"

    lat, lng, _, _ = geohash2.decode_exactly(geo_hash)  # cell center
    place = await geocode.reverse_geocode(lat, lng)
    if not place:
        return "skipped (reverse geocode failed; the live request will fetch it)"

    result = await fetch_all_zone_data(
        lat=lat, lng=lng, street_name=place.street, neighborhood=place.neighborhood,
        city=place.city, country=place.country,
    )
    # Same row narrate.py writes on a live cache miss.
    await supabase_db.store_zone_data(
        geo_hash=geo_hash,
        street_name=place.street,
        neighborhood=place.neighborhood,
        city=place.city,
        country=place.country,
        raw_data=result["zone_data"],
        sources_queried=result["sources_queried"],
        sources_failed=result["sources_failed"],
        sources_hit_count=result["hit_count"],
        sources_eligible_count=result["total"] - len(result["sources_skipped"]),
        sources_skipped=result["sources_skipped"],
    )
    return f"cached {result['hit_count']} sources with data ({place.street}, {place.neighborhood})"


# (mood, is_premium) pairs walkers can actually request.
STORY_COMBOS = [(m.value, False) for m in Mood if m.value not in PREMIUM_MOODS] + [(m.value, True) for m in Mood]


async def _fill_combo(zone: dict, geo_hash: str, mood: str, is_premium: bool) -> int:
    cache_mood = _cache_mood_key(mood, is_premium)
    _, count = await supabase_db.get_cached_narration(geo_hash, cache_mood, False)
    raw = zone.get("raw_data") or {}
    written = 0
    for variant_index in range(count, supabase_db.MAX_NARRATION_VARIANTS):
        text = await openai_service.generate_narration(
            street=zone.get("street_name") or "", neighborhood=zone.get("neighborhood") or "",
            city=zone.get("city") or "", country=zone.get("country") or "",
            mood=mood, content_safety=False,
            zone_data=format_zone_data_for_prompt(raw, mode=mood),
            skip_web_search=should_skip_web_search(zone.get("sources_hit_count"), zone.get("sources_eligible_count")),
            is_premium=is_premium,
        )
        if not text:
            break  # try again on the next run rather than leave a gap in variant_index
        await supabase_db.store_narration(
            geo_hash=geo_hash, mood=cache_mood, content_safety=False, narration_text=text,
            variant_index=variant_index,
            highlights=find_wikipedia_highlights(text, raw) if is_premium else None,
        )
        written += 1
    return written


async def fill_stories(geo_hash: str) -> str:
    zone = await supabase_db.get_cached_zone_data(geo_hash)
    if not zone:
        return "no stories (no block data)"
    # Combos run in parallel (different cache rows); variants within a combo
    # run in order so each lands in the next free variant slot.
    written = await asyncio.gather(*(_fill_combo(zone, geo_hash, m, p) for m, p in STORY_COMBOS))
    return f"{sum(written)} new stories"


async def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lng", type=float, required=True)
    parser.add_argument("--radius-m", type=float, default=500)
    parser.add_argument("--dry-run", action="store_true", help="only list the blocks, fetch nothing")
    parser.add_argument("--stories", action="store_true", help="also write missing narration variants (billed OpenAI calls)")
    args = parser.parse_args()

    blocks = blocks_in_radius(args.lat, args.lng, args.radius_m)
    print(f"{len(blocks)} blocks within {args.radius_m:.0f} m")
    if args.dry_run:
        print("\n".join(blocks))
        return

    for n, geo_hash in enumerate(blocks, 1):
        line = f"[{n}/{len(blocks)}] {geo_hash}: {await prefill_block(geo_hash)}"
        if args.stories:
            line += f"; {await fill_stories(geo_hash)}"
        print(line, flush=True)


if __name__ == "__main__":
    asyncio.run(main())
