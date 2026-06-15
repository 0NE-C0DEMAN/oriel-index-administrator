
"""Oriel-level USDi Uniswap market-signal adapter.

Raw Uniswap prices are observations, not fair value. This module normalizes and
quality-gates USDi market data for Oriel's broader CPI/inflation calibration
framework. It does not create a medical-basis signal. The CareFi healthcare
proxy remains the separate USDi-Med / USDi relative-value adapter.

Live ingestion is isolated behind explicit configuration and a provider
callback. No RPC, subgraph, token, or pool details are hardcoded.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
import json
import math
import os
from typing import Callable, Mapping


MIN_POOL_LIQUIDITY_USD = 250_000.0
FULL_POOL_LIQUIDITY_USD = 5_000_000.0
MIN_VOLUME_24H_USD = 25_000.0
FULL_VOLUME_24H_USD = 1_000_000.0
MAX_AGE_HOURS = 24.0
MAX_PRICE_IMPACT_BPS = 100.0
MAX_TWAP_SPOT_DIVERGENCE_BPS = 100.0
MIN_CONFIDENCE_SCORE = 0.60


class UsdiFeedConfigurationError(ValueError):
    """Raised when required live USDi feed configuration is incomplete."""


@dataclass(frozen=True)
class UniswapUsdiConfig:
    """Explicit live-feed configuration resolved from arguments or environment."""

    chain: str
    usdi_token_address: str
    pool_address: str
    uniswap_version: str
    twap_window_seconds: int
    subgraph_url: str | None = None
    rpc_endpoint: str | None = None
    data_provider: str | None = None


@dataclass(frozen=True)
class UniswapUsdiSnapshot:
    """One normalized USDi market-data observation."""

    usdi_price: float | None
    spot_price: float | None
    twap_price: float | None
    pool_liquidity_usd: float | None
    volume_24h_usd: float | None
    price_impact_bps: float | None
    last_trade_timestamp: datetime | None
    chain: str | None = None
    pool_address: str | None = None
    usdi_token_address: str | None = None
    uniswap_version: str | None = None
    data_source: str = "mock"


@dataclass(frozen=True)
class UsdiCpiProxySignal:
    """Quality-gated Oriel CPI proxy diagnostics.

    This object is intentionally not compatible with the medical-basis engine's
    proxy input. USDi-only observations cannot create a medical-basis adjustment.
    """

    signal_name: str
    signal_scope: str
    signal_description: str
    usdi_price: float | None
    spot_price: float | None
    twap_price: float | None
    usdi_price_deviation_bps: float | None
    pool_liquidity_usd: float | None
    volume_24h_usd: float | None
    price_impact_bps: float | None
    last_trade_timestamp: datetime | None
    chain: str | None
    pool_address: str | None
    usdi_token_address: str | None
    uniswap_version: str | None
    data_source: str
    liquidity_score: float
    freshness_score: float
    microstructure_score: float
    confidence_score: float
    included_as_cpi_signal: bool
    exclusion_reason: str | None
    medical_basis_adjustment_bps: None = None
    carefi_medical_basis_eligible: bool = False

    def to_payload(self) -> dict[str, object]:
        """Return a stable JSON-ready diagnostic payload."""
        payload = asdict(self)
        timestamp = self.last_trade_timestamp
        payload["last_trade_timestamp"] = _iso_z(timestamp) if timestamp else None
        return payload

    def to_json(self, *, indent: int | None = 2) -> str:
        """Serialize diagnostics for smoke tests and downstream adapters."""
        return json.dumps(self.to_payload(), indent=indent, sort_keys=True)


def normalize_usdi_snapshot(
    data: Mapping[str, object], *, uniswap_version: str | None = None
) -> UniswapUsdiSnapshot:
    """Build a normalized snapshot from a provider or deterministic fixture.

    `uniswap_version` falls back to the resolved live config when the provider
    payload does not carry it, so the diagnostic always reports the pool's
    Uniswap version when one is configured.
    """
    return UniswapUsdiSnapshot(
        usdi_price=_optional_float(data.get("usdi_price")),
        spot_price=_optional_float(data.get("spot_price")),
        twap_price=_optional_float(data.get("twap_price")),
        pool_liquidity_usd=_optional_float(data.get("pool_liquidity_usd")),
        volume_24h_usd=_optional_float(data.get("volume_24h_usd")),
        price_impact_bps=_optional_float(data.get("price_impact_bps")),
        last_trade_timestamp=_optional_datetime(data.get("last_trade_timestamp")),
        chain=_optional_text(data.get("chain")),
        pool_address=_optional_text(data.get("pool_address")),
        usdi_token_address=_optional_text(data.get("usdi_token_address")),
        uniswap_version=_optional_text(data.get("uniswap_version")) or uniswap_version,
        data_source=_optional_text(data.get("data_source")) or "provider",
    )


def score_liquidity(pool_liquidity_usd: float | None) -> float:
    """Score pool liquidity from 0 to 1."""
    return _bounded_score(pool_liquidity_usd, MIN_POOL_LIQUIDITY_USD, FULL_POOL_LIQUIDITY_USD)


def score_freshness(
    last_trade_timestamp: datetime | None,
    valuation_time: datetime,
) -> tuple[float, float | None]:
    """Return freshness score and non-negative observation age in hours."""
    if last_trade_timestamp is None:
        return 0.0, None
    age_hours = max(
        0.0,
        (_as_utc(valuation_time) - _as_utc(last_trade_timestamp)).total_seconds() / 3600.0,
    )
    return max(0.0, 1.0 - age_hours / MAX_AGE_HOURS), age_hours


def score_microstructure(
    *,
    spot_price: float | None,
    twap_price: float | None,
    volume_24h_usd: float | None,
    price_impact_bps: float | None,
) -> tuple[float, float | None, float, float]:
    """Score volume, TWAP/spot agreement, and executable price impact."""
    volume_score = _bounded_score(volume_24h_usd, MIN_VOLUME_24H_USD, FULL_VOLUME_24H_USD)
    divergence_bps = _twap_spot_divergence_bps(spot_price, twap_price)
    divergence_score = (
        max(0.0, 1.0 - divergence_bps / MAX_TWAP_SPOT_DIVERGENCE_BPS)
        if divergence_bps is not None
        else 0.0
    )
    impact_score = (
        max(0.0, 1.0 - max(0.0, float(price_impact_bps)) / MAX_PRICE_IMPACT_BPS)
        if _finite(price_impact_bps)
        else 0.0
    )
    score = _clip01(0.35 * volume_score + 0.35 * divergence_score + 0.30 * impact_score)
    return score, divergence_bps, volume_score, impact_score


def build_usdi_cpi_proxy_signal(
    snapshot: UniswapUsdiSnapshot,
    valuation_time: datetime,
) -> UsdiCpiProxySignal:
    """Convert USDi market data into an Oriel CPI proxy diagnostic.

    The price deviation from par is surfaced in basis points as an observed
    market feature. It is not interpreted as CPI fair value and is not routed
    into the BLS Medical CPI Basis FV engine.
    """
    liquidity = score_liquidity(snapshot.pool_liquidity_usd)
    freshness, age_hours = score_freshness(snapshot.last_trade_timestamp, valuation_time)
    microstructure, divergence_bps, volume_score, _ = score_microstructure(
        spot_price=snapshot.spot_price,
        twap_price=snapshot.twap_price,
        volume_24h_usd=snapshot.volume_24h_usd,
        price_impact_bps=snapshot.price_impact_bps,
    )
    confidence = _clip01(0.40 * liquidity + 0.25 * freshness + 0.35 * microstructure)

    reasons: list[str] = []
    if not _positive(snapshot.usdi_price):
        reasons.append("missing or invalid USDi price")
    if not _positive(snapshot.spot_price) or not _positive(snapshot.twap_price):
        reasons.append("missing spot or TWAP price")
    if snapshot.pool_liquidity_usd is None or snapshot.pool_liquidity_usd < MIN_POOL_LIQUIDITY_USD:
        reasons.append("low liquidity")
    if snapshot.volume_24h_usd is None or snapshot.volume_24h_usd < MIN_VOLUME_24H_USD:
        reasons.append("low volume")
    if age_hours is None or age_hours > MAX_AGE_HOURS:
        reasons.append("stale data")
    if snapshot.price_impact_bps is None or snapshot.price_impact_bps > MAX_PRICE_IMPACT_BPS:
        reasons.append("excessive price impact")
    if divergence_bps is None or divergence_bps > MAX_TWAP_SPOT_DIVERGENCE_BPS:
        reasons.append("excessive TWAP/spot divergence")
    if not reasons and confidence < MIN_CONFIDENCE_SCORE:
        reasons.append("confidence below inclusion threshold")

    price_deviation_bps = (
        (float(snapshot.usdi_price) - 1.0) * 10_000.0
        if _positive(snapshot.usdi_price)
        else None
    )
    return UsdiCpiProxySignal(
        signal_name="USDi CPI Proxy Signal",
        signal_scope="oriel_cpi",
        signal_description="Inflation-linked token market signal",
        usdi_price=snapshot.usdi_price,
        spot_price=snapshot.spot_price,
        twap_price=snapshot.twap_price,
        usdi_price_deviation_bps=price_deviation_bps,
        pool_liquidity_usd=snapshot.pool_liquidity_usd,
        volume_24h_usd=snapshot.volume_24h_usd,
        price_impact_bps=snapshot.price_impact_bps,
        last_trade_timestamp=snapshot.last_trade_timestamp,
        chain=snapshot.chain,
        pool_address=snapshot.pool_address,
        usdi_token_address=snapshot.usdi_token_address,
        uniswap_version=snapshot.uniswap_version,
        data_source=snapshot.data_source,
        liquidity_score=liquidity,
        freshness_score=freshness,
        microstructure_score=microstructure,
        confidence_score=confidence,
        included_as_cpi_signal=not reasons,
        exclusion_reason="; ".join(reasons) if reasons else None,
    )


def resolve_usdi_live_config(
    *,
    chain: str | None = None,
    usdi_token_address: str | None = None,
    pool_address: str | None = None,
    uniswap_version: str | None = None,
    subgraph_url: str | None = None,
    rpc_endpoint: str | None = None,
    data_provider: str | None = None,
    twap_window_seconds: int | None = None,
    environ: Mapping[str, str] | None = None,
) -> UniswapUsdiConfig:
    """Resolve required live settings from explicit arguments or environment."""
    env = environ if environ is not None else os.environ
    resolved = {
        "chain": chain or env.get("USDI_CHAIN"),
        "usdi_token_address": usdi_token_address or env.get("USDI_TOKEN_ADDRESS"),
        "pool_address": pool_address or env.get("USDI_UNISWAP_POOL_ADDRESS"),
        "uniswap_version": uniswap_version or env.get("USDI_UNISWAP_VERSION"),
        "subgraph_url": subgraph_url or env.get("UNISWAP_SUBGRAPH_URL"),
        "rpc_endpoint": rpc_endpoint or env.get("WEB3_RPC_URL"),
        "data_provider": data_provider or env.get("USDI_DATA_PROVIDER"),
    }
    raw_window = twap_window_seconds or env.get("USDI_TWAP_WINDOW_SECONDS")
    missing = [
        label
        for label, value in (
            ("USDI_CHAIN", resolved["chain"]),
            ("USDI_TOKEN_ADDRESS", resolved["usdi_token_address"]),
            ("USDI_UNISWAP_POOL_ADDRESS", resolved["pool_address"]),
            ("USDI_UNISWAP_VERSION", resolved["uniswap_version"]),
            ("USDI_TWAP_WINDOW_SECONDS", raw_window),
        )
        if not value
    ]
    if not resolved["subgraph_url"] and not resolved["rpc_endpoint"] and not resolved["data_provider"]:
        missing.append("UNISWAP_SUBGRAPH_URL, WEB3_RPC_URL, or USDI_DATA_PROVIDER")
    if missing:
        raise UsdiFeedConfigurationError(
            "Missing USDi live feed configuration: " + ", ".join(missing)
        )
    try:
        window = int(raw_window)
    except (TypeError, ValueError) as exc:
        raise UsdiFeedConfigurationError("USDI_TWAP_WINDOW_SECONDS must be an integer") from exc
    if window <= 0:
        raise UsdiFeedConfigurationError("USDI_TWAP_WINDOW_SECONDS must be positive")
    return UniswapUsdiConfig(
        chain=str(resolved["chain"]),
        usdi_token_address=str(resolved["usdi_token_address"]),
        pool_address=str(resolved["pool_address"]),
        uniswap_version=str(resolved["uniswap_version"]),
        twap_window_seconds=window,
        subgraph_url=_optional_text(resolved["subgraph_url"]),
        rpc_endpoint=_optional_text(resolved["rpc_endpoint"]),
        data_provider=_optional_text(resolved["data_provider"]),
    )


def fetch_live_usdi_snapshot(
    *,
    provider: Callable[[UniswapUsdiConfig], UniswapUsdiSnapshot | Mapping[str, object]] | None = None,
    environ: Mapping[str, str] | None = None,
    **config_overrides: object,
) -> UniswapUsdiSnapshot:
    """Fetch a configured live snapshot through an injected provider.

    Configuration is validated before any provider call. A production provider
    can use an RPC endpoint, Uniswap subgraph, or compatible market-data API.
    The repository does not choose or call one implicitly.
    """
    config = resolve_usdi_live_config(environ=environ, **config_overrides)
    if provider is None:
        raise NotImplementedError(
            "USDi live configuration is valid, but no Uniswap/RPC/subgraph "
            "provider callback has been configured."
        )
    result = provider(config)
    if isinstance(result, UniswapUsdiSnapshot):
        return result if result.uniswap_version else replace(result, uniswap_version=config.uniswap_version)
    return normalize_usdi_snapshot(result, uniswap_version=config.uniswap_version)


def _bounded_score(value: float | None, minimum: float, full_score: float) -> float:
    if value is None or not math.isfinite(float(value)) or float(value) <= minimum:
        return 0.0
    return _clip01((float(value) - minimum) / (full_score - minimum))


def _twap_spot_divergence_bps(spot: float | None, twap: float | None) -> float | None:
    if not _positive(spot) or not _positive(twap):
        return None
    return abs(float(spot) / float(twap) - 1.0) * 10_000.0


def _optional_float(value: object) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _optional_datetime(value: object) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return _as_utc(value)
    return _as_utc(datetime.fromisoformat(str(value).replace("Z", "+00:00")))


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _positive(value: float | None) -> bool:
    return _finite(value) and float(value) > 0.0


def _finite(value: float | None) -> bool:
    return value is not None and math.isfinite(float(value))


def _clip01(value: float) -> float:
    return min(1.0, max(0.0, float(value)))


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _iso_z(value: datetime) -> str:
    return _as_utc(value).isoformat().replace("+00:00", "Z")

