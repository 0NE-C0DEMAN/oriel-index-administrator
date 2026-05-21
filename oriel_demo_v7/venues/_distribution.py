"""Shared distribution-builder helper.

Converts a set of YES/threshold-style contracts at a single release_month
into a bucketed probability distribution suitable for ui.charts.make_distribution.

The math: each contract is a binary YES question of the form
"Will CPI YoY be above|below threshold?". Its mid price (YES probability)
gives us P(CPI > threshold) once we normalize the direction. From the
ordered set of P(CPI > t_i) we recover bucket masses via differences:

    P(CPI in [t_i, t_{i+1}]) = P(CPI > t_i) - P(CPI > t_{i+1})
    P(CPI < t_min)           = 1 - P(CPI > t_min)
    P(CPI > t_max)           = P(CPI > t_max)

We clip to [0,1], enforce monotone non-increasing P(>t), drop empty
buckets, and renormalize so probabilities sum to 100%.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Callable, Iterable, Optional


def build_threshold_distribution(
    contracts: Iterable[object],
    *,
    threshold_attr: str = "threshold",
    price_attr: str = "mid",
    direction_fn: Optional[Callable[[object], str]] = None,
    min_bucket_pct: float = 0.05,
    min_threshold: Optional[float] = None,
    max_threshold: Optional[float] = None,
) -> tuple[list[str], list[float], Optional[float]]:
    """Build (labels, probs_pct, expected_value) tuple for ui.charts.make_distribution.

    Args:
        contracts: iterable of contract objects, all for the same release_month
        threshold_attr: attribute name carrying the threshold value (e.g., 2.5 = 2.5%)
        price_attr: attribute name carrying the YES price / mid in [0,1]
        direction_fn: callable returning "above" or "below" per contract. If
            None, "above" is assumed (i.e., mid = P(CPI > threshold)).
        min_bucket_pct: minimum bucket probability (in %) to keep. Tiny buckets
            from rounding noise are dropped.
        min_threshold: drop contracts with threshold below this value. Use to
            exclude non-YoY (e.g., MoM) markets that share the same event tag
            and would otherwise pollute the distribution.
        max_threshold: drop contracts with threshold above this value. Use to
            exclude bracket-style or index-level contracts whose "threshold"
            number is on a different scale than CPI YoY percent.

    Returns:
        (labels, probs, expected_value):
            - labels: bucket labels for make_distribution
            - probs: per-bucket probabilities in percent (sum ~100)
            - expected_value: probability-weighted bucket midpoint (CPI YoY %),
              suitable as the EV vline on the distribution chart. None if no
              buckets survive.
        Empty lists + None if there are not enough usable contracts.
    """
    pairs: list[tuple[float, float]] = []
    for c in contracts:
        threshold = getattr(c, threshold_attr, None)
        price = getattr(c, price_attr, None)
        if threshold is None or price is None:
            continue
        try:
            t = float(threshold)
            p = float(price)
        except (TypeError, ValueError):
            continue
        # Range filter: drop thresholds outside the expected CPI YoY band.
        # This excludes MoM markets, bracket contracts, index-level questions,
        # and other macro markets that share the same event tag but report
        # numbers on a different scale.
        if min_threshold is not None and t < min_threshold:
            continue
        if max_threshold is not None and t > max_threshold:
            continue
        if direction_fn is not None:
            direction = direction_fn(c) or "above"
            if direction.lower() == "below":
                p = 1.0 - p
        # Clip to [0, 1]
        p = max(0.0, min(1.0, p))
        pairs.append((t, p))

    if not pairs:
        return [], [], None

    # If we only have one threshold, we cannot build a distribution
    # (no interior buckets). Skip.
    grouped: dict[float, list[float]] = defaultdict(list)
    for t, p in pairs:
        grouped[t].append(p)
    pairs = sorted((t, sum(ps) / len(ps)) for t, ps in grouped.items())
    if len(pairs) < 2:
        return [], [], None

    # Enforce monotone non-increasing P(>t) as t increases. Quotes are noisy;
    # a running minimum is the simplest defensive normalization.
    cleaned: list[tuple[float, float]] = []
    running = 1.0
    for t, p in pairs:
        p = min(p, running)
        cleaned.append((t, p))
        running = p
    pairs = cleaned

    labels: list[str] = []
    probs: list[float] = []
    midpoints: list[float] = []

    t_min, p_first = pairs[0]
    p_below_min = max(0.0, 1.0 - p_first) * 100.0
    if p_below_min >= min_bucket_pct:
        labels.append(f"<{t_min:.1f}%")
        probs.append(p_below_min)
        # Tail midpoint: half-step below the minimum threshold
        midpoints.append(t_min - 0.25)

    for i in range(len(pairs) - 1):
        t_lo, p_lo = pairs[i]
        t_hi, p_hi = pairs[i + 1]
        bucket = max(0.0, p_lo - p_hi) * 100.0
        if bucket >= min_bucket_pct:
            labels.append(f"{t_lo:.1f}-{t_hi:.1f}%")
            probs.append(bucket)
            midpoints.append((t_lo + t_hi) / 2.0)

    t_max, p_last = pairs[-1]
    p_above_max = max(0.0, p_last) * 100.0
    if p_above_max >= min_bucket_pct:
        labels.append(f">{t_max:.1f}%")
        probs.append(p_above_max)
        midpoints.append(t_max + 0.25)

    if not probs:
        return [], [], None

    total = sum(probs)
    if total <= 0:
        return [], [], None
    probs = [round(p * 100.0 / total, 2) for p in probs]
    expected_value = sum(m * p for m, p in zip(midpoints, probs)) / 100.0
    return labels, probs, round(expected_value, 4)


def parse_bucket_edges(label: str) -> tuple[float, float]:
    """Convert a build_threshold_distribution bucket label back into numeric
    (lo, hi) edges. Shared between the Streamlit chart code and the Redesign
    React data-layer (forecastex_data, polymarket_data) so the edge
    convention is defined once.

      "<X%"      → (X - 0.5, X)        (lower-tail half-step)
      ">X%"      → (X, X + 0.5)        (upper-tail half-step)
      "A-B%"     → (min(A,B), max(A,B))
      anything   → (v, v + 0.1) using the first number found
    """
    import re
    s = (label or "").strip().replace("%", "")
    if s.startswith("<"):
        m = re.search(r"-?\d+(?:\.\d+)?", s[1:])
        hi = float(m.group(0)) if m else 0.0
        return (hi - 0.5, hi)
    if s.startswith(">"):
        m = re.search(r"-?\d+(?:\.\d+)?", s[1:])
        lo = float(m.group(0)) if m else 0.0
        return (lo, lo + 0.5)
    m = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$", s)
    if m:
        a, b = float(m.group(1)), float(m.group(2))
        return (min(a, b), max(a, b))
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    v = float(m.group(0)) if m else 0.0
    return (v, v + 0.1)
