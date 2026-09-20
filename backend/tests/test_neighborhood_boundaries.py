"""
Tests for the offline neighborhood-boundary mapping script's pure math --
point_in_polygon and count_cells_in_polygon. Never touches Overpass,
OpenAI, or Supabase; those are exercised only by actually running the
script (see its own module docstring on reviewing the printed summary).
"""

from scripts.map_neighborhood_boundaries import point_in_polygon, count_cells_in_polygon

# A simple ~300m x 300m square, comfortably north of the equator so lat/lng
# degrees aren't near any wraparound edge case.
SQUARE = [
    {"lat": 37.7700, "lng": -122.4200},
    {"lat": 37.7700, "lng": -122.4160},
    {"lat": 37.7730, "lng": -122.4160},
    {"lat": 37.7730, "lng": -122.4200},
]


def test_a_point_clearly_inside_the_polygon_is_inside():
    assert point_in_polygon(37.7715, -122.4180, SQUARE) is True


def test_a_point_clearly_outside_the_polygon_is_outside():
    assert point_in_polygon(37.8000, -122.4180, SQUARE) is False
    assert point_in_polygon(37.7715, -122.5000, SQUARE) is False


def test_counts_a_real_positive_number_of_cells_for_a_real_sized_polygon():
    # The square above is roughly 2 geohash-7 cells (~153m each) per side,
    # so a handful of real cells' centers should fall inside it.
    count = count_cells_in_polygon(SQUARE)
    assert count > 0
    assert count < 50  # sanity bound -- this must never explode into thousands


def test_counts_zero_for_a_degenerate_near_zero_area_polygon():
    tiny = [
        {"lat": 37.7700, "lng": -122.4200},
        {"lat": 37.7700, "lng": -122.42000001},
        {"lat": 37.77000001, "lng": -122.42000001},
    ]
    assert count_cells_in_polygon(tiny) == 0
