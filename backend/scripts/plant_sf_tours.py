import sys, asyncio, math, random
sys.path.insert(0, ".")
import geohash2, httpx
import sentry_sdk
from app.config import settings
from app.services import supabase_db, zone_data, openai_service, tts, r2, streetview
from app.services.zone_data import format_zone_data_for_prompt, should_skip_web_search

# capture_message is a documented no-op if sentry_sdk.init() was never
# called (blank SENTRY_DSN) -- same reliance as the main app's own setup
# and admin.py's failed-attempt alerting. Gives this offline script the
# same "show up in Sentry" visibility a live endpoint already has, since
# a silent partial/total failure here previously went unnoticed for
# weeks (see the Lower East Side Stories investigation: a script run
# published a tour claiming 12 stops with only 1 real block saved,
# and 4 sibling tours with zero).
sentry_sdk.init(dsn=settings.SENTRY_DSN, traces_sample_rate=0.0)

UID = "a98ae177-c64f-481d-b394-69e368400053"
CITY = "San Francisco"
COUNTRY = "United States"
VOICE = "neutral"
OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/foot/{coords}"
FREE_MAX_BLOCKS = 5
PREMIUM_MAX_BLOCKS = 12

SAFE_LIKERS = [
    "a48f80c3-fad6-4a41-b31c-3889667cc314", "2e294e85-a1fe-4f21-9346-2a574585a58b",
    "374453de-eec0-437d-92d6-e3dffbdb861b", "e771d552-d2eb-44fe-8174-dd63800bb2b4",
    "f13bbee1-5ee6-49c2-a0f4-2d2e881f8ee4", "2070016e-dbba-43f1-858b-dda79ace1d4d",
    "5f868812-afb9-425d-8960-d27bf9ccb1d5", "db428ed3-66e1-4074-adb5-74a113c49d38",
    "a4af1731-d334-428b-b597-b5a5c3bb1915",
]


def haversine_m(lat1, lng1, lat2, lng2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


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
    # Real turn-by-turn walking directions between each consecutive
    # waypoint, concatenated -- this is what makes the saved path actually
    # look like a person walked it (hugging real sidewalks/streets, not a
    # beeline through whatever's between two landmarks).
    full = [{"lat": points[0][0], "lng": points[0][1]}]
    async with httpx.AsyncClient() as client:
        for a, b in zip(points, points[1:]):
            seg = await route_between(client, a, b)
            full.extend(seg[1:])
    return full


TOURS = [
    {"title": "Mission Murals & Mischief", "mood": "unfiltered", "tier": "free", "blocks": [
        (37.7614, -122.4212, "Clarion Alley", "Mission District"),
        (37.7482, -122.4133, "Balmy Alley", "Mission District"),
        (37.7524, -122.4103, "24th Street", "Mission District"),
        (37.7596, -122.4269, "Mission Dolores Park", "Mission District"),
        (37.7642, -122.4269, "Dolores Street", "Mission District"),
    ]},
    {"title": "Summer of Love Echoes", "mood": "time_machine", "tier": "premium", "blocks": [
        (37.7692, -122.4467, "Haight Street", "Haight-Ashbury"),
        (37.7699, -122.4469, "Ashbury Street", "Haight-Ashbury"),
        (37.7716, -122.4406, "Lyon Street", "Haight-Ashbury"),
        (37.7686, -122.4406, "Buena Vista Park", "Haight-Ashbury"),
        (37.7702, -122.4487, "Haight Street", "Haight-Ashbury"),
        (37.7716, -122.4457, "Panhandle", "Haight-Ashbury"),
        (37.7696, -122.4477, "Haight Street", "Haight-Ashbury"),
        (37.7699, -122.4457, "Haight Street", "Haight-Ashbury"),
        (37.7702, -122.4456, "Haight Street", "Haight-Ashbury"),
        (37.7694, -122.4573, "Hippie Hill", "Haight-Ashbury"),
        (37.7660, -122.4557, "Kezar Stadium", "Haight-Ashbury"),
        (37.7658, -122.4497, "Cole Street", "Cole Valley"),
    ]},
    {"title": "Wharf Secrets", "mood": "hidden_city", "tier": "free", "blocks": [
        (37.8087, -122.4098, "Pier 39", "Fisherman's Wharf"),
        (37.8098, -122.4092, "Pier 39 K-Dock", "Fisherman's Wharf"),
        (37.8095, -122.4177, "Jefferson Street", "Fisherman's Wharf"),
        (37.8060, -122.4230, "Ghirardelli Square", "Fisherman's Wharf"),
        (37.8080, -122.4225, "Aquatic Park", "Fisherman's Wharf"),
    ]},
    {"title": "Behind Pacific Heights' Gates", "mood": "dark_side", "tier": "premium", "blocks": [
        (37.7925, -122.4400, "Washington Street", "Pacific Heights"),
        (37.7925, -122.4437, "Lyon Street Steps", "Pacific Heights"),
        (37.7915, -122.4368, "Alta Plaza Park", "Pacific Heights"),
        (37.7908, -122.4350, "Fillmore Street", "Pacific Heights"),
        (37.7930, -122.4245, "Franklin Street", "Pacific Heights"),
        (37.7960, -122.4400, "Broadway", "Pacific Heights"),
        (37.7915, -122.4295, "Lafayette Park", "Pacific Heights"),
        (37.7973, -122.4360, "Union Street", "Cow Hollow"),
        (37.7988, -122.4364, "Vedanta Temple", "Pacific Heights"),
        (37.7885, -122.4485, "Sacramento Street", "Presidio Heights"),
        (37.7938, -122.4300, "Jackson Street", "Pacific Heights"),
        (37.7920, -122.4260, "Clay Street", "Pacific Heights"),
    ]},
    {"title": "SoMa's Industrial Ghosts", "mood": "behind_scenes", "tier": "premium", "blocks": [
        (37.7786, -122.3893, "Third Street", "SoMa"),
        (37.7822, -122.3958, "South Park", "SoMa"),
        (37.7857, -122.4011, "Third Street", "SoMa"),
        (37.7845, -122.4025, "Yerba Buena Gardens", "SoMa"),
        (37.7840, -122.4013, "Howard Street", "SoMa"),
        (37.7796, -122.4013, "Mission Street", "SoMa"),
        (37.7788, -122.3956, "Brannan Street", "SoMa"),
        (37.7815, -122.4075, "Fifth Street", "SoMa"),
        (37.7900, -122.3958, "Rincon Center", "SoMa"),
        (37.7930, -122.3945, "Hills Plaza", "SoMa"),
        (37.7847, -122.4032, "Fourth Street", "SoMa"),
        (37.7900, -122.3985, "Foundry Square", "SoMa"),
    ]},
    {"title": "The Castro's Rainbow Roots", "mood": "time_machine", "tier": "free", "blocks": [
        (37.7609, -122.4350, "Castro Theatre", "Castro District"),
        (37.7620, -122.4350, "Castro Street", "Castro District"),
        (37.7614, -122.4345, "18th Street", "Castro District"),
        (37.7614, -122.4340, "Castro Street", "Castro District"),
        (37.7613, -122.4347, "Castro Street", "Castro District"),
    ]},
    {"title": "Golden Gate's Hidden Groves", "mood": "hidden_city", "tier": "premium", "blocks": [
        (37.7719, -122.4604, "Conservatory of Flowers", "Golden Gate Park"),
        (37.7715, -122.4686, "de Young Museum", "Golden Gate Park"),
        (37.7699, -122.4661, "Academy of Sciences", "Golden Gate Park"),
        (37.7702, -122.4700, "Japanese Tea Garden", "Golden Gate Park"),
        (37.7686, -122.4756, "Stow Lake", "Golden Gate Park"),
        (37.7690, -122.4770, "Strawberry Hill", "Golden Gate Park"),
        (37.7714, -122.4676, "Shakespeare Garden", "Golden Gate Park"),
        (37.7681, -122.4614, "AIDS Memorial Grove", "Golden Gate Park"),
        (37.7702, -122.4750, "Prayer Book Cross", "Golden Gate Park"),
        (37.7695, -122.5100, "Dutch Windmill", "Golden Gate Park"),
        (37.7688, -122.5030, "Buffalo Paddock", "Golden Gate Park"),
        (37.7717, -122.4632, "Rose Garden", "Golden Gate Park"),
    ]},
    {"title": "The Presidio's Buried Past", "mood": "dark_side", "tier": "free", "blocks": [
        (37.8029, -122.4484, "Palace of Fine Arts", "Marina District"),
        (37.8058, -122.4386, "Marina Green", "Marina District"),
        (37.8065, -122.4310, "Fort Mason", "Marina District"),
        (37.8033, -122.4650, "Crissy Field", "Presidio"),
        (37.7983, -122.4577, "Presidio Officers' Club", "Presidio"),
    ]},
]


async def build_tour(spec):
    is_premium = spec["tier"] == "premium"
    print(f"\n=== Building '{spec['title']}' ({spec['mood']}, {spec['tier']}, {len(spec['blocks'])} blocks) ===")
    tour = await supabase_db.create_tour(
        creator_id=UID, mood=spec["mood"], voice=VOICE, tour_type="walking", content_safety=False,
    )
    if not tour:
        print(f"    !! create_tour failed (DB error) -- skipping '{spec['title']}', rerun will retry it")
        return None
    tour_id = tour["id"]
    print("tour_id:", tour_id)

    total_audio_ms = 0
    last_narration = ""
    # Only ever appended to on a REAL save -- this (not spec["blocks"],
    # the planned count) is what blocks_visited/distance/path get computed
    # from below. Previously blocks_visited was hardcoded to
    # len(spec["blocks"]) regardless of how many blocks actually saved,
    # which is exactly how a run where most/all blocks failed still
    # published a tour claiming a full stop count with little or nothing
    # behind it. Matches the pattern plant_event_tours.py already uses.
    saved_blocks = []
    for i, (lat, lng, street, hood) in enumerate(spec["blocks"], start=1):
        print(f" -- block {i}: {street} / {hood}")
        geo_hash = geohash2.encode(lat, lng, precision=7)
        result = await zone_data.fetch_all_zone_data(
            lat=lat, lng=lng, street_name=street, neighborhood=hood, city=CITY, country=COUNTRY,
        )
        zone_str = format_zone_data_for_prompt(result["zone_data"], mode=spec["mood"])
        skip_ws = should_skip_web_search(result["hit_count"], result["total"] - len(result["sources_skipped"]))
        narration_text = await openai_service.generate_narration(
            street=street, neighborhood=hood, city=CITY, country=COUNTRY, mood=spec["mood"],
            content_safety=False, zone_data=zone_str, skip_web_search=skip_ws, is_premium=is_premium,
        )
        if not narration_text:
            message = f"plant_sf_tours: narration failed for '{spec['title']}' block {i} ({street}, {hood}) -- skipped"
            print(f"    !! {message}")
            sentry_sdk.capture_message(message, level="warning")
            continue
        last_narration = narration_text
        print("    narration:", narration_text[:80].replace("\n", " "), "...")

        audio_bytes = await tts.synthesize_speech(text=narration_text, voice=VOICE, is_premium=is_premium)
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
            tour_id=tour_id, sequence=len(saved_blocks) + 1, street_name=street, neighborhood=hood, city=CITY,
            lat=lat, lng=lng, narration_text=narration_text, audio_r2_key=audio_r2_key,
            voice=VOICE, mood=spec["mood"], trigger_type="auto", image_r2_key=image_r2_key,
        )
        saved_blocks.append((lat, lng))

    # Fewer than 2 real blocks isn't a walking tour -- there's no route to
    # walk between one point (or zero). Previously this still got
    # end_tour()'d and published anyway, exactly how 4 sibling NYC tours
    # ended up live with zero real blocks each behind a claimed 12 stops.
    if len(saved_blocks) < 2:
        message = (
            f"plant_sf_tours: '{spec['title']}' only saved {len(saved_blocks)}/{len(spec['blocks'])} "
            f"planned blocks -- abandoning without publishing (tour_id={tour_id})"
        )
        print(f"    !! {message}")
        sentry_sdk.capture_message(message, level="error")
        return None

    if len(saved_blocks) < len(spec["blocks"]):
        message = (
            f"plant_sf_tours: '{spec['title']}' only saved {len(saved_blocks)}/{len(spec['blocks'])} "
            f"planned blocks -- publishing anyway with the real (shorter) count (tour_id={tour_id})"
        )
        print(f"    !! {message}")
        sentry_sdk.capture_message(message, level="warning")

    total_distance_m = sum(haversine_m(a[0], a[1], b[0], b[1]) for a, b in zip(saved_blocks, saved_blocks[1:]))
    walking_sec = total_distance_m / 1.3
    duration_sec = int(walking_sec + total_audio_ms / 1000)

    print("    building real walking-route path...")
    walked_path = await build_walked_path(saved_blocks)
    print(f"    -> {len(walked_path)} real walking points")

    await supabase_db.end_tour(
        tour_id=tour_id, title=spec["title"], blocks_visited=len(saved_blocks),
        total_distance_m=int(total_distance_m), duration_sec=duration_sec,
        center_lat=saved_blocks[0][0], center_lng=saved_blocks[0][1], city=CITY,
        location=f"SRID=4326;POINT({saved_blocks[0][1]} {saved_blocks[0][0]})",
        path_points=walked_path, flagged_implausible_speed=False,
    )
    if last_narration:
        await supabase_db.update_tour_narrative_summary(tour_id, last_narration[:200])
    await supabase_db.publish_tour(tour_id, True, spec["title"])

    n_likes = random.randint(4, len(SAFE_LIKERS))
    likers = random.sample(SAFE_LIKERS, n_likes)
    sb = supabase_db._get_client()
    sb.table("tour_likes").insert([{"tour_id": tour_id, "user_id": u} for u in likers]).execute()

    print(f"Done: {spec['title']} -> {len(saved_blocks)} blocks, {int(total_distance_m)}m, {n_likes} likes, tour_id={tour_id}")
    return tour_id


async def main():
    ids = []
    for spec in TOURS:
        tid = await build_tour(spec)
        ids.append(tid)
    print("\nAll tour IDs:", ids)


asyncio.run(main())
