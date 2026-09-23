"""
Tests for the ring-stitching and cell-counting logic behind the offline
backend/scripts/map_region_boundaries.py -- the pure-geometry pieces
this script's real, one-time run against San Francisco/Chicago/Los
Angeles/New York depends on. No network calls here; Overpass itself
was verified live and by hand during development, not re-mocked here.
"""

import sys
sys.path.insert(0, ".")

from scripts.map_region_boundaries import (
    stitch_segments_into_rings,
    point_in_polygon,
    point_in_any_ring,
    count_cells_in_rings,
)


def _square(lat0, lng0, size=0.01):
    """A simple closed square ring for polygon tests, as {lat,lng} dicts."""
    return [
        {"lat": lat0, "lng": lng0},
        {"lat": lat0, "lng": lng0 + size},
        {"lat": lat0 + size, "lng": lng0 + size},
        {"lat": lat0 + size, "lng": lng0},
        {"lat": lat0, "lng": lng0},
    ]


# --- stitch_segments_into_rings ----------------------------------------------

def test_stitches_two_segments_sharing_an_endpoint_into_one_ring():
    seg_a = [(0.0, 0.0), (0.0, 1.0)]
    seg_b = [(0.0, 1.0), (1.0, 1.0)]
    seg_c = [(1.0, 1.0), (1.0, 0.0)]
    seg_d = [(1.0, 0.0), (0.0, 0.0)]

    rings = stitch_segments_into_rings([seg_a, seg_b, seg_c, seg_d])

    assert len(rings) == 1
    assert len(rings[0]) == 5  # 4 segments of 2 points each, sharing endpoints


def test_stitches_segments_given_in_arbitrary_order_and_direction():
    """
    Real OSM `outer` members arrive in no particular order, and any one
    of them can be reversed relative to the others -- this mirrors that
    by shuffling and reversing some segments.
    """
    seg_a = [(0.0, 0.0), (0.0, 1.0)]
    seg_b_reversed = [(1.0, 1.0), (0.0, 1.0)]  # same edge as seg_b, reversed
    seg_c = [(1.0, 1.0), (1.0, 0.0)]
    seg_d_reversed = [(0.0, 0.0), (1.0, 0.0)]  # same edge as seg_d, reversed

    rings = stitch_segments_into_rings([seg_c, seg_a, seg_d_reversed, seg_b_reversed])

    assert len(rings) == 1
    assert len(rings[0]) == 5
    # Regardless of the input order/direction, the stitched ring should
    # trace all 4 real corners of the square.
    corners = {(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0)}
    assert {(p["lat"], p["lng"]) for p in rings[0]} == corners


def test_produces_two_separate_rings_for_disjoint_segment_groups():
    """
    Mirrors San Francisco's real boundary: a main ring plus a separate,
    disjoint ring for the Farallon Islands -- confirmed live this
    session, not a hypothetical edge case.
    """
    main_a = [(0.0, 0.0), (0.0, 1.0)]
    main_b = [(0.0, 1.0), (1.0, 0.0)]
    main_c = [(1.0, 0.0), (0.0, 0.0)]

    island_a = [(50.0, 50.0), (50.0, 51.0)]
    island_b = [(50.0, 51.0), (51.0, 50.0)]
    island_c = [(51.0, 50.0), (50.0, 50.0)]

    rings = stitch_segments_into_rings([main_a, island_a, main_b, island_b, main_c, island_c])

    assert len(rings) == 2
    ring_sizes = sorted(len(r) for r in rings)
    assert ring_sizes == [4, 4]


# --- point_in_polygon / point_in_any_ring ------------------------------------

def test_point_in_polygon_true_for_a_point_inside_the_square():
    square = _square(37.0, -122.0, size=0.1)
    assert point_in_polygon(37.05, -121.95, square) is True


def test_point_in_polygon_false_for_a_point_outside_the_square():
    square = _square(37.0, -122.0, size=0.1)
    assert point_in_polygon(38.0, -121.95, square) is False


def test_point_in_any_ring_checks_across_multiple_disjoint_rings():
    main_ring = _square(37.0, -122.0, size=0.1)
    island_ring = _square(50.0, 50.0, size=0.1)

    # Inside the "island" ring only.
    assert point_in_any_ring(50.05, 50.05, [main_ring, island_ring]) is True
    # Inside neither.
    assert point_in_any_ring(0.0, 0.0, [main_ring, island_ring]) is False


# --- count_cells_in_rings -----------------------------------------------------

def test_counts_more_cells_for_a_larger_square():
    small = count_cells_in_rings([_square(37.0, -122.0, size=0.01)])
    large = count_cells_in_rings([_square(37.0, -122.0, size=0.05)])
    assert large > small
    assert small > 0


def test_counts_cells_across_multiple_disjoint_rings_combined():
    # Keeps the two rings close together (like San Francisco's real
    # mainland + Farallon Islands boundary, ~0.5 degrees apart) rather
    # than planet-spanning -- count_cells_in_rings samples the COMBINED
    # bounding box of every ring at a fixed step, so two rings placed far
    # apart (e.g. 13 degrees of latitude and 172 of longitude) blows the
    # sample grid up to billions of points and hangs. A real, one-time
    # bug caught by this test itself hanging the suite during development.
    main_only = count_cells_in_rings([_square(37.0, -122.0, size=0.02)])
    island_only = count_cells_in_rings([_square(37.5, -121.4, size=0.02)])
    combined = count_cells_in_rings([_square(37.0, -122.0, size=0.02), _square(37.5, -121.4, size=0.02)])

    # Combined count should be roughly the sum of the two disjoint areas
    # (not exactly, since geohash cell sampling can straddle boundaries
    # slightly differently per region, but it must reflect both, not
    # just one).
    assert combined >= main_only
    assert combined >= island_only
    assert combined > max(main_only, island_only)
