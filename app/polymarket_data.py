"""
polymarket_data.py — Build the full Polymarket payload by calling v7's
analytics verbatim (PolymarketClient + score_and_package) so our React app
renders the exact numbers v7's published demo shows.

Produces both LIVE and SAMPLE variants in a single payload, mirroring v7's
toggle behaviour from tabs/polymarket_tab.py.

Polymarket-specific shape (vs ForecastEx):
- Index Print includes Venue Role, Venue Status, Reference Status rows.
- Stats card replaces "Constituents" with "Avg confidence".
- Dislocation panel's middle row is "Avg spread" (bp), not "Energy Signal".
- Methodology rows differ verbatim: gamma best bid/ask midpoint, etc.
- Live Feed Status rows include `websocket_ready` row.
- Curve points carry `confidence_score`, `spread_bp`, `market_id` we surface.
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


_V7_ROOT = (Path(__file__).resolve().parent.parent / "oriel_demo_v7").resolve()
if str(_V7_ROOT) not in sys.path:
    sys.path.insert(0, str(_V7_ROOT))


@functools.lru_cache(maxsize=1)
def _live_contracts_cached():
    """Process-level cache around PolymarketClient.fetch_contracts."""
    if os.getenv("ORIEL_DISABLE_LIVE_POLY", "").lower() in ("1", "true", "yes"):
        return None, None
    try:
        from venues.polymarket import PolymarketClient, DEFAULT_CONFIG
    except Exception as ex:
        logger.warning("Polymarket live: import failed (%s)", ex)
        return None, None
    try:
        client = PolymarketClient(DEFAULT_CONFIG)
        contracts, status = client.fetch_contracts()
        return contracts, status
    except Exception as ex:
        logger.warning("Polymarket live: fetch failed (%s)", ex)
        return None, None


def _serialize_curve_package(pkg) -> Dict[str, Any]:
    """Serialize a v7 PolyCurvePackage + its underlying contracts into a dict
    matching what our React `poly` index detail expects."""
    points = list(pkg.points or [])
    n = len(points)
    contracts = list(pkg.contracts or [])

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
            "venueRole":             pkg.venue_role,
            "venueStatus":           pkg.venue_status,
            "referenceStatus":       pkg.reference_status,
            "countsTowardOrielBlend": bool(pkg.counts_toward_oriel_blend),
            "forwardCurve":          [],
            "constituents":          [],
            "indexPrint":            None,
            "stats":                 None,
            "dislocation":           None,
        }

    front = points[0]
    back  = points[min(n - 1, 5)]
    term_structure_pct = round(back.implied_yoy - front.implied_yoy, 4)
    avg_conf = round(sum(p.confidence_score for p in points) / max(n, 1), 1)

    forward_curve = [
        {
            "maturity":       _short_label(p.release_month),
            "maturityFull":   p.release_month,
            "expected":       float(p.implied_yoy),
            "lower":          float(p.lower_band),
            "upper":          float(p.upper_band),
            "priorYoy":       float(p.prior_curve_yoy) if p.prior_curve_yoy is not None else None,
            "volume":         float(p.volume or 0),
            "openInterest":   float(p.open_interest or 0),
            "spreadBp":       float(p.spread_bp) if p.spread_bp is not None else None,
            "confidenceScore": float(p.confidence_score),
            "marketId":       p.market_id,
            "publishable":    bool(p.publishable),
            "bucketCount":    1,
            "contractType":   "binary_threshold",
        }
        for p in points
    ]

    # Venue Status pretty label (v7 uses .title()).
    venue_status_label = (pkg.venue_status or "").title()
    # Reference Status: "Eligible" if string == "eligible", else "Not eligible
    # for Oriel publication" — mirrors v7 line 168.
    ref_status_label = (
        "Eligible"
        if (pkg.reference_status or "").lower() == "eligible"
        else "Not eligible for Oriel publication"
    )

    # Index Print rows — matches v7 polymarket_tab.py:159-170 verbatim.
    print_rows = [
        {"label": "Index Name",        "value": "Oriel CPI Forward Index"},
        {"label": "Methodology",       "value": pkg.methodology, "mono": True},
        {"label": "Venue",             "value": pkg.venue},
        {"label": "Venue Role",        "value": pkg.venue_role},
        {"label": "Valuation Time",    "value": pkg.valuation_timestamp.strftime("%Y-%m-%d %H:%M UTC"), "mono": True},
        {"label": "Base Value",        "value": "100.00", "mono": True},
        {"label": "Anchor Exp. Value", "value": f"{front.implied_yoy:.4f}%", "mono": True, "strong": True},
        {"label": "Venue Status",      "value": venue_status_label,
         "tone":  "success" if pkg.venue_status == "live"
                  else "warning" if pkg.venue_status == "partial"
                  else "danger"},
        {"label": "Reference Status",  "value": ref_status_label,
         "tone":  "success" if pkg.reference_status == "eligible" else "warning"},
        {"label": "Constituents",      "value": str(n), "mono": True},
    ]

    index_print = {
        "indexLevel":           100.00,
        "baseValue":            100.00,
        "valuationTime":        pkg.valuation_timestamp.strftime("%Y-%m-%d %H:%M UTC"),
        "anchorExpectedValue":  float(front.implied_yoy),
        "publishable":          bool(pkg.publishable),
        "publishabilityReason": pkg.publishability_reason,
        "constituentCount":     n,
        "flaggedCount":         sum(1 for p in points if not p.publishable),
        "front": {"value": float(front.implied_yoy), "maturity": front.release_month, "label": "Front (1M implied)"},
        "back":  {"value": float(back.implied_yoy),  "maturity": back.release_month,
                  "label": f"Back ({_back_horizon_label(n)} implied)"},
        "slope": {
            "delta":     term_structure_pct,
            "pct":       round(term_structure_pct * 100, 2),
            "direction": "up" if term_structure_pct >= 0 else "down",
        },
        "rows": print_rows,    # v7-exact row sequence rendered in IndexPrintCard
    }

    # Stats card — v7 line 213-218: Mean / Avg σ / Avg confidence.
    expected_values = [float(p.implied_yoy) for p in points]
    sigmas          = [max(float(p.upper_band) - float(p.implied_yoy), 0.0001) for p in points]
    stats = {
        "unit":             "%",
        "mean":             round(sum(expected_values) / n, 4),
        "avgStdDev":        round(sum(sigmas) / n, 4),
        "minValue":         round(min(expected_values), 4),
        "maxValue":         round(max(expected_values), 4),
        "constituentCount": n,
        "avgConfidence":    avg_conf,
        # Custom row sequence so IndexStatsCard renders exactly v7's three cards.
        "rows": [
            {"label": "Mean (all maturities)", "value": f"{sum(expected_values)/n:.4f}%"},
            {"label": "Avg σ",                 "value": f"{sum(sigmas)/n:.4f}%"},
            {"label": "Avg confidence",        "value": f"{avg_conf:.1f}"},
        ],
    }

    # Dislocation: v7 line 155-209.
    cpi_swap_proxy = round(float(front.implied_yoy) * 1.012, 4)
    dislocation_bp = round((cpi_swap_proxy - float(front.implied_yoy)) * 100, 1)
    spread_proxy = next(
        (float(p.spread_bp) for p in points if p.spread_bp is not None),
        0.0,
    )
    dislocation = {
        "unit":            "%",
        "orielForward":    float(front.implied_yoy),
        "cpiSwapProxy":    cpi_swap_proxy,
        "swapLabel":       "CPI Swap (proxy)",
        "frontLabel":      f"Oriel Forward ({front.release_month.split()[0]})",
        "dislocationBps":  dislocation_bp,
        # v7 polymarket replaces "Energy Signal" with an "Avg spread" row that
        # has a real value AND a signal tag. middleRow drives that.
        "middleRow": {
            "label":      "Avg spread",
            "value":      f"{spread_proxy:.1f} bp",
            "signal":     "venue",
            "signalTone": "warning",
        },
    }

    # Constituents table — one row per CurvePoint (v7 line 279-289).
    constituents = []
    for p in points:
        status = "Eligible" if p.publishable else "Flagged"
        constituents.append({
            "ticker":         p.market_id or f"POLY_{_iso_yymm(p.release_month)}",
            "label":          p.release_month,
            "price":          float(p.implied_yoy),
            "volume":         float(p.volume or 0),
            "openInterest":   float(p.open_interest or 0),
            "spreadBp":       float(p.spread_bp) if p.spread_bp is not None else None,
            "confidenceScore": float(p.confidence_score),
            "marketId":       p.market_id,
            "type":           "Threshold market",
            "method":         "Polymarket Gamma mid",
            "status":         status,
            "indexLevel":     round(100.0 * (float(p.implied_yoy) / float(front.implied_yoy)), 4)
                              if float(front.implied_yoy) else 100.0,
        })

    # Contracts observation table — v7 line 260-273.
    contract_rows = []
    for c in contracts:
        spread_bp = (round((c.spread or 0.0) * 10000.0, 1)) if c.spread is not None else None
        contract_rows.append({
            "release":    c.release_month,
            "threshold":  float(c.threshold) if c.threshold is not None else None,
            "implied":    float(c.expected_value) if c.expected_value is not None else None,
            "bid":        float(c.bid) if c.bid is not None else None,
            "ask":        float(c.ask) if c.ask is not None else None,
            "spreadBp":   spread_bp,
            "volume":     float(c.volume) if c.volume is not None else None,
            "openInterest": float(c.open_interest) if c.open_interest is not None else None,
            "confidence": float(c.confidence_score),
            "marketId":   c.market_id,
            "status":     "Eligible" if c.publishable else "Flagged",
        })

    return {
        "valuationTime":         pkg.valuation_timestamp.strftime("%Y-%m-%d %H:%M UTC"),
        "valuationTimeIso":      pkg.valuation_timestamp.isoformat(),
        "publishable":           bool(pkg.publishable),
        "publishabilityReason":  pkg.publishability_reason,
        "sourceStatus":          pkg.source_status,
        "sampleMode":            bool(pkg.sample_mode),
        "methodology":           pkg.methodology,
        "venue":                 pkg.venue,
        "venueRole":             pkg.venue_role,
        "venueStatus":           pkg.venue_status,
        "referenceStatus":       pkg.reference_status,
        "countsTowardOrielBlend": bool(pkg.counts_toward_oriel_blend),
        "termStructurePct":      term_structure_pct,
        "forwardCurve":          forward_curve,
        "constituents":          constituents,
        "contractObservations":  contract_rows,
        "indexPrint":            index_print,
        "stats":                 stats,
        "dislocation":           dislocation,
    }


def _short_label(release_month: str) -> str:
    parts = (release_month or "").strip().split()
    if len(parts) == 2 and parts[1].isdigit() and len(parts[1]) == 4:
        return f"{parts[0]} {parts[1][2:]}"
    return release_month


def _iso_yymm(release_month: str) -> str:
    parts = (release_month or "").strip().split()
    if len(parts) == 2 and parts[1].isdigit():
        return f"{parts[1][2:]}{parts[0][:3].upper()}"
    return release_month.replace(" ", "_").upper()


def _back_horizon_label(n_points: int) -> str:
    idx = min(max(n_points - 1, 0), 5)
    return f"{idx + 1}M"


def _build_package(*, mode: str):
    try:
        from venues.polymarket import (
            PolymarketClient,
            DEFAULT_CONFIG,
            score_and_package,
        )
    except Exception as ex:
        logger.warning("Polymarket %s: import failed (%s)", mode, ex)
        return None

    if mode == "live":
        contracts, status = _live_contracts_cached()
        if contracts is None:
            return None
        try:
            pkg = score_and_package(contracts, source_status=status, config=DEFAULT_CONFIG)
            return _serialize_curve_package(pkg)
        except Exception as ex:
            logger.warning("Polymarket live: score_and_package failed (%s)", ex)
            return None

    try:
        client = PolymarketClient(DEFAULT_CONFIG)
        contracts = client._sample_contracts(datetime.now(UTC))
        pkg = score_and_package(contracts, source_status="FALLBACK", config=DEFAULT_CONFIG)
        return _serialize_curve_package(pkg)
    except Exception as ex:
        logger.warning("Polymarket sample: build failed (%s)", ex)
        return None


def _build_payload() -> Dict[str, Any]:
    try:
        from venues.polymarket import DEFAULT_CONFIG
    except Exception as ex:
        logger.warning("Polymarket payload: import failed (%s)", ex)
        return {"live": None, "sample": None, "methodologyTable": [], "feedConfig": {}, "notes": None}

    live   = _build_package(mode="live")
    sample = _build_package(mode="sample")

    # Methodology rows — v7 polymarket_tab.py:219-226 verbatim.
    methodology_table = [
        {"key": "Price basis",    "value": "gamma best bid/ask midpoint"},
        {"key": "Normalization",  "value": "threshold midpoint anchored"},
        {"key": "Interpolation",  "value": "log-linear"},
        {"key": "Publishability", "value": "spread + volume + OI + stale rule"},
        {"key": "Stale rule",     "value": f"{DEFAULT_CONFIG.stale_after_hours}h timeout"},
        {"key": "Fallback",       "value": "sample_data_on_live_failure"},
    ]

    feed_config = {
        "minVolume":        float(DEFAULT_CONFIG.min_volume),
        "minOpenInterest":  float(DEFAULT_CONFIG.min_open_interest),
        "maxCurvePoints":   int(DEFAULT_CONFIG.max_curve_points),
        "staleAfterHours":  int(DEFAULT_CONFIG.stale_after_hours),
        "websocketReady":   "market-channel compatible",
    }

    # Notes copy — verbatim from v7 polymarket_tab.py:330-343.
    # NotesPanel renders three distinct sections, so split the v7 paragraph
    # into the right slots:
    #   liveDataNote = first paragraph (REST polling / websocket future)
    #   disclaimer   = second paragraph (sample fallback / diagnostic)
    notes = {
        "audience":     "Polymarket-facing summary",
        "liveDataNote": (
            "Public Polymarket market discovery is integrated via REST polling. "
            "The handoff is structured so the developer can optionally upgrade this to the "
            "public market websocket later without changing the curve packaging layer."
        ),
        "disclaimer": (
            "Sample data remains available as fallback when live feed is disabled or unavailable. "
            "Venue outputs are diagnostic until explicitly blended into the official Oriel CPI basis layer."
        ),
        "phase2": {
            "title": "Phase II — Live Data & Backtest",
            "items": [
                {
                    "icon":  "check",
                    "title": "Live Polymarket integration",
                    "body":  "public market polling, best bid/ask midpoint normalization, "
                             "maturity extraction, and controlled CPI filtering.",
                },
                {
                    "icon":  "check",
                    "title": "Governed mapping",
                    "body":  "threshold markets map into one implied CPI observation per maturity, "
                             "with confidence scoring and publishability filters.",
                },
                {
                    "icon":  "sparkles",
                    "title": "Next step",
                    "body":  "wire public websocket updates into the same packaging layer for "
                             "lower-latency venue refreshes.",
                },
            ],
        },
    }

    return {
        "live":             live,
        "sample":           sample,
        "methodologyTable": methodology_table,
        "feedConfig":       feed_config,
        "notes":            notes,
    }


def polymarket_payload_json() -> str:
    p = _build_payload()
    if p["live"] is None and p["sample"] is None:
        return "null"
    return json.dumps(p, separators=(",", ":"))


if __name__ == "__main__":
    print(polymarket_payload_json())
