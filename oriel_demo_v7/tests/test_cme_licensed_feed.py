from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from venues.cme import (  # noqa: E402
    CMEClient,
    CMEConfig,
    CMEContract,
    CMELicensedFeedError,
    midpoint,
    normalize_cme_contract,
    parse_month,
    parse_number,
    parse_probability,
    parse_threshold,
    score_and_package,
)


def test_threshold_parsing_from_text_and_numeric_field():
    assert parse_threshold("CPI-U YoY above 3.25%") == 3.25
    assert parse_threshold(2.75) == 2.75


def test_month_parsing_accepts_common_cme_shapes():
    assert parse_month("2026-06").isoformat() == "2026-06-01"
    assert parse_month("Sep 2026").isoformat() == "2026-09-01"
    assert parse_month("2026DEC").isoformat() == "2026-12-01"


def test_numeric_parsing_for_price_volume_and_oi():
    assert parse_probability("47") == 0.47
    assert parse_probability("0.51") == 0.51
    assert parse_number("1,250") == 1250.0
    assert parse_number("6,400 contracts") == 6400.0


def test_midpoint_fallback_uses_bid_ask_then_last():
    assert midpoint(0.47, 0.53, 0.52) == 0.5
    assert midpoint(0.53, 0.47, 0.52) == 0.52


def test_fixture_and_live_fallback_behavior():
    client = CMEClient(CMEConfig())
    contracts, status = client.fetch_contracts()
    assert status == "FIXTURE"
    assert len(contracts) == 3

    fallback_client = CMEClient(CMEConfig(fixture_mode=False, endpoint_url="", api_key=""))
    fallback_contracts, fallback_status = fallback_client.fetch_contracts()
    assert fallback_status == "FALLBACK"
    assert len(fallback_contracts) == 3


def test_live_mode_can_disable_fixture_fallback():
    client = CMEClient(
        CMEConfig(
            fixture_mode=False,
            allow_fixture_fallback=False,
            endpoint_url="",
            api_key="",
        )
    )
    try:
        client.fetch_contracts()
    except CMELicensedFeedError as exc:
        assert "not configured" in str(exc)
    else:
        raise AssertionError("Expected missing live configuration to raise without fixture fallback")


def test_cme_contract_normalization_uses_threshold_event_shape():
    contract = normalize_cme_contract(
        {
            "instrument_id": "CME-LIVE-JAN27-ABOVE-300",
            "product": "CPI-JAN27",
            "description": "January 2027 CPI-U YoY will be above 3.00%",
            "period": "2027-01",
            "best_bid": "45",
            "best_ask": "55",
            "volume_traded": "1,500",
            "oi": "7,250",
            "quote_time": "2026-05-18T15:00:00Z",
            "settlement": "BLS CPI-U initial release",
        }
    )
    assert isinstance(contract, CMEContract)
    assert contract.contract_id == "CME-LIVE-JAN27-ABOVE-300"
    assert contract.product_code == "CPI-JAN27"
    assert contract.release_month.isoformat() == "2027-01-01"
    assert contract.threshold == 3.0
    assert contract.direction == "above"
    assert contract.mid == 0.5
    assert contract.volume == 1500
    assert contract.open_interest == 7250
    assert contract.settlement_source == "BLS CPI-U initial release"


def test_score_and_package_builds_maturity_sorted_curve_points():
    contracts, status = CMEClient(CMEConfig()).fetch_contracts()
    package = score_and_package(contracts, status, CMEConfig())
    assert package.source_status == "FIXTURE"
    assert package.fixture_mode is True
    assert package.publishable is True
    assert [point.release_month.isoformat() for point in package.points] == [
        "2026-06-01",
        "2026-09-01",
        "2026-12-01",
    ]
    assert package.points[0].probability == 0.5
    assert package.points[0].threshold == 3.0


def test_publishability_gates_filter_low_volume_contracts():
    # Volume gate is checked first inside is_publishable(), so when all three
    # gates are tightened simultaneously, every fixture contract trips the
    # volume gate before the OI or liquidity gate even runs.  This is the
    # correct first-failure semantics, not a bug.
    contracts, status = CMEClient(CMEConfig()).fetch_contracts()
    package = score_and_package(
        contracts,
        status,
        CMEConfig(min_volume=2000, min_open_interest=10000, min_liquidity_score=0.9),
    )
    assert package.publishable is False
    assert package.points == []
    assert {contract.publishability_reason for contract in package.contracts} == {"low volume"}


def test_publishability_gates_filter_low_liquidity_score_contracts():
    # With volume and OI gates relaxed so all three fixture contracts pass
    # them, only the liquidity_score gate decides.  Only the Dec26 contract
    # (volume 720, OI 3900 -> liquidity_score 0.75) falls below 0.80; the
    # other two are publishable.
    contracts, status = CMEClient(CMEConfig()).fetch_contracts()
    package = score_and_package(
        contracts,
        status,
        CMEConfig(min_volume=500, min_open_interest=1000, min_liquidity_score=0.80),
    )
    reasons_by_id = {contract.contract_id: contract.publishability_reason for contract in package.contracts}
    assert reasons_by_id["CME-CPI-DEC26-BELOW-275"] == "low liquidity score"
    assert reasons_by_id["CME-CPI-JUN26-ABOVE-300"] == "eligible"
    assert reasons_by_id["CME-CPI-SEP26-ABOVE-325"] == "eligible"
    assert package.publishable is True  # 2 distinct release months pass


def test_no_eligible_contract_package_is_non_crashing_and_non_publishable():
    bad_contract = normalize_cme_contract(
        {
            "contract_id": "CME-CPI-JUN26-MISSING-PRICE",
            "product_code": "CPI-JUN26",
            "event_description": "June 2026 CPI-U YoY will be above 3.00%",
            "reference_month": "2026-06",
            "volume": 10,
            "open_interest": 10,
        }
    )
    package = score_and_package([bad_contract], "LIVE", CMEConfig())
    assert package.publishable is False
    assert package.points == []
    assert package.publishability_reason == "No eligible CME CPI threshold contracts were found."
    assert package.contracts[0].publishability_reason == "missing probability"
