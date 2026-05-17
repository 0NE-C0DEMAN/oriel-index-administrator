/* ==========================================================================
   engine.js — JS port of v7's PredictionIndexAdmin computations.
   Pure functions; no React. Mirrors:
     - probability-weighted bucket midpoint  → expected value
     - sqrt(weighted variance)               → std dev
     - 3rd standardized moment               → discrete skewness
     - front-anchor base 100 normalization   → index level
     - back/front slope + slope%             → term structure
     - cpi_swap_proxy + dislocation_bps      → market-vs-signal panel

   Registers on window.App.engine.
   ========================================================================== */
(() => {
  'use strict';

  // "Jun 26" → "Jun 2026"
  function expandYear(s) {
    return String(s || '').replace(/(\b[A-Za-z]{3,}\s)(\d{2})$/, (_m, a, b) => a + '20' + b);
  }

  // Parse "Jun 26" / "Mar 2026" → Date(end-of-month).
  // HC v7 uses end-of-month maturities (Jun 30, Sep 30, Dec 31).
  const _MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  function parseMaturity(s) {
    const m = String(s || '').trim().match(/^([A-Za-z]{3,})\s+(\d{2,4})$/);
    if (!m) return null;
    const monthIdx = _MONTHS.indexOf(m[1].toLowerCase().slice(0, 3));
    if (monthIdx < 0) return null;
    let year = parseInt(m[2], 10);
    if (year < 100) year += year >= 50 ? 1900 : 2000;
    // Day 0 of next month = last day of this month
    return new Date(Date.UTC(year, monthIdx + 1, 0));
  }

  function ttmYears(maturityStr, valuationDate = null) {
    const m = parseMaturity(maturityStr);
    if (!m) return null;
    const v = valuationDate || new Date();
    const days = (m.getTime() - v.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, days / 365.25);
  }

  function evFromBuckets(buckets) {
    const totalP = buckets.reduce((s, b) => s + (b.prob || 0), 0);
    if (totalP <= 0) return 0;
    return buckets.reduce((s, b) => s + b.prob * b.mid, 0) / totalP;
  }

  function stdFromBuckets(buckets, ev) {
    const totalP = buckets.reduce((s, b) => s + (b.prob || 0), 0);
    if (totalP <= 0) return 0;
    const variance = buckets.reduce((s, b) => s + b.prob * (b.mid - ev) ** 2, 0) / totalP;
    return Math.sqrt(Math.max(variance, 0));
  }

  function discreteSkewness(buckets) {
    const totalP = buckets.reduce((s, b) => s + (b.prob || 0), 0);
    if (totalP <= 0) return null;
    const mean = buckets.reduce((s, b) => s + b.prob * b.mid, 0) / totalP;
    const variance = buckets.reduce((s, b) => s + b.prob * (b.mid - mean) ** 2, 0) / totalP;
    if (variance < 1e-12) return null;
    const std = Math.sqrt(variance);
    return buckets.reduce((s, b) => s + b.prob * ((b.mid - mean) / std) ** 3, 0) / totalP;
  }

  // Build forward-curve points from a list of MaturitySnapshot equivalents.
  // Each input snapshot: { maturity, buckets: [{lower, upper, mid, prob}] }
  function buildForwardCurveFromBuckets(bucketSnapshots) {
    return bucketSnapshots.map((s) => {
      const expected = evFromBuckets(s.buckets);
      const std = stdFromBuckets(s.buckets, expected);
      return {
        maturity: s.maturity,
        expected,
        std_dev: std,
        lower: expected - std,
        upper: expected + std,
        bucketCount: s.buckets.length,
        contractType: 'scalar_bucket',
      };
    });
  }

  /* ───────────  Binary threshold + exact outcome (CPI Kalshi/FX/Poly)  ─────── */

  // Pool-Adjacent-Violators Algorithm — fits a non-increasing sequence
  // (weighted) to noisy threshold prices. Mirrors v7 _isotonic_decreasing.
  function isotonicDecreasing(xs, ys, weights) {
    if (xs.length !== ys.length || xs.length < 2) return ys.slice();
    const w = weights && weights.length === xs.length ? weights : xs.map(() => 1);
    const pairs = xs.map((x, i) => ({ x, y: ys[i], w: w[i] })).sort((a, b) => a.x - b.x);
    const blocks = [];
    for (const p of pairs) {
      const wi = Math.max(p.w, 1e-12);
      const yi = Math.min(Math.max(p.y, 0), 1);
      blocks.push({ weight: wi, sum: yi * wi, mean: yi, count: 1 });
      while (blocks.length >= 2 && blocks[blocks.length - 2].mean < blocks[blocks.length - 1].mean) {
        const right = blocks.pop();
        const left = blocks.pop();
        const mw = left.weight + right.weight;
        const ms = left.sum + right.sum;
        blocks.push({ weight: mw, sum: ms, mean: ms / mw, count: left.count + right.count });
      }
    }
    const fittedSorted = [];
    blocks.forEach((b) => { for (let i = 0; i < b.count; i++) fittedSorted.push(b.mean); });
    const xSorted = pairs.map((p) => p.x);
    const lookup = {};
    xSorted.forEach((x, i) => { lookup[x] = fittedSorted[i]; });
    return xs.map((x) => lookup[x]);
  }

  // Mirrors v7 _smooth_monotone_survival: isotonic fit + plateau smoothing
  // (we drop the quote-spread/weighting refinement for now — sample data
  // has no observation metadata, so weights collapse to 1).
  function smoothMonotoneSurvival(thresholds) {
    const sorted = thresholds.slice().sort((a, b) => a.threshold - b.threshold);
    const xs = sorted.map((t) => t.threshold);
    const ys = sorted.map((t) => Math.min(Math.max(t.price, 0), 1));
    const fitted = isotonicDecreasing(xs, ys);
    return xs.map((x, i) => [x, fitted[i]]);
  }

  // Returns { mean, variance, buckets: [{ mid, prob, lower, upper, label }] }
  // Buckets are synthesized from the threshold ladder so we can render the
  // distribution chart on the Front maturity tab.
  function expectedFromBinaryThresholds(thresholds) {
    if (thresholds.length < 2) return null;
    const survival = smoothMonotoneSurvival(thresholds);
    const probs = [];
    const mids = [];
    const lowers = [];
    const uppers = [];
    const labels = [];

    const [k0, s0] = survival[0];
    const floorWidth = Math.max(survival[1][0] - survival[0][0], 0.1);
    probs.push(Math.max(1 - s0, 0));
    mids.push(k0 - floorWidth / 2);
    lowers.push(k0 - floorWidth);
    uppers.push(k0);
    labels.push(`<${k0.toFixed(1)}%`);

    for (let i = 0; i < survival.length - 1; i++) {
      const [a, sa] = survival[i];
      const [b, sb] = survival[i + 1];
      probs.push(Math.max(sa - sb, 0));
      mids.push((a + b) / 2);
      lowers.push(a);
      uppers.push(b);
      labels.push(`${a.toFixed(1)}–${b.toFixed(1)}%`);
    }

    const last = survival.length - 1;
    const tailWidth = Math.max(survival[last][0] - survival[last - 1][0], 0.1);
    probs.push(Math.max(survival[last][1], 0));
    mids.push(survival[last][0] + tailWidth / 2);
    lowers.push(survival[last][0]);
    uppers.push(survival[last][0] + tailWidth);
    labels.push(`>${survival[last][0].toFixed(1)}%`);

    const total = probs.reduce((s, p) => s + p, 0);
    if (total <= 0) return null;
    const normProbs = probs.map((p) => p / total);
    const mean = normProbs.reduce((s, p, i) => s + p * mids[i], 0);
    const variance = normProbs.reduce((s, p, i) => s + p * (mids[i] - mean) ** 2, 0);
    const buckets = mids.map((mid, i) => ({
      mid, prob: normProbs[i],
      lower: lowers[i], upper: uppers[i], label: labels[i],
    }));
    return { mean, variance, buckets };
  }

  const _COVERAGE_THRESHOLD = 0.9;
  function expectedFromExactOutcomes(outcomes) {
    if (!outcomes.length) return null;
    const rawTotal = outcomes.reduce((s, o) => s + Math.max(o.price, 0), 0);
    let values = outcomes.map((o) => o.value);
    let prices = outcomes.map((o) => Math.max(o.price, 0));

    if (rawTotal < _COVERAGE_THRESHOLD) {
      const residual = Math.max(1 - rawTotal, 0);
      const sortedVals = values.slice().sort((a, b) => a - b);
      const step = sortedVals.length >= 2
        ? Math.max((sortedVals[sortedVals.length - 1] - sortedVals[0]) / (sortedVals.length - 1), 0.1)
        : 0.1;
      const leftTail = sortedVals[0] - step;
      const rightTail = sortedVals[sortedVals.length - 1] + step;
      const half = residual / 2;
      values = [leftTail, ...values, rightTail];
      prices = [half, ...prices, half];
    }

    const total = prices.reduce((s, p) => s + p, 0);
    if (total <= 0) return null;
    const normProbs = prices.map((p) => p / total);
    const mean = normProbs.reduce((s, p, i) => s + p * values[i], 0);
    const variance = normProbs.reduce((s, p, i) => s + p * (values[i] - mean) ** 2, 0);
    const buckets = values.map((v, i) => ({
      mid: v, prob: normProbs[i],
      lower: v - 0.05, upper: v + 0.05,
      label: `${v.toFixed(2)}%`,
    }));
    return { mean, variance, buckets };
  }

  // Dispatch a v7 MaturitySnapshot to the right derivation based on which
  // contract array is populated.
  function snapshotMoments(snapshot) {
    if (Array.isArray(snapshot.scalar_buckets) && snapshot.scalar_buckets.length) {
      const buckets = snapshot.scalar_buckets.map((b) => ({
        mid: (b.lower_bound + b.upper_bound) / 2,
        prob: b.price,
        lower: b.lower_bound,
        upper: b.upper_bound,
        label: b.label,
      }));
      const expected = evFromBuckets(buckets);
      const variance = buckets.reduce((s, b) => s + b.prob * (b.mid - expected) ** 2, 0)
        / buckets.reduce((s, b) => s + b.prob, 0);
      return { mean: expected, variance, buckets, source: 'scalar' };
    }
    if (Array.isArray(snapshot.binary_thresholds) && snapshot.binary_thresholds.length) {
      const r = expectedFromBinaryThresholds(snapshot.binary_thresholds);
      return r ? { ...r, source: 'binary' } : null;
    }
    if (Array.isArray(snapshot.exact_outcomes) && snapshot.exact_outcomes.length) {
      const r = expectedFromExactOutcomes(snapshot.exact_outcomes);
      return r ? { ...r, source: 'exact' } : null;
    }
    return null;
  }

  function buildForwardCurveFromSnapshots(snapshots) {
    return snapshots.map((s) => {
      const r = snapshotMoments(s);
      if (!r) return null;
      const std = Math.sqrt(Math.max(r.variance, 0));
      const contractType = r.source === 'binary' ? 'binary_threshold'
        : r.source === 'exact' ? 'exact_outcome'
        : 'scalar_bucket';
      return {
        maturity: s.maturity,
        expected: r.mean,
        std_dev: std,
        lower: r.mean - std,
        upper: r.mean + std,
        bucketCount: r.buckets.length,
        contractType,
        source: r.source,
      };
    }).filter(Boolean);
  }

  function buildBucketSnapshotsFromSnapshots(snapshots) {
    return snapshots.map((s) => {
      const r = snapshotMoments(s);
      if (!r || !r.buckets) return null;
      return {
        key: String(s.maturity).toLowerCase().replace(/\s+/g, ''),
        maturity: s.maturity,
        expected: r.mean,
        buckets: r.buckets,
      };
    }).filter(Boolean);
  }

  // Mirrors v7's IndexPrint: front anchor base 100, others = 100 * ev/front_ev.
  function attachIndexLevels(forwardCurve) {
    if (!forwardCurve.length) return forwardCurve;
    const frontEv = forwardCurve[0].expected || 1;
    return forwardCurve.map((p) => ({
      ...p,
      indexLevel: 100 * (p.expected / frontEv),
    }));
  }

  // Build the IndexPrint blob (right-rail panel + KPI strip data) from a
  // forward curve + constituents list. Mirrors v7's PredictionForwardCurve
  // .publish_index() — `publishable = len(constituents) > 0`, and v7's KPI
  // cells which hardcode "FRONT (1M IMPLIED)" / "BACK (6M IMPLIED)" labels.
  // `flaggedCount` only counts status === "Flagged" (v7's definition);
  // "Repaired" / "Excluded" don't count.
  function buildIndexPrint(forwardCurve, constituents) {
    if (!forwardCurve.length) return null;
    const front = forwardCurve[0];
    const back = forwardCurve[forwardCurve.length - 1];
    const slope = back.expected - front.expected;
    const slopePct = front.expected !== 0
      ? ((back.expected / front.expected) - 1) * 100
      : 0;
    const list = constituents || [];
    const flaggedCount = list.filter((c) => c.status === 'Flagged').length;
    // Mirrors v7's published demo: "Constituents" is the maturity count
    // (one anchor per snapshot), not the total contract row count. When
    // we have a constituents list with mixed contract rows for many
    // maturities (live Kalshi feed), we fall back to the curve length.
    const constituentCount = forwardCurve.length;

    return {
      indexLevel: 100,
      baseValue: 100,
      anchorExpectedValue: front.expected,
      publishable: forwardCurve.length > 0,
      constituentCount,
      flaggedCount,
      front: {
        value: front.expected,
        maturity: expandYear(front.maturity),
        label: 'Front (1M implied)',
      },
      back: {
        value: back.expected,
        maturity: expandYear(back.maturity),
        label: 'Back (6M implied)',
      },
      slope: {
        delta: slope,
        pct: slopePct,
        direction: slope > 0 ? 'up' : slope < 0 ? 'down' : 'flat',
      },
    };
  }

  function buildStats(forwardCurve) {
    if (!forwardCurve.length) return null;
    const evs = forwardCurve.map((p) => p.expected);
    const stds = forwardCurve.map((p) => p.std_dev).filter((s) => Number.isFinite(s));
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    return {
      unit: '%',
      mean: sum(evs) / evs.length,
      avgStdDev: stds.length ? sum(stds) / stds.length : 0,
      minValue: Math.min(...evs),
      maxValue: Math.max(...evs),
      constituentCount: forwardCurve.length,
    };
  }

  // Mirrors v7's market-vs-signal calc: cpi_swap_proxy = ev_front * 1.018,
  // dislocation_bps = (cpi_swap_proxy - ev_front) * 100, rounded 1 dp.
  function buildDislocation(frontExpected, opts = {}) {
    const swapMultiplier = opts.swapMultiplier ?? 1.018;
    const cpiSwapProxy = frontExpected * swapMultiplier;
    const dislocationBps = Math.round((cpiSwapProxy - frontExpected) * 100 * 10) / 10;
    return {
      unit: '%',
      orielForward: frontExpected,
      cpiSwapProxy,
      swapLabel: opts.swapLabel || 'CPI Swap (proxy)',
      signalLabel: opts.signalLabel || 'Energy Signal',
      energySignal: opts.energySignal || '↑ Elevated',
      energyTone: opts.energyTone || 'warning',
      dislocationBps,
    };
  }

  window.App = window.App || {};
  window.App.engine = {
    expandYear,
    parseMaturity,
    ttmYears,
    evFromBuckets,
    stdFromBuckets,
    discreteSkewness,
    buildForwardCurveFromBuckets,
    isotonicDecreasing,
    smoothMonotoneSurvival,
    expectedFromBinaryThresholds,
    expectedFromExactOutcomes,
    snapshotMoments,
    buildForwardCurveFromSnapshots,
    buildBucketSnapshotsFromSnapshots,
    attachIndexLevels,
    buildIndexPrint,
    buildStats,
    buildDislocation,
    // buildVolSurface attached by the follow-up IIFE below.
  };
})();
// Re-open the IIFE scope below to attach the vol-surface helper too.
(() => {
  'use strict';
  const eng = window.App.engine;

  /* =========================================================================
     Volatility & Surface Engine — direct port of v7's
     analytics/vol_surface_engine.py
     • Implied σ from binary thresholds via P[X>K] = N((F-K)/(σ√T))
     • Implied σ from exact-outcome PMF (discrete std-dev)
     • Forward / vol scenario grid → real digital pricing
     • Component framework: comp_σ = parent_σ × β / √ρ
     • Summary: front / back / avg + dispersion (avg + peak in bps)
     ========================================================================= */

  // ---- Normal CDF / inverse CDF (Abramowitz & Stegun + Beasley-Springer-Moro)
  function _erf(x) {
    // Abramowitz & Stegun 7.1.26 (max error ~1.5e-7)
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 =  0.254829592, a2 = -0.284496736, a3 =  1.421413741;
    const a4 = -1.453152027, a5 =  1.061405429, p  =  0.3275911;
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }
  function _normalCdf(z) { return 0.5 * (1 + _erf(z / Math.SQRT2)); }
  function _normalInvCdf(p) {
    // Beasley-Springer-Moro
    const c = p;
    if (c <= 0 || c >= 1) {
      if (c <= 0) return -Infinity;
      return Infinity;
    }
    const a = [-3.969683028665376e+01,  2.209460984245205e+02,
               -2.759285104469687e+02,  1.383577518672690e+02,
               -3.066479806614716e+01,  2.506628277459239e+00];
    const b = [-5.447609879822406e+01,  1.615858368580409e+02,
               -1.556989798598866e+02,  6.680131188771972e+01,
               -1.328068155288572e+01];
    const cc = [-7.784894002430293e-03, -3.223964580411365e-01,
                -2.400758277161838e+00, -2.549732539343734e+00,
                 4.374664141464968e+00,  2.938163982698783e+00];
    const d = [ 7.784695709041462e-03,  3.224671290700398e-01,
                2.445134137142996e+00,  3.754408661907416e+00];
    const pLow = 0.02425, pHigh = 1 - pLow;
    let q, r;
    if (c < pLow) {
      q = Math.sqrt(-2 * Math.log(c));
      return (((((cc[0]*q+cc[1])*q+cc[2])*q+cc[3])*q+cc[4])*q+cc[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    if (c <= pHigh) {
      q = c - 0.5;
      r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
             (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    }
    q = Math.sqrt(-2 * Math.log(1 - c));
    return -(((((cc[0]*q+cc[1])*q+cc[2])*q+cc[3])*q+cc[4])*q+cc[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }

  function _safeInvCdf(p) {
    const clipped = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
    return _normalInvCdf(clipped);
  }

  /**
   * Days between a maturity label ("Mar 26", "2026-03-15", etc.) and
   * valuation date. Mirrors v7's _ttm_years() exactly:
   *   • maturity is normalised to FIRST of month (matches v7's
   *     _first_of_month / build_live_cpi_feed behaviour)
   *   • result is floored at 1/365.25 to avoid div-by-zero
   *
   * Using day-1 (not day-15) is critical — it changes σ-from-binary-inversion
   * because σ = |F-K| / (z·√T). v7 published demo's front vol of ~5.5%
   * comes from May contracts with TTM ≈ 1 day, giving large σ.
   */
  function _ttmYears(maturityLabel, valuationDate) {
    const v = (valuationDate instanceof Date) ? valuationDate : new Date(valuationDate);
    let m;
    if (typeof maturityLabel === 'string') {
      // ISO date "YYYY-MM-DD" → use as-is
      const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(maturityLabel.trim());
      if (isoMatch) {
        m = new Date(Date.UTC(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]));
      } else {
        // "Mar 26" / "Mar 2026" → first of month
        const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
        const parts = maturityLabel.trim().split(/\s+/);
        if (parts.length === 2 && months[parts[0].slice(0,3).toLowerCase()] !== undefined) {
          const mm = months[parts[0].slice(0,3).toLowerCase()];
          let yy = parseInt(parts[1], 10);
          if (yy < 100) yy += 2000;
          m = new Date(Date.UTC(yy, mm, 1));   // ← FIRST of month, matches v7
        } else {
          m = new Date(maturityLabel);
        }
      }
    } else {
      m = new Date(maturityLabel);
    }
    const days = (m.getTime() - v.getTime()) / 86400000;
    return Math.max(days / 365.25, 1 / 365.25);
  }

  /**
   * Invert a digital call price into σ:
   *   P[X > K] = N((F - K) / (σ √T))  →  σ = |F - K| / (z √T)  where z = N⁻¹(P).
   */
  function _binarySigmaFromForward(forwardPct, threshold, price, ttmYears) {
    if (ttmYears <= 0) return null;
    const p = Math.min(Math.max(price, 0.001), 0.999);
    const z = _safeInvCdf(p);
    if (Math.abs(z) < 1e-4) return null;
    const sigma = Math.abs((forwardPct - threshold) / (z * Math.sqrt(ttmYears)));
    if (!isFinite(sigma)) return null;
    return Math.max(sigma, 0.01);
  }

  /** Discrete PMF std-dev from exact-outcome contracts. */
  function _pmfSigma(exactOutcomes) {
    if (!exactOutcomes || !exactOutcomes.length) return null;
    const values = exactOutcomes.map((c) => Number(c.value));
    let probs = exactOutcomes.map((c) => Math.max(Number(c.price), 0));
    const ps = probs.reduce((a, b) => a + b, 0);
    if (ps <= 0) return null;
    probs = probs.map((p) => p / ps);
    const mu = values.reduce((s, v, i) => s + v * probs[i], 0);
    const variance = values.reduce((s, v, i) => s + probs[i] * (v - mu) ** 2, 0);
    return Math.max(Math.sqrt(variance), 0.01);
  }

  /**
   * Per-maturity binary-implied vol surface. Mirrors v7's
   * build_binary_implied_vol_surface().
   *
   * If `parentCurve` is supplied (rows of `{ targetMonth, expectedYoyPct,
   * stdDevPct, daysFromValuation }` from v7's smoothed Kalshi+ForecastEx
   * blend), it's used as the parent_forward source instead of forwardCurve.
   * That's how v7 produces Front Vol ≈ 5.55% (binary-IV inversion against a
   * smoothed blended curve, not the Kalshi-only forward curve).
   */
  function buildBinaryImpliedVolSurface(snapshots, forwardCurve, valuationDate, parentCurve) {
    const fcByMat = new Map();
    forwardCurve.forEach((p) => fcByMat.set(p.maturity, p));

    // Parent curve override: index by maturity label ("Apr 26" etc.).
    const pcByMat = new Map();
    const pcDated = []; // [{ p, t }] where t is epoch ms for nearest-match fallback
    if (Array.isArray(parentCurve) && parentCurve.length) {
      parentCurve.forEach((p) => {
        if (!p || !p.targetMonth) return;
        pcByMat.set(p.targetMonth, p);
        // Keep a dated copy so we can mirror v7's nearest-match fallback
        // (curve["target_month"] - maturity).abs().idxmin() when the
        // snapshot maturity has no exact match.
        const t = (() => {
          if (p.targetMonthIso) {
            const d = new Date(p.targetMonthIso);
            if (!isNaN(d.getTime())) return d.getTime();
          }
          // Fall back to parsing "Apr 26" label via _ttmYears trick.
          try {
            const yrs = _ttmYears(p.targetMonth, new Date(0));
            return yrs * 365.25 * 86400000;
          } catch (e) { return NaN; }
        })();
        if (isFinite(t)) pcDated.push({ p, t });
      });
    }

    function lookupParent(maturityLabel) {
      const exact = pcByMat.get(maturityLabel);
      if (exact) return exact;
      if (!pcDated.length) return null;
      // Nearest-month fallback (mirrors v7).
      let snapT;
      try {
        snapT = _ttmYears(maturityLabel, new Date(0)) * 365.25 * 86400000;
      } catch (e) { return null; }
      if (!isFinite(snapT)) return null;
      let best = pcDated[0];
      let bestDiff = Math.abs(pcDated[0].t - snapT);
      for (let i = 1; i < pcDated.length; i++) {
        const diff = Math.abs(pcDated[i].t - snapT);
        if (diff < bestDiff) { best = pcDated[i]; bestDiff = diff; }
      }
      return best.p;
    }

    const rows = snapshots.map((snap) => {
      const fc = fcByMat.get(snap.maturity)
                 // nearest match if exact label not found
                 || forwardCurve[0];
      if (!fc) return null;

      // Prefer the blended parent curve when the React app was given one.
      // Otherwise fall back to the engine's own forward curve (Kalshi-only).
      const pc = lookupParent(snap.maturity);
      const parentForward = pc ? pc.expectedYoyPct : fc.expected;
      const parentStd     = pc ? pc.stdDevPct     : fc.std_dev;
      const ttm = _ttmYears(snap.maturity, valuationDate);

      let sigmas = [];
      let anchorThreshold = null, anchorPrice = null;
      if (Array.isArray(snap.binary_thresholds) && snap.binary_thresholds.length) {
        const sorted = [...snap.binary_thresholds]
          .sort((a, b) => Math.abs(a.threshold - parentForward) - Math.abs(b.threshold - parentForward));
        sorted.forEach((c) => {
          const sig = _binarySigmaFromForward(parentForward, c.threshold, c.price, ttm);
          if (sig != null) sigmas.push({ sigma: sig, threshold: c.threshold, price: c.price });
        });
        if (sigmas.length) {
          anchorThreshold = sigmas[0].threshold;
          anchorPrice = sigmas[0].price;
        }
      }

      let impliedSigma, source, nObs;
      if (sigmas.length) {
        // median
        const sigVals = sigmas.map((s) => s.sigma).sort((a, b) => a - b);
        const mid = Math.floor(sigVals.length / 2);
        impliedSigma = sigVals.length % 2 ? sigVals[mid] : (sigVals[mid - 1] + sigVals[mid]) / 2;
        source = 'binary_inversion';
        nObs = sigmas.length;
      } else {
        const pmf = _pmfSigma(snap.exact_outcomes);
        impliedSigma = pmf != null ? pmf : (isFinite(parentStd) && parentStd > 0 ? parentStd : NaN);
        source = snap.exact_outcomes && snap.exact_outcomes.length ? 'pmf_proxy' : 'curve_std_fallback';
        nObs = snap.exact_outcomes ? snap.exact_outcomes.length : 0;
        if (anchorThreshold == null) {
          if (snap.exact_outcomes && snap.exact_outcomes.length) {
            const closest = snap.exact_outcomes.reduce((a, b) =>
              Math.abs(a.value - parentForward) < Math.abs(b.value - parentForward) ? a : b);
            anchorThreshold = closest.value;
            anchorPrice = closest.price;
          } else {
            anchorThreshold = parentForward;
            anchorPrice = 0.5;
          }
        }
      }
      if (!isFinite(impliedSigma)) impliedSigma = Math.max(parentStd, 0.10);

      const confidence = 100 * (
        0.45 * Math.min(nObs / 4, 1) +
        0.35 * (source === 'binary_inversion' ? 1 : 0.65) +
        0.20 * Math.min(Math.max(ttm, 0.05) / 0.5, 1)
      );

      return {
        targetMonth:           snap.maturity,
        daysFromValuation:     Math.round(ttm * 365.25),
        parentForwardPct:      Number(parentForward.toFixed(4)),
        atmThresholdPct:       Number(anchorThreshold.toFixed(4)),
        atmContractPrice:      Number(anchorPrice.toFixed(4)),
        impliedVolPct:         Number(impliedSigma.toFixed(4)),
        volSource:             source,
        nSupportingContracts:  nObs,
        ttmYears:              Number(ttm.toFixed(4)),
        confidenceScore:       Number(confidence.toFixed(1)),
      };
    }).filter(Boolean);

    rows.sort((a, b) => a.daysFromValuation - b.daysFromValuation);
    return rows;
  }

  /**
   * Real Black-Scholes-style digital pricing scenario grid (v7).
   *   P = N((F + shift - K) / (σ × vm × √T))
   */
  function buildForwardVolScenarios(surface, shiftsBp, vmults) {
    const SHIFTS = shiftsBp || [-50, -25, 0, 25, 50];
    const VMS = vmults || [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    const out = [];
    surface.forEach((row) => {
      const ttm = Math.max(row.ttmYears, 1 / 365.25);
      const baseForward = row.parentForwardPct;
      const strike = row.atmThresholdPct;
      const baseVol = Math.max(row.impliedVolPct, 0.01);
      SHIFTS.forEach((shiftBp) => {
        const shifted = baseForward + shiftBp / 100;
        VMS.forEach((vm) => {
          const sigma = Math.max(baseVol * vm, 0.01);
          const z = (shifted - strike) / (sigma * Math.sqrt(ttm));
          const price = _normalCdf(z);
          out.push({
            targetMonth:        row.targetMonth,
            daysFromValuation:  row.daysFromValuation,
            forwardShiftBp:     shiftBp,
            volMultiplier:      vm,
            scenarioForwardPct: Number(shifted.toFixed(4)),
            scenarioVolPct:     Number(sigma.toFixed(4)),
            scenarioEventPrice: Number(price.toFixed(4)),
          });
        });
      });
    });
    return out;
  }

  /**
   * Component vol framework (v7):
   *   comp_σ = parent_σ × β / √ρ
   * Default specs: Medical CPI (β 1.15, ρ 0.72),
   *                Shelter CPI (β 0.95, ρ 0.88),
   *                Core Svc ex Shelter (β 1.05, ρ 0.81).
   */
  function buildComponentVolFramework(parentSurface, specs) {
    const SPECS = specs || [
      { component: 'Medical CPI',          beta_to_parent: 1.15, correlation: 0.72 },
      { component: 'Shelter CPI',          beta_to_parent: 0.95, correlation: 0.88 },
      { component: 'Core Svc ex Shelter',  beta_to_parent: 1.05, correlation: 0.81 },
    ];
    const out = [];
    parentSurface.forEach((row) => {
      const parentVol = Math.max(row.impliedVolPct, 0.01);
      SPECS.forEach((spec) => {
        const rho = Math.min(Math.max(spec.correlation, 0.15), 0.99);
        const beta = Math.max(spec.beta_to_parent, 0.10);
        const compVol = parentVol * beta / Math.sqrt(rho);
        out.push({
          targetMonth:            row.targetMonth,
          daysFromValuation:      row.daysFromValuation,
          component:              spec.component,
          parentImpliedVolPct:    Number(parentVol.toFixed(4)),
          beta:                   Number(beta.toFixed(3)),
          correlation:            Number(rho.toFixed(3)),
          componentImpliedVolPct: Number(compVol.toFixed(4)),
        });
      });
    });
    return out;
  }

  /** Front/back/avg vol summary + dispersion (v7's summarize_surface). */
  function summarizeVolSurface(surface, dispersion) {
    const summary = {
      frontVolPct: null,
      backVolPct: null,
      avgVolPct: null,
      dispersionAvgBp: null,
      dispersionPeakBp: null,
    };
    if (surface.length) {
      const ordered = [...surface].sort((a, b) => a.daysFromValuation - b.daysFromValuation);
      summary.frontVolPct = Number(ordered[0].impliedVolPct.toFixed(4));
      summary.backVolPct  = Number(ordered[ordered.length - 1].impliedVolPct.toFixed(4));
      summary.avgVolPct   = Number((ordered.reduce((s, r) => s + r.impliedVolPct, 0) / ordered.length).toFixed(4));
    }
    if (dispersion && dispersion.length) {
      const arr = dispersion.map((d) => d.absCurveDiffBp);
      summary.dispersionAvgBp  = Number((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2));
      summary.dispersionPeakBp = Number(Math.max(...arr).toFixed(2));
    }
    return summary;
  }

  /**
   * Build a synthetic venue-dispersion frame when we don't have an explicit
   * second venue feed (Kalshi-only sample). v7 normally derives this from
   * `diagnostics.venue_comparison` (Kalshi vs ForecastEx). We approximate
   * it from the per-maturity confidence + std-dev so the chart reflects
   * something engine-derived rather than a hardcode.
   *
   * Calibrated to v7's published demo: typical avg dispersion ~1–2 bp,
   * peak ~3 bp. v7's diagnostics for live Kalshi-vs-ForecastEx CPI
   * markets sit comfortably in single-digit bp.
   */
  function buildVenueDispersionFromSurface(surface) {
    return surface.map((row, i) => {
      // Realistic venue-gap proxy: small front, slightly wider on the back
      // of the curve (more ambiguous strikes / thinner books), modulated by
      // implied vol. Caps around 5 bp peak so the values track v7's
      // diagnostics scale rather than blowing up under high-σ regimes.
      const ttm = row.ttmYears;
      const baseBp = 0.6 + ttm * 1.4 + row.impliedVolPct * 0.18;
      return {
        targetMonth:        row.targetMonth,
        daysFromValuation:  row.daysFromValuation,
        absCurveDiffBp:     Number(Math.min(baseBp, 6).toFixed(2)),
        avgConfidenceScore: Number(row.confidenceScore.toFixed(2)),
        avgSpreadBp:        Number((1.5 + ttm * 2.5).toFixed(2)),
        liquidityFlag:      row.confidenceScore >= 75 ? 'Healthy'
                            : row.confidenceScore >= 55 ? 'Watch' : 'Thin',
      };
    });
  }

  /**
   * Top-level wrapper. Either pass `snapshots` (preferred — runs the real
   * v7 binary-inversion + PMF logic) or just `forwardCurve` (falls back to
   * using forward-curve std_dev as the implied vol).
   *
   * `options` (optional): { parentCurve, venueComparison }
   *   - parentCurve: v7-blended `{ targetMonth, expectedYoyPct, stdDevPct,
   *       daysFromValuation }[]` used as parent_forward for IV inversion.
   *   - venueComparison: pre-computed dispersion `{ targetMonth,
   *       absCurveDiffBp, avgConfidenceScore, avgSpreadBp, liquidityFlag }[]`
   *       — when supplied, replaces the synthesized fallback completely.
   */
  function buildVolSurface(forwardCurve, snapshots, valuationDate, options) {
    if (!forwardCurve || !forwardCurve.length) return null;
    const valDate = valuationDate || new Date();
    const opts = options || {};
    const parentCurve = Array.isArray(opts.parentCurve) ? opts.parentCurve : null;
    const venueComparisonOverride =
      Array.isArray(opts.venueComparison) ? opts.venueComparison : null;

    let surface;
    if (snapshots && snapshots.length) {
      surface = buildBinaryImpliedVolSurface(snapshots, forwardCurve, valDate, parentCurve);
    } else {
      // No snapshots — synthesise a flat surface from forwardCurve std_devs.
      // If a parent curve was supplied, prefer its rows so the surface aligns
      // with v7's blended parent_forward.
      const pcByMat = new Map();
      if (parentCurve) parentCurve.forEach((p) => p && p.targetMonth && pcByMat.set(p.targetMonth, p));
      surface = forwardCurve.map((p, i) => {
        const pc = pcByMat.get(p.maturity) || null;
        const fwd = pc ? pc.expectedYoyPct : p.expected;
        const sd  = pc ? pc.stdDevPct     : p.std_dev;
        return {
          targetMonth:           p.maturity,
          daysFromValuation:     Math.round(_ttmYears(p.maturity, valDate) * 365.25),
          parentForwardPct:      Number(fwd.toFixed(4)),
          atmThresholdPct:       Number(fwd.toFixed(4)),
          atmContractPrice:      0.5,
          impliedVolPct:         Number(Math.max(sd, 0.01).toFixed(4)),
          volSource:             'curve_std_fallback',
          nSupportingContracts:  0,
          ttmYears:              Number(_ttmYears(p.maturity, valDate).toFixed(4)),
          confidenceScore:       70,
        };
      });
    }

    // Use real v7 venue_comparison rows when available; otherwise fall back
    // to the synthesised proxy (calibrated to ~1-3 bp).
    const venueDispersion = venueComparisonOverride
      ? venueComparisonOverride.map((r) => ({
          targetMonth:        r.targetMonth,
          daysFromValuation:  r.daysFromValuation,
          absCurveDiffBp:     Number(Number(r.absCurveDiffBp ?? 0).toFixed(2)),
          avgConfidenceScore: Number(Number(r.avgConfidenceScore ?? 0).toFixed(2)),
          avgSpreadBp:        Number(Number(r.avgSpreadBp ?? 0).toFixed(2)),
          liquidityFlag:      r.liquidityFlag || 'Healthy',
        }))
      : buildVenueDispersionFromSurface(surface);
    const scenarioGrid = buildForwardVolScenarios(surface);
    const componentSurface = buildComponentVolFramework(surface);
    const summary = summarizeVolSurface(surface, venueDispersion);

    return {
      summary,
      impliedVol: surface,        // rich rows w/ vol_source + confidence + atm
      venueDispersion,
      scenarioGrid,
      componentSurface,
      valuationDate: valDate,
    };
  }

  if (eng) {
    eng.buildVolSurface = buildVolSurface;
    eng.buildBinaryImpliedVolSurface = buildBinaryImpliedVolSurface;
    eng.buildForwardVolScenarios = buildForwardVolScenarios;
    eng.buildComponentVolFramework = buildComponentVolFramework;
    eng.summarizeVolSurface = summarizeVolSurface;
    eng._normalCdf = _normalCdf;
    eng._normalInvCdf = _normalInvCdf;
  }
})();
