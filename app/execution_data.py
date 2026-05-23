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


# Representative backtest summary used to drive the illustrative TRS
# deployment scenario. Matches the shape v7's apps/market_sim/oriel_hl_sim
# run_backtest returns; values reflect a typical 30-day sim with the
# current default base spread (12 bp) on a $3M launch notional. We feed
# this through trs_deployment.build_trs_deployment_scenario to produce
# the same scenario comparison Chris demos in v7's market-sim subapp.
# (When a Redesign-side run_backtest exists, swap in the live values.)
_REPRESENTATIVE_BACKTEST_SUMMARY = {
    "launch_notional_usd":             3_000_000.0,
    "spread_capture_pnl_usd":          24_000.0,
    "directional_pnl_usd":             -6_000.0,
    "total_pnl_usd":                   18_000.0,
    "max_inventory_usd":               850_000.0,
    "liquidity_self_sufficiency_score": 0.72,
    "market_stability_score":          0.65,
}

_DEFAULT_TRS_INPUTS_DICT = {
    "fundCapitalUsd":         3_000_000.0,
    "trsNotionalMultiple":    2.0,
    "initialMarginPct":       0.25,
    "financingRatePct":       0.06,
    "collateralYieldPct":     0.0,
    "hedgeMode":              "Partial CPI perp/reference hedge",
    "hedgeRatio":             0.75,
    "dislocationRetention":   1.0,
    "horizonDays":            30,
}


def _serialize_trs_result(result) -> Dict[str, Any]:
    return {
        "scenarioLabel":              result.scenario_label,
        "fundCapitalUsd":             float(result.fund_capital_usd),
        "trsNotionalUsd":             float(result.trs_notional_usd),
        "requiredMarginUsd":          float(result.required_margin_usd),
        "availableLiquidityUsd":      float(result.available_liquidity_usd),
        "pnlScale":                   float(result.pnl_scale),
        "grossDislocationPnlUsd":     float(result.gross_dislocation_pnl_usd),
        "spreadCapturePnlUsd":        float(result.spread_capture_pnl_usd),
        "grossDirectionalPnlUsd":     float(result.gross_directional_pnl_usd),
        "hedgePnlUsd":                float(result.hedge_pnl_usd),
        "residualBasisPnlUsd":        float(result.residual_basis_pnl_usd),
        "financingCostUsd":           float(result.financing_cost_usd),
        "collateralYieldUsd":         float(result.collateral_yield_usd),
        "netFundPnlUsd":              float(result.net_fund_pnl_usd),
        "returnOnCapitalPct":         float(result.return_on_capital_pct),
        "maxGrossExposureUsd":        float(result.max_gross_exposure_usd),
        "netExposureAfterHedgeUsd":   float(result.net_exposure_after_hedge_usd),
        "maxInventoryUsd":            float(result.max_inventory_usd),
        "maxNetInventoryAfterHedgeUsd": float(result.max_net_inventory_after_hedge_usd),
        "capitalEfficiencyRatio":     float(result.capital_efficiency_ratio),
        "stressDrawdownProxyUsd":     float(result.stress_drawdown_proxy_usd),
        "hedgeRatio":                 float(result.hedge_ratio),
        "liquiditySelfSufficiencyScore": float(result.liquidity_self_sufficiency_score),
        "marketStabilityScore":       float(result.market_stability_score),
        "warnings":                   list(result.warnings or ()),
    }


def _serialize_trs_row(row) -> Dict[str, Any]:
    return {
        "scenario":                       row.scenario,
        "fundCapitalUsd":                 float(row.fund_capital_usd),
        "trsNotionalUsd":                 float(row.trs_notional_usd),
        "requiredMarginUsd":              float(row.required_margin_usd),
        "grossExposureUsd":               float(row.gross_exposure_usd),
        "netExposureAfterHedgeUsd":       float(row.net_exposure_after_hedge_usd),
        "netPnlUsd":                      float(row.net_pnl_usd),
        "returnOnCapitalPct":             float(row.return_on_capital_pct),
        "maxInventoryUsd":                float(row.max_inventory_usd),
        "residualBasisRiskUsd":           float(row.residual_basis_risk_usd),
        "capitalEfficiencyRatio":         float(row.capital_efficiency_ratio),
        "liquiditySelfSufficiencyScore":  float(row.liquidity_self_sufficiency_score),
    }


def _build_oriel_decision(dislocations: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """Pick the single best 'trade-worth-doing' row from the dislocations
    frame — the row with the largest net executable edge. Mirrors the
    decision strip Chris added to v7 falconx_sim_tab in PR #19."""
    if dislocations is None or dislocations.empty:
        return None
    edge_col = "net_executable_edge_bps" if "net_executable_edge_bps" in dislocations.columns else "gross_edge_bps"
    if edge_col not in dislocations.columns:
        return None
    row = dislocations.sort_values(edge_col, ascending=False).iloc[0]
    disl_bps = float(row["dislocation_bps"])
    preferred_side = "Buy / receive CPI exposure" if disl_bps < 0 else "Sell / fade CPI exposure"
    rationale = (
        "cheap to Oriel Reference after cost buffer"
        if disl_bps < 0 else
        "rich to Oriel Reference after cost buffer"
    )
    rm = row.get("release_month")
    return {
        "preferredSide":     preferred_side,
        "preferredVenue":    str(row.get("venue", "—")),
        "preferredMaturity": _format_maturity(rm),
        "orielReferenceYoy": float(row.get("oriel_reference_yoy", 0.0)),
        "bestDisplayedYoy":  float(row.get("implied_yoy", 0.0)),
        "dislocationBps":    disl_bps,
        "netExecutableEdgeBps": float(row.get(edge_col, 0.0) or 0.0),
        "rationale":         rationale,
        "status":            "not routed",
    }


def _format_maturity(value) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "—"
    try:
        ts = pd.to_datetime(value, errors="coerce")
        if pd.isna(ts):
            return str(value)
        return ts.strftime("%b %Y")
    except Exception:
        return str(value)


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
        "orielDecision":   None,
        "trsDeployment":   None,
        "trsComparison":   [],
        "trsInputs":       _DEFAULT_TRS_INPUTS_DICT,
        "backtestSummary": None,
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
    decision = _build_oriel_decision(dislocations)

    # TRS deployment scenario (illustrative — driven by a representative
    # backtest summary, not a live run_backtest). Same math v7's
    # apps/market_sim falconx_sim_tab uses; numbers update as the user
    # tunes inputs on the React side via a follow-up controls panel.
    trs_deployment_payload: Optional[Dict[str, Any]] = None
    trs_comparison_payload: List[Dict[str, Any]] = []
    try:
        from trs_deployment import (  # type: ignore
            TRSDeploymentInputs,
            build_trs_deployment_scenario,
            build_trs_scenario_comparison,
        )
        trs_inputs = TRSDeploymentInputs()
        deployment = build_trs_deployment_scenario(
            _REPRESENTATIVE_BACKTEST_SUMMARY, trs_inputs,
            scenario_label="TRS wrapper, partial hedge (illustrative)",
        )
        comparison = build_trs_scenario_comparison(
            _REPRESENTATIVE_BACKTEST_SUMMARY, trs_inputs,
        )
        trs_deployment_payload = _serialize_trs_result(deployment)
        trs_comparison_payload = [_serialize_trs_row(r) for r in comparison]
    except Exception as ex:
        logger.warning("Execution payload: TRS scenario build failed (%s)", ex)

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
        "orielDecision":  decision,
        "trsDeployment":  trs_deployment_payload,
        "trsComparison":  trs_comparison_payload,
        "trsInputs":      _DEFAULT_TRS_INPUTS_DICT,
        "backtestSummary": {
            "launchNotionalUsd":          _REPRESENTATIVE_BACKTEST_SUMMARY["launch_notional_usd"],
            "spreadCapturePnlUsd":        _REPRESENTATIVE_BACKTEST_SUMMARY["spread_capture_pnl_usd"],
            "directionalPnlUsd":          _REPRESENTATIVE_BACKTEST_SUMMARY["directional_pnl_usd"],
            "totalPnlUsd":                _REPRESENTATIVE_BACKTEST_SUMMARY["total_pnl_usd"],
            "maxInventoryUsd":            _REPRESENTATIVE_BACKTEST_SUMMARY["max_inventory_usd"],
            "liquiditySelfSufficiencyScore": _REPRESENTATIVE_BACKTEST_SUMMARY["liquidity_self_sufficiency_score"],
            "marketStabilityScore":       _REPRESENTATIVE_BACKTEST_SUMMARY["market_stability_score"],
        },
    }


def execution_payload_json() -> str:
    """JSON-serialized Execution Workbench payload ready for inlining as
    `window.__EXECUTION__ = …;` in the React bundle."""
    return json.dumps(_build_payload(), separators=(",", ":"))


if __name__ == "__main__":
    print(execution_payload_json())
