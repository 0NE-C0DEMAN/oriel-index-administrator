from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


DEFAULT_FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "cpi_feed_sample.json"
DEFAULT_PROXY_FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "cpi_proxy_sample.csv"


def _env_bool(name: str, default: str) -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class CMEConfig:
    source_mode: str = field(default_factory=lambda: os.getenv("CME_CPI_FEED_MODE", "").strip().lower())
    endpoint_url: str = field(default_factory=lambda: os.getenv("CME_CPI_FEED_URL", ""))
    api_key: str = field(default_factory=lambda: os.getenv("CME_CPI_FEED_API_KEY", ""))
    proxy_url: str = field(default_factory=lambda: os.getenv("CME_CPI_PROXY_URL", ""))
    request_timeout_seconds: float = field(
        default_factory=lambda: float(os.getenv("CME_CPI_FEED_TIMEOUT_SECONDS", "20"))
    )
    fixture_mode: bool = field(default_factory=lambda: _env_bool("CME_CPI_FEED_FIXTURE_MODE", "true"))
    allow_fixture_fallback: bool = field(
        default_factory=lambda: _env_bool("CME_CPI_FEED_ALLOW_FIXTURE_FALLBACK", "true")
    )
    fixture_path: Path = field(
        default_factory=lambda: Path(os.getenv("CME_CPI_FEED_FIXTURE_PATH", str(DEFAULT_FIXTURE_PATH)))
    )
    proxy_fixture_path: Path = field(
        default_factory=lambda: Path(os.getenv("CME_CPI_PROXY_FIXTURE_PATH", str(DEFAULT_PROXY_FIXTURE_PATH)))
    )
    allow_proxy_fixture_fallback: bool = field(
        default_factory=lambda: _env_bool("CME_CPI_PROXY_ALLOW_FIXTURE_FALLBACK", "true")
    )
    proxy_yoy_shift_pct: float = field(default_factory=lambda: float(os.getenv("CME_CPI_PROXY_YOY_SHIFT_PCT", "2.5")))
    threshold_probability_scale_pct: float = field(
        default_factory=lambda: float(os.getenv("CME_CPI_THRESHOLD_PROBABILITY_SCALE_PCT", "1.0"))
    )
    max_curve_points: int = field(default_factory=lambda: int(os.getenv("CME_CPI_FEED_MAX_CURVE_POINTS", "6")))
    min_volume: int = field(default_factory=lambda: int(os.getenv("CME_CPI_FEED_MIN_VOLUME", "1")))
    min_open_interest: int = field(default_factory=lambda: int(os.getenv("CME_CPI_FEED_MIN_OPEN_INTEREST", "1")))
    min_liquidity_score: float = field(
        default_factory=lambda: float(os.getenv("CME_CPI_FEED_MIN_LIQUIDITY_SCORE", "0.01"))
    )
    min_publishable_maturities: int = field(
        default_factory=lambda: int(os.getenv("CME_CPI_FEED_MIN_PUBLISHABLE_MATURITIES", "2"))
    )


DEFAULT_CONFIG = CMEConfig()
