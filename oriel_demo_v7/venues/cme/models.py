from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional


@dataclass
class CMEContract:
    venue: str
    contract_id: str
    product_code: str
    event_description: str
    release_month: date
    reference_month: date
    threshold: Optional[float]
    side: str
    direction: str
    bid: Optional[float]
    ask: Optional[float]
    last: Optional[float]
    mid: Optional[float]
    volume: int
    open_interest: int
    quote_timestamp: Optional[datetime]
    source_timestamp: Optional[datetime]
    settlement_source: Optional[str]
    valuation_timestamp: datetime
    expected_value: Optional[float] = None
    liquidity_score: float = 0.0
    publishable: bool = False
    publishability_reason: str = "unscored"
    source_status: str = "UNSPECIFIED"
    normalization_method: str = "cme_threshold_event_probability"
    methodology_note: str = ""
    raw: dict = field(default_factory=dict)


@dataclass
class CurvePoint:
    label: str
    release_month: date
    reference_month: date
    threshold: float
    direction: str
    probability: float
    volume: int
    open_interest: int
    liquidity_score: float
    contract_id: str
    publishable: bool


@dataclass
class CurvePackage:
    valuation_timestamp: datetime
    points: list[CurvePoint]
    source_status: str
    publishable: bool
    publishability_reason: str
    venue: str = "CME"
    methodology: str = "v0.1.0-cme-licensed-feed-scaffold"
    fixture_mode: bool = False
    contracts: list[CMEContract] = field(default_factory=list)
