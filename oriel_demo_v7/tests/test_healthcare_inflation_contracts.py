from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from analytics.healthcare_inflation_contracts import build_dec_2027_contract_ladder, evaluate_thresholds


def test_default_dec_2027_ladder_and_thresholds():
    df = build_dec_2027_contract_ladder()
    assert len(df) == 4
    assert set(df["threshold_bp"]) == {0, 50, 100, 200}
    assert (df["measurement_end_month"] == "2027-12").all()
    assert (df["immediate_pilot_venue"] == "Manifold").all()
    assert (df["later_formal_listing_relevance"] == "ForecastEx").all()


def test_yes_no_evaluation_and_role_separation_text():
    out = evaluate_thresholds(110.0)
    yes_by_threshold = dict(zip(out["threshold_bp"], out["resolves_yes"]))
    assert yes_by_threshold[0] is True
    assert yes_by_threshold[50] is True
    assert yes_by_threshold[100] is True
    assert yes_by_threshold[200] is False
