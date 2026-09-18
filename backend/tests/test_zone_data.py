"""Tests for zone_data.py's prompt formatting — tier ordering, permit
filtering, and Tier 3 caps. Pure functions, no external calls."""

from app.services import zone_data


def test_tier_1_sections_appear_before_tier_3_sections():
    data = {
        "police_incidents": [{"category": "Theft", "description": "Bike stolen"}],
        "landmarks": [{"name": "Old City Hall", "description": "Built in 1899"}],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert formatted.index("HISTORIC LANDMARKS") < formatted.index("POLICE INCIDENTS")


def test_routine_permit_is_excluded_but_construction_permit_is_kept():
    data = {
        "building_permits": [
            {"description": "Replace fire sprinkler heads throughout building", "block": "3512"},
            {"description": "Erect type 1 four-story mixed-use building", "block": "3512"},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "sprinkler" not in formatted.lower()
    assert "erect type 1" in formatted.lower()


def test_tier_3_sources_are_capped_at_three_even_with_more_raw_items():
    data = {
        "police_incidents": [{"category": f"Incident {i}"} for i in range(8)],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)
    incident_lines = [line for line in formatted.splitlines() if line.startswith("- category:")]

    assert len(incident_lines) == 3


def test_city_complaints_311_data_reaches_the_formatted_output():
    data = {
        "city_complaints_311": [
            {"complaint_type": "Noise", "descriptor": "Loud music", "created_date": "2026-01-01"},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "311 COMPLAINTS" in formatted
    assert "Noise" in formatted


def test_old_city_311_key_no_longer_used():
    # Regression guard: the formatters dict used to look up "city_311",
    # which the fetch loop never actually produces (the real key is
    # "city_complaints_311") — silently dropping other-city 311 data.
    data = {"city_311": [{"complaint_type": "Noise"}]}

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "No specific data found" in formatted


def test_empty_zone_data_returns_fallback_message():
    formatted = zone_data.format_zone_data_for_prompt({})

    assert formatted == "No specific data found for this location from public databases."


def test_dark_side_promotes_police_and_fire_ahead_of_tier_1_with_relaxed_cap():
    data = {
        "landmarks": [{"name": "Old City Hall", "description": "Built in 1899"}],
        "police_incidents": [{"category": f"Incident {i}"} for i in range(8)],
    }

    default_formatted = zone_data.format_zone_data_for_prompt(data)
    dark_side_formatted = zone_data.format_zone_data_for_prompt(data, mode="dark_side")

    # Default (no mode / any non-promoting mode): Tier 1 leads, police capped at 3.
    assert default_formatted.index("HISTORIC LANDMARKS") < default_formatted.index("POLICE INCIDENTS")
    default_incidents = [l for l in default_formatted.splitlines() if l.startswith("- category:")]
    assert len(default_incidents) == 3

    # dark_side: police jumps ahead of Tier 1, and the cap relaxes to 8.
    assert dark_side_formatted.index("POLICE INCIDENTS") < dark_side_formatted.index("HISTORIC LANDMARKS")
    dark_side_incidents = [l for l in dark_side_formatted.splitlines() if l.startswith("- category:")]
    assert len(dark_side_incidents) == 8


def test_hidden_city_promotes_311_but_still_suppresses_permits():
    data = {
        "landmarks": [{"name": "Old City Hall", "description": "Built in 1899"}],
        "complaints_311": [
            {"category": "Noise", "descriptor": f"Complaint {i}", "opened": "2024-01-01"}
            for i in range(8)
        ],
        "building_permits": [
            {"description": "Erect type 1 four-story mixed-use building", "block": "3512"},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data, mode="hidden_city")

    # 311 complaints promoted ahead of Tier 1, with the relaxed cap.
    assert formatted.index("311 COMPLAINTS") < formatted.index("HISTORIC LANDMARKS")
    complaint_lines = [l for l in formatted.splitlines() if l.startswith("- [2024-01-01] Noise:")]
    assert len(complaint_lines) == 8

    # Permits are never promoted, even for hidden_city — still last, still tight cap.
    assert formatted.index("HISTORIC LANDMARKS") < formatted.index("BUILDING PERMITS")


def test_behind_scenes_gets_no_promotion_same_as_default():
    data = {
        "landmarks": [{"name": "Old City Hall", "description": "Built in 1899"}],
        "police_incidents": [{"category": f"Incident {i}"} for i in range(8)],
    }

    default_formatted = zone_data.format_zone_data_for_prompt(data)
    behind_scenes_formatted = zone_data.format_zone_data_for_prompt(data, mode="behind_scenes")

    assert default_formatted == behind_scenes_formatted


# --- pick_suggested_next ---
# 0.0001 degrees of latitude is ~11m; 0.0005 is ~56m — comfortably on
# either side of _SUGGESTED_NEXT_MIN_DISTANCE_M (15m), so these don't
# depend on exact floating-point boundary behavior.
ORIGIN_LAT, ORIGIN_LNG = 37.7749, -122.4194


def test_picks_the_closest_qualifying_item_across_wikipedia_and_osm():
    data = {
        "wikipedia": [
            {"title": "Far Wikipedia Article", "lat": ORIGIN_LAT + 0.001, "lng": ORIGIN_LNG},
        ],
        "osm_buildings": [
            {"name": "Near OSM Building", "lat": ORIGIN_LAT + 0.0005, "lng": ORIGIN_LNG},
        ],
    }

    result = zone_data.pick_suggested_next(data, ORIGIN_LAT, ORIGIN_LNG)

    assert result["name"] == "Near OSM Building"
    assert result["lat"] == ORIGIN_LAT + 0.0005
    assert result["lng"] == ORIGIN_LNG


def test_excludes_items_too_close_to_origin():
    data = {
        "wikipedia": [
            {"title": "Practically The Same Spot", "lat": ORIGIN_LAT + 0.0001, "lng": ORIGIN_LNG},
        ],
    }

    assert zone_data.pick_suggested_next(data, ORIGIN_LAT, ORIGIN_LNG) is None


def test_excludes_items_missing_a_coordinate():
    data = {
        "wikipedia": [{"title": "No Coordinates On File", "lat": None, "lng": None}],
        "osm_buildings": [{"name": "Also Missing"}],
    }

    assert zone_data.pick_suggested_next(data, ORIGIN_LAT, ORIGIN_LNG) is None


def test_excludes_items_missing_a_name():
    data = {
        "osm_buildings": [{"name": "", "lat": ORIGIN_LAT + 0.0005, "lng": ORIGIN_LNG}],
    }

    assert zone_data.pick_suggested_next(data, ORIGIN_LAT, ORIGIN_LNG) is None


def test_ignores_sources_other_than_wikipedia_and_osm_buildings():
    # Even if some other source happened to carry lat/lng, it's not
    # considered -- only the two sources known to have real per-item
    # coordinates are looked at.
    data = {
        "wikidata": [{"name": "Should Be Ignored", "lat": ORIGIN_LAT + 0.0005, "lng": ORIGIN_LNG}],
    }

    assert zone_data.pick_suggested_next(data, ORIGIN_LAT, ORIGIN_LNG) is None


def test_returns_none_for_empty_zone_data():
    assert zone_data.pick_suggested_next({}, ORIGIN_LAT, ORIGIN_LNG) is None


# --- New global sources: weather_history, musicbrainz_artists, open_library_books ---

def test_weather_history_is_framed_as_last_year_not_current_conditions():
    data = {
        "weather_history": [
            {"date": "2025-09-13", "high_c": 21.4, "low_c": 12.1, "precip_mm": 0.0},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "WEATHER HERE, ONE YEAR AGO TODAY" in formatted
    assert "One year ago today (2025-09-13)" in formatted
    assert "21.4" in formatted
    assert "no rain" in formatted


def test_weather_history_reports_rain_amount_when_nonzero():
    data = {"weather_history": [{"date": "2025-09-13", "high_c": 18.0, "low_c": 9.0, "precip_mm": 4.2}]}

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "4.2mm of rain" in formatted


def test_weather_history_empty_list_produces_no_section():
    formatted = zone_data.format_zone_data_for_prompt({"weather_history": []})

    assert "WEATHER HERE" not in formatted


def test_musicbrainz_artists_reach_the_formatted_output():
    data = {
        "musicbrainz_artists": [
            {"name": "Maze", "type": "Group", "disambiguation": "US funk/disco group", "begin": "1976"},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "MUSICIANS TIED TO THIS CITY" in formatted
    assert "Maze" in formatted
    assert "active since 1976" in formatted


def test_open_library_books_reach_the_formatted_output():
    data = {
        "open_library_books": [
            {"title": "The Phantom of the Opera", "author": "Gaston Leroux", "year": 1910},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "BOOKS SET IN THIS CITY" in formatted
    assert "The Phantom of the Opera" in formatted
    assert "Gaston Leroux" in formatted


def test_osm_formatter_renders_shop_and_restaurant_tags():
    data = {
        "osm_buildings": [
            {"type": "node", "name": "Corner Bakery", "shop": "bakery"},
            {"type": "node", "name": "Le Petit Cafe", "amenity": "cafe", "cuisine": "french"},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "shop: bakery" in formatted
    assert "cafe (french)" in formatted


# --- New sources: Smithsonian, Library of Congress, NYT, US Census ---

def test_smithsonian_reaches_the_formatted_output():
    data = {
        "smithsonian": [
            {"title": "San Francisco civic art collection", "date": "1989", "topic": "Public art"},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "SMITHSONIAN ARCHIVE MENTIONS" in formatted
    assert "San Francisco civic art collection" in formatted
    assert "1989" in formatted
    assert "Public art" in formatted


def test_library_of_congress_reaches_the_formatted_output():
    data = {
        "library_of_congress": [
            {"title": "Lombard Street, San Francisco", "date": "1987"},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "LIBRARY OF CONGRESS ARCHIVE" in formatted
    assert "Lombard Street, San Francisco" in formatted
    assert "1987" in formatted


def test_nyt_articles_reach_the_formatted_output():
    data = {
        "nyt_articles": [
            {"headline": "A Walk Down Lombard Street", "date": "1995-04-12"},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "NEW YORK TIMES COVERAGE" in formatted
    assert "A Walk Down Lombard Street" in formatted
    assert "1995-04-12" in formatted


def test_us_census_reaches_the_formatted_output():
    data = {
        "us_census": [
            {"county": "San Francisco County", "population": "873965", "median_income": "126187", "median_age": "38.5"},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "CENSUS SNAPSHOT FOR THIS COUNTY" in formatted
    assert "San Francisco County" in formatted
    assert "population 873965" in formatted
    assert "median household income $126187" in formatted


def test_elevation_reaches_the_formatted_output():
    data = {"elevation": [{"meters": 67}]}

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "ELEVATION AT THIS SPOT" in formatted
    assert "67 meters above sea level" in formatted


def test_elevation_empty_list_produces_no_section():
    formatted = zone_data.format_zone_data_for_prompt({"elevation": []})

    assert "ELEVATION AT THIS SPOT" not in formatted


# --- New sources: OpenHistoricalMap, Chronicling America, DPLA ---

def test_openhistoricalmap_reaches_the_formatted_output():
    data = {
        "openhistoricalmap": [
            {"name": "Childs Restaurant", "kind": "restaurant", "start_date": "1930",
             "end_date": "", "source": "1930 G.W. Bromley & Co. map of Manhattan"},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "DATED HISTORICAL FEATURES (OpenHistoricalMap)" in formatted
    assert "Childs Restaurant" in formatted
    assert "(restaurant), 1930" in formatted
    assert "[source: 1930 G.W. Bromley & Co. map of Manhattan]" in formatted


def test_openhistoricalmap_shows_a_date_span_when_an_end_date_exists():
    data = {"openhistoricalmap": [{"name": "Grand Hotel", "start_date": "1930", "end_date": "1955"}]}

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "1930-1955" in formatted


def test_chronicling_america_reaches_the_formatted_output():
    data = {
        "chronicling_america": [
            {"title": "The San Francisco Call", "date": "1903-10-25", "newspaper": "the san francisco call"},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "HISTORIC NEWSPAPER COVERAGE (Chronicling America)" in formatted
    assert "The San Francisco Call" in formatted
    assert "1903-10-25" in formatted


def test_dpla_reaches_the_formatted_output():
    data = {
        "dpla": [
            {"title": "Polk Street streetcar, 1912", "date": "1912", "provider": "California Digital Library"},
        ],
    }

    formatted = zone_data.format_zone_data_for_prompt(data)

    assert "DIGITIZED ARCHIVE ITEMS (DPLA)" in formatted
    assert "Polk Street streetcar, 1912" in formatted
    assert "California Digital Library" in formatted
