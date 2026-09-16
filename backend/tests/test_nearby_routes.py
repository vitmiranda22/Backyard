"""
Tests for GET /api/routes/nearby -- specifically its Terra Incognita
fog-of-war filter's interaction with pagination. No prior coverage
existed for this endpoint at all before this file.
"""

from app.services import supabase_db, zone_data

USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


def _async(value):
    async def _fn(*args, **kwargs):
        return value
    return _fn


def _route(**overrides):
    row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "title": "A Walking Tour",
        "mood": "hidden_city",
        "tour_type": "walking",
        "city": "San Francisco",
        "avg_rating": 4.5,
        "rating_count": 3,
        "blocks_visited": 5,
        "total_distance_m": 800,
        "duration_sec": 900,
        "is_anonymous": False,
        "content_safety_on": False,
        "creator_display_name": "A Walker",
        "creator_avatar_url": None,
        "distance_m": 100.0,
        "created_at": "2026-01-01T00:00:00+00:00",
        "lat": 37.7749,
        "lng": -122.4194,
    }
    row.update(overrides)
    return row


def test_a_discovered_tour_beyond_the_raw_rpc_limit_still_appears(client, auth_as, app, monkeypatch):
    """
    Regression test: the fog-of-war filter used to be applied AFTER the
    RPC's own LIMIT, so a discovered tour sitting at position 21+ in the
    RPC's unfiltered, distance-sorted results (beyond a client limit=20)
    was silently dropped even though the caller had genuinely discovered
    it -- this asserts the discovery filter now runs before the client's
    limit/offset are applied, not after.
    """
    auth_as(app, USER_ID)

    # 25 undiscovered tours, closer than the one discovered tour --
    # under the old code, requesting limit=20 would never even fetch the
    # discovered one (it never gets past the RPC's own LIMIT 20).
    undiscovered = [_route(id=f"undiscovered-{i}", lat=37.7749 + i * 0.0001, lng=-122.4194) for i in range(25)]
    discovered = _route(id="discovered-1", lat=40.7128, lng=-74.0060)  # far away, sorted last by distance

    monkeypatch.setattr(supabase_db, "get_nearby_tours", _async(undiscovered + [discovered]))
    monkeypatch.setattr(supabase_db, "get_zone_richness_batch", _async({}))

    import geohash2
    from app.api.tours import GEOHASH_PRECISION
    discovered_hash = geohash2.encode(discovered["lat"], discovered["lng"], precision=GEOHASH_PRECISION)
    monkeypatch.setattr(supabase_db, "get_explored_cells_among", _async({discovered_hash}))

    resp = client.get("/api/routes/nearby", params={"lat": 37.8, "lng": -122.4, "limit": 20})

    assert resp.status_code == 200
    ids = [r["tour_id"] for r in resp.json()]
    assert "discovered-1" in ids


def test_pagination_offsets_over_the_filtered_result_not_the_raw_one(client, auth_as, app, monkeypatch):
    """
    With 3 discovered tours total, requesting limit=2&offset=2 should
    return exactly the 3rd discovered tour -- offset/limit apply to the
    already-filtered (discovered-only) list.
    """
    auth_as(app, USER_ID)

    import geohash2
    from app.api.tours import GEOHASH_PRECISION

    rows = [_route(id=f"tour-{i}", lat=37.7749 + i * 0.01, lng=-122.4194) for i in range(5)]
    discovered_ids = {"tour-0", "tour-2", "tour-4"}
    discovered_hashes = {
        geohash2.encode(r["lat"], r["lng"], precision=GEOHASH_PRECISION)
        for r in rows if r["id"] in discovered_ids
    }

    monkeypatch.setattr(supabase_db, "get_nearby_tours", _async(rows))
    monkeypatch.setattr(supabase_db, "get_zone_richness_batch", _async({}))
    monkeypatch.setattr(supabase_db, "get_explored_cells_among", _async(discovered_hashes))

    resp = client.get("/api/routes/nearby", params={"lat": 37.8, "lng": -122.4, "limit": 2, "offset": 2})

    ids = [r["tour_id"] for r in resp.json()]
    assert ids == ["tour-4"]


def test_fully_fogged_caller_gets_an_empty_list_not_an_error(client, auth_as, app, monkeypatch):
    auth_as(app, USER_ID)
    monkeypatch.setattr(supabase_db, "get_nearby_tours", _async([_route()]))
    monkeypatch.setattr(supabase_db, "get_zone_richness_batch", _async({}))
    monkeypatch.setattr(supabase_db, "get_explored_cells_among", _async(set()))

    resp = client.get("/api/routes/nearby", params={"lat": 37.8, "lng": -122.4})

    assert resp.status_code == 200
    assert resp.json() == []
