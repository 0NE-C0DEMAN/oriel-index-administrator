from __future__ import annotations

from datetime import datetime, timezone

from .config import CMEConfig
from .models import CMEContract, CurvePackage, CurvePoint

UTC = timezone.utc


def score_and_package(
    contracts: list[CMEContract],
    source_status: str,
    config: CMEConfig,
) -> CurvePackage:
    valuation_timestamp = datetime.now(UTC)
    for contract in contracts:
        contract.expected_value = normalize_expected_value(contract.mid)
        contract.liquidity_score = liquidity_score(contract.volume, contract.open_interest)
        contract.publishable = is_publishable(contract, config)
        contract.publishability_reason = publishability_reason(contract, config)

    eligible = [contract for contract in contracts if contract.publishable and contract.expected_value is not None]
    selected = sorted(eligible, key=lambda c: (c.release_month, c.threshold or 9999, c.contract_id))[
        : config.max_curve_points
    ]

    if not selected:
        return CurvePackage(
            valuation_timestamp=valuation_timestamp,
            points=[],
            source_status=source_status,
            publishable=False,
            publishability_reason="No eligible CME CPI threshold contracts were found.",
            fixture_mode=source_status in ("FIXTURE", "FALLBACK"),
            contracts=contracts,
        )

    points = [
        CurvePoint(
            label=f"{contract.release_month:%b %Y} {contract.direction} {contract.threshold:.2f}%",
            release_month=contract.release_month,
            reference_month=contract.reference_month,
            threshold=contract.threshold or 0.0,
            direction=contract.direction,
            probability=contract.expected_value or 0.0,
            volume=contract.volume,
            open_interest=contract.open_interest,
            liquidity_score=contract.liquidity_score,
            contract_id=contract.contract_id,
            publishable=True,
        )
        for contract in selected
    ]

    publishable = len({point.release_month for point in points}) >= config.min_publishable_maturities
    return CurvePackage(
        valuation_timestamp=valuation_timestamp,
        points=points,
        source_status=source_status,
        publishable=publishable,
        publishability_reason="Eligible" if publishable else "Insufficient maturity coverage",
        fixture_mode=source_status in ("FIXTURE", "FALLBACK"),
        contracts=contracts,
    )


def normalize_expected_value(mid: float | None) -> float | None:
    if mid is None:
        return None
    return round(max(min(float(mid), 1.0), 0.0), 4)


def liquidity_score(volume: int | None, open_interest: int | None) -> float:
    volume = volume or 0
    open_interest = open_interest or 0
    return round(min(volume / 1000.0, 1.0) * 0.5 + min(open_interest / 5000.0, 1.0) * 0.5, 3)


def is_publishable(contract: CMEContract, config: CMEConfig) -> bool:
    if contract.expected_value is None:
        return False
    if contract.threshold is None:
        return False
    if contract.volume < config.min_volume:
        return False
    if contract.open_interest < config.min_open_interest:
        return False
    if contract.liquidity_score < config.min_liquidity_score:
        return False
    return True


def publishability_reason(contract: CMEContract, config: CMEConfig) -> str:
    if contract.expected_value is None:
        return "missing probability"
    if contract.threshold is None:
        return "missing threshold"
    if contract.volume < config.min_volume:
        return "low volume"
    if contract.open_interest < config.min_open_interest:
        return "low open interest"
    if contract.liquidity_score < config.min_liquidity_score:
        return "low liquidity score"
    return "eligible"
