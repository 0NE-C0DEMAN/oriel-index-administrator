from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from analytics.tier1_fv_engine import (
    CurveMethod,
    build_curve_construction_result,
    resolve_curve_method,
    smooth_reference_curve,
)


def _sample_curve() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "target_month": pd.to_datetime(["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"]),
            "days_from_valuation": [30, 60, 90, 120],
            "expected_yoy_pct": [2.40, 2.55, 2.65, 2.80],
            "index_level": [100.0, 100.2, 100.4, 100.7],
            "std_dev_pct": [0.20, 0.22, 0.23, 0.25],
            "source": ["Oriel Blend"] * 4,
            "kalshi_weight": [0.55] * 4,
            "forecastex_weight": [0.45] * 4,
            "publishable": [True] * 4,
        }
    )


def test_resolve_curve_method_no_fallback():
    meta = resolve_curve_method(CurveMethod.LIQUIDITY_WEIGHTED_MONOTONE_LINEAR)

    assert meta.requested_method == "liquidity_weighted_monotone_linear"
    assert meta.resolved_method == "liquidity_weighted_monotone_linear"
    assert meta.fallback_applied is False
    assert meta.fallback_reason is None
    assert meta.to_dict()["fallback_applied"] is False


def test_resolve_curve_method_unknown_falls_back_to_default():
    meta = resolve_curve_method("future_monotone_spline")

    assert meta.requested_method == "future_monotone_spline"
    assert meta.resolved_method == "liquidity_weighted_monotone_linear"
    assert meta.fallback_applied is True
    assert "future_monotone_spline" in str(meta.fallback_reason)


def test_resolve_curve_method_spline_is_registered():
    meta = resolve_curve_method(CurveMethod.LIQUIDITY_WEIGHTED_MONOTONE_SPLINE)

    assert meta.requested_method == "liquidity_weighted_monotone_spline"
    assert meta.resolved_method == "liquidity_weighted_monotone_spline"
    assert meta.fallback_applied is False
    assert meta.fallback_reason is None


def test_curve_construction_result_preserves_legacy_curve_output():
    curve = _sample_curve()
    result = build_curve_construction_result(
        curve,
        requested_method="liquidity_weighted_monotone_linear",
        fv_horizon_days=90,
    )

    pd.testing.assert_frame_equal(result.curve, curve)
    assert result.anchors.equals(curve)
    assert result.spot_index == 100.0
    assert result.fair_value_index == 100.4
    assert result.snapshot is not None
    assert result.requested_method == "liquidity_weighted_monotone_linear"
    assert result.resolved_method == "liquidity_weighted_monotone_linear"
    assert result.fallback_applied is False
    assert result.fallback_reason is None
    assert result.diagnostics.input_anchor_count == len(curve)
    assert result.diagnostics.source_labels == ["Oriel Blend"]


def test_curve_diagnostics_export_surface_compatible_keys():
    result = build_curve_construction_result(_sample_curve())
    diagnostics = result.diagnostics.to_surface_diagnostics()

    assert diagnostics["method_requested"] == "liquidity_weighted_monotone_linear"
    assert diagnostics["method_used"] == "liquidity_weighted_monotone_linear"
    assert diagnostics["fallback_applied"] is False
    assert diagnostics["fallback_reason"] is None
    assert diagnostics["input_points"] == 4
    assert diagnostics["source_count"] == 1
    assert diagnostics["source_labels"] == ["Oriel Blend"]


def test_smoothing_fallback_metadata_is_exposed_for_sparse_curve():
    sparse = _sample_curve().iloc[:3].copy()
    smoothed, smoothing = smooth_reference_curve(sparse)
    result = build_curve_construction_result(
        smoothed,
        anchors=sparse,
        smoothing_diagnostics=smoothing,
        fv_horizon_days=90,
    )

    assert smoothing.method_requested == "liquidity_weighted_monotone_linear"
    assert smoothing.method_used == "nelson_siegel_proxy"
    assert smoothing.fallback_applied is True
    assert smoothing.fallback_reason is not None
    assert result.resolved_method == "nelson_siegel_proxy"
    assert result.fallback_applied is True
    assert result.diagnostics.input_anchor_count == len(sparse)


def test_spline_smoothing_uses_registered_method_on_well_formed_curve():
    smoothed, smoothing = smooth_reference_curve(
        _sample_curve(),
        method=CurveMethod.LIQUIDITY_WEIGHTED_MONOTONE_SPLINE.value,
    )

    assert smoothing.method_requested == "liquidity_weighted_monotone_spline"
    assert smoothing.method_used == "liquidity_weighted_monotone_spline"
    assert smoothing.fallback_applied is False
    assert smoothing.fallback_reason is None
    assert np.isfinite(smoothed["expected_yoy_pct"].to_numpy(dtype=float)).all()
    assert (np.diff(smoothed["expected_yoy_pct"].to_numpy(dtype=float)) >= -1e-10).all()


def test_spline_smoothing_falls_back_to_monotone_linear_for_sparse_curve():
    sparse = _sample_curve().iloc[:2].copy()
    _, smoothing = smooth_reference_curve(
        sparse,
        method=CurveMethod.LIQUIDITY_WEIGHTED_MONOTONE_SPLINE.value,
    )

    assert smoothing.method_requested == "liquidity_weighted_monotone_spline"
    assert smoothing.method_used == "liquidity_weighted_monotone_linear"
    assert smoothing.fallback_applied is True
    assert smoothing.fallback_reason is not None
    assert "Spline fallback" in smoothing.fallback_reason


def test_spline_endpoint_handles_flat_then_steep_curve_without_overshoot():
    """PCHIP endpoint safeguards (de Boor / scipy form) keep the spline
    representation monotone and bounded even when the data is nearly flat
    on one side and steeply rising on the other - the worst case for a
    naive ``tangent = delta`` endpoint formula."""
    pathological = pd.DataFrame(
        {
            "target_month": pd.to_datetime(["2026-01-01", "2026-01-15", "2026-02-01"]),
            "days_from_valuation": [0, 14, 28],
            "expected_yoy_pct": [2.00, 2.01, 5.00],
            "index_level": [100.0, 100.01, 105.0],
            "std_dev_pct": [0.2, 0.2, 0.5],
        }
    )

    smoothed, smoothing = smooth_reference_curve(
        pathological,
        method=CurveMethod.LIQUIDITY_WEIGHTED_MONOTONE_SPLINE.value,
    )

    # Spline path should succeed - shape validator must not reject this curve
    # under PCHIP endpoints (the simpler tangents[0]=delta[0] formula would
    # be at risk of near-boundary overshoot on this shape).
    assert smoothing.method_used == "liquidity_weighted_monotone_spline"
    assert smoothing.fallback_applied is False

    # Returned anchor row values stay within the input bounds and remain
    # monotone increasing - the contract the spline path promises.
    vals = smoothed["expected_yoy_pct"].to_numpy(dtype=float)
    assert vals[0] >= 2.00 - 1e-9
    assert vals[-1] <= 5.00 + 1e-9
    assert (np.diff(vals) >= -1e-10).all()
