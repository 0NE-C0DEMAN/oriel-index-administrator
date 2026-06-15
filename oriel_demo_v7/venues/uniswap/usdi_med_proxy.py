
"""USDi / USDi-Med Uniswap proxy signal adapter.

Uniswap prices are raw market signals, not fair value. The official BLS Medical
Care CPI vs headline CPI relationship remains the settlement anchor and primary
input to Oriel's calibrated FV engine. This adapter only converts a sufficiently
fresh, liquid, and internally consistent USDi / USDi-Med pool snapshot into the
optional proxy signal contract introduced by the BLS Medical CPI Basis FV
engine.

No token or pool addresses are embedded here. Deterministic snapshots can be
used today; live wiring remains disabled until USDi-Med pool details and data
provider choices are finalized.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math

from analytics.bls_medical_basis_fv import OptionalBasisSignal


MIN_POOL_LIQUIDITY_USD = 250_000.0
FULL_POOL_LIQUIDITY_USD = 5_000_000.0
MIN_VOLUME_24H_USD = 25_000.0
FULL_VOLUME_24H_USD = 1_000_000.0
MAX_AGE_HOURS = 24.0
MAX_TWAP_SPOT_DIVERGENCE_BPS = 100.0
MAX_PRICE_IMPACT_BPS = 100.0
MAX_PROXY_SIGNAL_WEIGHT = 0.15


@dataclass(frozen=True)
class UniswapUsdiMedSnapshot:
    """Normalized spot, TWAP, and pool-quality inputs for the proxy."""

    usdi_price: float | None
    usdi_med_price: float | None
    usdi_med_usdi_ratio: float | None
    pool_liquidity_usd: float | None
    volume_24h_usd: float | None
    twap_ratio: float | None
    spot_ratio: float | None
    price_impact_bps: float | None
    last_trade_timestamp: datetime | None
    chain: str | None = None
    pool_address: str | None = None
    usdi_token_address: str | None = None
    usdi_med_token_address: str | None = None
    data_source: str = "mock"


@dataclass(frozen=True)
class UniswapUsdiMedQuality:
    """Quality scores and exclusion reasons for a normalized snapshot."""

    eligible: bool
    liquidity_score: float
    volume_score: float
    freshness_score: float
    twap_spot_score: float
    price_impact_score: float
    market_depth_score: float
    overall_confidence: float
    age_hours: float | None
    twap_spot_divergence_bps: float | None
    exclusion_reasons: tuple[str, ...]


def score_liquidity(pool_liquidity_usd: float | None) -> float:
    """Score pool liquidity from 0 to 1 using transparent linear thresholds."""
    return _bounded_score(pool_liquidity_usd, MIN_POOL_LIQUIDITY_USD, FULL_POOL_LIQUIDITY_USD)


def score_volume(volume_24h_usd: float | None) -> float:
    """Score trailing 24-hour volume from 0 to 1."""
    return _bounded_score(volume_24h_usd, MIN_VOLUME_24H_USD, FULL_VOLUME_24H_USD)


def score_freshness(last_trade_timestamp: datetime | None, valuation_time: datetime) -> tuple[float, float | None]:
    """Return freshness score and non-negative trade age in hours."""
    if last_trade_timestamp is None:
        return 0.0, None
    valuation = _as_utc(valuation_time)
    last_trade = _as_utc(last_trade_timestamp)
    age_hours = max(0.0, (valuation - last_trade).total_seconds() / 3600.0)
    score = max(0.0, 1.0 - age_hours / MAX_AGE_HOURS)
    return score, age_hours


def score_twap_spot_divergence(twap_ratio: float | None, spot_ratio: float | None) -> tuple[float, float | None]:
    """Score TWAP/spot agreement and return absolute divergence in bps."""
    if not _positive(twap_ratio) or not _positive(spot_ratio):
        return 0.0, None
    divergence_bps = abs(float(spot_ratio) / float(twap_ratio) - 1.0) * 10_000.0
    score = max(0.0, 1.0 - divergence_bps / MAX_TWAP_SPOT_DIVERGENCE_BPS)
    return score, divergence_bps


def score_price_impact(price_impact_bps: float | None) -> float:
    """Score quoted price impact, with 100 bps treated as unusable."""
    if price_impact_bps is None or not math.isfinite(float(price_impact_bps)):
        return 0.0
    impact = max(0.0, float(price_impact_bps))
    return max(0.0, 1.0 - impact / MAX_PRICE_IMPACT_BPS)


def score_overall_confidence(
    *,
    liquidity_score: float,
    volume_score: float,
    freshness_score: float,
    twap_spot_score: float,
    price_impact_score: float,
) -> float:
    """Combine market-quality dimensions into a 0-1 confidence score."""
    return _clip01(
        0.30 * liquidity_score
        + 0.20 * volume_score
        + 0.20 * freshness_score
        + 0.15 * twap_spot_score
        + 0.15 * price_impact_score
    )


def evaluate_usdi_med_snapshot(
    snapshot: UniswapUsdiMedSnapshot,
    valuation_time: datetime,
) -> UniswapUsdiMedQuality:
    """Apply deterministic hard gates and compute component quality scores."""
    liquidity = score_liquidity(snapshot.pool_liquidity_usd)
    volume = score_volume(snapshot.volume_24h_usd)
    freshness, age_hours = score_freshness(snapshot.last_trade_timestamp, valuation_time)
    twap_spot, divergence_bps = score_twap_spot_divergence(snapshot.twap_ratio, snapshot.spot_ratio)
    price_impact = score_price_impact(snapshot.price_impact_bps)
    market_depth = 0.65 * liquidity + 0.35 * volume
    confidence = score_overall_confidence(
        liquidity_score=liquidity,
        volume_score=volume,
        freshness_score=freshness,
        twap_spot_score=twap_spot,
        price_impact_score=price_impact,
    )

    reasons: list[str] = []
    if not _positive(snapshot.usdi_price):
        reasons.append("missing or invalid USDi price")
    if not _positive(snapshot.usdi_med_price):
        reasons.append("missing or invalid USDi-Med price")
    if not _positive(snapshot.usdi_med_usdi_ratio):
        reasons.append("missing or invalid USDi-Med / USDi ratio")
    if snapshot.pool_liquidity_usd is None or snapshot.pool_liquidity_usd < MIN_POOL_LIQUIDITY_USD:
        reasons.append("insufficient pool liquidity")
    if snapshot.volume_24h_usd is None or snapshot.volume_24h_usd < MIN_VOLUME_24H_USD:
        reasons.append("insufficient 24h volume")
    if age_hours is None or age_hours > MAX_AGE_HOURS:
        reasons.append("stale or missing last trade")
    if divergence_bps is None or divergence_bps > MAX_TWAP_SPOT_DIVERGENCE_BPS:
        reasons.append("excessive or missing TWAP/spot divergence")
    if snapshot.price_impact_bps is None or snapshot.price_impact_bps > MAX_PRICE_IMPACT_BPS:
        reasons.append("excessive or missing price impact")

    return UniswapUsdiMedQuality(
        eligible=not reasons,
        liquidity_score=liquidity,
        volume_score=volume,
        freshness_score=freshness,
        twap_spot_score=twap_spot,
        price_impact_score=price_impact,
        market_depth_score=_clip01(market_depth),
        overall_confidence=confidence,
        age_hours=age_hours,
        twap_spot_divergence_bps=divergence_bps,
        exclusion_reasons=tuple(reasons),
    )


def build_usdi_med_proxy_signal(
    snapshot: UniswapUsdiMedSnapshot,
    model_fv_basis_bps: float,
    valuation_time: datetime,
) -> OptionalBasisSignal | None:
    """Build a quality-gated signal compatible with the Oriel FV engine.

    The deterministic transformation is intentionally simple:

        usdi_implied_basis_bps = (USDi-Med / USDi ratio - 1) * 10,000

    It expresses raw proxy alignment only. The supplied model FV is used to
    reduce weight for extreme gaps; it does not convert the market signal into
    fair value. The FV engine retains its own independent gate and adjustment
    cap after receiving this signal.
    """
    quality = evaluate_usdi_med_snapshot(snapshot, valuation_time)
    if not quality.eligible:
        return None

    implied_basis_bps = (float(snapshot.usdi_med_usdi_ratio) - 1.0) * 10_000.0
    alignment_gap_bps = abs(implied_basis_bps - float(model_fv_basis_bps))
    gap_penalty = max(0.25, 1.0 - alignment_gap_bps / 1_000.0)
    signal_weight = min(
        MAX_PROXY_SIGNAL_WEIGHT,
        MAX_PROXY_SIGNAL_WEIGHT * quality.overall_confidence * gap_penalty,
    )
    return OptionalBasisSignal(
        implied_basis_bps=implied_basis_bps,
        as_of=_as_utc(snapshot.last_trade_timestamp),
        liquidity_score=quality.market_depth_score,
        quality_score=quality.overall_confidence,
        signal_weight=signal_weight,
        label="Uniswap USDi / USDi-Med Proxy Alignment",
    )


def fetch_live_uniswap_snapshot(
    *,
    chain: str | None = None,
    usdi_token_address: str | None = None,
    usdi_med_token_address: str | None = None,
    pool_address: str | None = None,
    uniswap_version: str | None = None,
    rpc_endpoint: str | None = None,
    subgraph_url: str | None = None,
    data_provider: str | None = None,
    twap_window_seconds: int | None = None,
) -> UniswapUsdiMedSnapshot:
    """Placeholder for future live Uniswap ingestion.

    TODO: choose the chain, token and pool addresses, Uniswap version, an RPC
    endpoint/subgraph/data provider, and the preferred TWAP window after the
    USDi-Med pool is listed and finalized. No network call is made today.
    """
    raise NotImplementedError(
        "Live USDi / USDi-Med Uniswap fetching requires finalized chain, token "
        "addresses, pool address, Uniswap version, data provider, and TWAP window."
    )


def _bounded_score(value: float | None, minimum: float, full_score: float) -> float:
    if value is None or not math.isfinite(float(value)) or float(value) <= minimum:
        return 0.0
    return _clip01((float(value) - minimum) / (full_score - minimum))


def _positive(value: float | None) -> bool:
    return value is not None and math.isfinite(float(value)) and float(value) > 0.0


def _clip01(value: float) -> float:
    return min(1.0, max(0.0, float(value)))


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

