"""Forward-risk posture policy for the canonical perp simulator.

The policy translates an ``analytics.forward_risk_engine.ForwardRiskSummary``
into deterministic market-making multipliers.  It is intentionally small and
auditable: the simulator remains pure-library code, while the forward-risk
engine remains the source of truth for the risk score/regime.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class RiskRegimeAdjustment:
    """Simulator-facing posture derived from forward-risk state."""

    risk_score: float | None
    risk_regime: str
    spread_multiplier: float
    inventory_limit_multiplier: float
    edge_hurdle_multiplier: float
    source: str

    @property
    def is_neutral(self) -> bool:
        return self.risk_regime == "Moderate" and self.source == "default"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


NEUTRAL_RISK_ADJUSTMENT = RiskRegimeAdjustment(
    risk_score=None,
    risk_regime="Moderate",
    spread_multiplier=1.0,
    inventory_limit_multiplier=1.0,
    edge_hurdle_multiplier=1.0,
    source="default",
)


def risk_adjustment_from_summary(summary: Any | None) -> RiskRegimeAdjustment:
    """Return deterministic simulator multipliers for a risk summary.

    ``summary`` is typed as ``Any`` so :mod:`oriel.sim` does not need to import
    analytics code at module import time.  The expected object is
    ``ForwardRiskSummary`` or any compatible object exposing ``risk_score`` and
    ``risk_regime``.
    """
    if summary is None:
        return NEUTRAL_RISK_ADJUSTMENT

    regime = str(getattr(summary, "risk_regime", "") or "Moderate").strip().title()
    score = _coerce_score(getattr(summary, "risk_score", None))
    source = str(getattr(summary, "method", "") or "forward_risk_summary")

    if regime == "Low":
        return RiskRegimeAdjustment(
            risk_score=score,
            risk_regime="Low",
            spread_multiplier=0.85,
            inventory_limit_multiplier=1.15,
            edge_hurdle_multiplier=0.85,
            source=source,
        )
    if regime == "Elevated":
        return RiskRegimeAdjustment(
            risk_score=score,
            risk_regime="Elevated",
            spread_multiplier=1.35,
            inventory_limit_multiplier=0.65,
            edge_hurdle_multiplier=1.50,
            source=source,
        )
    return RiskRegimeAdjustment(
        risk_score=score,
        risk_regime="Moderate",
        spread_multiplier=1.0,
        inventory_limit_multiplier=1.0,
        edge_hurdle_multiplier=1.0,
        source=source,
    )


def _coerce_score(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


__all__ = [
    "NEUTRAL_RISK_ADJUSTMENT",
    "RiskRegimeAdjustment",
    "risk_adjustment_from_summary",
]
