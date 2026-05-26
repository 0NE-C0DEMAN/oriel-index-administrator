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


def _build_front_distribution(pkg) -> Optional[Dict[str, Any]]:
    """Compute the implied probability distribution at the front release_month
    from pkg.contracts. Returns a dict shaped like the React `bucketSnapshots[0]`,
    or None when the live ladder is too thin to bucket."""
    try:
        from venues._distribution import build_threshold_distribution, parse_bucket_edges  # type: ignore
        from venues.polymarket import PolymarketClient  # type: ignore
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

    def _direction(c):
        return PolymarketClient.extract_threshold_direction(
            getattr(c, "question", "") or getattr(c, "slug", "") or ""
        )

    labels, probs_pct, ev = build_threshold_distribution(
        front_contracts,
        threshold_attr="threshold",
        price_attr="mid",
        direction_fn=_direction,
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

    # Venue readiness display model (PR #20). Display-only — does not alter
    # the publishable flag or governed-curve construction.
    try:
        from analytics.venue_readiness import build_venue_display_status
        _display_status = build_venue_display_status(
            venue="Polymarket",
            source_status=pkg.source_status,
            publishable=pkg.publishable,
            constituent_count=n,
            comparable_row_count=n,
            has_normalized_rows=bool(points),
            reason=(
                "2 constituents available; normalized as part of the CPI signal stack."
                if n == 2 and not pkg.publishable
                else "Polymarket is normalized and monitored as a candidate CPI signal. Inclusion in the governed reference is contract-specific and eligibility-gated."
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

    # Honest methodology label: the hardcoded venue methodology string still
    # ends in "-live" even when the fetch silently fell back to sample. Swap
    # "-live" -> "-fallback" so the chip cannot misrepresent a sample as live.
    _methodology_str = (
        pkg.methodology.replace("-live", "-fallback")
        if pkg.sample_mode and "-live" in (pkg.methodology or "")
        else pkg.methodology
    )

    # Index Print rows — mirrors v7 PR #20 polymarket_tab.py row sequence:
    # Signal Status / Reference Readiness / Trade Use replace the old binary
    # "Venue Status / Reference Status" framing, and "Default Governed Curve"
    # explicitly states the candidate venue does not mutate the governed blend.
    print_rows = [
        {"label": "Index Name",             "value": "Oriel CPI Forward Index"},
        {"label": "Methodology",            "value": _methodology_str, "mono": True},
        {"label": "Venue",                  "value": pkg.venue},
        {"label": "Venue Role",             "value": "Candidate CPI signal"},
        {"label": "Signal Status",          "value": _signal_status,
         "tone":  "success" if _signal_status in ("Live Signal", "Proxy / Shadow Signal") else "warning"},
        {"label": "Reference Readiness",    "value": _reference_readiness,
         "tone":  "success" if _reference_readiness == "Reference Eligible" else "warning"},
        {"label": "Trade Use",              "value": _trade_use},
        {"label": "Default Governed Curve", "value": "Unchanged"},
        {"label": "Constituents",           "value": str(n), "mono": True},
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
        "signalStatus":         _signal_status,
        "referenceReadiness":   _reference_readiness,
        "tradeUse":             _trade_use,
        "displayReason":        _display_reason,
        "front": {"value": float(front.implied_yoy), "maturity": front.release_month, "label": "Front (1M implied)"},
        "back":  {"value": float(back.implied_yoy),  "maturity": back.release_month,
                  "label": f"Back ({_back_horizon_label(n)} implied)"},
        "slope": {
            "delta":     term_structure_pct,
            "pct":       round(term_structure_pct * 100, 2),
            "direction": "up" if term_structure_pct >= 0 else "down",
        },
        "rows": print_rows,    # PR #20 row sequence rendered in IndexPrintCard
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

    front_distribution = _build_front_distribution(pkg)

    return {
        "valuationTime":         pkg.valuation_timestamp.strftime("%Y-%m-%d %H:%M UTC"),
        "valuationTimeIso":      pkg.valuation_timestamp.isoformat(),
        "publishable":           bool(pkg.publishable),
        "publishabilityReason":  pkg.publishability_reason,
        "sourceStatus":          pkg.source_status,
        "sampleMode":            bool(pkg.sample_mode),
        # Emit the honest, sample-aware methodology string so every React
        # consumer (IndexPrintCard versionLabel + Index Print row) shows
        # "-fallback" when the live feed silently fell back to sample.
        "methodology":           _methodology_str,
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
        "frontDistribution":     front_distribution,
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
