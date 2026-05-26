from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable

import pandas as pd


POLYMARKET_REASON_CODES = {
    "passes_current_screen",
    "maturity_not_aligned",
    "insufficient_liquidity",
    "stale_quote",
    "insufficient_confidence",
    "missing_threshold_or_normalization",
    "insufficient_contract_comparability",
    "insufficient_calibration_history",
    "not_applicable",
}


@dataclass(frozen=True)
class PolymarketEligibilityConfig:
    min_liquidity_score: float = 0.25
    min_confidence_score: float = 40.0
    max_quote_age_seconds: int | None = 900


def _get(row: Any, name: str, default: Any = None) -> Any:
    if isinstance(row, dict):
        return row.get(name, default)
    return getattr(row, name, default)


def _as_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        out = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(out):
        return None
    return out


def classify_polymarket_reference_eligibility(
    row: Any,
    *,
    config: PolymarketEligibilityConfig | None = None,
) -> dict[str, Any]:
    """Classify a normalized Polymarket CPI row for candidate eligibility.

    This is a diagnostics screen only. The historical calibration layer is left
    as a future score and is not treated as a hard blocker here.
    """
    cfg = config or PolymarketEligibilityConfig()
    venue = str(_get(row, "venue", "Polymarket") or "Polymarket")
    if venue.lower() != "polymarket":
        return {"eligible": False, "eligibility_status": "Not applicable", "reason_codes": ["not_applicable"]}

    reason_codes: list[str] = []
    release_month = _get(row, "release_month") or _get(row, "maturity")
    threshold = _get(row, "threshold")
    implied_yoy = _get(row, "expected_value", _get(row, "implied_yoy"))
    liquidity = _as_float(_get(row, "liquidity_score", 0.0))
    confidence = _as_float(_get(row, "confidence_score", 0.0))
    quote_age = _as_float(_get(row, "quote_age_seconds"))

    if not release_month:
        reason_codes.append("maturity_not_aligned")
    if threshold is None or _as_float(implied_yoy) is None:
        reason_codes.append("missing_threshold_or_normalization")
    if liquidity is None or liquidity < cfg.min_liquidity_score:
        reason_codes.append("insufficient_liquidity")
    if confidence is None or confidence < cfg.min_confidence_score:
        reason_codes.append("insufficient_confidence")
    if bool(_get(row, "is_stale", False)) or (
        cfg.max_quote_age_seconds is not None
        and quote_age is not None
        and quote_age > cfg.max_quote_age_seconds
    ):
        reason_codes.append("stale_quote")

    if not reason_codes:
        reason_codes = ["passes_current_screen"]
        status = "Eligible candidate"
        eligible = True
    else:
        status = "Coverage / quality review"
        eligible = False

    return {"eligible": eligible, "eligibility_status": status, "reason_codes": reason_codes}


def build_polymarket_eligibility_table(
    rows: Iterable[Any],
    *,
    config: PolymarketEligibilityConfig | None = None,
) -> pd.DataFrame:
    records: list[dict[str, Any]] = []
    for row in rows:
        result = classify_polymarket_reference_eligibility(row, config=config)
        venue = str(_get(row, "venue", "Polymarket") or "Polymarket")
        if venue.lower() != "polymarket":
            continue
        records.append(
            {
                "release_month": _get(row, "release_month", _get(row, "maturity")),
                "market_id": _get(row, "market_id", _get(row, "contract_label")),
                "contract_label": _get(row, "question", _get(row, "contract_label", _get(row, "slug"))),
                "threshold": _get(row, "threshold"),
                "implied_yoy": _get(row, "expected_value", _get(row, "implied_yoy")),
                "liquidity_score": _get(row, "liquidity_score"),
                "confidence_score": _get(row, "confidence_score"),
                "quote_age_seconds": _get(row, "quote_age_seconds"),
                "eligible": result["eligible"],
                "eligibility_status": result["eligibility_status"],
                "reason_codes": ", ".join(result["reason_codes"]),
            }
        )
    return pd.DataFrame(records)


def summarize_reason_codes(eligibility_table: pd.DataFrame) -> pd.DataFrame:
    counts: Counter[str] = Counter()
    if eligibility_table.empty or "reason_codes" not in eligibility_table.columns:
        return pd.DataFrame(columns=["reason_code", "count"])
    for value in eligibility_table["reason_codes"].fillna(""):
        for code in [part.strip() for part in str(value).split(",") if part.strip()]:
            if code != "passes_current_screen":
                counts[code] += 1
    return pd.DataFrame(
        [{"reason_code": code, "count": count} for code, count in counts.most_common()]
    )


def _month_key(value: Any) -> str:
    ts = pd.to_datetime(value, errors="coerce")
    if pd.notna(ts):
        return ts.strftime("%Y-%m")
    text = str(value or "").strip()
    parsed = pd.to_datetime(text, format="%b %Y", errors="coerce")
    if pd.notna(parsed):
        return parsed.strftime("%Y-%m")
    return text


def build_polymarket_shadow_blend_diagnostics(
    governed_curve: pd.DataFrame,
    polymarket_rows: Iterable[Any] | pd.DataFrame,
    *,
    polymarket_weight: float = 0.15,
    config: PolymarketEligibilityConfig | None = None,
) -> dict[str, Any]:
    """Build a Polymarket-inclusive shadow reference without mutating the curve."""
    current = governed_curve.copy()
    if current.empty:
        empty = pd.DataFrame(
            columns=[
                "release_month",
                "current_governed_reference",
                "polymarket_inclusive_shadow_reference",
                "curve_shift_bp",
                "effective_polymarket_weight",
                "eligible_polymarket_row_count",
                "excluded_polymarket_row_count",
                "exclusion_reason_summary",
            ]
        )
        return {"impact_by_maturity": empty, "eligibility_table": empty, "summary": {"status": "no_governed_curve"}}

    source_rows = polymarket_rows.to_dict("records") if isinstance(polymarket_rows, pd.DataFrame) else list(polymarket_rows)
    eligibility = build_polymarket_eligibility_table(source_rows, config=config)
    current["_month_key"] = current["target_month"].map(_month_key)
    impact_rows: list[dict[str, Any]] = []

    if eligibility.empty:
        for _, row in current.iterrows():
            impact_rows.append(
                {
                    "release_month": row["_month_key"],
                    "current_governed_reference": float(row["expected_yoy_pct"]),
                    "polymarket_inclusive_shadow_reference": float(row["expected_yoy_pct"]),
                    "curve_shift_bp": 0.0,
                    "effective_polymarket_weight": 0.0,
                    "eligible_polymarket_row_count": 0,
                    "excluded_polymarket_row_count": 0,
                    "exclusion_reason_summary": "no_polymarket_rows",
                }
            )
        return {
            "impact_by_maturity": pd.DataFrame(impact_rows),
            "eligibility_table": eligibility,
            "summary": {"status": "no_polymarket_rows", "default_governed_reference_changed": False},
        }

    eligibility["_month_key"] = eligibility["release_month"].map(_month_key)
    eligible = eligibility[eligibility["eligible"].astype(bool)].copy()
    excluded = eligibility[~eligibility["eligible"].astype(bool)].copy()
    eligible["implied_yoy"] = pd.to_numeric(eligible.get("implied_yoy"), errors="coerce")

    for _, row in current.iterrows():
        month = row["_month_key"]
        current_ref = float(row["expected_yoy_pct"])
        elig_month = eligible[eligible["_month_key"].eq(month)].dropna(subset=["implied_yoy"])
        excl_month = excluded[excluded["_month_key"].eq(month)]
        if elig_month.empty:
            eff_weight = 0.0
            shadow_ref = current_ref
        else:
            eff_weight = max(0.0, min(float(polymarket_weight), 1.0))
            poly_ref = float(elig_month["implied_yoy"].mean())
            shadow_ref = (1.0 - eff_weight) * current_ref + eff_weight * poly_ref
        reasons = summarize_reason_codes(excl_month)
        reason_summary = "none" if reasons.empty else "; ".join(
            f"{r.reason_code}: {int(r.count)}" for r in reasons.itertuples(index=False)
        )
        impact_rows.append(
            {
                "release_month": month,
                "current_governed_reference": round(current_ref, 6),
                "polymarket_inclusive_shadow_reference": round(shadow_ref, 6),
                "curve_shift_bp": round((shadow_ref - current_ref) * 100.0, 2) if eff_weight > 0 else 0.0,
                "effective_polymarket_weight": round(eff_weight, 4),
                "eligible_polymarket_row_count": int(len(elig_month)),
                "excluded_polymarket_row_count": int(len(excl_month)),
                "exclusion_reason_summary": reason_summary,
            }
        )

    status = "eligible_rows_available" if not eligible.empty else "zero_eligible_polymarket_rows"
    impact = pd.DataFrame(impact_rows)
    return {
        "impact_by_maturity": impact,
        "eligibility_table": eligibility.drop(columns=["_month_key"], errors="ignore"),
        "summary": {
            "status": status,
            "default_governed_reference_changed": False,
            "eligible_polymarket_row_count": int(len(eligible)),
            "excluded_polymarket_row_count": int(len(excluded)),
            "avg_abs_curve_shift_bp": float(impact["curve_shift_bp"].abs().mean()) if not impact.empty else 0.0,
        },
    }
