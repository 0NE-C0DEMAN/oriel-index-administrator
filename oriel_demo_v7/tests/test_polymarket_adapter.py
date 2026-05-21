from datetime import datetime, timedelta, timezone

from venues.polymarket.client import PolymarketClient
from venues.polymarket.config import DEFAULT_CONFIG
from venues.polymarket.models import PolymarketContract
from venues.polymarket.transform import normalize_expected_value, publishability_reason, summarize_venue_eligibility

UTC = timezone.utc


def _contract(release_month="Mar 2026", spread=0.02, last_updated=None):
    return PolymarketContract(
        venue='Polymarket',
        market_id=f'{release_month}-id',
        slug='march-2026-cpi-above-2-8',
        question=f'Will {release_month} inflation be above 2.8%?',
        release_month=release_month,
        resolution_time=None,
        threshold=2.8,
        outcome='YES',
        outcome_price=0.52,
        bid=0.52 - spread / 2,
        ask=0.52 + spread / 2,
        last=0.52,
        mid=0.52,
        spread=spread,
        volume=500,
        open_interest=1000,
        liquidity_score=0.5,
        confidence_score=75.0,
        settlement_source='BLS CPI release',
        valuation_timestamp=datetime.now(UTC),
        expected_value=2.81,
        last_updated=last_updated or datetime.now(UTC),
        has_valid_quote=True,
        has_depth=True,
        depth_usd=1000,
        quote_age_seconds=30,
        is_stale=False,
    )


def test_extract_release_month_and_direction():
    assert PolymarketClient._extract_release_month('Will March 2026 inflation be above 2.8%?') == 'Mar 2026'
    fallback = datetime(2026, 4, 15, tzinfo=UTC)
    assert PolymarketClient._extract_release_month('Will inflation in April?', fallback_dt=fallback) == 'Apr 2026'
    assert PolymarketClient.extract_threshold_direction('Will March 2026 inflation be below 2.8%?') == 'below'
    assert PolymarketClient.extract_threshold_direction('Will March 2026 inflation be above 2.8%?') == 'above'


def test_normalize_expected_value_handles_below_markets():
    contract = _contract()
    contract.question = 'Will March 2026 inflation be below 2.8%?'
    contract.outcome_price = 0.70
    contract.bid = 0.69
    contract.ask = 0.71
    contract.mid = 0.70
    assert normalize_expected_value(contract) == 2.7


def test_publishability_reason_flags_diagnostic_only_for_wide_but_renderable_spread():
    contract = _contract(spread=0.02)
    assert publishability_reason(contract, DEFAULT_CONFIG) == 'diagnostic only'


def test_publishability_reason_catches_extreme_spread():
    contract = _contract(spread=0.60)
    assert publishability_reason(contract, DEFAULT_CONFIG) == 'wide spread'


def test_summarize_venue_eligibility_partial_when_renderable_but_not_publishable():
    contracts = [_contract('Apr 2026', spread=0.02), _contract('Dec 2026', spread=0.02)]
    summary = summarize_venue_eligibility(contracts, DEFAULT_CONFIG)
    assert summary.venue_status == 'partial'
    assert summary.reference_status == 'not_eligible'
    assert summary.publishable is False


def test_summarize_venue_eligibility_insufficient_when_only_one_maturity():
    summary = summarize_venue_eligibility([_contract('Apr 2026', spread=0.02)], DEFAULT_CONFIG)
    assert summary.venue_status == 'insufficient'
    assert summary.publishable is False


def test_stale_quote_fails_render_and_publish():
    contract = _contract(last_updated=datetime.now(UTC) - timedelta(hours=40))
    contract.quote_age_seconds = 2000
    contract.is_stale = True
    assert publishability_reason(contract, DEFAULT_CONFIG) == 'stale quote'


# ---------------------------------------------------------------------------
# Pagination — the gamma API caps a single /markets response at ~100 rows
# regardless of `limit`. Without paging via `offset`, US CPI threshold
# contracts past position 100 in the Macro Indicators tag (e.g. the entire
# May 2026 monthly + annual ladder) are silently dropped. These tests pin
# the pagination invariants so the client always offsets through every page
# until the API returns short.
# ---------------------------------------------------------------------------
def test_fetch_markets_paginates_via_offset_and_stops_on_short_page(monkeypatch):
    from venues.polymarket.client import PolymarketClient
    from venues.polymarket.config import PolymarketConfig

    captured: list[dict] = []

    def fake_get(url, params=None, timeout=None):
        captured.append(dict(params or {}))
        offset = int((params or {}).get("offset", 0))
        # Per scan: page 0 -> 100 markets, page 1 -> 100, page 2 -> 50 (short, stops loop)
        page_index = offset // 100
        if page_index == 0:
            markets = [{"slug": f"m-{offset+i}", "id": offset + i} for i in range(100)]
        elif page_index == 1:
            markets = [{"slug": f"m-{offset+i}", "id": offset + i} for i in range(100)]
        elif page_index == 2:
            markets = [{"slug": f"m-{offset+i}", "id": offset + i} for i in range(50)]
        else:
            markets = []

        class _Resp:
            status_code = 200
            def raise_for_status(self):
                return None
            def json(self):
                return {"data": markets}

        return _Resp()

    cfg = PolymarketConfig()
    client = PolymarketClient(cfg)
    monkeypatch.setattr(client.session, "get", fake_get)

    markets = client._fetch_markets()

    # Two scans (Macro Indicators tag + general), each walking pages 0,1,2 until short.
    # Distinct slugs per scan (offsets differ), so total = 250 + 250 = 500 deduped slugs.
    # Actually both scans use the SAME offsets so slugs collide -> 250 deduped.
    assert len(markets) == 250

    # Verify offset progression was followed
    offsets_used = sorted({c.get("offset", 0) for c in captured})
    assert offsets_used == [0, 100, 200]

    # Verify the two scans (with vs without tag_id) both ran
    scan_kinds = {c.get("tag_id") for c in captured}
    assert scan_kinds == {cfg.macro_indicators_tag_id, None}


def test_fetch_markets_stops_paginating_when_first_page_is_short(monkeypatch):
    """If the first page is already short (fewer than page_size markets),
    we must not call the API again for that scan."""
    from venues.polymarket.client import PolymarketClient
    from venues.polymarket.config import PolymarketConfig

    call_count = {"n": 0}

    def fake_get(url, params=None, timeout=None):
        call_count["n"] += 1
        # Return a short page on the very first call
        markets = [{"slug": f"m-{i}", "id": i} for i in range(7)]

        class _Resp:
            status_code = 200
            def raise_for_status(self):
                return None
            def json(self):
                return {"data": markets}

        return _Resp()

    client = PolymarketClient(PolymarketConfig())
    monkeypatch.setattr(client.session, "get", fake_get)

    markets = client._fetch_markets()

    # Two scans, each stops after the first short page -> 2 total HTTP calls
    assert call_count["n"] == 2
    # 7 unique slugs (second scan dedups against the first)
    assert len(markets) == 7
