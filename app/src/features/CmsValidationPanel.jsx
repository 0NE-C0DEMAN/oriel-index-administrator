/* ==========================================================================
   CmsValidationPanel.jsx — second sub-tab body for the cms (Healthcare
   Reference) index. Combines v7's Trading + Benchmark/Validation +
   Provenance sections into a single scrollable page (the user explicitly
   asked for one sub-tab, not three).

   Layout (top to bottom):
     1. Strategy Lenses     — 3 cards in a row (Basis Trade /
                              Curve & Convergence / Service-Line Dispersion)
     2. Benchmark           — 2 charts side-by-side (translated-vs-anchor
                              line + prediction-error bars), then the
                              year-by-year benchmark history table
     3. Pipeline Provenance — 2x2 grid of file lists (Parsed / Optional /
                              Outputs / Missing if any)

   Reuses standard primitives so nothing new is added to the design
   system: .info-card / .info-card-head / .data-card / .data-table /
   .data-card-foot / .info-row.cols-2 / .ip-card-row / .feed-pill /
   .herochart-card / .forward-chart / .forward-chart-tooltip.

   Registers window.App.CmsValidationPanel.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useRef, useEffect, useMemo } = React;
  const { cn } = window.App.utils;
  const { Icon } = window.App;

  /* ───────────────────────── helpers ───────────────────────── */
  const fmtPct = (v) => v == null || !isFinite(v) ? '—' : `${Number(v).toFixed(2)}%`;
  const fmtBp  = (v) => v == null || !isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} bp`;
  const tonePct  = (v) => v == null ? null : v >= 0 ? 'success' : 'danger';
  const errTone  = (v) => v == null ? null : Math.abs(v) <= 25 ? 'success'
                                            : Math.abs(v) <= 50 ? 'warning' : 'danger';

  const seriesColors = (accent) => ({
    lead:        accent === 'pink' ? 'var(--pink)'        : 'var(--accent)',
    leadDarker:  accent === 'pink' ? '#0F766E'            : 'var(--accent-active)',
    band:        accent === 'pink' ? 'rgba(20, 184, 166, 0.12)' : 'rgba(45, 91, 255, 0.10)',
    bandStroke:  accent === 'pink' ? 'rgba(20, 184, 166, 0.25)' : 'rgba(45, 91, 255, 0.25)',
    public:      'var(--text-muted)',
    cms:         'var(--text-subtle)',
  });

  /* Tiny ResizeObserver hook — same one as the overview panel uses. */
  function useChartSize(initialW = 560, initialH = 280) {
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

  /* ───────────────────────── top-level panel ──────────────── */
  function CmsValidationPanel({ index }) {
    const cms = index?.detail?.cms;
    if (!cms || !cms.basisActionRow) return null;
    const accent = index.accent || 'pink';

    return (
      <div className="cms-validation">
        {/* Section 1 — Strategy Lenses */}
        <h3 className="cms-section-head">
          Strategy Lenses · three ways to express the signal
        </h3>
        <StrategyRow cms={cms} accent={accent} />

        {/* Section 2 — Benchmark */}
        <h3 className="cms-section-head">
          Benchmark · year-by-year validation
        </h3>
        <BenchmarkRow cms={cms} accent={accent} />
        <BenchmarkTable cms={cms} />

        {/* Section 3 — Pipeline Provenance */}
        <h3 className="cms-section-head">
          Pipeline provenance · build artifacts
        </h3>
        <ProvenanceGrid cms={cms} />
      </div>
    );
  }

  /* ───────────────────────── Strategy Lenses ────────────────
     Clean .info-card chrome — same primitive Stats / Methodology /
     Live Feed cards use everywhere else. No icon chips, no left-border
     accent. The lead cell carries a small "Primary lens" pill on the
     right of its header (same .feed-pill component the Methodology
     tab uses for status). */
  function StrategyRow({ cms, accent }) {
    const r = cms.basisActionRow;
    const cells = [
      {
        title: 'Basis Trade',
        primary: r.tradingLens,
        sub: `Public rail vs CMS-anchored translation · ${r.convergenceWindow}`,
        lead: true,
      },
      {
        title: 'Curve / Convergence',
        primary: 'Trade convergence into next prints',
        sub: 'Release-lag vs persistent dislocation · 1–4 releases',
      },
      {
        title: 'Service-Line Dispersion',
        primary: 'Rank sleeves by gap + momentum',
        sub: 'RV baskets and sector sleeves · 1–3 quarterly reviews',
      },
    ];
    return (
      <div className={cn('cms-lens-row', `accent-${accent}`)}>
        {cells.map((c, i) => (
          <section key={i} className={cn('info-card cms-lens-cell', c.lead && 'lead')}>
            <header className="info-card-head">
              <span className="info-card-eyebrow">{c.title}</span>
              {c.lead && <span className="feed-pill feed-pill-success cms-lens-tag">Market read</span>}
            </header>
            <div className="cms-lens-body">
              <div className="cms-lens-primary">{c.primary}</div>
              <div className="cms-lens-sub">{c.sub}</div>
            </div>
          </section>
        ))}
      </div>
    );
  }

  /* ───────────────────────── Benchmark — 2 charts ──────────────── */
  function BenchmarkRow({ cms, accent }) {
    const data = useMemo(
      () => (cms.historicalBenchmark || []).filter((r) => Number.isFinite(r.year)),
      [cms.historicalBenchmark]
    );
    const c = seriesColors(accent);
    return (
      <div className="info-row cols-2 cms-bench-row">
        {/* Left — Translated vs Anchor line chart */}
        <section className={cn('herochart-card', `accent-${accent}`)}>
          <header className="herochart-head">
            <div className="herochart-head-text">
              <div className="herochart-title">Oriel translated signal vs later CMS anchor</div>
              <div className="herochart-sub">Does the translation predict the next official print?</div>
            </div>
            <div className="herochart-head-right">
              <div className="herochart-legend">
                <span className="herochart-legend-dot" style={{ background: c.lead }} />
                <span>Oriel translated signal</span>
                <span className="herochart-legend-dash" style={{ borderTopColor: c.cms }} />
                <span>Later CMS anchor</span>
              </div>
            </div>
          </header>
          <div className="herochart-body">
            <BenchmarkLineChart data={data} accent={accent} />
          </div>
        </section>

        {/* Right — Prediction error bar chart */}
        <section className={cn('herochart-card', `accent-${accent}`)}>
          <header className="herochart-head">
            <div className="herochart-head-text">
              <div className="herochart-title">Prediction error · year by year</div>
              <div className="herochart-sub">Green ≤ 25 bp · Gold 25–50 bp · Red &gt; 50 bp</div>
            </div>
            <div className="herochart-head-right">
              <div className="herochart-legend">
                <span className="herochart-legend-band" style={{ background: 'var(--success)', opacity: 0.55 }} />
                <span>≤ 25 bp</span>
                <span className="herochart-legend-band" style={{ background: 'var(--warning)', opacity: 0.55 }} />
                <span>25–50 bp</span>
                <span className="herochart-legend-band" style={{ background: 'var(--danger)', opacity: 0.55 }} />
                <span>&gt; 50 bp</span>
              </div>
            </div>
          </header>
          <div className="herochart-body">
            <ErrorBarChart data={data} />
          </div>
        </section>
      </div>
    );
  }

  /* ── Translated-vs-Anchor line chart (2 series) ──
     Includes EVERY year in the benchmark panel, including 2020 (whose
     cms_official_anchor_yoy is null in v7's CSV). Matching v7's
     `fillna(0)` behaviour so the line starts cleanly at zero in 2020
     instead of beginning at 2021 like before. */
  function BenchmarkLineChart({ data, accent }) {
    const c = seriesColors(accent);
    const [ref, w, hMeasured] = useChartSize(560, 280);
    const [hoverIdx, setHoverIdx] = useState(null);
    const rows = data.filter((r) => Number.isFinite(r.year));

    const layout = useMemo(() => {
      if (!rows.length) return null;
      const h = Math.max(hMeasured || 0, 220);
      const padL = 56, padR = 22, padT = 14, padB = 32;
      const innerW = Math.max(w - padL - padR, 40);
      const innerH = h - padT - padB;
      const xs = rows.map((r) => r.year);
      const xMin = Math.min(...xs), xMax = Math.max(...xs);
      // v7 parity: null/NaN values render as 0 on the line.
      const orielVal = (r) => Number.isFinite(r.orielHealthcareSpot) ? r.orielHealthcareSpot : 0;
      const cmsVal   = (r) => Number.isFinite(r.cmsOfficialAnchorYoy) ? r.cmsOfficialAnchorYoy : 0;
      const allY = [...rows.map(orielVal), ...rows.map(cmsVal)];
      const yMin = Math.min(...allY, 0);
      const yMax = Math.max(...allY);
      const span = yMax - yMin || 1;
      const yLo = yMin - span * 0.10;
      const yHi = yMax + span * 0.10;
      const ySpan = yHi - yLo || 1;
      const x = (yr) => padL + (xMax === xMin ? innerW / 2 : ((yr - xMin) / (xMax - xMin)) * innerW);
      const y = (v) => padT + innerH - ((v - yLo) / ySpan) * innerH;
      const points = rows.map((r) => ({
        ...r,
        cx: x(r.year),
        orielY: y(orielVal(r)),
        cmsY:   y(cmsVal(r)),
        hasCms: Number.isFinite(r.cmsOfficialAnchorYoy),
      }));
      const orielPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p.orielY.toFixed(2)}`).join(' ');
      const cmsPath   = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p.cmsY.toFixed(2)}`).join(' ');
      const ticks = 4;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = yLo + (ySpan * k) / ticks;
        return { v, y: y(v) };
      });
      return { w, h, padL, padR, padT, padB, innerW, innerH, points, orielPath, cmsPath, yTicks, hitW: Math.max(innerW / rows.length, 28) };
    }, [rows, w, hMeasured]);

    if (!layout) return <div className="chart-empty">No benchmark data.</div>;
    const hover = hoverIdx !== null ? layout.points[hoverIdx] : null;

    return (
      <div ref={ref} className="forward-chart" style={{ width: '100%', height: '100%' }}>
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width={layout.w} height={layout.h}>
          {layout.yTicks.map((t, i) => (
            <g key={`yt-${i}`}>
              <line x1={layout.padL} x2={layout.w - layout.padR} y1={t.y} y2={t.y}
                    stroke="var(--border-subtle)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <text x={layout.padL - 8} y={t.y + 3} textAnchor="end"
                    fontSize="10.5" fontFamily="JetBrains Mono, monospace" fill="var(--text-subtle)">
                {`${t.v.toFixed(1)}%`}
              </text>
            </g>
          ))}
          <text x={14} y={layout.padT + layout.innerH / 2} textAnchor="middle"
                fontSize="11" fill="var(--text-muted)" fontFamily="Inter, system-ui"
                transform={`rotate(-90, 14, ${layout.padT + layout.innerH / 2})`}>YoY (%)</text>

          <path d={layout.cmsPath} fill="none" stroke={c.cms} strokeWidth="1.6"
                strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" />
          <path d={layout.orielPath} fill="none" stroke={c.lead} strokeWidth="2.4"
                strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

          {layout.points.map((p, i) => (
            <g key={`pt-${i}`}>
              {/* Only show CMS marker when the year has a real anchor
                  value — 2020 has anchor=null in v7's CSV, so suppress
                  the marker (line still passes through 0 like v7). */}
              {p.hasCms && (
                <circle cx={p.cx} cy={p.cmsY} r="3" fill="white" stroke={c.cms}
                        strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              )}
              <circle cx={p.cx} cy={p.orielY} r={hoverIdx === i ? 5.5 : 4.5}
                      fill={c.lead} stroke="white" strokeWidth="1.6"
                      vectorEffect="non-scaling-stroke" />
              <rect x={p.cx - layout.hitW / 2} y={layout.padT}
                    width={layout.hitW} height={layout.innerH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)} />
            </g>
          ))}

          {layout.points.map((p, i) => (
            <text key={`xl-${i}`} x={p.cx} y={layout.h - 10} textAnchor="middle"
                  fontSize="10.5" fill="var(--text-muted)" fontFamily="Inter, system-ui">{p.year}</text>
          ))}
        </svg>

        {hover && (() => {
          /* Pin tooltip above whichever line dot is higher at this year,
             and clamp the horizontal centre so the tooltip can't clip
             past either edge of the chart. */
          const candidates = [hover.orielY, hover.cmsY].filter(Number.isFinite);
          const topY = (candidates.length ? Math.min(...candidates) : 0) - 16;
          const HALF_W = 130;
          const clampedCx = Math.max(HALF_W, Math.min(layout.w - HALF_W, hover.cx));
          return (
            <div className="forward-chart-tooltip"
                 style={{ left: `${clampedCx}px`, top: `${topY}px` }}>
              <div className="forward-chart-tooltip-mat">{hover.year}</div>
              <div className="forward-chart-tooltip-val">{fmtPct(hover.orielHealthcareSpot)}</div>
              <div className="forward-chart-tooltip-band">
                CMS {fmtPct(hover.cmsOfficialAnchorYoy)} · Err {fmtBp(hover.predictionErrorBps)}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  /* ── Prediction-error bar chart (color-coded by abs(bp)) ──
     Includes every year (including 2020 where v7's CSV has null
     prediction_error_bps; we render it with no bar, matching v7's
     `fillna(0)` flat baseline). The bar X-scale is offset by barW/2
     on each side so the leftmost bar's left edge sits AT padL — never
     extending into the Y-axis label area to its left. */
  function ErrorBarChart({ data }) {
    const [ref, w, hMeasured] = useChartSize(560, 280);
    const [hoverIdx, setHoverIdx] = useState(null);
    const rows = data.filter((r) => Number.isFinite(r.year));

    const layout = useMemo(() => {
      if (!rows.length) return null;
      const h = Math.max(hMeasured || 0, 220);
      const padL = 56, padR = 22, padT = 14, padB = 32;
      const innerW = Math.max(w - padL - padR, 40);
      const innerH = h - padT - padB;
      const xs = rows.map((r) => r.year);
      const xMin = Math.min(...xs), xMax = Math.max(...xs);
      const errs = rows.map((r) => r.predictionErrorBps).filter(Number.isFinite);
      const yMin = Math.min(...errs, 0);
      const yMax = Math.max(...errs, 0);
      const span = (yMax - yMin) || 1;
      const yLo = yMin - span * 0.10;
      const yHi = yMax + span * 0.10;
      const ySpan = yHi - yLo || 1;
      const slot = rows.length > 1 ? innerW / (rows.length - 1) : innerW;
      const barW = Math.min(slot * 0.42, 38);
      // Inset both ends so even the leftmost / rightmost bar's outer edge
      // stays inside the inner chart area — no overlap with Y axis labels
      // on the left, no clipping on the right.
      const halfBar = barW / 2;
      const x = (yr) => {
        if (xMax === xMin) return padL + innerW / 2;
        const ratio = (yr - xMin) / (xMax - xMin);
        return padL + halfBar + ratio * (innerW - barW);
      };
      const y = (v) => padT + innerH - ((v - yLo) / ySpan) * innerH;
      const yZero = y(0);

      const points = rows.map((r) => ({
        ...r,
        cx: x(r.year),
        hasError: Number.isFinite(r.predictionErrorBps),
        barY: Number.isFinite(r.predictionErrorBps) ? y(r.predictionErrorBps) : null,
        tone: errTone(r.predictionErrorBps),
      }));

      const ticks = 4;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = yLo + (ySpan * k) / ticks;
        return { v, y: y(v) };
      });

      return { w, h, padL, padR, padT, padB, innerW, innerH, points, yTicks, yZero, barW, hitW: Math.max(slot, 28) };
    }, [rows, w, hMeasured]);

    if (!layout) return <div className="chart-empty">No error data.</div>;
    const hover = hoverIdx !== null ? layout.points[hoverIdx] : null;
    const tonePalette = {
      success: { fill: 'rgba(22, 163, 74, 0.55)', stroke: 'var(--success)' },
      warning: { fill: 'rgba(217, 119, 6, 0.55)', stroke: 'var(--warning)' },
      danger:  { fill: 'rgba(220, 38, 38, 0.60)', stroke: 'var(--danger)' },
    };

    return (
      <div ref={ref} className="forward-chart" style={{ width: '100%', height: '100%' }}>
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width={layout.w} height={layout.h}>
          {/* 1. Gridlines first (background) */}
          {layout.yTicks.map((t, i) => (
            <line key={`g-${i}`} x1={layout.padL} x2={layout.w - layout.padR}
                  y1={t.y} y2={t.y} stroke="var(--border-subtle)" strokeWidth="1"
                  vectorEffect="non-scaling-stroke" />
          ))}

          {/* 2. Zero baseline */}
          <line x1={layout.padL} x2={layout.w - layout.padR} y1={layout.yZero} y2={layout.yZero}
                stroke="var(--text-subtle)" strokeWidth="1" strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke" opacity="0.7" />

          {/* 3. Bars (data layer) — skip years with no error value */}
          {layout.points.map((p, i) => {
            if (!p.hasError) return null;
            const palette = tonePalette[p.tone] || tonePalette.danger;
            const pos = p.predictionErrorBps >= 0;
            const top = pos ? p.barY : layout.yZero;
            const bot = pos ? layout.yZero : p.barY;
            const isHover = hoverIdx === i;
            return (
              <rect key={`b-${i}`} x={p.cx - layout.barW / 2} y={top}
                    width={layout.barW} height={Math.max(bot - top, 1)} rx="3"
                    fill={palette.fill} stroke={palette.stroke} strokeWidth="1.2"
                    vectorEffect="non-scaling-stroke" opacity={isHover ? 1 : 0.95} />
            );
          })}

          {/* 4. Y-axis labels rendered LAST so they sit on top of bars
                (and on top of any color bleed from gridlines). */}
          {layout.yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={layout.padL - 8} y={t.y + 3} textAnchor="end"
                  fontSize="10.5" fontFamily="JetBrains Mono, monospace"
                  fill="var(--text-subtle)">
              {`${Math.round(t.v)} bp`}
            </text>
          ))}
          <text x={14} y={layout.padT + layout.innerH / 2} textAnchor="middle"
                fontSize="11" fill="var(--text-muted)" fontFamily="Inter, system-ui"
                transform={`rotate(-90, 14, ${layout.padT + layout.innerH / 2})`}>Error (bp)</text>

          {/* 5. Hit targets (transparent) */}
          {layout.points.map((p, i) => (
            <rect key={`hit-${i}`} x={p.cx - layout.hitW / 2} y={layout.padT}
                  width={layout.hitW} height={layout.innerH} fill="transparent"
                  onMouseEnter={() => p.hasError && setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)} />
          ))}

          {/* 6. X-axis year labels */}
          {layout.points.map((p, i) => (
            <text key={`xl-${i}`} x={p.cx} y={layout.h - 10} textAnchor="middle"
                  fontSize="10.5" fill="var(--text-muted)" fontFamily="Inter, system-ui">{p.year}</text>
          ))}
        </svg>

        {hover && (() => {
          /* Bar TOP = min(barY, yZero). Pin tooltip 16 px above bar top
             so the tooltip never overlaps the bar - works for both
             positive bars (barY < yZero) and negative bars (barY >
             yZero, so yZero is the bar's top edge). Horizontal centre
             is clamped so the tooltip never clips past the chart
             container's edges. */
          const barTop = Math.min(hover.barY, layout.yZero);
          const HALF_W = 110;
          const clampedCx = Math.max(HALF_W, Math.min(layout.w - HALF_W, hover.cx));
          return (
            <div className="forward-chart-tooltip"
                 style={{ left: `${clampedCx}px`, top: `${barTop - 16}px` }}>
              <div className="forward-chart-tooltip-mat">{hover.year}</div>
              <div className="forward-chart-tooltip-val">{fmtBp(hover.predictionErrorBps)}</div>
              <div className="forward-chart-tooltip-band">
                {hover.within25bps ? 'Within 25 bp threshold' : 'Outside 25 bp threshold'}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  /* ── Benchmark history table ── */
  function BenchmarkTable({ cms }) {
    const data = (cms.historicalBenchmark || []).filter((r) => Number.isFinite(r.year));
    if (!data.length) return null;
    const within = data.filter((r) => r.within25bps).length;
    return (
      <section className="data-card">
        <header className="data-card-head">
          <div>
            <span className="data-card-title">Benchmark history</span>
            <div className="data-card-sub">
              Translated vs official CMS anchor, year by year — {within} of {data.length} prints within 25 bp
            </div>
          </div>
        </header>
        <div className="data-card-body">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Year</th>
                <th className="num">Public rail</th>
                <th className="num">Oriel spot</th>
                <th className="num">CMS anchor</th>
                <th className="num">Error (bp)</th>
                <th className="num">Abs error</th>
                <th>Within 25 bp</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => {
                const eTone = errTone(r.predictionErrorBps);
                return (
                  <tr key={i}>
                    <td className="strong">{r.year}</td>
                    <td className="num">{fmtPct(r.medicalCpiProxy)}</td>
                    <td className="num">{fmtPct(r.orielHealthcareSpot)}</td>
                    <td className="num">{fmtPct(r.cmsOfficialAnchorYoy)}</td>
                    <td className={cn('num strong',
                      eTone === 'success' && 'tone-success',
                      eTone === 'warning' && 'tone-warning',
                      eTone === 'danger'  && 'tone-danger')}>
                      {r.predictionErrorBps == null ? '—' : fmtBp(r.predictionErrorBps)}
                    </td>
                    <td className="num">{r.absErrorBps == null ? '—' : `${Number(r.absErrorBps).toFixed(1)} bp`}</td>
                    <td>
                      {r.within25bps == null ? '—' : (
                        <span className={cn('feed-pill',
                          r.within25bps ? 'feed-pill-success' : 'feed-pill-warning')}>
                          {r.within25bps ? 'Yes' : 'No'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  /* ───────────────────────── Provenance grid ──────────────── */
  function ProvenanceGrid({ cms }) {
    const p = cms.provenance || {};
    const present  = p.parsedPresent  || [];
    const missing  = p.parsedMissing  || [];
    const optional = p.optionalPresent || [];
    const outputs  = p.outputs || {};

    return (
      <div className="cms-prov-grid">
        <ProvCard title="Parsed inputs" subtitle="Required pipeline inputs"
                  count={present.length} accent="success">
          {present.length
            ? present.map((f, i) => <ProvRow key={i} file={f} status="Present" tone="success" hint="Parsed" />)
            : <ProvEmpty text="No parsed inputs" />}
        </ProvCard>

        <ProvCard title="Pipeline outputs" subtitle="Generated artifacts"
                  count={Object.keys(outputs).length} accent="warning">
          {Object.keys(outputs).length
            ? Object.entries(outputs).map(([k, v], i) => (
                <ProvRow key={i} file={k} status={v} tone="warning" hint="Generated" />
              ))
            : <ProvEmpty text="No outputs" />}
        </ProvCard>

        <ProvCard title="Optional inputs" subtitle="Used when present"
                  count={optional.length} accent="muted">
          {optional.length
            ? optional.map((f, i) => <ProvRow key={i} file={f} status="Present" tone="warning" hint="Optional" />)
            : <ProvEmpty text="No optional inputs" />}
        </ProvCard>

        <ProvCard title="Missing inputs" subtitle="Required but not found"
                  count={missing.length} accent={missing.length ? 'danger' : 'muted'}>
          {missing.length
            ? missing.map((f, i) => <ProvRow key={i} file={f} status="Missing" tone="danger" hint="Required" />)
            : <ProvEmpty text="All required inputs present" />}
        </ProvCard>
      </div>
    );
  }

  function ProvCard({ title, subtitle, count, accent, children }) {
    return (
      <section className="info-card cms-prov-card">
        <header className="info-card-head cms-prov-head">
          <div>
            <span className="info-card-eyebrow">{title}</span>
            <div className="cms-prov-sub">{subtitle}</div>
          </div>
          <span className={cn('cms-prov-count', `tone-${accent}`)}>{count}</span>
        </header>
        <ul className="cms-prov-list">{children}</ul>
      </section>
    );
  }
  function ProvRow({ file, status, tone, hint }) {
    return (
      <li className="cms-prov-row">
        <span className="cms-prov-file font-mono">{file}</span>
        <span className="cms-prov-row-right">
          <span className={cn('cms-prov-status', `tone-${tone}`)}>{status}</span>
          <span className="cms-prov-hint">{hint}</span>
        </span>
      </li>
    );
  }
  function ProvEmpty({ text }) {
    return <li className="cms-prov-empty">{text}</li>;
  }

  window.App = window.App || {};
  window.App.CmsValidationPanel = CmsValidationPanel;
})();
