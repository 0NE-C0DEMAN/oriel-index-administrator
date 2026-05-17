"""
cms_data.py — Build the Oriel Healthcare Reference (CMS Lag Engine) payload
by reading v7's pre-built pipeline artifacts under
data/cms_lag_engine/. Mirrors v7 tabs/cms_tab.py 1:1.

Pipeline outputs (5 artifacts produced by v7's CMS lag-engine build):
  • basis_action_panel.csv         — current row: medical CPI / Oriel spot /
                                      CMS anchor / basis bps / convergence
                                      window / signal confidence / lenses
  • cms_anchor_timeseries.csv      — yearly time series for hero + basis charts
  • service_line_signal_panel.csv  — per-service-line YoY + gap + confidence
  • historical_benchmark_panel.csv — yearly benchmark + prediction error
  • provenance_manifest.json       — pipeline file manifest

Inputs are STATIC build artifacts; the loader is wrapped in @st.cache_data
in streamlit_app.py with a 1h TTL.
"""
from __future__ import annotations

import functools
import json
import logging
import sys
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)


_V7_ROOT = (Path(__file__).resolve().parent.parent / "oriel_demo_v7").resolve()
if str(_V7_ROOT) not in sys.path:
    sys.path.insert(0, str(_V7_ROOT))


@functools.lru_cache(maxsize=1)
def _load_bundle():
    """Read the 5 build artifacts via v7's cms_lag_loader."""
    try:
        from analytics.cms_lag_loader import load_pipeline_outputs
    except Exception as ex:
        logger.warning("CMS Lag Engine: import failed (%s)", ex)
        return None

    build_dir = _V7_ROOT / "data" / "cms_lag_engine"
    try:
        return load_pipeline_outputs(build_dir)
    except FileNotFoundError as ex:
        logger.warning("CMS Lag Engine: artifacts missing (%s)", ex)
        return None
    except Exception as ex:
        logger.warning("CMS Lag Engine: load failed (%s)", ex)
        return None


def _row_to_dict(row, *fields) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for f in fields:
        if f in row:
            v = row[f]
            try:
                # pandas Float NaN → None for clean JSON
                import math
                if isinstance(v, float) and math.isnan(v):
                    out[f] = None
                else:
                    out[f] = v
            except Exception:
                out[f] = v
    return out


def _df_to_records(df, columns) -> list:
    """Convert a DataFrame to a list of dicts, only keeping `columns`.
    NaN floats become None (so JSON serializes cleanly)."""
    import math
    records = []
    for _, row in df.iterrows():
        r: Dict[str, Any] = {}
        for c in columns:
            if c not in df.columns:
                continue
            v = row[c]
            if isinstance(v, float) and math.isnan(v):
                r[c] = None
            elif hasattr(v, "item"):
                # numpy scalar → python scalar
                r[c] = v.item()
            else:
                r[c] = v
        records.append(r)
    return records


def _camel(s: str) -> str:
    """snake_case → camelCase for the React side.

    Only title-case parts that start with a letter — parts that start with
    a digit (e.g. "25bps") are left as-is so we don't get "within25Bps"
    when v7's column is "within_25bps". The React side reads `within25bps`
    (lowercase b), and JavaScript is case-sensitive, so the previous
    behaviour silently broke the Within-25-bp benchmark column.
    """
    parts = s.split("_")
    out = parts[0]
    for p in parts[1:]:
        if not p:
            continue
        out += p if p[0].isdigit() else (p[0].upper() + p[1:])
    return out


def _records_to_camel(records: list) -> list:
    """Re-key a list of dicts from snake_case to camelCase."""
    return [{_camel(k): v for k, v in r.items()} for r in records]


def _build_payload() -> Dict[str, Any] | None:
    bundle = _load_bundle()
    if bundle is None:
        return None

    basis_action = bundle["basis_action_panel"]
    anchor_ts    = bundle["cms_anchor_timeseries"]
    service      = bundle["service_line_signal_panel"]
    benchmark    = bundle["historical_benchmark_panel"]
    manifest     = bundle["provenance_manifest"]

    if len(basis_action) == 0:
        return None
    row = basis_action.iloc[0]

    def _f(name: str, default: float = 0.0) -> float:
        try:
            return float(row[name])
        except Exception:
            return default

    def _s(name: str, default: str = "") -> str:
        try:
            return str(row[name])
        except Exception:
            return default

    public_basis_bp = _f("public_print_basis_bps")
    anchor_basis_bp = _f("anchor_basis_bps")
    residual_bp     = public_basis_bp - anchor_basis_bp
    confidence_label = _s("signal_confidence")

    basisActionRow = {
        "medicalCpiPct":      _f("medical_cpi_proxy"),
        "orielSpotPct":       _f("oriel_healthcare_spot"),
        "cmsAnchorPct":       _f("cms_official_anchor_yoy"),
        "publicBasisBp":      public_basis_bp,
        "anchorBasisBp":      anchor_basis_bp,
        "residualBp":         residual_bp,
        "historicalPct":      _f("historical_percentile"),
        "convergenceWindow":  _s("expected_convergence_window"),
        "signalConfidence":   confidence_label,
        "tradingLens":        _s("trading_lens"),
        "hedgeLens":          _s("hedge_lens"),
    }

    # Anchor timeseries — for hero chart + basis chart
    anchor_ts_records = _df_to_records(
        anchor_ts,
        [
            "year",
            "medical_cpi_proxy",
            "oriel_healthcare_spot",
            "cms_official_anchor_yoy",
            "public_print_basis_bps",
            "anchor_basis_bps",
        ],
    )
    anchor_ts_records = _records_to_camel(anchor_ts_records)

    # Service line panel — for RV table + crosswalk
    service_records = _df_to_records(
        service,
        [
            "service_line",
            "cms_yoy",
            "medical_cpi_proxy",
            "oriel_signal",
            "gap_bps",
            "momentum",
            "confidence",
        ],
    )
    service_records = _records_to_camel(service_records)

    # Historical benchmark — for benchmark chart + error chart + table
    bench_records = _df_to_records(
        benchmark,
        [
            "year",
            "medical_cpi_proxy",
            "oriel_healthcare_spot",
            "cms_official_anchor_yoy",
            "prediction_error_bps",
            "abs_error_bps",
            "within_25bps",
        ],
    )
    bench_records = _records_to_camel(bench_records)

    # Provenance manifest
    provenance = {
        "parsedPresent":   list(manifest.get("parsed_inputs", {}).get("present", [])),
        "parsedMissing":   list(manifest.get("parsed_inputs", {}).get("missing", [])),
        "optionalPresent": list(manifest.get("parsed_inputs", {}).get("optional_present", [])),
        "outputs":         dict(manifest.get("outputs", {})),
    }

    # Headline KPI strip values (matches v7's 6-cell strip layout)
    kpiStrip = {
        "medicalCpiPct":     basisActionRow["medicalCpiPct"],
        "orielSpotPct":      basisActionRow["orielSpotPct"],
        "cmsAnchorPct":      basisActionRow["cmsAnchorPct"],
        "publicBasisBp":     basisActionRow["publicBasisBp"],
        "convergenceShort":  basisActionRow["convergenceWindow"]
                                .replace(" releases", "").replace(" release", "").strip(),
        "convergenceFull":   basisActionRow["convergenceWindow"],
        "signalConfidence":  confidence_label,
        "historicalPct":     basisActionRow["historicalPct"],
    }

    return {
        "kpiStrip": kpiStrip,
        "basisActionRow": basisActionRow,
        "anchorTimeseries": anchor_ts_records,
        "serviceLines": service_records,
        "historicalBenchmark": bench_records,
        "provenance": provenance,
    }


def cms_payload_json() -> str:
    """Public API. Returns JSON-encoded payload, or 'null' on any failure
    so the React app falls back to its in-bundle sample data."""
    try:
        payload = _build_payload()
        if payload is None:
            return "null"
        return json.dumps(payload, default=str)
    except Exception as ex:
        logger.warning("CMS Lag Engine: payload build failed (%s)", ex)
        return "null"


if __name__ == "__main__":
    # Manual smoke test.
    print(cms_payload_json()[:2000])
