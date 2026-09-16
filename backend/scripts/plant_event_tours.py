"""
Author real, pre-curated walking tours for the top 6 biggest real-world
events right now — the same rank-based list already powering the
marketing site's global "Biggest Events Right Now" view
(supabase_db.get_top_events_globally, see migrations/027_events_rank.sql).

Replaces the old live event-narration-override system (removed from
narrate.py — see migrations/028_remove_active_event_override.sql): instead
of an invisible background effect that only fired if a premium user's GPS
happened to cross into an event's zone mid-walk, these are real,
discoverable, tap-to-start walking tours (tour_type="walking"), so they
show up on the map and play back exactly like any other tour in the app —
no new mobile code needed at all.

Since these 6 events are anywhere in the world and rotate over time as
real events start and end, waypoints can't be hand-curated like
plant_sf_tours.py's named SF streets. Instead, each event's own
center_lat/center_lng (a real GPS point from PredictHQ, via sync_events.py)
is fanned out into a small walkable loop, and each point is reverse-
geocoded on the fly — the same way the live app already discovers "what
street is this" for any arbitrary GPS coordinate on a normal walking tour.

Usage (from backend/):
    python scripts/plant_event_tours.py

Re-run whenever the top 6 shift (i.e. whenever sync_events.py refreshes).
A simple title-based dedup guard skips any event that already has a
published tour, so re-running doesn't spam duplicates for an event that's
still in the top 6.
"""

import sys, asyncio, math
sys.path.insert(0, ".")
# Event waypoints can reverse-geocode to non-Latin street/neighborhood names
# (e.g. Tokyo) -- Windows' default console codepage (cp1252) can't encode
# those and crashes mid-run on a plain print(), so force UTF-8 stdout.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import geohash2, httpx
from app.services import supabase_db, zone_data, openai_service, tts, r2, streetview, geocode
from app.services.zone_data import format_zone_data_for_prompt, should_skip_web_search
from app.services.events import compute_event_phase

UID = "a98ae177-c64f-481d-b394-69e368400053"
VOICE = "neutral"
MOOD = "hidden_city"
TOP_EVENTS_COUNT = 6
WAYPOINT_OFFSET_M = 150  # comfortably inside every synced event's 300m zone
OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/foot/{coords}"


def haversine_m(lat1, lng1, lat2, lng2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def offset_point(lat, lng, bearing_deg, distance_m):
    """A point distance_m away from (lat, lng) along bearing_deg (0=N, 90=E)."""
    r = 6371000
    brng = math.radians(bearing_deg)
    lat1, lng1 = math.radians(lat), math.radians(lng)
    lat2 = math.asin(
        math.sin(lat1) * math.cos(distance_m / r) + math.cos(lat1) * math.sin(distance_m / r) * math.cos(brng)
    )
    lng2 = lng1 + math.atan2(
        math.sin(brng) * math.sin(distance_m / r) * math.cos(lat1),
        math.cos(distance_m / r) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lng2)


def build_event_waypoints(center_lat, center_lng):
    """
    A small walkable loop around the event's own point: the center, then a
    clockwise diamond at WAYPOINT_OFFSET_M (N -> E -> S -> W). No hand
    curation needed -- reverse_geocode() below discovers the real street
    for each point, the same way the live app does for any GPS coordinate.
    """
    return [
        (center_lat, center_lng),
        offset_point(center_lat, center_lng, 0, WAYPOINT_OFFSET_M),
        offset_point(center_lat, center_lng, 90, WAYPOINT_OFFSET_M),
        offset_point(center_lat, center_lng, 180, WAYPOINT_OFFSET_M),
        offset_point(center_lat, center_lng, 270, WAYPOINT_OFFSET_M),
    ]


async def route_between(client, a, b):
    coords = f"{a[1]},{a[0]};{b[1]},{b[0]}"
    try:
        r = await client.get(
            OSRM_ROUTE_URL.format(coords=coords),
            params={"geometries": "geojson", "overview": "full"},
            timeout=15.0,
        )
        data = r.json()
        if data.get("code") == "Ok" and data.get("routes"):
            geo = data["routes"][0]["geometry"]["coordinates"]
            return [{"lat": c[1], "lng": c[0]} for c in geo]
    except Exception as e:
        print(f"    route failed: {e}")
    return [{"lat": a[0], "lng": a[1]}, {"lat": b[0], "lng": b[1]}]


async def build_walked_path(points):
    full = [{"lat": points[0][0], "lng": points[0][1]}]
    async with httpx.AsyncClient() as client:
        for a, b in zip(points, points[1:]):
            seg = await route_between(client, a, b)
            full.extend(seg[1:])
    return full


async def already_published(title: str) -> bool:
    client = supabase_db._get_client()
    result = (
        client.table("tours")
        .select("id")
        .eq("title", title)
        .eq("is_public", True)
        .limit(1)
        .execute()
    )
    return bool(result.data)


async def build_tour(event: dict):
    title = event["name"]
    print(f"\n=== Building '{title}' (rank {event.get('rank')}, {event.get('category')}) ===")

    if await already_published(title):
        print("    already has a published tour -- skipping")
        return None

    event_context = {
        "name": event["name"],
        "category": event["category"],
        "phase": compute_event_phase(event),
        "description": event.get("description", ""),
    }

    waypoints = build_event_waypoints(event["center_lat"], event["center_lng"])

    tour = await supabase_db.create_tour(
        creator_id=UID, mood=MOOD, voice=VOICE, tour_type="walking", content_safety=False,
    )
    tour_id = tour["id"]
    print("tour_id:", tour_id)

    blocks = []  # (lat, lng) actually used, for the walked path below
    total_audio_ms = 0
    last_narration = ""

    for i, (lat, lng) in enumerate(waypoints, start=1):
        geo_result = await geocode.reverse_geocode(lat, lng)
        if not geo_result:
            print(f"    !! reverse geocode failed for waypoint {i}, skipping")
            continue
        street, hood, city, country = geo_result.street, geo_result.neighborhood, geo_result.city, geo_result.country
        print(f" -- block {i}: {street} / {hood}")

        geo_hash = geohash2.encode(lat, lng, precision=7)
        result = await zone_data.fetch_all_zone_data(
            lat=lat, lng=lng, street_name=street, neighborhood=hood, city=city, country=country,
        )
        zone_str = format_zone_data_for_prompt(result["zone_data"], mode=MOOD)
        skip_ws = should_skip_web_search(result["hit_count"], result["total"] - len(result["sources_skipped"]))
        narration_text = await openai_service.generate_narration(
            street=street, neighborhood=hood, city=city, country=country, mood=MOOD,
            content_safety=False, zone_data=zone_str, skip_web_search=skip_ws, is_premium=False,
            event_context=event_context,
        )
        if not narration_text:
            print(f"    !! narration failed, skipping block {i}")
            continue
        last_narration = narration_text
        print("    narration:", narration_text[:80].replace("\n", " "), "...")

        audio_bytes = await tts.synthesize_speech(text=narration_text, voice=VOICE, is_premium=False)
        audio_r2_key = r2.build_tour_r2_key(tour_id=tour_id, geo_hash=geo_hash, content_safety=False, voice=VOICE)
        if audio_bytes:
            await r2.upload_audio(audio_bytes, audio_r2_key)
            total_audio_ms += tts.estimate_duration_ms(narration_text, VOICE)
        else:
            audio_r2_key = None

        image_bytes = await streetview.fetch_street_view_image(lat, lng)
        image_r2_key = None
        if image_bytes:
            image_r2_key = r2.build_image_r2_key(geo_hash)
            await r2.upload_image(image_bytes, image_r2_key)

        await supabase_db.save_tour_block(
            tour_id=tour_id, sequence=len(blocks) + 1, street_name=street, neighborhood=hood, city=city,
            lat=lat, lng=lng, narration_text=narration_text, audio_r2_key=audio_r2_key,
            voice=VOICE, mood=MOOD, trigger_type="auto", image_r2_key=image_r2_key,
        )
        blocks.append((lat, lng))

    if len(blocks) < 2:
        print(f"    !! only {len(blocks)} usable block(s) -- not enough for a real walking tour, abandoning")
        return None

    total_distance_m = sum(haversine_m(a[0], a[1], b[0], b[1]) for a, b in zip(blocks, blocks[1:]))
    walking_sec = total_distance_m / 1.3
    duration_sec = int(walking_sec + total_audio_ms / 1000)

    print("    building real walking-route path...")
    walked_path = await build_walked_path(blocks)
    print(f"    -> {len(walked_path)} real walking points")

    await supabase_db.end_tour(
        tour_id=tour_id, title=title, blocks_visited=len(blocks),
        total_distance_m=int(total_distance_m), duration_sec=duration_sec,
        center_lat=blocks[0][0], center_lng=blocks[0][1], city=event.get("city") or "",
        location=f"SRID=4326;POINT({blocks[0][1]} {blocks[0][0]})",
        path_points=walked_path, flagged_implausible_speed=False,
    )
    if last_narration:
        await supabase_db.update_tour_narrative_summary(tour_id, last_narration[:200])
    await supabase_db.publish_tour(tour_id, True, title)

    print(f"Done: {title} -> {len(blocks)} blocks, {int(total_distance_m)}m, tour_id={tour_id}")
    return tour_id


async def main():
    events = await supabase_db.get_top_events_globally(TOP_EVENTS_COUNT)
    print(f"Top {len(events)} events fetched.")
    if not events:
        print("Nothing to build -- get_top_events_globally() returned no events.")
        return

    ids = []
    for event in events:
        tid = await build_tour(event)
        if tid:
            ids.append(tid)
    print("\nBuilt tour IDs:", ids)


asyncio.run(main())
