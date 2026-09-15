"""
Plant a real Museum Tour: fetches real object facts + images from the Met
Museum's open Collection API (no key needed, see app/services/met_museum.py),
writes museum-appropriate narration for each, and publishes the result as a
tour_type='museum' tour -- same create_tour/save_tour_block/end_tour/
publish_tour pipeline as plant_sf_tours.py, just fed by museum object facts
instead of street zone_data.

Every object_id below was hand-verified live (non-empty GalleryNumber, i.e.
currently on physical display) before being added here -- see
met_museum.fetch_met_object's is_on_view field, re-checked defensively at
runtime below too, since a museum's floor rotates.

Usage (from backend/): python scripts/plant_museum_tours.py
"""

import sys
import asyncio

sys.path.insert(0, ".")
import httpx
from app.services import supabase_db, met_museum, openai_service, tts, r2

UID = "a98ae177-c64f-481d-b394-69e368400053"
VOICE = "neutral"

MUSEUMS = [
    {
        "name": "The Metropolitan Museum of Art",
        "city": "New York",
        "center_lat": 40.7794,
        "center_lng": -73.9632,
        # A hand-curated "greatest hits" walk through the collection,
        # deliberately spanning several departments (Egyptian Art, American
        # history painting, European Paintings) rather than one gallery --
        # each ID confirmed on view this session via a live GalleryNumber check.
        "object_ids": [
            547802,  # The Temple of Dendur (Egyptian Art)
            11417,   # Washington Crossing the Delaware (Leutze)
            436105,  # The Death of Socrates (David)
            437329,  # The Abduction of the Sabine Women (Poussin)
            435809,  # The Harvesters (Bruegel the Elder)
            459055,  # The Annunciation (Memling)
            436524,  # Sunflowers (Van Gogh)
            436535,  # Wheat Field with Cypresses (Van Gogh)
            438821,  # Ia Orana Maria (Gauguin)
            436947,  # Boating (Manet)
        ],
    },
]


async def build_museum_tour(museum: dict) -> str:
    print(f"\n=== Building museum tour: {museum['name']} ({len(museum['object_ids'])} objects) ===")
    tour = await supabase_db.create_tour(
        creator_id=UID, mood="time_machine", voice=VOICE, tour_type="museum", content_safety=False,
    )
    tour_id = tour["id"]
    print("tour_id:", tour_id)

    sequence = 0
    async with httpx.AsyncClient() as client:
        for object_id in museum["object_ids"]:
            print(f" -- object {object_id}")
            facts = await met_museum.fetch_met_object(object_id, client)
            if not facts:
                print(f"    !! couldn't fetch object {object_id}, skipping")
                continue
            if not facts["is_on_view"]:
                print(f"    !! {facts['title']} is not currently on view, skipping")
                continue

            narration_text = await openai_service.generate_museum_narration(facts, museum["name"], VOICE)
            if not narration_text:
                print(f"    !! narration failed for {facts['title']}, skipping")
                continue
            print("    narration:", narration_text[:80].replace("\n", " "), "...")

            sequence += 1

            audio_bytes = await tts.synthesize_speech(text=narration_text, voice=VOICE, is_premium=True)
            audio_r2_key = None
            if audio_bytes:
                audio_r2_key = r2.build_museum_audio_r2_key(object_id, VOICE)
                await r2.upload_audio(audio_bytes, audio_r2_key)

            image_bytes = await met_museum.fetch_met_image_bytes(facts["primary_image"], client)
            image_r2_key = None
            if image_bytes:
                image_r2_key = r2.build_museum_image_r2_key(object_id)
                await r2.upload_image(image_bytes, image_r2_key)

            artist = facts["artist_display_name"] or "Unknown artist"
            await supabase_db.save_tour_block(
                tour_id=tour_id,
                sequence=sequence,
                street_name=f"{facts['title']} — {artist}",
                neighborhood=facts["department"],
                city=museum["city"],
                lat=museum["center_lat"],
                lng=museum["center_lng"],
                narration_text=narration_text,
                audio_r2_key=audio_r2_key,
                voice=VOICE,
                mood="time_machine",
                trigger_type="manual",
                image_r2_key=image_r2_key,
            )

    await supabase_db.end_tour(
        tour_id=tour_id,
        title=museum["name"],
        blocks_visited=sequence,
        center_lat=museum["center_lat"],
        center_lng=museum["center_lng"],
        city=museum["city"],
        location=f"SRID=4326;POINT({museum['center_lng']} {museum['center_lat']})",
    )
    await supabase_db.publish_tour(tour_id, True, museum["name"])

    print(f"Done: {museum['name']} -> {sequence} blocks, tour_id={tour_id}")
    return tour_id


async def main():
    ids = []
    for museum in MUSEUMS:
        tid = await build_museum_tour(museum)
        ids.append(tid)
    print("\nAll museum tour IDs:", ids)


asyncio.run(main())
