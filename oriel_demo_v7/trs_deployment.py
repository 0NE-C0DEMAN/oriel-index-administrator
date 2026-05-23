"""Illustrative TRS / micro-fund deployment scenario for the market-sim app.

This module intentionally stays small and deterministic. It is not a dealer
TRS pricer; it translates the existing market-sim backtest summary into an
auditable pilot-sizing view for micro-fund capital, synthetic CPI exposure,
financing, collateral, and CPI perp/reference hedge assumptions.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Mapping, Sequence


HEDGE_MODE_UNHEDGED = "Unhedged"
HEDGE_MODE_PARTIAL = "Partial CPI perp/reference hedge"
HEDGE_MODE_FULL = "Full CPI perp/reference hedge"

DEFAULT_HEDGE_RATIOS = {
    HEDGE_MODE_UNHEDGED: 0.0,
    HEDGE_MODE_PARTIAL: 0.75,
    HEDGE_MODE_FULL: 1.0,
}


@dataclass(frozen=True)
class TRSDeploymentInputs:
    fund_capital_usd: float = 3_000_000.0
    trs_notional_multiple: float = 2.0
    initial_margin_pct: float = 0.25
    financing_rate_pct: float = 0.06
    collateral_yield_pct: float = 0.0
    hedge_mode: str = HEDGE_MODE_PARTIAL
    hedge_ratio: float | None = None
    dislocation_retention: float = 1.0
    horizon_days: int = 30


@dataclass(frozen=True)
class TRSDeploymentResult:
    scenario_label: str
    fund_capital_usd: float
    trs_notional_usd: float
    required_margin_usd: float
    available_liquidity_usd: float
    pnl_scale: float
    gross_dislocation_pnl_usd: float
    spread_capture_pnl_usd: float
    gross_directional_pnl_usd: float
    hedge_pnl_usd: float
    residual_basis_pnl_usd: float
    financing_cost_usd: float
    collateral_yield_usd: float
    net_fund_pnl_usd: float
    return_on_capital_pct: float
    max_gross_exposure_usd: float
    net_exposure_after_hedge_usd: float
    max_inventory_usd: float
    max_net_inventory_after_hedge_usd: float
    capital_efficiency_ratio: float
    stress_drawdown_proxy_usd: float
    hedge_ratio: float
    liquidity_self_sufficiency_score: float
    market_stability_score: float
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class TRSScenarioComparisonRow:
    scenario: str
    fund_capital_usd: float
    trs_notional_usd: float
    required_margin_usd: float
    gross_exposure_usd: float
    net_exposure_after_hedge_usd: float
    net_pnl_usd: float
    return_on_capital_pct: float
    max_inventory_usd: float
    residual_basis_risk_usd: float
    capital_efficiency_ratio: float
    liquidity_self_sufficiency_score: float


def hedge_ratio_for_mode(hedge_mode: str, hedge_ratio: float | None = None) -> float:
    if hedge_ratio is None:
        hedge_ratio = DEFAULT_HEDGE_RATIOS.get(hedge_mode, 0.0)
    return _clamp(float(hedge_ratio), 0.0, 1.0)


def build_trs_deployment_scenario(
    backtest_summary: Mapping[str, object],
    inputs: TRSDeploymentInputs,
    *,
    scenario_label: str = "TRS wrapper, selected hedge",
) -> TRSDeploymentResult:
    warnings: list[str] = []
    fund_capital = max(float(inputs.fund_capital_usd or 0.0), 0.0)
    if fund_capital <= 0.0:
        warnings.append("Fund capital must be greater than zero.")

    notional_multiple = max(float(inputs.trs_notional_multiple or 0.0), 0.0)
    margin_pct = max(float(inputs.initial_margin_pct or 0.0), 0.0)
    retention = _clamp(float(inputs.dislocation_retention or 0.0), 0.0, 1.0)
    hedge_ratio = hedge_ratio_for_mode(inputs.hedge_mode, inputs.hedge_ratio)
    horizon_days = max(int(inputs.horizon_days or 0), 0)

    launch_notional = _summary_float(backtest_summary, "launch_notional_usd", 0.0)
    if launch_notional <= 0.0:
        warnings.append("Launch notional is unavailable; PnL scaling is disabled.")

    trs_notional = fund_capital * notional_multiple
    required_margin = trs_notional * margin_pct
    available_liquidity = fund_capital - required_margin
    if required_margin > fund_capital:
        warnings.append("Required margin exceeds fund capital.")

    pnl_scale = trs_notional / launch_notional if launch_notional > 0.0 else 0.0
    base_spread_pnl = _summary_float(backtest_summary, "spread_capture_pnl_usd", 0.0)
    base_directional_pnl = _summary_float(backtest_summary, "directional_pnl_usd", 0.0)
    base_total_pnl = _summary_float(backtest_summary, "total_pnl_usd", base_spread_pnl + base_directional_pnl)

    scaled_spread = base_spread_pnl * pnl_scale * retention
    scaled_directional = base_directional_pnl * pnl_scale * retention
    hedge_pnl = -scaled_directional * hedge_ratio
    residual_basis = scaled_directional + hedge_pnl

    financing_cost = trs_notional * max(float(inputs.financing_rate_pct or 0.0), 0.0) * horizon_days / 365.0
    collateral_yield = required_margin * max(float(inputs.collateral_yield_pct or 0.0), 0.0) * horizon_days / 365.0
    net_fund_pnl = scaled_spread + residual_basis - financing_cost + collateral_yield
    return_on_capital = (net_fund_pnl / fund_capital * 100.0) if fund_capital > 0.0 else 0.0
    capital_efficiency = (trs_notional / required_margin) if required_margin > 0.0 else 0.0
    net_exposure = trs_notional * (1.0 - hedge_ratio)

    base_max_inventory = _summary_float(backtest_summary, "max_inventory_usd", 0.0)
    max_inventory = base_max_inventory * pnl_scale
    max_net_inventory = max_inventory * (1.0 - hedge_ratio)
    gross_dislocation_pnl = base_total_pnl * pnl_scale * retention
    stress_drawdown = abs(scaled_directional) * (1.0 - hedge_ratio) + max(financing_cost - collateral_yield, 0.0)

    return TRSDeploymentResult(
        scenario_label=scenario_label,
        fund_capital_usd=fund_capital,
        trs_notional_usd=trs_notional,
        required_margin_usd=required_margin,
        available_liquidity_usd=available_liquidity,
        pnl_scale=pnl_scale,
        gross_dislocation_pnl_usd=gross_dislocation_pnl,
        spread_capture_pnl_usd=scaled_spread,
        gross_directional_pnl_usd=scaled_directional,
        hedge_pnl_usd=hedge_pnl,
        residual_basis_pnl_usd=residual_basis,
        financing_cost_usd=financing_cost,
        collateral_yield_usd=collateral_yield,
        net_fund_pnl_usd=net_fund_pnl,
        return_on_capital_pct=return_on_capital,
        max_gross_exposure_usd=trs_notional,
        net_exposure_after_hedge_usd=net_exposure,
        max_inventory_usd=max_inventory,
        max_net_inventory_after_hedge_usd=max_net_inventory,
        capital_efficiency_ratio=capital_efficiency,
        stress_drawdown_proxy_usd=stress_drawdown,
        hedge_ratio=hedge_ratio,
        liquidity_self_sufficiency_score=_summary_float(backtest_summary, "liquidity_self_sufficiency_score", 0.0),
        market_stability_score=_summary_float(backtest_summary, "market_stability_score", 0.0),
        warnings=tuple(warnings),
    )


def build_trs_scenario_comparison(
    backtest_summary: Mapping[str, object],
    inputs: TRSDeploymentInputs,
) -> list[TRSScenarioComparisonRow]:
    scenarios: Sequence[tuple[str, TRSDeploymentInputs]] = (
        (
            "No TRS / cash-only exposure",
            replace(
                inputs,
                trs_notional_multiple=1.0,
                initial_margin_pct=1.0,
                financing_rate_pct=0.0,
                collateral_yield_pct=0.0,
                hedge_mode=HEDGE_MODE_UNHEDGED,
                hedge_ratio=0.0,
            ),
        ),
        (
            "TRS wrapper, unhedged",
            replace(inputs, hedge_mode=HEDGE_MODE_UNHEDGED, hedge_ratio=0.0),
        ),
        (
            "TRS wrapper, partial hedge",
            replace(inputs, hedge_mode=HEDGE_MODE_PARTIAL, hedge_ratio=DEFAULT_HEDGE_RATIOS[HEDGE_MODE_PARTIAL]),
        ),
        (
            "TRS wrapper, full hedge",
            replace(inputs, hedge_mode=HEDGE_MODE_FULL, hedge_ratio=DEFAULT_HEDGE_RATIOS[HEDGE_MODE_FULL]),
        ),
    )
    rows: list[TRSScenarioComparisonRow] = []
    for label, scenario_inputs in scenarios:
        result = build_trs_deployment_scenario(backtest_summary, scenario_inputs, scenario_label=label)
        rows.append(
            TRSScenarioComparisonRow(
                scenario=label,
                fund_capital_usd=result.fund_capital_usd,
                trs_notional_usd=result.trs_notional_usd,
                required_margin_usd=result.required_margin_usd,
                gross_exposure_usd=result.max_gross_exposure_usd,
                net_exposure_after_hedge_usd=result.net_exposure_after_hedge_usd,
                net_pnl_usd=result.net_fund_pnl_usd,
                return_on_capital_pct=result.return_on_capital_pct,
                max_inventory_usd=result.max_inventory_usd,
                residual_basis_risk_usd=abs(result.residual_basis_pnl_usd),
                capital_efficiency_ratio=result.capital_efficiency_ratio,
                liquidity_self_sufficiency_score=result.liquidity_self_sufficiency_score,
            )
        )
    return rows


def _summary_float(summary: Mapping[str, object], key: str, default: float) -> float:
    try:
        value = summary.get(key, default)
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


__all__ = [
    "DEFAULT_HEDGE_RATIOS",
    "HEDGE_MODE_FULL",
    "HEDGE_MODE_PARTIAL",
    "HEDGE_MODE_UNHEDGED",
    "TRSDeploymentInputs",
    "TRSDeploymentResult",
    "TRSScenarioComparisonRow",
    "build_trs_deployment_scenario",
    "build_trs_scenario_comparison",
    "hedge_ratio_for_mode",
]
