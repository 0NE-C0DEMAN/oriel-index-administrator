
"""Manual smoke test for the configured USDi Uniswap feed."""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

# Allow `python scripts/smoke_usdi_uniswap_feed.py` to run directly by putting
# the repository root on sys.path, so a partner can get JSON diagnostics without
# setting PYTHONPATH first.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from venues.uniswap.usdi_feed import (
    UsdiFeedConfigurationError,
    build_usdi_cpi_proxy_signal,
    fetch_live_usdi_snapshot,
)


def main() -> int:
    """Print JSON diagnostics or a helpful, clean configuration message."""
    try:
        snapshot = fetch_live_usdi_snapshot()
    except (UsdiFeedConfigurationError, NotImplementedError) as exc:
        print(json.dumps({
            "status": "not_configured",
            "signal": "USDi CPI Proxy Signal",
            "message": str(exc),
        }, indent=2))
        return 0
    signal = build_usdi_cpi_proxy_signal(snapshot, datetime.now(timezone.utc))
    print(signal.to_json())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

