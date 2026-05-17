"""
blended_curve.py — Run v7's analytics pipelines verbatim and serialize the
results for injection into the React app:
    window.__BLENDED_CPI__   = { parentCurve, venueComparison }
    window.__VOL_SURFACE__   = { summary, impliedVol, scenarioGrid,
                                  componentSurface, valuationDateIso }

Why: the redesign mandate was to keep v7's logic intact and only redesign the
UI. Re-implementing v7's binary-IV inversion / PMF / scenario grid / venue
diagnostics in engine.js produced subtle numerical drift (TTM rounding, sigma
flooring, normal-CDF approximation, fallback paths). To eliminate any drift,
we import v7's analytics modules and call them directly here, then ship the
results to the React app. React just renders.

We import v7 functions verbatim and feed them v7's static CSVs:
    data/kalshi_constituents_current.csv
    data/forecastex_constituents_current.csv

Plus v7's sample CPI snapshots (sample_data.CPI_SNAPSHOTS) for the surface
inputs. Vol surface valuation date is pinned to 2026-01-18 to match the
state captured in v7's published demo screenshots.
"""
from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# Add v7's package root to sys.path so we can import its analytics modules.
_V7_ROOT = (Path(__file__).resolve().parent.parent / "oriel_demo_v7").resolve()
if str(_V7_ROOT) not in sys.path:
    sys.path.insert(0, str(_V7_ROOT))


import functools
import os


@functools.lru_cache(maxsize=1)
def _fetch_live_snapshots_cached():
    """Process-level cache wrapper around build_live_cpi_feed. Both
    blended_curve._build_blended() and live_kalshi.fetch_live_cpi() call
    this so we hit Kalshi REST exactly once per process. Streamlit's
    @st.cache_data wraps the outer payload functions for cross-rerun cache;
    this lru_cache prevents the within-rerun duplication.

    Returns (snapshots, contracts_table, methodology, stats) or (None,)*4."""
    if os.getenv("ORIEL_DISABLE_LIVE_CPI", "").lower() in ("1", "true", "yes"):
        return None, None, None, None
    try:
        from venues.kalshi.live_data import build_live_cpi_feed, LiveFeedConfig
        from venues.kalshi.client   import KalshiPublicClient, KalshiClientConfig
    except Exception as ex:
        logger.warning("Live snapshots: import failed (%s)", ex)
        return None, None, None, None
    try:
        client = KalshiPublicClient(config=KalshiClientConfig(timeout_seconds=15.0))
        methodology, snapshots, contracts_table, stats = build_live_cpi_feed(
            config=LiveFeedConfig(),
            client=client,
        )
        return snapshots, contracts_table, methodology, stats
    except Exception as ex:
        logger.warning("Live snapshots: fetch failed (%s)", ex)
        return None, None, None, None


def _fetch_live_snapshots():
    """Public alias — delegates to the process-level cached fetcher."""
    return _fetch_live_snapshots_cached()


def _build_blended() -> Optional[Dict[str, Any]]:
    """Run the v7 blend pipeline on the static CSV constituents. Returns a
    dict with `parentCurve` and `venueComparison` rows, or None on failure."""
    try:
        import pandas as pd
        from analytics.tier1_fv_engine import (
            apply_microstructure_filters,
            blend_curves,
            build_forecastex_curve_from_constituents,
            build_kalshi_curve_from_constituents,
            compute_governed_blend_weights,
            compute_venue_weight_diagnostics,
            load_tier1_constituents,
            smooth_reference_curve,
        )
        from analytics.cpi_basis_diagnostics import build_diagnostics
    except Exception as ex:
        logger.warning("Blended curve: failed to import v7 modules (%s)", ex)
        return None

    data_dir = _V7_ROOT / "data"
    kalshi_csv = data_dir / "kalshi_constituents_current.csv"
    forecastex_csv = data_dir / "forecastex_constituents_current.csv"
    if not (kalshi_csv.exists() and forecastex_csv.exists()):
        logger.warning("Blended curve: CSV files missing in %s", data_dir)
        return None

    try:
        kalshi = apply_microstructure_filters(
            load_tier1_constituents(kalshi_csv), "Kalshi"
        )
        forecastex = apply_microstructure_filters(
            load_tier1_constituents(forecastex_csv), "ForecastEx"
        )
        kalshi_curve = build_kalshi_curve_from_constituents(kalshi)
        forecastex_curve = build_forecastex_curve_from_constituents(forecastex)
        k_diag = compute_venue_weight_diagnostics(
            "Kalshi", 0.55, kalshi, kalshi_curve
        )
        f_diag = compute_venue_weight_diagnostics(
            "ForecastEx", 0.45, forecastex, forecastex_curve
        )
        k_w, f_w = compute_governed_blend_weights(k_diag, f_diag)
        blended, _ = blend_curves(
            kalshi_curve, forecastex_curve, k_w, f_w, k_diag.eligible, f_diag.eligible
        )
        blended, _ = smooth_reference_curve(
            blended, pd.concat([kalshi, forecastex], ignore_index=True)
        )
        diagnostics = build_diagnostics(kalshi, forecastex)
    except Exception as ex:
        logger.warning("Blended curve: pipeline failed (%s)", ex)
        return None

    # Serialize the smoothed blended parent_curve. Vol surface engine looks
    # up `expected_yoy_pct` per maturity; we also include `std_dev_pct` for
    # the curve-std fallback path and `index_level` for completeness.
    parent_curve_rows: List[Dict[str, Any]] = []
    for _, row in blended.iterrows():
        target_month = row["target_month"]
        # pandas Timestamp → ISO date string
        try:
            tm_iso = target_month.date().isoformat()
            tm_label = target_month.strftime("%b %y")
        except Exception:
            tm_iso = str(target_month)
            tm_label = str(target_month)
        parent_curve_rows.append({
            "targetMonth":       tm_label,
            "targetMonthIso":    tm_iso,
            "daysFromValuation": int(row["days_from_valuation"]),
            "expectedYoyPct":    float(row["expected_yoy_pct"]),
            "indexLevel":        float(row["index_level"]),
            "stdDevPct":         float(row["std_dev_pct"]),
        })

    # Serialize venue_comparison rows for the Venue Dispersion tab.
    venue_rows: List[Dict[str, Any]] = []
    for _, row in diagnostics.venue_comparison.iterrows():
        target_month = row["target_month"]
        try:
            tm_iso = target_month.date().isoformat()
            tm_label = target_month.strftime("%b %y")
        except Exception:
            tm_iso = str(target_month)
            tm_label = str(target_month)
        venue_rows.append({
            "targetMonth":        tm_label,
            "targetMonthIso":     tm_iso,
            "daysFromValuation":  int(row["days_from_valuation"]),
            "absCurveDiffBp":     float(row.get("abs_curve_diff_bp") or 0.0),
            "avgConfidenceScore": float(row.get("avg_confidence_score") or 0.0),
            "avgSpreadBp":        float(row.get("avg_spread_bp") or 0.0),
            "liquidityFlag":      str(row.get("liquidity_flag") or "Healthy"),
        })

    # ── Vol surface (v7's build_vol_surface_artifacts, called verbatim) ───
    # v7's published demo runs in live mode at val_date=date.today(). Match
    # that exactly: try live Kalshi snapshots first, fall back to sample.
    import datetime as _dt
    vol_surface_live: Optional[Dict[str, Any]] = None
    vol_surface_sample: Optional[Dict[str, Any]] = None
    try:
        from analytics.vol_surface_engine import build_vol_surface_artifacts
        from sample_data import CPI_SNAPSHOTS

        # LIVE variant — what v7's published demo at default toggle shows.
        live_snaps, _ct, _mm, _stats = _fetch_live_snapshots()
        if live_snaps:
            vol_val_live = pd.Timestamp(_dt.date.today())
            try:
                artifacts = build_vol_surface_artifacts(
                    live_snaps,
                    blended,
                    vol_val_live,
                    diagnostics.venue_comparison,
                )
                vol_surface_live = _serialize_vol_artifacts(artifacts, vol_val_live)
            except Exception as ex:
                logger.warning("Vol surface (live) build failed (%s)", ex)

        # SAMPLE variant — for the off-toggle position (uses static sample).
        try:
            vol_val_sample = pd.Timestamp(_dt.date.today())
            artifacts = build_vol_surface_artifacts(
                CPI_SNAPSHOTS,
                blended,
                vol_val_sample,
                diagnostics.venue_comparison,
            )
            vol_surface_sample = _serialize_vol_artifacts(artifacts, vol_val_sample)
        except Exception as ex:
            logger.warning("Vol surface (sample) build failed (%s)", ex)
    except Exception as ex:
        logger.warning("Blended curve: vol surface init failed (%s)", ex)

    # The "default" volSurface is the live one when available, else sample.
    # indices.js / IndexDetailView's live toggle picks between the two.
    return {
        "parentCurve": parent_curve_rows,
        "venueComparison": venue_rows,
        "volSurface":       vol_surface_live or vol_surface_sample,
        "volSurfaceLive":   vol_surface_live,
        "volSurfaceSample": vol_surface_sample,
    }


def _serialize_vol_artifacts(artifacts, valuation_date) -> Dict[str, Any]:
    """Convert v7's VolSurfaceArtifacts dataclass + DataFrames into the
    JSON-friendly shape our React VolSurfacePanel expects (camelCase
    columns matching engine.js's output)."""
    import pandas as pd

    def _ts_to_label(ts):
        try:
            return pd.Timestamp(ts).strftime("%b %y")
        except Exception:
            return str(ts)

    def _ts_to_iso(ts):
        try:
            return pd.Timestamp(ts).date().isoformat()
        except Exception:
            return str(ts)

    # v7's build_binary_implied_vol_surface columns:
    #   target_month, days_from_valuation, parent_forward_pct,
    #   atm_threshold_pct, atm_contract_price, implied_vol_pct,
    #   vol_source, n_supporting_contracts, ttm_years, confidence_score
    surface_rows: List[Dict[str, Any]] = []
    for _, row in artifacts.implied_vol.iterrows():
        surface_rows.append({
            "targetMonth":           _ts_to_label(row["target_month"]),
            "targetMonthIso":        _ts_to_iso(row["target_month"]),
            "daysFromValuation":     int(row["days_from_valuation"]),
            "parentForwardPct":      float(row["parent_forward_pct"]),
            "atmThresholdPct":       float(row["atm_threshold_pct"]),
            "atmContractPrice":      float(row["atm_contract_price"]),
            "impliedVolPct":         float(row["implied_vol_pct"]),
            "volSource":             str(row["vol_source"]),
            "nSupportingContracts":  int(row["n_supporting_contracts"]),
            "ttmYears":              float(row["ttm_years"]),
            "confidenceScore":       float(row["confidence_score"]),
        })

    # scenario_grid columns: target_month, days_from_valuation,
    #   forward_shift_bp, vol_multiplier, scenario_forward_pct,
    #   scenario_vol_pct, scenario_event_price
    scenario_rows: List[Dict[str, Any]] = []
    for _, row in artifacts.scenario_grid.iterrows():
        scenario_rows.append({
            "targetMonth":         _ts_to_label(row["target_month"]),
            "daysFromValuation":   int(row["days_from_valuation"]),
            "forwardShiftBp":      float(row["forward_shift_bp"]),
            "volMultiplier":       float(row["vol_multiplier"]),
            "scenarioForwardPct":  float(row["scenario_forward_pct"]),
            "scenarioVolPct":      float(row["scenario_vol_pct"]),
            "scenarioEventPrice":  float(row["scenario_event_price"]),
        })

    # component_surface columns: target_month, days_from_valuation, component,
    #   parent_implied_vol_pct, beta_to_parent, correlation, component_implied_vol_pct
    component_rows: List[Dict[str, Any]] = []
    for _, row in artifacts.component_surface.iterrows():
        component_rows.append({
            "targetMonth":             _ts_to_label(row["target_month"]),
            "daysFromValuation":       int(row["days_from_valuation"]),
            "component":               str(row["component"]),
            "parentImpliedVolPct":     float(row["parent_implied_vol_pct"]),
            "beta":                    float(row["beta_to_parent"]),
            "correlation":             float(row["correlation"]),
            "componentImpliedVolPct":  float(row["component_implied_vol_pct"]),
        })

    # summary keys: front_vol_pct, back_vol_pct, avg_vol_pct,
    #   dispersion_avg_bp, dispersion_peak_bp
    s = artifacts.summary or {}
    summary = {
        "frontVolPct":      _to_float_or_none(s.get("front_vol_pct")),
        "backVolPct":       _to_float_or_none(s.get("back_vol_pct")),
        "avgVolPct":        _to_float_or_none(s.get("avg_vol_pct")),
        "dispersionAvgBp":  _to_float_or_none(s.get("dispersion_avg_bp")),
        "dispersionPeakBp": _to_float_or_none(s.get("dispersion_peak_bp")),
    }

    # Mirror engine.buildVolSurface()'s shape: include venueDispersion
    # (== venue_comparison rows, camelCased) so React's VolSurfacePanel
    # can render the dispersion tab without falling back to the JS proxy.
    venue_disp_rows: List[Dict[str, Any]] = []
    # We don't have direct access to venue_comparison here — caller (the
    # outer _build_blended) already serialised it as `venue_rows`. We
    # leave this empty; indices.js merges venue_rows into d.volSurface.

    return {
        "summary":           summary,
        "impliedVol":        surface_rows,
        "scenarioGrid":      scenario_rows,
        "componentSurface":  component_rows,
        "valuationDateIso":  _ts_to_iso(valuation_date),
    }


def _to_float_or_none(v):
    if v is None:
        return None
    try:
        f = float(v)
        # NaN check
        return None if f != f else f
    except Exception:
        return None


def blended_payload_json() -> str:
    """Return the blended-curve payload as a JSON string (or 'null')."""
    payload = _build_blended()
    if payload is None:
        return "null"
    return json.dumps(payload, separators=(",", ":"))


if __name__ == "__main__":
    # Quick CLI smoke test.
    print(blended_payload_json())
