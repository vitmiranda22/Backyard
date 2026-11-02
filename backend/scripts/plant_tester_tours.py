"""Private premium walks in dense tourist areas around the world, saved on the marketing tester account
(daniel.carter@backyardexplorer.org) so the marketing agent can browse them and cut reels. Not published.
Usage: python scripts/plant_tester_tours.py [tour title ...]   (no titles = all)"""
import sys, asyncio
sys.path.insert(0, ".")
import geohash2
from scripts.plant_sf_tours import build_tour

TESTER_UID = "a443cc2b-9d29-4011-8dca-337b6e2a4f1c"

TOURS = [
    {"title": "Ancient Rome Up Close", "mood": "time_machine", "tier": "premium", "city": "Rome", "country": "Italy", "blocks": [
        (41.8902, 12.4922, "Piazza del Colosseo", "Celio"),
        (41.8898, 12.4906, "Via di San Gregorio", "Celio"),
        (41.8925, 12.4853, "Via Sacra", "Roman Forum"),
        (41.8934, 12.4828, "Piazza del Campidoglio", "Campitelli"),
        (41.8958, 12.4862, "Via Quattro Novembre", "Monti"),
        (41.8960, 12.4823, "Piazza Venezia", "Pigna"),
        (41.8986, 12.4769, "Piazza della Rotonda", "Pigna"),
        (41.9009, 12.4833, "Piazza di Trevi", "Trevi"),
    ]},
    {"title": "Paris Behind the Postcards", "mood": "hidden_city", "tier": "premium", "city": "Paris", "country": "France", "blocks": [
        (48.8530, 2.3499, "Parvis Notre-Dame", "Île de la Cité"),
        (48.8526, 2.3471, "Rue de la Bûcherie", "Latin Quarter"),
        (48.8554, 2.3450, "Boulevard du Palais", "Île de la Cité"),
        (48.8571, 2.3413, "Pont Neuf", "Île de la Cité"),
        (48.8610, 2.3358, "Cour Napoléon", "Louvre"),
        (48.8635, 2.3372, "Jardin du Palais-Royal", "Palais-Royal"),
        (48.8566, 2.3522, "Place de l'Hôtel de Ville", "Le Marais"),
        (48.8556, 2.3655, "Place des Vosges", "Le Marais"),
    ]},
    {"title": "Westminster's Dark Corners", "mood": "dark_side", "tier": "premium", "city": "London", "country": "United Kingdom", "blocks": [
        (51.4993, -0.1273, "Broad Sanctuary", "Westminster"),
        (51.5007, -0.1246, "Bridge Street", "Westminster"),
        (51.5034, -0.1276, "Whitehall", "Westminster"),
        (51.5050, -0.1272, "Horse Guards Road", "St James's"),
        (51.5080, -0.1281, "Trafalgar Square", "Charing Cross"),
        (51.5117, -0.1240, "Covent Garden Piazza", "Covent Garden"),
        (51.5025, -0.1348, "Birdcage Walk", "St James's Park"),
        (51.5014, -0.1419, "The Mall", "St James's"),
    ]},
    {"title": "How Lower Manhattan Works", "mood": "behind_scenes", "tier": "premium", "city": "New York", "country": "United States", "blocks": [
        (40.7033, -74.0170, "Battery Place", "Battery Park"),
        (40.7056, -74.0134, "Bowling Green", "Financial District"),
        (40.7074, -74.0104, "Wall Street", "Financial District"),
        (40.7081, -74.0121, "Broadway", "Financial District"),
        (40.7115, -74.0134, "Greenwich Street", "World Trade Center"),
        (40.7115, -74.0110, "Church Street", "World Trade Center"),
        (40.7128, -74.0060, "City Hall Park", "Civic Center"),
        (40.7116, -74.0040, "Brooklyn Bridge Promenade", "Civic Center"),
    ]},
    {"title": "Asakusa Unfiltered", "mood": "unfiltered", "tier": "premium", "city": "Tokyo", "country": "Japan", "blocks": [
        (35.7100, 139.7990, "Azuma Bridge", "Asakusa"),
        (35.7111, 139.7964, "Kaminarimon-dori", "Asakusa"),
        (35.7126, 139.7963, "Nakamise-dori", "Asakusa"),
        (35.7148, 139.7967, "Senso-ji", "Asakusa"),
        (35.7154, 139.7975, "Asakusa Shrine", "Asakusa"),
        (35.7140, 139.7935, "Hoppy Street", "Asakusa"),
        (35.7120, 139.7945, "Denboin-dori", "Asakusa"),
        (35.7130, 139.8020, "Sumida Park", "Asakusa"),
    ]},
    {"title": "Gothic Quarter Time Travel", "mood": "time_machine", "tier": "premium", "city": "Barcelona", "country": "Spain", "blocks": [
        (41.3817, 2.1716, "La Rambla", "El Raval"),
        (41.3801, 2.1754, "Plaça Reial", "Barri Gòtic"),
        (41.3827, 2.1771, "Plaça de Sant Jaume", "Barri Gòtic"),
        (41.3840, 2.1762, "Pla de la Seu", "Barri Gòtic"),
        (41.3841, 2.1776, "Plaça del Rei", "Barri Gòtic"),
        (41.3838, 2.1820, "Plaça de Santa Maria", "El Born"),
        (41.3852, 2.1810, "Carrer de Montcada", "El Born"),
        (41.3858, 2.1838, "Passeig del Born", "El Born"),
    ]},
]

# Audio is stored per tour + geohash, so two stops in one ~150m cell would overwrite each other's audio.
for t in TOURS:
    cells = [geohash2.encode(lat, lng, precision=7) for lat, lng, *_ in t["blocks"]]
    assert len(set(cells)) == len(cells), f"{t['title']}: stops share a geohash cell {cells}"


async def main():
    wanted = set(sys.argv[1:])
    ids = [await build_tour(t, uid=TESTER_UID, publish=False) for t in TOURS if not wanted or t["title"] in wanted]
    print("\nAll tour IDs:", ids)


if __name__ == "__main__":
    asyncio.run(main())
