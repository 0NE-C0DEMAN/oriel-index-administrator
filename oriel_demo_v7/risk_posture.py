"""Surface the canonical risk-aware simulator posture in the visible market-sim app.

Chris's ask after PR #15: make the existing risk engine work obvious on screen.
The pieces that need to surface are:

    1. Forward Risk Regime           (Low / Moderate / Elevated)
    2. Risk score                    (0-100, regime threshold at 35 and 65)
    3. Spread / inventory / edge-hurdle posture (the three regime multipliers)
    4. CPI dislocation strip         (avg / median / max / net-edge / venue / maturity)

The risk engine itself lives in ``analytics.forward_risk_engine.build_forward_risk_summary``
and the simulator-facing translation lives in ``oriel.sim.risk.risk_adjustment_from_summary``.
This module is the adapter that:

  • Builds the canonical inputs (forward_curve, vol_surface proxy, dispersion diagnostics)
    from the visible market-sim snapshot — front_df and dislocations DataFrames.
  • Returns the ForwardRiskSummary + RiskRegimeAdjustment without committing the
    falconx_sim_tab to importing the engine directly.
  • Aggregates the dislocation-strip metrics from the same dislocations frame.

Keeping this module pure-data — no Streamlit imports — so the same helpers can be
called from tests, scripts, or a future API.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import numpy as np
import pandas as pd

from analytics.forward_risk_engine import (
    ForwardRiskConfig,
    ForwardRiskSummary,
    build_forward_risk_summary,
)
from oriel.sim.risk import (
    NEUTRAL_RISK_ADJUSTMENT,
    RiskRegimeAdjustment,
    risk_adjustment_from_summary,
)


REGIME_EXPLAINER: dict[str, str] = {
    "Low": (
        "Cross-venue prices are well-aligned and term-structure dispersion is low. "
        "The simulator runs a tight quoted spread, larger inventory limit, and a "
        "low edge hurdle — comfortable conditions to lean into."
    ),
    "Moderate": (
        "Dispersion and slope are within normal bounds. The simulator runs at "
        "neutral posture: quoted spread, inventory limit, and edge hurdle all "
        "at their configured base levels."
    ),
    "Elevated": (
        "Cross-venue dispersion or curve geometry are stressed. The simulator "
        "widens the quoted spread, cuts the inventory limit, and raises the "
        "edge hurdle so it only fills when the dislocation comfortably clears "
        "transaction costs."
    ),
}


@dataclass(frozen=True)
class SimPosture:
    """Bundle of state the falconx_sim_tab renders in the Sim Posture section."""

    summary: ForwardRiskSummary
    adjustment: RiskRegimeAdjustment
    base_spread_bps: float
    effective_spread_bps: float
    base_inventory_limit_usd: float
    effective_inventory_limit_usd: float
    base_edge_hurdle_bps: float
    effective_edge_hurdle_bps: float

    @property
    def regime(self) -> str:
        return self.adjustment.risk_regime

    @property
    def score(self) -> float | None:
        return self.adjustment.risk_score

    @property
    def explainer(self) -> str:
        return REGIME_EXPLAINER.get(self.regime, REGIME_EXPLAINER["Moderate"])


def derive_forward_risk_summary(
    front_df: pd.DataFrame,
    dislocations: pd.DataFrame,
    config: ForwardRiskConfig | None = None,
) -> ForwardRiskSummary:
    """Build the canonical ForwardRiskSummary from the visible market-sim snapshot.

    The risk engine expects (forward_curve, vol_surface, diagnostics_df). The
    market-sim snapshot only ships forward implied YoY per venue per maturity
    and cross-venue dislocations. We map them as follows:

      • forward_curve   ← one row per release_month with Oriel-reference YoY
                          (the canonical curve point the dislocations measure against)
      • vol_surface     ← per-maturity dispersion of implied YoY across venues,
                          treated as an implied-vol proxy. Higher cross-venue
                          disagreement → higher uncertainty about the print.
      • diagnostics_df  ← dislocations with abs(dislocation_bps) as the
                          per-row residual the engine ingests.

    These three feed the same risk-score formula the rest of the platform uses
    so the regime label here is comparable to the rest of the platform.
    """
    cfg = config or ForwardRiskConfig()
    forward_curve = _build_forward_curve_input(dislocations)
    vol_surface = _build_vol_surface_proxy(front_df)
    diagnostics_input = _build_dispersion_diagnostics(dislocations)
    return build_forward_risk_summary(
        forward_curve=forward_curve,
        vol_surface=vol_surface,
        diagnostics_df=diagnostics_input,
        config=cfg,
    )


def build_sim_posture(
    front_df: pd.DataFrame,
    dislocations: pd.DataFrame,
    *,
    base_spread_bps: float,
    base_inventory_limit_usd: float,
    base_edge_hurdle_bps: float,
    config: ForwardRiskConfig | None = None,
) -> SimPosture:
    """One-shot helper that builds the ForwardRiskSummary, derives the
    RiskRegimeAdjustment, and applies the regime multipliers to the supplied
    base configuration. The Streamlit tab uses the .effective_* fields to
    decide what to pass into run_backtest, and renders the explainer + tone
    cards from the same struct.
    """
    if (front_df is None or front_df.empty) or (dislocations is None or dislocations.empty):
        adjustment = NEUTRAL_RISK_ADJUSTMENT
        summary = _empty_summary()
    else:
        summary = derive_forward_risk_summary(front_df, dislocations, config=config)
        adjustment = risk_adjustment_from_summary(summary)

    return SimPosture(
        summary=summary,
        adjustment=adjustment,
        base_spread_bps=float(base_spread_bps),
        effective_spread_bps=float(base_spread_bps) * adjustment.spread_multiplier,
        base_inventory_limit_usd=float(base_inventory_limit_usd),
        effective_inventory_limit_usd=float(base_inventory_limit_usd) * adjustment.inventory_limit_multiplier,
        base_edge_hurdle_bps=float(base_edge_hurdle_bps),
        effective_edge_hurdle_bps=float(base_edge_hurdle_bps) * adjustment.edge_hurdle_multiplier,
    )


@dataclass(frozen=True)
class DislocationStrip:
    """The 6 metrics Chris asked for in the visible CPI dislocation strip."""

    avg_dislocation_bps: float
    median_dislocation_bps: float
    max_dislocation_bps: float
    net_executable_edge_bps: float
    venue_count: int
    maturity_count: int

    def to_dict(self) -> dict[str, float | int]:
        return {
            "avg_dislocation_bps": self.avg_dislocation_bps,
            "median_dislocation_bps": self.median_dislocation_bps,
            "max_dislocation_bps": self.max_dislocation_bps,
            "net_executable_edge_bps": self.net_executable_edge_bps,
            "venue_count": self.venue_count,
            "maturity_count": self.maturity_count,
        }


def compute_dislocation_strip(
    front_df: pd.DataFrame,
    dislocations: pd.DataFrame,
) -> DislocationStrip:
    """Aggregate the 6 metrics Chris requested.

    Dislocation magnitudes are taken as the absolute distance from the Oriel
    reference (sign-agnostic — the metric of interest is how far apart venue
    quotes have drifted, not which side). Net executable edge is the mean of
    the existing per-row ``net_executable_edge_bps`` (already nets a 10 bp
    transaction-cost buffer in compute_dislocations).

    Venue count is sourced from ``front_df.attrs["venue_diagnostics"]`` so the
    LIVE_TRIMMED / LIVE_EMPTY states from PR #15 are honoured — a venue with
    zero shown rows still counts as a venue that's tried to contribute. If
    that attribute is missing (older snapshots) we fall back to the distinct
    venues in front_df.

    Maturity count is the number of distinct release_months present in the
    dislocations frame (i.e. maturities where at least one venue published a
    contract that survived the front-month filter).
    """
    if dislocations is None or dislocations.empty:
        return DislocationStrip(0.0, 0.0, 0.0, 0.0, 0, 0)

    abs_disl = dislocations["dislocation_bps"].abs()
    avg = float(abs_disl.mean()) if not abs_disl.empty else 0.0
    med = float(abs_disl.median()) if not abs_disl.empty else 0.0
    mx = float(abs_disl.max()) if not abs_disl.empty else 0.0

    if "net_executable_edge_bps" in dislocations.columns:
        net_edge = float(dislocations["net_executable_edge_bps"].mean())
    else:
        # Fallback: replicate ingestion's 10 bp cost buffer.
        net_edge = float((abs_disl - 10.0).clip(lower=0.0).mean())

    venue_count = _count_venues(front_df, dislocations)
    maturity_count = int(dislocations["release_month"].nunique()) if "release_month" in dislocations.columns else 0

    return DislocationStrip(
        avg_dislocation_bps=round(avg, 2),
        median_dislocation_bps=round(med, 2),
        max_dislocation_bps=round(mx, 2),
        net_executable_edge_bps=round(net_edge, 2),
        venue_count=venue_count,
        maturity_count=maturity_count,
    )


# ---------------------------------------------------------------------------
# Internal builders for the risk-engine inputs.
# ---------------------------------------------------------------------------

def _build_forward_curve_input(dislocations: pd.DataFrame) -> pd.DataFrame:
    if dislocations is None or dislocations.empty:
        return pd.DataFrame(columns=["target_month", "expected_yoy_pct"])
    if "oriel_reference_yoy" not in dislocations.columns:
        return pd.DataFrame(columns=["target_month", "expected_yoy_pct"])
    curve = (
        dislocations.dropna(subset=["oriel_reference_yoy", "release_month"])
        .groupby("release_month", as_index=False)["oriel_reference_yoy"].mean()
        .rename(columns={"release_month": "target_month", "oriel_reference_yoy": "expected_yoy_pct"})
    )
    curve["target_month"] = _parse_release_month(curve["target_month"])
    curve = curve.dropna(subset=["target_month"]).sort_values("target_month").reset_index(drop=True)
    return curve


def _build_vol_surface_proxy(front_df: pd.DataFrame) -> pd.DataFrame:
    """Synthesize a vol-surface proxy from cross-venue dispersion of implied YoY.

    Per maturity, std deviation of venue implied_yoy is a defensible proxy for
    "uncertainty about the print": when venues agree, vol is low; when they
    disagree, vol is high. We also seed a confidence_score from the average
    per-row confidence so the engine's confidence_score downstream is sane.
    """
    if front_df is None or front_df.empty:
        return pd.DataFrame(columns=["target_month", "implied_vol_pct", "confidence_score"])
    if "implied_yoy" not in front_df.columns or "release_month" not in front_df.columns:
        return pd.DataFrame(columns=["target_month", "implied_vol_pct", "confidence_score"])

    by_month = front_df.groupby("release_month")
    rows: list[dict[str, Any]] = []
    for month, group in by_month:
        implied = pd.to_numeric(group["implied_yoy"], errors="coerce").dropna()
        if implied.empty:
            continue
        vol_proxy = float(implied.std(ddof=0)) if len(implied) > 1 else 0.0
        confidence = (
            float(pd.to_numeric(group.get("confidence_score"), errors="coerce").dropna().mean())
            if "confidence_score" in group.columns
            else None
        )
        rows.append({
            "target_month": month,
            "implied_vol_pct": vol_proxy,
            "confidence_score": confidence,
        })
    if not rows:
        return pd.DataFrame(columns=["target_month", "implied_vol_pct", "confidence_score"])
    surface = pd.DataFrame(rows)
    surface["target_month"] = _parse_release_month(surface["target_month"])
    return surface.dropna(subset=["target_month"]).sort_values("target_month").reset_index(drop=True)


def _build_dispersion_diagnostics(dislocations: pd.DataFrame) -> pd.DataFrame:
    """Reshape dislocations into the column the risk engine reads."""
    if dislocations is None or dislocations.empty:
        return pd.DataFrame(columns=["abs_residual_bp"])
    if "dislocation_bps" not in dislocations.columns:
        return pd.DataFrame(columns=["abs_residual_bp"])
    out = pd.DataFrame({
        "abs_residual_bp": dislocations["dislocation_bps"].abs(),
    })
    return out.dropna()


def _parse_release_month(series: pd.Series) -> pd.Series:
    """Parse 'May 2026' style release-month labels into datetimes the engine
    can use to derive days_from_valuation. Bad rows → NaT (engine drops them).

    Tries explicit formats first to avoid pandas' "format inferred" UserWarning
    that fires on the dateutil fallback path.
    """
    text = series.astype(str)
    for fmt in ("%b %Y", "%b %y", "%B %Y"):
        parsed = pd.to_datetime(text, format=fmt, errors="coerce")
        if not parsed.isna().all():
            return parsed
    return pd.to_datetime(text, errors="coerce", format="mixed")


def _count_venues(front_df: pd.DataFrame, dislocations: pd.DataFrame) -> int:
    """Prefer the venue_diagnostics dict from front_df.attrs (PR #15) so a venue
    that was LIVE_TRIMMED still counts. Fall back to distinct venues observed
    in the dislocations frame."""
    attrs = getattr(front_df, "attrs", {}) or {}
    diags = attrs.get("venue_diagnostics")
    if diags:
        return len(diags)
    if "venue" in dislocations.columns:
        return int(dislocations["venue"].nunique())
    return 0


def _empty_summary() -> ForwardRiskSummary:
    """Return a ForwardRiskSummary in a defensible "no data" state.

    Mirrors what build_forward_risk_summary would produce when handed empty
    inputs, without doing the work. Lets the UI render the cards without
    branching on every field.
    """
    from datetime import datetime, timezone

    return ForwardRiskSummary(
        valuation_timestamp=datetime.now(timezone.utc),
        risk_regime="Moderate",
        risk_score=0.0,
        n_forward_points=0,
        n_vol_points=0,
        front_forward_pct=None,
        back_forward_pct=None,
        avg_forward_pct=None,
        curve_slope_bp=None,
        curve_curvature_bp=None,
        front_vol_pct=None,
        back_vol_pct=None,
        avg_vol_pct=None,
        vol_slope_pct=None,
        avg_horizon_uncertainty_pct=None,
        peak_horizon_uncertainty_pct=None,
        dispersion_avg_bp=None,
        dispersion_peak_bp=None,
        confidence_score=None,
        method="v0.1.0-forward-risk-summary",
        diagnostics={"note": "empty snapshot — no inputs to score"},
    )


__all__ = [
    "DislocationStrip",
    "SimPosture",
    "REGIME_EXPLAINER",
    "build_sim_posture",
    "compute_dislocation_strip",
    "derive_forward_risk_summary",
]
