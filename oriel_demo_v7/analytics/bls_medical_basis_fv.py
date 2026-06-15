
"""Continuous fair value for the official BLS medical-vs-headline CPI basis.

The official BLS print is the settlement anchor. Oriel provides the continuous
fair-value spread between official prints. ForecastEx is an additive signal
enhancement, not a dependency. USDi / USDi-Med is an optional proxy-alignment
input, not the public reference. This is part of Oriel's healthcare module.

The public product is "BLS Medical CPI vs headline CPI." Methodology and
settlement references use BLS Medical Care CPI-U and CPI-U All Items. All
spread values and adjustments are expressed in basis points.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
import json
import math
from typing import Iterable, Mapping, Sequence


INDEX_NAME = "ORIEL_BLS_MEDICAL_CPI_BASIS_FV"
DISPLAY_NAME = "BLS Medical CPI vs Headline CPI FV Spread"
REFERENCE = "BLS Medical Care CPI YoY minus CPI-U All Items YoY"
METHODOLOGY_VERSION = "0.1.0"
HEADLINE_CPI_SERIES_ID = "CUUR0000SA0"
MEDICAL_CPI_SERIES_ID = "CUUR0000SAM"
BLS_API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"


@dataclass(frozen=True)
class CPIIndexObservation:
    """Paired official monthly CPI-U index levels."""

    month: date | datetime | str
    headline_cpi_index: float
    medical_cpi_index: float


@dataclass(frozen=True)
class BasisHistoryPoint:
    """Realized YoY spread calculated from paired official index levels."""

    month: date
    headline_cpi_yoy_pct: float
    medical_cpi_yoy_pct: float
    basis_bps: float


@dataclass(frozen=True)
class OptionalBasisSignal:
    """Optional market or proxy-implied basis input.

    Scores use a 0-1 scale. ``signal_weight`` controls how much of the gap
    between the signal and model FV can enter the final mark after gating.
    """

    implied_basis_bps: float
    as_of: datetime
    liquidity_score: float
    quality_score: float
    signal_weight: float
    label: str = "optional_signal"


@dataclass(frozen=True)
class SignalDiagnostics:
    """Quality-gate result for an optional signal."""

    label: str
    supplied: bool
    qualified: bool
    age_hours: float | None
    liquidity_score: float | None
    quality_score: float | None
    requested_weight: float
    effective_weight: float
    implied_basis_bps: float | None
    alignment_gap_bps: float | None
    adjustment_bps: float
    gate_reasons: tuple[str, ...]


@dataclass(frozen=True)
class BLSMedicalBasisFVResult:
    """Stable calculation result with partner/oracle-ready export methods."""

    valuation_time: datetime
    last_official_print_month: str
    target_observation_month: str
    official_headline_cpi_yoy_pct: float
    official_medical_cpi_yoy_pct: float
    realized_basis_bps: float
    prior_basis_bps: float
    momentum_3m_bps: float
    momentum_6m_bps: float
    momentum_12m_bps: float
    seasonality_estimate_bps: float
    long_run_mean_basis_bps: float
    mean_reversion_adjustment_bps: float
    model_fv_basis_bps: float
    forecastex_adjustment_bps: float
    proxy_alignment_adjustment_bps: float
    final_fv_basis_bps: float
    confidence_score: int
    publishability: str
    fv_curve_bps: Mapping[str, float]
    forecastex_diagnostics: SignalDiagnostics
    proxy_diagnostics: SignalDiagnostics
    source_weight_diagnostics: Mapping[str, object]
    methodology_version: str = METHODOLOGY_VERSION

    def to_payload(self) -> dict[str, object]:
        """Return a stable JSON-ready payload for partners and oracles."""
        payload: dict[str, object] = {
            "index": INDEX_NAME,
            "display_name": DISPLAY_NAME,
            "reference": REFERENCE,
            "valuation_time": _iso_z(self.valuation_time),
            "last_official_print_month": self.last_official_print_month,
            "target_observation_month": self.target_observation_month,
            "official_headline_cpi_yoy_pct": _round(self.official_headline_cpi_yoy_pct),
            "official_medical_cpi_yoy_pct": _round(self.official_medical_cpi_yoy_pct),
            "realized_basis_bps": _round(self.realized_basis_bps),
            "prior_basis_bps": _round(self.prior_basis_bps),
            "momentum_3m_bps": _round(self.momentum_3m_bps),
            "momentum_6m_bps": _round(self.momentum_6m_bps),
            "momentum_12m_bps": _round(self.momentum_12m_bps),
            "seasonality_estimate_bps": _round(self.seasonality_estimate_bps),
            "long_run_mean_basis_bps": _round(self.long_run_mean_basis_bps),
            "mean_reversion_adjustment_bps": _round(self.mean_reversion_adjustment_bps),
            "model_fv_basis_bps": _round(self.model_fv_basis_bps),
            "forecastex_adjustment_bps": _round(self.forecastex_adjustment_bps),
            "proxy_alignment_adjustment_bps": _round(self.proxy_alignment_adjustment_bps),
            "final_fv_basis_bps": _round(self.final_fv_basis_bps),
            "confidence_score": int(self.confidence_score),
            "publishability": self.publishability,
            "fv_curve_bps": {key: _round(value) for key, value in self.fv_curve_bps.items()},
            "forecastex_signal_diagnostics": _diagnostics_payload(self.forecastex_diagnostics),
            "proxy_alignment_diagnostics": _diagnostics_payload(self.proxy_diagnostics),
            "source_weight_diagnostics": dict(self.source_weight_diagnostics),
            "methodology_version": self.methodology_version,
        }
        # Promote the requested proxy fields for simple downstream consumers.
        payload.update({
            "usdi_implied_basis_bps": self.proxy_diagnostics.implied_basis_bps,
            "proxy_liquidity_score": self.proxy_diagnostics.liquidity_score,
            "proxy_alignment_gap_bps": self.proxy_diagnostics.alignment_gap_bps,
            "proxy_adjustment_bps": _round(self.proxy_diagnostics.adjustment_bps),
            "proxy_signal_weight": _round(self.proxy_diagnostics.effective_weight, 4),
        })
        return payload

    def to_json(self, *, indent: int | None = 2) -> str:
        """Serialize the stable export payload as JSON."""
        return json.dumps(self.to_payload(), indent=indent, sort_keys=True)


def calculate_yoy_pct(current_index: float, year_ago_index: float) -> float:
    """Calculate year-over-year percent change from CPI index levels."""
    current = float(current_index)
    prior = float(year_ago_index)
    if current <= 0 or prior <= 0:
        raise ValueError("CPI index levels must be positive")
    return (current / prior - 1.0) * 100.0


def calculate_realized_basis_bps(medical_yoy_pct: float, headline_yoy_pct: float) -> float:
    """Calculate BLS Medical Care CPI YoY minus headline CPI YoY in bps."""
    return (float(medical_yoy_pct) - float(headline_yoy_pct)) * 100.0


def build_basis_history(observations: Iterable[CPIIndexObservation | Mapping[str, object]]) -> list[BasisHistoryPoint]:
    """Convert paired monthly CPI index levels into realized YoY basis history."""
    normalized = [_normalize_observation(item) for item in observations]
    normalized.sort(key=lambda item: item.month)
    if len({item.month for item in normalized}) != len(normalized):
        raise ValueError("CPI observations must have unique months")

    by_month = {item.month: item for item in normalized}
    history: list[BasisHistoryPoint] = []
    for item in normalized:
        prior = by_month.get(_add_months(item.month, -12))
        if prior is None:
            continue
        headline_yoy = calculate_yoy_pct(item.headline_cpi_index, prior.headline_cpi_index)
        medical_yoy = calculate_yoy_pct(item.medical_cpi_index, prior.medical_cpi_index)
        history.append(BasisHistoryPoint(
            month=item.month,
            headline_cpi_yoy_pct=headline_yoy,
            medical_cpi_yoy_pct=medical_yoy,
            basis_bps=calculate_realized_basis_bps(medical_yoy, headline_yoy),
        ))
    if len(history) < 2:
        raise ValueError(
            "At least two year-over-year basis points "
            "(roughly 14 monthly observations) are required"
        )
    return history


def calculate_basis_momentum(history: Sequence[BasisHistoryPoint], months: int) -> float:
    """Return the change in realized basis over the requested monthly lookback.

    The lookback is resolved by calendar month rather than list position, so a
    series with a missing month still measures a true N-month change; when the
    exact prior month is unavailable the momentum is reported as 0.0 instead of
    silently spanning the wrong horizon.
    """
    if months <= 0:
        raise ValueError("months must be positive")
    if len(history) <= months:
        return 0.0
    latest = history[-1]
    by_month = {point.month: point for point in history}
    prior = by_month.get(_add_months(latest.month, -months))
    if prior is None:
        return 0.0
    return float(latest.basis_bps - prior.basis_bps)


def calculate_seasonality_estimate(history: Sequence[BasisHistoryPoint], target_month: date | str) -> float:
    """Estimate the typical one-month basis change into the target calendar month.

    Each contribution is the change from the immediately preceding calendar
    month into a target-month observation, resolved by month (not list
    position) so gaps in the series cannot corrupt the estimate.
    """
    target = _parse_month(target_month)
    by_month = {point.month: point for point in history}
    changes = [
        point.basis_bps - by_month[prior_month].basis_bps
        for point in history
        if point.month.month == target.month
        and (prior_month := _add_months(point.month, -1)) in by_month
    ]
    return float(sum(changes) / len(changes)) if changes else 0.0


def calculate_mean_reversion_adjustment(realized_basis_bps: float, long_run_mean_basis_bps: float, strength: float = 0.25) -> float:
    """Pull the next mark a controlled fraction toward the long-run mean."""
    if not 0.0 <= strength <= 1.0:
        raise ValueError("mean-reversion strength must be between 0 and 1")
    return (float(long_run_mean_basis_bps) - float(realized_basis_bps)) * float(strength)


class BLSMedicalBasisFVEngine:
    """Deterministic official-print FV engine with optional gated signals."""

    def __init__(
        self,
        *,
        momentum_weight: float = 0.35,
        mean_reversion_strength: float = 0.25,
        max_signal_age_hours: float = 24.0,
        min_forecastex_liquidity: float = 0.50,
        min_forecastex_quality: float = 0.60,
        min_proxy_liquidity: float = 0.60,
        min_proxy_quality: float = 0.60,
        max_forecastex_adjustment_bps: float = 50.0,
        max_proxy_adjustment_bps: float = 25.0,
    ) -> None:
        self.momentum_weight = float(momentum_weight)
        self.mean_reversion_strength = float(mean_reversion_strength)
        self.max_signal_age_hours = float(max_signal_age_hours)
        self.min_forecastex_liquidity = float(min_forecastex_liquidity)
        self.min_forecastex_quality = float(min_forecastex_quality)
        self.min_proxy_liquidity = float(min_proxy_liquidity)
        self.min_proxy_quality = float(min_proxy_quality)
        self.max_forecastex_adjustment_bps = float(max_forecastex_adjustment_bps)
        self.max_proxy_adjustment_bps = float(max_proxy_adjustment_bps)

    def evaluate(
        self,
        observations: Iterable[CPIIndexObservation | Mapping[str, object]],
        *,
        valuation_time: datetime,
        target_observation_month: date | str | None = None,
        forecastex_signal: OptionalBasisSignal | None = None,
        proxy_signal: OptionalBasisSignal | None = None,
    ) -> BLSMedicalBasisFVResult:
        """Calculate the continuous FV basis and all publication diagnostics."""
        valuation = _as_utc(valuation_time)
        history = build_basis_history(observations)
        latest = history[-1]
        target = _parse_month(target_observation_month) if target_observation_month else _add_months(latest.month, 1)

        momentum_3m = calculate_basis_momentum(history, 3)
        momentum_6m = calculate_basis_momentum(history, 6)
        momentum_12m = calculate_basis_momentum(history, 12)
        blended_momentum = 0.50 * momentum_3m + 0.30 * momentum_6m + 0.20 * momentum_12m
        seasonality = calculate_seasonality_estimate(history, target)
        long_run_mean = sum(point.basis_bps for point in history) / len(history)
        mean_reversion = calculate_mean_reversion_adjustment(
            latest.basis_bps, long_run_mean, self.mean_reversion_strength
        )
        model_fv = latest.basis_bps + self.momentum_weight * blended_momentum + seasonality + mean_reversion

        forecastex_diag = self._gate_signal(
            forecastex_signal,
            model_fv_basis_bps=model_fv,
            valuation_time=valuation,
            min_liquidity=self.min_forecastex_liquidity,
            min_quality=self.min_forecastex_quality,
            max_adjustment_bps=self.max_forecastex_adjustment_bps,
            default_label="ForecastEx Signal Enhancement",
        )
        proxy_diag = self._gate_signal(
            proxy_signal,
            model_fv_basis_bps=model_fv,
            valuation_time=valuation,
            min_liquidity=self.min_proxy_liquidity,
            min_quality=self.min_proxy_quality,
            max_adjustment_bps=self.max_proxy_adjustment_bps,
            default_label="USDi / USDi-Med Proxy Alignment",
        )
        final_fv = model_fv + forecastex_diag.adjustment_bps + proxy_diag.adjustment_bps
        confidence = _confidence_score(history, latest.month, valuation.date(), target)
        publishability = "Eligible" if confidence >= 80 else "Review" if confidence >= 60 else "Draft"
        release_lag_months = _month_distance(latest.month, valuation.date())
        curve = _build_fv_curve(final_fv, long_run_mean)

        source_weights = {
            "official_bls_settlement_anchor": 1.0,
            "model_momentum_coefficient": _round(self.momentum_weight, 4),
            "model_mean_reversion_strength": _round(self.mean_reversion_strength, 4),
            "forecastex_signal_weight": _round(forecastex_diag.effective_weight, 4),
            "proxy_signal_weight": _round(proxy_diag.effective_weight, 4),
            "forecastex_qualified": forecastex_diag.qualified,
            "proxy_qualified": proxy_diag.qualified,
            "official_release_lag_months": release_lag_months,
        }
        return BLSMedicalBasisFVResult(
            valuation_time=valuation,
            last_official_print_month=latest.month.strftime("%Y-%m"),
            target_observation_month=target.strftime("%Y-%m"),
            official_headline_cpi_yoy_pct=latest.headline_cpi_yoy_pct,
            official_medical_cpi_yoy_pct=latest.medical_cpi_yoy_pct,
            realized_basis_bps=latest.basis_bps,
            prior_basis_bps=history[-2].basis_bps,
            momentum_3m_bps=momentum_3m,
            momentum_6m_bps=momentum_6m,
            momentum_12m_bps=momentum_12m,
            seasonality_estimate_bps=seasonality,
            long_run_mean_basis_bps=long_run_mean,
            mean_reversion_adjustment_bps=mean_reversion,
            model_fv_basis_bps=model_fv,
            forecastex_adjustment_bps=forecastex_diag.adjustment_bps,
            proxy_alignment_adjustment_bps=proxy_diag.adjustment_bps,
            final_fv_basis_bps=final_fv,
            confidence_score=confidence,
            publishability=publishability,
            fv_curve_bps=curve,
            forecastex_diagnostics=forecastex_diag,
            proxy_diagnostics=proxy_diag,
            source_weight_diagnostics=source_weights,
        )

    def _gate_signal(
        self,
        signal: OptionalBasisSignal | None,
        *,
        model_fv_basis_bps: float,
        valuation_time: datetime,
        min_liquidity: float,
        min_quality: float,
        max_adjustment_bps: float,
        default_label: str,
    ) -> SignalDiagnostics:
        if signal is None:
            return SignalDiagnostics(
                label=default_label, supplied=False, qualified=False, age_hours=None,
                liquidity_score=None, quality_score=None, requested_weight=0.0,
                effective_weight=0.0, implied_basis_bps=None, alignment_gap_bps=None,
                adjustment_bps=0.0, gate_reasons=("not supplied",),
            )

        as_of = _as_utc(signal.as_of)
        age_hours = max(0.0, (valuation_time - as_of).total_seconds() / 3600.0)
        reasons: list[str] = []
        if age_hours > self.max_signal_age_hours:
            reasons.append("stale")
        if signal.liquidity_score < min_liquidity:
            reasons.append("insufficient liquidity")
        if signal.quality_score < min_quality:
            reasons.append("insufficient quality")
        if not 0.0 < signal.signal_weight <= 1.0:
            reasons.append("invalid signal weight")

        qualified = not reasons
        effective_weight = float(signal.signal_weight) if qualified else 0.0
        gap = float(signal.implied_basis_bps) - float(model_fv_basis_bps)
        raw_adjustment = gap * effective_weight
        adjustment = max(-max_adjustment_bps, min(max_adjustment_bps, raw_adjustment))
        return SignalDiagnostics(
            label=signal.label or default_label,
            supplied=True,
            qualified=qualified,
            age_hours=age_hours,
            liquidity_score=float(signal.liquidity_score),
            quality_score=float(signal.quality_score),
            requested_weight=float(signal.signal_weight),
            effective_weight=effective_weight,
            implied_basis_bps=float(signal.implied_basis_bps),
            alignment_gap_bps=gap,
            adjustment_bps=adjustment if qualified else 0.0,
            gate_reasons=tuple(reasons) if reasons else ("qualified",),
        )


def fetch_official_bls_observations(
    *,
    start_year: int | None = None,
    end_year: int | None = None,
    timeout_seconds: float = 20.0,
) -> list[CPIIndexObservation]:
    """Fetch paired CPI-U All Items and Medical Care CPI-U monthly levels.

    This loader is an optional convenience for the UI. The calculation engine
    does not require network access and accepts deterministic observations.
    """
    import requests

    current_year = datetime.now(timezone.utc).year
    end = int(end_year or current_year)
    start = int(start_year or end - 10)
    response = requests.post(
        BLS_API_URL,
        json={
            "seriesid": [HEADLINE_CPI_SERIES_ID, MEDICAL_CPI_SERIES_ID],
            "startyear": str(start),
            "endyear": str(end),
            "registrationkey": "",
        },
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    raw = response.json()
    if raw.get("status") != "REQUEST_SUCCEEDED":
        raise ValueError("BLS request did not succeed")

    levels: dict[str, dict[date, float]] = {HEADLINE_CPI_SERIES_ID: {}, MEDICAL_CPI_SERIES_ID: {}}
    for series in raw.get("Results", {}).get("series", []):
        series_id = series.get("seriesID") or series.get("seriesId")
        if series_id not in levels:
            continue
        for observation in series.get("data", []):
            period = observation.get("period")
            if not isinstance(period, str) or not period.startswith("M") or period == "M13":
                continue
            try:
                month = date(int(observation["year"]), int(period[1:]), 1)
                level = float(observation["value"])
            except (KeyError, TypeError, ValueError):
                continue
            levels[series_id][month] = level

    common_months = sorted(set(levels[HEADLINE_CPI_SERIES_ID]) & set(levels[MEDICAL_CPI_SERIES_ID]))
    if len(common_months) < 14:
        raise ValueError("BLS returned insufficient paired CPI history")
    return [
        CPIIndexObservation(
            month=month,
            headline_cpi_index=levels[HEADLINE_CPI_SERIES_ID][month],
            medical_cpi_index=levels[MEDICAL_CPI_SERIES_ID][month],
        )
        for month in common_months
    ]


def _normalize_observation(item: CPIIndexObservation | Mapping[str, object]) -> CPIIndexObservation:
    if isinstance(item, CPIIndexObservation):
        return CPIIndexObservation(
            month=_parse_month(item.month),
            headline_cpi_index=float(item.headline_cpi_index),
            medical_cpi_index=float(item.medical_cpi_index),
        )
    return CPIIndexObservation(
        month=_parse_month(item["month"]),
        headline_cpi_index=float(item["headline_cpi_index"]),
        medical_cpi_index=float(item["medical_cpi_index"]),
    )


def _parse_month(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return date(value.year, value.month, 1)
    if isinstance(value, date):
        return date(value.year, value.month, 1)
    text = str(value).strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        parsed = datetime.strptime(text[:7], "%Y-%m")
    return date(parsed.year, parsed.month, 1)


def _add_months(value: date, months: int) -> date:
    month_index = value.year * 12 + value.month - 1 + months
    return date(month_index // 12, month_index % 12 + 1, 1)


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _iso_z(value: datetime) -> str:
    return _as_utc(value).isoformat().replace("+00:00", "Z")


def _round(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def _diagnostics_payload(diagnostics: SignalDiagnostics) -> dict[str, object]:
    payload = asdict(diagnostics)
    payload["gate_reasons"] = list(diagnostics.gate_reasons)
    for key in ("age_hours", "liquidity_score", "quality_score", "requested_weight", "effective_weight", "implied_basis_bps", "alignment_gap_bps", "adjustment_bps"):
        if payload[key] is not None:
            payload[key] = _round(float(payload[key]), 4)
    return payload


def _confidence_score(history: Sequence[BasisHistoryPoint], last_print: date, valuation_date: date, target: date) -> int:
    history_score = min(35.0, len(history) / 36.0 * 35.0)
    release_lag = _month_distance(last_print, valuation_date)
    freshness_score = 25.0 if release_lag <= 1 else 15.0 if release_lag == 2 else 0.0
    seasonal_count = sum(1 for point in history[1:] if point.month.month == target.month)
    seasonality_score = min(15.0, seasonal_count * 5.0)
    momentum_score = min(15.0, max(0, len(history) - 1) / 12.0 * 15.0)
    score = min(100.0, history_score + freshness_score + seasonality_score + momentum_score + 10.0)
    if release_lag > 2:
        score = min(score, 59.0)
    return int(round(score))


def _month_distance(earlier: date, later: date) -> int:
    return max(0, (later.year - earlier.year) * 12 + later.month - earlier.month)


def _build_fv_curve(front_basis_bps: float, long_run_mean_basis_bps: float) -> dict[str, float]:
    """Term structure for the medical-vs-headline basis.

    The front (1M) tenor anchors exactly to the engine's final fair value;
    each longer tenor decays exponentially toward the long-run mean and
    reaches it at the 12M tenor. The exponential weight is normalised over
    the [1M, 12M] span so both endpoints are exact (front == final_fv,
    12M == long_run_mean) and the interior tenors stay smooth and monotonic
    — matching the "front anchored to final FV; converges to the long-run
    mean by the 12M tenor" description shown in the UI.
    """
    tenors = (("1m", 1.0), ("3m", 3.0), ("6m", 6.0), ("12m", 12.0))
    front_months, back_months = 1.0, 12.0
    tau = 6.0  # decay time constant (months)
    span = 1.0 - math.exp(-(back_months - front_months) / tau)
    curve: dict[str, float] = {}
    for label, months in tenors:
        if span <= 0.0:
            fraction = 0.0
        else:
            fraction = (1.0 - math.exp(-(months - front_months) / tau)) / span
        curve[label] = front_basis_bps + (long_run_mean_basis_bps - front_basis_bps) * fraction
    return curve

