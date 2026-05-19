/* ==========================================================================
   ParityOverviewPanel.jsx — OTC Parity Validation, redesigned (v3).

   Same 4 sub-tabs as v7's parity_tab.py — promoted to the main DetailTabBar
   (same splice pattern as perp). Each sub-tab uses the SAME layout
   vocabulary as every other CPI / index tab in this app:

       ┌────────────────────────────────────────────────────────┐
       │  KPI STRIP   5 cells, headline metrics for this view   │
       ├──────────────────────────────────┬─────────────────────┤
       │                                  │  Print card         │
       │  CHART CARD                      │  (.ip-card)         │
       │  (.herochart-card)               │                     │
       │  [Inner tabs: Rates / Index Path]│  Scorecard card     │
       │                                  │  (.ip-card)         │
       ├──────────────────────────────────┴─────────────────────┤
       │  TABLE (full width, .data-card)                        │
       └────────────────────────────────────────────────────────┘

   Notes on the 4 sub-tabs:
     • 'term'    — Term Calibration   (DTCC live tenor structure, REFERENCE)
     • 'tight'   — Reference OTC      (parity engine vs Tighter benchmark)
     • 'dtcc'    — DTCC SDR Sample    (parity vs DTCC; PLUS trade-level table)
     • 'stress'  — Stress Case        (parity vs negative control — fails)

   v7 demo data is constructed so DTCC monthly medians equal Tighter quotes;
   what makes the DTCC tab visibly distinct: 12 raw SDR trade rows below.

   Registers window.App.ParityOverviewPanel.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useRef, useEffect, useMemo } = React;
  const { cn } = window.App.utils;
  const { Icon } = window.App;

  /* ───────────────────────── helpers ───────────────────────── */
  const fmtBp     = (v, dp = 2) => v == null || !isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(dp)} bp`;
  const fmtBpAbs  = (v, dp = 2) => v == null || !isFinite(v) ? '—' : `${Number(v).toFixed(dp)} bp`;
  const fmtPct0   = (v) => v == null || !isFinite(v) ? '—' : `${Number(v).toFixed(0)}%`;
  const fmtRate   = (v, dp = 3) => v == null || !isFinite(v) ? '—' : `${Number(v).toFixed(dp)}%`;
  const fmtR2     = (v) => v == null || !isFinite(v) ? 'n/a' : Number(v).toFixed(4);
  const fmtBn     = (v, dp = 2) => v == null || !isFinite(v) ? '—' : `$${(Number(v) / 1e9).toFixed(dp)}B`;
  const fmtMn     = (v, dp = 1) => v == null || !isFinite(v) ? '—' : `$${(Number(v) / 1e6).toFixed(dp)}M`;
  const fmtInt    = (v) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString();
  const monthLbl  = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
      return `${m} ${d.getUTCFullYear()}`;
    } catch (e) { return String(iso).slice(0, 10); }
  };
  const fmtTimeUtc = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    } catch (e) { return String(iso); }
  };

  function useChartSize(initialW = 560, initialH = 320) {
    const ref = useRef(null);
    const [size, setSize] = useState({ w: initialW, h: initialH });
    useEffect(() => {
      if (!ref.current || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(([e]) => {
        const rect = e.contentRect;
        setSize({ w: rect.width || initialW, h: rect.height || initialH });
      });
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, []);
    return [ref, size.w, size.h];
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TOP-LEVEL ROUTER
     ═══════════════════════════════════════════════════════════════════════ */
  function ParityOverviewPanel({ index, subtab }) {
    const p = index?.detail?.parity;
    if (!p) {
      return (
        <div className="card">
          <div className="placeholder">
            <div className="placeholder-icon"><Icon name="layers" size={26} /></div>
            <div className="placeholder-title">Parity payload not available</div>
            <div className="placeholder-text">Check the streamlit log for v7 parity import errors.</div>
          </div>
        </div>
      );
    }
    const accent = index.accent || 'accent';
    const view = subtab || 'term';

    return (
      <div className={cn('parity-page', `accent-${accent}`)}>
        {view === 'term'   && p.term  && <TermView      term={p.term}  accent={accent} />}
        {view === 'tight'  && p.tight && <ParityView    blob={p.tight} accent={accent} variant="tight" />}
        {view === 'dtcc'   && p.dtcc  && <ParityView    blob={p.dtcc}  accent={accent} variant="dtcc" />}
        {view === 'stress' && p.neg   && <ParityView    blob={p.neg}   accent={accent} variant="stress" />}
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PER-BENCHMARK VIEW (tight / dtcc / stress)
     ═══════════════════════════════════════════════════════════════════════ */
  function ParityView({ blob, accent, variant }) {
    const s = blob.summary;
    const thr = s.thresholds || {};
    const sm  = s.shape_metrics || {};
    const cs  = s.conditions || {};
    const front = (blob.parityRows || [])[0];

    return (
      <div className="parity-view">
        {/* TOP — KPI STRIP (this sub-tab's headline metrics) */}
        <ParityKpiStrip blob={blob} variant={variant} accent={accent} />

        {/* HERO ROW — chart card (inner tabs) + rail with 2 .ip-card */}
        <div className="hero-row">
          <ParityChartCard blob={blob} accent={accent} variant={variant} />
          <div className="hero-row-rail">
            <ParityPrintCard blob={blob} variant={variant} accent={accent} />
            <GateScorecardCard s={s} thr={thr} sm={sm} cs={cs} accent={accent} />
          </div>
        </div>

        {/* TABLE BELOW — full width parity detail */}
        <ParityDetailCard rows={blob.parityRows} accent={accent} />

        {/* DTCC ONLY — extra trade-level table makes the DTCC tab distinct */}
        {variant === 'dtcc' && Array.isArray(blob.dtccTrades) && blob.dtccTrades.length > 0 && (
          <DtccTradeTable rows={blob.dtccTrades} accent={accent} />
        )}

        {/* v7's bottom row — Front Maturity card | Methodology note,
            side-by-side with col_front:1 / col_meth:1.55 ratio. */}
        <div className="parity-foot-row">
          <FrontMaturityCard front={front} thr={thr} accent={accent} />
          <ParityMethNote blob={blob} thr={thr} />
        </div>
      </div>
    );
  }

  /* ── Front Maturity — same .idx-kpi shell as the top KPI strip + the
     same .parity-kpi-cell horizontal cells, so visually it reads as a
     mini KPI strip docked at the bottom of the page. Same chrome as
     everything else. */
  function FrontMaturityCard({ front, thr, accent }) {
    if (!front) return null;
    const tol = thr.tolerance_bps || 10;
    const pass = Math.abs(front.diffBps) <= tol;
    const cells = [
      { label: 'ORIEL Forward', value: fmtRate(front.orielRatePct), sub: 'Implied YoY %', mono: true, lead: true },
      { label: 'OTC CPI Swap',  value: fmtRate(front.otcYoyRate),   sub: 'Reference quote',  mono: true },
      { label: 'Basis',         value: fmtBp(front.diffBps),         sub: pass ? 'Within tolerance' : 'Outside tolerance',
        mono: true, tone: pass ? 'pass' : 'fail' },
    ];
    return (
      <section className={cn('idx-kpi parity-kpi parity-foot-kpi', `accent-${accent}`)}>
        <div className="idx-kpi-ribbon">
          <span className="idx-kpi-ribbon-tag">FRONT MATURITY</span>
          <span className="idx-kpi-ribbon-sep">·</span>
          <span className="idx-kpi-ribbon-venue">{front.targetMonthLabel} · ORIEL forward vs OTC swap · ±{tol.toFixed(0)} bp tolerance</span>
        </div>
        <div className="parity-kpi-grid parity-kpi-grid-3">
          {cells.map((c, i) => (
            <div key={i} className={cn('parity-kpi-cell', c.lead && 'lead', c.tone && `tone-${c.tone}`)}>
              <div className="parity-kpi-cell-label">{c.label}</div>
              <div className={cn('parity-kpi-cell-value', c.mono && 'font-mono')}>{c.value}</div>
              <div className="parity-kpi-cell-sub">{c.sub}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  /* ── Methodology — same .idx-kpi shell + a 5-cell horizontal grid so it
     visually pairs with FrontMaturityCard above. */
  function ParityMethNote({ blob, thr }) {
    const cells = [
      { label: 'Benchmark',     value: <code className="parity-mono-code">{blob.benchmark.file}</code>, sub: 'CSV file' },
      { label: 'Standard',      value: 'OTC CPI quote curve', sub: 'cleaned, not raw SDR' },
      { label: 'Tolerance',     value: `±${thr.tolerance_bps?.toFixed(0)} bp`, sub: 'locked', mono: true },
      { label: 'Gate logic',    value: 'Basis ∧ Shape', sub: 'both must pass' },
      { label: 'Shape metric',  value: 'Dense-grid R²', sub: 'pillar R² diagnostic only' },
    ];
    return (
      <section className="idx-kpi parity-kpi parity-foot-kpi">
        <div className="idx-kpi-ribbon">
          <span className="idx-kpi-ribbon-tag">METHODOLOGY</span>
          <span className="idx-kpi-ribbon-sep">·</span>
          <span className="idx-kpi-ribbon-venue">Benchmark file · standard · tolerance · gate logic · shape metric</span>
        </div>
        <div className="parity-kpi-grid parity-kpi-grid-5">
          {cells.map((c, i) => (
            <div key={i} className="parity-kpi-cell">
              <div className="parity-kpi-cell-label">{c.label}</div>
              <div className={cn('parity-kpi-cell-value', c.mono && 'font-mono')}>{c.value}</div>
              <div className="parity-kpi-cell-sub">{c.sub}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  /* ── KPI strip (standalone, lives at the top of each sub-tab body)
       Two-level grid mirrors v7 parity_tab.py — top row carries the headline
       metrics, second row breaks down the R² shape metrics (pillars / dense
       grid / rate diagnostic), and a footnote explains why dense-grid R² is
       primary and rate R² is diagnostic only. ── */
  function ParityKpiStrip({ blob, variant, accent }) {
    const s   = blob.summary;
    const thr = s.thresholds || {};
    const sm  = s.shape_metrics || {};
    const cs  = s.conditions || {};
    const tol = thr.tolerance_bps || 10;
    const tradeCount = Array.isArray(blob.dtccTrades) ? blob.dtccTrades.length : null;

    let topCells;
    if (variant === 'dtcc') {
      topCells = [
        { label: 'Overall',           value: s.overall_status, sub: `${s.months_tested} pillars`, tone: tonePass(s.overall_status), lead: true },
        { label: 'Avg abs basis',     value: fmtBpAbs(s.avg_abs_basis_bp), sub: `Limit ≤ ${thr.max_avg_abs_basis_bps?.toFixed(0)} bp`, tone: cs.avg_abs_basis_within_limit ? 'pass' : 'fail', mono: true },
        { label: 'Max abs basis',     value: fmtBpAbs(s.max_abs_basis_bp), sub: `Limit ≤ ${thr.max_max_abs_basis_bps?.toFixed(0)} bp`, tone: cs.max_abs_basis_within_limit ? 'pass' : 'fail', mono: true },
        { label: 'SDR trades',        value: fmtInt(tradeCount), sub: `${tradeCount}/${s.months_tested} per month`, mono: true, accent: true },
        { label: 'Source',            value: 'DTCC SDR', sub: 'Static · 2026Q2' },
      ];
    } else {
      topCells = [
        { label: 'Overall',           value: s.overall_status, sub: `${s.months_tested} pillars`, tone: tonePass(s.overall_status), lead: true },
        { label: 'Basis Gate',        value: s.basis_gate_status, sub: 'Level alignment',         tone: tonePass(s.basis_gate_status) },
        { label: 'Shape Gate',        value: s.shape_gate_status, sub: 'Index R² (dense)',        tone: tonePass(s.shape_gate_status) },
        { label: 'Avg / Max basis',   value: <DualCell a={fmtBpAbs(s.avg_abs_basis_bp)} b={fmtBpAbs(s.max_abs_basis_bp)} />, sub: `Limit ≤ ${thr.max_avg_abs_basis_bps?.toFixed(0)} bp`, mono: true, tone: cs.max_abs_basis_within_limit ? 'pass' : 'fail' },
        { label: `Within ±${tol.toFixed(0)} bp`, value: fmtPct0(s.pct_within_tolerance), sub: `Need ≥ ${thr.min_pct_within_tolerance?.toFixed(0)}%`, mono: true, tone: cs.pct_within_tolerance_sufficient ? 'pass' : 'fail' },
      ];
    }
    // Second row: R² shape metrics breakdown — matches v7's 3-cell sub-row
    const r2Cells = [
      { label: 'Index R² (Pillars)',    value: fmtR2(sm.pillar_r2_index), sub: `Need ≥ ${thr.min_index_pillar_r2?.toFixed(2)}`, mono: true, tone: cs.pillar_index_r2_sufficient ? 'pass' : 'warn' },
      { label: 'Index R² (Dense Grid)', value: fmtR2(sm.curve_r2_index),  sub: `Need ≥ ${thr.min_index_curve_r2?.toFixed(2)} · primary`,  mono: true, tone: cs.curve_index_r2_sufficient ? 'pass' : 'warn' },
      { label: 'Rate R² (Diagnostic)',  value: fmtR2(s.r_squared),         sub: 'Secondary diagnostic only',                              mono: true },
    ];
    // Per Ksenia's UI pass: on the stress sub-view the raw CSV filename
    // (otc_cpi_quotes_negative_control.csv) was being read by external
    // viewers as the failure cause rather than as the deliberate negative
    // control. Replace it with the human-readable "OTC control file" tag
    // so the ribbon communicates intent (this is a publish-block scenario)
    // instead of just file plumbing. Real benchmark sub-views keep their
    // CSV filename so reviewers can still trace the source.
    const fileTag = variant === 'stress' ? 'OTC control file' : blob.benchmark.file;
    const ribbonText = `${blob.benchmark.label} · ${fileTag} · tolerance ±${tol.toFixed(0)} bp`;
    return (
      <section className={cn('idx-kpi parity-kpi', `accent-${accent}`)}>
        <div className="idx-kpi-ribbon">
          <span className="idx-kpi-ribbon-tag">{labelOf(variant)}</span>
          <span className="idx-kpi-ribbon-sep">·</span>
          <span className="idx-kpi-ribbon-venue">{ribbonText}</span>
        </div>
        <div className="parity-kpi-grid">
          {topCells.map((c, i) => (
            <div key={i} className={cn('parity-kpi-cell', c.lead && 'lead', c.tone && `tone-${c.tone}`, c.accent && 'accent')}>
              <div className="parity-kpi-cell-label">{c.label}</div>
              <div className={cn('parity-kpi-cell-value', c.mono && 'font-mono')}>{c.value}</div>
              <div className="parity-kpi-cell-sub">{c.sub}</div>
            </div>
          ))}
        </div>
        <div className="parity-kpi-grid parity-kpi-grid-3 parity-kpi-row-2">
          {r2Cells.map((c, i) => (
            <div key={i} className={cn('parity-kpi-cell', 'small', c.tone && `tone-${c.tone}`)}>
              <div className="parity-kpi-cell-label">{c.label}</div>
              <div className={cn('parity-kpi-cell-value', c.mono && 'font-mono')}>{c.value}</div>
              <div className="parity-kpi-cell-sub">{c.sub}</div>
            </div>
          ))}
        </div>
        <div className="parity-kpi-foot">
          Index R² measures curve shape alignment in index space (primary validation metric). Rate R² is a secondary diagnostic.
        </div>
      </section>
    );
  }

  function DualCell({ a, b }) {
    return (
      <span className="parity-kpi-dual">
        <span className="parity-kpi-dual-primary">{a}</span>
        <span className="parity-kpi-dual-sep">·</span>
        <span className="parity-kpi-dual-secondary">{b}</span>
      </span>
    );
  }
  function tonePass(status) { return status === 'PASS' ? 'pass' : (status === 'FAIL' ? 'fail' : null); }
  function labelOf(variant) {
    return ({ tight: 'OTC PARITY', dtcc: 'SDR CROSS-CHECK', stress: 'STRESS TEST' })[variant] || 'VALIDATION';
  }

  /* ── Chart card with INNER TABS [Rates / Index Path] ── */
  function ParityChartCard({ blob, accent, variant }) {
    const [tab, setTab] = useState('rates');
    const tol = blob.summary.thresholds?.tolerance_bps || 10;
    const headSub = tab === 'rates'
      ? (variant === 'stress'
          ? 'Stress case — basis exceeds the ±tolerance band; visualizes a publish-block scenario.'
          : `Both curves overlaid with shaded basis area · ${blob.parityRows?.length || 0} pillar months · tolerance ±${tol.toFixed(0)} bp`)
      : `${blob.gridRows?.length || 0} interpolated daily points · pillars marked · ORIEL vs OTC implied index path`;
    const onExpand = () => window.App.expandChart({
      title: tab === 'rates' ? 'ORIEL vs OTC swap curve' : 'Index-space curve alignment',
      sub: headSub,
      accent,
      render: () => tab === 'rates'
        ? <RatesChart blob={blob} accent={accent} variant={variant} />
        : <IndexCurve blob={blob} accent={accent} />,
    });
    return (
      <section className={cn('herochart-card', `accent-${accent}`)}>
        <header className="herochart-head">
          <div className="herochart-head-text">
            <div className="herochart-title">
              {tab === 'rates' ? 'ORIEL vs OTC swap curve' : 'Index-space curve alignment'}
            </div>
            <div className="herochart-sub">{headSub}</div>
          </div>
          <div className="herochart-head-right">
            <div className="herochart-legend">
              <span className={cn('herochart-legend-dot', `accent-${accent}`)} />
              <span>ORIEL</span>
              <span className="herochart-legend-dash" />
              <span>OTC</span>
              {tab === 'rates' && <>
                <span className={cn('herochart-legend-band', `accent-${accent}`)} />
                <span>basis</span>
              </>}
            </div>
            <div className="herochart-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'rates'}
                      className={cn('herochart-tab', tab === 'rates' && 'active')}
                      onClick={() => setTab('rates')}>Rates</button>
              <button type="button" role="tab" aria-selected={tab === 'index'}
                      className={cn('herochart-tab', tab === 'index' && 'active')}
                      onClick={() => setTab('index')}>Index path</button>
            </div>
            <button type="button" className="chart-expand-btn" onClick={onExpand}
                    aria-label="Expand chart" title="Expand chart">
              <Icon name="maximize" size={14} />
            </button>
          </div>
        </header>
        <div className="herochart-body">
          {tab === 'rates' ? <RatesChart blob={blob} accent={accent} variant={variant} />
                           : <IndexCurve blob={blob} accent={accent} />}
        </div>
      </section>
    );
  }

  /* ── ORIEL vs OTC line chart (inner tab: Rates) ── */
  function RatesChart({ blob, accent, variant }) {
    const [ref, w, hMeasured] = useChartSize(560, 320);
    const [hoverIdx, setHoverIdx] = useState(null);
    const rows = blob.parityRows || [];

    const layout = useMemo(() => {
      if (!rows.length) return null;
      const h = Math.max(hMeasured || 0, 280);
      const padL = 60, padR = 24, padT = 18, padB = 44;
      const innerW = Math.max(w - padL - padR, 40);
      const innerH = h - padT - padB;
      const allY = [...rows.map((r) => r.orielRatePct), ...rows.map((r) => r.otcYoyRate)].filter((v) => v != null && isFinite(v));
      const yMin = Math.min(...allY);
      const yMax = Math.max(...allY);
      const span = (yMax - yMin) || 1;
      const yLo = yMin - span * 0.30;
      const yHi = yMax + span * 0.30;
      const ySpan = yHi - yLo || 1;
      const x = (i) => padL + (rows.length === 1 ? innerW / 2 : (innerW * i) / (rows.length - 1));
      const y = (v) => padT + innerH - ((v - yLo) / ySpan) * innerH;
      const orielPts = rows.map((r, i) => ({ ...r, cx: x(i), cy: y(r.orielRatePct) }));
      const otcPts   = rows.map((r, i) => ({ ...r, cx: x(i), cy: y(r.otcYoyRate)   }));
      const orielPath = orielPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p.cy.toFixed(2)}`).join(' ');
      const otcPath   = otcPts.map((p, i)   => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p.cy.toFixed(2)}`).join(' ');
      const areaPath = orielPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p.cy.toFixed(2)}`).join(' ')
                     + ' ' + otcPts.slice().reverse().map((p) => `L ${p.cx.toFixed(2)} ${p.cy.toFixed(2)}`).join(' ') + ' Z';
      const ticks = 4;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = yLo + (ySpan * k) / ticks;
        return { v, y: y(v) };
      });
      return { w, h, padL, padR, padT, padB, innerW, innerH, orielPts, otcPts, orielPath, otcPath, areaPath, yTicks, hitW: Math.max(innerW / rows.length, 32) };
    }, [rows, w, hMeasured]);

    if (!layout) return <div className="chart-empty">No parity rows.</div>;
    const hover = hoverIdx !== null ? layout.orielPts[hoverIdx] : null;
    const otcHover = hoverIdx !== null ? layout.otcPts[hoverIdx] : null;

    return (
      <div ref={ref} className="parity-chart-canvas">
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width={layout.w} height={layout.h}>
          {layout.yTicks.map((t, i) => (
            <line key={`g-${i}`} x1={layout.padL} x2={layout.w - layout.padR}
                  y1={t.y} y2={t.y}
                  stroke="var(--border-subtle)" strokeWidth="1"
                  vectorEffect="non-scaling-stroke" />
          ))}
          <path d={layout.areaPath} fill="var(--accent)" fillOpacity={variant === 'stress' ? 0.18 : 0.10} />
          <path d={layout.otcPath} fill="none"
                stroke="var(--text-muted)" strokeWidth="2"
                strokeDasharray="5 4" strokeLinecap="round"
                vectorEffect="non-scaling-stroke" opacity="0.9" />
          {layout.otcPts.map((p, i) => (
            <circle key={`otc-${i}`} cx={p.cx} cy={p.cy} r="3.5"
                    fill="white" stroke="var(--text-muted)" strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke" />
          ))}
          <path d={layout.orielPath} fill="none"
                stroke="var(--accent)" strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" />
          {layout.orielPts.map((p, i) => (
            <circle key={`or-${i}`} cx={p.cx} cy={p.cy}
                    r={hoverIdx === i ? 6 : 5}
                    fill="var(--accent)" stroke="white" strokeWidth="1.6"
                    vectorEffect="non-scaling-stroke" />
          ))}
          {layout.yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={layout.padL - 8} y={t.y + 3}
                  textAnchor="end" fontSize="10.5" fontFamily="JetBrains Mono, monospace"
                  fill="var(--text-subtle)">
              {`${Number(t.v).toFixed(2)}%`}
            </text>
          ))}
          <text x={14} y={layout.padT + layout.innerH / 2}
                textAnchor="middle" fontSize="11" fill="var(--text-muted)"
                fontFamily="Inter, system-ui"
                transform={`rotate(-90, 14, ${layout.padT + layout.innerH / 2})`}>
            YoY %
          </text>
          {layout.orielPts.map((p, i) => (
            <text key={`xl-${i}`} x={p.cx} y={layout.h - 16}
                  textAnchor="middle" fontSize="10.5"
                  fill="var(--text-muted)" fontFamily="Inter, system-ui">
              {p.targetMonthLabel}
            </text>
          ))}
          {layout.orielPts.map((p, i) => (
            <rect key={`hit-${i}`} x={p.cx - layout.hitW / 2} y={layout.padT}
                  width={layout.hitW} height={layout.innerH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)} />
          ))}
        </svg>
        {hover && (() => {
          /* Clamp horizontal centre so the tooltip can't clip past
             either chart edge (transform: translate(-50%, -100%)). */
          const HALF_W = 110;
          const clampedCx = Math.max(HALF_W, Math.min(layout.w - HALF_W, hover.cx));
          return (
            <div className="parity-tooltip"
                 style={{ left: `${clampedCx}px`,
                          top: `${Math.min(hover.cy, otcHover?.cy ?? hover.cy) - 14}px` }}>
              <div className="parity-tooltip-title">{hover.targetMonthLabel}</div>
              <div className="parity-tooltip-row"><span>ORIEL</span><span className="font-mono">{fmtRate(hover.orielRatePct, 3)}</span></div>
              <div className="parity-tooltip-row"><span>OTC</span><span className="font-mono">{fmtRate(hover.otcYoyRate, 3)}</span></div>
              <div className="parity-tooltip-row"><span>Basis</span><span className={cn('font-mono', hover.withinTolerance ? 'tone-pass' : 'tone-fail')}>{fmtBp(hover.diffBps)}</span></div>
            </div>
          );
        })()}
      </div>
    );
  }

  /* ── Index-space curve (inner tab: Index path) ── */
  function IndexCurve({ blob, accent }) {
    const [ref, w, hMeasured] = useChartSize(560, 320);
    const [hoverIdx, setHoverIdx] = useState(null);
    const grid = blob.gridRows || [];
    const pillars = blob.parityRows || [];

    const layout = useMemo(() => {
      if (!grid.length) return null;
      const h = Math.max(hMeasured || 0, 280);
      const padL = 64, padR = 24, padT = 18, padB = 36;
      const innerW = Math.max(w - padL - padR, 40);
      const innerH = h - padT - padB;
      const allY = [...grid.map((g) => g.orielImpliedIndex), ...grid.map((g) => g.otcImpliedIndex)].filter((v) => v != null && isFinite(v));
      const yMin = Math.min(...allY);
      const yMax = Math.max(...allY);
      const span = (yMax - yMin) || 1;
      const yLo = yMin - span * 0.10;
      const yHi = yMax + span * 0.10;
      const ySpan = yHi - yLo || 1;
      const x = (i) => padL + (grid.length === 1 ? innerW / 2 : (innerW * i) / (grid.length - 1));
      const y = (v) => padT + innerH - ((v - yLo) / ySpan) * innerH;
      const orielPath = grid.map((g, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(g.orielImpliedIndex).toFixed(2)}`).join(' ');
      const otcPath   = grid.map((g, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(g.otcImpliedIndex).toFixed(2)}`).join(' ');
      const pillarMarks = pillars.map((p) => {
        const idx = grid.findIndex((g) => g.targetMonth === p.targetMonth);
        if (idx < 0) return null;
        return { ...p, cx: x(idx), oy: y(grid[idx].orielImpliedIndex), ty: y(grid[idx].otcImpliedIndex) };
      }).filter(Boolean);
      const labelStep = Math.max(1, Math.floor(grid.length / 6));
      const xLabels = grid.filter((_, i) => i % labelStep === 0).map((g, k) => ({ label: monthLbl(g.targetMonth), cx: x(k * labelStep) }));
      const ticks = 4;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = yLo + (ySpan * k) / ticks;
        return { v, y: y(v) };
      });
      return { w, h, padL, padR, padT, padB, innerW, innerH, orielPath, otcPath, pillarMarks, xLabels, yTicks };
    }, [grid, pillars, w, hMeasured]);

    if (!layout) return <div className="chart-empty">No grid data.</div>;
    const hover = hoverIdx !== null ? layout.pillarMarks[hoverIdx] : null;

    return (
      <div ref={ref} className="parity-chart-canvas">
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width={layout.w} height={layout.h}>
          {layout.yTicks.map((t, i) => (
            <line key={`g-${i}`} x1={layout.padL} x2={layout.w - layout.padR}
                  y1={t.y} y2={t.y}
                  stroke="var(--border-subtle)" strokeWidth="1"
                  vectorEffect="non-scaling-stroke" />
          ))}
          <path d={layout.otcPath} fill="none"
                stroke="var(--text-muted)" strokeWidth="2"
                strokeDasharray="5 4" strokeLinecap="round"
                vectorEffect="non-scaling-stroke" opacity="0.85" />
          <path d={layout.orielPath} fill="none"
                stroke="var(--accent)" strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" />
          {layout.pillarMarks.map((p, i) => (
            <g key={`p-${i}`}>
              <circle cx={p.cx} cy={p.ty} r="3.5"
                      fill="white" stroke="var(--text-muted)" strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke" />
              <circle cx={p.cx} cy={p.oy} r={hoverIdx === i ? 5.5 : 4.5}
                      fill="var(--accent)" stroke="white" strokeWidth="1.6"
                      vectorEffect="non-scaling-stroke" />
              <rect x={p.cx - 18} y={layout.padT}
                    width={36} height={layout.innerH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)} />
            </g>
          ))}
          {layout.yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={layout.padL - 8} y={t.y + 3}
                  textAnchor="end" fontSize="10" fontFamily="JetBrains Mono, monospace"
                  fill="var(--text-subtle)">
              {Number(t.v).toFixed(2)}
            </text>
          ))}
          {layout.xLabels.map((l, i) => (
            <text key={`xl-${i}`} x={l.cx} y={layout.h - 12}
                  textAnchor="middle" fontSize="10"
                  fill="var(--text-muted)" fontFamily="Inter, system-ui">
              {l.label}
            </text>
          ))}
        </svg>
        {hover && (() => {
          const HALF_W = 110;
          const clampedCx = Math.max(HALF_W, Math.min(layout.w - HALF_W, hover.cx));
          return (
            <div className="parity-tooltip"
                 style={{ left: `${clampedCx}px`,
                          top: `${Math.min(hover.oy, hover.ty) - 14}px` }}>
              <div className="parity-tooltip-title">{hover.targetMonthLabel}</div>
              <div className="parity-tooltip-row"><span>ORIEL idx</span><span className="font-mono">{Number(hover.orielImpliedIndex).toFixed(3)}</span></div>
              <div className="parity-tooltip-row"><span>OTC idx</span><span className="font-mono">{Number(hover.otcImpliedIndex).toFixed(3)}</span></div>
              <div className="parity-tooltip-row"><span>Basis</span><span className={cn('font-mono', hover.withinTolerance ? 'tone-pass' : 'tone-fail')}>{fmtBp(hover.diffBps)}</span></div>
            </div>
          );
        })()}
      </div>
    );
  }

  /* ── Parity Print rail card (.ip-card — same chrome as PerpPrintCard) ──
     Front-pillar info has been moved OUT to the standalone
     FrontMaturityCard + MethodologyNote row at the bottom (matches v7's
     col_front | col_meth row). */
  function ParityPrintCard({ blob, variant, accent }) {
    const s = blob.summary;
    const ok = s.overall_status === 'PASS';
    const tol = s.thresholds?.tolerance_bps || 10;
    const sm  = s.shape_metrics || {};
    return (
      <section className={cn('ip-card', `accent-${accent}`)}>
        <header className="ip-card-head">
          <span className="ip-card-eyebrow">Validation Result</span>
          <span className={cn('ip-card-status', ok ? 'ok' : 'no')}>
            <span className="ip-status-dot" />
            {ok ? 'Publishable' : 'Blocked'}
          </span>
        </header>
        <div className="ip-card-highlight">
          <div className="ip-card-highlight-label">Avg abs basis · ORIEL vs OTC</div>
          <div className="ip-card-highlight-value font-mono">{fmtBpAbs(s.avg_abs_basis_bp)}</div>
        </div>
        <dl className="ip-card-rows">
          <Row label="Benchmark"        value={blob.benchmark.label} />
          <Row label="Months tested"    value={String(s.months_tested)} mono />
          <Row label="Tolerance"        value={`±${tol.toFixed(0)} bp (locked)`} />
          <Row label="Basis gate"       value={s.basis_gate_status} tone={s.basis_gate_status === 'PASS' ? 'success' : 'warning'} strong />
          <Row label="Shape gate"       value={s.shape_gate_status} tone={s.shape_gate_status === 'PASS' ? 'success' : 'warning'} strong />
          <Row label="Index R² dense"   value={fmtR2(sm.curve_r2_index)}  mono />
          <Row label="Index R² pillars" value={fmtR2(sm.pillar_r2_index)} mono />
          <Row label="Avg / Max basis"  value={`${fmtBpAbs(s.avg_abs_basis_bp)} / ${fmtBpAbs(s.max_abs_basis_bp)}`} mono />
        </dl>
      </section>
    );
  }

  function Row({ label, value, mono, tone, strong }) {
    return (
      <div className="ip-card-row">
        <dt>{label}</dt>
        <dd className={cn(mono && 'font-mono', tone && `tone-${tone}`, strong && 'strong')}>{value}</dd>
      </div>
    );
  }

  /* ── Gate Scorecard rail card (.mvs-card chrome — compact, doesn't grow)
     Mirrors PerpStructureCard pattern: smaller, rectangular, sits below
     the bigger .ip-card Print without forcing extra height on the chart.
     Single-line rows: icon · label · mini-bar · observed / limit. */
  function GateScorecardCard({ s, thr, sm, cs, accent }) {
    const tol = thr.tolerance_bps || 10;
    const ok = s.overall_status === 'PASS';
    const items = [
      { label: 'Avg basis',    observed: s.avg_abs_basis_bp,  limit: thr.max_avg_abs_basis_bps,  unit: 'bp', pass: cs.avg_abs_basis_within_limit, dir: 'lower-better' },
      { label: 'Max basis',    observed: s.max_abs_basis_bp,  limit: thr.max_max_abs_basis_bps,  unit: 'bp', pass: cs.max_abs_basis_within_limit, dir: 'lower-better' },
      { label: `Within ±${tol.toFixed(0)} bp`, observed: s.pct_within_tolerance, limit: thr.min_pct_within_tolerance, unit: '%',  pass: cs.pct_within_tolerance_sufficient, dir: 'higher-better' },
      { label: 'R² dense',     observed: sm.curve_r2_index,   limit: thr.min_index_curve_r2,    unit: '',   pass: cs.curve_index_r2_sufficient, dir: 'higher-better', isR2: true },
      { label: 'R² pillars',   observed: sm.pillar_r2_index,  limit: thr.min_index_pillar_r2,   unit: '',   pass: cs.pillar_index_r2_sufficient, dir: 'higher-better', isR2: true },
    ];
    const passed = items.filter((it) => it.pass).length;
    return (
      <section className={cn('mvs-card', `accent-${accent}`)}>
        <header className="mvs-card-head">
          <span className="mvs-card-eyebrow">Gate Scorecard</span>
          <span className={cn('parity-mvs-pill', ok ? 'pass' : 'fail')}>
            {passed}/{items.length} {ok ? 'PASS' : 'failing'}
          </span>
        </header>
        <div className="parity-gates-compact">
          {items.map((it, i) => <ScoreRow key={i} item={it} />)}
        </div>
      </section>
    );
  }

  function ScoreRow({ item }) {
    let ratio = 0;
    if (item.observed != null && item.limit != null && isFinite(item.observed) && isFinite(item.limit) && item.limit !== 0) {
      ratio = Math.max(0, Math.min(item.observed / item.limit, 1.4));
    }
    const tone = item.pass ? 'pass' : 'fail';
    const observedDisplay = item.isR2 ? fmtR2(item.observed)
      : item.unit === 'bp' ? fmtBpAbs(item.observed)
      : item.unit === '%'  ? fmtPct0(item.observed)
      : String(item.observed);
    const limitDisplay = item.isR2 ? `≥${Number(item.limit).toFixed(2)}`
      : item.unit === 'bp' ? `≤${Number(item.limit).toFixed(0)}bp`
      : item.unit === '%'  ? `≥${Number(item.limit).toFixed(0)}%`
      : String(item.limit);

    return (
      <div className={cn('parity-gate-line', `tone-${tone}`)}>
        <span className="parity-gate-line-icon">
          <Icon name={item.pass ? 'check' : 'info'} size={10} />
        </span>
        <span className="parity-gate-line-label">{item.label}</span>
        <span className="parity-gate-line-bar">
          <span className="parity-gate-line-fill" style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
          {ratio > 1 && (
            <span className="parity-gate-line-overflow" style={{ width: `${Math.min((ratio - 1) * 100, 40)}%` }} />
          )}
        </span>
        <span className="parity-gate-line-observed font-mono">{observedDisplay}</span>
        <span className="parity-gate-line-limit">{limitDisplay}</span>
      </div>
    );
  }

  /* ── Parity detail table (full width, sticky-header scroll) ── */
  function ParityDetailCard({ rows, accent }) {
    if (!rows || !rows.length) return null;
    return (
      <section className="data-card">
        <header className="data-card-head">
          <div>
            <div className="data-card-title">Parity Detail by Month</div>
            <div className="data-card-sub">Per-pillar ORIEL vs OTC rates and basis · failing rows tinted</div>
          </div>
        </header>
        <div className="data-card-body">
          <div className="parity-table-scroll">
            <table className="data-table compact parity-detail-table">
              <thead>
                <tr>
                  <th>Target Month</th>
                  <th className="num">ORIEL %</th>
                  <th className="num">OTC %</th>
                  <th className="num">Diff (bp)</th>
                  <th className="num">Abs Diff</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={cn(!r.withinTolerance && 'parity-row-fail')}>
                    <td className="strong">{r.targetMonthLabel}</td>
                    <td className="num font-mono">{fmtRate(r.orielRatePct, 4)}</td>
                    <td className="num font-mono">{fmtRate(r.otcYoyRate, 4)}</td>
                    <td className={cn('num font-mono', r.diffBps >= 0 ? 'tone-pos' : 'tone-neg')}>{fmtBp(r.diffBps)}</td>
                    <td className="num font-mono">{fmtBpAbs(r.absDiffBps)}</td>
                    <td>
                      <span className={cn('parity-status-pill', r.withinTolerance ? 'pass' : 'fail')}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  /* ── DTCC trade-level table (DTCC sub-tab only, dense scroll) ── */
  function DtccTradeTable({ rows, accent }) {
    const byMonth = {};
    rows.forEach((r) => {
      const m = r.targetMonth?.slice(0, 7) || '';
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
    const monthCount = Object.keys(byMonth).length;
    const totalNotional = rows.reduce((s, r) => s + (r.notionalUsd || 0), 0);
    return (
      <section className="data-card">
        <header className="data-card-head">
          <div>
            <div className="data-card-title">DTCC SDR Trade-Level Detail</div>
            <div className="data-card-sub">
              {rows.length} raw SDR prints across {monthCount} target months · {fmtMn(totalNotional)} total notional ·
              aggregated to monthly medians for the parity engine (what makes the DTCC tab distinct from the quote-level Tighter benchmark)
            </div>
          </div>
        </header>
        <div className="data-card-body">
          <div className="parity-table-scroll dense">
            <table className="data-table compact parity-trade-table">
              <thead>
                <tr>
                  <th>Dissemination ID</th>
                  <th>Execution UTC</th>
                  <th>Target Month</th>
                  <th className="num">Fixed Rate</th>
                  <th className="num">Notional</th>
                  <th>Product</th>
                  <th>Quality</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono small">{r.disseminationId}</td>
                    <td className="font-mono small">{fmtTimeUtc(r.executionUtc)}</td>
                    <td className="font-mono">{r.targetMonth}</td>
                    <td className="num font-mono strong">{fmtRate(r.fixedRatePct, 3)}</td>
                    <td className="num font-mono">{fmtMn(r.notionalUsd)}</td>
                    <td className="small">{(r.swapStyle || r.productName || '—')}</td>
                    <td><span className="parity-quality-pill">{r.qualityFlag}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TERM CALIBRATION VIEW
     ═══════════════════════════════════════════════════════════════════════ */
  function TermView({ term, accent }) {
    const a   = term.aggregates || {};
    const std = term.stdTenors || [];
    return (
      <div className="parity-view">
        {/* Reference framing banner (v7 ships this at the top — explicit
            "calibration reference, not parity gate" note so users don't
            mistake the term-rate view for an Oriel-vs-OTC parity check). */}
        <TermReferenceBanner />

        <TermKpiStrip term={term} accent={accent} />
        <div className="hero-row">
          <TermStructureCard rows={std} accent={accent} />
          <div className="hero-row-rail">
            <CalibrationPrintCard term={term} accent={accent} />
            <TenorSnapshotCard rows={std} accent={accent} />
          </div>
        </div>
        <ByTenorTable rows={std} accent={accent} />

        {/* Source provenance footer — matches v7's small grey footnote */}
        <div className="parity-term-source-foot">
          Source: DTCC SDR public CPI swap dataset, normalized to tenor-parity input schema.
          cpi_lag_months is convention-inferred (3M) and should be treated as inferred until a direct
          feed exposes an explicit lag field. Oddball tenors (43M, 7Y, 15Y, 20Y, 27Y) are present in
          the underlying data but filtered from this view; see
          {' '}<code className="parity-mono-code">data/dtcc_term_calibration/</code> for the full set.
        </div>
      </div>
    );
  }

  /* Subtle reference note — matches v7's small grey "note-box" framing
     (one inline line, no big amber border / icon block). */
  function TermReferenceBanner() {
    return (
      <div className="parity-term-note">
        <strong>Calibration reference, not parity:</strong>{' '}
        DTCC SDR public CPI swap data is dominated by tenor-based term trades (1Y / 2Y / 3Y / 5Y / 10Y / 30Y) and
        does not map to a single monthly CPI bucket. This view anchors the Oriel curve to the live OTC term
        structure but is <strong>not</strong> run through the monthly parity gate.
      </div>
    );
  }

  function TermKpiStrip({ term, accent }) {
    const a = term.aggregates || {};
    const w = term.execWindow || {};
    const cells = [
      { label: 'Source',           value: 'DTCC SDR',                   sub: 'Public CPI swaps',                       lead: true },
      { label: 'Total trades',     value: fmtInt(a.totalTrades),        sub: `${a.nAllTenors} tenor buckets`,          mono: true },
      { label: 'Total notional',   value: fmtBn(a.totalNotionalUsd),    sub: 'USD, all tenors',                        mono: true, accent: true },
      { label: 'Std-tenor wtd avg', value: fmtRate(a.stdTenorWtdAvg),   sub: '1Y/2Y/3Y/5Y/10Y/30Y',                    mono: true, tone: 'pass' },
      { label: 'Std tenor coverage', value: `${a.nStdTenors}/6`,         sub: 'Institutional pillars',                  mono: true },
    ];
    return (
      <section className={cn('idx-kpi parity-kpi', `accent-${accent}`)}>
        <div className="idx-kpi-ribbon">
          <span className="idx-kpi-ribbon-tag">TERM CALIBRATION</span>
          <span className="idx-kpi-ribbon-sep">·</span>
          <span className="idx-kpi-ribbon-venue">
            DTCC OTC CPI swap term structure · execution {w.first || '—'} → {w.last || '—'} · REFERENCE only (not parity)
          </span>
        </div>
        <div className="parity-kpi-grid">
          {cells.map((c, i) => (
            <div key={i} className={cn('parity-kpi-cell', c.lead && 'lead', c.tone && `tone-${c.tone}`, c.accent && 'accent')}>
              <div className="parity-kpi-cell-label">{c.label}</div>
              <div className={cn('parity-kpi-cell-value', c.mono && 'font-mono')}>{c.value}</div>
              <div className="parity-kpi-cell-sub">{c.sub}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  /* ── Term Structure chart card (no inner tabs — single chart) ── */
  function TermStructureCard({ rows, accent }) {
    const onExpand = () => window.App.expandChart({
      title: 'DTCC OTC CPI swap term structure',
      sub: 'Notional-weighted avg + median per tenor · faint band shows min/max range · bubble size = trade count',
      accent,
      render: () => <TermStructureChart rows={rows} accent={accent} />,
    });
    return (
      <section className={cn('herochart-card', `accent-${accent}`)}>
        <header className="herochart-head">
          <div className="herochart-head-text">
            <div className="herochart-title">DTCC OTC CPI swap term structure</div>
            <div className="herochart-sub">
              Notional-weighted avg + median per tenor · faint band shows min/max range · bubble size = trade count
            </div>
          </div>
          <div className="herochart-head-right">
            <div className="herochart-legend">
              <span className={cn('herochart-legend-dot', `accent-${accent}`)} />
              <span>Wtd avg</span>
              <span className="herochart-legend-dash" />
              <span>Median</span>
              <span className={cn('herochart-legend-band', `accent-${accent}`)} />
              <span>Range</span>
            </div>
            <button type="button" className="chart-expand-btn" onClick={onExpand}
                    aria-label="Expand chart" title="Expand chart">
              <Icon name="maximize" size={14} />
            </button>
          </div>
        </header>
        <div className="herochart-body">
          <TermStructureChart rows={rows} accent={accent} />
        </div>
      </section>
    );
  }

  function TermStructureChart({ rows, accent }) {
    const [ref, w, hMeasured] = useChartSize(560, 320);
    const [hoverIdx, setHoverIdx] = useState(null);
    const sorted = (rows || []).slice().sort((a, b) => a.tenorMonths - b.tenorMonths);

    const layout = useMemo(() => {
      if (!sorted.length) return null;
      const h = Math.max(hMeasured || 0, 280);
      const padL = 64, padR = 24, padT = 18, padB = 64;
      const innerW = Math.max(w - padL - padR, 40);
      const innerH = h - padT - padB;
      const allY = [...sorted.map((r) => r.notionalWeightedAvgPct), ...sorted.map((r) => r.medianRatePct), ...sorted.map((r) => r.minRatePct), ...sorted.map((r) => r.maxRatePct)].filter((v) => v != null && isFinite(v));
      const yMin = Math.min(...allY);
      const yMax = Math.max(...allY);
      const span = (yMax - yMin) || 1;
      const yLo = yMin - span * 0.15;
      const yHi = yMax + span * 0.15;
      const ySpan = yHi - yLo || 1;
      const xMin = Math.min(...sorted.map((r) => r.tenorMonths));
      const xMax = Math.max(...sorted.map((r) => r.tenorMonths));
      const xScale = (m) => Math.sqrt(m);
      const xMinS = xScale(xMin), xMaxS = xScale(xMax);
      const xSpanS = (xMaxS - xMinS) || 1;
      const x = (m) => padL + ((xScale(m) - xMinS) / xSpanS) * innerW;
      const y = (v) => padT + innerH - ((v - yLo) / ySpan) * innerH;
      const nwavgPath = sorted.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r.tenorMonths).toFixed(2)} ${y(r.notionalWeightedAvgPct).toFixed(2)}`).join(' ');
      const medPath   = sorted.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r.tenorMonths).toFixed(2)} ${y(r.medianRatePct).toFixed(2)}`).join(' ');
      const rangePath = sorted.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r.tenorMonths).toFixed(2)} ${y(r.maxRatePct).toFixed(2)}`).join(' ')
                      + ' ' + sorted.slice().reverse().map((r) => `L ${x(r.tenorMonths).toFixed(2)} ${y(r.minRatePct).toFixed(2)}`).join(' ') + ' Z';
      const points = sorted.map((r) => ({
        ...r, cx: x(r.tenorMonths),
        nwavgY: y(r.notionalWeightedAvgPct),
        medY:   y(r.medianRatePct),
      }));
      const ticks = 4;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = yLo + (ySpan * k) / ticks;
        return { v, y: y(v) };
      });
      return { w, h, padL, padR, padT, padB, innerW, innerH, points, yTicks, nwavgPath, medPath, rangePath };
    }, [sorted, w, hMeasured]);

    if (!layout) return <div className="chart-empty">No tenor rows.</div>;
    const hover = hoverIdx !== null ? layout.points[hoverIdx] : null;

    return (
      <div ref={ref} className="parity-chart-canvas">
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width={layout.w} height={layout.h}>
          {layout.yTicks.map((t, i) => (
            <line key={`g-${i}`} x1={layout.padL} x2={layout.w - layout.padR}
                  y1={t.y} y2={t.y}
                  stroke="var(--border-subtle)" strokeWidth="1"
                  vectorEffect="non-scaling-stroke" />
          ))}
          <path d={layout.rangePath} fill="var(--accent)" fillOpacity="0.08" />
          <path d={layout.medPath} fill="none"
                stroke="var(--text-muted)" strokeWidth="2"
                strokeDasharray="5 4" strokeLinecap="round"
                vectorEffect="non-scaling-stroke" opacity="0.85" />
          <path d={layout.nwavgPath} fill="none"
                stroke="var(--accent)" strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" />
          {layout.points.map((p, i) => (
            <g key={`pt-${i}`}>
              <circle cx={p.cx} cy={p.nwavgY}
                      r={Math.min(22, 4 + Math.sqrt((p.tradeCount || 0) / 8))}
                      fill="var(--accent)" fillOpacity="0.10" stroke="none" />
              <circle cx={p.cx} cy={p.medY} r="3.5"
                      fill="white" stroke="var(--text-muted)" strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke" />
              <circle cx={p.cx} cy={p.nwavgY} r={hoverIdx === i ? 7 : 6}
                      fill="var(--accent)" stroke="white" strokeWidth="1.8"
                      vectorEffect="non-scaling-stroke" />
              <rect x={p.cx - 22} y={layout.padT}
                    width={44} height={layout.innerH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)} />
            </g>
          ))}
          {layout.yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={layout.padL - 8} y={t.y + 3}
                  textAnchor="end" fontSize="10.5" fontFamily="JetBrains Mono, monospace"
                  fill="var(--text-subtle)">
              {`${Number(t.v).toFixed(2)}%`}
            </text>
          ))}
          <text x={14} y={layout.padT + layout.innerH / 2}
                textAnchor="middle" fontSize="11" fill="var(--text-muted)"
                fontFamily="Inter, system-ui"
                transform={`rotate(-90, 14, ${layout.padT + layout.innerH / 2})`}>
            Fixed Rate (%)
          </text>
          {layout.points.map((p, i) => (
            <text key={`xl-${i}`} x={p.cx} y={layout.h - 30}
                  textAnchor="middle" fontSize="10.5"
                  fill="var(--text-primary)" fontWeight="600" fontFamily="Inter, system-ui">
              {p.tenorLabel}
            </text>
          ))}
          {layout.points.map((p, i) => (
            <text key={`xlm-${i}`} x={p.cx} y={layout.h - 16}
                  textAnchor="middle" fontSize="9.5"
                  fill="var(--text-subtle)" fontFamily="JetBrains Mono, monospace">
              {p.tenorMonths}m
            </text>
          ))}
        </svg>
        {hover && (() => {
          const HALF_W = 110;
          const clampedCx = Math.max(HALF_W, Math.min(layout.w - HALF_W, hover.cx));
          return (
            <div className="parity-tooltip"
                 style={{ left: `${clampedCx}px`,
                          top: `${Math.min(hover.nwavgY, hover.medY) - 14}px` }}>
              <div className="parity-tooltip-title">{hover.tenorLabel} ({hover.tenorMonths} mo)</div>
              <div className="parity-tooltip-row"><span>Wtd avg</span><span className="font-mono">{fmtRate(hover.notionalWeightedAvgPct)}</span></div>
              <div className="parity-tooltip-row"><span>Median</span><span className="font-mono">{fmtRate(hover.medianRatePct)}</span></div>
              <div className="parity-tooltip-row"><span>Range</span><span className="font-mono">{fmtRate(hover.minRatePct)} – {fmtRate(hover.maxRatePct)}</span></div>
              <div className="parity-tooltip-row"><span>Trades</span><span className="font-mono">{fmtInt(hover.tradeCount)}</span></div>
              <div className="parity-tooltip-row"><span>Notional</span><span className="font-mono">{fmtMn(hover.totalNotionalUsd)}</span></div>
            </div>
          );
        })()}
      </div>
    );
  }

  /* ── Calibration Print rail card (.ip-card — grows to fill rail) ── */
  function CalibrationPrintCard({ term, accent }) {
    const a = term.aggregates || {};
    const w = term.execWindow || {};
    return (
      <section className={cn('ip-card', `accent-${accent}`)}>
        <header className="ip-card-head">
          <span className="ip-card-eyebrow">Calibration Print</span>
          <span className="ip-card-status warn">
            <span className="ip-status-dot" />
            Reference
          </span>
        </header>
        <div className="ip-card-highlight">
          <div className="ip-card-highlight-label">Std-tenor weighted avg · all standard tenors</div>
          <div className="ip-card-highlight-value font-mono">{fmtRate(a.stdTenorWtdAvg)}</div>
        </div>
        <dl className="ip-card-rows">
          <Row label="Source"         value="DTCC SDR public" />
          <Row label="Validation"     value="Reference (not gated)" tone="warning" strong />
          <Row label="Tenor buckets"  value={`${a.nAllTenors} (${a.nStdTenors} std)`} mono />
          <Row label="Total trades"   value={fmtInt(a.totalTrades)} mono />
          <Row label="Total notional" value={fmtBn(a.totalNotionalUsd)} mono strong />
          <Row label="Window start"   value={w.first || '—'} mono />
          <Row label="Window end"     value={w.last  || '—'} mono />
        </dl>
      </section>
    );
  }

  /* ── Tenor Snapshot rail card (.mvs-card — compact, doesn't stretch) ── */
  function TenorSnapshotCard({ rows, accent }) {
    const front = (rows || []).find((r) => r.tenorLabel === '1Y');
    const belly = (rows || []).filter((r) => ['5Y', '10Y', '30Y'].includes(r.tenorLabel));
    if (!front && !belly.length) return null;
    return (
      <section className={cn('mvs-card', `accent-${accent}`)}>
        <header className="mvs-card-head">
          <span className="mvs-card-eyebrow">Tenor Snapshot</span>
          {front && <span className="parity-mvs-pill accent">{fmtInt(front.tradeCount)} 1Y trades</span>}
        </header>
        {/* 1Y headline + 1Y range as a tight 2-row mvs list, then a
            4-tenor mini-grid (1Y / 5Y / 10Y / 30Y) so all standard
            anchors are visible at a glance without stacking rows. */}
        <div className="parity-tenor-anchors">
          {front && (
            <div className="parity-tenor-anchor lead">
              <span className="parity-tenor-anchor-tenor">1Y</span>
              <span className="parity-tenor-anchor-rate font-mono">{fmtRate(front.notionalWeightedAvgPct)}</span>
              <span className="parity-tenor-anchor-meta">wtd avg · {fmtInt(front.tradeCount)} trades</span>
            </div>
          )}
          {belly.map((r) => (
            <div key={r.tenorLabel} className="parity-tenor-anchor">
              <span className="parity-tenor-anchor-tenor">{r.tenorLabel}</span>
              <span className="parity-tenor-anchor-rate font-mono">{fmtRate(r.notionalWeightedAvgPct)}</span>
              <span className="parity-tenor-anchor-meta">{fmtInt(r.tradeCount)} tr · {fmtBn(r.totalNotionalUsd)}</span>
            </div>
          ))}
        </div>
        {front && (
          <div className="parity-tenor-range">
            <span className="parity-tenor-range-label">1Y range</span>
            <span className="parity-tenor-range-value font-mono">{fmtRate(front.minRatePct)} – {fmtRate(front.maxRatePct)}</span>
          </div>
        )}
      </section>
    );
  }

  /* ── By-Tenor desk table (full width, sticky-header scroll) ── */
  function ByTenorTable({ rows, accent }) {
    if (!rows || !rows.length) return null;
    return (
      <section className="data-card">
        <header className="data-card-head">
          <div>
            <div className="data-card-title">By-tenor calibration summary</div>
            <div className="data-card-sub">Standard institutional tenors only · {rows.length} tenors</div>
          </div>
        </header>
        <div className="data-card-body">
          <div className="parity-table-scroll">
            <table className="data-table compact parity-tenor-table">
              <thead>
                <tr>
                  <th>Tenor</th>
                  <th className="num">Trades</th>
                  <th className="num">Total Notional</th>
                  <th className="num">Median Rate</th>
                  <th className="num">Wtd Avg Rate</th>
                  <th className="num">Min</th>
                  <th className="num">Max</th>
                  <th>Swap Format</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="strong">{r.tenorLabel}</td>
                    <td className="num font-mono">{fmtInt(r.tradeCount)}</td>
                    <td className="num font-mono">{fmtMn(r.totalNotionalUsd)}</td>
                    <td className="num font-mono">{fmtRate(r.medianRatePct)}</td>
                    <td className="num font-mono strong">{fmtRate(r.notionalWeightedAvgPct)}</td>
                    <td className="num font-mono small">{fmtRate(r.minRatePct)}</td>
                    <td className="num font-mono small">{fmtRate(r.maxRatePct)}</td>
                    <td className="small">{r.swapFormatMode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  window.App = window.App || {};
  window.App.ParityOverviewPanel = ParityOverviewPanel;
})();
