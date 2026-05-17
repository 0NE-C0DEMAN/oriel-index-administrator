"""
perp_data.py — Build the full Tier 1 CPI Basis payload by importing v7's
analytics verbatim (analytics.tier1_fv_engine + analytics.cpi_basis_diagnostics)
and serializing every surface the perp tab renders.

Inputs are STATIC (CSV constituents under v7/data/), so this is fully
deterministic — same as v7's @st.cache_data(ttl=3600). The two user-facing
knobs (FV horizon days, Perp basis bp) are surfaced in the React UI; we ship
the full curve and KPIs at v7's defaults (FV=30d, basis=12bp) and let the
React side recompute when the user moves those inputs.

Mirrors v7 tabs/perp_readiness_tab.py output 1:1.
"""
from __future__ import annotations

import functools
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


_V7_ROOT = (Path(__file__).resolve().parent.parent / "oriel_demo_v7").resolve()
if str(_V7_ROOT) not in sys.path:
    sys.path.insert(0, str(_V7_ROOT))


# ── Defaults that match v7 controls ──────────────────────────────────────
DEFAULT_FV_HORIZON_DAYS = 30
DEFAULT_PERP_BASIS_BP   = 12.0
DEFAULT_DIAG_SPREAD_BP  = 12.0
DEFAULT_DIAG_STALE_MIN  = 15


@functools.lru_cache(maxsize=1)
def _tier1_bundle_cached():
    """v7's _cached_tier1_curves() — kalshi+forecastex constituents + curves
    (current and prior), blended + smoothed, plus venue diagnostics."""
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
    except Exception as ex:
        logger.warning("Tier 1: import failed (%s)", ex)
        return None

    try:
        data_dir = _V7_ROOT / "data"
        kalshi_cur_const = apply_microstructure_filters(
            load_tier1_constituents(data_dir / "kalshi_constituents_current.csv"), "Kalshi"
        )
        forecastex_cur_const = apply_microstructure_filters(
            load_tier1_constituents(data_dir / "forecastex_constituents_current.csv"), "ForecastEx"
        )
        kalshi_pri_const = apply_microstructure_filters(
            load_tier1_constituents(data_dir / "kalshi_constituents_prior.csv"), "Kalshi"
        )
        forecastex_pri_const = apply_microstructure_filters(
            load_tier1_constituents(data_dir / "forecastex_constituents_prior.csv"), "ForecastEx"
        )

        kalshi_curve     = build_kalshi_curve_from_constituents(kalshi_cur_const)
        forecastex_curve = build_forecastex_curve_from_constituents(forecastex_cur_const)
        prior_kalshi_curve     = build_kalshi_curve_from_constituents(kalshi_pri_const)
        prior_forecastex_curve = build_forecastex_curve_from_constituents(forecastex_pri_const)

        cur_k_diag = compute_venue_weight_diagnostics("Kalshi",     0.55, kalshi_cur_const,     kalshi_curve)
        cur_f_diag = compute_venue_weight_diagnostics("ForecastEx", 0.45, forecastex_cur_const, forecastex_curve)
        cur_k_wt, cur_f_wt = compute_governed_blend_weights(cur_k_diag, cur_f_diag)
        pri_k_diag = compute_venue_weight_diagnostics("Kalshi",     0.55, kalshi_pri_const,     prior_kalshi_curve)
        pri_f_diag = compute_venue_weight_diagnostics("ForecastEx", 0.45, forecastex_pri_const, prior_forecastex_curve)
        pri_k_wt, pri_f_wt = compute_governed_blend_weights(pri_k_diag, pri_f_diag)

        cur_blended, cur_meta = blend_curves(
            kalshi_curve, forecastex_curve,
            kalshi_weight=cur_k_wt, forecastex_weight=cur_f_wt,
            kalshi_eligible=cur_k_diag.eligible,
            forecastex_eligible=cur_f_diag.eligible,
        )
        cur_blended, cur_smoothing = smooth_reference_curve(
            cur_blended, pd.concat([kalshi_cur_const, forecastex_cur_const], ignore_index=True)
        )
        pri_blended, pri_meta = blend_curves(
            prior_kalshi_curve, prior_forecastex_curve,
            kalshi_weight=pri_k_wt, forecastex_weight=pri_f_wt,
            kalshi_eligible=pri_k_diag.eligible,
            forecastex_eligible=pri_f_diag.eligible,
        )
        pri_blended, pri_smoothing = smooth_reference_curve(
            pri_blended, pd.concat([kalshi_pri_const, forecastex_pri_const], ignore_index=True)
        )

        return {
            "kalshi_curve":            kalshi_curve,
            "forecastex_curve":        forecastex_curve,
            "current_curve":           cur_blended,
            "prior_curve":             pri_blended,
            "blend_meta":              cur_meta,
            "prior_blend_meta":        pri_meta,
            "kalshi_constituents":     kalshi_cur_const,
            "forecastex_constituents": forecastex_cur_const,
            "kalshi_diag":             cur_k_diag,
            "forecastex_diag":         cur_f_diag,
            "smoothing_diag":          cur_smoothing,
            "prior_smoothing_diag":    pri_smoothing,
        }
    except Exception as ex:
        logger.warning("Tier 1: pipeline failed (%s)", ex)
        return None


def _build_payload(
    fv_horizon_days: int = DEFAULT_FV_HORIZON_DAYS,
    perp_basis_bp:   float = DEFAULT_PERP_BASIS_BP,
    diag_spread_bp:  float = DEFAULT_DIAG_SPREAD_BP,
    diag_stale_min:  int   = DEFAULT_DIAG_STALE_MIN,
) -> Optional[Dict[str, Any]]:
    bundle = _tier1_bundle_cached()
    if bundle is None:
        return None

    try:
        import pandas as pd
        from analytics.tier1_fv_engine import (
            build_tier1_snapshot,
            compute_distribution_metrics,
            compute_blended_reference_points,
            build_venue_freshness_summary,
            build_blended_freshness_summary,
            generate_freshness_commentary,
            compute_weight_calibration_summary,
            compute_enhanced_publishability,
            generate_trade_ideas,
        )
        from analytics.cpi_basis_diagnostics import build_diagnostics
    except Exception as ex:
        logger.warning("Tier 1 hardening: import failed (%s)", ex)
        return None

    cur_curve   = bundle["current_curve"]
    prior_curve = bundle["prior_curve"]
    blend_meta  = bundle["blend_meta"]

    # ── Tier1Snapshot at default FV horizon + basis ─────────────────────
    snap = build_tier1_snapshot(cur_curve, int(fv_horizon_days), float(perp_basis_bp), blend_meta)

    # ── Distribution / blended reference / weight diagnostics / freshness
    k_const = bundle["kalshi_constituents"]
    f_const = bundle["forecastex_constituents"]
    k_curve = bundle["kalshi_curve"]
    f_curve = bundle["forecastex_curve"]

    k_diag        = bundle["kalshi_diag"]
    f_diag        = bundle["forecastex_diag"]
    smoothing_diag = bundle["smoothing_diag"]

    blended_ref_pts = compute_blended_reference_points(cur_curve, k_curve, f_curve)
    k_freshness     = build_venue_freshness_summary(k_const, "Kalshi")
    f_freshness     = build_venue_freshness_summary(f_const, "ForecastEx")
    blend_freshness = build_blended_freshness_summary(k_freshness, f_freshness)
    freshness_commentary = generate_freshness_commentary(blend_freshness)
    weight_calibration   = compute_weight_calibration_summary(k_diag, f_diag)

    enh_pub, enh_conf, enh_score, conf_breakdown = compute_enhanced_publishability(
        cur_curve, blend_meta, k_diag, f_diag, blend_freshness
    )
    snap.publishability_label = enh_pub
    snap.confidence_label     = enh_conf
    snap.confidence_score_pct = enh_score
    trade_ideas = generate_trade_ideas(snap, cur_curve, k_diag, f_diag)

    diag_bundle = build_diagnostics(
        k_const, f_const,
        spread_threshold_bp=float(diag_spread_bp),
        stale_after_min=int(diag_stale_min),
    )

    # ── Serialize ──────────────────────────────────────────────────────
    return {
        "tier1Snapshot":        _serialize_snapshot(snap, fv_horizon_days),
        "currentCurve":         _serialize_curve(cur_curve),
        "priorCurve":           _serialize_curve(prior_curve),
        "kalshiCurve":          _serialize_curve(k_curve),
        "forecastexCurve":      _serialize_curve(f_curve),
        "blendMeta":            _serialize_blend_meta(blend_meta),
        "smoothingDiag":        _serialize_smoothing(smoothing_diag),
        "weightDiagnostics": [
            _serialize_weight_diag(k_diag),
            _serialize_weight_diag(f_diag),
        ],
        "weightCalibration":    weight_calibration,
        "freshness": {
            "venues": [
                _serialize_venue_freshness(k_freshness),
                _serialize_venue_freshness(f_freshness),
            ],
            "blended":    _serialize_blended_freshness(blend_freshness),
            "commentary": freshness_commentary,
        },
        "blendedReferencePoints": [_serialize_ref_pt(p) for p in blended_ref_pts],
        "tradeIdeas": [
            {
                "title":     idea.title,
                "expression":idea.expression,
                "rationale": idea.rationale,
                "trigger":   idea.trigger,
                "riskNote":  idea.risk_note,
            }
            for idea in trade_ideas
        ],
        "confidenceBreakdown":  conf_breakdown,
        "diagnostics":          _serialize_diagnostics(diag_bundle),
        "constituentsIncluded": {
            "kalshi":     int(k_const.get("included_in_curve", pd.Series(dtype=bool)).sum()) if "included_in_curve" in k_const.columns else 0,
            "kalshiTotal":int(len(k_const)),
            "forecastex": int(f_const.get("included_in_curve", pd.Series(dtype=bool)).sum()) if "included_in_curve" in f_const.columns else 0,
            "forecastexTotal": int(len(f_const)),
        },
        "controls": {
            "fvHorizonDays": int(fv_horizon_days),
            "perpBasisBp":   float(perp_basis_bp),
            "diagSpreadBp":  float(diag_spread_bp),
            "diagStaleMin":  int(diag_stale_min),
        },
    }


# ── Per-object serializers ──────────────────────────────────────────────

def _serialize_snapshot(snap, fv_horizon_days: int) -> Dict[str, Any]:
    return {
        "officialIndexPrint":           float(snap.official_index_print),
        "spotIndex":                    float(snap.spot_index),
        "fvIndex":                      float(snap.fv_index),
        "perpPrice":                    float(snap.perp_price),
        "basisBp":                      float(snap.basis_bp),
        "annualizedCarryBp":            float(snap.annualized_carry_bp),
        "frontExpectedYoyPct":          float(snap.front_expected_yoy_pct),
        "implied1mYoyPct":              float(snap.implied_1m_yoy_pct),
        "implied3mYoyPct":              float(snap.implied_3m_yoy_pct),
        "implied6mYoyPct":              float(snap.implied_6m_yoy_pct),
        "termStructurePct":             float(snap.term_structure_pct),
        "publishabilityLabel":          snap.publishability_label,
        "confidenceLabel":              snap.confidence_label,
        "confidenceScorePct":           float(snap.confidence_score_pct),
        "requestedKalshiWeightPct":     float(snap.requested_kalshi_weight_pct),
        "requestedForecastexWeightPct": float(snap.requested_forecastex_weight_pct),
        "effectiveKalshiWeightPct":     float(snap.effective_kalshi_weight_pct),
        "effectiveForecastexWeightPct": float(snap.effective_forecastex_weight_pct),
        "kalshiEligible":               bool(snap.kalshi_eligible),
        "forecastexEligible":           bool(snap.forecastex_eligible),
        "weightingMethod":              snap.weighting_method,
        "eligibilityRule":              snap.eligibility_rule,
        "fvHorizonDays":                int(fv_horizon_days),
    }


def _serialize_curve(curve) -> List[Dict[str, Any]]:
    """Convert a v7 curve DataFrame to a list of row dicts."""
    rows: List[Dict[str, Any]] = []
    for _, r in curve.iterrows():
        try:
            tm = r["target_month"]
            tm_iso   = tm.date().isoformat() if hasattr(tm, "date") else str(tm)
            tm_label = tm.strftime("%b %y") if hasattr(tm, "strftime") else str(tm)
        except Exception:
            tm_iso, tm_label = str(r["target_month"]), str(r["target_month"])
        row = {
            "targetMonth":       tm_label,
            "targetMonthIso":    tm_iso,
            "daysFromValuation": int(r["days_from_valuation"]),
            "expectedYoyPct":    float(r["expected_yoy_pct"]),
            "indexLevel":        float(r["index_level"]),
            "stdDevPct":         float(r["std_dev_pct"]) if "std_dev_pct" in r and r["std_dev_pct"] is not None else None,
        }
        # Optional columns from the blended frame (carry venue weights through)
        for col_src, col_dst in [
            ("kalshi_weight",        "kalshiWeight"),
            ("forecastex_weight",    "forecastexWeight"),
            ("source",               "source"),
            ("publishable",          "publishable"),
            ("smoothing_residual_bp","smoothingResidualBp"),
            ("smoothing_method_used","smoothingMethod"),
            ("curve_shape_flag",     "curveShape"),
            ("expected_yoy_raw_pct", "expectedYoyRawPct"),
        ]:
            if col_src in r:
                v = r[col_src]
                try:
                    if hasattr(v, "item"):
                        v = v.item()
                except Exception:
                    pass
                if v is not None:
                    row[col_dst] = bool(v) if col_src == "publishable" else (
                        float(v) if isinstance(v, (int, float)) else v
                    )
        rows.append(row)
    return rows


def _serialize_blend_meta(meta) -> Dict[str, Any]:
    return {
        "requestedKalshiWeight":     float(meta.requested_kalshi_weight),
        "requestedForecastexWeight": float(meta.requested_forecastex_weight),
        "effectiveKalshiWeight":     float(meta.effective_kalshi_weight),
        "effectiveForecastexWeight": float(meta.effective_forecastex_weight),
        "kalshiEligible":            bool(meta.kalshi_eligible),
        "forecastexEligible":        bool(meta.forecastex_eligible),
        "weightingMethod":           meta.weighting_method,
        "eligibilityRule":           meta.eligibility_rule,
    }


def _serialize_smoothing(diag) -> Dict[str, Any]:
    return {
        "methodRequested": diag.method_requested,
        "methodUsed":      diag.method_used,
        "monotoneDirection": diag.monotone_direction,
        "anchorCount":     int(diag.anchor_count),
        "coverageRatio":   float(diag.coverage_ratio),
        "maxResidualBp":   float(diag.max_residual_bp),
        "rmseBp":          float(diag.rmse_bp),
        "notes":           list(diag.notes or []),
    }


def _serialize_weight_diag(d) -> Dict[str, Any]:
    return {
        "venue":                       d.venue,
        "requestedWeight":             float(d.requested_weight),
        "rawVenueScore":               float(d.raw_venue_score),
        "rawScoreWeight":              float(d.raw_score_weight),
        "effectiveWeight":             float(d.effective_weight),
        "eligible":                    bool(d.eligible),
        "coverageScore":               float(d.coverage_score),
        "internalConsistencyScore":    float(d.internal_consistency_score),
        "medianQuoteAgeSeconds":       float(d.median_quote_age_seconds) if d.median_quote_age_seconds is not None else None,
        "snapshotSpanSeconds":         float(d.snapshot_span_seconds) if d.snapshot_span_seconds is not None else None,
        "historicalCalibrationScore": float(d.historical_calibration_score),
        "weightedMeanBrierScore":      float(d.weighted_mean_brier_score),
        "calibrationSampleSize":       int(d.calibration_sample_size),
    }


def _serialize_venue_freshness(f) -> Dict[str, Any]:
    return {
        "venue":                  f.venue,
        "medianQuoteAgeSeconds":  float(f.median_quote_age_seconds),
        "maxQuoteAgeSeconds":     float(f.max_quote_age_seconds),
        "freshQuoteFraction":     float(f.fresh_quote_fraction),
        "staleQuoteFraction":     float(f.stale_quote_fraction),
        "snapshotSpanSeconds":    float(f.snapshot_span_seconds),
    }


def _serialize_blended_freshness(b) -> Dict[str, Any]:
    return {
        "crossVenueMedianAgeGapSeconds": float(b.cross_venue_median_age_gap_seconds),
        "blendedSnapshotSpanSeconds":    float(b.blended_snapshot_span_seconds),
    }


def _serialize_ref_pt(rp) -> Dict[str, Any]:
    return {
        "horizonMonths":     float(rp.horizon_months),
        "blendedMeanPct":    float(rp.blended_mean_pct),
        "blendedStdDevPct":  float(rp.blended_std_dev_pct) if rp.blended_std_dev_pct is not None else None,
        "blendedThresholdProbs": dict(rp.blended_threshold_probs or {}),
        "sourceResidualBp":  dict(rp.source_residual_bp or {}),
        "distributionConfidenceScore": float(rp.distribution_confidence_score),
    }


def _serialize_diagnostics(b) -> Dict[str, Any]:
    """Serialize cpi_basis_diagnostics.DiagnosticsArtifacts for the React
    'Venue Diagnostics' KPI strip + 3 tables + 2 charts."""
    import pandas as pd

    def _df_records(df):
        out = []
        for _, r in df.iterrows():
            row = {}
            for col, val in r.items():
                if hasattr(val, "isoformat"):
                    try:
                        row[col] = val.isoformat()
                        continue
                    except Exception:
                        pass
                if pd.isna(val):
                    row[col] = None
                elif hasattr(val, "item"):
                    row[col] = val.item()
                else:
                    row[col] = val
            out.append(row)
        return out

    return {
        "summary":         dict(b.summary or {}),
        "metadata":        dict(b.metadata or {}),
        "venueComparison": _df_records(b.venue_comparison),
        "maturityLevel":   _df_records(b.maturity_level),
        "scenarioTests":   _df_records(b.scenario_tests),
        "contractLevel":   _df_records(b.contract_level),
    }


def perp_payload_json(
    fv_horizon_days: int = DEFAULT_FV_HORIZON_DAYS,
    perp_basis_bp:   float = DEFAULT_PERP_BASIS_BP,
) -> str:
    p = _build_payload(fv_horizon_days, perp_basis_bp)
    if p is None:
        return "null"
    return json.dumps(p, separators=(",", ":"), default=str)


if __name__ == "__main__":
    print(perp_payload_json())
