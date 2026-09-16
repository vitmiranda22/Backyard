"""
Populate the `events` table (migrations/025_events.sql) from PredictHQ's
real-world events API — runs manually, same pattern as plant_sf_tours.py.

Usage (from backend/):
    python scripts/sync_events.py --city "San Francisco" --lat 37.7749 --lng -122.4194 --radius-km 25

Requires PREDICTHQ_API_KEY in .env (see app/config.py) — free plan from
predicthq.com covers this. Safe to re-run: upserts on (source, source_event_id),
so re-running just refreshes existing rows and adds new ones.
"""

import sys
import argparse
import asyncio
import datetime
import re

sys.path.insert(0, ".")

import httpx

from app.config import settings
from app.services import supabase_db

PREDICTHQ_BASE_URL = "https://api.predicthq.com/v1/events/"
PAGE_LIMIT = 100
DEFAULT_RADIUS_M = 300  # PredictHQ gives a point, not an event footprint — see events.py

# Runs/parades/festivals are the content this feature is built for (see
# the Backyard Events plan) — PredictHQ's "sports" category also covers
# city-wide participatory runs (5Ks, marathons), not just spectator
# sports, so it's included and later narrowed by _map_category() below
# rather than trusted as-is.
#
# Deliberately excludes PredictHQ's "community" category -- confirmed
# live this session that it's far broader than street fairs/civic
# events: a real sync against San Francisco returned mostly ticketed
# concerts and comedy shows tagged "community" (e.g. "Pink Martini &
# San Francisco Symphony", "Brad Williams"), not walkable public events.
# "concerts"/"performing-arts" are PredictHQ's own separate categories
# for that content, and were never requested here.
PREDICTHQ_CATEGORIES = "festivals,sports"

# PredictHQ's own categories are broader than ours — this maps a raw
# PredictHQ event (by category + title keywords) down to the events
# table's CHECK(category IN (...)) enum. Title keywords are checked
# first since "sports"/"community" both bucket real runs and parades
# that would otherwise fall through to "other".
_RUN_KEYWORDS = ("run", "marathon", "5k", "10k", "half marathon", "fun run", "race")
_PARADE_KEYWORDS = ("parade", "procession")
_MARKET_KEYWORDS = ("market", "bazaar", "fair")


def _matches_any_keyword(text: str, keywords: tuple) -> bool:
    """
    Word-boundary match, not substring -- a plain `kw in text` check made
    "run" match inside "brunch" and "fair" match inside "affair"/"fairway",
    mis-categorizing real events with no connection to a run or a market.
    """
    return any(re.search(r"\b" + re.escape(kw) + r"\b", text) for kw in keywords)


def _map_category(phq_category: str, title: str) -> str:
    title_lower = title.lower()
    if _matches_any_keyword(title_lower, _PARADE_KEYWORDS):
        return "parade"
    if _matches_any_keyword(title_lower, _RUN_KEYWORDS):
        return "run"
    if _matches_any_keyword(title_lower, _MARKET_KEYWORDS):
        return "market"
    if phq_category == "festivals":
        return "festival"
    if phq_category == "community":
        return "community"
    return "other"


async def fetch_from_predicthq(lat: float, lng: float, radius_km: float) -> list[dict]:
    if not settings.PREDICTHQ_API_KEY:
        raise RuntimeError("PREDICTHQ_API_KEY is not set — add a free key from predicthq.com to .env")

    events = []
    offset = 0

    async with httpx.AsyncClient() as client:
        while True:
            resp = await client.get(
                PREDICTHQ_BASE_URL,
                headers={"Authorization": f"Bearer {settings.PREDICTHQ_API_KEY}"},
                params={
                    "within": f"{radius_km}km@{lat},{lng}",
                    "category": PREDICTHQ_CATEGORIES,
                    # PredictHQ rejects the literal string "now" here (confirmed
                    # live: "Invalid date value for 'now'") -- it needs a real
                    # RFC 3339 timestamp, not a keyword.
                    "active.gte": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "limit": PAGE_LIMIT,
                    "offset": offset,
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            events.extend(results)

            offset += PAGE_LIMIT
            if offset >= data.get("count", 0) or not results:
                break

    return events


_SOURCE_ATTRIBUTION_PREFIX = re.compile(r"^\s*Sourced from predicthq\.com\s*-?\s*", re.IGNORECASE)


def _clean_description(raw_description: str) -> str:
    """
    PredictHQ prefixes every description with "Sourced from predicthq.com"
    (confirmed live: sometimes followed by a real sentence, often by
    nothing at all) -- stripped so a real description reads cleanly and
    an event with nothing real behind it ends up with an empty string
    instead of that boilerplate rendering as if it were content.
    """
    return _SOURCE_ATTRIBUTION_PREFIX.sub("", raw_description or "").strip()


def normalize(raw: dict, fallback_city: str) -> dict | None:
    geo = raw.get("geo") or {}
    geometry = geo.get("geometry") or {}
    if geometry.get("type") != "Point":
        # City-wide/regional events (polygons) don't have a single walkable
        # zone center — skip rather than guess a centroid.
        return None
    coords = geometry.get("coordinates")
    if not coords or len(coords) != 2:
        return None
    lng, lat = coords

    start_time = raw.get("start")
    end_time = raw.get("end")
    if not start_time or not end_time or end_time <= start_time:
        # No usable time window (e.g. an instantaneous or malformed event) —
        # the events table requires end_time > start_time.
        return None

    title = raw.get("title", "").strip()
    if not title:
        return None

    return {
        "name": title,
        "description": _clean_description(raw.get("description"))[:2000],
        "category": _map_category(raw.get("category", ""), title),
        "city": (geo.get("address") or {}).get("locality") or fallback_city,
        "center_lat": lat,
        "center_lng": lng,
        "location": f"SRID=4326;POINT({lng} {lat})",
        "radius_m": DEFAULT_RADIUS_M,
        "start_time": start_time,
        "end_time": end_time,
        "source": "predicthq",
        "source_event_id": raw["id"],
        "source_url": None,
        "is_active": True,
    }


async def main():
    parser = argparse.ArgumentParser(description="Sync real-world events from PredictHQ into the events table")
    parser.add_argument("--city", required=True, help="Fallback city label when PredictHQ's own locality is missing")
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lng", type=float, required=True)
    parser.add_argument("--radius-km", type=float, default=25.0)
    args = parser.parse_args()

    print(f"Fetching PredictHQ events within {args.radius_km}km of ({args.lat}, {args.lng})...")
    raw_events = await fetch_from_predicthq(args.lat, args.lng, args.radius_km)
    print(f"  -> {len(raw_events)} raw events returned")

    rows = [row for raw in raw_events if (row := normalize(raw, args.city))]
    skipped = len(raw_events) - len(rows)
    print(f"  -> {len(rows)} normalized (skipped {skipped}: no point geometry, bad time window, or no title)")

    if not rows:
        print("Nothing to upsert.")
        return

    client = supabase_db._get_client()
    client.table("events").upsert(rows, on_conflict="source,source_event_id").execute()
    print(f"Upserted {len(rows)} events.")


asyncio.run(main())
