"""Tests for ForecastEx implied_yoy math.

The earlier implementation computed implied_yoy as the raw YES probability
(a value in [0,1]), which then got displayed as if it were CPI YoY in
percent. That produced nonsense like "0.50% implied CPI YoY" for a
threshold contract priced at fair-value 50/50.

The corrected formula adjusts the threshold by how far the YES price sits
from 0.50:

    implied_yoy = threshold + (mid - 0.5) * 0.5

This matches the Polymarket adapter convention so the two venues are
comparable, and gives realistic CPI YoY values in the 1.5-4% band when
fed live ForecastEx CPIY threshold contracts.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from venues.forecastex.config import ForecastExConfig
from venues.forecastex.models import ForecastExContract
from venues.forecastex.transform import (
    normalize_expected_value,
    score_and_package,
)


UTC = timezone.utc


def _make(threshold: float, mid: float, release_month: str = "May 2026") -> ForecastExContract:
    return ForecastExContract(
        venue="ForecastEx",
        contract_id=f"CPIY_{release_month}_{threshold}",
        product_code=f"CPIY_{release_month}",
        event_question=f"Will US CPI YoY exceed {threshold}% in {release_month}?",
        release_month=release_month,
        resolution_time=None,
        threshold=threshold,
        side="YES",
        bid=mid,
        ask=mid,
        last=mid,
        mid=mid,
        open_interest=100,
        volume=100,
        coupon_rate=None,
        settlement_source="BLS",
        valuation_timestamp=datetime.now(UTC),
    )


def test_normalize_at_50_50_returns_threshold():
    """A YES price of exactly 0.50 means threshold IS the implied median."""
    assert normalize_expected_value(mid=0.50, threshold=2.5) == 2.5


def test_normalize_high_mid_lifts_above_threshold():
    """Mid 0.75 means the market expects CPI to land above the threshold."""
    ev = normalize_expected_value(mid=0.75, threshold=2.5)
    assert ev == pytest.approx(2.625, abs=1e-4)  # 2.5 + (0.75-0.5)*0.5


def test_normalize_low_mid_drops_below_threshold():
    """Mid 0.25 means the market expects CPI to land below the threshold."""
    ev = normalize_expected_value(mid=0.25, threshold=2.5)
    assert ev == pytest.approx(2.375, abs=1e-4)  # 2.5 + (0.25-0.5)*0.5


def test_normalize_returns_none_when_mid_missing():
    assert normalize_expected_value(mid=None, threshold=2.5) is None


def test_normalize_falls_back_to_raw_mid_when_threshold_missing():
    """Legacy fallback so older callers / sample fixtures don't crash."""
    assert normalize_expected_value(mid=0.42, threshold=None) == 0.42


def test_score_and_package_picks_atm_strike_not_lowest_threshold():
    """Dedup must rank by mid-distance-from-0.5, not by raw expected_value.

    Under the OLD formula expected_value == mid so picking 'closest to 0.5'
    naturally picked the ATM strike. Under the NEW formula expected_value is
    a CPI YoY value and 'closest to 0.5' would pick the LOWEST threshold,
    which is wrong. This regression test pins the corrected dedup.
    """
    contracts = [
        _make(threshold=1.5, mid=0.90),  # far OTM
        _make(threshold=2.0, mid=0.75),
        _make(threshold=2.5, mid=0.52),  # ATM — should be picked
        _make(threshold=3.0, mid=0.25),
        _make(threshold=3.5, mid=0.10),
    ]
    pkg = score_and_package(contracts, source_status="LIVE", config=ForecastExConfig())
    assert len(pkg.points) == 1
    front = pkg.points[0]
    # ATM pick has threshold 2.5 and mid 0.52, so implied_yoy = 2.5 + 0.01 = 2.51
    assert front.implied_yoy == pytest.approx(2.51, abs=1e-2)
    # And the implied YoY is in a realistic CPI band, not stuck at ~0.5
    assert 2.0 <= front.implied_yoy <= 3.0


def test_score_and_package_realistic_cpi_yoy_across_months():
    """End-to-end smoke: multiple months each with an ATM strike around 2.5%."""
    months = ["Mar 2026", "Apr 2026", "May 2026"]
    contracts = []
    for m in months:
        contracts.extend([
            _make(threshold=2.0, mid=0.80, release_month=m),
            _make(threshold=2.5, mid=0.55, release_month=m),
            _make(threshold=3.0, mid=0.25, release_month=m),
        ])
    pkg = score_and_package(contracts, source_status="LIVE", config=ForecastExConfig())
    assert len(pkg.points) == 3
    for point in pkg.points:
        # Each picked the threshold=2.5, mid=0.55 contract → implied 2.525
        assert 2.0 <= point.implied_yoy <= 3.0, f"unrealistic CPI YoY at {point.release_month}: {point.implied_yoy}"
