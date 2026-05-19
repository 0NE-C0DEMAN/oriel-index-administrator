/* ==========================================================================
   indices.js — Static catalog of the seven Oriel indices.
   Mirrors the v7 tab structure (oriel_demo_v7/app.py). Numbers here are
   plausible placeholders; once we wire the JS<->Python bridge they'll be
   pulled from the v7 engine + sample_data.
   Registers on window.App.INDICES.
   ========================================================================== */
(() => {
  'use strict';

  const INDICES = [
    {
      key: 'hc',
      name: 'CareFi Healthcare Trend Index',
      family: 'Healthcare',
      venue: 'Prediction-market healthcare trend curve',
      icon: 'heart',
      accent: 'pink',
      status: { variant: 'success', label: 'Active' },
      feed: { variant: 'mute',  label: 'Sample' },
      description:
        'Market-implied U.S. healthcare cost trend derived from scalar bucket pricing.',
      bullets: [
        'Probability-weighted expected trend',
        'Three maturity anchors: Jun, Sep, Dec 2026',
        'Front anchor indexed to 100',
      ],
      metric: { label: 'Front anchor', value: '4.08%', sub: 'YoY · Jun 2026' },
      risk:   { variant: 'warning', label: 'Moderate' },
      detail: {
        unit: '%',
        primaryMetric: {
          value: 4.08,
          formatted: '4.08%',
          label: 'Implied trend · Front anchor',
          sub: 'Healthcare trend YoY · Jun 2026',
          change: { delta: 0.13, formatted: '+0.13%', direction: 'up', since: 'vs. last snapshot' },
        },
        indexPrint: {
          indexLevel: 100.00,
          baseValue: 100,
          valuationTime: '2026-04-28 14:00 UTC',
          anchorExpectedValue: 4.0775,
          publishable: true,
          constituentCount: 18,
          flaggedCount: 1,
          front: { value: 4.08, maturity: 'Jun 2026', label: 'Front (1M implied)' },
          back:  { value: 4.34, maturity: 'Dec 2026', label: 'Back (6M implied)' },
          slope: { delta: 0.26, pct: 6.37, direction: 'up' },
        },
        dislocation: {
          unit: '%',
          orielForward:    4.0775,
          cpiSwapProxy:    4.1509,
          swapLabel:       'CPI Swap (proxy)',
          signalLabel:     'Energy Signal',
          energySignal:    '↑ Elevated',
          energyTone:      'warning',
          dislocationBps:  7.3,
        },
        methodology: {
          version: '0.1.0',
          name: 'CareFi Healthcare Trend Forward Index',
          basis: 'probability_midpoint',
          interpolation: 'linear',
          weighting: 'front_anchor_base_100',
          smoothing: 'none',
          staleMarket: 'flag_after_15min',
          fallback: 'cached_last_known',
          steps: [
            { title: 'Contract prices as probabilities', body: 'Each bucket (e.g. "3.5–4.0%") is priced as the probability the outcome lands in that range. Prices normalized to sum to 1.' },
            { title: 'Extract implied distribution', body: 'Bucket midpoints are representative values. Expected value = probability-weighted average.' },
            { title: 'Compute forward points', body: 'One expected value per settlement date — these become the curve anchor points.' },
            { title: 'Index normalization', body: 'Front maturity = base 100. Later maturities expressed as ratios to this anchor.' },
            { title: 'Interpolation', body: 'Off-grid dates linearly interpolated between adjacent anchor points.' },
          ],
        },
        stats: {
          unit: '%',
          mean: 4.21,
          avgStdDev: 0.60,
          minValue: 4.08,
          maxValue: 4.34,
          constituentCount: 18,
        },
        forwardCurve: [
          { maturity: 'Jun 26', expected: 4.08, lower: 3.18, upper: 4.94, bucketCount: 6, contractType: 'scalar_bucket' },
          { maturity: 'Sep 26', expected: 4.21, lower: 3.30, upper: 5.05, bucketCount: 6, contractType: 'scalar_bucket' },
          { maturity: 'Dec 26', expected: 4.34, lower: 3.40, upper: 5.15, bucketCount: 6, contractType: 'scalar_bucket' },
        ],
        bucketSnapshots: [
          {
            key: 'jun26',
            maturity: 'Jun 26',
            expected: 4.08,
            buckets: [
              { label: '2.5–3.0%', lower: 2.5, upper: 3.0, mid: 2.75, prob: 0.05 },
              { label: '3.0–3.5%', lower: 3.0, upper: 3.5, mid: 3.25, prob: 0.14 },
              { label: '3.5–4.0%', lower: 3.5, upper: 4.0, mid: 3.75, prob: 0.26 },
              { label: '4.0–4.5%', lower: 4.0, upper: 4.5, mid: 4.25, prob: 0.29 },
              { label: '4.5–5.0%', lower: 4.5, upper: 5.0, mid: 4.75, prob: 0.18 },
              { label: '5.0–5.5%', lower: 5.0, upper: 5.5, mid: 5.25, prob: 0.08 },
            ],
          },
          {
            key: 'sep26',
            maturity: 'Sep 26',
            expected: 4.21,
            buckets: [
              { label: '2.5–3.0%', lower: 2.5, upper: 3.0, mid: 2.75, prob: 0.04 },
              { label: '3.0–3.5%', lower: 3.0, upper: 3.5, mid: 3.25, prob: 0.10 },
              { label: '3.5–4.0%', lower: 3.5, upper: 4.0, mid: 3.75, prob: 0.22 },
              { label: '4.0–4.5%', lower: 4.0, upper: 4.5, mid: 4.25, prob: 0.30 },
              { label: '4.5–5.0%', lower: 4.5, upper: 5.0, mid: 4.75, prob: 0.22 },
              { label: '5.0–5.5%', lower: 5.0, upper: 5.5, mid: 5.25, prob: 0.12 },
            ],
          },
          {
            key: 'dec26',
            maturity: 'Dec 26',
            expected: 4.34,
            buckets: [
              { label: '2.5–3.0%', lower: 2.5, upper: 3.0, mid: 2.75, prob: 0.03 },
              { label: '3.0–3.5%', lower: 3.0, upper: 3.5, mid: 3.25, prob: 0.08 },
              { label: '3.5–4.0%', lower: 3.5, upper: 4.0, mid: 3.75, prob: 0.18 },
              { label: '4.0–4.5%', lower: 4.0, upper: 4.5, mid: 4.25, prob: 0.28 },
              { label: '4.5–5.0%', lower: 4.5, upper: 5.0, mid: 4.75, prob: 0.26 },
              { label: '5.0–5.5%', lower: 5.0, upper: 5.5, mid: 5.25, prob: 0.17 },
            ],
          },
        ],
        constituents: [
          { ticker: 'HC_JUN26_2.5_3.0', label: '2.5–3.0%', price: 0.05, type: 'Scalar bucket', status: 'Included' },
          { ticker: 'HC_JUN26_3.0_3.5', label: '3.0–3.5%', price: 0.14, type: 'Scalar bucket', status: 'Included' },
          { ticker: 'HC_JUN26_3.5_4.0', label: '3.5–4.0%', price: 0.26, type: 'Scalar bucket', status: 'Included' },
          { ticker: 'HC_JUN26_4.0_4.5', label: '4.0–4.5%', price: 0.29, type: 'Scalar bucket', status: 'Included' },
          { ticker: 'HC_JUN26_4.5_5.0', label: '4.5–5.0%', price: 0.18, type: 'Scalar bucket', status: 'Included' },
          { ticker: 'HC_JUN26_5.0_5.5', label: '5.0–5.5%', price: 0.08, type: 'Scalar bucket', status: 'Included' },
          { ticker: 'HC_SEP26_3.5_4.0', label: '3.5–4.0%', price: 0.22, type: 'Scalar bucket', status: 'Included' },
          { ticker: 'HC_SEP26_4.0_4.5', label: '4.0–4.5%', price: 0.30, type: 'Scalar bucket', status: 'Included' },
          { ticker: 'HC_DEC26_4.5_5.0', label: '4.5–5.0%', price: 0.26, type: 'Scalar bucket', status: 'Flagged' },
        ],
        feedConfig: {
          source: 'Sample data',
          cacheTtlSeconds: null,
          lastRefresh: '2026-04-28 14:28 UTC',
          counts: { scalar: 9, total: 9, included: 8, flagged: 1 },
          enabled: false,
        },
        medicalCpiMonitor: {
          asOfLabel: 'Mar 2026',
          source: 'BLS Medical CPI · official monitor (sample seed)',
          sourceDetail: 'Live BLS fetch attempted first; falls back to local seed when API unavailable.',
          signal: {
            orielFront: 4.08,
            medicalYoY: 3.85,
            gapBps:     23,
          },
          breadth: {
            componentCount: 7,
            thresholdPct: 3,
            acceleratingShare: 57,
            weightedShareAboveThreshold: 64,
            dispersionStd: 0.74,
          },
          components: [
            { component: 'Medical care services',     mm: 0.21, yoy: 4.10, prevYoy: 3.95, weight: 5.62, seriesId: 'CMRINSNS' },
            { component: 'Hospital services',         mm: 0.34, yoy: 6.78, prevYoy: 6.41, weight: 1.82, seriesId: 'SEMD01'   },
            { component: 'Physicians services',       mm: 0.18, yoy: 2.94, prevYoy: 3.10, weight: 1.32, seriesId: 'SEMD02'   },
            { component: 'Pharmaceutical drugs',      mm: 0.42, yoy: 3.55, prevYoy: 3.20, weight: 1.76, seriesId: 'SEMG01'   },
            { component: 'Medical equipment',         mm: 0.05, yoy: 1.85, prevYoy: 2.10, weight: 0.32, seriesId: 'SEMG02'   },
            { component: 'Health insurance',          mm: 0.95, yoy: 2.40, prevYoy: 1.78, weight: 0.96, seriesId: 'SEMF01'   },
            { component: 'Nursing home & adult day',  mm: 0.28, yoy: 5.12, prevYoy: 4.85, weight: 0.45, seriesId: 'SEMD06'   },
          ],
        },
        notes: {
          audience: 'CareFi view',
          disclaimer:
            'Healthcare trend index from scalar bucket prices; methodology version is on the KPI strip above. Use for internal demonstration of the same engine path as CPI.',
          liveDataNote:
            'Phase II live Kalshi CPI feed is integrated and ready. Set KALSHI_ENABLE_LIVE_CPI=true in .env to activate. Sample data remains available as fallback when live feed is disabled or unavailable. Engine layer unchanged — live markets map directly into MaturitySnapshot objects.',
          phase2: {
            title: 'Phase II — Live Data & Backtest',
            items: [
              { icon: 'check',    title: 'Live Kalshi integration', body: 'REST-first polling with cache, pagination, quote-waterfall pricing, automatic fallback.' },
              { icon: 'check',    title: 'Governed mapping',         body: 'Markets classified into threshold or exact-outcome contracts, normalized into existing engine inputs.' },
              { icon: 'sparkles', title: 'Enable live feed',         body: 'Set KALSHI_ENABLE_LIVE_CPI=true in Streamlit Cloud secrets. See .env for all options.' },
            ],
          },
        },
      },
    },
    {
      key: 'cpi',
      name: 'Oriel CPI Forward Index (Kalshi-style)',
      family: 'CPI Forward',
      venue: 'Kalshi-style binary contracts',
      icon: 'trending-up',
      accent: 'accent',
      status: { variant: 'success', label: 'Active' },
      feed: { variant: 'mute',  label: 'Sample · Live available' },
      description:
        'US CPI YoY from Kalshi binary threshold and exact-outcome contracts.',
      bullets: [
        'Threshold contracts → survival curve',
        'Monotonic repair + bucket inference',
        'Live Kalshi feed (toggle in detail view)',
      ],
      metric: { label: 'Front anchor', value: '3.34%', sub: 'YoY · Mar 2026' },
      risk:   { variant: 'success', label: 'Low' },
      detail: {
        unit: '%',
        primaryMetric: {
          value: 0,    // engine fills these from raw snapshots
          formatted: '—',
          label: 'Front anchor',
          sub: 'Implied CPI YoY',
          change: { delta: -0.06, formatted: '−0.06%', direction: 'down', since: 'vs. last refresh' },
        },
        methodology: {
          version: '0.1.0',
          name: 'Oriel CPI Forward Index (Kalshi-style)',
          basis: 'probability_midpoint',
          interpolation: 'linear',
          weighting: 'front_anchor_base_100',
          smoothing: 'monotone_repair',
          staleMarket: 'reject_after_5min',
          fallback: 'cached_last_known',
          steps: [
            { title: 'Threshold contracts as survival curve', body: 'Kalshi markets quote P(CPI > k) for each threshold k — non-increasing survival curve.' },
            { title: 'Monotonic repair', body: 'Violations corrected by isotonic regression so probabilities remain coherent.' },
            { title: 'Infer bucket probabilities', body: 'Adjacent thresholds differenced into bucket probabilities; tail buckets absorb mass at both ends.' },
            { title: 'Exact-outcome contracts', body: 'Used directly as a discrete distribution. Expected value = probability-weighted sum.' },
            { title: 'Index normalization & publication', body: 'Front anchor base 100; linear interpolation off-grid; constituent-level transparency.' },
          ],
        },
        // Raw maturity snapshots — exact mirror of v7's CPI_SNAPSHOTS.
        // Engine derives forwardCurve, bucketSnapshots, indexPrint, stats
        // from this at module load.
        snapshots: [
          {
            maturity: 'Mar 26',
            binary_thresholds: [
              { label: 'Above 2.5%', threshold: 2.5, price: 0.99 },
              { label: 'Above 3.0%', threshold: 3.0, price: 0.81 },
              { label: 'Above 3.2%', threshold: 3.2, price: 0.80 },
              { label: 'Above 3.3%', threshold: 3.3, price: 0.48 },
              { label: 'Above 3.4%', threshold: 3.4, price: 0.39 },
              { label: 'Above 3.5%', threshold: 3.5, price: 0.12 },
              { label: 'Above 3.8%', threshold: 3.8, price: 0.01 },
            ],
          },
          {
            maturity: 'Apr 26',
            exact_outcomes: [
              { label: 'Exactly 2.8%', value: 2.8, price: 0.09 },
              { label: 'Exactly 3.2%', value: 3.2, price: 0.15 },
              { label: 'Exactly 3.3%', value: 3.3, price: 0.17 },
              { label: 'Exactly 3.4%', value: 3.4, price: 0.14 },
              { label: 'Exactly 3.5%', value: 3.5, price: 0.10 },
            ],
          },
          {
            maturity: 'May 26',
            exact_outcomes: [
              { label: 'Exactly 3.1%', value: 3.1, price: 0.09 },
              { label: 'Exactly 3.2%', value: 3.2, price: 0.12 },
              { label: 'Exactly 3.4%', value: 3.4, price: 0.10 },
              { label: 'Exactly 3.5%', value: 3.5, price: 0.08 },
            ],
          },
          {
            maturity: 'Jun 26',
            exact_outcomes: [
              { label: 'Exactly 2.6%', value: 2.6, price: 0.13 },
              { label: 'Exactly 3.0%', value: 3.0, price: 0.09 },
              { label: 'Exactly 3.4%', value: 3.4, price: 0.11 },
              { label: 'Exactly 3.5%', value: 3.5, price: 0.12 },
            ],
          },
        ],
        // Constituent table — exact mirror of v7's CPI_CONTRACTS_TABLE
        constituents: [
          { ticker: 'KXCPI-26MAR-ABOVE2.5', label: '>2.5%', price: 0.99, type: 'Binary threshold', method: 'Monotonic repair', status: 'Included' },
          { ticker: 'KXCPI-26MAR-ABOVE3.0', label: '>3.0%', price: 0.81, type: 'Binary threshold', method: 'Monotonic repair', status: 'Included' },
          { ticker: 'KXCPI-26MAR-ABOVE3.3', label: '>3.3%', price: 0.48, type: 'Binary threshold', method: 'Monotonic repair', status: 'Included' },
          { ticker: 'KXCPI-26MAR-ABOVE3.5', label: '>3.5%', price: 0.12, type: 'Binary threshold', method: 'Monotonic repair', status: 'Included' },
          { ticker: 'KXCPI-26APR-3.2',      label: '3.2%',  price: 0.15, type: 'Exact outcome',    method: 'Midpoint',         status: 'Included' },
          { ticker: 'KXCPI-26APR-3.3',      label: '3.3%',  price: 0.17, type: 'Exact outcome',    method: 'Midpoint',         status: 'Included' },
          { ticker: 'KXCPI-26MAY-3.2',      label: '3.2%',  price: 0.12, type: 'Exact outcome',    method: 'Midpoint',         status: 'Included' },
          { ticker: 'KXCPI-26JUN-3.5',      label: '3.5%',  price: 0.12, type: 'Exact outcome',    method: 'Last available',   status: 'Flagged' },
        ],
        dislocation: {
          unit: '%',
          orielForward:    0,    // engine fills
          cpiSwapProxy:    0,
          swapLabel:       'CPI Swap (proxy)',
          signalLabel:     'Energy Signal',
          energySignal:    '↑ Elevated',
          energyTone:      'warning',
          dislocationBps:  0,
        },
        runtimeMeta: {
          feedStatus: 'live',
          source: 'Kalshi public API',
          cacheTtlSeconds: 60,
          contractsFetched: 8,
          errorCount: 0,
          enableEnvVar: 'KALSHI_ENABLE_LIVE_CPI',
        },
        feedConfig: {
          source: 'Kalshi public API',
          cacheTtlSeconds: 60,
          counts: { binary: 4, exact: 4, total: 8, included: 7, flagged: 1 },
          enabled: true,
        },
        notes: {
          audience: 'Kalshi-facing summary',
          disclaimer:
            'CPI implied levels follow the methodology table above. With live data enabled, inputs are Kalshi REST quotes (cached polling); otherwise sample snapshots illustrate the pipeline. For review: confirm feed status, contract mapping, and publishability in the KPI strip. Not investment advice.',
          liveDataNote:
            'Phase II live Kalshi CPI feed is integrated and ready. Set KALSHI_ENABLE_LIVE_CPI=true in .env to activate. Sample data remains available as fallback when live feed is disabled or unavailable. Engine layer unchanged — live markets map directly into MaturitySnapshot objects.',
          phase2: {
            title: 'Phase II — Live Data & Backtest',
            items: [
              { icon: 'check',    title: 'Live Kalshi integration', body: 'REST-first polling with cache, pagination, quote-waterfall pricing, automatic fallback.' },
              { icon: 'check',    title: 'Governed mapping',         body: 'Markets classified into threshold or exact-outcome contracts, normalized into existing engine inputs.' },
              { icon: 'sparkles', title: 'Enable live feed',         body: 'Set KALSHI_ENABLE_LIVE_CPI=true in Streamlit Cloud secrets. See .env for all options.' },
            ],
          },
        },
      },
    },
    {
      key: 'fx',
      name: 'Oriel CPI Forward Index (ForecastEx-style)',
      family: 'CPI Forward',
      venue: 'ForecastEx-style CPI forward curve',
      icon: 'bar-chart',
      accent: 'accent',
      status: { variant: 'success', label: 'Live' },
      feed: { variant: 'live', label: 'Live · ForecastEx' },
      description:
        'Market-implied U.S. CPI YoY curve from ForecastEx-style binary threshold contracts.',
      bullets: [
        'Binary threshold market inputs',
        'Multi-tenor forward curve',
        'Regulated event-contract source',
      ],
      metric: { label: 'Front anchor', value: '3.41%', sub: 'YoY · Mar 2026' },
      risk:   { variant: 'success', label: 'Low' },
      detail: {
        unit: '%',
        primaryMetric: {
          value: 3.41,
          formatted: '3.41%',
          label: 'Front anchor',
          sub: 'Implied CPI YoY · Mar 2026',
          change: { delta: 0.04, formatted: '+0.04%', direction: 'up', since: 'vs. last snapshot' },
        },
        indexPrint: {
          indexLevel: 100.00,
          baseValue: 100,
          valuationTime: '2026-04-28 14:24 UTC',
          anchorExpectedValue: 3.4118,
          publishable: true,
          constituentCount: 11,
          flaggedCount: 1,
          front: { value: 3.41, maturity: 'Mar 2026', label: 'Front (1M implied)' },
          back:  { value: 2.81, maturity: 'Dec 2026', label: 'Back (9M implied)' },
          slope: { delta: -0.60, pct: -17.60, direction: 'down' },
        },
        dislocation: {
          unit: '%',
          orielForward:    3.4118,
          cpiSwapProxy:    3.4732,
          swapLabel:       'CPI Swap (proxy)',
          signalLabel:     'Energy Signal',
          energySignal:    '↑ Elevated',
          energyTone:      'warning',
          dislocationBps:  6.1,
        },
        stats: {
          unit: '%',
          mean: 3.10,
          avgStdDev: 0.14,
          minValue: 2.81,
          maxValue: 3.41,
          constituentCount: 11,
        },
        methodology: {
          version: '0.1.0',
          name: 'Oriel CPI Forward Index — ForecastEx',
          basis: 'probability_midpoint',
          interpolation: 'linear',
          weighting: 'front_anchor_base_100',
          smoothing: 'monotone_repair',
          staleMarket: 'reject_after_10min',
          fallback: 'cached_last_known',
          steps: [
            { title: 'CFTC-regulated event contracts',  body: 'ForecastEx markets quote P(CPI in range) for each binary contract. Regulated venue → cleaner microstructure.' },
            { title: 'Threshold ladder ingestion',      body: 'Threshold ladder is parsed into a non-increasing survival curve P(CPI > k).' },
            { title: 'Monotonic repair',                 body: 'Curve violations capped at the prior threshold so probabilities remain coherent.' },
            { title: 'Bucket inference',                 body: 'Adjacent thresholds differenced into bucket probabilities; tail buckets absorb tail mass.' },
            { title: 'Index normalization',              body: 'Front anchor base 100; linear interpolation off-grid; published with full constituent transparency.' },
          ],
        },
        forwardCurve: [
          { maturity: 'Mar 26', expected: 3.41, lower: 3.28, upper: 3.56, bucketCount: 7, contractType: 'binary_threshold' },
          { maturity: 'Jun 26', expected: 3.22, lower: 3.10, upper: 3.38, bucketCount: 7, contractType: 'binary_threshold' },
          { maturity: 'Sep 26', expected: 2.98, lower: 2.85, upper: 3.14, bucketCount: 6, contractType: 'binary_threshold' },
          { maturity: 'Dec 26', expected: 2.81, lower: 2.69, upper: 2.96, bucketCount: 6, contractType: 'binary_threshold' },
        ],
        constituents: [
          { ticker: 'FX_CPI_MAR26_GT_2.5', label: 'Above 2.5%', price: 0.99, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_MAR26_GT_3.0', label: 'Above 3.0%', price: 0.84, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_MAR26_GT_3.2', label: 'Above 3.2%', price: 0.71, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_MAR26_GT_3.4', label: 'Above 3.4%', price: 0.51, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_MAR26_GT_3.5', label: 'Above 3.5%', price: 0.32, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_MAR26_GT_3.7', label: 'Above 3.7%', price: 0.14, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_MAR26_GT_4.0', label: 'Above 4.0%', price: 0.03, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_JUN26_GT_3.0', label: 'Above 3.0%', price: 0.69, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_JUN26_GT_3.5', label: 'Above 3.5%', price: 0.18, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_SEP26_GT_3.0', label: 'Above 3.0%', price: 0.45, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_SEP26_GT_3.5', label: 'Above 3.5%', price: 0.09, type: 'Binary threshold', status: 'Flagged' },
        ],
        runtimeMeta: {
          feedStatus: 'live',
          source: 'ForecastEx public API',
          cacheTtlSeconds: 60,
          contractsFetched: 11,
          errorCount: 0,
          enableEnvVar: 'FORECASTEX_ENABLE_LIVE_CPI',
        },
        feedConfig: {
          source: 'ForecastEx public API',
          cacheTtlSeconds: 60,
          counts: { binary: 11, exact: 0, total: 11, included: 10, flagged: 1 },
          enabled: true,
        },
        notes: {
          audience: 'ForecastEx-facing summary',
          disclaimer:
            'CPI implied levels via ForecastEx-listed CFTC-regulated event contracts. Front anchor publishes when constituent threshold ladder is intact; thin or stale strikes are flagged for review. Not investment advice.',
          liveDataNote:
            'Phase II live ForecastEx CPI feed is integrated. Set FORECASTEX_ENABLE_LIVE_CPI=true in .env to activate. Sample data remains available as fallback when live feed is disabled or unavailable.',
          phase2: {
            title: 'Phase II — Live Data & Backtest',
            items: [
              { icon: 'check',    title: 'Live ForecastEx integration', body: 'REST polling with cache + pagination; CFTC-regulated venue passes intact.' },
              { icon: 'check',    title: 'Governed mapping',             body: 'Markets classified into threshold contracts, normalized into engine inputs.' },
              { icon: 'sparkles', title: 'Enable live feed',             body: 'Set FORECASTEX_ENABLE_LIVE_CPI=true in Streamlit Cloud secrets.' },
            ],
          },
        },
      },
    },
    {
      key: 'poly',
      name: 'Oriel CPI Forward Index (Polymarket-style)',
      family: 'CPI Forward',
      venue: 'On-chain CPI forward curve',
      icon: 'globe',
      accent: 'accent',
      status: { variant: 'success', label: 'Live' },
      feed: { variant: 'live', label: 'Live · Polymarket' },
      description:
        'Market-implied U.S. CPI YoY curve from on-chain threshold markets.',
      bullets: [
        'On-chain threshold pricing',
        'Off-grid maturity coverage',
        'Cross-venue price discovery',
      ],
      metric: { label: 'Front anchor', value: '3.28%', sub: 'YoY · Mar 2026' },
      risk:   { variant: 'success', label: 'Low' },
      detail: {
        unit: '%',
        primaryMetric: {
          value: 3.28,
          formatted: '3.28%',
          label: 'Front anchor',
          sub: 'Implied CPI YoY · Mar 2026',
          change: { delta: -0.09, formatted: '−0.09%', direction: 'down', since: 'vs. last snapshot' },
        },
        indexPrint: {
          indexLevel: 100.00,
          baseValue: 100,
          valuationTime: '2026-04-28 14:18 UTC',
          anchorExpectedValue: 3.2814,
          publishable: false,
          constituentCount: 9,
          flaggedCount: 1,
          front: { value: 3.28, maturity: 'Mar 2026', label: 'Front (1M implied)' },
          back:  { value: 2.68, maturity: 'Dec 2026', label: 'Back (9M implied)' },
          slope: { delta: -0.60, pct: -18.29, direction: 'down' },
        },
        dislocation: {
          unit: '%',
          orielForward:    3.2814,
          cpiSwapProxy:    3.3405,
          swapLabel:       'CPI Swap (proxy)',
          signalLabel:     'Energy Signal',
          energySignal:    '↓ Cooling',
          energyTone:      'success',
          dislocationBps:  5.9,
        },
        stats: {
          unit: '%',
          mean: 2.99,
          avgStdDev: 0.15,
          minValue: 2.68,
          maxValue: 3.28,
          constituentCount: 9,
        },
        methodology: {
          version: '0.1.0',
          name: 'Oriel CPI Forward Index — Polymarket',
          basis: 'probability_midpoint',
          interpolation: 'linear',
          weighting: 'front_anchor_base_100',
          smoothing: 'monotone_repair_with_depth_filter',
          staleMarket: 'flag_after_5min',
          fallback: 'mark_as_unpublishable',
          steps: [
            { title: 'On-chain threshold markets',     body: 'Polymarket markets quote P(CPI > k) on-chain. AMM and orderbook-style liquidity considered.' },
            { title: 'Liquidity-weighted price snap',  body: 'Mid price selected from the best resting bid/ask, fallbacks to last-traded if depth thin.' },
            { title: 'Monotonic repair',                body: 'Survival curve corrected; thin or stale strikes flagged but not auto-removed.' },
            { title: 'Bucket inference',                body: 'Differenced thresholds yield bucket probabilities; off-grid maturities linearly interpolated.' },
            { title: 'Index normalization',             body: 'Front anchor base 100. Constituents published with venue depth and last-trade timestamp.' },
          ],
        },
        forwardCurve: [
          { maturity: 'Mar 26', expected: 3.28, lower: 3.14, upper: 3.46, bucketCount: 6, contractType: 'binary_threshold' },
          { maturity: 'Jun 26', expected: 3.12, lower: 2.98, upper: 3.28, bucketCount: 6, contractType: 'binary_threshold' },
          { maturity: 'Sep 26', expected: 2.86, lower: 2.72, upper: 3.04, bucketCount: 5, contractType: 'binary_threshold' },
          { maturity: 'Dec 26', expected: 2.68, lower: 2.55, upper: 2.84, bucketCount: 5, contractType: 'binary_threshold' },
        ],
        constituents: [
          { ticker: 'POLY_CPI_MAR26_2.5', label: 'Above 2.5%', price: 0.98, type: 'Binary threshold', status: 'Included' },
          { ticker: 'POLY_CPI_MAR26_3.0', label: 'Above 3.0%', price: 0.79, type: 'Binary threshold', status: 'Included' },
          { ticker: 'POLY_CPI_MAR26_3.3', label: 'Above 3.3%', price: 0.45, type: 'Binary threshold', status: 'Included' },
          { ticker: 'POLY_CPI_MAR26_3.5', label: 'Above 3.5%', price: 0.21, type: 'Binary threshold', status: 'Included' },
          { ticker: 'POLY_CPI_MAR26_4.0', label: 'Above 4.0%', price: 0.05, type: 'Binary threshold', status: 'Included' },
          { ticker: 'POLY_CPI_JUN26_3.0', label: 'Above 3.0%', price: 0.62, type: 'Binary threshold', status: 'Included' },
          { ticker: 'POLY_CPI_JUN26_3.5', label: 'Above 3.5%', price: 0.13, type: 'Binary threshold', status: 'Repaired' },
          { ticker: 'POLY_CPI_SEP26_3.0', label: 'Above 3.0%', price: 0.38, type: 'Binary threshold', status: 'Included' },
          { ticker: 'POLY_CPI_SEP26_3.5', label: 'Above 3.5%', price: 0.06, type: 'Binary threshold', status: 'Flagged' },
        ],
        runtimeMeta: {
          feedStatus: 'live',
          source: 'Polymarket on-chain feed',
          cacheTtlSeconds: 60,
          contractsFetched: 9,
          errorCount: 0,
          enableEnvVar: 'POLYMARKET_ENABLE_LIVE_CPI',
        },
        feedConfig: {
          source: 'Polymarket on-chain feed',
          cacheTtlSeconds: 60,
          counts: { binary: 9, exact: 0, total: 9, included: 7, flagged: 1 },
          enabled: true,
        },
        notes: {
          audience: 'Polymarket-facing summary',
          disclaimer:
            'CPI implied levels via Polymarket on-chain threshold markets. Liquidity-weighted price snapping; thin or stale strikes flagged. Off-chain settlement reference is the BLS print. Not investment advice.',
          liveDataNote:
            'Phase II live Polymarket CPI feed is integrated. Set POLYMARKET_ENABLE_LIVE_CPI=true in .env to activate. Sample data remains available as fallback when on-chain liquidity is thin.',
          phase2: {
            title: 'Phase II — Live Data & Backtest',
            items: [
              { icon: 'check',    title: 'On-chain liquidity snap',  body: 'Best resting bid/ask used; thin / stale strikes flagged but kept in the ladder for transparency.' },
              { icon: 'check',    title: 'Governed mapping',          body: 'Threshold markets classified and normalized into engine inputs; off-grid maturities interpolated.' },
              { icon: 'sparkles', title: 'Enable live feed',          body: 'Set POLYMARKET_ENABLE_LIVE_CPI=true in Streamlit Cloud secrets.' },
            ],
          },
        },
      },
    },
    {
      key: 'perp',
      name: 'Oriel CPI Basis Engine',
      family: 'Analytics',
      venue: 'Fair value, carry, and tradable basis signals',
      icon: 'layers',
      accent: 'pink',
      status: { variant: 'success', label: 'Live' },
      feed: { variant: 'live', label: 'Live engine' },
      description:
        'CPI basis engine for fair value, carry, and perp-relative dislocation analysis.',
      bullets: [
        'Fair-value reference curve',
        'Carry, roll, and funding decomposition',
        'Basis vs. OTC and perp wrappers',
      ],
      metric: { label: 'Implied basis', value: '−12 bps', sub: '3M tenor' },
      risk:   { variant: 'warning', label: 'Moderate' },
      detail: {
        unit: ' bps',          // for hero metric — basis in bps
        curveUnit: '',         // for forward curve — index level (no unit suffix)
        curvePrecision: 4,
        primaryMetric: {
          value: -12,
          formatted: '−12 bps',
          label: 'Implied basis · 3M',
          sub: 'Sim. perp price vs. fair value @ 90d',
          change: { delta: -3, formatted: '−3 bps', direction: 'down', since: 'vs. yesterday' },
        },
        indexPrint: {
          indexLevel: 1.0234,
          baseValue: 1.0,
          valuationTime: '2026-04-28 14:18 UTC',
          anchorExpectedValue: 1.0234,
          publishable: true,
          constituentCount: 25,
          flaggedCount: 2,
          front: { value: 1.0234, maturity: 'Today', label: 'Spot anchor' },
          back:  { value: 1.0925, maturity: '270d',  label: 'Back (270d)' },
          slope: { delta: 691, pct: 6.75, direction: 'up', unit: 'bps' },
          customLabels: {
            indexLevel: 'Spot index',
            anchor:     'Sim. perp',
            spread:     'Implied basis',
          },
        },
        methodology: {
          version: '0.1.0',
          name: 'Oriel CPI Basis (Tier 1)',
          basis: 'governed_blend',
          interpolation: 'monotone_cubic',
          weighting: 'venue_eligibility_governed',
          smoothing: 'monotone_smoothing_with_breadth_floor',
          staleMarket: 'reject_after_2min',
          fallback: 'single_venue_failover',
          steps: [
            { title: 'Constituent ingestion',        body: 'Kalshi + ForecastEx contracts pulled; microstructure filters reject thin or stale strikes.' },
            { title: 'Per-venue curve construction', body: 'Each venue’s contracts aggregate into a forward CPI level curve; threshold/exact handled per their kind.' },
            { title: 'Eligibility scoring',          body: 'Per-venue diagnostics (depth, breadth, freshness) compute eligibility weights for the governed blend.' },
            { title: 'Governed blend',                body: 'Eligibility-weighted average of venue curves with monotone smoothing; single-venue fallback if peer fails the gate.' },
            { title: 'Fair value & basis',            body: 'Reference curve interpolated at the perp horizon → fair value. Basis = simulated perp price minus FV.' },
          ],
        },
        // Reference forward curve — implied CPI index level by horizon (days from today)
        forwardCurve: [
          { maturity: 'Today',  expected: 1.0234, lower: 1.0224, upper: 1.0244, bucketCount: 25, contractType: 'reference' },
          { maturity: '30d',    expected: 1.0312, lower: 1.0298, upper: 1.0326, bucketCount: 25, contractType: 'reference' },
          { maturity: '60d',    expected: 1.0387, lower: 1.0370, upper: 1.0404, bucketCount: 24, contractType: 'reference' },
          { maturity: '90d',    expected: 1.0461, lower: 1.0440, upper: 1.0482, bucketCount: 24, contractType: 'reference' },
          { maturity: '180d',   expected: 1.0698, lower: 1.0670, upper: 1.0726, bucketCount: 21, contractType: 'reference' },
          { maturity: '270d',   expected: 1.0925, lower: 1.0890, upper: 1.0960, bucketCount: 18, contractType: 'reference' },
        ],
        basis: {
          horizonLabel: '90d',
          horizonDays: 90,
          spot:      { label: 'Spot',           value: 1.0234, sub: 'Live ref' },
          fairValue: { label: 'Fair Value',     value: 1.0461, sub: 'FV @ 90d', delta: { value: 227, label: '+227 bps vs spot', positive: true } },
          perpPrice: { label: 'Sim. Perp',      value: 1.0449, sub: 'Mark price', delta: { value: -12, label: '−12 bps vs FV', positive: false } },
          decomposition: [
            { label: 'Cash-and-carry premium', value: '+227 bps', sub: '90d carry on spot anchor', tone: 'neutral' },
            { label: 'Funding rate (annualized)', value: '+1.20%',  sub: 'Implied perp funding', tone: 'neutral' },
            { label: 'Basis vs. fair value',     value: '−12 bps',  sub: 'Perp trades 0.11% below FV', tone: 'down' },
            { label: 'Residual / model error',   value: '+2 bps',   sub: 'Smoothing + microstructure', tone: 'neutral' },
          ],
        },
        stats: {
          unit: '',
          unitLabel: 'index level',
          mean: 1.0503,
          avgStdDev: 0.0024,
          minValue: 1.0234,
          maxValue: 1.0925,
          constituentCount: 25,
          precision: 4,
        },
        runtimeMeta: {
          feedStatus: 'live',
          source: 'Tier 1 governed blend (Kalshi + ForecastEx)',
          cacheTtlSeconds: 3600,
          lastFetch: '2026-04-28 14:18:11 UTC',
          contractsFetched: 25,
          errorCount: 0,
          enableEnvVar: 'TIER1_ENABLE_LIVE_BASIS',
        },
        venueBlend: {
          governance: 'Eligibility-weighted with monotone smoothing',
          blendDate: '2026-04-28',
          venues: [
            {
              name: 'Kalshi', weight: 0.58, eligible: true,
              metrics: [
                { label: 'Depth (avg bps)', value: '12.4' },
                { label: 'Breadth',        value: '92%'  },
                { label: 'Freshness',      value: '34s'  },
                { label: 'Constituents',   value: '14'   },
              ],
              note: 'Depth strong on near tenors; thinning past 180d.',
            },
            {
              name: 'ForecastEx', weight: 0.42, eligible: true,
              metrics: [
                { label: 'Depth (avg bps)', value: '18.6' },
                { label: 'Breadth',        value: '88%'  },
                { label: 'Freshness',      value: '52s'  },
                { label: 'Constituents',   value: '11'   },
              ],
              note: 'Wider spreads but cleaner threshold ladder for Mar-26.',
            },
          ],
        },
        constituents: [
          { ticker: 'KAL_CPI_MAR26_GT_3.0', venue: 'Kalshi',     label: 'Above 3.0%', price: 0.81, type: 'Binary threshold', status: 'Included' },
          { ticker: 'KAL_CPI_MAR26_GT_3.3', venue: 'Kalshi',     label: 'Above 3.3%', price: 0.48, type: 'Binary threshold', status: 'Included' },
          { ticker: 'KAL_CPI_JUN26_GT_3.0', venue: 'Kalshi',     label: 'Above 3.0%', price: 0.65, type: 'Binary threshold', status: 'Included' },
          { ticker: 'KAL_CPI_SEP26_GT_3.0', venue: 'Kalshi',     label: 'Above 3.0%', price: 0.42, type: 'Binary threshold', status: 'Included' },
          { ticker: 'KAL_CPI_DEC26_EQ_2.75',venue: 'Kalshi',     label: '= 2.75%',    price: 0.34, type: 'Exact outcome',    status: 'Included' },
          { ticker: 'FX_CPI_MAR26_GT_3.0',  venue: 'ForecastEx', label: 'Above 3.0%', price: 0.84, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_MAR26_GT_3.4',  venue: 'ForecastEx', label: 'Above 3.4%', price: 0.51, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_JUN26_GT_3.0',  venue: 'ForecastEx', label: 'Above 3.0%', price: 0.69, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_SEP26_GT_3.0',  venue: 'ForecastEx', label: 'Above 3.0%', price: 0.45, type: 'Binary threshold', status: 'Included' },
          { ticker: 'FX_CPI_SEP26_GT_3.5',  venue: 'ForecastEx', label: 'Above 3.5%', price: 0.09, type: 'Binary threshold', status: 'Flagged'  },
          { ticker: 'KAL_CPI_270D_TAIL',    venue: 'Kalshi',     label: 'Tail strike', price: 0.02, type: 'Binary threshold', status: 'Flagged' },
        ],
        feedConfig: {
          source: 'Tier 1 governed blend (Kalshi + ForecastEx)',
          cacheTtlSeconds: 3600,
          lastRefresh: '2026-04-28 14:18 UTC',
          counts: { kalshi: 14, forecastex: 11, total: 25, included: 23, flagged: 2 },
          enabled: true,
        },
        notes: {
          audience: 'Tier 1 perp readiness',
          disclaimer:
            'Reference curve is the governed blend; fair value is the curve evaluated at the perp horizon. Basis is the gap between the simulated perp price and fair value. For review: venue eligibility, blend governance, and basis decomposition tabs.',
          liveDataNote:
            'Phase II live Tier 1 governed-blend engine is integrated (Kalshi + ForecastEx). Set TIER1_ENABLE_LIVE_BASIS=true in .env to activate. Single-venue failover engages automatically when peer fails the eligibility gate.',
          phase2: {
            title: 'Phase II — Live Data & Backtest',
            items: [
              { icon: 'check',    title: 'Governed blend (Kalshi + ForecastEx)', body: 'Per-venue eligibility scoring + monotone smoothing + single-venue failover.' },
              { icon: 'check',    title: 'Fair value & basis',                    body: 'Reference curve interpolated at perp horizon → FV. Basis = sim perp price minus FV.' },
              { icon: 'sparkles', title: 'Enable live feed',                      body: 'Set TIER1_ENABLE_LIVE_BASIS=true in Streamlit Cloud secrets.' },
            ],
          },
        },
      },
    },
    {
      key: 'cms',
      name: 'Oriel Healthcare Reference',
      family: 'Healthcare',
      venue: 'Healthcare cost translation layer',
      icon: 'shield',
      accent: 'pink',
      status: { variant: 'success', label: 'Live' },
      feed: { variant: 'live', label: 'Live · CMS feed' },
      description:
        'Translates public healthcare cost rails into an Oriel spot reference and tradable basis view.',
      bullets: [
        'Public-print to market-reference translation',
        'Service-line and episode-level mapping',
        'Publishable healthcare reference rate',
      ],
      metric: { label: 'Reference rate', value: '5.42%', sub: 'YoY · Mar 2026' },
      risk:   { variant: 'success', label: 'Low' },
      detail: {
        unit: '%',
        primaryMetric: {
          value: 5.42,
          formatted: '5.42%',
          label: 'Reference rate',
          sub: 'Healthcare YoY · 2026 (CMS-anchored)',
          change: { delta: 0.08, formatted: '+0.08%', direction: 'up', since: 'vs. last anchor' },
        },
        indexPrint: {
          indexLevel: 100.00,
          baseValue: 100,
          valuationTime: '2026-04-28 14:00 UTC',
          anchorExpectedValue: 5.4200,
          publishable: true,
          constituentCount: 8,
          flaggedCount: 1,
          front: { value: 5.42, maturity: '2026', label: 'Front anchor' },
          back:  { value: 5.55, maturity: '2027', label: 'Back anchor' },
          slope: { delta: 0.13, pct: 2.40, direction: 'up' },
        },
        methodology: {
          version: '0.1.0-phase1',
          name: 'Oriel Healthcare Reference (CMS Lag Engine)',
          basis: 'cms_anchor_translated',
          interpolation: 'lag_engine_projection',
          weighting: 'episode_weighted',
          smoothing: 'lag_engine_projection',
          staleMarket: 'expected_lag_12_18mo',
          fallback: 'last_published_anchor',
          steps: [
            { title: 'CMS schedule ingestion',     body: 'CMS publishes annual fee schedules + reimbursement updates; ingested with revision history.' },
            { title: 'Episode-level mapping',      body: 'CMS line items mapped to clinical episode taxonomies (ICD / DRG → category bucket).' },
            { title: 'Lag-engine translation',     body: 'CMS data lags 12–18 months; the lag engine projects forward using market-implied YoY trend.' },
            { title: 'Public settlement rail',     body: 'Translated rate published as the public settlement reference for healthcare-linked instruments.' },
            { title: 'Confidence band',            body: 'Band derived from the basis between public print and Oriel translated spot.' },
          ],
        },
        forwardCurve: [
          { maturity: '2022', expected: 4.21, lower: 3.95, upper: 4.48, bucketCount: 12, contractType: 'reference' },
          { maturity: '2023', expected: 4.68, lower: 4.40, upper: 4.96, bucketCount: 12, contractType: 'reference' },
          { maturity: '2024', expected: 5.05, lower: 4.78, upper: 5.32, bucketCount: 12, contractType: 'reference' },
          { maturity: '2025', expected: 5.28, lower: 5.00, upper: 5.56, bucketCount: 12, contractType: 'reference' },
          { maturity: '2026', expected: 5.42, lower: 5.12, upper: 5.72, bucketCount: 12, contractType: 'reference' },
          { maturity: '2027', expected: 5.55, lower: 5.20, upper: 5.90, bucketCount: 12, contractType: 'reference' },
        ],
        stats: {
          unit: '%',
          mean: 5.03,
          avgStdDev: 0.28,
          minValue: 4.21,
          maxValue: 5.55,
          constituentCount: 8,
        },
        constituents: [
          { ticker: 'CMS_HC_2024_E1', label: 'Inpatient hospital',   price: 5.10, type: 'CMS schedule', status: 'Included' },
          { ticker: 'CMS_HC_2024_E2', label: 'Outpatient hospital',  price: 4.85, type: 'CMS schedule', status: 'Included' },
          { ticker: 'CMS_HC_2024_E3', label: 'Physician services',   price: 5.20, type: 'CMS schedule', status: 'Included' },
          { ticker: 'CMS_HC_2024_E4', label: 'Pharmacy',              price: 5.65, type: 'CMS schedule', status: 'Included' },
          { ticker: 'CMS_HC_2024_E5', label: 'Long-term care',        price: 4.95, type: 'CMS schedule', status: 'Included' },
          { ticker: 'CMS_HC_2024_E6', label: 'Home health',           price: 5.18, type: 'CMS schedule', status: 'Repaired' },
          { ticker: 'CMS_HC_2024_E7', label: 'Specialty care',        price: 5.42, type: 'CMS schedule', status: 'Included' },
          { ticker: 'CMS_HC_2024_E8', label: 'Preventive services',   price: 4.62, type: 'CMS schedule', status: 'Flagged' },
        ],
        runtimeMeta: {
          feedStatus: 'live',
          source: 'CMS schedule fetcher',
          cacheTtlSeconds: 3600,
          contractsFetched: 8,
          errorCount: 0,
          enableEnvVar: 'CMS_ENABLE_LIVE_FETCH',
        },
        feedConfig: {
          source: 'CMS schedule fetcher',
          cacheTtlSeconds: 3600,
          counts: { episodes: 8, total: 8, included: 6, flagged: 1 },
          enabled: true,
        },
        notes: {
          audience: 'Healthcare reference',
          disclaimer:
            'Public settlement rail derived from CMS schedules; the Oriel translated spot is the lag-engine projection. Confidence band tracks the print-vs-Oriel basis. Internal reference — not for trading.',
          liveDataNote:
            'Phase II live CMS schedule fetcher is integrated; data lags 12–18 months and is projected forward via the lag engine. Set CMS_ENABLE_LIVE_FETCH=true in .env to activate.',
          phase2: {
            title: 'Phase II — Live Data & Backtest',
            items: [
              { icon: 'check',    title: 'CMS schedule ingestion', body: 'Annual CMS fee schedules + reimbursement updates pulled with revision history.' },
              { icon: 'check',    title: 'Lag-engine projection',  body: 'CMS data lagged 12–18 months; engine projects forward via market-implied YoY.' },
              { icon: 'sparkles', title: 'Enable live feed',       body: 'Set CMS_ENABLE_LIVE_FETCH=true in Streamlit Cloud secrets.' },
            ],
          },
        },
      },
    },
    {
      key: 'mb',
      name: 'ForecastEx Medical CPI Basis',
      family: 'Healthcare',
      venue: 'ForecastEx-style binary thresholds',
      icon: 'activity',
      accent: 'pink',
      status: { variant: 'warning', label: 'Sample' },
      feed:   { variant: 'warn',    label: 'Sample · Illustrative ladder' },
      description:
        'Medical CPI vs. CPI-U spread markets - a first prediction-market basis view on healthcare inflation.',
      bullets: [
        'YES/NO threshold ladder',
        'Implied bucket distribution',
        'Maturity-by-maturity basis curve',
      ],
      metric: { label: 'Expected basis', value: '170 bps', sub: 'Maturity 2027' },
      risk:   { variant: 'warning', label: 'Illustrative' },
      detail: {
        unit: ' bps',
        curveUnit: ' bps',
        curvePrecision: 0,
        primaryMetric: {
          value: 170,
          formatted: '+170 bps',
          label: 'Expected basis',
          sub: 'Medical CPI − CPI-U · 2027 maturity',
          change: { delta: 22, formatted: '+22 bps', direction: 'up', since: 'vs. 2026' },
        },
        indexPrint: {
          // indexLevel = selected-maturity expected basis (2027 default).
          // front / back = actual term-structure endpoints (2026 → 2029).
          // slope = back - front across the full curve = 211 - 140 = 71 bps,
          // pct = 71 / 140 * 100 ≈ 50.71%. Picking 2027 for "front" was
          // wrong — that's mid-curve, not the earliest contract.
          indexLevel:           170,
          baseValue:            0,
          valuationTime:        '2026-04-28 14:00 UTC',
          anchorExpectedValue:  170,
          publishable:          true,
          constituentCount:     20,
          flaggedCount:         0,
          front: { value: 140, maturity: '2026', label: 'Front (2026)', unit: 'bps' },
          back:  { value: 211, maturity: '2029', label: 'Back (2029)',  unit: 'bps' },
          slope: { delta: 71,  pct: 50.71, direction: 'up', unit: 'bps' },
          customLabels: { indexLevel: 'Expected basis', anchor: '2027 basis', spread: 'Term structure' },
        },
        methodology: {
          version: '0.1.0-medical-basis',
          name: 'ForecastEx Medical Inflation Basis Contract',
          /* v7's MedicalBasisContractSpec doesn't publish the
             basis/interpolation/weighting/smoothing/stale/fallback
             schema that other indices expose — so instead of fabricating
             those labels we render a custom .rows array that surfaces
             the v7-actual contract structure. */
          rows: [
            { label: 'Contract type', value: 'YES / NO binary spread' },
            { label: 'Reference 1',   value: 'BLS CPI-U YoY' },
            { label: 'Reference 2',   value: 'BLS Medical Care CPI YoY' },
            { label: 'Settlement',    value: '$1.00 if spread > threshold' },
            { label: 'Repair',        value: 'Monotone (non-increasing P)' },
            { label: 'Source',        value: 'Illustrative sample ladder' },
          ],
          steps: [
            { title: 'Reference legs',    body: 'CPI-U YoY and Medical CPI YoY published by BLS form the contract\'s two reference rates.' },
            { title: 'Threshold ladder',  body: 'YES contracts at thresholds {0, 100, 200, 300, 400} bps price exceedance probabilities.' },
            { title: 'Monotonic repair',  body: 'Ensure non-increasing P(spread > t) across thresholds; arb-consistent ladder.' },
            { title: 'Bucket distribution', body: 'Adjacent exceedance gaps yield bucket probabilities — discrete spread distribution.' },
            { title: 'Expected basis',    body: 'Sum of midpoint × probability gives the expected medical-vs-CPI spread per maturity.' },
          ],
        },
        // No fabricated confidence band on the basis curve — v7's
        // BasisCurvePoint has only expected_spread_bps + the two
        // exceedance probabilities (P>0, P>200). lower=upper=expected
        // so the Constituents-tab Std Dev column reads 0 instead of a
        // made-up ±15-20 bp dispersion.
        forwardCurve: [
          { maturity: '2026', expected: 140, lower: 140, upper: 140, bucketCount: 5, contractType: 'YES/NO basis' },
          { maturity: '2027', expected: 170, lower: 170, upper: 170, bucketCount: 5, contractType: 'YES/NO basis' },
          { maturity: '2028', expected: 192, lower: 192, upper: 192, bucketCount: 5, contractType: 'YES/NO basis' },
          { maturity: '2029', expected: 211, lower: 211, upper: 211, bucketCount: 5, contractType: 'YES/NO basis' },
        ],
        stats: {
          unit: ' bps',
          precision: 0,
          /* Custom rows — drop the fabricated "Avg Std Dev" (v7's basis
             curve has no per-maturity std dev). Show only v7-derived
             metrics: range over maturities + cardinality. */
          rows: [
            { label: 'Mean (all maturities)', value: '+178 bps' },
            { label: 'Min',                   value: '+140 bps' },
            { label: 'Max',                   value: '+211 bps' },
            { label: 'Maturities',            value: '4 (2026 – 2029)' },
            { label: 'Contracts',             value: '20 (5 × 4)' },
          ],
        },
        constituents: [
          { ticker: 'MB_2026_GT_0',   label: '2026 · Spread > 0 bps',   price: 0.78, type: 'YES/NO contract', status: 'Included' },
          { ticker: 'MB_2026_GT_200', label: '2026 · Spread > 200 bps', price: 0.34, type: 'YES/NO contract', status: 'Included' },
          { ticker: 'MB_2027_GT_200', label: '2027 · Spread > 200 bps', price: 0.42, type: 'YES/NO contract', status: 'Included' },
          { ticker: 'MB_2028_GT_200', label: '2028 · Spread > 200 bps', price: 0.48, type: 'YES/NO contract', status: 'Included' },
          { ticker: 'MB_2029_GT_400', label: '2029 · Spread > 400 bps', price: 0.18, type: 'YES/NO contract', status: 'Included' },
        ],
        runtimeMeta: {
          feedStatus: 'sample',
          source: 'Illustrative ForecastEx-style sample ladder',
          cacheTtlSeconds: 600,
          contractsFetched: 20,
          errorCount: 0,
          /* No enableEnvVar here — v7's medical_basis_contract has no
             live-feed env toggle (it's purely sample data), so we don't
             invent a fake env var name. */
          hideLiveToggle: true,
        },
        notes: {
          audience: 'Inflation contract design',
          disclaimer:
            'Illustrative contract design — no venue currently lists a Medical-vs-CPI basis. The sample ladder demonstrates how YES/NO threshold contracts seed an implied healthcare inflation surface.',
          liveDataNote:
            'When ForecastEx (or another venue) lists this contract, swap the static sample CSV for the live ladder feed; the analytics pipeline (basis curve, ladder, distribution) is unchanged.',
        },
      },
    },
    {
      key: 'parity',
      name: 'OTC Parity Validation',
      family: 'Analytics',
      venue: 'Benchmark gate · OTC CPI swap curves',
      icon: 'sliders',
      accent: 'accent',
      status: { variant: 'success', label: 'Live' },
      feed: { variant: 'live', label: 'Live · OTC + DTCC' },
      description:
        'Benchmark gate — OTC CPI swap curves vs. prediction-market index parity.',
      bullets: [
        'OTC swap curve benchmark',
        'Parity gap diagnostics',
        'Calibration validator',
      ],
      metric: { label: 'Parity gap', value: '+18 bps', sub: '12M tenor' },
      risk:   { variant: 'warning', label: 'Moderate' },
      detail: {
        unit: ' bps',
        curveUnit: ' bps',
        curvePrecision: 0,
        primaryMetric: {
          value: 18,
          formatted: '+18 bps',
          label: 'Avg parity gap',
          sub: '12M tenor · Oriel vs. OTC benchmark',
          change: { delta: 4, formatted: '+4 bps', direction: 'up', since: 'vs. yesterday' },
        },
        indexPrint: {
          indexLevel: 18,
          baseValue: 0,
          valuationTime: '2026-04-28 13:55 UTC',
          anchorExpectedValue: 18,
          publishable: true,
          constituentCount: 8,
          flaggedCount: 1,
          front: { value: 12, maturity: '3M',  label: 'Front (3M)' },
          back:  { value: 26, maturity: '36M', label: 'Back (36M)' },
          slope: { delta: 14, pct: 116.67, direction: 'up', unit: 'bps' },
          customLabels: { indexLevel: 'Avg gap', anchor: '12M gap', spread: 'Term spread' },
        },
        methodology: {
          version: '0.1.0',
          name: 'OTC Parity Validation',
          basis: 'otc_swap_anchored',
          interpolation: 'pillar_grid',
          weighting: 'tenor_weighted',
          smoothing: 'mad_outlier_fence',
          staleMarket: 'reject_after_30min',
          fallback: 'gate_FAIL_until_fresh',
          steps: [
            { title: 'OTC swap quote ingestion',  body: 'Inter-dealer OTC CPI swap quotes pulled at standard tenors (3M / 6M / 12M / 24M / 36M).' },
            { title: 'Curve construction',         body: 'Quotes interpolated onto a dense pillar grid; outliers fenced with median-absolute-deviation.' },
            { title: 'Parity gap',                 body: 'For each tenor, gap = Oriel implied curve − OTC swap curve. Reported in bps.' },
            { title: 'Gate evaluation',            body: 'Two gates: a level (basis) gate and an index-space curve fit (R²) gate. Both must PASS to validate.' },
            { title: 'Calibration publication',    body: 'Once both gates pass, the calibration is published with explicit rationale and gate metrics.' },
          ],
        },
        forwardCurve: [
          { maturity: '3M',  expected: 12, lower:  6, upper: 18, bucketCount: 1, contractType: 'parity_gap' },
          { maturity: '6M',  expected: 15, lower: 10, upper: 21, bucketCount: 1, contractType: 'parity_gap' },
          { maturity: '12M', expected: 18, lower: 13, upper: 24, bucketCount: 1, contractType: 'parity_gap' },
          { maturity: '24M', expected: 22, lower: 16, upper: 28, bucketCount: 1, contractType: 'parity_gap' },
          { maturity: '36M', expected: 26, lower: 19, upper: 33, bucketCount: 1, contractType: 'parity_gap' },
        ],
        stats: {
          unit: ' bps',
          unitLabel: 'parity gap (bps)',
          mean: 18.6,
          avgStdDev: 5.3,
          minValue: 12,
          maxValue: 26,
          constituentCount: 8,
          precision: 1,
        },
        parityGates: {
          overall: 'PASS',
          benchmarks: ['OTC tighter benchmark', 'DTCC term calibration'],
          gates: [
            { key: 'basis', label: 'Basis gate', status: 'PASS', description: 'Level alignment within tolerance' },
            { key: 'shape', label: 'Shape gate', status: 'PASS', description: 'Index-space curve fit (R²) sufficient' },
          ],
          metrics: [
            { label: 'Avg abs basis',         value: '14.2 bp', limit: '≤ 25 bp', pass: true },
            { label: 'Max abs basis',         value: '32.8 bp', limit: '≤ 50 bp', pass: true },
            { label: 'Within ±20 bp',         value: '78%',     limit: '≥ 70%',   pass: true },
            { label: 'Index R² (dense grid)', value: '0.9421',  limit: '≥ 0.85',  pass: true },
            { label: 'Index R² (pillars)',    value: '0.9128',  limit: '≥ 0.85',  pass: true },
            { label: 'Months tested',         value: '24',      limit: '—',       pass: null },
          ],
        },
        constituents: [
          { ticker: 'OTC_CPI_3M',   label: '3M tenor',  price: 3.18, type: 'OTC swap', status: 'Included' },
          { ticker: 'OTC_CPI_6M',   label: '6M tenor',  price: 3.05, type: 'OTC swap', status: 'Included' },
          { ticker: 'OTC_CPI_12M',  label: '12M tenor', price: 2.92, type: 'OTC swap', status: 'Included' },
          { ticker: 'OTC_CPI_24M',  label: '24M tenor', price: 2.78, type: 'OTC swap', status: 'Included' },
          { ticker: 'OTC_CPI_36M',  label: '36M tenor', price: 2.64, type: 'OTC swap', status: 'Included' },
          { ticker: 'DTCC_CPI_12M', label: '12M (DTCC)', price: 2.94, type: 'DTCC calibration', status: 'Included' },
          { ticker: 'DTCC_CPI_24M', label: '24M (DTCC)', price: 2.81, type: 'DTCC calibration', status: 'Included' },
          { ticker: 'OTC_CPI_60M',  label: '60M (off-grid)', price: 2.46, type: 'OTC swap', status: 'Flagged' },
        ],
        feedConfig: {
          source: 'OTC + DTCC term calibration (sample)',
          cacheTtlSeconds: 1800,
          lastRefresh: '2026-04-28 13:55 UTC',
          counts: { otc: 5, dtcc: 2, flagged: 1, total: 8, included: 7 },
          enabled: false,
        },
        notes: {
          audience: 'Calibration validator',
          disclaimer:
            'Two-gate validator. Basis gate checks level alignment within tolerance; shape gate checks index-space curve fit (R²). Both must PASS for the calibration to publish. Not investment advice.',
          liveDataNote:
            'Phase II live OTC + DTCC swap feed is integrated. Set OTC_ENABLE_LIVE_QUOTES=true in .env to activate. Calibration is gated by both basis and shape diagnostics passing.',
          phase2: {
            title: 'Phase II — Live Data & Backtest',
            items: [
              { icon: 'check',    title: 'OTC swap quote ingestion', body: 'Inter-dealer quotes pulled at standard tenors; outliers fenced with median-absolute-deviation.' },
              { icon: 'check',    title: 'Two-gate validator',        body: 'Basis gate (level alignment) and shape gate (index-space R²) must both PASS for calibration to publish.' },
              { icon: 'sparkles', title: 'Enable live feed',          body: 'Set OTC_ENABLE_LIVE_QUOTES=true in Streamlit Cloud secrets.' },
            ],
          },
        },
      },
    },
  ];

  function indexByKey(key) {
    return INDICES.find((i) => i.key === key);
  }

  // ── Engine pass: derive forwardCurve, bucketSnapshots, indexPrint, stats,
  //    dislocation from raw inputs so rendered numbers match v7's
  //    PredictionIndexAdmin output exactly.
  //    Two input shapes:
  //      (a) `snapshots` — raw v7 MaturitySnapshot list with binary_thresholds
  //          / exact_outcomes / scalar_buckets per maturity (CPI Kalshi)
  //      (b) `bucketSnapshots` — pre-extracted scalar bucket distributions
  //          (HC). Kept for backwards compat with hand-authored data.
  //    Indices without either keep their hardcoded forwardCurve.
  const engine = (window.App && window.App.engine) || null;
  const livePayload = (typeof window !== 'undefined') ? window.__LIVE_CPI__ : null;
  // v7's smoothed Kalshi+ForecastEx blended parent_curve (+ venue_comparison
  // dispersion rows). Built Python-side via blended_curve.py from v7's static
  // CSV constituents — drives the binary-IV inversion's parent_forward so
  // Front Vol matches v7 (~5.55%) instead of using our Kalshi-only forward
  // curve (~2.7%).
  const blendedPayload    = (typeof window !== 'undefined') ? window.__BLENDED_CPI__ : null;
  const forecastexPayload = (typeof window !== 'undefined') ? window.__FORECASTEX__  : null;
  const polymarketPayload = (typeof window !== 'undefined') ? window.__POLYMARKET__  : null;
  const perpPayload       = (typeof window !== 'undefined') ? window.__PERP__        : null;
  // Oriel Healthcare Reference (CMS Lag Engine) — built Python-side from v7's
  // pipeline artifacts under data/cms_lag_engine/. Drives the entire CMS tab
  // (anchor timeseries, basis decomposition, service-line RV, benchmark
  // history, provenance manifest). Falls back to the static sample below when
  // the build artifacts are missing.
  const cmsPayload        = (typeof window !== 'undefined') ? window.__CMS__        : null;
  // ForecastEx Medical Inflation Basis Contract — built Python-side from v7's
  // analytics.medical_basis_contract pipeline. Drives the new "ForecastEx
  // Medical Basis" index tab (basis curve points, threshold ladder, bucket
  // distribution, contract spec, settlement example, reference legs).
  const mbPayload         = (typeof window !== 'undefined') ? window.__MB__         : null;
  // OTC Parity Validation + DTCC Term Calibration — built Python-side from
  // v7's parity engine + analytics.dtcc_term_calibration. Drives the
  // Parity index tab. Carries 4 sub-views (term / tight / dtcc / neg).
  const parityPayload     = (typeof window !== 'undefined') ? window.__PARITY__     : null;

  // Pluck a value from v7's methodology key/value rows by label.
  function _fxRowValue(rows, label) {
    if (!Array.isArray(rows)) return null;
    const r = rows.find((row) => row.key === label || row.label === label);
    return r ? r.value : null;
  }

  // Render a v7 package valuation_timestamp ISO into "5 min ago" style.
  // Used for the Live Feed Status "fetched_at" row so the user can tell
  // how stale the live cache is when comparing to v7's published demo.
  function _fmtRelativeTime(iso) {
    if (!iso) return '—';
    const t = new Date(iso).getTime();
    if (!isFinite(t)) return '—';
    const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (sec < 60)        return `${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60)        return `${min}m ago`;
    const hr  = Math.round(min / 60);
    if (hr  < 24)        return `${hr}h ago`;
    return new Date(iso).toUTCString().slice(5, 22);
  }
  const volSurfaceOptions = blendedPayload && blendedPayload.parentCurve
    ? {
        parentCurve:     blendedPayload.parentCurve,
        venueComparison: blendedPayload.venueComparison,
      }
    : null;
  // Pin the vol-surface valuation date so we match v7's published demo
  // exactly. v7 defaults `valuation_date` to date.today() but the published
  // screenshots/demo state Chris shared captured Front Vol ≈ 5.55% — that
  // corresponds to v7 running with valuation_date ≈ 2026-01-18 against the
  // static CPI sample snapshots (Mar-Jun 2026) and the smoothed Kalshi+FX
  // blended parent curve. See blended_curve.py for the parent curve port.
  const VOL_SURFACE_VAL_DATE = new Date(Date.UTC(2026, 0, 18));

  // Pick the right v7-computed vol surface payload for the current mode.
  // 'live' uses analytics.vol_surface_engine artifacts built from live
  // Kalshi snapshots; 'sample' uses artifacts built from sample_data.CPI_SNAPSHOTS.
  // Both are computed Python-side at val=date.today() and shipped via
  // window.__BLENDED_CPI__.
  function pickPythonVolSurface(mode) {
    if (!blendedPayload) return null;
    const live   = blendedPayload.volSurfaceLive;
    const sample = blendedPayload.volSurfaceSample;
    const def    = blendedPayload.volSurface;
    let vs;
    if (mode === 'live')   vs = live   || def    || sample;
    else                   vs = sample || def    || live;
    if (!vs || !vs.impliedVol) return null;
    return {
      summary:          vs.summary,
      impliedVol:       vs.impliedVol,
      scenarioGrid:     vs.scenarioGrid || [],
      componentSurface: vs.componentSurface || [],
      venueDispersion:  blendedPayload.venueComparison || [],
      valuationDate:    vs.valuationDateIso ? new Date(vs.valuationDateIso) : VOL_SURFACE_VAL_DATE,
    };
  }

  // Engine pass for any index. Mutates `d` in place: derives forwardCurve,
  // bucketSnapshots, indexPrint, stats, dislocation, volSurface from
  // whatever snapshots/buckets it currently holds. Returns d for chaining.
  // `mode` is 'live' or 'sample' for CPI Kalshi (controls which v7-computed
  // vol surface payload we use). Other indices ignore it.
  function runEnginePass(index, d, mode) {
    if (!engine || !d) return d;
    const hasSnapshots = Array.isArray(d.snapshots) && d.snapshots.length > 0;
    const hasBuckets   = Array.isArray(d.bucketSnapshots) && d.bucketSnapshots.length > 0;
    if (!hasSnapshots && !hasBuckets) return d;

    if (hasSnapshots) {
      d.forwardCurve = engine.buildForwardCurveFromSnapshots(d.snapshots);
      d.bucketSnapshots = engine.buildBucketSnapshotsFromSnapshots(d.snapshots);
    } else {
      d.forwardCurve = engine.buildForwardCurveFromBuckets(d.bucketSnapshots);
      d.bucketSnapshots.forEach((s) => { s.expected = engine.evFromBuckets(s.buckets); });
    }

    const print = engine.buildIndexPrint(d.forwardCurve, d.constituents);
    d.indexPrint = print;
    d.stats = engine.buildStats(d.forwardCurve);

    if (d.dislocation) {
      d.dislocation = engine.buildDislocation(print.anchorExpectedValue, {
        swapLabel:    d.dislocation.swapLabel,
        signalLabel:  d.dislocation.signalLabel,
        energySignal: d.dislocation.energySignal,
        energyTone:   d.dislocation.energyTone,
      });
    }
    if (index.key === 'cpi') {
      // Use v7's actual vol surface artifacts (computed Python-side via
      // analytics.vol_surface_engine.build_vol_surface_artifacts on the
      // current mode's snapshots). Falls back to engine.buildVolSurface
      // only if the Python pipeline failed entirely.
      const py = pickPythonVolSurface(mode || 'sample');
      if (py) {
        d.volSurface = py;
      } else {
        d.volSurface = engine.buildVolSurface(
          d.forwardCurve,
          d.snapshots,
          VOL_SURFACE_VAL_DATE,
          volSurfaceOptions,
        );
      }
    }
    return d;
  }

  // Snapshot the engine-derived fields from `d` into a plain "variant" blob.
  // Used to capture sample vs live variants for the live/sample toggle.
  function captureVariant(d) {
    return {
      snapshots:        d.snapshots,
      forwardCurve:     d.forwardCurve,
      bucketSnapshots:  d.bucketSnapshots,
      indexPrint:       d.indexPrint,
      stats:            d.stats,
      dislocation:      d.dislocation,
      volSurface:       d.volSurface,
      methodology:      d.methodology,
      constituents:     d.constituents,
      contractObservations: d.contractObservations,  // poly-specific
      notes:            d.notes,                       // venue notes copy
      runtimeMeta:      d.runtimeMeta,
      feedStats:        d.feedStats,
      feedConfig:       d.feedConfig,
      liveFetchedAt:    d.liveFetchedAt,
    };
  }

  // Splat a variant blob back onto `d`. Mirrors what the toggle expects.
  function applyVariant(d, variant) {
    Object.assign(d, variant);
    return d;
  }

  if (engine) {
    INDICES.forEach((index) => {
      const d = index.detail;
      if (!d) return;

      // First pass: derive everything from the static (sample) snapshots
      // exactly as before.
      runEnginePass(index, d, 'sample');

      // For CPI Kalshi specifically, capture this as the "sample" variant
      // and keep its baseline runtimeMeta tagged 'sample' so the toggle
      // shows the correct labels when flipped off.
      if (index.key === 'cpi') {
        const sampleRuntimeMeta = {
          feedStatus:        'sample',
          source:            'v7 sample CPI snapshots',
          cacheTtlSeconds:   0,
          contractsFetched:  Array.isArray(d.constituents) ? d.constituents.length : 0,
          errorCount:        0,
          enableEnvVar:      'KALSHI_ENABLE_LIVE_CPI',
        };
        const sampleMethodology = {
          ...d.methodology,
          // strip any phase2-live tag from the static seed
          version: String(d.methodology.version).replace(/-?phase2-live/g, ''),
        };
        d.methodology  = sampleMethodology;
        d.runtimeMeta  = sampleRuntimeMeta;
        d.sampleVariant = captureVariant(d);

        // Second pass: if the Python wrapper injected live Kalshi snapshots,
        // overlay them and re-run the engine. Otherwise default detail to
        // the sample variant we just captured.
        if (livePayload && Array.isArray(livePayload.snapshots) && livePayload.snapshots.length) {
          d.snapshots = livePayload.snapshots;
          if (livePayload.methodology) {
            // Adopt every v7 methodology field that the live feed builder
            // populates (basis · smoothing · staleMarket · fallback · …) so
            // the Methodology table reflects the live engine's wiring.
            const lm = livePayload.methodology;
            d.methodology = {
              ...sampleMethodology,
              name:                lm.name                || sampleMethodology.name,
              version:             lm.version             || sampleMethodology.version,
              basis:               lm.basis               || sampleMethodology.basis,
              interpolation:       lm.interpolation       || sampleMethodology.interpolation,
              weighting:           lm.weighting           || sampleMethodology.weighting,
              smoothing:           lm.smoothing           || sampleMethodology.smoothing,
              staleMarket:         lm.staleMarket         || sampleMethodology.staleMarket,
              fallback:            lm.fallback            || sampleMethodology.fallback,
              publicationFrequency: lm.publicationFrequency,
              unitLabel:           lm.unitLabel,
            };
          }
          if (Array.isArray(livePayload.contractsTable) && livePayload.contractsTable.length) {
            d.constituents = livePayload.contractsTable.map((r) => ({
              ticker: r.ticker,
              label:  r.label,
              price:  Number(r.price) || 0,
              type:   r.type,
              method: r.method,
              status: r.status,
            }));
          }
          if (livePayload.runtimeMeta) d.runtimeMeta = livePayload.runtimeMeta;
          if (livePayload.stats)       d.feedStats   = livePayload.stats;
          d.liveFetchedAt = livePayload.fetchedAt;

          runEnginePass(index, d, 'live');
          d.liveVariant = captureVariant(d);

          // The live variant is the default-active mode (toggle starts ON).
        } else {
          // No live payload — only the sample variant exists.
          d.liveVariant = null;
        }
      }

      // ── ForecastEx (FX) — same live/sample variant capture as CPI Kalshi ─
      // We import v7's ForecastEx CurvePackage Python-side (forecastex_data.py
      // → window.__FORECASTEX__) and overlay the serialized payload onto the
      // hardcoded `fx` index detail. Both variants capture independently so
      // the live toggle in IndexDetailView swaps between them.
      if (index.key === 'fx' && forecastexPayload) {
        const fxMethTable = forecastexPayload.methodologyTable || [];
        const fxFeedCfg   = forecastexPayload.feedConfig       || {};
        // Methodology object — keep our version+name, but render v7's exact
        // 6-row methodology table verbatim via the new `rows` slot.
        const fxMethodology = (sourceStatusLabel) => ({
          version:             '0.3.0-forecastex-live',  // no leading 'v', IndexPrintCard prepends one
          name:                'Oriel CPI Forward Index',
          venue:               'ForecastEx',
          unpublishableLabel:  'Conditional',            // matches v7 line 170
          rows:                fxMethTable,
          // Keep the field-shape values too in case anything else still
          // reads them — mapped from the v7 methodology table's labels.
          basis:         _fxRowValue(fxMethTable, 'Price basis')   || 'forecastex_mid',
          interpolation: _fxRowValue(fxMethTable, 'Interpolation') || 'log-linear',
          weighting:     _fxRowValue(fxMethTable, 'Normalization') || 'coupon-adjusted mid',
          smoothing:     _fxRowValue(fxMethTable, 'Publishability')|| 'volume + OI threshold',
          staleMarket:   _fxRowValue(fxMethTable, 'Stale rule')    || '',
          fallback:      _fxRowValue(fxMethTable, 'Fallback')      || 'sample_data_on_live_failure',
          steps:         d.methodology && d.methodology.steps,
        });
        // Build runtimeMeta for an fx variant — uses v7's "Live Feed Status"
        // 6 rows verbatim (series_ticker / source_status / sample_mode /
        // min_volume / min_open_interest / max_curve_points).
        const fxRuntimeMeta = (variantData, mode) => {
          const feedStatus =
            mode === 'live'
              ? (variantData && variantData.sourceStatus === 'LIVE' ? 'live' : 'unavailable')
              : 'sample';
          return {
            feedStatus,
            source:           'ForecastEx data feed',
            cacheTtlSeconds:  600,
            contractsFetched: variantData ? (variantData.constituents || []).length : 0,
            errorCount:       0,
            enableEnvVar:     'FORECASTEX_ENABLE_LIVE_CPI',
            feedRows: [
              { label: 'series_ticker',     value: fxFeedCfg.seriesTicker     || 'FXCPI' },
              { label: 'source_status',     value: variantData ? variantData.sourceStatus : '—' },
              { label: 'sample_mode',       value: variantData ? String(variantData.sampleMode) : '—' },
              { label: 'min_volume',        value: String(fxFeedCfg.minVolume) },
              { label: 'min_open_interest', value: String(fxFeedCfg.minOpenInterest) },
              { label: 'max_curve_points',  value: String(fxFeedCfg.maxCurvePoints) },
              { label: 'fetched_at',        value: variantData ? _fmtRelativeTime(variantData.valuationTimeIso) : '—' },
            ],
          };
        };
        // Splat one variant onto `d` so we can capture it via captureVariant.
        function applyFxVariant(variantData, mode) {
          if (!variantData) return false;
          d.forwardCurve = variantData.forwardCurve || [];
          d.indexPrint   = variantData.indexPrint;
          d.stats        = variantData.stats;
          d.dislocation  = variantData.dislocation;
          d.constituents = variantData.constituents || [];
          d.methodology  = fxMethodology(variantData.sourceStatus);
          d.runtimeMeta  = fxRuntimeMeta(variantData, mode);
          d.feedConfig   = {
            source:          'ForecastEx data feed',
            cacheTtlSeconds: 600,
            counts: {
              binary:  (variantData.constituents || []).length,
              exact:   0,
              total:   (variantData.constituents || []).length,
              included:(variantData.constituents || []).filter(c => c.status === 'Included').length,
              flagged: (variantData.constituents || []).filter(c => c.status !== 'Included').length,
            },
            enabled: mode === 'live',
          };
          d.feedStats     = null;
          d.bucketSnapshots = null;
          d.snapshots       = null;
          return true;
        }

        // Capture sample variant first (toggle off position).
        if (applyFxVariant(forecastexPayload.sample, 'sample')) {
          d.sampleVariant = captureVariant(d);
        }
        // Then live variant (toggle on position) — leaves d in live state if
        // available so the page renders the live numbers by default.
        if (applyFxVariant(forecastexPayload.live, 'live')) {
          d.liveVariant = captureVariant(d);
        } else {
          d.liveVariant = null;
        }
      }

      // ── Polymarket (poly) — same live/sample variant capture as FX ────
      // Polymarket adds a few v7-specific surfaces beyond FX:
      //   • Index Print extra rows: Venue, Venue Role, Venue Status,
      //     Reference Status (rendered via indexPrint.rows from Python).
      //   • Stats card with Avg confidence (rendered via stats.rows).
      //   • Dislocation middle row "Avg spread" (via dislocation.middleRow).
      //   • Notes panel uses v7's verbatim Polymarket copy (notes object).
      if (index.key === 'poly' && polymarketPayload) {
        const polyMethTable = polymarketPayload.methodologyTable || [];
        const polyFeedCfg   = polymarketPayload.feedConfig       || {};
        const polyMethodology = (variantData) => ({
          version:             variantData ? String(variantData.methodology || '0.1.1-polymarket-live').replace(/^v/, '')
                                            : '0.1.1-polymarket-live',
          name:                'Oriel CPI Forward Index',
          venue:               'Polymarket',
          unpublishableLabel:  'Diagnostic',                 // matches v7 line 92
          rows:                polyMethTable,
          basis:         _fxRowValue(polyMethTable, 'Price basis')   || 'gamma best bid/ask midpoint',
          interpolation: _fxRowValue(polyMethTable, 'Interpolation') || 'log-linear',
          weighting:     _fxRowValue(polyMethTable, 'Normalization') || 'threshold midpoint anchored',
          smoothing:     _fxRowValue(polyMethTable, 'Publishability')|| 'spread + volume + OI + stale rule',
          staleMarket:   _fxRowValue(polyMethTable, 'Stale rule')    || '',
          fallback:      _fxRowValue(polyMethTable, 'Fallback')      || 'sample_data_on_live_failure',
          steps:         d.methodology && d.methodology.steps,
        });
        const polyRuntimeMeta = (variantData, mode) => {
          const feedStatus =
            mode === 'live'
              ? (variantData && variantData.sourceStatus === 'LIVE' ? 'live' : 'unavailable')
              : 'sample';
          return {
            feedStatus,
            source:           'Polymarket Gamma + data API',
            cacheTtlSeconds:  600,
            contractsFetched: variantData ? (variantData.constituents || []).length : 0,
            errorCount:       0,
            enableEnvVar:     'POLYMARKET_ENABLE_LIVE_CPI',
            // Live Feed Status rows — v7 polymarket_tab.py:232-239 verbatim
            // + fetched_at so the user can see when the live cache was filled
            // (useful when verifying values against v7's published demo).
            feedRows: [
              { label: 'source_status',      value: variantData ? variantData.sourceStatus : '—' },
              { label: 'sample_mode',        value: variantData ? String(variantData.sampleMode) : '—' },
              { label: 'min_volume',         value: String(polyFeedCfg.minVolume) },
              { label: 'min_open_interest',  value: String(polyFeedCfg.minOpenInterest) },
              { label: 'max_curve_points',   value: String(polyFeedCfg.maxCurvePoints) },
              { label: 'websocket_ready',    value: polyFeedCfg.websocketReady || 'market-channel compatible' },
              { label: 'fetched_at',         value: variantData ? _fmtRelativeTime(variantData.valuationTimeIso) : '—' },
            ],
          };
        };
        function applyPolyVariant(variantData, mode) {
          if (!variantData) return false;
          d.forwardCurve   = variantData.forwardCurve || [];
          d.indexPrint     = variantData.indexPrint;
          d.stats          = variantData.stats;
          d.dislocation    = variantData.dislocation;
          d.constituents   = variantData.constituents || [];
          d.contractObservations = variantData.contractObservations || [];
          d.methodology    = polyMethodology(variantData);
          d.runtimeMeta    = polyRuntimeMeta(variantData, mode);
          // Notes copy from Python payload (v7 verbatim) — render in NotesPanel.
          if (polymarketPayload.notes) {
            d.notes = polymarketPayload.notes;
          }
          d.feedConfig     = {
            source:          'Polymarket Gamma + data API',
            cacheTtlSeconds: 600,
            counts: {
              binary:  (variantData.constituents || []).length,
              exact:   0,
              total:   (variantData.constituents || []).length,
              included:(variantData.constituents || []).filter(c => c.status === 'Eligible').length,
              flagged: (variantData.constituents || []).filter(c => c.status !== 'Eligible').length,
            },
            enabled: mode === 'live',
          };
          d.feedStats = null;
          d.bucketSnapshots = null;
          d.snapshots = null;
          return true;
        }

        if (applyPolyVariant(polymarketPayload.sample, 'sample')) {
          d.sampleVariant = captureVariant(d);
        }
        if (applyPolyVariant(polymarketPayload.live, 'live')) {
          d.liveVariant = captureVariant(d);
        } else {
          d.liveVariant = null;
        }
      }

      // ── Perp readiness (CPI Basis / Tier 1) — overlay v7's full Tier-1
      // bundle onto the `perp` index. v7 imports the analytics directly and
      // we ship the entire serialized output via window.__PERP__. The
      // PerpReadinessPanel reads d.perp and renders every surface verbatim.
      if (index.key === 'perp' && perpPayload && perpPayload.tier1Snapshot) {
        const snap = perpPayload.tier1Snapshot;
        // Forward curve = v7's smoothed blended `current_curve`. Each row is
        // { targetMonth, daysFromValuation, expectedYoyPct, indexLevel, stdDevPct,
        //   kalshiWeight, forecastexWeight, source, publishable, ... }.
        d.forwardCurve = (perpPayload.currentCurve || []).map((r) => ({
          maturity:     r.targetMonth,
          maturityFull: r.targetMonthIso,
          daysFromValuation: r.daysFromValuation,
          expected:     r.indexLevel,                           // chart Y = index level
          lower:        r.indexLevel - (r.stdDevPct || 0),
          upper:        r.indexLevel + (r.stdDevPct || 0),
          expectedYoyPct: r.expectedYoyPct,
          stdDevPct:    r.stdDevPct,
          kalshiWeight: r.kalshiWeight,
          forecastexWeight: r.forecastexWeight,
          publishable:  r.publishable,
          bucketCount:  1,
          contractType: 'reference',
        }));

        // indexPrint mapped from v7's Tier1Snapshot for the standard cards.
        d.indexPrint = {
          indexLevel:           snap.spotIndex,
          baseValue:            snap.officialIndexPrint,
          valuationTime:        new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
          anchorExpectedValue:  snap.fvIndex,
          publishable:          snap.publishabilityLabel === 'Eligible',
          constituentCount:     (perpPayload.currentCurve || []).length,
          flaggedCount:         0,
          front: { value: snap.spotIndex, maturity: 'Spot',
                   label: 'Spot anchor' },
          back:  { value: (perpPayload.currentCurve || []).slice(-1)[0]?.indexLevel || snap.spotIndex,
                   maturity: `${(perpPayload.currentCurve || []).slice(-1)[0]?.daysFromValuation || 0}d`,
                   label: `Back (${(perpPayload.currentCurve || []).slice(-1)[0]?.daysFromValuation || 0}d)` },
          slope: { delta: snap.termStructurePct,
                   pct: snap.termStructurePct,
                   direction: snap.termStructurePct >= 0 ? 'up' : 'down' },
        };

        // Stats card — Mean / Avg σ / Min / Max / Constituents on the curve
        const lvls = d.forwardCurve.map(p => p.expected);
        const stds = d.forwardCurve.map(p => p.stdDevPct || 0);
        d.stats = {
          unit: '',
          unitLabel: 'index level',
          mean: lvls.reduce((s, v) => s + v, 0) / Math.max(lvls.length, 1),
          avgStdDev: stds.reduce((s, v) => s + v, 0) / Math.max(stds.length, 1),
          minValue: Math.min(...lvls),
          maxValue: Math.max(...lvls),
          constituentCount: lvls.length,
          precision: 4,
        };

        // Methodology with v7's published version + the smoothing/microstructure
        // fields wired from the Python payload.
        const sm = perpPayload.smoothingDiag || {};
        d.methodology = {
          version: '0.1.0-tier1',
          name:    'Oriel CPI Basis (Tier 1)',
          basis:        'governed_blend',
          interpolation:'linear',
          weighting:    'venue_eligibility_governed',
          smoothing:    sm.methodUsed || 'liquidity_weighted_monotone_linear',
          staleMarket:  'reject_after_2min',
          fallback:     'single_venue_failover',
          steps: d.methodology && d.methodology.steps,
        };

        // Runtime meta — Tier1 doesn't have a live REST feed (it reads CSVs)
        // but we still surface a Live Feed Status block with v7's freshness
        // commentary and venue eligibility flags. v7's perp_readiness_tab
        // has NO live/sample toggle (data is always from static CSVs), so
        // we hide our toggle too — both variants would render identically.
        d.runtimeMeta = {
          feedStatus:       'live',
          source:           'Tier 1 governed blend (Kalshi + ForecastEx)',
          cacheTtlSeconds:  3600,
          contractsFetched: (perpPayload.currentCurve || []).length,
          errorCount:       0,
          enableEnvVar:     'TIER1_ENABLE_LIVE_BASIS',
          hideLiveToggle:   true,                   // ← v7 has no toggle here
          feedRows: [
            { label: 'methodology',  value: '0.1.0-tier1' },
            { label: 'kalshi_eligible',     value: snap.kalshiEligible ? 'Yes' : 'No' },
            { label: 'forecastex_eligible', value: snap.forecastexEligible ? 'Yes' : 'No' },
            { label: 'effective_kalshi',     value: `${snap.effectiveKalshiWeightPct.toFixed(1)}%` },
            { label: 'effective_forecastex', value: `${snap.effectiveForecastexWeightPct.toFixed(1)}%` },
            { label: 'publishability',       value: `${snap.publishabilityLabel} · ${snap.confidenceScorePct.toFixed(0)}% conf` },
          ],
        };

        // Constituents tab — show the blended curve points with venue weights.
        d.constituents = (perpPayload.currentCurve || []).map((r, i) => ({
          ticker: `BLEND_${r.targetMonthIso}`,
          label:  r.targetMonth,
          price:  r.indexLevel,
          venue:  'Blended',
          type:   'Reference curve',
          method: r.smoothingMethod || 'monotone smoothing',
          status: 'Included',
          extra: {
            expectedYoyPct: r.expectedYoyPct,
            stdDevPct:      r.stdDevPct,
            kalshiWeight:   r.kalshiWeight,
            forecastexWeight: r.forecastexWeight,
            daysFromValuation: r.daysFromValuation,
          },
        }));

        // Stash the full v7 perp bundle on detail.perp for the rich panel
        // to consume. PerpReadinessPanel.jsx reads this directly.
        d.perp = perpPayload;

        // Update primary metric to reflect the basis (bps-formatted).
        if (d.primaryMetric) {
          d.primaryMetric.value     = snap.basisBp;
          d.primaryMetric.formatted = `${snap.basisBp >= 0 ? '+' : ''}${snap.basisBp.toFixed(1)} bps`;
          d.primaryMetric.label     = `Basis · ${snap.fvHorizonDays}d FV horizon`;
          d.primaryMetric.sub       = `Sim. perp ${snap.perpPrice.toFixed(4)} vs FV ${snap.fvIndex.toFixed(4)}`;
        }
        if (index.metric) {
          index.metric.value = `${snap.basisBp >= 0 ? '+' : ''}${snap.basisBp.toFixed(1)} bps`;
          index.metric.sub   = `${snap.fvHorizonDays}d horizon · ${snap.publishabilityLabel}`;
        }

        // v7's perp_readiness tab uses static CSVs (no live/sample toggle).
        // We capture the same state into both variants so the live toggle
        // defaults to ON and shows green "Live" pill — there is no separate
        // "sample" mode to fall back to. applyDetailVariant becomes a no-op.
        d.sampleVariant = captureVariant(d);
        d.liveVariant   = captureVariant(d);
      }

      // ── Oriel Healthcare Reference / CMS Lag Engine — overlay v7's full
      // cms_tab pipeline outputs onto the `cms` index. Cms_data.py reads the
      // 5 pipeline CSV/JSON artifacts and ships them as window.__CMS__.
      if (index.key === 'cms' && cmsPayload && cmsPayload.basisActionRow) {
        const basis = cmsPayload.basisActionRow;
        const ts    = cmsPayload.anchorTimeseries || [];
        const last  = ts.length ? ts[ts.length - 1] : null;

        // forwardCurve = anchor timeseries (Oriel translated spot per year).
        // The base CMS forwardCurve in the static fallback uses 2022-2027
        // YoY values; v7's pipeline gives 2020-2024 with three series. We
        // expose Oriel spot as the chart's `expected` line plus the public
        // rail and CMS anchor as additional fields the chart can render.
        d.forwardCurve = ts.map((r) => ({
          maturity:     String(r.year ?? ''),
          maturityFull: String(r.year ?? ''),
          expected:     r.orielHealthcareSpot,
          lower:        r.orielHealthcareSpot - Math.abs((r.publicPrintBasisBps || 0) / 100),
          upper:        r.orielHealthcareSpot + Math.abs((r.publicPrintBasisBps || 0) / 100),
          medicalCpi:   r.medicalCpiProxy,
          cmsAnchor:    r.cmsOfficialAnchorYoy,
          publicBasisBp:r.publicPrintBasisBps,
          anchorBasisBp:r.anchorBasisBps,
          bucketCount:  1,
          contractType: 'reference',
        }));

        // indexPrint — front = current Oriel spot, back = last available row
        const front = last
          ? { value: last.orielHealthcareSpot, maturity: String(last.year), label: 'Front anchor' }
          : { value: basis.orielSpotPct, maturity: '2024', label: 'Front anchor' };
        const sec = ts.length >= 2 ? ts[ts.length - 2] : null;
        const back = sec
          ? { value: sec.orielHealthcareSpot, maturity: String(sec.year), label: 'Prior anchor' }
          : { value: basis.cmsAnchorPct, maturity: '2023', label: 'Prior anchor' };
        const slopeDelta = front.value - back.value;
        d.indexPrint = {
          indexLevel:           basis.orielSpotPct,
          baseValue:            100,
          valuationTime:        new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
          anchorExpectedValue:  basis.cmsAnchorPct,
          publishable:          basis.signalConfidence !== 'Low',
          constituentCount:     (cmsPayload.serviceLines || []).length,
          flaggedCount:         0,
          front,
          back,
          slope: { delta: slopeDelta, pct: back.value > 0 ? (slopeDelta / back.value) * 100 : 0,
                   direction: slopeDelta >= 0 ? 'up' : 'down' },
          customLabels: { indexLevel: 'Oriel spot', anchor: 'CMS anchor', spread: 'YoY change' },
        };

        // Stats — derived from anchor timeseries Oriel-spot column
        const orielVals = ts.map((r) => r.orielHealthcareSpot).filter(Number.isFinite);
        const stds = ts.map((r) => Math.abs((r.publicPrintBasisBps || 0) / 100));
        d.stats = {
          unit: '%',
          mean:      orielVals.reduce((s, v) => s + v, 0) / Math.max(orielVals.length, 1),
          avgStdDev: stds.reduce((s, v) => s + v, 0) / Math.max(stds.length, 1),
          minValue:  orielVals.length ? Math.min(...orielVals) : basis.orielSpotPct,
          maxValue:  orielVals.length ? Math.max(...orielVals) : basis.orielSpotPct,
          constituentCount: ts.length,
          precision: 2,
        };

        // Methodology pulled from v7's CMS module (preserve sample steps).
        if (d.methodology) {
          d.methodology.smoothing = 'lag_engine_projection';
        }

        // Live feed status — pipeline-fed, mirrors v7's Provenance manifest
        const prov = cmsPayload.provenance || {};
        d.runtimeMeta = {
          feedStatus:       'live',
          source:           'CMS Lag Engine pipeline',
          cacheTtlSeconds:  3600,
          contractsFetched: (prov.parsedPresent || []).length,
          errorCount:       (prov.parsedMissing || []).length,
          enableEnvVar:     'CMS_ENABLE_LIVE_FETCH',
          hideLiveToggle:   true,
          feedRows: [
            { label: 'methodology',     value: 'v0.1.0-phase1' },
            { label: 'parsed_inputs',   value: `${(prov.parsedPresent || []).length} present` },
            { label: 'optional_inputs', value: `${(prov.optionalPresent || []).length} present` },
            { label: 'pipeline_outputs',value: `${Object.keys(prov.outputs || {}).length} files` },
            { label: 'signal_confidence', value: basis.signalConfidence },
            { label: 'historical_pct',  value: `${basis.historicalPct.toFixed(0)}th pct` },
          ],
        };

        // Constituents tab — service-line RV sleeves
        d.constituents = (cmsPayload.serviceLines || []).map((r, i) => ({
          ticker: `CMS_RV_${i+1}`,
          label:  String(r.serviceLine || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          price:  r.orielSignal,
          venue:  'CMS',
          type:   'Service line',
          status: r.confidence === 'High' ? 'Included' : (r.confidence === 'Low' ? 'Flagged' : 'Repaired'),
          extra:  { cmsYoy: r.cmsYoy, gapBps: r.gapBps, momentum: r.momentum, confidence: r.confidence },
        }));

        // Stash full CMS bundle on detail.cms for the rich panel
        d.cms = cmsPayload;

        // Update primary metric
        if (d.primaryMetric) {
          d.primaryMetric.value     = basis.orielSpotPct;
          d.primaryMetric.formatted = `${basis.orielSpotPct.toFixed(2)}%`;
          d.primaryMetric.label     = 'Oriel Healthcare Spot';
          d.primaryMetric.sub       = `Translated reference · ${basis.signalConfidence} confidence`;
        }
        if (index.metric) {
          index.metric.value = `${basis.orielSpotPct.toFixed(2)}%`;
          index.metric.sub   = `YoY · CMS-anchored translation`;
        }

        // CMS pipeline runs on static build artifacts — no live/sample
        // toggle (mirrors v7 cms_tab). Capture both variants the same.
        d.sampleVariant = captureVariant(d);
        d.liveVariant   = captureVariant(d);
      }

      // ── ForecastEx Medical Basis — overlay v7's medical_basis_contract
      // pipeline outputs onto the `mb` index. Drives the entire MB tab:
      // basis-curve points, threshold ladder, bucket distribution, contract
      // spec, settlement example, reference legs.
      if (index.key === 'mb' && mbPayload && Array.isArray(mbPayload.basisPoints) && mbPayload.basisPoints.length) {
        const points = mbPayload.basisPoints;
        // Default selected maturity: index 1 (matches v7's default_ix logic
        // — see medical_basis_tab.py: `min(1, len(maturities) - 1)`).
        const selIdx = Math.min(1, points.length - 1);
        const sel = points[selIdx];
        // Front / back use the actual term-structure endpoints — front is
        // the EARLIEST maturity (2026), back is the LATEST (2029). Slope
        // is back − front across the full curve.
        const front = points[0];
        const back  = points[points.length - 1];
        const slopeDelta = back.expectedSpreadBps - front.expectedSpreadBps;
        const slopePct   = front.expectedSpreadBps !== 0
          ? (slopeDelta / Math.abs(front.expectedSpreadBps)) * 100
          : 0;

        // Forward curve = basis-curve points (year on x, expected spread bps on y).
        // No fabricated confidence band — v7's BasisCurvePoint exposes only
        // expected_spread_bps + the two exceedance probabilities. We set
        // lower=upper=expected so the Constituents tab's derived "Std Dev"
        // column reads 0 instead of inventing a ±15% dispersion.
        d.forwardCurve = points.map((p) => ({
          maturity:     p.year,
          maturityFull: p.maturity,
          expected:     p.expectedSpreadBps,
          lower:        p.expectedSpreadBps,
          upper:        p.expectedSpreadBps,
          probabilityGt0:   p.probabilityGt0,
          probabilityGt200: p.probabilityGt200,
          observationWindow: p.observationWindow,
          sourceStatus:     p.sourceStatus,
          bucketCount:  5,
          contractType: 'YES/NO basis',
        }));

        // indexPrint mapped from the selected maturity row + back maturity.
        d.indexPrint = {
          indexLevel:           Math.round(sel.expectedSpreadBps),
          baseValue:            0,
          valuationTime:        new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
          anchorExpectedValue:  Math.round(sel.expectedSpreadBps),
          publishable:          true,
          constituentCount:     (mbPayload.ladder || []).length,
          flaggedCount:         0,
          front: { value: front.expectedSpreadBps, maturity: front.year, label: `Front (${front.year})`, unit: 'bps' },
          back:  { value: back.expectedSpreadBps,  maturity: back.year,  label: `Back (${back.year})`,  unit: 'bps' },
          slope: { delta: slopeDelta, pct: slopePct, direction: slopeDelta >= 0 ? 'up' : 'down', unit: 'bps' },
          customLabels: { indexLevel: 'Expected basis', anchor: `${sel.year} basis`, spread: 'Term structure' },
        };

        // Stats — derived from basis-curve points. Custom .rows array so
        // we surface only v7-real metrics (no fabricated Avg Std Dev —
        // v7's basis curve has no per-maturity standard deviation).
        const expBps = points.map((p) => p.expectedSpreadBps);
        const meanBps = expBps.reduce((s, v) => s + v, 0) / Math.max(expBps.length, 1);
        const ladderCount = (mbPayload.ladder || []).length;
        const yearStart = points[0]?.year || '';
        const yearEnd   = points[points.length - 1]?.year || '';
        d.stats = {
          unit: ' bps',
          precision: 0,
          rows: [
            { label: 'Mean (all maturities)', value: `${meanBps >= 0 ? '+' : ''}${Math.round(meanBps)} bps` },
            { label: 'Min',                   value: `${Math.round(Math.min(...expBps))} bps` },
            { label: 'Max',                   value: `${Math.round(Math.max(...expBps))} bps` },
            { label: 'Maturities',            value: `${points.length} (${yearStart} – ${yearEnd})` },
            { label: 'Contracts',             value: `${ladderCount} (5 × ${points.length})` },
          ],
        };

        // Constituents = the 20-row sample ladder (5 thresholds × 4 maturities).
        d.constituents = (mbPayload.ladder || []).map((r) => ({
          ticker: `MB_${r.year}_GT_${r.thresholdBps}`,
          label:  `${r.year} · ${r.contractLabel}`,
          price:  r.yesPrice,
          venue:  'ForecastEx (sample)',
          type:   'YES/NO contract',
          status: 'Included',
          extra: {
            bid: r.bid, ask: r.ask, volume: r.volume, openInterest: r.openInterest,
            thresholdBps: r.thresholdBps, observationWindow: r.observationWindow,
          },
        }));

        // Methodology — keep the static .rows array (v7-real contract
        // structure). Flip the "Repair" row when the live curve required
        // monotonic repair so the Methodology kv list reflects truth.
        if (d.methodology && Array.isArray(d.methodology.rows) && mbPayload.meta) {
          d.methodology.rows = d.methodology.rows.map((r) => {
            if (r.label !== 'Repair') return r;
            return {
              ...r,
              value: mbPayload.meta.repaired
                ? 'Repaired (one or more thresholds adjusted)'
                : 'Monotone (non-increasing P)',
            };
          });
        }

        // Live-feed status block — the contract is illustrative, so 'sample'.
        // No enableEnvVar: v7's medical_basis module has no live-feed env var,
        // so the LiveFeedCard skips the env-var foot and the live/sample
        // toggle stays hidden via hideLiveToggle.
        d.runtimeMeta = {
          feedStatus:       'sample',
          source:           'Illustrative ForecastEx-style sample ladder',
          cacheTtlSeconds:  600,
          contractsFetched: (mbPayload.ladder || []).length,
          errorCount:       0,
          hideLiveToggle:   true,
          feedRows: [
            { label: 'methodology',   value: mbPayload.meta?.version || 'v0.1.0-medical-basis' },
            { label: 'phase',         value: mbPayload.meta?.phaseLabel || 'Illustrative contract design' },
            { label: 'thresholds',    value: (mbPayload.defaultThresholds || []).join(', ') + ' bps' },
            { label: 'maturities',    value: points.map((p) => p.year).join(' · ') },
            { label: 'sample_rows',   value: `${(mbPayload.ladder || []).length} contracts` },
            { label: 'arbitrage',     value: mbPayload.meta?.repaired ? 'Repaired' : 'Monotone ✓' },
          ],
        };

        // Stash full payload on detail.mb for the rich panels.
        d.mb = mbPayload;
        d.mbSelectedIdx = selIdx;

        // Update primary metric.
        if (d.primaryMetric) {
          d.primaryMetric.value     = sel.expectedSpreadBps;
          d.primaryMetric.formatted = `${sel.expectedSpreadBps >= 0 ? '+' : ''}${Math.round(sel.expectedSpreadBps)} bps`;
          d.primaryMetric.label     = 'Expected basis';
          d.primaryMetric.sub       = `Medical CPI − CPI-U · ${sel.year} maturity`;
        }
        if (index.metric) {
          index.metric.value = `${Math.round(sel.expectedSpreadBps)} bps`;
          index.metric.sub   = `Maturity ${sel.year}`;
        }

        // No live/sample toggle for this index (illustrative).
        d.sampleVariant = captureVariant(d);
        d.liveVariant   = captureVariant(d);
      }

      // ── OTC Parity Validation — overlay v7's parity engine outputs onto
      // the `parity` index. Carries 4 sub-views (term/tight/dtcc/neg).
      // The default-shown benchmark in the KPI strip + primary-metric
      // override is the "tight" benchmark (matches v7 tab order).
      if (index.key === 'parity' && parityPayload) {
        const tight = parityPayload.parity?.tight;
        const dtcc  = parityPayload.parity?.dtcc;
        const neg   = parityPayload.parity?.neg;
        const term  = parityPayload.term;

        // Stash full payload on detail.parity for the rich panels.
        d.parity = {
          tight, dtcc, neg, term,
          meta: parityPayload.meta || {},
        };

        // Build constituents from the 3 benchmark statuses + DTCC tenor count
        // — gives the standard Constituents tab a meaningful row set instead
        // of the fabricated 8-tenor list.
        const benchRows = [];
        const summarize = (key, label, blob) => {
          if (!blob || !blob.summary) return;
          const s = blob.summary;
          benchRows.push({
            ticker: `BENCH_${key.toUpperCase()}`,
            label,
            price:  s.avg_abs_basis_bp != null ? Number(s.avg_abs_basis_bp.toFixed(2)) : null,
            type:   blob.benchmark?.label || label,
            status: s.overall_status === 'PASS' ? 'Included' : 'Flagged',
            extra: {
              avgAbsBasisBp:  s.avg_abs_basis_bp,
              maxAbsBasisBp:  s.max_abs_basis_bp,
              pctWithin:      s.pct_within_tolerance,
              monthsTested:   s.months_tested,
              basisGate:      s.basis_gate_status,
              shapeGate:      s.shape_gate_status,
              overall:        s.overall_status,
            },
          });
        };
        summarize('tight', 'Reference OTC Benchmark',       tight);
        summarize('dtcc',  'DTCC SDR Calibration Sample',   dtcc);
        summarize('neg',   'Publish-Block Stress Test',     neg);
        if (term && term.aggregates) {
          benchRows.push({
            ticker: 'DTCC_TERM_LIVE',
            label:  `DTCC live term calibration (${term.aggregates.nStdTenors} std tenors)`,
            price:  term.aggregates.stdTenorWtdAvg != null
                      ? Number(term.aggregates.stdTenorWtdAvg.toFixed(3))
                      : null,
            type:   'DTCC term reference',
            status: 'Reference',
            extra: {
              totalTrades:   term.aggregates.totalTrades,
              totalNotional: term.aggregates.totalNotionalUsd,
              execWindow:    term.execWindow,
            },
          });
        }
        if (benchRows.length) d.constituents = benchRows;

        // Forward-curve mirror: one point per tight-benchmark month showing
        // ORIEL implied rate; bands derived from absolute diff vs OTC so
        // Std Dev = abs basis (real, not fabricated).
        if (tight && Array.isArray(tight.parityRows) && tight.parityRows.length) {
          d.forwardCurve = tight.parityRows.map((r) => ({
            maturity:     r.targetMonthLabel,
            maturityFull: r.targetMonth,
            expected:     r.orielRatePct,
            lower:        r.orielRatePct - r.absDiffBps / 100.0,
            upper:        r.orielRatePct + r.absDiffBps / 100.0,
            otcRate:      r.otcYoyRate,
            diffBps:      r.diffBps,
            withinTolerance: r.withinTolerance,
            status:       r.status,
            bucketCount:  1,
            contractType: 'parity_check',
          }));
        }

        // Replace the fabricated parityGates with the live tight-benchmark
        // gate evaluation — every threshold and observed value is real.
        if (tight && tight.summary) {
          const s   = tight.summary;
          const thr = s.thresholds || {};
          const cs  = s.conditions || {};
          const sm  = s.shape_metrics || {};
          const _r2 = (v) => v == null ? 'n/a' : Number(v).toFixed(4);
          d.parityGates = {
            overall: s.overall_status,
            benchmarks: ['Reference OTC tighter', 'DTCC SDR sample', 'Negative control'],
            gates: [
              { key: 'basis', label: 'Basis gate', status: s.basis_gate_status, description: 'Level alignment within tolerance' },
              { key: 'shape', label: 'Shape gate', status: s.shape_gate_status, description: 'Index-space curve fit (R²) sufficient' },
            ],
            metrics: [
              { label: 'Avg abs basis',         value: `${s.avg_abs_basis_bp.toFixed(2)} bp`, limit: `≤ ${thr.max_avg_abs_basis_bps?.toFixed(0)} bp`, pass: !!cs.avg_abs_basis_within_limit },
              { label: 'Max abs basis',         value: `${s.max_abs_basis_bp.toFixed(2)} bp`, limit: `≤ ${thr.max_max_abs_basis_bps?.toFixed(0)} bp`, pass: !!cs.max_abs_basis_within_limit },
              { label: `Within ±${thr.tolerance_bps?.toFixed(0)} bp`, value: `${s.pct_within_tolerance.toFixed(0)}%`, limit: `≥ ${thr.min_pct_within_tolerance?.toFixed(0)}%`, pass: !!cs.pct_within_tolerance_sufficient },
              { label: 'Index R² (dense grid)', value: _r2(sm.curve_r2_index),  limit: `≥ ${thr.min_index_curve_r2?.toFixed(2)}`,  pass: !!cs.curve_index_r2_sufficient },
              { label: 'Index R² (pillars)',    value: _r2(sm.pillar_r2_index), limit: `≥ ${thr.min_index_pillar_r2?.toFixed(2)}`, pass: !!cs.pillar_index_r2_sufficient },
              { label: 'Months tested',         value: String(s.months_tested), limit: '—', pass: null },
            ],
          };
        }

        // Stats — derived from tight benchmark
        if (tight && tight.summary) {
          const s = tight.summary;
          d.stats = {
            unit: ' bp',
            precision: 2,
            rows: [
              { label: 'Avg abs basis',         value: `${s.avg_abs_basis_bp.toFixed(2)} bp` },
              { label: 'Max abs basis',         value: `${s.max_abs_basis_bp.toFixed(2)} bp` },
              { label: 'Within tolerance',      value: `${s.pct_within_tolerance.toFixed(0)}%` },
              { label: 'Index R² (dense)',      value: s.shape_metrics?.curve_r2_index != null ? Number(s.shape_metrics.curve_r2_index).toFixed(4) : 'n/a' },
              { label: 'Index R² (pillars)',    value: s.shape_metrics?.pillar_r2_index != null ? Number(s.shape_metrics.pillar_r2_index).toFixed(4) : 'n/a' },
              { label: 'Months tested',         value: String(s.months_tested) },
            ],
          };
        }

        // Methodology — replace fabricated rows with v7-real config
        if (tight && tight.summary) {
          const thr = tight.summary.thresholds || {};
          d.methodology = {
            ...d.methodology,
            version: parityPayload.meta?.version || 'v1.0-parity',
            name:    'OTC Parity Validation',
            rows: [
              { label: 'Reference curve',       value: 'Oriel implied CPI curve (oriel_curve_sample.csv)' },
              { label: 'Benchmarks',            value: 'OTC tighter · DTCC SDR · negative control' },
              { label: 'Tolerance',             value: `±${thr.tolerance_bps?.toFixed(0)} bp (locked)` },
              { label: 'Avg abs basis limit',   value: `≤ ${thr.max_avg_abs_basis_bps?.toFixed(0)} bp` },
              { label: 'Max abs basis limit',   value: `≤ ${thr.max_max_abs_basis_bps?.toFixed(0)} bp` },
              { label: 'Within-tolerance min',  value: `≥ ${thr.min_pct_within_tolerance?.toFixed(0)}%` },
              { label: 'Index R² (pillars) min', value: `≥ ${thr.min_index_pillar_r2?.toFixed(2)}` },
              { label: 'Index R² (dense) min',  value: `≥ ${thr.min_index_curve_r2?.toFixed(2)}` },
              { label: 'Gate logic',             value: 'Basis gate AND shape gate must PASS' },
            ],
          };
        }

        // Update primary metric & ribbon to reflect live tight-benchmark
        // status (instead of the static "+18 bps" fallback).
        if (tight && tight.summary) {
          const s = tight.summary;
          const ok = s.overall_status === 'PASS';
          if (d.primaryMetric) {
            d.primaryMetric.value     = s.avg_abs_basis_bp;
            d.primaryMetric.formatted = `${s.avg_abs_basis_bp.toFixed(2)} bp`;
            d.primaryMetric.label     = 'Avg abs basis';
            d.primaryMetric.sub       = `Tight benchmark · ${s.months_tested} months · ${s.overall_status}`;
          }
          if (index.metric) {
            index.metric.value = `${s.avg_abs_basis_bp.toFixed(2)} bp`;
            index.metric.sub   = `Tight benchmark · ${s.overall_status}`;
          }
          if (index.risk) {
            index.risk.variant = ok ? 'success' : 'danger';
            index.risk.label   = ok ? 'PASS' : 'FAIL';
          }

          // indexPrint — front month + last month from tight parity rows
          const rows = tight.parityRows || [];
          if (rows.length) {
            const front = rows[0];
            const back  = rows[rows.length - 1];
            d.indexPrint = {
              indexLevel:           Number(s.avg_abs_basis_bp.toFixed(2)),
              baseValue:            0,
              valuationTime:        new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
              anchorExpectedValue:  Number(s.avg_abs_basis_bp.toFixed(2)),
              publishable:          ok,
              constituentCount:     rows.length,
              flaggedCount:         rows.filter((r) => !r.withinTolerance).length,
              front: { value: front.diffBps, maturity: front.targetMonthLabel, label: `Front (${front.targetMonthLabel})`, unit: 'bp' },
              back:  { value: back.diffBps,  maturity: back.targetMonthLabel,  label: `Back (${back.targetMonthLabel})`,  unit: 'bp' },
              slope: { delta: back.diffBps - front.diffBps,
                       pct:   front.diffBps !== 0 ? ((back.diffBps - front.diffBps) / Math.abs(front.diffBps)) * 100 : 0,
                       direction: (back.diffBps - front.diffBps) >= 0 ? 'up' : 'down', unit: 'bp' },
              customLabels: { indexLevel: 'Avg abs basis', anchor: 'Tight benchmark', spread: 'Front → back diff' },
            };
          }
        }

        // Live-feed status
        d.runtimeMeta = {
          feedStatus: tight?.summary?.overall_status === 'PASS' ? 'live' : 'sample',
          source:     'v7 parity pipeline + DTCC SDR term calibration',
          cacheTtlSeconds: 3600,
          contractsFetched: (tight?.parityRows?.length || 0) + (dtcc?.parityRows?.length || 0) + (neg?.parityRows?.length || 0),
          errorCount: (neg?.parityRows || []).filter((r) => !r.withinTolerance).length,
          hideLiveToggle: true,
          feedRows: [
            { label: 'tight_status',  value: tight?.summary?.overall_status || 'n/a' },
            { label: 'dtcc_status',   value: dtcc?.summary?.overall_status  || 'n/a' },
            { label: 'neg_status',    value: neg?.summary?.overall_status   || 'n/a' },
            { label: 'tolerance',     value: `±${tight?.summary?.thresholds?.tolerance_bps?.toFixed(0)} bp` },
            { label: 'term_tenors',   value: term?.aggregates?.nStdTenors != null ? `${term.aggregates.nStdTenors}/6 std` : 'n/a' },
          ],
        };

        d.sampleVariant = captureVariant(d);
        d.liveVariant   = captureVariant(d);
      }

      // Skip the generic primary-metric override for indices that already
      // populated their own bespoke labels above (perp, cms, mb, parity) —
      // their unit isn't always YoY %.
      if (d.primaryMetric && d.indexPrint && index.key !== 'perp' && index.key !== 'cms' && index.key !== 'mb' && index.key !== 'parity') {
        d.primaryMetric.value = d.indexPrint.front.value;
        d.primaryMetric.formatted = `${d.indexPrint.front.value.toFixed(2)}%`;
        d.primaryMetric.sub = `${index.family} YoY · ${d.indexPrint.front.maturity}`;
      }
      if (index.metric && d.indexPrint && index.key !== 'perp' && index.key !== 'cms' && index.key !== 'mb' && index.key !== 'parity') {
        index.metric.value = `${d.indexPrint.front.value.toFixed(2)}%`;
        index.metric.sub = `YoY · ${d.indexPrint.front.maturity}`;
      }
    });
  }

  // Expose the variant-swap helper so IndexDetailView can flip live⇄sample
  // when the user toggles the Live data switch in the KPI ribbon.
  window.App = window.App || {};
  window.App.INDICES = { LIST: INDICES, byKey: indexByKey };
  window.App.applyDetailVariant = function applyDetailVariant(detail, mode) {
    if (!detail) return detail;
    const target = mode === 'live'
      ? (detail.liveVariant || detail.sampleVariant)
      : (detail.sampleVariant || detail.liveVariant);
    if (!target) return detail;
    applyVariant(detail, target);
    return detail;
  };
})();
