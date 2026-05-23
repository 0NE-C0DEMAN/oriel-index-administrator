from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

import math
import numpy as np
import pandas as pd


@dataclass(frozen=True)
class ForwardRiskConfig:
    elevated_avg_vol_pct: float = 0.75
    elevated_horizon_uncertainty_pct: float = 0.60
    elevated_curve_slope_bp: float = 75.0
    elevated_dispersion_bp: float = 35.0
    low_risk_score: float = 35.0
    elevated_risk_score: float = 65.0


@dataclass
class ForwardRiskSummary:
    valuation_timestamp: datetime
    risk_regime: str
    risk_score: float
    n_forward_points: int
    n_vol_points: int
    front_forward_pct: float | None
    back_forward_pct: float | None
    avg_forward_pct: float | None
    curve_slope_bp: float | None
    curve_curvature_bp: float | None
    front_vol_pct: float | None
    back_vol_pct: float | None
    avg_vol_pct: float | None
    vol_slope_pct: float | None
    avg_horizon_uncertainty_pct: float | None
    peak_horizon_uncertainty_pct: float | None
    dispersion_avg_bp: float | None = None
    dispersion_peak_bp: float | None = None
    confidence_score: float | None = None
    method: str = "v0.1.0-forward-risk-summary"
    diagnostics: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["valuation_timestamp"] = self.valuation_timestamp.isoformat()
        return payload


def build_forward_risk_summary(
    forward_curve: pd.DataFrame,
    vol_surface: pd.DataFrame,
    diagnostics_df: pd.DataFrame | None = None,
    config: ForwardRiskConfig | None = None,
) -> ForwardRiskSummary:
    cfg = config or ForwardRiskConfig()
    curve = _prepare_forward_curve(forward_curve)
    surface = _prepare_vol_surface(vol_surface)
    valuation_timestamp = datetime.now(timezone.utc)

    forward_stats = _forward_geometry(curve)
    vol_stats = _vol_geometry(surface)
    dispersion = _dispersion_stats(diagnostics_df)
    risk_score = _risk_score(forward_stats, vol_stats, dispersion, cfg)
    confidence = _confidence_score(surface, curve)

    diagnostics = {
        "config": asdict(cfg),
        "risk_components": _risk_components(forward_stats, vol_stats, dispersion, cfg),
        "risk_weights": _risk_weights(dispersion),
        "input_columns": {
            "forward_curve": list(forward_curve.columns),
            "vol_surface": list(vol_surface.columns),
            "diagnostics": list(diagnostics_df.columns) if diagnostics_df is not None else [],
        },
        "extension_hooks": ["otc_parity", "publishability_gates", "venue_residuals"],
    }

    return ForwardRiskSummary(
        valuation_timestamp=valuation_timestamp,
        risk_regime=classify_risk_regime(risk_score, cfg),
        risk_score=round(risk_score, 1),
        n_forward_points=int(len(curve)),
        n_vol_points=int(len(surface)),
        front_forward_pct=forward_stats["front_forward_pct"],
        back_forward_pct=forward_stats["back_forward_pct"],
        avg_forward_pct=forward_stats["avg_forward_pct"],
        curve_slope_bp=forward_stats["curve_slope_bp"],
        curve_curvature_bp=forward_stats["curve_curvature_bp"],
        front_vol_pct=vol_stats["front_vol_pct"],
        back_vol_pct=vol_stats["back_vol_pct"],
        avg_vol_pct=vol_stats["avg_vol_pct"],
        vol_slope_pct=vol_stats["vol_slope_pct"],
        avg_horizon_uncertainty_pct=vol_stats["avg_horizon_uncertainty_pct"],
        peak_horizon_uncertainty_pct=vol_stats["peak_horizon_uncertainty_pct"],
        dispersion_avg_bp=dispersion["dispersion_avg_bp"],
        dispersion_peak_bp=dispersion["dispersion_peak_bp"],
        confidence_score=confidence,
        diagnostics=diagnostics,
    )


def classify_risk_regime(risk_score: float, config: ForwardRiskConfig | None = None) -> str:
    cfg = config or ForwardRiskConfig()
    if risk_score < cfg.low_risk_score:
        return "Low"
    if risk_score < cfg.elevated_risk_score:
        return "Moderate"
    return "Elevated"


def _prepare_forward_curve(forward_curve: pd.DataFrame) -> pd.DataFrame:
    if forward_curve is None or forward_curve.empty:
        return pd.DataFrame(columns=["days_from_valuation", "forward_pct"])
    value_col = _first_column(
        forward_curve,
        ["expected_yoy_pct", "parent_forward_pct", "fair_value", "Expected Value (%)", "Expected Value"],
    )
    if value_col is None:
        raise ValueError("forward_curve must include an expected forward value column")
    out = forward_curve.copy()
    out["forward_pct"] = pd.to_numeric(out[value_col], errors="coerce")
    out["days_from_valuation"] = _days_from_valuation(out)
    out = out.dropna(subset=["days_from_valuation", "forward_pct"])
    return out.sort_values("days_from_valuation").reset_index(drop=True)


def _prepare_vol_surface(vol_surface: pd.DataFrame) -> pd.DataFrame:
    if vol_surface is None or vol_surface.empty:
        return pd.DataFrame(columns=["days_from_valuation", "implied_vol_pct", "ttm_years"])
    vol_col = _first_column(vol_surface, ["implied_vol_pct", "component_implied_vol_pct", "vol_pct"])
    if vol_col is None:
        raise ValueError("vol_surface must include an implied volatility column")
    out = vol_surface.copy()
    out["implied_vol_pct"] = pd.to_numeric(out[vol_col], errors="coerce")
    out["days_from_valuation"] = _days_from_valuation(out)
    if "ttm_years" in out.columns:
        out["ttm_years"] = pd.to_numeric(out["ttm_years"], errors="coerce")
    else:
        out["ttm_years"] = out["days_from_valuation"] / 365.25
    out["ttm_years"] = out["ttm_years"].clip(lower=1.0 / 365.25)
    out = out.dropna(subset=["days_from_valuation", "implied_vol_pct", "ttm_years"])
    return out.sort_values("days_from_valuation").reset_index(drop=True)


def _days_from_valuation(df: pd.DataFrame) -> pd.Series:
    if "days_from_valuation" in df.columns:
        return pd.to_numeric(df["days_from_valuation"], errors="coerce")
    date_col = _first_column(df, ["target_month", "Maturity", "maturity"])
    if date_col is None:
        return pd.Series(np.arange(len(df), dtype=float), index=df.index)
    dates = pd.to_datetime(df[date_col], errors="coerce")
    if dates.isna().all():
        return pd.Series(np.arange(len(df), dtype=float), index=df.index)
    start = dates.min()
    return ((dates - start) / pd.Timedelta(days=1)).astype(float)


def _forward_geometry(curve: pd.DataFrame) -> dict[str, float | None]:
    if curve.empty:
        return {
            "front_forward_pct": None,
            "back_forward_pct": None,
            "avg_forward_pct": None,
            "curve_slope_bp": None,
            "curve_curvature_bp": None,
        }
    y = curve["forward_pct"].to_numpy(dtype=float)
    x = curve["days_from_valuation"].to_numpy(dtype=float)
    front = float(y[0])
    back = float(y[-1])
    curvature = 0.0
    if len(curve) >= 3 and float(x[-1] - x[0]) > 0:
        linear = np.interp(x, [x[0], x[-1]], [y[0], y[-1]])
        curvature = float(np.max(np.abs((y - linear) * 100.0)))
    return {
        "front_forward_pct": round(front, 4),
        "back_forward_pct": round(back, 4),
        "avg_forward_pct": round(float(np.mean(y)), 4),
        "curve_slope_bp": round((back - front) * 100.0, 2),
        "curve_curvature_bp": round(curvature, 2),
    }


def _vol_geometry(surface: pd.DataFrame) -> dict[str, float | None]:
    if surface.empty:
        return {
            "front_vol_pct": None,
            "back_vol_pct": None,
            "avg_vol_pct": None,
            "vol_slope_pct": None,
            "avg_horizon_uncertainty_pct": None,
            "peak_horizon_uncertainty_pct": None,
        }
    vol = surface["implied_vol_pct"].to_numpy(dtype=float)
    ttm = surface["ttm_years"].to_numpy(dtype=float)
    horizon_uncertainty = vol * np.sqrt(np.maximum(ttm, 1.0 / 365.25))
    return {
        "front_vol_pct": round(float(vol[0]), 4),
        "back_vol_pct": round(float(vol[-1]), 4),
        "avg_vol_pct": round(float(np.mean(vol)), 4),
        "vol_slope_pct": round(float(vol[-1] - vol[0]), 4),
        "avg_horizon_uncertainty_pct": round(float(np.mean(horizon_uncertainty)), 4),
        "peak_horizon_uncertainty_pct": round(float(np.max(horizon_uncertainty)), 4),
    }


def _dispersion_stats(diagnostics_df: pd.DataFrame | None) -> dict[str, float | None]:
    if diagnostics_df is None or diagnostics_df.empty:
        return {"dispersion_avg_bp": None, "dispersion_peak_bp": None}
    col = _first_column(diagnostics_df, ["abs_curve_diff_bp", "dispersion_bp", "residual_bp", "abs_residual_bp"])
    if col is None:
        return {"dispersion_avg_bp": None, "dispersion_peak_bp": None}
    values = pd.to_numeric(diagnostics_df[col], errors="coerce").abs().dropna()
    if values.empty:
        return {"dispersion_avg_bp": None, "dispersion_peak_bp": None}
    return {
        "dispersion_avg_bp": round(float(values.mean()), 2),
        "dispersion_peak_bp": round(float(values.max()), 2),
    }


def _risk_score(
    forward_stats: dict[str, float | None],
    vol_stats: dict[str, float | None],
    dispersion: dict[str, float | None],
    config: ForwardRiskConfig,
) -> float:
    components = _risk_components(forward_stats, vol_stats, dispersion, config)
    weights = _risk_weights(dispersion)
    return float(sum(weights[name] * components[name] for name in weights))


def _risk_components(
    forward_stats: dict[str, float | None],
    vol_stats: dict[str, float | None],
    dispersion: dict[str, float | None],
    config: ForwardRiskConfig,
) -> dict[str, float]:
    slope = abs(float(forward_stats["curve_slope_bp"] or 0.0))
    curvature = abs(float(forward_stats["curve_curvature_bp"] or 0.0))
    geometry_bp = max(slope, curvature)
    return {
        "avg_vol": _score_ratio(vol_stats["avg_vol_pct"], config.elevated_avg_vol_pct),
        "horizon_uncertainty": _score_ratio(
            vol_stats["peak_horizon_uncertainty_pct"],
            config.elevated_horizon_uncertainty_pct,
        ),
        "curve_geometry": _score_ratio(geometry_bp, config.elevated_curve_slope_bp),
        "venue_dispersion": _score_ratio(dispersion["dispersion_peak_bp"], config.elevated_dispersion_bp),
    }


def _risk_weights(dispersion: dict[str, float | None]) -> dict[str, float]:
    if dispersion["dispersion_peak_bp"] is not None:
        return {
            "avg_vol": 0.35,
            "horizon_uncertainty": 0.25,
            "curve_geometry": 0.20,
            "venue_dispersion": 0.20,
        }
    return {
        "avg_vol": 0.4375,
        "horizon_uncertainty": 0.3125,
        "curve_geometry": 0.25,
    }


def _score_ratio(value: float | None, elevated_value: float) -> float:
    if value is None or elevated_value <= 0 or not math.isfinite(float(value)):
        return 0.0
    return round(min(max(float(value), 0.0) / elevated_value, 1.0) * 100.0, 2)


def _confidence_score(surface: pd.DataFrame, curve: pd.DataFrame) -> float | None:
    scores = []
    if not surface.empty and "confidence_score" in surface.columns:
        vals = pd.to_numeric(surface["confidence_score"], errors="coerce").dropna()
        if not vals.empty:
            scores.append(float(vals.mean()))
    coverage = min(min(len(surface), len(curve)) / 6.0, 1.0) * 100.0
    scores.append(coverage)
    if not scores:
        return None
    return round(float(np.mean(scores)), 1)


def _first_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for candidate in candidates:
        if candidate in df.columns:
            return candidate
    return None
