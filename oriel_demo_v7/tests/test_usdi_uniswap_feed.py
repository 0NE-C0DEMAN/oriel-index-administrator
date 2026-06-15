
from datetime import datetime, timedelta, timezone

import pytest

from analytics.bls_medical_basis_fv import BLSMedicalBasisFVEngine, CPIIndexObservation
from venues.uniswap.usdi_feed import (
    UniswapUsdiSnapshot,
    UsdiCpiProxySignal,
    UsdiFeedConfigurationError,
    build_usdi_cpi_proxy_signal,
    fetch_live_usdi_snapshot,
    normalize_usdi_snapshot,
)


VALUATION_TIME = datetime(2026, 6, 15, tzinfo=timezone.utc)


def _snapshot(**overrides) -> UniswapUsdiSnapshot:
    values = {
        "usdi_price": 1.002,
        "spot_price": 1.002,
        "twap_price": 1.0018,
        "pool_liquidity_usd": 10_000_000.0,
        "volume_24h_usd": 2_000_000.0,
        "price_impact_bps": 8.0,
        "last_trade_timestamp": VALUATION_TIME - timedelta(minutes=15),
        "chain": "mock-chain",
        "pool_address": "mock-pool",
        "usdi_token_address": "mock-usdi",
        "data_source": "deterministic-test",
    }
    values.update(overrides)
    return UniswapUsdiSnapshot(**values)


def _observations() -> list[CPIIndexObservation]:
    rows = []
    headline = 260.0
    medical = 500.0
    for index in range(26):
        year = 2024 + (index // 12)
        month = index % 12 + 1
        headline *= 1.002
        medical *= 1.0025
        rows.append(CPIIndexObservation(f"{year:04d}-{month:02d}", headline, medical))
    return rows


def test_builds_snapshot_from_deterministic_mocked_data():
    snapshot = normalize_usdi_snapshot({
        "usdi_price": "1.002",
        "spot_price": 1.002,
        "twap_price": 1.0018,
        "pool_liquidity_usd": 10_000_000,
        "volume_24h_usd": 2_000_000,
        "price_impact_bps": 8,
        "last_trade_timestamp": "2026-06-14T23:45:00Z",
        "chain": "mock-chain",
        "data_source": "fixture",
    })
    assert snapshot.usdi_price == pytest.approx(1.002)
    assert snapshot.last_trade_timestamp.tzinfo is not None
    assert snapshot.data_source == "fixture"


def test_rejects_missing_usdi_price():
    signal = build_usdi_cpi_proxy_signal(_snapshot(usdi_price=None), VALUATION_TIME)
    assert signal.included_as_cpi_signal is False
    assert "missing or invalid USDi price" in signal.exclusion_reason


def test_rejects_stale_data():
    signal = build_usdi_cpi_proxy_signal(
        _snapshot(last_trade_timestamp=VALUATION_TIME - timedelta(hours=25)),
        VALUATION_TIME,
    )
    assert signal.included_as_cpi_signal is False
    assert "stale data" in signal.exclusion_reason


def test_rejects_low_liquidity_data():
    signal = build_usdi_cpi_proxy_signal(
        _snapshot(pool_liquidity_usd=50_000.0),
        VALUATION_TIME,
    )
    assert signal.included_as_cpi_signal is False
    assert signal.liquidity_score == 0.0


def test_rejects_excessive_price_impact():
    signal = build_usdi_cpi_proxy_signal(
        _snapshot(price_impact_bps=150.0),
        VALUATION_TIME,
    )
    assert signal.included_as_cpi_signal is False
    assert "excessive price impact" in signal.exclusion_reason


def test_scores_liquidity_freshness_and_microstructure():
    signal = build_usdi_cpi_proxy_signal(_snapshot(), VALUATION_TIME)
    assert signal.liquidity_score == pytest.approx(1.0)
    assert 0.9 < signal.freshness_score <= 1.0
    assert signal.microstructure_score > 0.8
    assert signal.confidence_score > 0.8


def test_usdi_only_does_not_produce_medical_basis_adjustment():
    signal = build_usdi_cpi_proxy_signal(_snapshot(), VALUATION_TIME)
    assert signal.signal_scope == "oriel_cpi"
    assert signal.medical_basis_adjustment_bps is None
    assert signal.carefi_medical_basis_eligible is False

    engine = BLSMedicalBasisFVEngine()
    result = engine.evaluate(_observations(), valuation_time=VALUATION_TIME)
    assert result.proxy_alignment_adjustment_bps == 0.0
    assert result.final_fv_basis_bps == pytest.approx(result.model_fv_basis_bps)


def test_produces_cpi_proxy_diagnostic_payload():
    signal = build_usdi_cpi_proxy_signal(_snapshot(), VALUATION_TIME)
    payload = signal.to_payload()
    assert isinstance(signal, UsdiCpiProxySignal)
    assert payload["signal_name"] == "USDi CPI Proxy Signal"
    assert payload["signal_description"] == "Inflation-linked token market signal"
    assert payload["included_as_cpi_signal"] is True
    assert payload["usdi_price_deviation_bps"] == pytest.approx(20.0)


def test_missing_live_config_returns_clear_error_without_provider_call():
    calls = []

    def provider(config):
        calls.append(config)
        return _snapshot()

    with pytest.raises(UsdiFeedConfigurationError, match="USDI_CHAIN"):
        fetch_live_usdi_snapshot(provider=provider, environ={})
    assert calls == []


def test_configured_provider_is_injected_and_no_network_is_required():
    env = {
        "USDI_CHAIN": "mock-chain",
        "USDI_TOKEN_ADDRESS": "mock-token",
        "USDI_UNISWAP_POOL_ADDRESS": "mock-pool",
        "USDI_UNISWAP_VERSION": "v3",
        "USDI_DATA_PROVIDER": "mock-provider",
        "USDI_TWAP_WINDOW_SECONDS": "1800",
    }

    def provider(config):
        assert config.twap_window_seconds == 1800
        return _snapshot(data_source=config.data_provider)

    snapshot = fetch_live_usdi_snapshot(provider=provider, environ=env)
    assert snapshot.data_source == "mock-provider"

