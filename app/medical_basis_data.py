"""
medical_basis_data.py — Build the ForecastEx Medical Inflation Basis
Contract payload by importing v7's analytics.medical_basis_contract
verbatim and serializing every surface the React panel renders.

Data flow (mirrors v7 tabs/medical_basis_tab.py 1:1):
  • load_sample_medical_basis_contracts()  → ladder DataFrame
  • build_basis_curve(ladder)              → BasisCurve (points, ladder,
                                              distribution, repaired flag)
  • basis_curve_dataframe(curve)           → DataFrame of basis-curve points
  • contract_spec_dataframe()              → 7-row Field/Value spec
  • settlement_example()                   → default settlement (3.1%/5.6%)

Inputs are STATIC (CSV under v7/data/), so this is fully deterministic
— same as v7's @st.cache_data(ttl=600). The user-facing knobs (maturity
selector + settlement-calculator inputs) live in the React UI and are
recomputed client-side from the shipped curve.
"""
from __future__ import annotations

import functools
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


_V7_ROOT = (Path(__file__).resolve().parent.parent / "oriel_demo_v7").resolve()
if str(_V7_ROOT) not in sys.path:
    sys.path.insert(0, str(_V7_ROOT))


@functools.lru_cache(maxsize=1)
def _load_curve():
    """v7's _cached_medical_basis_curve() — load sample ladder, build
    the basis curve (points + distribution + repaired flag)."""
    try:
        from analytics.medical_basis_contract import (
            build_basis_curve,
            basis_curve_dataframe,
            contract_spec_dataframe,
            load_sample_medical_basis_contracts,
            settlement_example,
            DEFAULT_THRESHOLDS_BPS,
            MedicalBasisContractSpec,
        )
    except Exception as ex:
        logger.warning("Medical Basis: import failed (%s)", ex)
        return None

    try:
        ladder = load_sample_medical_basis_contracts()
        curve = build_basis_curve(ladder)
        return {
            "curve": curve,
            "curve_df": basis_curve_dataframe(curve),
            "spec_df": contract_spec_dataframe(),
            "settlement": settlement_example(),
            "default_thresholds": list(DEFAULT_THRESHOLDS_BPS),
            "spec": MedicalBasisContractSpec(),
        }
    except Exception as ex:
        logger.warning("Medical Basis: build failed (%s)", ex)
        return None


def _to_iso(ts) -> str:
    """pandas Timestamp / datetime → ISO date string (YYYY-MM-DD)."""
    try:
        return ts.strftime("%Y-%m-%d")
    except Exception:
        return str(ts)


def _to_year(ts) -> str:
    try:
        return ts.strftime("%Y")
    except Exception:
        return str(ts)[:4]


def _build_payload() -> Dict[str, Any] | None:
    bundle = _load_curve()
    if bundle is None:
        return None
    curve     = bundle["curve"]
    curve_df  = bundle["curve_df"]
    spec_df   = bundle["spec_df"]
    settle    = bundle["settlement"]
    spec      = bundle["spec"]

    # ── Basis curve points (4 maturities) ───────────────────────────────
    # Mirrors v7's basis_curve_dataframe(curve) row-by-row.
    basis_points: List[Dict[str, Any]] = []
    for _, r in curve_df.iterrows():
        basis_points.append({
            "maturity":             _to_iso(r["maturity"]),
            "year":                 _to_year(r["maturity"]),
            "observationWindow":    str(r["observation_window"]),
            "expectedSpreadBps":    float(r["expected_spread_bps"]),
            "expectedSpreadPct":    float(r["expected_spread_pct"]),
            "probabilityGt0":       float(r["probability_spread_gt_0"]) if r["probability_spread_gt_0"] == r["probability_spread_gt_0"] else None,
            "probabilityGt200":     float(r["probability_spread_gt_200"]) if r["probability_spread_gt_200"] == r["probability_spread_gt_200"] else None,
            "maxThresholdBps":      int(r["max_threshold_bps"]),
            "sourceStatus":         str(r["source_status"]),
        })

    # ── Ladder rows (5 thresholds × 4 maturities) ───────────────────────
    ladder_rows: List[Dict[str, Any]] = []
    for _, r in curve.ladder.iterrows():
        ladder_rows.append({
            "maturity":          _to_iso(r["maturity"]),
            "year":              _to_year(r["maturity"]),
            "observationWindow": str(r.get("observation_window", "")),
            "thresholdBps":      int(r["threshold_bps"]),
            "yesPrice":          float(r["yes_price"]),
            "bid":               float(r["bid"]) if "bid" in r and r["bid"] == r["bid"] else None,
            "ask":               float(r["ask"]) if "ask" in r and r["ask"] == r["ask"] else None,
            "volume":            int(r["volume"]) if "volume" in r and r["volume"] == r["volume"] else 0,
            "openInterest":      int(r["open_interest"]) if "open_interest" in r and r["open_interest"] == r["open_interest"] else 0,
            "source":            str(r.get("source", "sample")),
            "sourceStatus":      str(r.get("source_status", "SAMPLE")),
            "contractLabel":     str(r.get("contract_label", f"Spread > {int(r['threshold_bps'])} bps")),
        })

    # ── Distribution rows (6 buckets × 4 maturities) ────────────────────
    distribution_rows: List[Dict[str, Any]] = []
    for _, r in curve.distribution.iterrows():
        # Replace inf/-inf with None so JSON encodes cleanly.
        lo = r["lower_bps"]
        hi = r["upper_bps"]
        try:
            lo_v = None if (lo == float("-inf") or lo == float("inf")) else float(lo)
            hi_v = None if (hi == float("-inf") or hi == float("inf")) else float(hi)
        except Exception:
            lo_v, hi_v = None, None
        distribution_rows.append({
            "maturity":          _to_iso(r["maturity"]),
            "year":              _to_year(r["maturity"]),
            "observationWindow": str(r.get("observation_window", "")),
            "bucket":            str(r["bucket"]),
            "lowerBps":          lo_v,
            "upperBps":          hi_v,
            "midpointBps":       float(r["midpoint_bps"]),
            "probability":       float(r["probability"]),
        })

    # ── Contract spec (7 rows) ──────────────────────────────────────────
    spec_rows = [
        {"field": str(r["Field"]), "value": str(r["Value"])}
        for _, r in spec_df.iterrows()
    ]

    # ── Settlement example (default 5.6 / 3.1 / 200) ────────────────────
    settlement = {
        "cpiYoyPct":          float(settle.cpi_yoy_pct),
        "medicalCpiYoyPct":   float(settle.medical_cpi_yoy_pct),
        "spreadPct":          float(settle.spread_pct),
        "spreadBps":          float(settle.spread_bps),
        "thresholdBps":       int(settle.threshold_bps),
        "settlesYes":         bool(settle.settles_yes),
        "payout":             float(settle.payout),
    }

    # ── Reference legs (the 3 cards at the top of v7's tab) ─────────────
    legs = [
        {
            "kind":        "Reference Leg",
            "name":        spec.reference_leg_1.name,
            "description": spec.reference_leg_1.description,
            "source":      spec.reference_leg_1.source,
            "calculation": spec.reference_leg_1.calculation,
        },
        {
            "kind":        "Reference Leg",
            "name":        spec.reference_leg_2.name,
            "description": spec.reference_leg_2.description,
            "source":      spec.reference_leg_2.source,
            "calculation": spec.reference_leg_2.calculation,
        },
        {
            "kind":        "Contract Event",
            "name":        "Medical CPI − CPI-U > threshold",
            "description": "A YES/NO basis contract that prices healthcare inflation outperformance.",
            "source":      "ForecastEx-style binary thresholds",
            "calculation": spec.payout,
        },
    ]

    return {
        "basisPoints":       basis_points,
        "ladder":            ladder_rows,
        "distribution":      distribution_rows,
        "contractSpec":      spec_rows,
        "settlementExample": settlement,
        "referenceLegs":     legs,
        "defaultThresholds": [int(t) for t in bundle["default_thresholds"]],
        "meta": {
            "version":        "0.1.0-medical-basis",
            "phaseLabel":     spec.phase_label,
            "contractName":   spec.contract_name,
            "question":       spec.question,
            "users":          spec.users,
            "repaired":       bool(curve.repaired),
            "sourceStatus":   curve.source_status,
            "thresholdRange": [int(min(bundle["default_thresholds"])), int(max(bundle["default_thresholds"]))],
        },
    }


def medical_basis_payload_json() -> str:
    """Public API. Returns JSON-encoded payload, or 'null' on any failure
    so the React app falls back to its in-bundle sample data."""
    try:
        payload = _build_payload()
        if payload is None:
            return "null"
        return json.dumps(payload, default=str)
    except Exception as ex:
        logger.warning("Medical Basis: payload build failed (%s)", ex)
        return "null"


if __name__ == "__main__":
    out = medical_basis_payload_json()
    print(f"payload bytes: {len(out):,}")
    print(out[:1500])
