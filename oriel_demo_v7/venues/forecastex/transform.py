from __future__ import annotations

from datetime import datetime, timezone; UTC = timezone.utc
from statistics import pstdev

from .config import ForecastExConfig
from .models import CurvePackage, CurvePoint, ForecastExContract


MONTH_ORDER = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
}


def score_and_package(
    contracts: list[ForecastExContract],
    source_status: str,
    config: ForecastExConfig,
    prior_curve: list[float] | None = None,
) -> CurvePackage:
    valuation_timestamp = datetime.now(UTC)

    # Drop contracts whose threshold falls outside the plausible CPI YoY band
    # (defensive against MoM or off-scale strikes leaking into the feed).
    contracts = [
        c for c in contracts
        if c.threshold is None or 0.5 <= float(c.threshold) <= 8.0
    ]

    for contract in contracts:
        contract.expected_value = normalize_expected_value(
            mid=contract.mid,
            threshold=contract.threshold,
            coupon_bps_adjustment=config.coupon_bps_adjustment,
        )
        contract.liquidity_score = liquidity_score(contract.volume, contract.open_interest)
        contract.publishable = is_publishable(contract, config)
        contract.publishability_reason = publishability_reason(contract, config)

    eligible = [c for c in contracts if c.publishable and c.expected_value is not None]

    # Deduplicate: one contract per release_month.
    # For binary threshold contracts, pick the one whose mid (YES price) is
    # closest to 0.50 — that strike is nearest the market's median CPI estimate.
    # We rank on the raw `mid` rather than `expected_value` because the latter
    # is now a CPI YoY value (threshold-adjusted) and the at-the-money pick
    # has to be made on the probability, not the implied level.
    def _atm_distance(c: ForecastExContract) -> float:
        return abs(float(c.mid) - 0.5) if c.mid is not None else 1.0

    seen: dict[str, ForecastExContract] = {}
    for c in eligible:
        key = c.release_month
        if key not in seen or _atm_distance(c) < _atm_distance(seen[key]):
            seen[key] = c
    eligible = sorted(seen.values(), key=release_month_sort_key)[: config.max_curve_points]

    if not eligible:
        return CurvePackage(
            valuation_timestamp=valuation_timestamp,
            points=[],
            source_status=source_status,
            publishable=False,
            publishability_reason="No eligible ForecastEx CPI contracts were found for the selected valuation timestamp.",
            sample_mode=source_status == "FALLBACK",
            contracts=list(contracts),
        )

    expected_values = [c.expected_value for c in eligible if c.expected_value is not None]
    sigma = pstdev(expected_values) if len(expected_values) > 1 else 0.05

    if prior_curve is None:
        prior_curve = [round(max(v + 0.02, 0.0), 4) for v in expected_values]

    points: list[CurvePoint] = []
    for idx, contract in enumerate(eligible):
        implied = contract.expected_value or 0.0
        points.append(
            CurvePoint(
                label=contract.release_month,
                release_month=contract.release_month,
                implied_yoy=round(implied, 4),
                lower_band=round(max(implied - sigma, -0.25), 4),
                upper_band=round(implied + sigma, 4),
                prior_curve_yoy=prior_curve[idx] if idx < len(prior_curve) else None,
                volume=contract.volume or 0,
                open_interest=contract.open_interest or 0,
                publishable=True,
            )
        )

    publishable = len(points) >= min(4, config.max_curve_points)
    reason = "Eligible" if publishable else "Insufficient maturity coverage"

    return CurvePackage(
        valuation_timestamp=valuation_timestamp,
        points=points,
        source_status=source_status,
        publishable=publishable,
        publishability_reason=reason,
        sample_mode=source_status == "FALLBACK",
        contracts=list(contracts),
    )


def normalize_expected_value(
    mid: float | None,
    threshold: float | None = None,
    coupon_bps_adjustment: float = 0.0,
) -> float | None:
    """Convert a YES probability + threshold into an implied CPI YoY (%).

    ForecastEx CPIY contracts are binary "Will CPI YoY exceed X%?" questions
    where ``mid`` is the YES price (in [0,1]) and ``threshold`` is the strike X
    in percent. The implied YoY is the threshold adjusted by how far the YES
    price sits from 50/50 — the same convention the Polymarket adapter uses
    so the two venues are directly comparable.

    Formula: implied_yoy = threshold + (mid - 0.5) * 0.5

    A mid of 0.50 means the threshold is the implied median (no adjustment).
    A mid of 0.75 means the market thinks CPI will land roughly 0.125% above
    the threshold; a mid of 0.25 means roughly 0.125% below.

    When ``threshold`` is missing we fall back to the raw mid (legacy
    behaviour) so older code paths and sample fixtures don't crash.
    """
    if mid is None:
        return None
    adjusted_mid = float(mid) - (coupon_bps_adjustment / 10000.0)
    if threshold is None:
        return round(adjusted_mid, 4)
    return round(float(threshold) + (adjusted_mid - 0.5) * 0.5, 4)


def liquidity_score(volume: int | None, open_interest: int | None) -> float:
    volume = volume or 0
    open_interest = open_interest or 0
    return round(min(volume / 1000.0, 1.0) * 0.5 + min(open_interest / 5000.0, 1.0) * 0.5, 3)


def is_publishable(contract: ForecastExContract, config: ForecastExConfig) -> bool:
    if contract.expected_value is None:
        return False
    if (contract.volume or 0) < config.min_volume:
        return False
    if (contract.open_interest or 0) < config.min_open_interest:
        return False
    return True


def publishability_reason(contract: ForecastExContract, config: ForecastExConfig) -> str:
    if contract.expected_value is None:
        return "missing expected value"
    if (contract.volume or 0) < config.min_volume:
        return "low volume"
    if (contract.open_interest or 0) < config.min_open_interest:
        return "low open interest"
    return "eligible"


def release_month_sort_key(contract: ForecastExContract) -> tuple[int, int]:
    parts = contract.release_month.split()
    if len(parts) == 2 and parts[0][:3].title() in MONTH_ORDER:
        return (int(parts[1]), MONTH_ORDER[parts[0][:3].title()])
    return (9999, 99)
