"""
admin_data.py — Build the Index Administrator payload by importing v7's
services/index_admin.load_index_admin_bundle() and serializing every
artifact the React Admin tab renders.

Mirrors v7 tabs/index_admin_tab.py 1:1 in DATA:

  Inputs (from v7 service):
    definition         — IndexDefinition dataclass
    observations_df    — Per-instrument feed snapshots (12 rows × 18 cols)
    quality_df         — Per-bucket quality scores (6 rows × 14 cols)
    outputs_df         — Per-bucket calculation outputs (6 rows × 10 cols)
    runs_df            — Run history (2 rows × 8 cols)
    fallback_df        — Fallback usage (6 rows × 4 cols)
    publication_record — PublicationRecord dataclass

Inputs are STATIC (CSVs under v7/data/), so the wrapper is deterministic.
Cached in streamlit_app.py with a 1h TTL.
"""
from __future__ import annotations

import functools
import json
import logging
import math
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


_V7_ROOT = (Path(__file__).resolve().parent.parent / "oriel_demo_v7").resolve()
if str(_V7_ROOT) not in sys.path:
    sys.path.insert(0, str(_V7_ROOT))


def _safe_float(v):
    if v is None:
        return None
    try:
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


def _safe_int(v):
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _clean(v):
    """Recursively clean NaN/inf out of a value so JSON encodes cleanly."""
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    if isinstance(v, list):
        return [_clean(x) for x in v]
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    return v


def _to_camel(s: str) -> str:
    """snake_case → camelCase. Leaves digit-prefixed parts alone."""
    parts = s.split('_')
    out = [parts[0]]
    for p in parts[1:]:
        if p and not p[0].isdigit():
            out.append(p[0].upper() + p[1:])
        else:
            out.append(p)
    return ''.join(out)


def _df_to_records(df) -> List[Dict[str, Any]]:
    """DataFrame → list of camelCase-keyed dicts, NaN-safe."""
    rows: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        row: Dict[str, Any] = {}
        for col in df.columns:
            v = r[col]
            # pandas Timestamp → ISO date
            try:
                # check if it's a Timestamp
                import pandas as pd
                if isinstance(v, pd.Timestamp):
                    v = v.strftime('%Y-%m-%d')
            except Exception:
                pass
            row[_to_camel(col)] = _clean(v)
        rows.append(row)
    return rows


def _dataclass_to_camel_dict(dc) -> Dict[str, Any]:
    d = asdict(dc)
    return {_to_camel(k): _clean(v) for k, v in d.items()}


@functools.lru_cache(maxsize=1)
def _load_bundle():
    """v7's services.index_admin.load_index_admin_bundle()."""
    try:
        from services.index_admin import _load_index_admin_bundle_impl
    except Exception as ex:
        logger.warning("Index Admin: import failed (%s)", ex)
        return None
    try:
        return _load_index_admin_bundle_impl()
    except Exception as ex:
        logger.warning("Index Admin: build failed (%s)", ex)
        return None


def _build_payload() -> Dict[str, Any] | None:
    bundle = _load_bundle()
    if bundle is None:
        return None
    return {
        "definition":        _dataclass_to_camel_dict(bundle["definition"]),
        "publicationRecord": _dataclass_to_camel_dict(bundle["publication_record"]),
        "observations":      _df_to_records(bundle["observations_df"]),
        "quality":           _df_to_records(bundle["quality_df"]),
        "outputs":           _df_to_records(bundle["outputs_df"]),
        "runs":              _df_to_records(bundle["runs_df"]),
        "fallback":          _df_to_records(bundle["fallback_df"]),
        "meta": {
            "version": "v1.0-admin",
            "module":  "services.index_admin",
            "phaseLabel": "Index Administrator",
        },
    }


def admin_payload_json() -> str:
    """Public API. Returns JSON-encoded payload, or 'null' on any failure
    so the React app falls back to its in-bundle sample data."""
    try:
        payload = _build_payload()
        if payload is None:
            return "null"
        return json.dumps(payload, default=str)
    except Exception as ex:
        logger.warning("Index Admin: payload build failed (%s)", ex)
        return "null"


if __name__ == "__main__":
    out = admin_payload_json()
    print(f"payload bytes: {len(out):,}")
    print(out[:2500])
