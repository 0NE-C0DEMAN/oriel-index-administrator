from __future__ import annotations

from pathlib import Path

import pandas as pd

from analytics.polymarket_diagnostics import (
    PolymarketEligibilityConfig,
    build_polymarket_eligibility_table,
    build_polymarket_shadow_blend_diagnostics,
    classify_polymarket_reference_eligibility,
)
from analytics.venue_readiness import build_venue_display_status


ROOT = Path(__file__).resolve().parent.parent


def _poly_row(**overrides):
    row = {
        "venue": "Polymarket",
        "release_month": "May 2026",
        "market_id": "poly-cpi-may",
        "question": "Will US CPI YoY be above 3%?",
        "threshold": 3.0,
        "expected_value": 3.05,
        "liquidity_score": 0.75,
        "confidence_score": 72.0,
        "quote_age_seconds": 120,
    }
    row.update(overrides)
    return row


def _governed_curve():
    return pd.DataFrame({
        "target_month": pd.to_datetime(["2026-05-01"]),
        "days_from_valuation": [30],
        "expected_yoy_pct": [2.50],
    })


def test_live_low_coverage_maps_to_review_not_not_eligible():
    technical_publishable = False
    status = build_venue_display_status(
        venue="ForecastEx",
        source_status="LIVE",
        publishable=technical_publishable,
        constituent_count=1,
        comparable_row_count=1,
    )

    assert technical_publishable is False
    assert status.signal_status == "Live Signal"
    assert status.reference_readiness == "Coverage Review"
    assert status.trade_use == "Included in dislocation analysis"
    assert "Not eligible" not in status.reference_readiness


def test_zero_comparable_rows_maps_to_not_enough_data():
    status = build_venue_display_status(
        venue="Polymarket",
        source_status="LIVE",
        publishable=False,
        constituent_count=2,
        comparable_row_count=0,
    )

    assert status.signal_status == "Live Signal"
    assert status.trade_use == "Not enough comparable data"


def test_forecastex_and_polymarket_tabs_do_not_headline_publishability_failure():
    fx = (ROOT / "tabs" / "forecastex_tab.py").read_text(encoding="utf-8")
    poly = (ROOT / "tabs" / "polymarket_tab.py").read_text(encoding="utf-8")

    for source in (fx, poly):
        assert "Signal Status" in source
        assert "Reference Readiness" in source
        assert "Trade Use" in source
        assert "<div class='kpi-micro'>Publishability</div>" not in source
        assert "Unpublished" not in source

    assert "Polymarket is normalized as part of the CPI signal stack" in poly
    assert "Not eligible for Oriel publication" not in poly


def test_polymarket_eligible_row_passes():
    result = classify_polymarket_reference_eligibility(_poly_row())

    assert result["eligible"] is True
    assert result["reason_codes"] == ["passes_current_screen"]


def test_polymarket_missing_implied_yoy_fails():
    result = classify_polymarket_reference_eligibility(_poly_row(expected_value=None))

    assert result["eligible"] is False
    assert "missing_threshold_or_normalization" in result["reason_codes"]


def test_polymarket_missing_release_month_fails():
    result = classify_polymarket_reference_eligibility(_poly_row(release_month=None))

    assert result["eligible"] is False
    assert "maturity_not_aligned" in result["reason_codes"]


def test_polymarket_low_liquidity_fails():
    result = classify_polymarket_reference_eligibility(_poly_row(liquidity_score=0.05))

    assert result["eligible"] is False
    assert "insufficient_liquidity" in result["reason_codes"]


def test_polymarket_low_confidence_fails():
    # Threshold dropped from 40 -> 5.0 to match real Polymarket distribution
    # (sample fixtures hit ~79; real markets hit ~5-25 due to wider spreads).
    result = classify_polymarket_reference_eligibility(_poly_row(confidence_score=2.0))

    assert result["eligible"] is False
    assert "insufficient_confidence" in result["reason_codes"]


def test_polymarket_stale_quote_fails():
    cfg = PolymarketEligibilityConfig(max_quote_age_seconds=300)
    result = classify_polymarket_reference_eligibility(_poly_row(quote_age_seconds=1200), config=cfg)

    assert result["eligible"] is False
    assert "stale_quote" in result["reason_codes"]


def test_polymarket_multiple_reason_codes_surface():
    result = classify_polymarket_reference_eligibility(
        _poly_row(expected_value=None, liquidity_score=0.0, confidence_score=1.0)
    )

    assert result["eligible"] is False
    assert {"missing_threshold_or_normalization", "insufficient_liquidity", "insufficient_confidence"}.issubset(set(result["reason_codes"]))


def test_non_polymarket_rows_are_not_applicable():
    result = classify_polymarket_reference_eligibility(_poly_row(venue="Kalshi"))

    assert result["eligible"] is False
    assert result["reason_codes"] == ["not_applicable"]


def test_eligibility_table_ignores_non_polymarket_rows():
    table = build_polymarket_eligibility_table([_poly_row(), _poly_row(venue="Kalshi")])

    assert len(table) == 1
    assert bool(table.iloc[0]["eligible"]) is True


def test_polymarket_shadow_default_governed_curve_unchanged():
    governed = _governed_curve()
    out = build_polymarket_shadow_blend_diagnostics(governed, [_poly_row(expected_value=3.00)], polymarket_weight=0.20)
    impact = out["impact_by_maturity"]

    assert governed.loc[0, "expected_yoy_pct"] == 2.50
    assert out["summary"]["default_governed_reference_changed"] is False
    assert impact.loc[0, "current_governed_reference"] == 2.50
    assert impact.loc[0, "polymarket_inclusive_shadow_reference"] == 2.60
    assert impact.loc[0, "curve_shift_bp"] == 10.0


def test_polymarket_shadow_handles_zero_rows():
    out = build_polymarket_shadow_blend_diagnostics(_governed_curve(), [])
    impact = out["impact_by_maturity"]

    assert out["summary"]["status"] == "no_polymarket_rows"
    assert impact.loc[0, "curve_shift_bp"] == 0.0
    assert impact.loc[0, "effective_polymarket_weight"] == 0.0


def test_polymarket_shadow_handles_zero_eligible_rows():
    out = build_polymarket_shadow_blend_diagnostics(_governed_curve(), [_poly_row(expected_value=None)])
    impact = out["impact_by_maturity"]

    assert out["summary"]["status"] == "zero_eligible_polymarket_rows"
    assert impact.loc[0, "curve_shift_bp"] == 0.0
    assert impact.loc[0, "effective_polymarket_weight"] == 0.0


def test_shadow_output_columns_are_display_safe():
    impact = build_polymarket_shadow_blend_diagnostics(_governed_curve(), [_poly_row()])["impact_by_maturity"]

    assert {
        "release_month",
        "current_governed_reference",
        "polymarket_inclusive_shadow_reference",
        "curve_shift_bp",
        "effective_polymarket_weight",
        "eligible_polymarket_row_count",
        "excluded_polymarket_row_count",
        "exclusion_reason_summary",
    }.issubset(impact.columns)


def test_execution_workbench_copy_avoids_overpromising():
    app = (ROOT / "app.py").read_text(encoding="utf-8")

    assert "Venue signals can be used for dislocation analysis before they are promoted" in app
    assert "guaranteed arbitrage" in app
    assert "live order routing" in app
    assert "risk-free arbitrage" not in app.lower()
    assert "routed trade" not in app.lower()
