from pathlib import Path
import sys

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from analytics.healthcare_inflation_methodology import (
    build_latest_methodology_snapshot,
    build_healthcare_inflation_reference,
    compute_component_yoy,
    methodology_summary_text,
    load_healthcare_weights,
    validate_weights,
)


def test_weights_sum_to_one():
    weights = load_healthcare_weights()
    assert abs(float(weights["component_weight"].sum()) - 1.0) < 1e-9


def test_malformed_weights_fail():
    with pytest.raises(ValueError):
        validate_weights(pd.DataFrame({"component_name": ["a"], "component_weight": [0.5]}))


def test_component_yoy_and_reference_spread():
    dates = pd.date_range("2026-01-01", periods=13, freq="MS")
    rows = []
    values = {
        "Hospital Services": (100.0, 104.8),
        "Physician Services": (100.0, 104.2),
        "Prescription Drugs": (100.0, 102.9),
    }
    for c, (start, end) in values.items():
        levels = [start] * 12 + [end]
        for d, lvl in zip(dates, levels):
            rows.append({"component_name": c, "date": d, "index_level": lvl})
    yoy = compute_component_yoy(pd.DataFrame(rows))
    weights = load_healthcare_weights()
    result = build_healthcare_inflation_reference(yoy, weights, headline_cpi_yoy_pct=3.1)
    assert round(result.healthcare_inflation_reference_yoy_pct, 2) == 4.12
    assert round(result.healthcare_inflation_spread_bp, 1) == 101.5


def test_methodology_text_clarifies_weights():
    txt = methodology_summary_text()["why_not_single_medical_cpi"].lower()
    assert "not bls relative-importance" in txt
    assert "not intended to reconstruct official bls medical care cpi" in txt


def test_latest_snapshot_fallback(monkeypatch):
    monkeypatch.setattr("analytics.healthcare_inflation_methodology.fetch_headline_cpi_yoy_latest", lambda: (_ for _ in ()).throw(ValueError("down")))
    snapshot, result = build_latest_methodology_snapshot(prefer_live=False)
    assert not snapshot.empty
    assert set(snapshot["component_name"]) == {"Hospital Services", "Physician Services", "Prescription Drugs"}
    assert result.source_status in {"seed", "fallback"}
    assert isinstance(result.headline_cpi_yoy_pct, float)


def test_reference_rejects_mismatched_component_observation_months():
    """Contract-grade methodology hardening: refuse to silently build a
    weighted reference from component YoY values pulled from different
    BLS observation months."""
    weights = load_healthcare_weights()

    # Hospital Services has a March 2026 latest print; Physician Services
    # and Prescription Drugs have April 2026 latest prints — what would
    # happen if BLS partially published a release window.  The reference
    # builder must refuse to blend across months.
    component_yoy_df = pd.DataFrame([
        {"component_name": "Hospital Services",  "date": pd.Timestamp("2026-03-01"), "component_yoy_pct": 6.20},
        {"component_name": "Physician Services", "date": pd.Timestamp("2026-04-01"), "component_yoy_pct": 3.10},
        {"component_name": "Prescription Drugs", "date": pd.Timestamp("2026-04-01"), "component_yoy_pct": 1.40},
    ])

    with pytest.raises(ValueError) as exc_info:
        build_healthcare_inflation_reference(
            component_yoy_df, weights, headline_cpi_yoy_pct=3.1
        )

    msg = str(exc_info.value)
    assert "common observation month" in msg
    assert "Hospital Services" in msg
    assert "2026-03-01" in msg
    assert "2026-04-01" in msg


def test_reference_accepts_aligned_component_observation_months():
    """Sanity check: when all three components share the same observation
    month (the normal BLS publication case), the reference builds cleanly."""
    weights = load_healthcare_weights()
    common_date = pd.Timestamp("2026-04-01")
    component_yoy_df = pd.DataFrame([
        {"component_name": "Hospital Services",  "date": common_date, "component_yoy_pct": 6.07},
        {"component_name": "Physician Services", "date": common_date, "component_yoy_pct": 2.98},
        {"component_name": "Prescription Drugs", "date": common_date, "component_yoy_pct": -0.16},
    ])
    result = build_healthcare_inflation_reference(
        component_yoy_df, weights, headline_cpi_yoy_pct=3.1
    )
    # 0.4 * 6.07 + 0.35 * 2.98 + 0.25 * (-0.16) = 2.428 + 1.043 - 0.040 = 3.431
    assert round(result.healthcare_inflation_reference_yoy_pct, 3) == 3.431
    assert result.observation_month == common_date
