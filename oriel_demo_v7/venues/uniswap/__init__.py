"""Uniswap-derived optional signal adapters."""

from .usdi_feed import (
    UniswapUsdiConfig,
    UniswapUsdiSnapshot,
    UsdiCpiProxySignal,
    UsdiFeedConfigurationError,
    build_usdi_cpi_proxy_signal,
    fetch_live_usdi_snapshot,
    normalize_usdi_snapshot,
)
from .usdi_med_proxy import (
    UniswapUsdiMedQuality,
    UniswapUsdiMedSnapshot,
    build_usdi_med_proxy_signal,
    evaluate_usdi_med_snapshot,
    fetch_live_uniswap_snapshot,
)

__all__ = [
    "UniswapUsdiConfig",
    "UniswapUsdiSnapshot",
    "UsdiCpiProxySignal",
    "UsdiFeedConfigurationError",
    "build_usdi_cpi_proxy_signal",
    "fetch_live_usdi_snapshot",
    "normalize_usdi_snapshot",
    "UniswapUsdiMedQuality",
    "UniswapUsdiMedSnapshot",
    "build_usdi_med_proxy_signal",
    "evaluate_usdi_med_snapshot",
    "fetch_live_uniswap_snapshot",
]
