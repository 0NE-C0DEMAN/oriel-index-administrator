from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class VenueDisplayStatus:
    signal_status: str
    reference_readiness: str
    trade_use: str
    reason: str


def _is_live_source(source_status: str | None) -> bool:
    status = (source_status or "").strip().upper()
    return any(token in status for token in ("LIVE", "OK", "CURRENT")) and "EMPTY" not in status


def build_venue_display_status(
    *,
    venue: str,
    source_status: str | None = None,
    publishable: bool = False,
    constituent_count: int = 0,
    comparable_row_count: int | None = None,
    is_proxy: bool = False,
    has_normalized_rows: bool | None = None,
    reason: str | None = None,
) -> VenueDisplayStatus:
    """Map technical gates to user-facing venue role labels.

    This helper is display-only. It does not alter publishability,
    eligibility, or governed-curve construction booleans.
    """
    count = max(int(constituent_count or 0), 0)
    comparable = count if comparable_row_count is None else max(int(comparable_row_count or 0), 0)
    normalized = (count > 0) if has_normalized_rows is None else bool(has_normalized_rows)
    source = (source_status or "").strip().upper()

    if is_proxy:
        signal_status = "Proxy / Shadow Signal" if normalized else "Unavailable"
        reference_readiness = "Shadow Candidate" if normalized else "Unavailable"
        trade_use = "Eligible for shadow impact" if normalized else "Not enough comparable data"
        display_reason = reason or "Proxy venue is evaluated through shadow diagnostics; governed inclusion remains methodology-gated."
        return VenueDisplayStatus(signal_status, reference_readiness, trade_use, display_reason)

    if not normalized:
        signal_status = "Unavailable"
    elif source == "FALLBACK":
        signal_status = "Fallback Signal"
    elif _is_live_source(source) or source not in {"", "FALLBACK"}:
        signal_status = "Live Signal"
    else:
        signal_status = "Normalized Signal"

    if not normalized:
        reference_readiness = "Unavailable"
        display_reason = reason or "No normalized CPI rows are currently available for this venue."
    elif publishable:
        reference_readiness = "Reference Eligible"
        display_reason = reason or "Current venue inputs satisfy the applicable governed-reference screen."
    else:
        reference_readiness = "Coverage Review"
        display_reason = reason or "Additional constituent / maturity coverage required for governed publication."

    trade_use = "Included in dislocation analysis" if comparable > 0 else "Not enough comparable data"
    return VenueDisplayStatus(signal_status, reference_readiness, trade_use, display_reason)


def build_status_rows(status: VenueDisplayStatus) -> list[dict[str, Any]]:
    return [
        {"Concept": "Signal Status", "Status": status.signal_status},
        {"Concept": "Reference Readiness", "Status": status.reference_readiness},
        {"Concept": "Trade Use", "Status": status.trade_use},
        {"Concept": "Reason", "Status": status.reason},
    ]
