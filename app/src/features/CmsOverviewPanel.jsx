/* ==========================================================================
   CmsOverviewPanel.jsx — Overview tab body for the cms (Healthcare
   Reference) index. Mirrors v7 cms_tab.py's "main row" 1:1 in DATA but
   uses our standard layout / card primitives so it sits at the same
   visual quality as every other tab.

   Layout:
     [.hero-row]
       └─ [.herochart-card]         — 3-line chart (no inner tabs)
            • Public settlement rail (muted line)
            • Oriel translated spot (gold lead line)
            • CMS official anchor (accent dashed line)
            • Confidence band around Oriel spot
       └─ [.hero-row-rail]
            └─ [.ip-card]            — Basis & Action
            └─ [.mvs-card]           — Crosswalk Decomposition

   Reuses existing CSS classes (.herochart-card, .herochart-head,
   .herochart-legend, .herochart-body, .forward-chart, .forward-chart-tooltip,
   .ip-card, .ip-card-row, .mvs-card, .mvs-card-row, .hero-row*) so
   nothing new is added to the design system for this section.

   Registers window.App.CmsOverviewPanel.
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
  const toneConf = (label) => label === 'High' ? 'success'
                              : label === 'Medium' ? 'warning'
                              : label === 'Low' ? 'danger' : null;
  const titleCaseSnake = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  /* Tiny hook: ResizeObserver-driven height measurement for any element.
     Used by the cms overview to size each chart card to its rail's
     measured height (same trick v7 uses with explicit chart_h math). */
  function useMeasuredHeight(deps) {
    const ref = useRef(null);
    const [h, setH] = useState(0);
    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const seed = Math.round(el.getBoundingClientRect().height);
      if (seed > 0) setH(seed);
      if (typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const next = Math.round(e.contentRect.height);
          if (next > 0) setH((prev) => (prev !== next ? next : prev));
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
    return [ref, h];
  }

  /* ───────────────────────── top-level panel ──────────────── */
  function CmsOverviewPanel({ index }) {
    /* Hooks first — React rule-of-hooks. Two measured rails: one per row. */
    const [railRefA, railHA] = useMeasuredHeight([index?.key]);
    const [railRefB, railHB] = useMeasuredHeight([index?.key]);

    const cms = index?.detail?.cms;
    if (!cms || !cms.basisActionRow) return null;
    const accent = index.accent || 'pink';

    return (
      <div className="cms-overview">
        {/* Row 1 — translation hero + Basis & Action + Crosswalk */}
        <div className="hero-row cms-hero-row">
          <CmsTranslationChartCard cms={cms} accent={accent} fixedHeight={railHA} />
          <div className="hero-row-rail" ref={railRefA}>
            <BasisActionCard cms={cms} accent={accent} />
            <CrosswalkCard   cms={cms} accent={accent} />
          </div>
        </div>

        {/* Section divider — small-caps lead-rule, mirrors perp-subheader. */}
        <h3 className="cms-section-head">
          Basis history · Hedge lens · Top RV sleeves
        </h3>

        {/* Row 2 — basis history bars+line + Hedge Lens + RV Sleeves */}
        <div className="hero-row cms-hero-row">
          <CmsBasisHistoryChartCard cms={cms} accent={accent} fixedHeight={railHB} />
          <div className="hero-row-rail" ref={railRefB}>
            <HedgeLensCard cms={cms} accent={accent} />
            <RvSleevesCard cms={cms} accent={accent} />
          </div>
        </div>
      </div>
    );
  }

  /* ───────────────────────── chart card ──────────────────── */
  /* Single source of truth for the 3-series colours so the chart, the
     legend, the band, and the markers stay in lockstep. Lead = family
     accent (pink for HC), so the cms chart sits in the same theme as
     ForwardCurveChart on every other accent-pink tab. */
  const seriesColors = (accent) => ({
    lead:        accent === 'pink' ? 'var(--pink)'        : 'var(--accent)',
    leadDarker:  accent === 'pink' ? '#DB2777'            : 'var(--accent-active)',
    band:        accent === 'pink' ? 'rgba(236, 72, 153, 0.12)' : 'rgba(45, 91, 255, 0.10)',
    bandStroke:  accent === 'pink' ? 'rgba(236, 72, 153, 0.25)' : 'rgba(45, 91, 255, 0.25)',
    public:      'var(--text-muted)',
    cms:         'var(--text-subtle)',
  });

  function CmsTranslationChartCard({ cms, accent, fixedHeight }) {
    const c = seriesColors(accent);
    /* Fixed height clamps the card to the rail's measured height — without
       it, the herochart-card / herochart-body min-height: 280 floor (or
       ResizeObserver feedback) would push the card taller than the rail
       and leave the visible mismatch the user sees. We always set
       max-height so the card can never grow past the rail; we only set
       min-height when the rail is non-trivial so we don't collapse the
       card on the very first render before the ResizeObserver fires. */
    const cardStyle = fixedHeight && fixedHeight > 80
      ? { height: fixedHeight, maxHeight: fixedHeight, minHeight: fixedHeight }
      : undefined;
    return (
      <section className={cn('herochart-card', `accent-${accent}`)} style={cardStyle}>
        <header className="herochart-head">
          <div className="herochart-head-text">
            <div className="herochart-title">
              Public print · Oriel translated spot · CMS official anchor
            </div>
            <div className="herochart-sub">
              YoY %, with translated confidence band
            </div>
          </div>
          <div className="herochart-head-right">
            <div className="herochart-legend">
              <span className="herochart-legend-dot" style={{ background: c.public }} />
              <span>Public rail</span>
              <span className="herochart-legend-dot" style={{ background: c.lead }} />
              <span>Oriel spot</span>
              <span className="herochart-legend-dash" style={{ borderTopColor: c.cms }} />
              <span>CMS anchor</span>
              <span className="herochart-legend-band" style={{ background: c.band }} />
              <span>Confidence band</span>
            </div>
          </div>
        </header>
        <div className="herochart-body">
          <CmsTranslationChart timeseries={cms.anchorTimeseries} accent={accent} />
        </div>
      </section>
    );
  }

  function CmsTranslationChart({ timeseries, accent }) {
    const c = seriesColors(accent);
    const containerRef = useRef(null);
    const [w, setW] = useState(720);
    const [h, setH] = useState(320);
    const [hoverIdx, setHoverIdx] = useState(null);

    useEffect(() => {
      if (!containerRef.current) return;
      const obs = new ResizeObserver((entries) => {
        for (const e of entries) {
          const nextW = Math.max(320, Math.floor(e.contentRect.width));
          const nextH = Math.max(220, Math.floor(e.contentRect.height));
          setW((prev) => (Math.abs(prev - nextW) > 1 ? nextW : prev));
          setH((prev) => (Math.abs(prev - nextH) > 1 ? nextH : prev));
        }
      });
      obs.observe(containerRef.current);
      return () => obs.disconnect();
    }, []);

    const data = useMemo(
      () => (timeseries || []).filter((r) => Number.isFinite(r.year)),
      [timeseries]
    );

    const layout = useMemo(() => {
      if (!data.length) return null;
      const padL = 56, padR = 22, padT = 16, padB = 32;
      const innerW = w - padL - padR;
      const innerH = h - padT - padB;

      const allY = [];
      data.forEach((r) => {
        [r.medicalCpiProxy, r.orielHealthcareSpot, r.cmsOfficialAnchorYoy].forEach((v) => {
          if (Number.isFinite(v)) allY.push(v);
        });
      });
      const yMinRaw = Math.min(...allY, 0);
      const yMaxRaw = Math.max(...allY);
      const span = yMaxRaw - yMinRaw || 1;
      const yMin = yMinRaw - span * 0.10;
      const yMax = yMaxRaw + span * 0.10;
      const ySpan = yMax - yMin || 1;

      const xs = data.map((r) => r.year);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const x = (yr) => padL + (xMax === xMin ? innerW / 2 : ((yr - xMin) / (xMax - xMin)) * innerW);
      const y = (v) => padT + innerH - ((v - yMin) / ySpan) * innerH;

      const points = data.map((r) => {
        const halfBand = Math.min(Math.max(Math.abs(r.publicPrintBasisBps || 0) / 100, 0.08), 0.8);
        return {
          year: r.year,
          cx: x(r.year),
          pub:   r.medicalCpiProxy,
          oriel: r.orielHealthcareSpot,
          cms:   r.cmsOfficialAnchorYoy,
          publicBp: r.publicPrintBasisBps,
          anchorBp: r.anchorBasisBps,
          pubY:   Number.isFinite(r.medicalCpiProxy)      ? y(r.medicalCpiProxy)      : null,
          orielY: Number.isFinite(r.orielHealthcareSpot)  ? y(r.orielHealthcareSpot)  : null,
          cmsY:   Number.isFinite(r.cmsOfficialAnchorYoy) ? y(r.cmsOfficialAnchorYoy) : null,
          bandUpY: Number.isFinite(r.orielHealthcareSpot) ? y(r.orielHealthcareSpot + halfBand) : null,
          bandLoY: Number.isFinite(r.orielHealthcareSpot) ? y(r.orielHealthcareSpot - halfBand) : null,
        };
      });

      const buildPath = (key) => {
        const valid = points.filter((p) => p[key] !== null);
        return valid
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p[key].toFixed(2)}`)
          .join(' ');
      };
      const publicPath = buildPath('pubY');
      const orielPath  = buildPath('orielY');
      const cmsPath    = buildPath('cmsY');

      // Confidence band — fill between bandUpY and bandLoY around Oriel
      const bandPts = points.filter((p) => p.bandUpY !== null);
      let bandPath = '';
      if (bandPts.length > 1) {
        const upper = bandPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p.bandUpY.toFixed(2)}`).join(' ');
        const lower = [...bandPts].reverse().map((p) => `L ${p.cx.toFixed(2)} ${p.bandLoY.toFixed(2)}`).join(' ');
        bandPath = `${upper} ${lower} Z`;
      }

      const ticks = 5;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = yMin + (ySpan * k) / ticks;
        return { v, y: y(v) };
      });

      const hitWidth = Math.max(innerW / data.length, 24);

      return {
        w, h, padL, padR, padT, padB, innerW, innerH,
        points, publicPath, orielPath, cmsPath, bandPath, yTicks, hitWidth,
      };
    }, [data, w, h]);

    if (!layout) return <div className="chart-empty">No data.</div>;
    const hover = hoverIdx !== null ? layout.points[hoverIdx] : null;

    return (
      <div
        ref={containerRef}
        className="forward-chart"
        /* No inline minHeight — the parent .herochart-card is now fixed to
           the rail's measured height, so the chart should shrink with it.
           A hard 260 px floor here would override that and re-introduce
           the mismatch. */
        style={{ width: '100%', height: '100%' }}
      >
        <svg
          viewBox={`0 0 ${layout.w} ${layout.h}`}
          width={layout.w}
          height={layout.h}
          role="img"
          aria-label="CMS translation timeseries"
        >
          {/* Y grid + labels */}
          {layout.yTicks.map((t, i) => (
            <g key={`yt-${i}`}>
              <line
                x1={layout.padL} x2={layout.w - layout.padR}
                y1={t.y} y2={t.y}
                stroke="var(--border-subtle)" strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={layout.padL - 8} y={t.y + 3}
                textAnchor="end"
                fontSize="10.5" fontFamily="JetBrains Mono, monospace"
                fill="var(--text-subtle)"
              >{t.v.toFixed(1)}%</text>
            </g>
          ))}

          {/* Y-axis label */}
          <text
            x={14}
            y={layout.padT + layout.innerH / 2}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-muted)"
            fontFamily="Inter, system-ui"
            transform={`rotate(-90, 14, ${layout.padT + layout.innerH / 2})`}
          >YoY (%)</text>

          {/* Confidence band — fills around Oriel spot, family-tinted */}
          {layout.bandPath && (
            <path d={layout.bandPath} fill={c.band} stroke={c.bandStroke} strokeWidth="0.5" />
          )}

          {/* Public rail (muted, solid) */}
          <path
            d={layout.publicPath}
            fill="none"
            stroke={c.public}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.95"
          />

          {/* CMS official anchor (subtle dashed reference line) */}
          <path
            d={layout.cmsPath}
            fill="none"
            stroke={c.cms}
            strokeWidth="1.6"
            strokeDasharray="5 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Oriel translated spot — lead line, family accent (pink for HC) */}
          <path
            d={layout.orielPath}
            fill="none"
            stroke={c.lead}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Markers + hover hit targets */}
          {layout.points.map((p, i) => (
            <g key={`pt-${i}`}>
              {p.pubY !== null && (
                <circle cx={p.cx} cy={p.pubY} r="3.5"
                        fill={c.public} stroke="white" strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke" />
              )}
              {p.cmsY !== null && (
                <circle cx={p.cx} cy={p.cmsY} r="3"
                        fill="white" stroke={c.cms} strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke" />
              )}
              {p.orielY !== null && (
                <circle cx={p.cx} cy={p.orielY} r={hoverIdx === i ? 5.5 : 4.5}
                        fill={c.lead} stroke="white" strokeWidth="1.6"
                        vectorEffect="non-scaling-stroke" />
              )}
              <rect
                x={p.cx - layout.hitWidth / 2}
                y={layout.padT}
                width={layout.hitWidth}
                height={layout.innerH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onFocus={() => setHoverIdx(i)}
                onBlur={() => setHoverIdx(null)}
                tabIndex={0}
                aria-label={`Year ${p.year}: Oriel spot ${fmtPct(p.oriel)}`}
              />
            </g>
          ))}

          {/* X labels (year) */}
          {layout.points.map((p, i) => (
            <text
              key={`xl-${i}`}
              x={p.cx} y={layout.h - 10}
              textAnchor="middle"
              fontSize="10.5"
              fill="var(--text-muted)"
              fontFamily="Inter, system-ui"
            >{p.year}</text>
          ))}
        </svg>

        {hover && (() => {
          /* Tooltip pins ABOVE the highest data point in this column
             (lowest Y in screen coords). Translation chart has 3 lines
             — we take the min of all valid points and back off 16 px. */
          const candidates = [hover.orielY, hover.pubY, hover.cmsY].filter(Number.isFinite);
          const topY = (candidates.length ? Math.min(...candidates) : 0) - 16;
          return (
            <div
              className="forward-chart-tooltip"
              style={{
                left: `${(hover.cx / layout.w) * 100}%`,
                top:  `${topY}px`,
              }}
            >
              <div className="forward-chart-tooltip-mat">{hover.year}</div>
              <div className="forward-chart-tooltip-val">{fmtPct(hover.oriel)}</div>
              <div className="forward-chart-tooltip-band">
                Public {fmtPct(hover.pub)} · CMS {fmtPct(hover.cms)}
              </div>
              {Number.isFinite(hover.publicBp) && (
                <div className="forward-chart-tooltip-band">
                  Basis {fmtBp(hover.publicBp)} (rail) · {fmtBp(hover.anchorBp)} (anchor)
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  }

  /* ───────────────────────── Basis & Action card ───────────────
     Built on .ip-card, the same primitive used by IndexPrintCard on
     every other tab. Same eyebrow + status pill + highlight + rows. */
  function BasisActionCard({ cms, accent }) {
    const r = cms.basisActionRow;
    const confTone = toneConf(r.signalConfidence);
    return (
      <section className={cn('ip-card', `accent-${accent}`)}>
        <header className="ip-card-head">
          <span className="ip-card-eyebrow">Basis &amp; Action</span>
          <span className={cn('ip-card-status', confTone === 'success' ? 'ok' : 'no')}>
            <span className="ip-status-dot" />
            {r.signalConfidence} confidence
          </span>
        </header>

        <div className="ip-card-highlight">
          <div className="ip-card-highlight-label">Current Translated Basis</div>
          <div className={cn('ip-card-highlight-value font-mono',
            tonePct(r.anchorBasisBp) === 'success' && 'tone-success',
            tonePct(r.anchorBasisBp) === 'danger'  && 'tone-danger')}>
            {fmtBp(r.anchorBasisBp)}
          </div>
        </div>

        <dl className="ip-card-rows">
          <Row label="Historical Positioning" value={`${r.historicalPct.toFixed(0)}th pct`} mono />
          <Row label="Convergence Window"     value={r.convergenceWindow} />
          <Row label="Primary Lens"           value={r.tradingLens} tone="warning" strong />
          <Row label="Public-Print Basis"     value={fmtBp(r.publicBasisBp)}
               mono tone={tonePct(r.publicBasisBp)} strong />
        </dl>
      </section>
    );
  }

  /* ───────────────────────── Crosswalk Decomposition card ───────
     Built on .mvs-card, the same primitive used by MarketVsSignalCard
     on every other tab. */
  function CrosswalkCard({ cms, accent }) {
    const r = cms.basisActionRow;
    const sl = cms.serviceLines || [];
    const meanGap = sl.length
      ? sl.reduce((s, x) => s + (x.gapBps || 0), 0) / sl.length
      : 0;
    /* v7 takes the first row of service_line_signal_panel as the
       "largest RV sleeve" (the panel itself is pre-ordered by priority).
       Match that exactly — no max-abs reordering on our side. */
    const top = sl.length ? sl[0] : null;

    return (
      <section className={cn('mvs-card', `accent-${accent}`)}>
        <header className="mvs-card-head">
          <span className="mvs-card-eyebrow">Crosswalk Decomposition</span>
        </header>
        <ul className="mvs-card-rows">
          <MvsRow label="Avg Service-Line Gap" value={fmtBp(meanGap)}
                  valueTone={tonePct(meanGap)} signal="Cross-venue avg" />
          <MvsRow label="Largest RV Sleeve"
                  value={top ? titleCaseSnake(top.serviceLine) : '—'}
                  signal="Top signal" signalTone="warning" />
          <MvsRow label="Public-Print Basis" value={fmtBp(r.publicBasisBp)}
                  valueTone={tonePct(r.publicBasisBp)} signal="Rail vs translation" />
          <MvsRow label="Signal Confidence" value={r.signalConfidence}
                  valueTone={toneConf(r.signalConfidence)} signal="Composite score" />
        </ul>
      </section>
    );
  }

  /* ============================================================================
     Row 2 — Basis history chart (bars + line) + Hedge Lens + RV Sleeves
     ============================================================================ */

  /* ── Chart card chrome (no inner tabs, single chart) ── */
  function CmsBasisHistoryChartCard({ cms, accent, fixedHeight }) {
    const c = seriesColors(accent);
    const cardStyle = fixedHeight && fixedHeight > 80
      ? { height: fixedHeight, maxHeight: fixedHeight, minHeight: fixedHeight }
      : undefined;
    return (
      <section className={cn('herochart-card', `accent-${accent}`)} style={cardStyle}>
        <header className="herochart-head">
          <div className="herochart-head-text">
            <div className="herochart-title">
              Public-print basis &amp; Oriel-vs-CMS anchor basis
            </div>
            <div className="herochart-sub">
              Bars: rail vs Oriel translation · Line: Oriel vs CMS anchor
            </div>
          </div>
          <div className="herochart-head-right">
            <div className="herochart-legend">
              <span className="herochart-legend-band" style={{ background: 'var(--success)', opacity: 0.55 }} />
              <span>Public vs Oriel basis</span>
              <span className="herochart-legend-dot" style={{ background: c.lead }} />
              <span>Oriel vs CMS anchor basis</span>
            </div>
          </div>
        </header>
        <div className="herochart-body">
          <CmsBasisHistoryChart timeseries={cms.anchorTimeseries} accent={accent} />
        </div>
      </section>
    );
  }

  /* ── Bar + Line SVG chart (years × bp, zero baseline)
        Bars are tone-tinted (green positive, red negative); the line is
        the family accent (pink for HC). Same hover tooltip primitive
        (.forward-chart-tooltip) as the row 1 chart so the look stays
        consistent. */
  function CmsBasisHistoryChart({ timeseries, accent }) {
    const c = seriesColors(accent);
    const containerRef = useRef(null);
    const [w, setW] = useState(720);
    const [h, setH] = useState(280);
    const [hoverIdx, setHoverIdx] = useState(null);

    useEffect(() => {
      if (!containerRef.current) return;
      const obs = new ResizeObserver((entries) => {
        for (const e of entries) {
          const nextW = Math.max(320, Math.floor(e.contentRect.width));
          const nextH = Math.max(200, Math.floor(e.contentRect.height));
          setW((prev) => (Math.abs(prev - nextW) > 1 ? nextW : prev));
          setH((prev) => (Math.abs(prev - nextH) > 1 ? nextH : prev));
        }
      });
      obs.observe(containerRef.current);
      return () => obs.disconnect();
    }, []);

    const data = useMemo(
      () => (timeseries || []).filter((r) => Number.isFinite(r.year)),
      [timeseries]
    );

    const layout = useMemo(() => {
      if (!data.length) return null;
      const padL = 56, padR = 22, padT = 14, padB = 32;
      const innerW = w - padL - padR;
      const innerH = h - padT - padB;

      const allY = [];
      data.forEach((r) => {
        if (Number.isFinite(r.publicPrintBasisBps)) allY.push(r.publicPrintBasisBps);
        if (Number.isFinite(r.anchorBasisBps))      allY.push(r.anchorBasisBps);
      });
      const yMinRaw = Math.min(...allY, 0);
      const yMaxRaw = Math.max(...allY, 0);
      const span = yMaxRaw - yMinRaw || 1;
      const yMin = yMinRaw - span * 0.08;
      const yMax = yMaxRaw + span * 0.08;
      const ySpan = yMax - yMin || 1;

      const xs = data.map((r) => r.year);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      /* Bar width — half the slot so bars don't touch each other. */
      const slot = data.length > 1 ? innerW / (data.length - 1) : innerW;
      const barW = Math.min(slot * 0.42, 38);
      const halfBar = barW / 2;
      /* Inset both ends by halfBar so the leftmost bar's left edge lands
         exactly on padL — avoids overlap with Y-axis labels on the left. */
      const x = (yr) => {
        if (xMax === xMin) return padL + innerW / 2;
        const ratio = (yr - xMin) / (xMax - xMin);
        return padL + halfBar + ratio * (innerW - barW);
      };
      const y = (v) => padT + innerH - ((v - yMin) / ySpan) * innerH;
      const yZero = y(0);

      const points = data.map((r) => ({
        year: r.year,
        cx: x(r.year),
        publicBp: r.publicPrintBasisBps,
        anchorBp: r.anchorBasisBps,
        publicY:  Number.isFinite(r.publicPrintBasisBps) ? y(r.publicPrintBasisBps) : null,
        anchorY:  Number.isFinite(r.anchorBasisBps)      ? y(r.anchorBasisBps)      : null,
      }));

      const linePath = points
        .filter((p) => p.anchorY !== null)
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p.anchorY.toFixed(2)}`)
        .join(' ');

      const ticks = 4;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = yMin + (ySpan * k) / ticks;
        return { v, y: y(v) };
      });

      return {
        w, h, padL, padR, padT, padB, innerW, innerH,
        points, linePath, yTicks, yZero, barW, hitW: Math.max(slot, 28),
      };
    }, [data, w, h]);

    if (!layout) return <div className="chart-empty">No data.</div>;
    const hover = hoverIdx !== null ? layout.points[hoverIdx] : null;

    return (
      <div
        ref={containerRef}
        className="forward-chart"
        style={{ width: '100%', height: '100%' }}
      >
        <svg
          viewBox={`0 0 ${layout.w} ${layout.h}`}
          width={layout.w}
          height={layout.h}
          role="img"
          aria-label="CMS basis history bars + anchor line"
        >
          {/* 1. Gridlines (background) */}
          {layout.yTicks.map((t, i) => (
            <line key={`g-${i}`}
              x1={layout.padL} x2={layout.w - layout.padR}
              y1={t.y} y2={t.y}
              stroke="var(--border-subtle)" strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* 2. Zero baseline (dashed) */}
          <line
            x1={layout.padL} x2={layout.w - layout.padR}
            y1={layout.yZero} y2={layout.yZero}
            stroke="var(--text-subtle)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            opacity="0.7"
          />

          {/* 3. Bars — Public-Print Basis (green positive, red negative) */}
          {layout.points.map((p, i) => {
            if (p.publicY === null) return null;
            const pos = (p.publicBp ?? 0) >= 0;
            const top = pos ? p.publicY : layout.yZero;
            const bot = pos ? layout.yZero : p.publicY;
            const fill   = pos ? 'rgba(22, 163, 74, 0.55)' : 'rgba(220, 38, 38, 0.55)';
            const stroke = pos ? 'var(--success)' : 'var(--danger)';
            const isHover = hoverIdx === i;
            return (
              <rect
                key={`b-${i}`}
                x={p.cx - layout.barW / 2}
                y={top}
                width={layout.barW}
                height={Math.max(bot - top, 1)}
                rx="3"
                fill={fill}
                stroke={stroke}
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
                opacity={isHover ? 1 : 0.95}
              />
            );
          })}

          {/* 4. Line — Oriel vs CMS anchor basis (family accent) */}
          <path
            d={layout.linePath}
            fill="none"
            stroke={c.lead}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* 5. Y-axis labels rendered LAST so they sit on top of bars */}
          {layout.yTicks.map((t, i) => (
            <text key={`yl-${i}`}
              x={layout.padL - 8} y={t.y + 3}
              textAnchor="end"
              fontSize="10.5" fontFamily="JetBrains Mono, monospace"
              fill="var(--text-subtle)"
            >{`${Math.round(t.v)} bp`}</text>
          ))}
          <text
            x={14}
            y={layout.padT + layout.innerH / 2}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-muted)"
            fontFamily="Inter, system-ui"
            transform={`rotate(-90, 14, ${layout.padT + layout.innerH / 2})`}
          >Basis (bp)</text>

          {/* Anchor markers */}
          {layout.points.map((p, i) => p.anchorY === null ? null : (
            <circle
              key={`am-${i}`}
              cx={p.cx} cy={p.anchorY}
              r={hoverIdx === i ? 5.5 : 4.5}
              fill={c.lead}
              stroke="white"
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Hit targets (full-height rect per slot) */}
          {layout.points.map((p, i) => (
            <rect
              key={`hit-${i}`}
              x={p.cx - layout.hitW / 2}
              y={layout.padT}
              width={layout.hitW}
              height={layout.innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onFocus={() => setHoverIdx(i)}
              onBlur={() => setHoverIdx(null)}
              tabIndex={0}
              aria-label={`${p.year}: public ${fmtBp(p.publicBp)}, anchor ${fmtBp(p.anchorBp)}`}
            />
          ))}

          {/* X labels (year) */}
          {layout.points.map((p, i) => (
            <text
              key={`xl-${i}`}
              x={p.cx} y={layout.h - 10}
              textAnchor="middle"
              fontSize="10.5"
              fill="var(--text-muted)"
              fontFamily="Inter, system-ui"
            >{p.year}</text>
          ))}
        </svg>

        {hover && (() => {
          /* Tooltip pins above whichever is higher: bar TOP edge or
             anchor-line dot. Bar TOP = min(barY, yZero) so negative
             bars (which extend below zero) are anchored at yZero. */
          const barTop = hover.publicY === null
            ? Infinity
            : Math.min(hover.publicY, layout.yZero);
          const lineY = hover.anchorY === null ? Infinity : hover.anchorY;
          const topY = Math.min(barTop, lineY) - 16;
          return (
            <div
              className="forward-chart-tooltip"
              style={{
                left: `${(hover.cx / layout.w) * 100}%`,
                top:  `${topY}px`,
              }}
            >
              <div className="forward-chart-tooltip-mat">{hover.year}</div>
              <div className="forward-chart-tooltip-val">{fmtBp(hover.publicBp)}</div>
              <div className="forward-chart-tooltip-band">
                Anchor basis {fmtBp(hover.anchorBp)}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  /* ── Hedge Lens card — same .ip-card primitive as Basis & Action ── */
  function HedgeLensCard({ cms, accent }) {
    const r = cms.basisActionRow;
    const residualTone = Math.abs(r.residualBp) <= 15 ? 'success'
                       : Math.abs(r.residualBp) <= 30 ? 'warning' : 'danger';
    const effTone = toneConf(r.signalConfidence);
    return (
      <section className={cn('ip-card', `accent-${accent}`)}>
        <header className="ip-card-head">
          <span className="ip-card-eyebrow">Hedge Lens</span>
        </header>
        <dl className="ip-card-rows">
          <Row label="Proxy"               value="BLS Medical CPI" />
          <Row label="Hedge Effectiveness" value={r.signalConfidence}
               tone={effTone} strong />
          <Row label="Residual Basis Risk" value={fmtBp(r.residualBp)}
               mono tone={residualTone} strong />
          <Row label="Horizon / Phase"     value="Phase 1 · Translation layer" />
        </dl>
      </section>
    );
  }

  /* ── Top RV Sleeves — small data-card with a 4-col table ── */
  function RvSleevesCard({ cms, accent }) {
    const sl = cms.serviceLines || [];
    if (!sl.length) return null;
    return (
      <section className={cn('data-card', `accent-${accent}`)}>
        <header className="data-card-head">
          <div>
            <span className="data-card-title">Top RV Sleeves</span>
            <div className="data-card-sub">Service-line oriel signal vs CMS YoY</div>
          </div>
        </header>
        <div className="data-card-body">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Sleeve</th>
                <th className="num">CMS YoY (%)</th>
                <th className="num">Oriel (%)</th>
                <th className="num">Gap (bp)</th>
                <th>Conf.</th>
              </tr>
            </thead>
            <tbody>
              {sl.map((row, i) => {
                const gapTone = tonePct(row.gapBps);
                const confTone = toneConf(row.confidence);
                return (
                  <tr key={i}>
                    <td className="strong">{titleCaseSnake(row.serviceLine)}</td>
                    <td className="num">{Number(row.cmsYoy).toFixed(2)}</td>
                    <td className="num">{Number(row.orielSignal).toFixed(2)}</td>
                    <td className={cn('num strong',
                      gapTone === 'success' && 'tone-success',
                      gapTone === 'danger'  && 'tone-danger')}>
                      {fmtBp(row.gapBps)}
                    </td>
                    <td className={cn('strong',
                      confTone === 'success' && 'tone-success',
                      confTone === 'warning' && 'tone-warning',
                      confTone === 'danger'  && 'tone-danger')}>
                      {row.confidence}
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

  /* ───────────────────────── tiny shared row primitives ──────── */
  function Row({ label, value, mono, tone, strong }) {
    return (
      <div className="ip-card-row">
        <dt>{label}</dt>
        <dd className={cn(
          mono && 'font-mono',
          tone === 'success' && 'tone-success',
          tone === 'danger'  && 'tone-danger',
          tone === 'warning' && 'tone-warning',
          strong && 'strong',
        )}>{value}</dd>
      </div>
    );
  }

  function MvsRow({ label, value, signal, valueTone, signalTone, strong }) {
    return (
      <li className="mvs-card-row">
        <span className="mvs-card-row-label">{label}</span>
        <span className={cn('mvs-card-row-value font-mono',
          valueTone === 'success' && 'tone-success',
          valueTone === 'danger'  && 'tone-danger',
          valueTone === 'warning' && 'tone-warning',
          (valueTone || strong) && 'strong')}>{value}</span>
        <span className={cn('mvs-card-row-signal', signalTone && `signal-${signalTone}`)}>{signal}</span>
      </li>
    );
  }

  window.App = window.App || {};
  window.App.CmsOverviewPanel = CmsOverviewPanel;
})();
