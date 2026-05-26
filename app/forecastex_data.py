"""
forecastex_data.py — Build the full ForecastEx payload by calling v7's
analytics verbatim (ForecastExClient + score_and_package) so our React app
renders the exact numbers v7's published demo shows.

Produces both LIVE and SAMPLE variants in a single payload, matching the
Live data toggle in v7's tabs/forecastex_tab.py:
    LIVE   = score_and_package(client.fetch_contracts(), source_status="LIVE", ...)
    SAMPLE = score_and_package(client._sample_contracts(now), source_status="FALLBACK", ...)

The React `fx` index reads this payload (window.__FORECASTEX__) and
captures both as sample/live variants for the live toggle. No JS-side
re-implementation of the curve build, scoring, or publishability logic.
"""
from __future__ import annotations

import functools
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)
UTC = timezone.utc


# Add v7's package root to sys.path so we can import its venues module.
_V7_ROOT = (Path(__file__).resolve().parent.parent / "oriel_demo_v7").resolve()
if str(_V7_ROOT) not in sys.path:
    sys.path.insert(0, str(_V7_ROOT))


@functools.lru_cache(maxsize=1)
def _live_contracts_cached():
    """Process-level cache wrapper around ForecastExClient.fetch_contracts.
    Avoids re-fetching the ForecastEx pairs CSV on every Streamlit rerun
    (Streamlit's @st.cache_data wraps the outer payload too)."""
    if os.getenv("ORIEL_DISABLE_LIVE_FX", "").lower() in ("1", "true", "yes"):
        return None, None
    try:
        from venues.forecastex import ForecastExClient, DEFAULT_CONFIG
    except Exception as ex:
        logger.warning("ForecastEx live: import failed (%s)", ex)
        return None, None
    try:
        client = ForecastExClient(DEFAULT_CONFIG)
        contracts, status = client.fetch_contracts()
        return contracts, status
    except Exception as ex:
        logger.warning("ForecastEx live: fetch failed (%s)", ex)
        return None, None


def _build_front_distribution(pkg, *, direction_fn=None) -> Optional[Dict[str, Any]]:
    """Compute the implied probability distribution at the front release_month
    from the per-threshold contracts that v7's score_and_package retains on
    pkg.contracts. Returns a dict shaped like the React `bucketSnapshots[0]`
    that DistributionChart.jsx consumes:
        { key, maturity, expected, buckets: [{ label, lower, upper, mid, prob }] }
    or None when the live ladder is too thin to bucket (< 2 unique YoY strikes).
    """
    try:
        from venues._distribution import build_threshold_distribution, parse_bucket_edges  # type: ignore
    except Exception:
        return None
    points = list(pkg.points or [])
    if not points:
        return None
    front = points[0]
    front_contracts = [
        c for c in (pkg.contracts or []) if c.release_month == front.release_month
    ]
    if not front_contracts:
        return None
    labels, probs_pct, ev = build_threshold_distribution(
        front_contracts,
        threshold_attr="threshold",
        price_attr="mid",
        direction_fn=direction_fn,
        min_threshold=1.0,
        max_threshold=6.0,
    )
    if not labels:
        return None
    buckets = []
    for label, prob_pct in zip(labels, probs_pct):
        lo, hi = parse_bucket_edges(label)
        mid = (lo + hi) / 2.0
        buckets.append({
            "label": label,
            "lower": float(lo),
            "upper": float(hi),
            "mid":   float(mid),
            "prob":  float(prob_pct) / 100.0,
        })
    return {
        "key":      _short_label(front.release_month).replace(" ", "").lower(),
        "maturity": _short_label(front.release_month),
        "expected": float(ev) if ev is not None else float(front.implied_yoy),
        "buckets":  buckets,
    }


def _serialize_curve_package(pkg, *, sample_contracts=None, live_contracts=None) -> Dict[str, Any]:
    """Convert v7's CurvePackage + the originating contracts into a dict
    shaped the way React's index `detail` expects.

    Mirrors v7's tabs/forecastex_tab.py rendering — every KPI and table
    derives from the same v7 objects."""
    points = list(pkg.points or [])
    n = len(points)

    if not n:
        return {
            "valuationTime":         pkg.valuation_timestamp.strftime("%Y-%m-%d %H:%M UTC"),
            "valuationTimeIso":      pkg.valuation_timestamp.isoformat(),
            "publishable":           bool(pkg.publishable),
            "publishabilityReason":  pkg.publishability_reason,
            "sourceStatus":          pkg.source_status,
            "sampleMode":            bool(pkg.sample_mode),
            "methodology":           pkg.methodology,
            "venue":                 pkg.venue,
            "forwardCurve":          [],
            "constituents":          [],
            "indexPrint":            None,
            "stats":                 None,
            "dislocation":           None,
        }

    front = points[0]
    back  = points[min(n - 1, 5)]                       # mirrors v7 line 89
    term_structure_pct = round(back.implied_yoy - front.implied_yoy, 4)

    # Forward curve rows — shape that our existing IndexDetailView consumes
    # (maturity / expected / lower / upper / bucketCount / contractType).
    forward_curve = [
        {
            "maturity":     _short_label(p.release_month),
            "maturityFull": p.release_month,
            "expected":     float(p.implied_yoy),
            "lower":        float(p.lower_band),
            "upper":        float(p.upper_band),
            "priorYoy":     float(p.prior_curve_yoy) if p.prior_curve_yoy is not None else None,
            "volume":       int(p.volume or 0),
            "openInterest": int(p.open_interest or 0),
            "publishable":  bool(p.publishable),
            "bucketCount":  1,
            "contractType": "binary_threshold",
        }
        for p in points
    ]

    # Venue readiness display model — mirrors PR #20's three-axis framing
    # (Signal Status / Reference Readiness / Trade Use). Display-only; the
    # underlying publishable flag is unchanged.
    try:
        from analytics.venue_readiness import build_venue_display_status
        _display_status = build_venue_display_status(
            venue="ForecastEx",
            source_status=pkg.source_status,
            publishable=pkg.publishable,
            constituent_count=n,
            comparable_row_count=n,
            has_normalized_rows=bool(points),
            reason=(
                "1 constituent available; governed publication requires broader maturity / constituent coverage."
                if n == 1 and not pkg.publishable
                else None
            ),
        )
        _signal_status = _display_status.signal_status
        _reference_readiness = _display_status.reference_readiness
        _trade_use = _display_status.trade_use
        _display_reason = _display_status.reason
    except Exception:
        _signal_status = "Live Signal" if pkg.source_status != "FALLBACK" else "Fallback Signal"
        _reference_readiness = "Reference Eligible" if pkg.publishable else "Coverage Review"
        _trade_use = "Included in dislocation analysis" if n else "Not enough comparable data"
        _display_reason = pkg.publishability_reason or ""

    # Index Print panel — exact mirror of v7's right-column key/value rows.
    index_print = {
        "indexLevel":          100.00,
        "baseValue":           100.00,
        "valuationTime":       pkg.valuation_timestamp.strftime("%Y-%m-%d %H:%M UTC"),
        "anchorExpectedValue": float(front.implied_yoy),
        "publishable":         bool(pkg.publishable),
        "publishabilityReason": pkg.publishability_reason,
        "constituentCount":    n,
        "flaggedCount":        sum(1 for p in points if not p.publishable),
        "signalStatus":        _signal_status,
        "referenceReadiness":  _reference_readiness,
        "tradeUse":            _trade_use,
        "displayReason":       _display_reason,
        "front": {
            "value":    float(front.implied_yoy),
            "maturity": front.release_month,
            "label":    "Front (1M implied)",
        },
        "back": {
            "value":    float(back.implied_yoy),
            "maturity": back.release_month,
            "label":    f"Back ({_back_horizon_label(n)} implied)",
        },
        "slope": {
            "delta":     term_structure_pct,
            "pct":       round(term_structure_pct * 100, 2),
            "direction": "up" if term_structure_pct >= 0 else "down",
        },
    }

    # Stats — Mean / Avg σ / Constituents (v7 line 217-220).
    expected_values = [float(p.implied_yoy) for p in points]
    sigmas          = [max(float(p.upper_band) - float(p.implied_yoy), 0.0001) for p in points]
    stats = {
        "unit":             "%",
        "mean":             round(sum(expected_values) / n, 4),
        "avgStdDev":        round(sum(sigmas) / n, 4),
        "minValue":         round(min(expected_values), 4),
        "maxValue":         round(max(expected_values), 4),
        "constituentCount": n,
    }

    # Dislocation — v7 derives cpi_swap_proxy = front × 1.018, dislocation
    # in bp = (proxy - front) × 100 (v7 line 158-159).
    cpi_swap_proxy = round(float(front.implied_yoy) * 1.018, 4)
    dislocation_bp = round((cpi_swap_proxy - float(front.implied_yoy)) * 100, 1)
    dislocation = {
        "unit":            "%",
        "orielForward":    float(front.implied_yoy),
        "cpiSwapProxy":    cpi_swap_proxy,
        "swapLabel":       "CPI Swap (proxy)",
        "signalLabel":     "Energy Signal",
        "energySignal":    "↑ Elevated",
        "energyTone":      "warning",
        "dislocationBps":  dislocation_bp,
        "frontLabel":      f"Oriel Forward ({front.release_month.split()[0]})",
    }

    # Constituents table — every CurvePoint becomes a row with its
    # threshold / volume / OI / publishability flag (matches v7's contracts
    # table semantics).
    constituents = []
    for p in points:
        status = "Included" if p.publishable else "Flagged"
        constituents.append({
            "ticker":       f"FXCPI_{_iso_yymm(p.release_month)}",
            "label":        p.release_month,
            "price":        float(p.implied_yoy),
            "volume":       int(p.volume or 0),
            "openInterest": int(p.open_interest or 0),
            "type":         "Binary threshold",
            "method":       "ForecastEx mid",
            "status":       status,
        })

    front_distribution = _build_front_distribution(pkg, direction_fn=None)

    # Honest methodology label: swap "-live" -> "-fallback" when the live
    # feed fell back to sample, so the chip cannot misrepresent a sample
    # as live.
    _methodology_str = (
        pkg.methodology.replace("-live", "-fallback")
        if pkg.sample_mode and "-live" in (pkg.methodology or "")
        else pkg.methodology
    )

    return {
        "valuationTime":        pkg.valuation_timestamp.strftime("%Y-%m-%d %H:%M UTC"),
        "valuationTimeIso":     pkg.valuation_timestamp.isoformat(),
        "publishable":          bool(pkg.publishable),
        "publishabilityReason": pkg.publishability_reason,
        "sourceStatus":         pkg.source_status,
        "sampleMode":           bool(pkg.sample_mode),
        "methodology":          _methodology_str,
        "venue":                pkg.venue,
        "termStructurePct":     term_structure_pct,
        "forwardCurve":         forward_curve,
        "constituents":         constituents,
        "indexPrint":           index_print,
        "stats":                stats,
        "dislocation":          dislocation,
        "frontDistribution":    front_distribution,
    }


def _short_label(release_month: str) -> str:
    """'Mar 2026' → 'Mar 26'. Matches the maturity label format used
    elsewhere in our React app (e.g. CPI Kalshi forwardCurve)."""
    parts = (release_month or "").strip().split()
    if len(parts) == 2 and parts[1].isdigit() and len(parts[1]) == 4:
        return f"{parts[0]} {parts[1][2:]}"
    return release_month


def _iso_yymm(release_month: str) -> str:
    """'Mar 2026' → '26MAR'. Mirrors the v7 ticker style."""
    parts = (release_month or "").strip().split()
    if len(parts) == 2 and parts[1].isdigit():
        return f"{parts[1][2:]}{parts[0][:3].upper()}"
    return release_month.replace(" ", "_").upper()


def _back_horizon_label(n_points: int) -> str:
    """v7 picks back = points[min(len-1, 5)]. The horizon label tracks
    that index — 1M for 1 point, 6M when len ≥ 6."""
    idx = min(max(n_points - 1, 0), 5)
    return f"{idx + 1}M"


def _build_package(*, mode: str):
    """Run v7's ForecastEx pipeline for `mode` ∈ {'live', 'sample'}.
    Returns serialized dict, or None on failure."""
    try:
        from venues.forecastex import (
            ForecastExClient,
            DEFAULT_CONFIG,
            score_and_package,
        )
    except Exception as ex:
        logger.warning("ForecastEx %s: import failed (%s)", mode, ex)
        return None

    if mode == "live":
        contracts, status = _live_contracts_cached()
        if contracts is None:
            # Live disabled or fetch failed — no live variant available.
            return None
        try:
            pkg = score_and_package(contracts, source_status=status, config=DEFAULT_CONFIG)
            return _serialize_curve_package(pkg)
        except Exception as ex:
            logger.warning("ForecastEx live: score_and_package failed (%s)", ex)
            return None

    # Sample mode — use the embedded sample contract list (matches v7's
    # client._sample_contracts call from forecastex_tab line 78).
    try:
        client = ForecastExClient(DEFAULT_CONFIG)
        contracts = client._sample_contracts(datetime.now(UTC))
        pkg = score_and_package(contracts, source_status="FALLBACK", config=DEFAULT_CONFIG)
        return _serialize_curve_package(pkg)
    except Exception as ex:
        logger.warning("ForecastEx sample: build failed (%s)", ex)
        return None


def _build_payload() -> Dict[str, Any]:
    """Build both live + sample variants. Returns:
        {
          live:   { ...full payload... } | None,
          sample: { ...full payload... } | None,
          methodologyTable: [{ key, value }, ...]   # v7 line 222-229
          feedConfig:       { series_ticker, sample_mode, ... }  # v7 line 235-242
        }
    """
    try:
        from venues.forecastex import DEFAULT_CONFIG
    except Exception as ex:
        logger.warning("ForecastEx payload: import failed (%s)", ex)
        return {"live": None, "sample": None, "methodologyTable": [], "feedConfig": {}}

    live   = _build_package(mode="live")
    sample = _build_package(mode="sample")

    # Methodology rows (v7 forecastex_tab.py line 222-229) — verbatim
    methodology_table = [
        {"key": "Price basis",    "value": "forecastex_mid"},
        {"key": "Normalization",  "value": "coupon-adjusted mid"},
        {"key": "Interpolation",  "value": "log-linear"},
        {"key": "Publishability", "value": "volume + OI threshold"},
        {"key": "Stale rule",     "value": f"{DEFAULT_CONFIG.stale_after_minutes}min timeout"},
        {"key": "Fallback",       "value": "sample_data_on_live_failure"},
    ]

    # Live Feed Status rows (v7 line 235-242). Per-mode source_status comes
    # from the package; min_volume / min_open_interest / max_curve_points
    # come from config.
    feed_config = {
        "seriesTicker":     "FXCPI",
        "minVolume":        int(DEFAULT_CONFIG.min_volume),
        "minOpenInterest":  int(DEFAULT_CONFIG.min_open_interest),
        "maxCurvePoints":   int(DEFAULT_CONFIG.max_curve_points),
        "staleAfterMin":    int(DEFAULT_CONFIG.stale_after_minutes),
    }

    return {
        "live":             live,
        "sample":           sample,
        "methodologyTable": methodology_table,
        "feedConfig":       feed_config,
    }


def forecastex_payload_json() -> str:
    """JSON-serialized payload ready for inlining as
    `window.__FORECASTEX__ = …;` in the React bundle."""
    p = _build_payload()
    if p["live"] is None and p["sample"] is None:
        return "null"
    return json.dumps(p, separators=(",", ":"))


if __name__ == "__main__":
    print(forecastex_payload_json())
