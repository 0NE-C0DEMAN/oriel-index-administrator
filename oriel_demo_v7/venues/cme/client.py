from __future__ import annotations

import json
import re
import csv
from io import StringIO
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

import requests

from .config import CMEConfig
from .models import CMEContract

UTC = timezone.utc

MONTHS = {
    "JAN": 1,
    "JANUARY": 1,
    "FEB": 2,
    "FEBRUARY": 2,
    "MAR": 3,
    "MARCH": 3,
    "APR": 4,
    "APRIL": 4,
    "MAY": 5,
    "JUN": 6,
    "JUNE": 6,
    "JUL": 7,
    "JULY": 7,
    "AUG": 8,
    "AUGUST": 8,
    "SEP": 9,
    "SEPT": 9,
    "SEPTEMBER": 9,
    "OCT": 10,
    "OCTOBER": 10,
    "NOV": 11,
    "NOVEMBER": 11,
    "DEC": 12,
    "DECEMBER": 12,
}


class CMELicensedFeedError(RuntimeError):
    """Normalized error for CME licensed-feed transport and parsing failures."""


class CMEClient:
    def __init__(self, config: CMEConfig) -> None:
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json", "User-Agent": "oriel-cme-adapter/0.1"})

    def fetch_contracts(self) -> tuple[list[CMEContract], str]:
        valuation_timestamp = datetime.now(UTC)
        if self.config.source_mode == "proxy":
            return self._proxy_contracts(valuation_timestamp)
        if self.config.source_mode == "live":
            try:
                return self._live_contracts(valuation_timestamp), "LIVE"
            except Exception:
                if not self.config.allow_fixture_fallback:
                    raise
                return self._fixture_contracts(valuation_timestamp), "FALLBACK"
        if self.config.source_mode == "fixture":
            return self._fixture_contracts(valuation_timestamp), "FIXTURE"
        if self.config.fixture_mode:
            return self._fixture_contracts(valuation_timestamp), "FIXTURE"
        try:
            return self._live_contracts(valuation_timestamp), "LIVE"
        except Exception:
            if not self.config.allow_fixture_fallback:
                raise
            return self._fixture_contracts(valuation_timestamp), "FALLBACK"

    def _live_contracts(self, valuation_timestamp: datetime) -> list[CMEContract]:
        if not self.config.endpoint_url or not self.config.api_key:
            raise CMELicensedFeedError("CME live feed endpoint/API key not configured")
        headers = {"Authorization": f"Bearer {self.config.api_key}"}
        try:
            response = self.session.get(
                self.config.endpoint_url,
                headers=headers,
                timeout=self.config.request_timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            raise CMELicensedFeedError(f"CME live feed request failed: {exc}") from exc
        except ValueError as exc:
            raise CMELicensedFeedError("CME live feed returned non-JSON payload") from exc
        return normalize_cme_contracts(extract_records(payload), valuation_timestamp=valuation_timestamp)

    def _fixture_contracts(self, valuation_timestamp: datetime) -> list[CMEContract]:
        try:
            payload = json.loads(Path(self.config.fixture_path).read_text(encoding="utf-8"))
        except OSError as exc:
            raise CMELicensedFeedError(f"Unable to read CME fixture: {self.config.fixture_path}") from exc
        return normalize_cme_contracts(extract_records(payload), valuation_timestamp=valuation_timestamp)

    def _proxy_contracts(self, valuation_timestamp: datetime) -> tuple[list[CMEContract], str]:
        """Load interim CME CPI proxy records.

        This is intentionally separate from ``_live_contracts``: proxy mode is
        a demonstrability path, not the final licensed CME feed.  If no
        structured proxy URL is configured, the representative fixture mirrors
        the expected public extraction shape.
        """
        if self.config.proxy_url:
            try:
                records = self._proxy_records_from_url()
                contracts = normalize_cme_contracts(records, valuation_timestamp=valuation_timestamp)
                for contract in contracts:
                    contract.source_status = "PROXY"
                    contract.methodology_note = "Interim CME CPI proxy source; final licensed CME feed pending."
                return contracts, "PROXY"
            except Exception:
                if not self.config.allow_proxy_fixture_fallback:
                    raise
                contracts = self._proxy_fixture_contracts(valuation_timestamp)
                return contracts, "PROXY_FALLBACK"
        contracts = self._proxy_fixture_contracts(valuation_timestamp)
        return contracts, "PROXY"

    def _proxy_records_from_url(self) -> list[Dict[str, Any]]:
        try:
            response = self.session.get(self.config.proxy_url, timeout=self.config.request_timeout_seconds)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise CMELicensedFeedError(f"CME proxy request failed: {exc}") from exc
        return parse_proxy_payload(response.text, content_type=response.headers.get("content-type", ""))

    def _proxy_fixture_contracts(self, valuation_timestamp: datetime) -> list[CMEContract]:
        try:
            text = Path(self.config.proxy_fixture_path).read_text(encoding="utf-8")
        except OSError as exc:
            raise CMELicensedFeedError(f"Unable to read CME proxy fixture: {self.config.proxy_fixture_path}") from exc
        contracts = normalize_cme_contracts(parse_proxy_payload(text, content_type=str(self.config.proxy_fixture_path)), valuation_timestamp=valuation_timestamp)
        for contract in contracts:
            contract.source_status = "PROXY"
            contract.methodology_note = "Fixture-backed interim CME CPI proxy; final licensed CME feed pending."
        return contracts


def extract_records(payload: Any) -> list[Dict[str, Any]]:
    records = payload.get("records") if isinstance(payload, dict) else payload
    if not isinstance(records, list):
        raise CMELicensedFeedError("CME payload must contain a records array")
    return [record for record in records if isinstance(record, dict)]


def parse_proxy_payload(text: str, *, content_type: str = "") -> list[Dict[str, Any]]:
    stripped = text.strip()
    if not stripped:
        return []
    if "json" in content_type.lower() or stripped.startswith(("{", "[")):
        return extract_records(json.loads(stripped))
    reader = csv.DictReader(StringIO(stripped))
    return [dict(row) for row in reader]


def normalize_cme_contracts(
    records: Iterable[Dict[str, Any]],
    *,
    valuation_timestamp: Optional[datetime] = None,
) -> list[CMEContract]:
    ts = valuation_timestamp or datetime.now(UTC)
    return [normalize_cme_contract(record, valuation_timestamp=ts) for record in records]


def normalize_cme_contract(record: Dict[str, Any], *, valuation_timestamp: Optional[datetime] = None) -> CMEContract:
    event_description = str(first_present(record, ["event_description", "event", "description", "title"]) or "")
    product_code = str(first_present(record, ["product_code", "product", "symbol", "ticker"]) or "")
    contract_id = str(first_present(record, ["contract_id", "instrument_id", "id", "ticker"]) or product_code)
    blob = f"{product_code} {event_description}"
    release_month = parse_month(first_present(record, ["release_month", "reference_month", "period", "maturity"]) or blob)
    reference_month = parse_month(first_present(record, ["reference_month", "period", "maturity"]) or release_month)
    bid = parse_probability(first_present(record, ["bid", "best_bid", "yes_bid"]))
    ask = parse_probability(first_present(record, ["ask", "best_ask", "yes_ask"]))
    last = parse_probability(first_present(record, ["last", "last_price", "last_trade", "yes_last"]))
    mid = parse_probability(first_present(record, ["mid", "mark", "settlement_price"]))
    if mid is None:
        mid = midpoint(bid, ask, last)

    return CMEContract(
        venue="CME",
        contract_id=contract_id,
        product_code=product_code,
        event_description=event_description,
        release_month=release_month,
        reference_month=reference_month,
        threshold=parse_threshold(first_present(record, ["threshold", "strike", "strike_price"]) or blob),
        side=str(first_present(record, ["side", "position"]) or "YES").upper(),
        direction=parse_direction(first_present(record, ["direction", "side_direction"]) or blob),
        bid=bid,
        ask=ask,
        last=last,
        mid=mid,
        volume=parse_int(first_present(record, ["volume", "volume_traded", "qty"])) or 0,
        open_interest=parse_int(first_present(record, ["open_interest", "oi"])) or 0,
        quote_timestamp=parse_datetime(first_present(record, ["quote_timestamp", "quote_time"])),
        source_timestamp=parse_datetime(first_present(record, ["source_timestamp", "as_of", "timestamp"])),
        settlement_source=str(first_present(record, ["settlement_source", "settlement"]) or "BLS CPI initial release"),
        valuation_timestamp=valuation_timestamp or datetime.now(UTC),
        raw=record,
    )


def first_present(record: Dict[str, Any], names: list[str]) -> Any:
    for name in names:
        value = record.get(name)
        if value not in (None, ""):
            return value
    return None


def parse_number(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(match.group(0)) if match else None


def parse_int(value: Any) -> Optional[int]:
    number = parse_number(value)
    return int(number) if number is not None else None


def parse_probability(value: Any) -> Optional[float]:
    number = parse_number(value)
    if number is None:
        return None
    if number > 1.0:
        number = number / 100.0
    return max(min(number, 1.0), 0.0)


def midpoint(bid: Optional[float], ask: Optional[float], last: Optional[float] = None) -> Optional[float]:
    if bid is not None and ask is not None and ask >= bid:
        return round((bid + ask) / 2.0, 6)
    return last


def parse_threshold(value: Any) -> Optional[float]:
    if isinstance(value, str):
        percent_match = re.search(r"(-?\d+(?:\.\d+)?)\s*%", value)
        if percent_match:
            return float(percent_match.group(1))
    number = parse_number(value)
    return number


def parse_month(value: Any) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return date(value.year, value.month, 1)
    text = str(value).strip()
    upper = text.upper()
    match = re.search(r"(20\d{2})[-/ ]?(0[1-9]|1[0-2])", upper)
    if match:
        return date(int(match.group(1)), int(match.group(2)), 1)
    match = re.search(r"(0[1-9]|1[0-2])[-/ ]?(20\d{2})", upper)
    if match:
        return date(int(match.group(2)), int(match.group(1)), 1)
    match = re.search(r"(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|SEPT|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[-/ ]*(20\d{2})", upper)
    if match:
        return date(int(match.group(2)), MONTHS[match.group(1)], 1)
    match = re.search(r"(20\d{2})[-/ ]*(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|SEPT|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC)", upper)
    if match:
        return date(int(match.group(1)), MONTHS[match.group(2)], 1)
    raise CMELicensedFeedError(f"Unable to parse CME release/reference month: {value}")


def parse_direction(value: Any) -> str:
    text = str(value or "").lower()
    if any(token in text for token in ("below", "under", "less", "<")):
        return "below"
    return "above"


def parse_datetime(value: Any) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None
