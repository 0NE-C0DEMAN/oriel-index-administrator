"""
parity_data.py — Build the OTC Parity Validation payload by importing v7's
parity engine + analytics.dtcc_term_calibration verbatim and serializing
every artifact the React Parity tab renders.

Mirrors v7 tabs/parity_tab.py 1:1 in DATA:

  4 sub-views, four payload keys returned in one bundle:
    • term       — DTCC live term calibration (NOT parity, reference only)
    • tight      — Reference OTC benchmark vs Oriel curve
    • dtcc       — DTCC SDR Calibration Sample vs Oriel curve
    • neg        - Publish-Block Stress Test (negative control)

Parity body for tight / dtcc / neg:
    summary       — {overall_status, basis_gate_status, shape_gate_status,
                     avg_abs_basis_bp, max_abs_basis_bp, pct_within_tolerance,
                     r_squared, shape_metrics, conditions, thresholds,
                     months_tested}
    parity_rows   — per-target-month (oriel/otc rates, implied indices,
                     diff_bps, within_tolerance, status, etc.)
    grid_rows     — dense common-grid (oriel/otc implied indices,
                     index_basis), produced by build_curve_comparison_grid
    benchmark     — {file, label}

Term calibration body:
    by_tenor      — all tenors with stats
    std_tenors    — filtered to 1Y/2Y/3Y/5Y/10Y/30Y
    aggregates    — total_trades, total_notional_usd, n_std_tenors,
                     n_all_tenors, std_tenor_wtd_avg
    exec_window   — {first, last}

Inputs are STATIC build artifacts; loader is wrapped in @st.cache_data
in streamlit_app.py with a 1h TTL.
"""
from __future__ import annotations

import functools
import json
import logging
import math
import sys
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


_V7_ROOT = (Path(__file__).resolve().parent.parent / "oriel_demo_v7").resolve()
if str(_V7_ROOT) not in sys.path:
    sys.path.insert(0, str(_V7_ROOT))


def _is_nan(v) -> bool:
    try:
        return isinstance(v, float) and math.isnan(v)
    except Exception:
        return False


def _safe_float(v):
    if v is None:
        return None
    try:
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


def _safe_int(v):
    if v is None or _is_nan(v):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _to_iso(ts) -> str | None:
    """Pandas Timestamp / datetime → 'YYYY-MM-DD'. Returns None on failure."""
    if ts is None:
        return None
    try:
        return ts.strftime("%Y-%m-%d")
    except Exception:
        s = str(ts)
        return s[:10] if len(s) >= 10 else s


def _to_month_label(ts) -> str | None:
    """Pandas Timestamp → 'Mar 2026' (mirrors v7's strftime("%b %Y"))."""
    if ts is None:
        return None
    try:
        return ts.strftime("%b %Y")
    except Exception:
        return str(ts)


# ─────────────────────────────────────────────────────────────────────────────
# Parity (3 benchmarks)
# ─────────────────────────────────────────────────────────────────────────────

@functools.lru_cache(maxsize=1)
def _load_parity_modules():
    """v7's parity package + config import, cached."""
    try:
        from parity import (
            run_parity,
            ORIEL_CURVE_PATH, TIGHTER_BENCHMARK_PATH,
            DTCC_BENCHMARK_PATH, NEGATIVE_CONTROL_PATH, OUTPUT_DIR,
            THRESHOLDS,
        )
    except Exception as ex:
        logger.warning("Parity: import failed (%s)", ex)
        return None
    return {
        "run_parity":            run_parity,
        "ORIEL_CURVE_PATH":      ORIEL_CURVE_PATH,
        "TIGHTER_BENCHMARK_PATH": TIGHTER_BENCHMARK_PATH,
        "DTCC_BENCHMARK_PATH":   DTCC_BENCHMARK_PATH,
        "NEGATIVE_CONTROL_PATH": NEGATIVE_CONTROL_PATH,
        "OUTPUT_DIR":            OUTPUT_DIR,
        "THRESHOLDS":            THRESHOLDS,
    }


def _serialize_parity(parity_df, summary, grid_df, benchmark_path: Path,
                      label: str, raw_trades: List[Dict[str, Any]] | None = None) -> Dict[str, Any]:
    """Serialize one (parity_df, summary, grid_df) tuple. If raw_trades is
    provided (DTCC SDR benchmark only), include them as `dtccTrades` so the
    UI can surface the trade-level data that distinguishes DTCC from
    quote-level benchmarks."""
    parity_rows: List[Dict[str, Any]] = []
    for _, r in parity_df.iterrows():
        parity_rows.append({
            "targetMonth":         _to_iso(r["target_month"]),
            "targetMonthLabel":    _to_month_label(r["target_month"]),
            "orielRatePct":        _safe_float(r["oriel_rate_pct"]),
            "otcYoyRate":          _safe_float(r["otc_yoy_rate"]),
            "denominatorCpi":      _safe_float(r.get("denominator_cpi")),
            "orielImpliedIndex":   _safe_float(r["oriel_implied_index"]),
            "otcImpliedIndex":     _safe_float(r["otc_implied_index"]),
            "indexBasis":          _safe_float(r.get("index_basis")),
            "diffBps":             _safe_float(r["diff_bps"]),
            "absDiffBps":          _safe_float(r["abs_diff_bps"]),
            "withinTolerance":     bool(r["within_tolerance"]),
            "status":              str(r["status"]),
        })

    grid_rows: List[Dict[str, Any]] = []
    for _, r in grid_df.iterrows():
        grid_rows.append({
            "targetMonth":         _to_iso(r["target_month"]),
            "orielImpliedIndex":   _safe_float(r["oriel_implied_index"]),
            "otcImpliedIndex":     _safe_float(r["otc_implied_index"]),
            "indexBasis":          _safe_float(r.get("index_basis")),
        })

    # summary is already a plain dict; deep-copy via json round-trip cleans
    # any pandas/numpy scalars that snuck in
    summary_clean = json.loads(json.dumps(summary, default=str))

    out = {
        "summary":     summary_clean,
        "parityRows":  parity_rows,
        "gridRows":    grid_rows,
        "benchmark":   {"file": benchmark_path.name, "label": label},
    }
    if raw_trades:
        out["dtccTrades"] = raw_trades
    return out


def _load_dtcc_raw_trades(path: Path) -> List[Dict[str, Any]]:
    """Load the DTCC SDR static-demo CSV at trade level (one row per swap
    print). This is the source data that aggregates to the monthly medians
    used by the parity engine — surfaced in the UI so the DTCC sub-tab can
    show what makes it distinct from the quote-level Tighter benchmark."""
    try:
        import pandas as pd
        df = pd.read_csv(path)
    except Exception as ex:
        logger.warning("DTCC raw load failed (%s)", ex)
        return []

    rows: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        rows.append({
            "disseminationId":  str(r.get("dissemination_identifier")) if r.get("dissemination_identifier") is not None else None,
            "executionUtc":     str(r.get("execution_timestamp")) if r.get("execution_timestamp") is not None else None,
            "targetMonth":      _to_iso(r.get("target_month")) if r.get("target_month") is not None else None,
            "notionalUsd":      _safe_float(r.get("notional_amount")),
            "fixedRatePct":     _safe_float(r.get("fixed_rate")),
            "productName":      str(r.get("product_name")) if r.get("product_name") is not None else None,
            "currency":         str(r.get("currency")) if r.get("currency") is not None else None,
            "effectiveDate":    str(r.get("effective_date")) if r.get("effective_date") is not None else None,
            "expirationDate":   str(r.get("expiration_date")) if r.get("expiration_date") is not None else None,
            "underlier":        str(r.get("underlier_name")) if r.get("underlier_name") is not None else None,
            "swapStyle":        str(r.get("underlier_subtype")) if r.get("underlier_subtype") is not None else None,
            "qualityFlag":      str(r.get("quality_flag")) if r.get("quality_flag") is not None else None,
        })
    return rows


def _build_parity_bundle() -> Dict[str, Any] | None:
    mods = _load_parity_modules()
    if mods is None:
        return None
    run_parity = mods["run_parity"]
    oriel_path = str(mods["ORIEL_CURVE_PATH"])

    out: Dict[str, Any] = {}
    benchmarks = [
        ("tight", mods["TIGHTER_BENCHMARK_PATH"], False, "Reference OTC Benchmark"),
        ("dtcc",  mods["DTCC_BENCHMARK_PATH"],   True,  "DTCC SDR Calibration Sample"),
        ("neg",   mods["NEGATIVE_CONTROL_PATH"], False, "Publish-Block Stress Test"),
    ]
    for key, path, is_dtcc, label in benchmarks:
        try:
            parity_df, summary, grid_df = run_parity(
                oriel_path, str(path), is_dtcc, output_dir=None,
            )
            # For DTCC also surface the trade-level rows (12 raw SDR prints
            # that aggregate to the 4 monthly medians fed into the parity
            # engine) — the UI shows these on the DTCC tab to make it
            # visibly distinct from the quote-level Tighter benchmark.
            raw_trades = _load_dtcc_raw_trades(Path(path)) if is_dtcc else None
            out[key] = _serialize_parity(parity_df, summary, grid_df, path, label, raw_trades)
        except Exception as ex:
            logger.warning("Parity: %s failed (%s)", key, ex)
            out[key] = None
    return out


# ─────────────────────────────────────────────────────────────────────────────
# DTCC Term Calibration (reference-only, not parity)
# ─────────────────────────────────────────────────────────────────────────────

@functools.lru_cache(maxsize=1)
def _load_term_calibration():
    """v7's analytics.dtcc_term_calibration loader, cached."""
    try:
        from analytics.dtcc_term_calibration import (
            load_term_calibration as _load,
            filter_standard_tenors as _filter_std,
            STANDARD_TENORS,
        )
    except Exception as ex:
        logger.warning("Term calibration: import failed (%s)", ex)
        return None

    base = _V7_ROOT / "data" / "dtcc_term_calibration"
    try:
        bundle = _load(base)
    except FileNotFoundError as ex:
        logger.warning("Term calibration: artifacts missing (%s)", ex)
        return None
    except Exception as ex:
        logger.warning("Term calibration: load failed (%s)", ex)
        return None

    return {
        "bundle":        bundle,
        "filter_std":    _filter_std,
        "standard":      list(STANDARD_TENORS),
    }


def _serialize_tenor_row(r) -> Dict[str, Any]:
    """One tenor row → JSON-safe dict (camelCase keys)."""
    return {
        "tenorMonths":              _safe_int(r.get("target_tenor_months")),
        "tenorLabel":               str(r.get("target_tenor_label")) if r.get("target_tenor_label") is not None else None,
        "tradeCount":               _safe_int(r.get("trade_count")),
        "uniqueTradeIds":           _safe_int(r.get("unique_trade_ids")),
        "firstExecutionUtc":        str(r.get("first_execution_utc")) if r.get("first_execution_utc") is not None else None,
        "lastExecutionUtc":         str(r.get("last_execution_utc")) if r.get("last_execution_utc") is not None else None,
        "medianRatePct":            _safe_float(r.get("median_rate_pct")),
        "meanRatePct":              _safe_float(r.get("mean_rate_pct")),
        "notionalWeightedAvgPct":   _safe_float(r.get("notional_weighted_avg_rate_pct")),
        "minRatePct":               _safe_float(r.get("min_rate_pct")),
        "maxRatePct":               _safe_float(r.get("max_rate_pct")),
        "q25RatePct":               _safe_float(r.get("q25_rate_pct")),
        "q75RatePct":               _safe_float(r.get("q75_rate_pct")),
        "iqrRatePct":               _safe_float(r.get("iqr_rate_pct")),
        "medianNotionalUsd":        _safe_float(r.get("median_notional_usd")),
        "totalNotionalUsd":         _safe_float(r.get("total_notional_usd")),
        "avgTenorYearsExact":       _safe_float(r.get("avg_tenor_years_exact")),
        "swapFormatMode":           str(r.get("swap_format_mode")) if r.get("swap_format_mode") is not None else None,
        "indexFamilyMode":          str(r.get("index_family_mode")) if r.get("index_family_mode") is not None else None,
        "cpiLagMonths":             _safe_int(r.get("cpi_lag_months")),
    }


def _build_term_calibration() -> Dict[str, Any] | None:
    bundle = _load_term_calibration()
    if bundle is None:
        return None
    by_tenor_full = bundle["bundle"]["by_tenor"]
    by_tenor_std  = bundle["filter_std"](by_tenor_full)
    standard      = bundle["standard"]

    full_rows = [_serialize_tenor_row(r) for _, r in by_tenor_full.iterrows()]
    std_rows  = [_serialize_tenor_row(r) for _, r in by_tenor_std.iterrows()]

    # Aggregates exactly as v7 computes them in tabs/parity_tab.py
    total_trades = (
        int(by_tenor_full["trade_count"].sum())
        if "trade_count" in by_tenor_full.columns else 0
    )
    total_notional = (
        float(by_tenor_full["total_notional_usd"].sum())
        if "total_notional_usd" in by_tenor_full.columns else 0.0
    )

    nwavg_std = None
    if not by_tenor_std.empty:
        w = by_tenor_std["total_notional_usd"].astype(float)
        r = by_tenor_std["notional_weighted_avg_rate_pct"].astype(float)
        if float(w.sum()) > 0:
            nwavg_std = float((w * r).sum() / w.sum())

    exec_min = None
    exec_max = None
    if "first_execution_utc" in by_tenor_full.columns and not by_tenor_full.empty:
        exec_min = str(by_tenor_full["first_execution_utc"].min())[:10]
    if "last_execution_utc" in by_tenor_full.columns and not by_tenor_full.empty:
        exec_max = str(by_tenor_full["last_execution_utc"].max())[:10]

    return {
        "byTenor":     full_rows,
        "stdTenors":   std_rows,
        "aggregates": {
            "totalTrades":     total_trades,
            "totalNotionalUsd": total_notional,
            "nStdTenors":      len(std_rows),
            "nAllTenors":      len(full_rows),
            "stdTenorWtdAvg":  nwavg_std,
            "standardTenorLabels": standard,
        },
        "execWindow": {
            "first": exec_min,
            "last":  exec_max,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Public entry
# ─────────────────────────────────────────────────────────────────────────────

def _build_payload() -> Dict[str, Any] | None:
    parity = _build_parity_bundle()
    term   = _build_term_calibration()
    if parity is None and term is None:
        return None
    return {
        "parity":    parity or {},
        "term":      term,
        "meta": {
            "version":      "v1.0-parity",
            "module":       "parity + analytics.dtcc_term_calibration",
            "phaseLabel":   "OTC Parity Validation",
        },
    }


def parity_payload_json() -> str:
    """Public API. Returns JSON-encoded payload, or 'null' on any failure
    so the React app falls back to its in-bundle sample data."""
    try:
        payload = _build_payload()
        if payload is None:
            return "null"
        return json.dumps(payload, default=str)
    except Exception as ex:
        logger.warning("Parity: payload build failed (%s)", ex)
        return "null"


if __name__ == "__main__":
    out = parity_payload_json()
    print(f"payload bytes: {len(out):,}")
    print(out[:2500])
