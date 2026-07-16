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
