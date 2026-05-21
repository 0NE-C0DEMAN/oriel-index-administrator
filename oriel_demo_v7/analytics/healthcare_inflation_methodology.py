from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict

import pandas as pd
import requests

from analytics.medical_cpi_tracker import BLS_API_URL, load_medical_cpi_panel

DEFAULT_WEIGHT_PATH = Path(__file__).resolve().parents[1] / "data" / "healthcare_inflation" / "healthcare_inflation_component_weights.csv"
HEADLINE_CPI_SERIES_ID = "CUUR0000SA0"


@dataclass(frozen=True)
class HealthcareWeightConfig:
    component_name: str
    bls_series_id: str
    component_weight: float
    methodology_version: str
    effective_date: str
    weighting_method: str
    rationale: str
    notes: str


@dataclass(frozen=True)
class HealthcareInflationResult:
    methodology_version: str
    effective_date: str
    weighting_method: str
    observation_month: pd.Timestamp
    reference_period: str
    healthcare_inflation_reference_yoy_pct: float
    headline_cpi_yoy_pct: float
    healthcare_inflation_spread_bp: float
    source_provenance: str
    source_status: str = "live"


def load_healthcare_weights(path: Path | str = DEFAULT_WEIGHT_PATH) -> pd.DataFrame:
    df = pd.read_csv(path)
    required = {
        "component_name", "bls_series_id", "component_weight", "methodology_version",
        "effective_date", "weighting_method", "rationale", "notes",
    }
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(f"weights file missing required columns: {sorted(missing)}")
    df["component_weight"] = df["component_weight"].astype(float)
    validate_weights(df)
    return df


def validate_weights(weights_df: pd.DataFrame) -> None:
    if weights_df.empty:
        raise ValueError("weights cannot be empty")
    total = float(weights_df["component_weight"].sum())
    if abs(total - 1.0) > 1e-9:
        raise ValueError(f"component weights must sum to 1.0, got {total:.10f}")
    if weights_df["component_name"].duplicated().any():
        raise ValueError("component_name values must be unique")


def compute_component_yoy(series_history: pd.DataFrame) -> pd.DataFrame:
    required = {"component_name", "date", "index_level"}
    missing = required.difference(series_history.columns)
    if missing:
        raise ValueError(f"series_history missing required columns: {sorted(missing)}")
    g = series_history.copy()
    g["date"] = pd.to_datetime(g["date"])
    g = g.sort_values(["component_name", "date"])
    g["component_yoy_pct"] = 100.0 * (g["index_level"] / g.groupby("component_name")["index_level"].shift(12) - 1.0)
    return g


def build_healthcare_inflation_reference(component_yoy_df: pd.DataFrame, weights_df: pd.DataFrame, headline_cpi_yoy_pct: float) -> HealthcareInflationResult:
    merged = component_yoy_df.merge(weights_df[["component_name", "component_weight"]], on="component_name", how="inner")
    latest = merged.sort_values("date").groupby("component_name", as_index=False).tail(1)
    if latest["component_yoy_pct"].isna().any():
        raise ValueError("component YoY cannot be null for reference-month calculation")

    # Contract-grade methodology hardening: refuse to silently blend
    # component values pulled from different BLS reference months.  Under
    # normal BLS publication these align, but if upstream selection ever
    # lands on mismatched months (sparse panels, partial seed data,
    # mid-release windows) we want a hard, traceable failure rather than
    # a mixed-month reference flowing through to contract settlement.
    obs_dates = pd.to_datetime(latest["date"]).dt.normalize().unique()
    if len(obs_dates) > 1:
        per_component_dates = {
            str(row["component_name"]): pd.to_datetime(row["date"]).strftime("%Y-%m-%d")
            for _, row in latest.sort_values("component_name").iterrows()
        }
        raise ValueError(
            "Healthcare inflation components must share a common observation month "
            f"before the weighted reference is calculated; got {per_component_dates}. "
            "Refusing to silently blend component YoY values from different "
            "BLS reference months."
        )

    ref_yoy = float((latest["component_weight"] * latest["component_yoy_pct"]).sum())
    spread_bp = (ref_yoy - float(headline_cpi_yoy_pct)) * 100.0

    meta = weights_df.iloc[0]
    obs = pd.to_datetime(latest["date"].max())
    return HealthcareInflationResult(
        methodology_version=str(meta["methodology_version"]),
        effective_date=str(meta["effective_date"]),
        weighting_method=str(meta["weighting_method"]),
        observation_month=obs,
        reference_period=f"12 months ending {obs.strftime('%B %Y')}",
        healthcare_inflation_reference_yoy_pct=ref_yoy,
        headline_cpi_yoy_pct=float(headline_cpi_yoy_pct),
        healthcare_inflation_spread_bp=float(spread_bp),
        source_provenance="BLS CPI-U public series + versioned healthcare weight configuration",
    )


def methodology_summary_text() -> Dict[str, str]:
    return {
        "how_reference_is_calculated": "Healthcare inflation reference = weighted blend of Hospital Services, Physician Services, and Prescription Drugs CPI YoY using normalized pilot weights (40%/35%/25%).",
        "why_not_single_medical_cpi": "These are not BLS relative-importance weights and are not intended to reconstruct official BLS Medical Care CPI; they define an initial transparent pilot reference that can be refreshed in later methodology versions.",
        "how_spread_is_calculated": "Medical inflation spread (bp) = (healthcare inflation reference YoY - headline CPI-U all-items YoY) * 100.",
        "role_separation": "Oriel provides the module and analytics; CareFi licenses/applies this healthcare methodology; Manifold is the immediate pilot venue; ForecastEx is the later formal listing target.",
    }


def result_to_frame(result: HealthcareInflationResult) -> pd.DataFrame:
    return pd.DataFrame([asdict(result)])


def fetch_headline_cpi_yoy_latest(timeout_seconds: float = 20.0) -> tuple[float, pd.Timestamp]:
    now = pd.Timestamp.utcnow().tz_localize(None)
    payload = {
        "seriesid": [HEADLINE_CPI_SERIES_ID],
        "startyear": str(now.year - 3),
        "endyear": str(now.year),
        "registrationkey": "",
    }
    response = requests.post(BLS_API_URL, json=payload, timeout=timeout_seconds)
    response.raise_for_status()
    raw = response.json()
    rows = []
    for series in raw.get("Results", {}).get("series", []):
        for obs in series.get("data", []):
            period = obs.get("period")
            if not isinstance(period, str) or not period.startswith("M") or period == "M13":
                continue
            rows.append({
                "date": pd.Timestamp(year=int(obs["year"]), month=int(period[1:]), day=1),
                "level": float(obs["value"]),
            })
    df = pd.DataFrame(rows).sort_values("date")
    if df.empty:
        raise ValueError("No headline CPI observations returned from BLS")
    df["yoy_pct"] = 100.0 * (df["level"] / df["level"].shift(12) - 1.0)
    latest = df.dropna(subset=["yoy_pct"]).tail(1)
    if latest.empty:
        raise ValueError("Insufficient headline CPI history for YoY")
    row = latest.iloc[0]
    return float(row["yoy_pct"]), pd.to_datetime(row["date"])


def build_latest_methodology_snapshot(prefer_live: bool = True) -> tuple[pd.DataFrame, HealthcareInflationResult]:
    weights = load_healthcare_weights()
    panel = load_medical_cpi_panel(prefer_live=prefer_live)
    latest = panel.latest_table.copy()
    component_names = {"Hospital Services": "Hospital services", "Physician Services": "Physicians' services", "Prescription Drugs": "Prescription drugs"}
    rows = []
    for cname, tracker_name in component_names.items():
        hit = latest[latest["component"] == tracker_name]
        if hit.empty:
            raise ValueError(f"Missing medical component in BLS panel: {tracker_name}")
        rows.append({"component_name": cname, "date": pd.to_datetime(hit["As Of"].iloc[0]), "component_yoy_pct": float(hit["Y/Y (%)"].iloc[0])})
    component_yoy_df = pd.DataFrame(rows)
    source_status = panel.source_status
    try:
        headline_yoy, headline_date = fetch_headline_cpi_yoy_latest()
    except Exception:
        headline_yoy = 3.1
        headline_date = component_yoy_df["date"].max()
        source_status = "fallback"
    result = build_healthcare_inflation_reference(component_yoy_df, weights, headline_yoy)
    result = HealthcareInflationResult(**{**asdict(result), "observation_month": min(result.observation_month, headline_date), "source_status": source_status})
    merged = component_yoy_df.merge(weights[["component_name", "component_weight", "bls_series_id"]], on="component_name", how="left")
    return merged, result
