from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd

DEFAULT_THRESHOLDS_BP = (0, 50, 100, 200)
DEFAULT_METHOD_VERSION = "v1.0.0"
DEFAULT_OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "healthcare_inflation" / "dec_2027_healthcare_inflation_spread_contract_ladder.csv"


@dataclass(frozen=True)
class HealthcareSpreadContract:
    contract_id: str
    contract_title: str
    short_description: str
    threshold_bp: int
    comparison_operator: str
    observation_period: str
    measurement_start_month: str
    measurement_end_month: str
    settlement_formula: str
    resolution_language: str
    worked_example_summary: str
    official_public_data_source: str
    methodology_reference: str
    methodology_version: str
    immediate_pilot_venue: str = "Manifold"
    later_formal_listing_relevance: str = "ForecastEx"
    external_market_source: str | None = None
    external_market_id: str | None = None
    external_probability: float | None = None
    probability_as_of: str | None = None


def build_dec_2027_contract_ladder(methodology_version: str = DEFAULT_METHOD_VERSION) -> pd.DataFrame:
    rows = []
    for threshold in DEFAULT_THRESHOLDS_BP:
        cid = f"healthcare-inflation-spread-dec2027-gt-{threshold}bp"
        rows.append(asdict(HealthcareSpreadContract(
            contract_id=cid,
            contract_title=f"Medical inflation spread > {threshold} bps (12m ending Dec 2027)?",
            short_description="Resolves YES if weighted healthcare inflation reference YoY exceeds headline CPI YoY by more than threshold.",
            threshold_bp=threshold,
            comparison_operator=">",
            observation_period="12 months ending December 2027",
            measurement_start_month="2027-01",
            measurement_end_month="2027-12",
            settlement_formula="spread_bp = (healthcare_inflation_reference_yoy_pct - headline_cpi_yoy_pct) * 100",
            resolution_language=f"YES if spread_bp > {threshold}; otherwise NO.",
            worked_example_summary="If reference YoY=4.20% and headline YoY=3.10%, spread=110 bps => >0 YES, >50 YES, >100 YES, >200 NO.",
            official_public_data_source="U.S. Bureau of Labor Statistics CPI-U",
            methodology_reference="Oriel healthcare inflation methodology module",
            methodology_version=methodology_version,
        )))
    return pd.DataFrame(rows)


def evaluate_thresholds(spread_bp: float, thresholds: tuple[int, ...] = DEFAULT_THRESHOLDS_BP) -> pd.DataFrame:
    return pd.DataFrame([
        {"threshold_bp": t, "comparison_operator": ">", "resolves_yes": bool(spread_bp > t)} for t in thresholds
    ])


def export_default_contract_ladder(path: Path | str = DEFAULT_OUTPUT_PATH, methodology_version: str = DEFAULT_METHOD_VERSION) -> pd.DataFrame:
    df = build_dec_2027_contract_ladder(methodology_version=methodology_version)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    return df
