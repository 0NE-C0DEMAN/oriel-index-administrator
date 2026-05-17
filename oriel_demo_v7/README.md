# Oriel Prediction Index Administrator — v27

A production-grade Streamlit dashboard for prediction-market-based CPI forward indices. Live data from Kalshi, ForecastEx, and Polymarket with automatic fallback to sample data. Includes OTC parity validation, DTCC term-structure calibration, a governed-blend CPI Basis layer, a CMS-anchored Healthcare Reference, and a governed Index Administrator view.

**Live demo:** [kalshi-inflation-index-demo-personal.streamlit.app](https://kalshi-inflation-index-demo-personal-2kopxqevr5x2rg6qtxkdmy.streamlit.app/)

---

## Tabs

| Tab | Purpose |
|---|---|
| CareFi Healthcare Trend Index | Healthcare cost trend from scalar bucket prices (sample only) |
| Oriel CPI Forward Index (Kalshi-style) | Live CPI forward curve from Kalshi binary-outcome contracts |
| Oriel CPI Forward Index (ForecastEx-style) | Live CPI forward curve from ForecastEx binary threshold contracts |
| Oriel CPI Forward Index (Polymarket-style) | Live CPI forward curve from Polymarket threshold contracts |
| Oriel CPI Basis | Governed-blend reference layer — spot / FV / carry / basis with venue diagnostics |
| Oriel Healthcare Reference | CMS-anchored healthcare cost translation with trading / hedging / benchmark sub-tabs |
| OTC Parity Validation | Benchmark comparison vs cleaned OTC CPI swap curves + DTCC live term calibration |
| Index Administrator | Governed reference construction, publication controls, audit trail — click the nav link top-left |

---

## Quick Start

```bash
pip install -r requirements.txt
streamlit run app.py
```

Opens at `http://localhost:8501`. Default mode is sample data. Set `KALSHI_ENABLE_LIVE_CPI=true` in `.env` to enable live Kalshi polling.

---

## Live vs Sample Data

| Mode | How to enable | Behavior |
|---|---|---|
| Sample | Omit config or set `KALSHI_ENABLE_LIVE_CPI=false` | Static demo data from `sample_data.py`. Fully offline. |
| Live Kalshi | `KALSHI_ENABLE_LIVE_CPI=true` | Polls Kalshi public REST API (cache TTL from `KALSHI_CACHE_SECONDS`, default 60s) |
| Live ForecastEx | Auto-discovered from `FORECASTEX_DATA_PAGE_URL` | Polls ForecastEx pairs CSV feed; toggle in-tab |
| Live Polymarket | `POLYMARKET_ENABLE_LIVE=true` | Polls Polymarket Gamma API for CPI threshold markets |

Healthcare tab is always sample data. On any live-feed failure the app falls back to sample data and shows a warning banner — it never crashes.

---

## Environment Configuration

Create `.env` beside `app.py`. Do not commit it (see `.gitignore`).

### Kalshi

| Variable | Default | Description |
|---|---|---|
| `KALSHI_ENABLE_LIVE_CPI` | `false` | Enable live feed |
| `KALSHI_CPI_SERIES_TICKER` | `KXCPI` | CPI series ticker |
| `KALSHI_API_BASE_URL` | `elections.kalshi.com` | Primary REST endpoint |
| `KALSHI_API_BASE_URL_FALLBACK` | `trading-api.kalshi.com` | Fallback host |
| `KALSHI_CACHE_SECONDS` | `60` | Cache TTL |
| `KALSHI_MIN_OPEN_INTEREST` | `25` | Contract inclusion threshold |
| `KALSHI_MIN_VOLUME` | `10` | Contract inclusion threshold |
| `KALSHI_MAX_WIDE_SPREAD` | `0.20` | Max bid-ask spread |
| `KALSHI_MAX_MATURITIES` | `6` | Max forward-curve maturities |
| `KALSHI_TIMEOUT_SECONDS` | `20` | Per-request timeout |
| `KALSHI_MAX_RETRIES` | `6` | HTTP retry attempts |

### ForecastEx

| Variable | Default | Description |
|---|---|---|
| `FORECASTEX_DATA_PAGE_URL` | `https://forecastex.com/data` | Data page for CSV auto-discovery |
| `FORECASTEX_INTRADAY_PAIRS_URL` | *(auto)* | Pin a specific pairs CSV URL |
| `FORECASTEX_MIN_VOLUME` | `1` | Contract inclusion threshold |
| `FORECASTEX_MAX_CURVE_POINTS` | `6` | Max forward-curve maturities |
| `FORECASTEX_STALE_AFTER_MINUTES` | `20` | Freshness timeout |

### Polymarket

| Variable | Default | Description |
|---|---|---|
| `POLYMARKET_ENABLE_LIVE` | `false` | Enable live Gamma API |
| `POLYMARKET_MAX_SPREAD_BP` | `35` | Contract inclusion threshold |
| `POLYMARKET_STALE_AFTER_HOURS` | `36` | Freshness timeout |

---

## Deploy to Streamlit Cloud

1. Push to a GitHub repo
2. At [share.streamlit.io](https://share.streamlit.io) → **New app**, point it at `app.py`
3. **App settings → Secrets**, paste the contents of `secrets.toml.example`
4. **Deploy** — no other changes needed

---

## Project Structure

```
oriel_demo_v7/
├── app.py                     # Thin entrypoint — page config, CSS, nav, routing
├── engine.py                  # Core curve engine (PredictionIndexAdmin, isotonic regression)
├── sample_data.py             # Static fallback data
│
├── ui/                        # Shared UI infrastructure
│   ├── tokens.py              # Design tokens (colors, radii, table dims)
│   ├── css.py                 # CSS loader (reads assets/oriel.css, interpolates tokens)
│   ├── plotly_theme.py        # ORIEL_TEMPLATE + PLOTLY_CONFIG
│   ├── tables.py              # _plotly_desk_table + height helpers
│   ├── charts.py              # _layout, make_forward_curve, make_distribution
│   ├── nav.py                 # Top nav bar, logo, badges, Index Administrator link
│   └── components.py          # HC_STEPS, CPI_STEPS methodology definitions
│
├── tabs/                      # One renderer per tab
│   ├── index_tab.py           # Healthcare + Kalshi CPI
│   ├── forecastex_tab.py
│   ├── polymarket_tab.py
│   ├── perp_readiness_tab.py  # CPI Basis
│   ├── cms_tab.py             # Healthcare Reference
│   ├── parity_tab.py          # OTC Parity + Term Calibration
│   └── index_admin_tab.py     # Index Administrator view
│
├── venues/                    # Venue adapters (config / client / models / transform)
│   ├── kalshi/
│   ├── forecastex/
│   └── polymarket/
│
├── analytics/                 # Engine & analysis modules
│   ├── tier1_fv_engine.py           # Governed blend + weighting engine + freshness
│   ├── cpi_basis_diagnostics.py     # Venue diagnostics
│   ├── cms_lag_loader.py            # Healthcare pipeline loader
│   └── dtcc_term_calibration.py     # DTCC tenor calibration loader
│
├── parity/                    # OTC parity pipeline
├── index_admin/               # Index Administrator dataclass models
├── services/                  # Index Administrator service layer
├── assets/                    # oriel.css, oriel_logo.png
├── data/                      # CSVs + pipeline artifacts
├── tests/                     # pytest suite
└── .streamlit/, requirements.txt, runtime.txt, secrets.toml.example, .gitignore
```

Import layering is strict and acyclic: `ui.tokens` → `ui.*` → `tabs.*` → `app.py`. Each tab is independently editable. CSS lives in `assets/oriel.css` and is cached via `@st.cache_resource`.

---

## FalconX Hardening Layer (v24)

Five credibility upgrades to the CPI Basis reference stack, targeting institutional / quant review:

| Layer | Function | What it does |
|---|---|---|
| Smoothing model | `smooth_reference_curve()` | Liquidity-weighted monotone linear + Nelson-Siegel proxy fallback; exposes residuals, RMSE, monotone direction |
| Weight calibration | `compute_weight_calibration_summary()` | Surfaces score share, requested share, effective share per venue with full blend-rule transparency |
| Microstructure filters | `apply_microstructure_filters()` | Deterministic proxy fields (spread gate ≤ 35bp, staleness ≤ 300s, selection waterfall); structured for live-field swap |
| Enhanced publishability | `compute_enhanced_publishability()` | Combines maturity coverage, source availability, weight balance, venue quality, blended freshness → Eligible/Review/Draft |
| Trade playbook | `generate_trade_ideas()` | 3 practical expressions: perp vs FV basis, front-end steepener/flattener, venue-quality RV overlay |

Microstructure proxy fields (`proxy_spread_bp`, `proxy_quote_age_seconds`, `quote_quality_score`, `included_in_curve`, `quote_selection_reason`) are deterministic stand-ins for the demo CSVs — swap for real venue fields when live bid/ask, depth, and timestamps are available.

---

## Volatility & Surface Engine (v25)

Renders at the bottom of the CPI tab. Approximate binary-implied vol from threshold contracts using the parent CPI forward reference.

| Section | What it shows |
|---|---|
| Implied Vol Surface | Binary-implied vol by maturity; falls back to exact-outcome PMF dispersion or curve sigma |
| Venue Dispersion | Cross-venue vol dispersion sourced from `cpi_basis_diagnostics` |
| Forward / Vol Sensitivity | Forward-vs-vol scenario grid |
| Component Vol Framework | Placeholder component-vol from parent CPI vol + beta/correlation assumptions (roadmap item) |

Engine: `analytics/vol_surface_engine.py` (237 lines). Tab renderer: `tabs/vol_surface_tab.py` (188 lines). Demo-safe approximation — not positioned as production options analytics.

---

## Medical CPI Monitor (v26)

Live BLS medical-CPI tracker added to the **CareFi Healthcare Trend Index** tab. Fetches 7 official BLS series via the public v2 time-series API with automatic fallback to a local seed CSV.

| Series | BLS ID |
|---|---|
| Medical care | CUUR0000SAM |
| Medical care services | CUUR0000SAM2 |
| Medical care commodities | CUUR0000SAM1 |
| Physicians' services | CUUR0000SEMC01 |
| Hospital services | CUUR0000SEMD01 |
| Prescription drugs | CUUR0000SEMF01 |
| Health insurance | CUUR0000SEME |

**What renders:**
- Signal-vs-print gap (Oriel front anchor vs latest official medical care Y/Y)
- Three breadth cards: accelerating share, weighted share above 3%, cross-sectional dispersion
- Monthly Medical CPI Tracker desk table (M/M, Y/Y, Prev Y/Y, Weight, BLS Series)
- Breadth methodology panel

Engine: `analytics/medical_cpi_tracker.py`. Seed data: `data/medical_cpi_tracker/medical_cpi_seed.csv`. All series are unadjusted CPI-U U.S. city average.

---

## Brier / Historical Calibration Layer (v27)

Adds forecast-quality scoring to the venue weighting and publishability stack. Prediction-market probabilities still drive the curve, but venue trust now also reflects historical calibration accuracy.

| Component | What it does |
|---|---|
| `analytics/brier_calibration.py` | Loads calibration history, computes per-venue Brier skill, log-loss skill, bias, sample-size scores |
| Venue raw score | Now 25% liquidity + 15% spread + 15% freshness + 15% coverage + 10% consistency + **20% historical calibration** |
| Eligibility gating | New minimum: `historical_calibration_score >= 40` |
| Enhanced publishability | Confidence stack now includes a dedicated 15% calibration component |
| UI (CPI Basis tab) | Weight calibration panel surfaces historical calibration score, weighted Brier, and sample size per venue |

Calibration data: `data/calibration/venue_brier_history_sample.csv` — sample backfill scaffold (12 rows, 2 venues × 2 contract families × 3 horizon buckets). Replace with real realized-outcomes history in production.

---

## Architecture

```
.env / Streamlit Secrets
        │
        ▼
   Venue configs  (Kalshi / ForecastEx / Polymarket)
        │
        ▼
   Venue clients  (REST, retries, fallback to sample)
        │
        ▼
   build_live_*_feed() / score_and_package()     parse → filter → normalize
        │
        ▼
   List[MaturitySnapshot] / CurvePackage         engine-ready inputs
        │
        ▼
   PredictionForwardCurve / Tier1Snapshot        curve engine + FV interpolation
   (engine.py / analytics/tier1_fv_engine.py)
        │
        ▼
   Streamlit UI  (app.py + tabs/*)
```

### Governed Blend (CPI Basis)

```
kalshi_constituents_current.csv      forecastex_constituents_current.csv
          │                                    │
  build_kalshi_curve(...)             build_forecastex_curve(...)
          │                                    │
          └──────────> blend_curves() <────────┘
                       (weighting engine V1: liquidity 30% + spread 20%
                        + freshness 20% + coverage 20% + consistency 10%)
                                │
                      build_tier1_snapshot()
                                │
                   ORIEL 3M CPI FORWARD INDEX strip
                   + Source Blend / Index Governance panel
```

### Index Administrator

Routed via `?view=index_admin` (click the "INDEX ADMINISTRATOR" link in the top nav). Five sub-tabs:

- **Index Definition** — metadata, maturity coverage, publication record
- **Eligibility & Inputs** — observation table with venue filters and eligibility flags
- **Calculation Engine** — curve comparison (market-implied / blended / fair value) + venue weight + publishability bar
- **Publication Controls** — quality-score breakdown, decision thresholds, override status
- **Audit Trail** — run history, fallback hierarchy usage, latest publication record

Data computed from `data/kalshi_constituents_current.csv` + `data/forecastex_constituents_current.csv` + `data/oriel_curve_current.csv` via `services/index_admin.py`. Dataclass models in `index_admin/models.py`.

---

## Data Files

### Constituent & curve inputs
- `kalshi_constituents_current.csv` / `_prior.csv`
- `forecastex_constituents_current.csv` / `_prior.csv`
- `oriel_curve_current.csv` / `_prior.csv` / `_sample.csv`

### OTC parity benchmarks
- `otc_cpi_quotes_tighter_demo.csv` — expected PASS
- `dtcc_cpi_static_demo_2026Q2.csv` — expected PASS (DTCC SDR format)
- `otc_cpi_quotes_negative_control.csv` — expected FAIL (stress case)

### Healthcare Reference pipeline artifacts (`data/cms_lag_engine/`)
- `basis_action_panel.csv` — current basis, percentile, convergence window, lens
- `cms_anchor_timeseries.csv` — yearly public rail / Oriel spot / CMS anchor / basis
- `service_line_signal_panel.csv` — physician / IP-OP RV sleeve gaps
- `historical_benchmark_panel.csv` — year-by-year translated signal vs official anchor
- `provenance_manifest.json` — parsed inputs and pipeline outputs

### DTCC term calibration (`data/dtcc_term_calibration/`)
- `dtcc_cpi_tenor_parity_summary_input.csv` — tenor bucket summary
- `dtcc_cpi_tenor_parity_monthly_summary_input.csv` — month × tenor breakdown
- `dtcc_cpi_tenor_parity_trade_input.csv` — trade-level data
- `oriel_term_parity_template.csv` — template for Option B term-parity build

---

## Index Administrator · Reference Construction

Publication decision thresholds (enforced by the service layer):

| Decision | Publishability score | Action |
|---|---|---|
| Publish | ≥ 0.80 | Full publication |
| Restricted | 0.65 – 0.80 | Diagnostic only |
| Hold | < 0.65 | Withheld |

Publishability score weighting: quality 30% + timestamp integrity 20% + source diversity 20% + fallback penalty 15% + continuity 15%.

---

## OTC Parity Validation

Three scenarios ship with the demo:

| Scenario | Benchmark | Expected |
|---|---|---|
| Reference OTC Benchmark | `otc_cpi_quotes_tighter_demo.csv` | PASS — avg ~4.5 bp |
| DTCC SDR Calibration Sample | `dtcc_cpi_static_demo_2026Q2.csv` | PASS |
| Out-of-Tolerance Stress Case | `otc_cpi_quotes_negative_control.csv` | FAIL |

Gate thresholds: avg abs basis ≤ 10 bp, max abs basis ≤ 10 bp, ≥ 100% within ±10 bp, index R² ≥ 0.95.

A separate **Term Calibration (DTCC Live)** sub-tab surfaces real DTCC SDR public CPI swap data (1Y / 2Y / 3Y / 5Y / 10Y / 30Y) as an institutional reference anchor — reference only, not a parity gate, because tenor-based ZCIS/YYIS trades don't analytically map to single monthly CPI buckets.

---

## Testing

```bash
pytest tests/
```

Covers the curve engine, venue adapters (Kalshi / ForecastEx / Polymarket), weighting engine, timestamp freshness attribution, parity pipeline, and CMS loader.

---

## Configuration Notes

- **OTC parity thresholds**: avg / max ≤ 10 bp, 100% within ±10 bp, R² ≥ 0.95
- **Blend defaults (CPI Basis)**: Kalshi 55% / ForecastEx 45%, alpha 0.35 between requested and score-derived weights, ineligible venues zeroed and renormalized
- **Polymarket policy**: classified as a Diagnostic / Supplemental Venue — two-layer eligibility (Render gate 2+ maturities, Publication gate 4+ maturities); not included in Oriel blend by default
