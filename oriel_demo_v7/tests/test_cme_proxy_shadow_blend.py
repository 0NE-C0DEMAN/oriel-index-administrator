from __future__ import annotations

from pathlib import Path
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from analytics.tier1_fv_engine import (  # noqa: E402
    build_cme_curve_from_constituents,
    build_cme_shadow_blend_diagnostics,
    build_forecastex_curve_from_constituents,
    build_kalshi_curve_from_constituents,
    blend_curves,
    cme_package_to_constituents,
    compute_governed_blend_weights,
    compute_venue_weight_diagnostics,
    load_tier1_constituents,
)
from venues.cme import CMEClient, CMEConfig, normalize_cme_contract, score_and_package  # noqa: E402


DATA_DIR = ROOT / "data"


def _baseline_inputs():
    kalshi = load_tier1_constituents(DATA_DIR / "kalshi_constituents_current.csv")
    forecastex = load_tier1_constituents(DATA_DIR / "forecastex_constituents_current.csv")
    kalshi_curve = build_kalshi_curve_from_constituents(kalshi)
    forecastex_curve = build_forecastex_curve_from_constituents(forecastex)
    kalshi_diag = compute_venue_weight_diagnostics("Kalshi", 0.55, kalshi, kalshi_curve)
    forecastex_diag = compute_venue_weight_diagnostics("ForecastEx", 0.45, forecastex, forecastex_curve)
    kalshi_weight, forecastex_weight = compute_governed_blend_weights(kalshi_diag, forecastex_diag)
    current_curve, meta = blend_curves(
        kalshi_curve,
        forecastex_curve,
        kalshi_weight,
        forecastex_weight,
        kalshi_diag.eligible,
        forecastex_diag.eligible,
    )
    return kalshi, forecastex, kalshi_curve, forecastex_curve, kalshi_diag, forecastex_diag, kalshi_weight, forecastex_weight, current_curve, meta


def _cme_package():
    cfg = CMEConfig(source_mode="proxy")
    contracts, status = CMEClient(cfg).fetch_contracts()
    return score_and_package(contracts, status, cfg), cfg


def test_cme_proxy_mode_resolves_to_proxy_source():
    contracts, status = CMEClient(CMEConfig(source_mode="proxy")).fetch_contracts()
    assert status == "PROXY"
    assert len(contracts) == 4
    assert {contract.source_status for contract in contracts} == {"PROXY"}
    assert all("proxy" in contract.methodology_note.lower() for contract in contracts)


def test_cme_proxy_normalized_rows_include_required_fields_and_direction():
    package, cfg = _cme_package()
    constituents = cme_package_to_constituents(package, config=cfg, valuation_month=pd.Timestamp("2026-04-01"))
    assert {
        "constituent_id",
        "target_month",
        "days_from_valuation",
        "expected_yoy_pct",
        "source_status",
        "normalization_method",
        "direction",
        "threshold",
        "probability",
    }.issubset(constituents.columns)
    june = constituents[constituents["constituent_id"].eq("CME-PROXY-CPI-JUN26-ABOVE-300")].iloc[0]
    assert june["source_status"] == "PROXY"
    assert june["direction"] == "above"
    assert abs(june["expected_yoy_pct"] - 0.5) < 1e-9
    dec = constituents[constituents["direction"].eq("below")].iloc[0]
    assert dec["expected_yoy_pct"] > 0.5


def test_cme_curve_builder_produces_maturity_level_curve_points():
    package, cfg = _cme_package()
    constituents = cme_package_to_constituents(package, config=cfg, valuation_month=pd.Timestamp("2026-04-01"))
    curve = build_cme_curve_from_constituents(constituents)
    assert list(curve["source"].unique()) == ["CME"]
    assert {"target_month", "days_from_valuation", "expected_yoy_pct", "index_level", "std_dev_pct"}.issubset(curve.columns)
    assert len(curve) == 4
    assert curve["days_from_valuation"].is_monotonic_increasing


def test_existing_two_source_governed_blend_remains_unchanged_by_cme_helpers():
    *_, kalshi_curve, forecastex_curve, kalshi_diag, forecastex_diag, kalshi_weight, forecastex_weight, before, before_meta = _baseline_inputs()
    after, after_meta = blend_curves(
        kalshi_curve,
        forecastex_curve,
        kalshi_weight,
        forecastex_weight,
        kalshi_diag.eligible,
        forecastex_diag.eligible,
    )
    pd.testing.assert_frame_equal(before, after)
    assert before_meta == after_meta


def test_cme_shadow_blend_reports_effective_weight_and_curve_shift():
    kalshi, forecastex, kalshi_curve, forecastex_curve, kalshi_diag, forecastex_diag, kalshi_weight, forecastex_weight, current_curve, _ = _baseline_inputs()
    package, cfg = _cme_package()
    cme_constituents = cme_package_to_constituents(package, config=cfg, valuation_month=current_curve["target_month"].min())
    cme_curve = build_cme_curve_from_constituents(cme_constituents)
    result = build_cme_shadow_blend_diagnostics(
        current_curve,
        kalshi_curve,
        forecastex_curve,
        cme_curve,
        kalshi_weight=kalshi_weight,
        forecastex_weight=forecastex_weight,
        kalshi_eligible=kalshi_diag.eligible,
        forecastex_eligible=forecastex_diag.eligible,
        cme_eligible=package.publishable,
        cme_source_status=package.source_status,
        dislocation_constituents=pd.concat([kalshi, forecastex], ignore_index=True),
        smoothing_constituents=pd.concat([kalshi, forecastex, cme_constituents], ignore_index=True),
    )
    assert result.summary.status == "available"
    assert result.metadata.source_eligibility["CME"] is True
    assert result.summary.cme_effective_aggregate_weight_pct > 0
    assert result.summary.avg_abs_curve_shift_bp > 0
    assert "CME" in result.metadata.requested_weights
    assert (result.impact_by_maturity["cme_effective_weight_pct"] > 0).any()


def test_shadow_impact_summary_computes_shift_statistics():
    kalshi, forecastex, kalshi_curve, forecastex_curve, kalshi_diag, forecastex_diag, kalshi_weight, forecastex_weight, current_curve, _ = _baseline_inputs()
    package, cfg = _cme_package()
    cme_constituents = cme_package_to_constituents(package, config=cfg, valuation_month=current_curve["target_month"].min())
    cme_curve = build_cme_curve_from_constituents(
        cme_constituents
    )
    result = build_cme_shadow_blend_diagnostics(
        current_curve,
        kalshi_curve,
        forecastex_curve,
        cme_curve,
        kalshi_weight=kalshi_weight,
        forecastex_weight=forecastex_weight,
        kalshi_eligible=kalshi_diag.eligible,
        forecastex_eligible=forecastex_diag.eligible,
        cme_eligible=True,
        smoothing_constituents=pd.concat([kalshi, forecastex, cme_constituents], ignore_index=True),
    )
    shifts = result.impact_by_maturity["curve_shift_bp"].abs().dropna()
    assert result.summary.avg_abs_curve_shift_bp == round(float(shifts.mean()), 2)
    assert result.summary.max_abs_curve_shift_bp == round(float(shifts.max()), 2)


def test_zero_cme_weight_maturity_has_zero_shift_after_shadow_smoothing():
    kalshi, forecastex, kalshi_curve, forecastex_curve, kalshi_diag, forecastex_diag, kalshi_weight, forecastex_weight, current_curve, _ = _baseline_inputs()
    package, cfg = _cme_package()
    cme_constituents = cme_package_to_constituents(package, config=cfg, valuation_month=current_curve["target_month"].min())
    cme_curve = build_cme_curve_from_constituents(cme_constituents)
    result = build_cme_shadow_blend_diagnostics(
        current_curve,
        kalshi_curve,
        forecastex_curve,
        cme_curve,
        kalshi_weight=kalshi_weight,
        forecastex_weight=forecastex_weight,
        kalshi_eligible=kalshi_diag.eligible,
        forecastex_eligible=forecastex_diag.eligible,
        cme_eligible=True,
        smoothing_constituents=pd.concat([kalshi, forecastex, cme_constituents], ignore_index=True),
    )
    zero_cme = result.impact_by_maturity[result.impact_by_maturity["cme_effective_weight_pct"].eq(0.0)]
    assert not zero_cme.empty
    assert set(zero_cme["curve_shift_bp"].round(8)) == {0.0}


def test_ineligible_cme_proxy_does_not_corrupt_current_governed_curve():
    _, _, kalshi_curve, forecastex_curve, kalshi_diag, forecastex_diag, kalshi_weight, forecastex_weight, current_curve, _ = _baseline_inputs()
    package, cfg = _cme_package()
    cme_curve = build_cme_curve_from_constituents(
        cme_package_to_constituents(package, config=cfg, valuation_month=current_curve["target_month"].min())
    )
    result = build_cme_shadow_blend_diagnostics(
        current_curve,
        kalshi_curve,
        forecastex_curve,
        cme_curve,
        kalshi_weight=kalshi_weight,
        forecastex_weight=forecastex_weight,
        kalshi_eligible=kalshi_diag.eligible,
        forecastex_eligible=forecastex_diag.eligible,
        cme_eligible=False,
    )
    assert result.summary.status == "cme_ineligible"
    pd.testing.assert_frame_equal(result.current_curve.reset_index(drop=True), result.shadow_curve.reset_index(drop=True))
    assert result.summary.avg_abs_curve_shift_bp == 0.0


def test_absent_cme_proxy_reports_unavailable_without_breaking_baseline():
    _, _, kalshi_curve, forecastex_curve, kalshi_diag, forecastex_diag, kalshi_weight, forecastex_weight, current_curve, _ = _baseline_inputs()
    result = build_cme_shadow_blend_diagnostics(
        current_curve,
        kalshi_curve,
        forecastex_curve,
        pd.DataFrame(),
        kalshi_weight=kalshi_weight,
        forecastex_weight=forecastex_weight,
        kalshi_eligible=kalshi_diag.eligible,
        forecastex_eligible=forecastex_diag.eligible,
        cme_eligible=True,
    )
    assert result.summary.status == "unavailable"
    assert result.impact_by_maturity.empty
    pd.testing.assert_frame_equal(current_curve.reset_index(drop=True), result.shadow_curve.reset_index(drop=True))


def test_below_threshold_contract_expected_value_is_direction_aware():
    contract = normalize_cme_contract(
        {
            "contract_id": "CME-PROXY-BELOW",
            "product_code": "CPI-DEC26",
            "event_description": "December 2026 CPI-U YoY will be below 2.75%",
            "reference_month": "2026-12",
            "threshold": "2.75%",
            "direction": "below",
            "bid": "70",
            "ask": "80",
            "volume": "1,000",
            "open_interest": "5,000",
        }
    )
    package = score_and_package([contract], "PROXY", CMEConfig(source_mode="proxy", min_publishable_maturities=1))
    constituents = cme_package_to_constituents(package, config=CMEConfig(source_mode="proxy"), valuation_month=pd.Timestamp("2026-04-01"))
    row = constituents.iloc[0]
    assert row["direction"] == "below"
    assert row["expected_yoy_pct"] < 0.25
