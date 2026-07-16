"""Tests for costs.py — pure math, no external calls."""

from app.services import costs


def test_r2_cost_is_zero_within_the_free_tier():
    result = costs.estimate_r2_storage_cost(total_mb=5000)  # ~4.9GB, under 10GB free

    assert result["billable_gb"] == 0.0
    assert result["monthly_usd"] == 0.0


def test_r2_cost_bills_only_the_amount_over_the_free_tier():
    # 20GB total -> 10GB billable -> 10 * 0.015 = $0.15
    result = costs.estimate_r2_storage_cost(total_mb=20 * 1024)

    assert result["gb"] == 20.0
    assert result["billable_gb"] == 10.0
    assert result["monthly_usd"] == 0.15


def test_r2_cost_handles_missing_storage_data_without_crashing():
    result = costs.estimate_r2_storage_cost(total_mb=None)

    assert result == {"gb": None, "billable_gb": None, "monthly_usd": None}


def test_cost_summary_includes_untracked_services_explicitly():
    summary = costs.get_cost_summary(total_mb=1000)

    untracked_names = [u["service"] for u in summary["untracked"]]
    assert "OpenAI" in untracked_names
    assert "Google Cloud (TTS + Street View)" in untracked_names
    # Every untracked entry must explain why, not just say "unknown".
    assert all(u["reason"] for u in summary["untracked"])
