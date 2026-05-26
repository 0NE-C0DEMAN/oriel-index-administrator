"""
cme_data.py — Build the CME CPI proxy payload by calling v7's CME scaffold
verbatim (CMEClient + score_and_package) so the Redesign React UI shows
exactly the same data v7's tabs/cme_tab.py renders.

Mirrors the v7 flow:
    config = CMEConfig(source_mode="proxy")
    contracts, status = CMEClient(config).fetch_contracts()
    package = score_and_package(contracts, status, config)

Failures degrade gracefully: any import/runtime error returns a payload with
status="UNAVAILABLE" and empty arrays so the React CmeView can still render
a "feed unavailable" panel without crashing the bundle.
"""
from __future__ import annotations

import functools
import json
import logging
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# Add v7's package root to sys.path so we can import its venues module.
_V7_ROOT = (Path(__file__).resolve().parent.parent / "oriel_demo_v7").resolve()
if str(_V7_ROOT) not in sys.path:
    sys.path.insert(0, str(_V7_ROOT))


def _fmt_date(d) -> Optional[str]:
    if d is None:
        return None
    if isinstance(d, datetime):
        return d.date().isoformat()
    if isinstance(d, date):
        return d.isoformat()
    return str(d)


def _fmt_release(d) -> Optional[str]:
    """v7 cme_tab renders release_month as 'Mar 2026' (%b %Y)."""
    if d is None:
        return None
    if isinstance(d, (datetime, date)):
        return (d.date() if isinstance(d, datetime) else d).strftime("%b %Y")
    return str(d)


def _serialize_point(p) -> Dict[str, Any]:
    return {
        "label":          p.label,
        "releaseMonth":   _fmt_release(p.release_month),
        "releaseMonthIso": _fmt_date(p.release_month),
        "referenceMonth": _fmt_release(p.reference_month),
        "threshold":      float(p.threshold) if p.threshold is not None else None,
        "direction":      p.direction,
        "probability":    float(p.probability) if p.probability is not None else None,
        "volume":         int(p.volume or 0),
        "openInterest":   int(p.open_interest or 0),
        "liquidityScore": float(p.liquidity_score or 0.0),
        "contractId":     p.contract_id,
        "publishable":    bool(p.publishable),
    }


def _serialize_contract(c) -> Dict[str, Any]:
    return {
        "contractId":         c.contract_id,
        "productCode":        c.product_code,
        "eventDescription":   c.event_description,
        "releaseMonth":       _fmt_release(c.release_month),
        "releaseMonthIso":    _fmt_date(c.release_month),
        "referenceMonth":     _fmt_release(c.reference_month),
        "threshold":          float(c.threshold) if c.threshold is not None else None,
        "direction":          c.direction,
        "side":               c.side,
        "mid":                float(c.mid) if c.mid is not None else None,
        "bid":                float(c.bid) if c.bid is not None else None,
        "ask":                float(c.ask) if c.ask is not None else None,
        "last":               float(c.last) if c.last is not None else None,
        "volume":             int(c.volume or 0),
        "openInterest":       int(c.open_interest or 0),
        "settlementSource":   c.settlement_source,
        "publishable":        bool(c.publishable),
        "publishabilityReason": c.publishability_reason,
        "expectedValue":      float(c.expected_value) if c.expected_value is not None else None,
        "liquidityScore":     float(c.liquidity_score or 0.0),
    }


@functools.lru_cache(maxsize=1)
def _cached_package():
    """Process-level cache wrapper. v7's tabs/cme_tab.py uses
    @st.cache_data(ttl=600); we mirror with lru_cache because the outer
    streamlit_app.py call also wraps this in @st.cache_data."""
    try:
        from venues.cme import CMEClient, CMEConfig, score_and_package  # type: ignore
    except Exception as ex:
        logger.warning("CME payload: import failed (%s)", ex)
        return None
    try:
        config = CMEConfig(source_mode="proxy")
        contracts, status = CMEClient(config).fetch_contracts()
        return score_and_package(contracts, status, config)
    except Exception as ex:
        logger.warning("CME payload: build failed (%s)", ex)
        return None


def _build_payload() -> Dict[str, Any]:
    pkg = _cached_package()
    if pkg is None:
        return {
            "sourceStatus":           "UNAVAILABLE",
            "publishable":            False,
            "publishabilityReason":   "CME proxy unavailable in this environment.",
            "fixtureMode":            False,
            "valuationTimestamp":     None,
            "methodology":            "v0.1.0-cme-licensed-feed-scaffold",
            "venue":                  "CME",
            "points":                 [],
            "contracts":              [],
            "contractCount":          0,
            "curvePointCount":        0,
            "maturityCount":          0,
            "methodologyTable": [
                {"key": "Source mode",     "value": "proxy"},
                {"key": "Role",            "value": "Shadow constituent candidate"},
                {"key": "Governance gate", "value": "Pending licensed feed"},
                {"key": "Promotion rule",  "value": "Same gate as Kalshi + ForecastEx"},
            ],
        }

    maturity_count = len({p.release_month for p in pkg.points})

    # Venue readiness display model (PR #20). CME runs in proxy mode so we
    # surface "Proxy / Shadow Signal" / "Shadow Candidate" / "Eligible for
    # shadow impact" instead of headlining as "Not eligible".
    try:
        from analytics.venue_readiness import build_venue_display_status
        _display_status = build_venue_display_status(
            venue="CME",
            source_status=pkg.source_status,
            publishable=pkg.publishable,
            constituent_count=len(pkg.points),
            comparable_row_count=len(pkg.points),
            is_proxy=True,
            has_normalized_rows=bool(pkg.points),
        )
        _signal_status = _display_status.signal_status
        _reference_readiness = _display_status.reference_readiness
        _trade_use = _display_status.trade_use
        _display_reason = _display_status.reason
    except Exception:
        _signal_status = "Proxy / Shadow Signal" if pkg.points else "Unavailable"
        _reference_readiness = "Shadow Candidate" if pkg.points else "Unavailable"
        _trade_use = "Eligible for shadow impact" if pkg.points else "Not enough comparable data"
        _display_reason = "Proxy venue is evaluated through shadow diagnostics; governed inclusion remains methodology-gated."

    return {
        "sourceStatus":         pkg.source_status,
        "publishable":          bool(pkg.publishable),
        "publishabilityReason": pkg.publishability_reason,
        "fixtureMode":          bool(pkg.fixture_mode),
        "valuationTimestamp":   pkg.valuation_timestamp.isoformat() if pkg.valuation_timestamp else None,
        "methodology":          pkg.methodology,
        "venue":                pkg.venue,
        "signalStatus":         _signal_status,
        "referenceReadiness":   _reference_readiness,
        "tradeUse":             _trade_use,
        "displayReason":        _display_reason,
        "points":               [_serialize_point(p) for p in pkg.points],
        "contracts":            [_serialize_contract(c) for c in pkg.contracts],
        "contractCount":        len(pkg.contracts),
        "curvePointCount":      len(pkg.points),
        "maturityCount":        maturity_count,
        # Methodology rows shown beneath the KPI strip in the React CmeView,
        # mirroring the inline disclaimer text v7's tabs/cme_tab.py shows.
        "methodologyTable": [
            {"key": "Source mode",     "value": "proxy"},
            {"key": "Role",            "value": "Shadow constituent candidate"},
            {"key": "Governance gate", "value": "Pending licensed feed; PROXY label flows end-to-end"},
            {"key": "Promotion rule",  "value": "Same eligibility gate as Kalshi + ForecastEx"},
            {"key": "Methodology",     "value": pkg.methodology},
        ],
    }


def cme_payload_json() -> str:
    """JSON-serialized payload ready for inlining as
    `window.__CME__ = …;` in the React bundle."""
    p = _build_payload()
    return json.dumps(p, separators=(",", ":"))


if __name__ == "__main__":
    print(cme_payload_json())
