"""
execution_data.py — Build the Execution Workbench summary payload for the
Redesign React app.

Mirrors what v7's `apps/market_sim/falconx_sim_tab` Sim Posture + CPI
Dislocation Strip sections render, sourced from the same governed venue
stack the React app already consumes for the CPI Basis Engine tab.

We do NOT React-port the full v7 simulator (ScaleTrader ticket, TRS
scenario, sweep, ladder) — that stays in `apps/market_sim/`. The
Workbench tab gives a real readout of:

    • Forward Risk Regime  (Low / Moderate / Elevated)
    • Risk score           (0-100)
    • Spread / inventory / edge-hurdle multipliers + effective bases
    • CPI Dislocation Strip (avg / median / max / net edge / venues / maturities)

The regime classifier is v7's `analytics.forward_risk_engine.build_forward_risk_summary`
which we mirrored into `Redesign/oriel_demo_v7/` alongside the existing
data layer.

Failures degrade gracefully: any import / runtime error returns a payload
with `available=false` so the React ExecutionView can render an "unavailable"
panel without crashing the bundle.
"""
from __future__ import annotations

import functools
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# Add v7 mirror to sys.path so risk_posture / forward_risk_engine resolve.
_V7_ROOT = (Path(__file__).resolve().parent.parent / "oriel_demo_v7").resolve()
if str(_V7_ROOT) not in sys.path:
    sys.path.insert(0, str(_V7_ROOT))


# Match v7 falconx_sim_tab defaults so the regime multipliers render against
# the same baselines reviewers see in v7's Sim Posture cards.
_BASE_SPREAD_BPS = 12.0
_BASE_INVENTORY_LIMIT_USD = 5_000_000.0
_BASE_EDGE_HURDLE_BPS = 10.0


def _venue_data_dir() -> Path:
    return _V7_ROOT / "data"


@functools.lru_cache(maxsize=1)
def _venue_comparison_frame() -> Optional[pd.DataFrame]:
    """Run the same Tier-1 + diagnostics pipeline the CPI Basis Engine tab
    uses, return the venue-comparison frame Kalshi-vs-ForecastEx per
    maturity. We deliberately reuse Redesign's existing analytics so the
    Execution Workbench numbers line up with the CPI Basis Engine numbers."""
    try:
        from analytics.tier1_fv_engine import (  # type: ignore
            apply_microstructure_filters, load_tier1_constituents,
        )
        from analytics.cpi_basis_diagnostics import (  # type: ignore
            prepare_contract_level, aggregate_maturity_metrics, build_venue_comparison,
        )
    except Exception as ex:
        logger.warning("Execution payload: analytics import failed (%s)", ex)
        return None
    try:
        ddir = _venue_data_dir()
        kalshi_const = apply_microstructure_filters(
            load_tier1_constituents(ddir / "kalshi_constituents_current.csv"), "Kalshi"
        )
        fx_const = apply_microstructure_filters(
            load_tier1_constituents(ddir / "forecastex_constituents_current.csv"), "ForecastEx"
        )
        k_contracts = prepare_contract_level(kalshi_const, "Kalshi")
        f_contracts = prepare_contract_level(fx_const, "ForecastEx")
        contract_df = pd.concat([k_contracts, f_contracts], ignore_index=True)
        maturity_df = aggregate_maturity_metrics(contract_df)
        return build_venue_comparison(maturity_df)
    except Exception as ex:
        logger.warning("Execution payload: venue comparison build failed (%s)", ex)
        return None


def _frames_for_sim_posture(vc: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Reshape the venue-comparison rows into the (front_df, dislocations)
    pair that risk_posture.build_sim_posture / compute_dislocation_strip
    expect.

    front_df: one row per (venue, target_month) with implied_yoy +
    confidence_score (+ liquidity proxy).

    dislocations: one row per (venue, target_month) with implied_yoy,
    oriel_reference_yoy (average of venues), dislocation_bps,
    gross_edge_bps, net_executable_edge_bps (after a 10 bp cost buffer).
    """
    if vc is None or vc.empty:
        return pd.DataFrame(), pd.DataFrame()

    needed_cols = {"target_month", "kalshi_raw_contract_implied_expected_cpi",
                   "forecastex_raw_contract_implied_expected_cpi"}
    if not needed_cols.issubset(vc.columns):
        return pd.DataFrame(), pd.DataFrame()

    rows_front, rows_disl = [], []
    for _, r in vc.iterrows():
        target = r["target_month"]
        k_yoy = r.get("kalshi_raw_contract_implied_expected_cpi")
        f_yoy = r.get("forecastex_raw_contract_implied_expected_cpi")
        if pd.isna(k_yoy) and pd.isna(f_yoy):
            continue
        # Oriel reference = mean of the venues we have (Kalshi + ForecastEx).
        venue_yoys = [v for v in [k_yoy, f_yoy] if not pd.isna(v)]
        ref = float(np.mean(venue_yoys))
        # Average confidence + liquidity (used by the sim posture engine).
        avg_conf = float(r.get("avg_confidence_score", 0.0) or 0.0)
        # avg_spread is bp; cheap-and-cheerful liquidity proxy = 1 / (1 + spread/10)
        avg_spread = float(r.get("avg_spread_bp", 10.0) or 10.0)
        liq = 1.0 / (1.0 + max(avg_spread, 0.0) / 10.0)

        for venue_name, yoy in (("Kalshi", k_yoy), ("ForecastEx", f_yoy)):
            if pd.isna(yoy):
                continue
            disl_bps = (float(yoy) - ref) * 100.0
            rows_front.append({
                "release_month":     target,
                "venue":             venue_name,
                "implied_yoy":       float(yoy),
                "confidence_score":  avg_conf,
                "liquidity_score":   liq,
            })
            rows_disl.append({
                "release_month":            target,
                "venue":                    venue_name,
                "implied_yoy":              float(yoy),
                "oriel_reference_yoy":      ref,
                "dislocation_bps":          disl_bps,
                "gross_edge_bps":           abs(disl_bps),
                "net_executable_edge_bps":  max(0.0, abs(disl_bps) - 10.0),
                "confidence_score":         avg_conf,
                "liquidity_score":          liq,
            })

    front_df = pd.DataFrame(rows_front)
    if not front_df.empty:
        # PR-#15 contract: surface a venue_diagnostics dict on .attrs so
        # compute_dislocation_strip counts venues correctly even when
        # one is LIVE_TRIMMED. Kalshi + ForecastEx are the governed pair.
        front_df.attrs["venue_diagnostics"] = {
            v: {"status": "LIVE_OR_SAMPLE"} for v in front_df["venue"].unique()
        }
    return front_df, pd.DataFrame(rows_disl)


def _payload_unavailable(reason: str) -> Dict[str, Any]:
    return {
        "available":           False,
        "unavailableReason":   reason,
        "regime":              "Moderate",
        "regimeExplainer":     "Execution Workbench unavailable in this environment.",
        "riskScore":           None,
        "baseSpreadBps":       _BASE_SPREAD_BPS,
        "baseInventoryUsd":    _BASE_INVENTORY_LIMIT_USD,
        "baseEdgeHurdleBps":   _BASE_EDGE_HURDLE_BPS,
        "spreadMultiplier":    1.0,
        "inventoryMultiplier": 1.0,
        "edgeHurdleMultiplier": 1.0,
        "effectiveSpreadBps":  _BASE_SPREAD_BPS,
        "effectiveInventoryUsd": _BASE_INVENTORY_LIMIT_USD,
        "effectiveEdgeHurdleBps": _BASE_EDGE_HURDLE_BPS,
        "strip": {
            "avgDislocationBps":    0.0,
            "medianDislocationBps": 0.0,
            "maxDislocationBps":    0.0,
            "netExecutableEdgeBps": 0.0,
            "venueCount":           0,
            "maturityCount":        0,
        },
    }


def _build_payload() -> Dict[str, Any]:
    vc = _venue_comparison_frame()
    if vc is None or vc.empty:
        return _payload_unavailable("Venue comparison frame unavailable.")

    front_df, dislocations = _frames_for_sim_posture(vc)
    if front_df.empty or dislocations.empty:
        return _payload_unavailable("Insufficient venue data to build posture.")

    try:
        from risk_posture import build_sim_posture, compute_dislocation_strip, REGIME_EXPLAINER  # type: ignore
    except Exception as ex:
        logger.warning("Execution payload: risk_posture import failed (%s)", ex)
        return _payload_unavailable("risk_posture module unavailable.")

    posture = build_sim_posture(
        front_df, dislocations,
        base_spread_bps=_BASE_SPREAD_BPS,
        base_inventory_limit_usd=_BASE_INVENTORY_LIMIT_USD,
        base_edge_hurdle_bps=_BASE_EDGE_HURDLE_BPS,
    )
    strip = compute_dislocation_strip(front_df, dislocations)

    return {
        "available":            True,
        "unavailableReason":    None,
        "regime":               posture.regime,
        "regimeExplainer":      REGIME_EXPLAINER.get(posture.regime, REGIME_EXPLAINER["Moderate"]),
        "riskScore":            float(posture.score) if posture.score is not None else None,
        "baseSpreadBps":        float(posture.base_spread_bps),
        "baseInventoryUsd":     float(posture.base_inventory_limit_usd),
        "baseEdgeHurdleBps":    float(posture.base_edge_hurdle_bps),
        "spreadMultiplier":     float(posture.adjustment.spread_multiplier),
        "inventoryMultiplier":  float(posture.adjustment.inventory_limit_multiplier),
        "edgeHurdleMultiplier": float(posture.adjustment.edge_hurdle_multiplier),
        "effectiveSpreadBps":   float(posture.effective_spread_bps),
        "effectiveInventoryUsd": float(posture.effective_inventory_limit_usd),
        "effectiveEdgeHurdleBps": float(posture.effective_edge_hurdle_bps),
        "strip": {
            "avgDislocationBps":    float(strip.avg_dislocation_bps),
            "medianDislocationBps": float(strip.median_dislocation_bps),
            "maxDislocationBps":    float(strip.max_dislocation_bps),
            "netExecutableEdgeBps": float(strip.net_executable_edge_bps),
            "venueCount":           int(strip.venue_count),
            "maturityCount":        int(strip.maturity_count),
        },
    }


def execution_payload_json() -> str:
    """JSON-serialized Execution Workbench payload ready for inlining as
    `window.__EXECUTION__ = …;` in the React bundle."""
    return json.dumps(_build_payload(), separators=(",", ":"))


if __name__ == "__main__":
    print(execution_payload_json())
