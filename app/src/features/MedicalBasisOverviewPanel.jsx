/* ==========================================================================
   MedicalBasisOverviewPanel.jsx — Overview tab body for the ForecastEx
   Medical Basis index. Mirrors v7 tabs/medical_basis_tab.py 1:1 in DATA
   but rebuilt on our standard primitives so the page sits at the same
   visual quality as every other tab.

   Layout (top to bottom):
     1. Reference Legs row     — 3 .info-cards (CPI-U / Medical CPI / Contract event)
     2. Body row [.info-row.cols-2-asym]
        ├─ LEFT  — Contract Spec table + Settlement Calculator
        └─ RIGHT — Charts card with 3 inner tabs (Ladder / Distribution /
                   Basis curve) + "Contracts → Surface" flow box
     3. Sample Contract Ladder — full-width .data-card with the 20-row table

   The maturity selector lives in the sticky-head MedicalBasisKpiStrip;
   `selectedIdx` flows down via prop so the charts re-render in lockstep
   when the user picks a different maturity year.

   Registers window.App.MedicalBasisOverviewPanel.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useRef, useEffect, useMemo } = React;
  const { cn } = window.App.utils;
  const { Icon } = window.App;

  /* ───────────────────────── helpers ───────────────────────── */
  const fmtBp     = (v) => v == null || !isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${Math.round(Number(v))} bp`;
  const fmtPct1   = (v) => v == null || !isFinite(v) ? '—' : `${(Number(v) * 100).toFixed(1)}%`;
  // 1-decimal price/probability formatter — matches v7's ladder-table format
  // ("78.0%") and v7's ladder-chart hovertemplate ("YES price: %{y:.1f}%").
  const fmtPriceP = (v) => v == null || !isFinite(v) ? '—' : `${(Number(v) * 100).toFixed(1)}%`;
  const tonePct   = (v) => v == null ? null : v >= 0 ? 'success' : 'danger';

  const seriesColors = (accent) => ({
    lead:        accent === 'pink' ? 'var(--pink)'        : 'var(--accent)',
    band:        accent === 'pink' ? 'rgba(20, 184, 166, 0.12)' : 'rgba(45, 91, 255, 0.10)',
    bandStroke:  accent === 'pink' ? 'rgba(20, 184, 166, 0.25)' : 'rgba(45, 91, 255, 0.25)',
    secondary:   'var(--text-muted)',
  });

  /* ResizeObserver hook (same pattern as the cms charts use). */
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
  function MedicalBasisOverviewPanel({ index, selectedIdx }) {
    const mb = index?.detail?.mb;
    if (!mb || !Array.isArray(mb.basisPoints) || !mb.basisPoints.length) return null;
    const accent = index.accent || 'pink';
    const idx = Math.max(0, Math.min(selectedIdx ?? 1, mb.basisPoints.length - 1));

    return (
      <div className="mb-overview">
        {/* Section 1 — Reference Legs (3 cards) */}
        <ReferenceLegsRow legs={mb.referenceLegs} />

        {/* Section 2 — Body row.
            Charts (LEFT, 1.35fr) + Tools (RIGHT, 1fr). Both columns end
            at the same point — the chart card stretches to whatever
            height the right column claims (calc trigger + spec + flow). */}
        <div className="mb-body-row">
          <div className="mb-col-left">
            <ChartsCard mb={mb} idx={idx} accent={accent} />
          </div>
          <div className="mb-col-right">
            <SettlementCalculatorCard
              defaults={mb.settlementExample}
              thresholds={mb.defaultThresholds || [0, 100, 200, 300, 400]}
              accent={accent}
            />
            <ContractSpecCard rows={mb.contractSpec} />
            <SurfaceFlowBox accent={accent} />
          </div>
        </div>

        {/* Section 3 — Maturity Spotlight (full-width).
            Pulled out of the left column so the body row's two columns
            balance naturally and the spotlight stats can breathe across
            the full page width (3-col × 2-row instead of cramped 2x3). */}
        <MaturitySpotlightCard mb={mb} idx={idx} accent={accent} />

        {/* Section 3 — Sample Contract Ladder */}
        <SampleLadderTable mb={mb} idx={idx} />

        {/* Footer — monotonic / repaired status note */}
        <ArbitrageNote mb={mb} />
      </div>
    );
  }

  /* ───────────────────────── Maturity Spotlight card ────────
     Sits below the Charts card in the left column. Aggregates the
     selected maturity's at-a-glance stats so the bottom of the left
     column carries useful info instead of empty space when the right
     column is taller (Calculator + Spec + Surface Flow stack). */
  function MaturitySpotlightCard({ mb, idx, accent }) {
    const sel    = mb.basisPoints[idx];
    const prev   = idx > 0 ? mb.basisPoints[idx - 1] : null;
    const back   = mb.basisPoints[mb.basisPoints.length - 1];
    const ladder = (mb.ladder || []).filter((r) => r.year === sel.year);
    const totalVol = ladder.reduce((s, r) => s + (r.volume || 0), 0);
    const totalOI  = ladder.reduce((s, r) => s + (r.openInterest || 0), 0);
    const avgYes   = ladder.length
      ? ladder.reduce((s, r) => s + (r.yesPrice || 0), 0) / ladder.length
      : 0;
    const termVsBack = back && back !== sel
      ? back.expectedSpreadBps - sel.expectedSpreadBps
      : null;
    const yoyVsPrev = prev
      ? sel.expectedSpreadBps - prev.expectedSpreadBps
      : null;
    return (
      <section className={cn('info-card mb-spotlight', `accent-${accent}`)}>
        <header className="info-card-head">
          <span className="info-card-eyebrow">Selected Maturity: {sel.year}</span>
          <span className="mb-spotlight-year">
            <Icon name="layers" size={11} /> {sel.year}
          </span>
        </header>
        <div className="mb-spotlight-grid">
          <SpotStat
            label="Expected basis"
            value={fmtBp(sel.expectedSpreadBps)}
            sub="Medical CPI − CPI-U"
            lead
          />
          <SpotStat
            label="P(spread > 0 bps)"
            value={fmtPct1(sel.probabilityGt0)}
            sub="Any positive spread"
          />
          <SpotStat
            label="P(spread > 200 bps)"
            value={fmtPct1(sel.probabilityGt200)}
            sub="200 bp threshold"
          />
          <SpotStat
            label="Avg ladder YES"
            value={fmtPriceP(avgYes)}
            sub={`${ladder.length} contracts`}
          />
          <SpotStat
            label={`Term vs ${back?.year}`}
            value={termVsBack == null ? '—' : fmtBp(termVsBack)}
            sub={termVsBack == null ? '—' : (termVsBack >= 0 ? 'Wider at back' : 'Tighter at back')}
            tone={tonePct(termVsBack)}
          />
          <SpotStat
            label={prev ? `YoY vs ${prev.year}` : 'YoY change'}
            value={yoyVsPrev == null ? '—' : fmtBp(yoyVsPrev)}
            sub={yoyVsPrev == null ? 'No prior year' : (yoyVsPrev >= 0 ? 'Steepening' : 'Flattening')}
            tone={tonePct(yoyVsPrev)}
          />
        </div>
        <footer className="mb-spotlight-foot">
          <span><Icon name="info" size={11} /> {sel.observationWindow}</span>
          <span className="mb-spotlight-foot-meta">
            Vol {totalVol.toLocaleString()} · OI {totalOI.toLocaleString()} ·
            <span className="feed-pill feed-pill-warning mb-spotlight-source">{sel.sourceStatus}</span>
          </span>
        </footer>
      </section>
    );
  }

  function SpotStat({ label, value, sub, lead, tone }) {
    return (
      <div className={cn('mb-spotlight-stat', lead && 'lead', tone && `tone-${tone}`)}>
        <div className="mb-spotlight-stat-label">{label}</div>
        <div className={cn('mb-spotlight-stat-value', 'font-mono')}>{value}</div>
        <div className="mb-spotlight-stat-sub">{sub}</div>
      </div>
    );
  }

  /* ───────────────────────── Reference Legs (thin strip) ────
     Single-line .info-card carrying the contract equation:
       [1] CPI-U YoY  −  [2] Medical CPI YoY  ⟹  [3] Contract Event
     Source attribution lives in a small foot under each leg so the
     strip stays one row tall. The Contract Event term gets the family
     pink tint so it reads as the outcome, not just another reference. */
  function ReferenceLegsRow({ legs }) {
    if (!legs || !legs.length) return null;
    /* v7's reference_legs are: [Reference Leg 1, Reference Leg 2, Contract Event] */
    const ops = ['−', '⟹'];
    return (
      <section className="info-card mb-legs-strip">
        <div className="mb-legs-strip-row">
          <span className="info-card-eyebrow mb-legs-strip-eyebrow">Reference Legs · Contract Event</span>
          <div className="mb-legs-strip-equation">
            {legs.map((leg, i) => (
              <React.Fragment key={i}>
                <div className={cn('mb-leg-mini', leg.kind === 'Contract Event' && 'event')}>
                  <span className="mb-leg-mini-num">{i + 1}</span>
                  <span className="mb-leg-mini-text">
                    <span className="mb-leg-mini-name">{leg.name}</span>
                    <span className="mb-leg-mini-source">{leg.source}</span>
                  </span>
                </div>
                {i < legs.length - 1 && <span className="mb-leg-mini-op" aria-hidden="true">{ops[i]}</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>
    );
  }

  /* ───────────────────────── Contract Spec table ─────────── */
  function ContractSpecCard({ rows }) {
    if (!rows || !rows.length) return null;
    return (
      <section className="data-card">
        <header className="data-card-head">
          <div>
            <div className="data-card-title">Illustrative Contract Spec</div>
            <div className="data-card-sub">Field-by-field contract definition (Field / Value)</div>
          </div>
        </header>
        <div className="data-card-body">
          <table className="data-table compact mb-spec-table">
            <thead>
              <tr><th>Field</th><th>Value</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="strong mb-spec-field">{r.field}</td>
                  <td>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  /* ───────────────────────── Settlement Calculator ────────
     Compact button + popover (mirrors the Tier-1 Controls pattern from
     the perp tab). The trigger shows the live inputs summary + the
     YES/NO outcome pill so the answer is always visible without
     opening anything. Click the trigger to expand a 3-input popover;
     changes apply instantly (no save button needed for a one-tap
     what-if calculator). Click outside or press Escape to close. */
  function SettlementCalculatorCard({ defaults, thresholds, accent }) {
    const [cpi, setCpi] = useState(defaults?.cpiYoyPct ?? 3.1);
    const [med, setMed] = useState(defaults?.medicalCpiYoyPct ?? 5.6);
    const [th,  setTh]  = useState(defaults?.thresholdBps ?? 200);
    const [open, setOpen] = useState(false);

    const spreadBps  = (Number(med) - Number(cpi)) * 100;
    const settlesYes = spreadBps > Number(th);

    /* Outside-click + Escape close, same as PerpControlsBar. */
    const wrapRef = useRef(null);
    useEffect(() => {
      if (!open) return;
      const onDown = (e) => {
        if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
      };
      const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('keydown', onKey);
      };
    }, [open]);

    const onReset = () => {
      setCpi(defaults?.cpiYoyPct ?? 3.1);
      setMed(defaults?.medicalCpiYoyPct ?? 5.6);
      setTh(defaults?.thresholdBps ?? 200);
    };

    const accentClass = accent || 'pink';

    return (
      <div className={cn('perp-controls-button-wrap mb-calc-wrap', `accent-${accentClass}`)} ref={wrapRef}>
        <button
          type="button"
          className={cn('perp-controls-trigger mb-calc-trigger', `accent-${accentClass}`, open && 'open')}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <Icon name="sliders" size={13} />
          <span className="perp-controls-trigger-label">Settlement Calculator</span>
          <span className="perp-controls-trigger-summary font-mono">
            {`${Number(med).toFixed(1)}% / ${Number(cpi).toFixed(1)}% · ${th} bp · spread ${fmtBp(spreadBps)}`}
          </span>
          <span className={cn('mb-calc-pill', settlesYes ? 'yes' : 'no')} aria-live="polite">
            <Icon name={settlesYes ? 'check' : 'info'} size={11} />
            {settlesYes ? 'YES · $1.00' : 'NO · $0.00'}
          </span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
        </button>

        {open && (
          <div className={cn('perp-controls-pop mb-calc-pop', `accent-${accentClass}`)} role="dialog" aria-label="Settlement calculator">
            <header className="perp-controls-pop-head">
              <div className="perp-controls-pop-title">Settlement Calculator</div>
              <div className="perp-controls-pop-sub">
                Plug in BLS prints to see if the contract settles YES. Changes apply instantly.
              </div>
            </header>
            <div className="perp-controls-pop-grid mb-calc-pop-grid">
              <NumInput label="CPI-U YoY (%)"       value={cpi} onChange={setCpi} step={0.1} min={-5} max={20} />
              <NumInput label="Medical CPI YoY (%)" value={med} onChange={setMed} step={0.1} min={-5} max={25} />
              <SelectInput label="Threshold (bps)"  value={th}  onChange={setTh} options={thresholds} />
            </div>
            <footer className="perp-controls-pop-foot mb-calc-pop-foot">
              <button type="button" className="perp-controls-pop-btn ghost" onClick={onReset}>
                Reset to v7 example
              </button>
              <div className="mb-calc-pop-readout">
                <span className="mb-calc-pop-readout-label">Observed spread</span>
                <span className={cn('mb-calc-pop-readout-value font-mono',
                                    tonePct(spreadBps) === 'success' && 'tone-success',
                                    tonePct(spreadBps) === 'danger'  && 'tone-danger')}>
                  {fmtBp(spreadBps)}
                </span>
              </div>
            </footer>
          </div>
        )}
      </div>
    );
  }

  function NumInput({ label, value, onChange, step, min, max }) {
    return (
      <label className="perp-num-input">
        <span className="perp-num-input-label">{label}</span>
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </label>
    );
  }
  function SelectInput({ label, value, onChange, options }) {
    return (
      <label className="perp-num-input">
        <span className="perp-num-input-label">{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="mb-select-input"
        >
          {options.map((o) => <option key={o} value={o}>{o} bps</option>)}
        </select>
      </label>
    );
  }

  /* ───────────────────────── Charts card (3 sub-tabs) ──────
     Ladder / Distribution / Basis curve — shares the .herochart-card
     chrome that other index tabs use, but with INNER tabs because v7
     groups these three views together. */
  function ChartsCard({ mb, idx, accent }) {
    const [tab, setTab] = useState('ladder');
    const sel = mb.basisPoints[idx];
    const titleByTab = {
      ladder: 'Contract Ladder · Threshold YES Prices',
      distribution: 'Implied Spread Distribution',
      curve: 'Medical-vs-CPI Basis Curve',
    };
    const subByTab = {
      ladder:       `YES prices for spread > threshold contracts at maturity ${sel.year}`,
      distribution: `Bucketed probability distribution for the spread at maturity ${sel.year}`,
      curve:        `Expected medical-vs-CPI basis across all maturities`,
    };
    const onExpand = () => window.App.expandChart({
      title: titleByTab[tab],
      sub: subByTab[tab],
      accent,
      render: () => tab === 'ladder'       ? <LadderChart      mb={mb} idx={idx} accent={accent} />
                  : tab === 'distribution' ? <DistributionChart mb={mb} idx={idx} accent={accent} />
                                            : <BasisCurveChart   mb={mb} accent={accent} />,
    });
    return (
      <section className={cn('herochart-card', `accent-${accent}`)}>
        <header className="herochart-head">
          <div className="herochart-head-text">
            <div className="herochart-title">Contract Ladder & Implied Distribution</div>
            <div className="herochart-sub">{subByTab[tab]}</div>
          </div>
          <div className="herochart-head-right">
            {/* Maturity chip — makes it obvious which year the ladder /
                distribution charts are showing (the curve view ignores it). */}
            {tab !== 'curve' && (
              <span className="mb-charts-mat-chip">
                <Icon name="layers" size={11} /> Maturity {sel.year}
              </span>
            )}
            <div className="herochart-tabs">
              <button type="button" className={cn('herochart-tab', tab === 'ladder' && 'active')}
                      onClick={() => setTab('ladder')}>Ladder</button>
              <button type="button" className={cn('herochart-tab', tab === 'distribution' && 'active')}
                      onClick={() => setTab('distribution')}>Distribution</button>
              <button type="button" className={cn('herochart-tab', tab === 'curve' && 'active')}
                      onClick={() => setTab('curve')}>Basis curve</button>
            </div>
            <button type="button" className="chart-expand-btn" onClick={onExpand}
                    aria-label="Expand chart" title="Expand chart">
              <Icon name="maximize" size={14} />
            </button>
          </div>
        </header>
        <div className="herochart-body">
          {tab === 'ladder'       && <LadderChart      mb={mb} idx={idx} accent={accent} />}
          {tab === 'distribution' && <DistributionChart mb={mb} idx={idx} accent={accent} />}
          {tab === 'curve'        && <BasisCurveChart   mb={mb} accent={accent} />}
        </div>
      </section>
    );
  }

  /* ── Ladder bar chart — YES price vs threshold, single maturity ── */
  function LadderChart({ mb, idx, accent }) {
    const c = seriesColors(accent);
    const [ref, w, hMeasured] = useChartSize(560, 300);
    const [hoverIdx, setHoverIdx] = useState(null);
    const sel = mb.basisPoints[idx];
    const rows = (mb.ladder || []).filter((r) => r.year === sel.year)
                                  .sort((a, b) => a.thresholdBps - b.thresholdBps);

    const layout = useMemo(() => {
      if (!rows.length) return null;
      const h = Math.max(hMeasured || 0, 220);
      const padL = 56, padR = 22, padT = 14, padB = 36;
      const innerW = Math.max(w - padL - padR, 40);
      const innerH = h - padT - padB;
      const yMax = 100;  // YES price is 0..1 → percent 0..100
      const yMin = 0;
      const slot = rows.length > 1 ? innerW / (rows.length - 1) : innerW;
      const barW = Math.min(slot * 0.55, 56);
      const halfBar = barW / 2;
      // Inset both ends so leftmost bar's left edge lands at padL.
      const xInset = (i) => {
        if (rows.length <= 1) return padL + innerW / 2;
        return padL + halfBar + (i / (rows.length - 1)) * (innerW - barW);
      };
      const y = (v) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
      const points = rows.map((r, i) => ({
        ...r,
        cx: xInset(i),
        barY: y(r.yesPrice * 100),
      }));
      const ticks = [0, 25, 50, 75, 100];
      const yTicks = ticks.map((v) => ({ v, y: y(v) }));
      return { w, h, padL, padR, padT, padB, innerW, innerH, points, yTicks, barW, hitW: Math.max(slot, 32) };
    }, [rows, w, hMeasured]);

    if (!layout) return <div className="chart-empty">No ladder data for this maturity.</div>;
    const hover = hoverIdx !== null ? layout.points[hoverIdx] : null;

    return (
      <div ref={ref} className="forward-chart" style={{ width: '100%', height: '100%' }}>
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width={layout.w} height={layout.h}>
          {/* Gridlines */}
          {layout.yTicks.map((t, i) => (
            <line key={`g-${i}`}
              x1={layout.padL} x2={layout.w - layout.padR}
              y1={t.y} y2={t.y}
              stroke="var(--border-subtle)" strokeWidth="1"
              vectorEffect="non-scaling-stroke" />
          ))}

          {/* Bars */}
          {layout.points.map((p, i) => {
            const top = p.barY;
            const bot = layout.padT + layout.innerH;
            const isHover = hoverIdx === i;
            return (
              <rect key={`b-${i}`}
                x={p.cx - layout.barW / 2} y={top}
                width={layout.barW} height={Math.max(bot - top, 1)}
                rx="3"
                fill={c.lead} fillOpacity={isHover ? 0.85 : 0.65}
                stroke={c.lead} strokeWidth="1.4"
                vectorEffect="non-scaling-stroke" />
            );
          })}

          {/* Y-axis labels last (on top of bars) */}
          {layout.yTicks.map((t, i) => (
            <text key={`yl-${i}`}
              x={layout.padL - 8} y={t.y + 3}
              textAnchor="end"
              fontSize="10.5" fontFamily="JetBrains Mono, monospace"
              fill="var(--text-subtle)">
              {`${t.v}%`}
            </text>
          ))}
          <text x={14} y={layout.padT + layout.innerH / 2}
                textAnchor="middle" fontSize="11" fill="var(--text-muted)"
                fontFamily="Inter, system-ui"
                transform={`rotate(-90, 14, ${layout.padT + layout.innerH / 2})`}>
            YES price / probability
          </text>

          {/* Hit targets */}
          {layout.points.map((p, i) => (
            <rect key={`hit-${i}`}
              x={p.cx - layout.hitW / 2} y={layout.padT}
              width={layout.hitW} height={layout.innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)} />
          ))}

          {/* X-axis labels */}
          {layout.points.map((p, i) => (
            <text key={`xl-${i}`}
              x={p.cx} y={layout.h - 18}
              textAnchor="middle" fontSize="10.5"
              fill="var(--text-muted)" fontFamily="Inter, system-ui">
              {`> ${p.thresholdBps}`}
            </text>
          ))}
          <text x={layout.padL + layout.innerW / 2} y={layout.h - 4}
                textAnchor="middle" fontSize="10.5"
                fill="var(--text-subtle)" fontFamily="Inter, system-ui">
            Medical CPI − CPI-U threshold (bps)
          </text>
        </svg>

        {hover && (() => {
          /* Pin tooltip 10 px above the hovered bar's own top edge.
             Tooltip CSS anchors at its bottom-centre via
             transform: translate(-50%, -100%); we keep the Y half
             and override the X half so the tooltip swings to the
             right of the bar when the bar sits near the chart's
             left edge (otherwise the leftmost bar's tooltip is
             clipped by the chart container), and to the left of
             the bar when the bar sits near the right edge. */
          const leftPct = (hover.cx / layout.w) * 100;
          const xTranslate =
            leftPct < 14 ? '0%' :
            leftPct > 86 ? '-100%' :
            '-50%';
          const topY = hover.barY - 10;
          return (
            <div className="forward-chart-tooltip"
                 style={{
                   left: `${leftPct}%`,
                   top: `${topY}px`,
                   transform: `translate(${xTranslate}, -100%)`,
                 }}>
              <div className="forward-chart-tooltip-mat">{`> ${hover.thresholdBps} bps`}</div>
              <div className="forward-chart-tooltip-val">{fmtPriceP(hover.yesPrice)}</div>
              <div className="forward-chart-tooltip-band">
                Bid {hover.bid?.toFixed(2)} · Ask {hover.ask?.toFixed(2)} · Vol {hover.volume?.toLocaleString()}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  /* ── Distribution bar chart — bucket probabilities, single maturity ── */
  function DistributionChart({ mb, idx, accent }) {
    const c = seriesColors(accent);
    const [ref, w, hMeasured] = useChartSize(560, 300);
    const [hoverIdx, setHoverIdx] = useState(null);
    const sel = mb.basisPoints[idx];
    const rows = (mb.distribution || []).filter((r) => r.year === sel.year);

    const layout = useMemo(() => {
      if (!rows.length) return null;
      const h = Math.max(hMeasured || 0, 220);
      const padL = 56, padR = 22, padT = 14, padB = 50;
      const innerW = Math.max(w - padL - padR, 40);
      const innerH = h - padT - padB;
      const yMaxRaw = Math.max(...rows.map((r) => r.probability));
      // Match v7: y_max = max(50%, max_prob + 10pp). The 50% floor reserves
      // headroom even when no bucket exceeds 40%, so the chart doesn't
      // dramatize a flat distribution.
      const yMax = Math.max(yMaxRaw + 0.10, 0.50);
      const yMin = 0;
      const slot = rows.length > 1 ? innerW / (rows.length - 1) : innerW;
      const barW = Math.min(slot * 0.55, 64);
      const halfBar = barW / 2;
      const xInset = (i) => {
        if (rows.length <= 1) return padL + innerW / 2;
        return padL + halfBar + (i / (rows.length - 1)) * (innerW - barW);
      };
      const y = (v) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
      const points = rows.map((r, i) => ({ ...r, cx: xInset(i), barY: y(r.probability) }));
      const ticks = 4;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = yMin + ((yMax - yMin) * k) / ticks;
        return { v, y: y(v) };
      });
      return { w, h, padL, padR, padT, padB, innerW, innerH, points, yTicks, barW, hitW: Math.max(slot, 32) };
    }, [rows, w, hMeasured]);

    if (!layout) return <div className="chart-empty">No distribution data for this maturity.</div>;
    const hover = hoverIdx !== null ? layout.points[hoverIdx] : null;

    return (
      <div ref={ref} className="forward-chart" style={{ width: '100%', height: '100%' }}>
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width={layout.w} height={layout.h}>
          {layout.yTicks.map((t, i) => (
            <line key={`g-${i}`}
              x1={layout.padL} x2={layout.w - layout.padR}
              y1={t.y} y2={t.y}
              stroke="var(--border-subtle)" strokeWidth="1"
              vectorEffect="non-scaling-stroke" />
          ))}
          {layout.points.map((p, i) => {
            const top = p.barY;
            const bot = layout.padT + layout.innerH;
            const isHover = hoverIdx === i;
            return (
              <rect key={`b-${i}`}
                x={p.cx - layout.barW / 2} y={top}
                width={layout.barW} height={Math.max(bot - top, 1)}
                rx="3"
                fill={c.secondary} fillOpacity={isHover ? 0.7 : 0.45}
                stroke={c.secondary} strokeWidth="1.2"
                vectorEffect="non-scaling-stroke" />
            );
          })}
          {layout.yTicks.map((t, i) => (
            <text key={`yl-${i}`}
              x={layout.padL - 8} y={t.y + 3} textAnchor="end"
              fontSize="10.5" fontFamily="JetBrains Mono, monospace"
              fill="var(--text-subtle)">
              {`${(t.v * 100).toFixed(0)}%`}
            </text>
          ))}
          <text x={14} y={layout.padT + layout.innerH / 2}
                textAnchor="middle" fontSize="11" fill="var(--text-muted)"
                fontFamily="Inter, system-ui"
                transform={`rotate(-90, 14, ${layout.padT + layout.innerH / 2})`}>
            Probability
          </text>
          {layout.points.map((p, i) => (
            <rect key={`hit-${i}`}
              x={p.cx - layout.hitW / 2} y={layout.padT}
              width={layout.hitW} height={layout.innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)} />
          ))}
          {layout.points.map((p, i) => (
            <text key={`xl-${i}`}
              x={p.cx} y={layout.h - 22}
              textAnchor="middle" fontSize="10"
              fill="var(--text-muted)" fontFamily="Inter, system-ui">
              {p.bucket}
            </text>
          ))}
          <text x={layout.padL + layout.innerW / 2} y={layout.h - 4}
                textAnchor="middle" fontSize="10.5"
                fill="var(--text-subtle)" fontFamily="Inter, system-ui">
            Implied spread bucket
          </text>
        </svg>
        {hover && (() => {
          // Pin tooltip just above each bar's own top + swing the
          // horizontal anchor when the bar is near the chart edges -
          // see the matching block ~120 lines up for the rationale.
          const leftPct = (hover.cx / layout.w) * 100;
          const xTranslate =
            leftPct < 14 ? '0%' :
            leftPct > 86 ? '-100%' :
            '-50%';
          const topY = hover.barY - 10;
          return (
            <div className="forward-chart-tooltip"
                 style={{
                   left: `${leftPct}%`,
                   top: `${topY}px`,
                   transform: `translate(${xTranslate}, -100%)`,
                 }}>
              <div className="forward-chart-tooltip-mat">{hover.bucket}</div>
              <div className="forward-chart-tooltip-val">{fmtPriceP(hover.probability)}</div>
              <div className="forward-chart-tooltip-band">Midpoint {Math.round(hover.midpointBps)} bps</div>
            </div>
          );
        })()}
      </div>
    );
  }

  /* ── Basis curve line chart — expected spread by maturity, with
        secondary P(>200) line on right axis ── */
  function BasisCurveChart({ mb, accent }) {
    const c = seriesColors(accent);
    const [ref, w, hMeasured] = useChartSize(560, 300);
    const [hoverIdx, setHoverIdx] = useState(null);
    const points = mb.basisPoints;

    const layout = useMemo(() => {
      if (!points.length) return null;
      const h = Math.max(hMeasured || 0, 220);
      const padL = 56, padR = 56, padT = 14, padB = 36;
      const innerW = Math.max(w - padL - padR, 40);
      const innerH = h - padT - padB;
      const exps = points.map((p) => p.expectedSpreadBps);
      // Auto-range on the actual data span — match v7's Plotly default
      // (which does NOT anchor the y-axis to 0). Anchoring to 0 would
      // squash a 140-211 bps curve into the upper third of the chart and
      // make the term structure look almost flat.
      const yMin = Math.min(...exps);
      const yMax = Math.max(...exps);
      const span = yMax - yMin || 1;
      const yLo = yMin - span * 0.20;
      const yHi = yMax + span * 0.20;
      const ySpan = yHi - yLo || 1;
      // Left Y (basis bps)
      const yL = (v) => padT + innerH - ((v - yLo) / ySpan) * innerH;
      // Right Y (probability 0..1)
      const yR = (v) => padT + innerH - (v - 0) * innerH;
      const x = (i) => padL + (points.length === 1 ? innerW / 2 : (innerW * i) / (points.length - 1));
      const pts = points.map((p, i) => ({
        ...p,
        cx: x(i),
        leftY:  yL(p.expectedSpreadBps),
        rightY: yR(Number.isFinite(p.probabilityGt200) ? p.probabilityGt200 : 0),
      }));
      const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p.leftY.toFixed(2)}`).join(' ');
      const rightLinePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p.rightY.toFixed(2)}`).join(' ');
      const ticks = 4;
      const leftTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = yLo + (ySpan * k) / ticks;
        return { v, y: yL(v) };
      });
      const rightTicks = [0, 0.25, 0.50, 0.75, 1.0].map((v) => ({ v, y: yR(v) }));
      return { w, h, padL, padR, padT, padB, innerW, innerH, pts, linePath, rightLinePath, leftTicks, rightTicks, hitW: Math.max(innerW / points.length, 32) };
    }, [points, w, hMeasured]);

    if (!layout) return <div className="chart-empty">No basis-curve data.</div>;
    const hover = hoverIdx !== null ? layout.pts[hoverIdx] : null;

    return (
      <div ref={ref} className="forward-chart" style={{ width: '100%', height: '100%' }}>
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width={layout.w} height={layout.h}>
          {/* Left-axis gridlines */}
          {layout.leftTicks.map((t, i) => (
            <line key={`g-${i}`}
              x1={layout.padL} x2={layout.w - layout.padR}
              y1={t.y} y2={t.y}
              stroke="var(--border-subtle)" strokeWidth="1"
              vectorEffect="non-scaling-stroke" />
          ))}

          {/* Right-axis dashed line for P(>200) */}
          <path d={layout.rightLinePath} fill="none"
                stroke={c.secondary} strokeWidth="2"
                strokeDasharray="4 4" strokeLinecap="round"
                vectorEffect="non-scaling-stroke" opacity="0.85" />
          {layout.pts.map((p, i) => (
            <circle key={`rd-${i}`} cx={p.cx} cy={p.rightY} r="3"
              fill="white" stroke={c.secondary} strokeWidth="1.5"
              vectorEffect="non-scaling-stroke" />
          ))}

          {/* Left-axis solid line for expected basis */}
          <path d={layout.linePath} fill="none"
                stroke={c.lead} strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" />
          {layout.pts.map((p, i) => (
            <circle key={`ld-${i}`} cx={p.cx} cy={p.leftY}
              r={hoverIdx === i ? 5.5 : 4.5}
              fill={c.lead} stroke="white" strokeWidth="1.6"
              vectorEffect="non-scaling-stroke" />
          ))}

          {/* Left-axis labels */}
          {layout.leftTicks.map((t, i) => (
            <text key={`yl-${i}`}
              x={layout.padL - 8} y={t.y + 3} textAnchor="end"
              fontSize="10.5" fontFamily="JetBrains Mono, monospace"
              fill="var(--text-subtle)">
              {`${Math.round(t.v)} bp`}
            </text>
          ))}
          <text x={14} y={layout.padT + layout.innerH / 2}
                textAnchor="middle" fontSize="11" fill="var(--text-muted)"
                fontFamily="Inter, system-ui"
                transform={`rotate(-90, 14, ${layout.padT + layout.innerH / 2})`}>
            Expected spread (bps)
          </text>

          {/* Right-axis labels */}
          {layout.rightTicks.map((t, i) => (
            <text key={`yr-${i}`}
              x={layout.w - layout.padR + 8} y={t.y + 3} textAnchor="start"
              fontSize="10.5" fontFamily="JetBrains Mono, monospace"
              fill="var(--text-subtle)">
              {`${(t.v * 100).toFixed(0)}%`}
            </text>
          ))}
          <text x={layout.w - 14} y={layout.padT + layout.innerH / 2}
                textAnchor="middle" fontSize="11" fill="var(--text-muted)"
                fontFamily="Inter, system-ui"
                transform={`rotate(90, ${layout.w - 14}, ${layout.padT + layout.innerH / 2})`}>
            Probability
          </text>

          {/* Hit targets */}
          {layout.pts.map((p, i) => (
            <rect key={`hit-${i}`}
              x={p.cx - layout.hitW / 2} y={layout.padT}
              width={layout.hitW} height={layout.innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)} />
          ))}
          {/* X-axis labels */}
          {layout.pts.map((p, i) => (
            <text key={`xl-${i}`}
              x={p.cx} y={layout.h - 10} textAnchor="middle"
              fontSize="10.5" fill="var(--text-muted)" fontFamily="Inter, system-ui">
              {p.year}
            </text>
          ))}
        </svg>

        {hover && (() => {
          const topY = Math.min(hover.leftY, hover.rightY) - 16;
          return (
            <div className="forward-chart-tooltip"
                 style={{ left: `${(hover.cx / layout.w) * 100}%`, top: `${topY}px` }}>
              <div className="forward-chart-tooltip-mat">{hover.year}</div>
              <div className="forward-chart-tooltip-val">{fmtBp(hover.expectedSpreadBps)}</div>
              <div className="forward-chart-tooltip-band">
                P(spread &gt; 200 bps): {fmtPct1(hover.probabilityGt200)}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  /* ───────────────────────── Surface flow box ─────────── */
  function SurfaceFlowBox({ accent }) {
    return (
      <section className="info-card mb-flow-card">
        <header className="info-card-head">
          <span className="info-card-eyebrow">From Contracts to a Surface</span>
        </header>
        <div className="mb-flow-grid">
          <div className="mb-flow-step">
            <div className="mb-flow-num">1</div>
            <div className="mb-flow-text">
              <div className="mb-flow-title">Binary spread contracts</div>
              <div className="mb-flow-sub">YES prices across thresholds</div>
            </div>
          </div>
          <Icon name="arrow-right" size={18} className="mb-flow-arrow" />
          <div className="mb-flow-step">
            <div className="mb-flow-num">2</div>
            <div className="mb-flow-text">
              <div className="mb-flow-title">Oriel reference engine</div>
              <div className="mb-flow-sub">Normalize, repair, infer</div>
            </div>
          </div>
          <Icon name="arrow-right" size={18} className="mb-flow-arrow" />
          <div className="mb-flow-step">
            <div className="mb-flow-num">3</div>
            <div className="mb-flow-text">
              <div className="mb-flow-title">Market-implied basis curve</div>
              <div className="mb-flow-sub">Basis, hedges, perp wrappers</div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  /* ───────────────────────── Sample Contract Ladder ─────────── */
  function SampleLadderTable({ mb, idx }) {
    const rows = mb.ladder || [];
    if (!rows.length) return null;
    const sel = mb.basisPoints[idx];
    return (
      <section className="data-card">
        <header className="data-card-head">
          <div>
            <span className="data-card-title">Sample Contract Ladder</span>
            <div className="data-card-sub">
              Illustrative ForecastEx-style ladder — YES prices, bid / ask, volume, open interest by threshold and maturity
            </div>
          </div>
        </header>
        <div className="data-card-body">
          <table className="data-table compact mb-ladder-table">
            <thead>
              <tr>
                <th>Maturity</th>
                <th>Observation Window</th>
                <th>Contract</th>
                <th className="num">YES Price</th>
                <th className="num">Bid</th>
                <th className="num">Ask</th>
                <th className="num">Volume</th>
                <th className="num">Open Interest</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isSelMaturity = r.year === sel.year;
                /* Each maturity group has 5 thresholds; the v7 ladder is
                   already sorted by (maturity, threshold). Tag every other
                   group with the alt class so adjacent maturities read
                   distinctly in the table. */
                const matIdx = mb.basisPoints.findIndex((p) => p.year === r.year);
                const altGroup = !isSelMaturity && matIdx % 2 === 1;
                return (
                  <tr key={i}
                      className={cn(
                        isSelMaturity && 'mb-ladder-row-active',
                        altGroup       && 'mb-ladder-row-alt',
                      )}>
                    <td className="strong">{r.maturity}</td>
                    <td className="small">{r.observationWindow}</td>
                    <td>{r.contractLabel}</td>
                    <td className={cn('num strong')}>{fmtPriceP(r.yesPrice)}</td>
                    <td className="num">{r.bid?.toFixed(2)}</td>
                    <td className="num">{r.ask?.toFixed(2)}</td>
                    <td className="num">{r.volume?.toLocaleString()}</td>
                    <td className="num">{r.openInterest?.toLocaleString()}</td>
                    <td><span className="feed-pill feed-pill-warning">{r.sourceStatus}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  /* ───────────────────────── Arbitrage status note ─────────── */
  function ArbitrageNote({ mb }) {
    const repaired = !!mb.meta?.repaired;
    return (
      <div className={cn('mb-arb-note', repaired ? 'tone-warning' : 'tone-success')}>
        <Icon name={repaired ? 'info' : 'check'} size={13} />
        <span className="mb-arb-label">{repaired ? 'Monotonic repair applied' : 'Monotonic ✓'}</span>
        <span className="mb-arb-text">
          {repaired
            ? 'One or more ladders required monotonic repair. Check YES prices for arbitrage consistency.'
            : 'Sample ladders are arbitrage-consistent: higher thresholds have lower or equal YES prices.'}
        </span>
      </div>
    );
  }

  /* Tiny shared row used by SettlementCalculator output */
  function Row({ label, value, mono, tone, strong }) {
    const { cn: cnUtil } = window.App.utils;
    return (
      <div className="ip-card-row">
        <dt>{label}</dt>
        <dd className={cnUtil(mono && 'font-mono', tone && `tone-${tone}`, strong && 'strong')}>{value}</dd>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.MedicalBasisOverviewPanel = MedicalBasisOverviewPanel;
})();
