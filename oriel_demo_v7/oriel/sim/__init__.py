"""Minimal oriel.sim package marker for Redesign.

Redesign only needs the risk-regime adjustment types out of this package
(consumed by the Execution Workbench summary builder). The rest of the
v7 simulator (event windows, inventory, quote ladder, etc.) is not used
by the React app, so we keep this package surface intentionally narrow —
re-exporting just the risk-side names that risk_posture.py imports.
"""
from .risk import (
    NEUTRAL_RISK_ADJUSTMENT,
    RiskRegimeAdjustment,
    risk_adjustment_from_summary,
)

__all__ = [
    "NEUTRAL_RISK_ADJUSTMENT",
    "RiskRegimeAdjustment",
    "risk_adjustment_from_summary",
]
