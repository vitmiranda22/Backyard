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
