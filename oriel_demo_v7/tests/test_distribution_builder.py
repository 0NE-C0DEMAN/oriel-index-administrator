"""Tests for venues._distribution.build_threshold_distribution.

The helper turns a set of YES/threshold contracts at a single release_month
into a bucketed probability distribution for ui.charts.make_distribution.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import pytest

from venues._distribution import build_threshold_distribution


@dataclass
class _Contract:
    threshold: Optional[float]
    mid: Optional[float]
    direction: str = "above"


def _dir(c: _Contract) -> str:
    return c.direction


def test_three_above_thresholds_produces_four_buckets():
    """3 'above' thresholds → 1 lower tail + 2 interior buckets + 1 upper tail."""
    contracts = [
        _Contract(threshold=2.0, mid=0.80),  # P(CPI > 2.0) = 0.80
        _Contract(threshold=2.5, mid=0.50),  # P(CPI > 2.5) = 0.50
        _Contract(threshold=3.0, mid=0.20),  # P(CPI > 3.0) = 0.20
    ]
    labels, probs, ev = build_threshold_distribution(contracts)
    assert labels == ["<2.0%", "2.0-2.5%", "2.5-3.0%", ">3.0%"]
    # Pre-normalization: 0.20, 0.30, 0.30, 0.20 = 1.00 → already 100%
    assert pytest.approx(sum(probs), rel=1e-3) == 100.0
    assert probs[0] == pytest.approx(20.0, abs=0.1)
    assert probs[1] == pytest.approx(30.0, abs=0.1)
    assert probs[2] == pytest.approx(30.0, abs=0.1)
    assert probs[3] == pytest.approx(20.0, abs=0.1)
    # EV = 0.2*1.75 + 0.3*2.25 + 0.3*2.75 + 0.2*3.25 = 0.35+0.675+0.825+0.65 = 2.50
    assert ev == pytest.approx(2.50, abs=0.01)


def test_direction_inversion_below_flips_probability():
    """A 'below 2.5' contract priced at 0.30 means P(CPI > 2.5) = 0.70."""
    contracts = [
        _Contract(threshold=2.0, mid=0.80, direction="above"),
        _Contract(threshold=2.5, mid=0.30, direction="below"),
        _Contract(threshold=3.0, mid=0.20, direction="above"),
    ]
    labels, probs, ev = build_threshold_distribution(contracts, direction_fn=_dir)
    # After inversion: P(>2.0)=0.80, P(>2.5)=0.70, P(>3.0)=0.20
    # Buckets: <2.0=0.20, 2.0-2.5=0.10, 2.5-3.0=0.50, >3.0=0.20  (sum=1.00)
    assert labels == ["<2.0%", "2.0-2.5%", "2.5-3.0%", ">3.0%"]
    assert probs[0] == pytest.approx(20.0, abs=0.1)
    assert probs[1] == pytest.approx(10.0, abs=0.1)
    assert probs[2] == pytest.approx(50.0, abs=0.1)
    assert probs[3] == pytest.approx(20.0, abs=0.1)
    assert ev is not None
    assert 2.0 < ev < 3.0


def test_single_threshold_returns_empty():
    """Cannot build a distribution from a single threshold."""
    contracts = [_Contract(threshold=2.5, mid=0.5)]
    labels, probs, ev = build_threshold_distribution(contracts)
    assert labels == []
    assert probs == []
    assert ev is None


def test_empty_input_returns_empty():
    labels, probs, ev = build_threshold_distribution([])
    assert labels == []
    assert probs == []
    assert ev is None


def test_skips_contracts_missing_threshold_or_price():
    contracts = [
        _Contract(threshold=2.0, mid=0.80),
        _Contract(threshold=None, mid=0.5),       # skip
        _Contract(threshold=2.5, mid=None),       # skip
        _Contract(threshold=3.0, mid=0.20),
    ]
    labels, probs, ev = build_threshold_distribution(contracts)
    # Only 2.0 and 3.0 survive → buckets: <2.0, 2.0-3.0, >3.0
    assert labels == ["<2.0%", "2.0-3.0%", ">3.0%"]
    assert sum(probs) == pytest.approx(100.0, rel=1e-3)
    assert ev is not None


def test_clips_quotes_outside_zero_one():
    """Noisy quotes outside [0,1] are clipped before being used."""
    contracts = [
        _Contract(threshold=2.0, mid=1.50),  # clipped to 1.0
        _Contract(threshold=3.0, mid=-0.10),  # clipped to 0.0
    ]
    labels, probs, ev = build_threshold_distribution(contracts)
    # Clipped: P(>2.0)=1.0, P(>3.0)=0.0
    # Buckets: <2.0=0.0 (dropped), 2.0-3.0=1.0, >3.0=0.0 (dropped)
    assert labels == ["2.0-3.0%"]
    assert probs[0] == pytest.approx(100.0, abs=0.01)
    assert ev == pytest.approx(2.5, abs=0.01)


def test_enforces_monotone_decreasing_p_gt_t():
    """If quotes violate P(>t1) >= P(>t2) for t1<t2 (noise), running min fixes it."""
    contracts = [
        _Contract(threshold=2.0, mid=0.50),  # P(>2.0) = 0.50
        _Contract(threshold=2.5, mid=0.70),  # P(>2.5) = 0.70 -- violates, clamped to 0.50
        _Contract(threshold=3.0, mid=0.30),  # P(>3.0) = 0.30
    ]
    labels, probs, _ev = build_threshold_distribution(contracts)
    # After running-min: P(>2.0)=0.50, P(>2.5)=0.50, P(>3.0)=0.30
    # Buckets: <2.0=0.50, 2.0-2.5=0.00 (dropped), 2.5-3.0=0.20, >3.0=0.30
    assert "2.0-2.5%" not in labels  # zero bucket dropped
    assert "<2.0%" in labels
    assert "2.5-3.0%" in labels
    assert ">3.0%" in labels
    assert sum(probs) == pytest.approx(100.0, rel=1e-3)


def test_duplicate_thresholds_are_averaged():
    """Two contracts at the same threshold get their mids averaged."""
    contracts = [
        _Contract(threshold=2.0, mid=0.80),
        _Contract(threshold=2.5, mid=0.40),
        _Contract(threshold=2.5, mid=0.60),  # averaged with above to 0.50
        _Contract(threshold=3.0, mid=0.20),
    ]
    labels, probs, _ev = build_threshold_distribution(contracts)
    # Effective: P(>2.0)=0.80, P(>2.5)=0.50, P(>3.0)=0.20
    # Buckets: <2.0=0.20, 2.0-2.5=0.30, 2.5-3.0=0.30, >3.0=0.20
    assert labels == ["<2.0%", "2.0-2.5%", "2.5-3.0%", ">3.0%"]
    assert probs[0] == pytest.approx(20.0, abs=0.1)
    assert probs[1] == pytest.approx(30.0, abs=0.1)
    assert probs[2] == pytest.approx(30.0, abs=0.1)
    assert probs[3] == pytest.approx(20.0, abs=0.1)


def test_threshold_range_filter_drops_mom_and_index_outliers():
    """min_threshold / max_threshold drop non-YoY thresholds before bucketing.

    Without the filter a Polymarket event group mixing MoM contracts
    (thresholds 0.01-0.5%) with YoY contracts (thresholds 1.5-4%) would
    produce a distribution where almost all mass piles into the lowest
    bucket. With the CPI-YoY range filter the MoM thresholds get dropped
    and only the realistic YoY ladder remains.
    """
    contracts = [
        # MoM-style outliers — should be dropped
        _Contract(threshold=0.01, mid=0.99),
        _Contract(threshold=0.2, mid=0.85),
        # Real YoY ladder
        _Contract(threshold=2.0, mid=0.80),
        _Contract(threshold=2.5, mid=0.50),
        _Contract(threshold=3.0, mid=0.20),
        # Index-level outlier
        _Contract(threshold=120.0, mid=0.10),
    ]
    labels, probs, ev = build_threshold_distribution(
        contracts, min_threshold=0.5, max_threshold=8.0
    )
    # Only the 3 YoY thresholds survived
    assert labels == ["<2.0%", "2.0-2.5%", "2.5-3.0%", ">3.0%"]
    assert sum(probs) == pytest.approx(100.0, rel=1e-3)
    # EV is now in the realistic CPI YoY band, not dominated by the 0.01 outlier
    assert ev is not None
    assert 2.0 < ev < 3.0


def test_threshold_range_filter_keeps_all_when_no_outliers():
    contracts = [
        _Contract(threshold=2.0, mid=0.80),
        _Contract(threshold=3.0, mid=0.20),
    ]
    labels1, probs1, _ = build_threshold_distribution(contracts)
    labels2, probs2, _ = build_threshold_distribution(
        contracts, min_threshold=0.5, max_threshold=8.0
    )
    assert labels1 == labels2
    assert probs1 == probs2
