"""
live_kalshi.py — Fetch live Kalshi CPI markets and serialize to a JSON
payload our React app can consume as `window.__LIVE_CPI__`.

This is a thin wrapper around v7's `venues.kalshi.live_data.build_live_cpi_feed`
which already does all the heavy lifting (REST fetch, microstructure
filtering, classification, monotonic repair). We just convert the
MaturitySnapshot objects into plain dicts shaped like our `indices.js`
expects, plus a `contractsTable` and a `runtimeMeta` blob.

Failures degrade gracefully: any network / parse error returns None so the
app falls back to v7's static CPI_SNAPSHOTS sample.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# Add v7's package root to sys.path so we can import its live_data module.
# (We do not modify v7 source — only import it.)
_V7_ROOT = (Path(__file__).resolve().parent.parent / "oriel_demo_v7").resolve()
if str(_V7_ROOT) not in sys.path:
    sys.path.insert(0, str(_V7_ROOT))


def _maturity_label(d: date) -> str:
    """Render a date as v7-style 'Mar 26' (matches our internal format)."""
    return d.strftime("%b %y")


def _serialize_snapshots(snapshots) -> List[Dict[str, Any]]:
    """Convert v7's MaturitySnapshot objects into JSON-friendly dicts that
    match our indices.js shape: { maturity, binary_thresholds, exact_outcomes }."""
    out: List[Dict[str, Any]] = []
    for snap in snapshots:
        s: Dict[str, Any] = {
            "maturity": _maturity_label(snap.maturity),
            "maturityIso": snap.maturity.isoformat(),
        }
        if snap.binary_thresholds:
            s["binary_thresholds"] = [
                {
                    "label":     bt.label,
                    "threshold": float(bt.threshold),
                    "price":     float(bt.price),
                }
                for bt in snap.binary_thresholds
            ]
        if snap.exact_outcomes:
            s["exact_outcomes"] = [
                {
                    "label": eo.label,
                    "value": float(eo.value),
                    "price": float(eo.price),
                }
                for eo in snap.exact_outcomes
            ]
        out.append(s)
    return out


def _serialize_contracts_table(rows) -> List[Dict[str, str]]:
    """v7's contracts table rows are plain dicts already — but we coerce
    keys to our camelCase columns so indices.js can render them directly."""
    out: List[Dict[str, str]] = []
    for r in rows:
        out.append({
            "ticker": r.get("Ticker", ""),
            "label":  r.get("Threshold/Value", ""),
            "price":  r.get("Price", ""),
            "type":   r.get("Type", ""),
            "method": r.get("Method", ""),
            "status": r.get("Status", ""),
        })
    return out


def fetch_live_cpi(timeout_seconds: float = 15.0) -> Optional[Dict[str, Any]]:
    """
    Fetch the live Kalshi CPI feed and return a JSON-serialisable payload:
        {
          methodology: { name, version, ... },
          snapshots: [...],
          contractsTable: [...],
          runtimeMeta: { feedStatus, source, contractsFetched, ...},
          stats: {...},
          fetchedAt: "2026-04-30T...Z"
        }
    Returns None on any failure (caller falls back to sample data).
    """
    if os.getenv("ORIEL_DISABLE_LIVE_CPI", "").lower() in ("1", "true", "yes"):
        return None

    try:
        # Late imports so a missing v7 path doesn't break the streamlit app.
        from venues.kalshi.live_data import LiveFeedConfig
        # Share the process-level fetch with blended_curve.py so we don't
        # round-trip Kalshi REST twice per cold start.
        from blended_curve import _fetch_live_snapshots_cached
    except Exception as ex:
        logger.warning("Live CPI: failed to import v7 fetcher (%s); using sample.", ex)
        return None

    snapshots, contracts_table, methodology, stats = _fetch_live_snapshots_cached()
    if snapshots is None:
        logger.warning("Live CPI: fetch returned no snapshots; using sample.")
        return None

    # Serialise the LiveFeedConfig dataclass (filter thresholds + venue knobs)
    # so the React app can show v7's "Live Feed Status" as a key/value list of
    # config parameters — matches what v7 displays via live_feed_runtime_config().
    feed_cfg = LiveFeedConfig()
    feed_config_kv = {
        "series_ticker":              feed_cfg.series_ticker,
        "price_mode":                 feed_cfg.price_mode,
        "min_open_interest":          float(feed_cfg.min_open_interest),
        "min_volume":                 float(feed_cfg.min_volume),
        "max_wide_spread":            float(feed_cfg.max_wide_spread),
        "min_contracts_per_maturity": int(feed_cfg.min_contracts_per_maturity),
        "max_maturities":             int(feed_cfg.max_maturities),
    }

    payload = {
        "methodology": {
            "name":                methodology.index_name,
            "version":             methodology.methodology_version,
            # Match v7 field names used by the React MethodologyTable
            "basis":               methodology.price_basis,                # e.g. "kalshi_rest_mid"
            "interpolation":       methodology.interpolation_method,
            "weighting":           methodology.weighting_rule,
            "smoothing":           methodology.smoothing_rule,             # "isotonic_monotone_survival"
            "staleMarket":         methodology.stale_market_rule,          # "cached_rest_polling"
            "fallback":            methodology.fallback_rule,              # "sample_data_on_live_failure"
            "publicationFrequency": methodology.publication_frequency,
            "unitLabel":           methodology.unit_label,
        },
        "snapshots":      _serialize_snapshots(snapshots),
        "contractsTable": _serialize_contracts_table(contracts_table),
        "runtimeMeta": {
            "feedStatus":       "live",
            "source":           "Kalshi public REST",
            "cacheTtlSeconds":  60,
            "contractsFetched": stats.get("markets_included", 0),
            "errorCount":       0,
            "enableEnvVar":     "KALSHI_ENABLE_LIVE_CPI",
            # v7-style LiveFeedConfig parameters surfaced verbatim
            "feedConfig":       feed_config_kv,
        },
        "stats": {
            "marketsScanned":          stats.get("markets_scanned", 0),
            "marketsIncluded":         stats.get("markets_included", 0),
            "marketsFilteredMaturity": stats.get("markets_filtered_maturity", 0),
            "marketsFilteredStrike":   stats.get("markets_filtered_strike", 0),
            "marketsFilteredPricing":  stats.get("markets_filtered_pricing", 0),
            "marketsFilteredLiquidity": stats.get("markets_filtered_liquidity", 0),
            "maturitiesBuilt":         stats.get("maturities_built", 0),
        },
        "fetchedAt": datetime.utcnow().isoformat() + "Z",
    }
    return payload


def live_cpi_payload_json() -> str:
    """Return the live CPI payload as a JSON string ready to inline into the
    bundle as `window.__LIVE_CPI__ = …;`. Returns "null" on failure."""
    payload = fetch_live_cpi()
    if payload is None:
        return "null"
    return json.dumps(payload, separators=(",", ":"))
