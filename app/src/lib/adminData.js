/* ==========================================================================
   adminData.js — Index Administrator data source.

   Primary: window.__ADMIN_PAYLOAD__ injected by streamlit_bundle.py from the
            v7 services/index_admin.load_index_admin_bundle() call.
            Carries: definition, publicationRecord, observations, quality,
                     outputs, runs, fallback (all v7-real numbers).

   Fallback: a small in-bundle sample so the static index.html still renders
             when the page is opened without the Streamlit wrapper.

   Registers window.App.ADMIN.
   ========================================================================== */
(() => {
  'use strict';

  /* ──────────────────────────  fallback sample  ──────────────────────── */
  const FALLBACK = {
    definition: {
      indexId: 'CPI_BLENDED_REF_v01',
      indexName: 'Oriel CPI Blended Reference Index',
      domain: 'CPI Forward',
      currency: 'USD',
      timezone: 'America/New_York',
      status: 'Active',
      effectiveDate: '2026-01-01',
      methodologyVersion: '0.1.0',
      publicationCadence: 'Daily',
      refreshCadenceSeconds: 60,
      description:
        'Governed blend of Kalshi and ForecastEx CPI markets. Eligibility-weighted blending with monotone smoothing produces the published reference; an OTC-anchored fair-value layer overlays for diagnostics.',
    },
    publicationRecord: {
      runId: 'run_2026-04-28_001',
      indexId: 'CPI_BLENDED_REF_v01',
      methodologyVersion: '0.1.0',
      asOf: '2026-04-28T14:00:00Z',
      publicationStatus: 'published',
      publishedBuckets: ['Mar 26', 'Jun 26', 'Sep 26', 'Dec 26'],
      heldBuckets: ['Mar 27', 'Jun 27'],
      overrideApplied: false,
      overrideNote: null,
      createdAt: '2026-04-28T14:00:04Z',
    },
    observations: [
      { targetMonth: 'Mar 26', venue: 'kalshi', instrumentId: 'KAL_MAR26', impliedValue: 3.34, bid: 0.79, ask: 0.83, mid: 3.34, spreadBps: 4.0, depth: 12500, openInterest: 4200, sourceTimestamp: '2026-04-28 14:00:08', ageSeconds: 32, weight: 0.31, isEligible: true, exclusionReason: null },
    ],
    quality: [
      { targetMonth: 'Mar 26', coverageScore: 1.0, freshnessScore: 0.92, depthScore: 0.92, spreadScore: 0.96, oiScore: 0.85, balanceScore: 0.92, qualityScore: 0.92, timestampIntegrityScore: 0.83, sourceDiversityScore: 0.82, fallbackPenaltyAdjustedScore: 1.0, continuityScore: 1.0, publishabilityScore: 0.92, publicationDecision: 'publish' },
    ],
    outputs: [
      { targetMonth: 'Mar 26', publishabilityScore: 0.92, fallbackUsed: false, fallbackLevel: null, observedMarketImplied: 3.34, blendedReference: 3.36, fairValue: 3.40, topWeightedSource: 'kalshi', publicationDecision: 'publish', reasonCodes: [] },
    ],
    runs: [
      { runId: 'run_2026-04-28_001', asOf: '2026-04-28T14:00:00+00:00', methodologyVersion: '0.1.0', publishedBuckets: 4, heldBuckets: 2, restrictedBuckets: 0, overrides: 'No', fallbackCount: 0 },
    ],
    fallback: [
      { targetMonth: 'Mar 26', fallbackUsed: false, fallbackLevel: 'multi-source eligible market blend', fallbackReason: 'none' },
    ],
    meta: { version: 'fallback', module: 'adminData.js fallback', phaseLabel: 'Index Administrator (sample)' },
  };

  /* Read the live payload first; fall back to sample if not injected. */
  const payload = (typeof window !== 'undefined' && window.__ADMIN_PAYLOAD__) || FALLBACK;
  const isLive  = payload !== FALLBACK;

  /* ──────────────────────────  decision helpers  ─────────────────────── */
  function decisionTone(decision) {
    if (decision === 'publish')    return 'success';
    if (decision === 'restricted') return 'warning';
    if (decision === 'hold')       return 'danger';
    return 'default';
  }
  function decisionLabel(decision) {
    if (decision === 'publish')    return 'Publish';
    if (decision === 'restricted') return 'Restricted';
    if (decision === 'hold')       return 'Hold';
    return decision || '—';
  }

  function avgPublishability() {
    const xs = (payload.quality || []).map((q) => q.publishabilityScore).filter((v) => v != null);
    if (!xs.length) return 0;
    return xs.reduce((s, v) => s + v, 0) / xs.length;
  }

  function decisionCounts() {
    const counts = { publish: 0, restricted: 0, hold: 0 };
    (payload.quality || []).forEach((q) => {
      if (q.publicationDecision in counts) counts[q.publicationDecision] += 1;
    });
    return counts;
  }

  function avgScore(field) {
    const xs = (payload.quality || []).map((q) => q[field]).filter((v) => v != null);
    if (!xs.length) return null;
    return xs.reduce((s, v) => s + v, 0) / xs.length;
  }

  function venueWeightStack() {
    /* Per-month, per-venue summed weight (eligible only) — for the
       stacked-bar Venue Weight Distribution chart. */
    const map = {};            // month → { venue → weight }
    const venues = new Set();
    (payload.observations || []).forEach((o) => {
      if (!o.isEligible) return;
      if (!map[o.targetMonth]) map[o.targetMonth] = {};
      map[o.targetMonth][o.venue] = (map[o.targetMonth][o.venue] || 0) + (o.weight || 0);
      venues.add(o.venue);
    });
    const months = Object.keys(map).sort();
    const venueList = Array.from(venues).sort();
    return {
      months,
      venues: venueList,
      data: months.map((m) => {
        const row = { month: m };
        venueList.forEach((v) => { row[v] = map[m][v] || 0; });
        return row;
      }),
    };
  }

  window.App = window.App || {};
  window.App.ADMIN = {
    DEFINITION:         payload.definition,
    PUBLICATION_RECORD: payload.publicationRecord,
    OBSERVATIONS:       payload.observations || [],
    QUALITY:            payload.quality || [],
    OUTPUTS:            payload.outputs || [],
    RUNS:               payload.runs || [],
    FALLBACK:           payload.fallback || [],
    META:               payload.meta || {},
    isLive,
    avgPublishability,
    avgScore,
    decisionCounts,
    decisionTone,
    decisionLabel,
    venueWeightStack,
  };
})();
