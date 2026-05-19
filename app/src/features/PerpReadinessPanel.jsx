/* ==========================================================================
   PerpReadinessPanel.jsx — Tier-1 CPI Basis / perp readiness panel.
   Mirrors v7's tabs/perp_readiness_tab.py 1:1 in DATA, but rolls v7's long
   scroll into the parent tab bar so the user navigates one flat nav.

   v7 section map → our perp tabs:
     • KPI strips + charts + Perp Print + Perp Structure  →  Overview
     • Curve Construction / Microstructure / Confidence
       + Calibration / Trade Playbook (calibration card)
       + Pricing Table                                    →  Construction
     • Source Blend / Index Governance
       + Distribution / Confidence (threshold probs)
       + Timestamp / Freshness Diagnostics
       + Venue Diagnostics (5-KPI + 2 charts + 3 tables)  →  Diagnostics
     • Calibration / Trade Playbook (3 trade idea cards)  →  Trade Ideas

   All numbers come from `index.detail.perp` which is the serialized output
   of v7's analytics.tier1_fv_engine + analytics.cpi_basis_diagnostics
   pipelines (built Python-side in app/perp_data.py).

   Registers window.App.PerpReadinessPanel.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useRef, useEffect } = React;
  const { cn } = window.App.utils;
  const { Icon, Badge } = window.App;
  /* Leaf presentation primitives + tiny formatters live in PerpPrimitives.jsx
     to keep this file focused on tab structure and chart logic. */
  const {
    HoverTip, SubHeader, PanelCard, PItem, NoteBox, Row, MvsRow,
    SimpleTable, fmtMonth, fmtNum,
  } = window.App.PerpPrimitives;

  function PerpReadinessPanel({ index, subtab, controls, hideInternalControls }) {
    const d = index.detail;
    const perp = d?.perp;
    if (!perp || !perp.tier1Snapshot) {
      return (
        <div className="card">
          <div className="placeholder">
            <div className="placeholder-icon"><Icon name="layers" size={26} /></div>
            <div className="placeholder-title">Tier 1 perp readiness payload not available</div>
            <div className="placeholder-text">
              The Python helper (`perp_data.py`) didn't ship a payload — falling back
              to engine.js wiring. Check the streamlit log for v7 import errors.
            </div>
          </div>
        </div>
      );
    }
    const accent = index.accent || 'pink';
    const tab = subtab || 'overview';

    // v7 perp_readiness_tab controls — FV Horizon + Perp Basis recompute the
    // snapshot client-side via simple linear interpolation on the curve.
    // Diag spread / stale are informational (their actual values are baked
    // into the Python-built diagnostics bundle at server-side defaults).
    //
    // When `controls` is supplied externally (parent IndexDetailView lifts
    // state up so the controls bar can live in the sticky head), use those
    // values instead of internal state. Otherwise, manage state locally.
    const defaults = perp.controls || {};
    const [localFv,  setLocalFv]  = useState(defaults.fvHorizonDays ?? 30);
    const [localPb,  setLocalPb]  = useState(defaults.perpBasisBp ?? 12);
    const [localDs,  setLocalDs]  = useState(defaults.diagSpreadBp ?? 12);
    const [localStale, setLocalStale] = useState(defaults.diagStaleMin ?? 15);
    const fvHorizon = controls ? controls.fvHorizon : localFv;
    const setFvHorizon = controls ? controls.setFvHorizon : setLocalFv;
    const perpBasis = controls ? controls.perpBasis : localPb;
    const setPerpBasis = controls ? controls.setPerpBasis : setLocalPb;
    const diagSpread = controls ? controls.diagSpread : localDs;
    const setDiagSpread = controls ? controls.setDiagSpread : setLocalDs;
    const diagStale = controls ? controls.diagStale : localStale;
    const setDiagStale = controls ? controls.setDiagStale : setLocalStale;

    // Recompute Tier 1 snapshot whenever FV Horizon or Perp Basis change.
    // Mirrors v7's build_tier1_snapshot exactly: linear-interp the smoothed
    // blended curve, then derive perp_price = fv * (1 + basis_bp/10000) and
    // annualized_carry = (fv/spot - 1) * (365.25/horizon) * 1e4.
    const livePerp = React.useMemo(() => {
      const cur = perp.currentCurve || [];
      if (!cur.length) return perp;
      const sorted = [...cur].sort((a, b) => a.daysFromValuation - b.daysFromValuation);
      function interp(days, field) {
        if (days <= sorted[0].daysFromValuation) return sorted[0][field];
        if (days >= sorted[sorted.length - 1].daysFromValuation) return sorted[sorted.length - 1][field];
        for (let i = 0; i < sorted.length - 1; i++) {
          const a = sorted[i], b = sorted[i + 1];
          if (days >= a.daysFromValuation && days <= b.daysFromValuation) {
            const w = (days - a.daysFromValuation) / Math.max(b.daysFromValuation - a.daysFromValuation, 1);
            return a[field] + w * (b[field] - a[field]);
          }
        }
        return sorted[0][field];
      }
      const spotIndex = sorted[0].indexLevel;
      const fvIndex   = interp(fvHorizon, 'indexLevel');
      const perpPrice = fvIndex * (1 + perpBasis / 10000);
      const annualizedCarryBp = fvHorizon > 0 && spotIndex !== 0
        ? (fvIndex / spotIndex - 1) * (365.25 / fvHorizon) * 10000 : 0;
      const newSnap = {
        ...perp.tier1Snapshot,
        spotIndex,
        fvIndex,
        perpPrice,
        basisBp: perpBasis,
        annualizedCarryBp,
        fvHorizonDays: fvHorizon,
      };
      return { ...perp, tier1Snapshot: newSnap };
    }, [perp, fvHorizon, perpBasis]);

    return (
      <div className={cn('perp-panel', `accent-${accent}`)}>
        {/* Render the controls bar in-panel only when the parent isn't
            hosting it (e.g. older IndexDetailView before sticky lift). */}
        {!hideInternalControls && (
          <PerpControlsBar
            fvHorizon={fvHorizon} setFvHorizon={setFvHorizon}
            perpBasis={perpBasis} setPerpBasis={setPerpBasis}
            diagSpread={diagSpread} setDiagSpread={setDiagSpread}
            diagStale={diagStale} setDiagStale={setDiagStale}
            accent={accent}
          />
        )}
        {tab === 'overview'     && <OverviewSection     perp={livePerp} accent={accent} />}
        {tab === 'construction' && <ConstructionTab     perp={livePerp} accent={accent} />}
        {tab === 'playbook'     && <PlaybookTab         perp={perp}     accent={accent} />}
        {tab === 'blend'        && <SourceBlendTab      perp={perp}     accent={accent} />}
        {tab === 'distribution' && <DistributionTab     perp={livePerp} accent={accent} />}
        {tab === 'freshness'    && <FreshnessTab        perp={perp}     accent={accent} />}
        {tab === 'diagnostics'  && <DiagnosticsDeepTab  perp={perp}     accent={accent} />}

        {/* v7 footer disclaimer (line 870-874) */}
        <div className="perp-footer-note">
          Tier 1 only: FV interpolation, spot/FV/perp comparison, prior-curve overlay, basis and carry.
          Tier 2+ (funding, liquidation, matching engine) not included in this layer.
        </div>
      </div>
    );
  }

  /* Controls — v7's 2-row band collapsed into a compact button + popover.
     Click the button to expand a panel with the 4 inputs (FV Horizon,
     Perp Basis, Diag Spread, Diag Stale), edit, then Save to commit.
     Cancel/Reset reverts to the live values. The button shows current
     values inline so the user sees state at a glance without opening it. */
  function PerpControlsBar({
    fvHorizon, setFvHorizon, perpBasis, setPerpBasis,
    diagSpread, setDiagSpread, diagStale, setDiagStale, accent,
  }) {
    const [open, setOpen] = useState(false);
    // Draft state — only commits on Save.
    const [draft, setDraft] = useState({ fvHorizon, perpBasis, diagSpread, diagStale });
    // When opened, sync draft from current live values (so reopening shows
    // the actual state, not a stale draft from a previous open).
    useEffect(() => {
      if (open) setDraft({ fvHorizon, perpBasis, diagSpread, diagStale });
    }, [open]);
    // Close on outside click or Escape — standard popover behavior.
    const popRef = useRef(null);
    useEffect(() => {
      if (!open) return;
      const onDown = (e) => {
        if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
      };
      const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('keydown', onKey);
      };
    }, [open]);

    const setDraftK = (k) => (e) => {
      const v = parseFloat(e.target.value);
      if (!isFinite(v)) return;
      setDraft((d) => ({ ...d, [k]: v }));
    };
    const onSave = () => {
      setFvHorizon(clamp(draft.fvHorizon, 1, 180));
      setPerpBasis(clamp(draft.perpBasis, -50, 50));
      setDiagSpread(clamp(draft.diagSpread, 1, 25));
      setDiagStale(clamp(draft.diagStale, 1, 120));
      setOpen(false);
    };
    const onReset = () => {
      setDraft({ fvHorizon: 30, perpBasis: 12, diagSpread: 12, diagStale: 15 });
    };

    // Detect changes vs current live values for save-button enablement.
    const dirty = draft.fvHorizon !== fvHorizon || draft.perpBasis !== perpBasis
              || draft.diagSpread !== diagSpread || draft.diagStale !== diagStale;
    const sign = (n) => (n >= 0 ? '+' : '');

    return (
      <div className={cn('perp-controls-button-wrap', `accent-${accent}`)} ref={popRef}>
        <button
          type="button"
          className={cn('perp-controls-trigger', `accent-${accent}`, open && 'open')}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <Icon name="sliders" size={13} />
          <span className="perp-controls-trigger-label">Tier 1 Controls</span>
          <span className="perp-controls-trigger-summary font-mono">
            FV {fvHorizon}d · {sign(perpBasis)}{perpBasis} bp · diag {diagSpread}bp / {diagStale}min
          </span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
        </button>

        {open && (
          <div className={cn('perp-controls-pop', `accent-${accent}`)} role="dialog" aria-label="Tier 1 controls">
            <header className="perp-controls-pop-head">
              <div className="perp-controls-pop-title">Tier 1 Controls</div>
              <div className="perp-controls-pop-sub">Adjust horizon · basis · diagnostics. Press Save to apply.</div>
            </header>
            <div className="perp-controls-pop-grid">
              <NumInput label="FV Horizon (days)" value={draft.fvHorizon} min={1} max={180} step={1}
                onChange={setDraftK('fvHorizon')} accent={accent}
                help="Horizon (days) for fair value interpolation on the blended curve." />
              <NumInput label="Perp Basis (bp vs FV)" value={draft.perpBasis} min={-50} max={50} step={1}
                onChange={setDraftK('perpBasis')} accent={accent}
                help="Simulated perp price = FV × (1 + basis/10000). Drives basis and carry." />
              <NumInput label="Diag Spread Threshold (bp)" value={draft.diagSpread} min={1} max={25} step={1}
                onChange={setDraftK('diagSpread')} accent={accent}
                help="Spread cutoff used by venue diagnostics scenario tests." />
              <NumInput label="Diag Stale Cutoff (min)" value={draft.diagStale} min={1} max={120} step={1}
                onChange={setDraftK('diagStale')} accent={accent}
                help="Maximum quote age (minutes) for the 'drop stale' scenario." />
            </div>
            <footer className="perp-controls-pop-foot">
              <button type="button" className="perp-controls-pop-btn ghost" onClick={onReset}>
                Reset to defaults
              </button>
              <div className="perp-controls-pop-foot-right">
                <button type="button" className="perp-controls-pop-btn cancel" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={cn('perp-controls-pop-btn save', `accent-${accent}`, !dirty && 'disabled')}
                  onClick={onSave}
                  disabled={!dirty}
                >
                  Save
                </button>
              </div>
            </footer>
          </div>
        )}
      </div>
    );
  }

  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  function NumInput({ label, value, onChange, min, max, step, accent, help }) {
    return (
      <label className={cn('perp-num-input', `accent-${accent}`)}>
        <span className="perp-num-input-label">{label}</span>
        <input
          type="number"
          value={value}
          onChange={onChange}
          min={min} max={max} step={step}
        />
        {help && <span className="perp-num-input-help">{help}</span>}
      </label>
    );
  }

  /* =========================================================================
     OVERVIEW TAB — KPI strips + charts + Perp Print/Structure
     ========================================================================= */
  function OverviewSection({ perp, accent }) {
    const snap = perp.tier1Snapshot;
    const fv = snap.fvHorizonDays;

    const kpiTier1 = [
      { label: 'Official Print / Base Index', value: snap.officialIndexPrint.toFixed(2),
        sub: 'Base 100 reference' },
      { label: '1M Implied', value: `${snap.implied1mYoyPct.toFixed(2)}%`,
        sub: '30-day forward CPI view', accent: true },
      { label: '3M Implied', value: `${snap.implied3mYoyPct.toFixed(2)}%`,
        sub: 'Featured forward reference', accent: true },
      { label: '6M Implied', value: `${snap.implied6mYoyPct.toFixed(2)}%`,
        sub: '180-day forward CPI view' },
      { label: 'Term Structure',
        value: `${snap.termStructurePct >= 0 ? '+' : ''}${snap.termStructurePct.toFixed(2)}%`,
        sub: '6M minus 1M implied',
        tone: snap.termStructurePct >= 0 ? 'success' : 'danger' },
      { label: 'Publishability / Confidence',
        value: snap.publishabilityLabel,
        sub: `${snap.confidenceLabel} · ${snap.confidenceScorePct.toFixed(0)}% confidence`,
        tone: snap.publishabilityLabel === 'Eligible' ? 'success'
              : snap.publishabilityLabel === 'Review'  ? 'warning'
              : 'danger' },
    ];

    const basisTone = snap.basisBp >= 0 ? 'success' : 'danger';
    const carryTone = snap.annualizedCarryBp >= 0 ? 'success' : 'danger';

    const kpiBasis = [
      { label: 'Spot Index',          value: snap.spotIndex.toFixed(2),     sub: 'Front index level' },
      { label: `Fair Value (${fv}d)`, value: snap.fvIndex.toFixed(4),       sub: 'Interpolated at horizon', accent: true },
      { label: 'Simulated Perp',      value: snap.perpPrice.toFixed(4),     sub: 'FV + basis', tone: basisTone },
      { label: 'Basis',
        value: `${snap.basisBp >= 0 ? '+' : ''}${snap.basisBp.toFixed(1)} bp`,
        sub: 'Perp vs FV', tone: basisTone },
      { label: 'Ann. Carry',
        value: `${snap.annualizedCarryBp >= 0 ? '+' : ''}${snap.annualizedCarryBp.toFixed(1)} bp`,
        sub: 'Spot to FV, annualized', tone: carryTone },
    ];

    return (
      <div className="perp-overview">
        <KpiRibbon
          ribbon="ORIEL 3M CPI FORWARD INDEX · Governed blend from Kalshi + ForecastEx"
          cells={kpiTier1} accent={accent} cols={6} />
        <KpiRibbon
          ribbon="ORIEL CPI BASIS · Tier 1 · Spot / Fair Value / Basis / Carry"
          cells={kpiBasis} accent={accent} cols={5} />
        <div className="perp-overview-row">
          <div className="perp-overview-charts">
            <PerpCharts perp={perp} accent={accent} />
          </div>
          <div className="perp-overview-side">
            <PerpPrintCard perp={perp} accent={accent} />
            <PerpStructureCard perp={perp} accent={accent} />
          </div>
        </div>
      </div>
    );
  }

  function KpiRibbon({ ribbon, cells, accent, cols }) {
    return (
      <section className={cn('perp-kpi-strip', `accent-${accent}`)}>
        <div className="perp-kpi-ribbon">{ribbon}</div>
        <div className="perp-kpi-cells" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` }}>
          {cells.map((c, i) => (
            <div key={i} className={cn('perp-kpi-cell', c.tone && `tone-${c.tone}`, c.accent && 'lead')}>
              <div className="perp-kpi-micro">{c.label}</div>
              <div className="perp-kpi-value">{c.value}</div>
              <div className="perp-kpi-sub">{c.sub}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function PerpCharts({ perp, accent }) {
    const [tab, setTab] = useState('curve');
    const snap = perp.tier1Snapshot;
    const fv = snap.fvHorizonDays;
    return (
      <section className={cn('perp-chart-card', `accent-${accent}`)}>
        <header className="perp-chart-head">
          <div>
            <div className="perp-chart-title">
              {tab === 'curve' ? 'Spot to Fair Value' : 'Spot vs FV vs Perp'}
            </div>
            <div className="perp-chart-sub">
              {tab === 'curve'
                ? `Index level curve with FV horizon (${fv}d) and prior-curve overlay.`
                : 'Spot, interpolated fair value, and simulated perp price side-by-side.'}
            </div>
          </div>
          <div className="perp-chart-tabs">
            <button type="button" className={cn('perp-chart-tab', tab==='curve' && 'active')}  onClick={() => setTab('curve')}>Spot to FV</button>
            <button type="button" className={cn('perp-chart-tab', tab==='bars'  && 'active')}  onClick={() => setTab('bars')}>Spot vs FV vs Perp</button>
          </div>
        </header>
        <div className="perp-chart-body">
          {tab === 'curve' && <SpotToFvChart perp={perp} accent={accent} />}
          {tab === 'bars'  && <SpotFvPerpBars perp={perp} accent={accent} />}
        </div>
      </section>
    );
  }

  function useChartSize(initialW = 720, initialH = 280) {
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

  function SpotToFvChart({ perp, accent, height }) {
    const [ref, w, hMeasured] = useChartSize(720, height || 280);
    const [hover, setHover] = useState(null);
    const cur = perp.currentCurve || [];
    const pri = perp.priorCurve   || [];
    const snap = perp.tier1Snapshot;
    const fv = snap.fvHorizonDays;
    const fvIndex = snap.fvIndex;
    const h = Math.max(hMeasured || 0, height ? height : 240);
    const padL = 60, padR = 24, padT = 16, padB = 36;
    const innerW = Math.max(w - padL - padR, 50);
    const innerH = h - padT - padB;
    const xs = cur.map(p => p.daysFromValuation);
    const ysC = cur.map(p => p.indexLevel);
    const ysP = pri.map(p => p.indexLevel);
    const allY = [...ysC, ...ysP, fvIndex];
    const yMin = Math.min(...allY);
    const yMax = Math.max(...allY);
    const yPad = (yMax - yMin) * 0.10 || 0.05;
    const xMax = Math.max(...xs);
    const x = (d) => padL + (d / Math.max(xMax, 1)) * innerW;
    const y = (v) => padT + innerH - ((v - (yMin - yPad)) / ((yMax + yPad) - (yMin - yPad))) * innerH;
    const path = (rows) => rows.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.daysFromValuation).toFixed(2)} ${y(p.indexLevel).toFixed(2)}`).join(' ');

    const onMove = (e) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const sx = rect.width / w;
      const px = (e.clientX - rect.left) / sx;
      let bestI = 0, bestD = Infinity;
      cur.forEach((p, i) => {
        const d = Math.abs(x(p.daysFromValuation) - px);
        if (d < bestD) { bestD = d; bestI = i; }
      });
      const p = cur[bestI];
      const priorPt = pri[bestI];
      setHover({
        i: bestI,
        x: x(p.daysFromValuation) * sx,
        y: y(p.indexLevel) * sx,
        rows: [
          { l: 'Maturity', v: p.targetMonth },
          { l: 'Days',     v: `${p.daysFromValuation}d` },
          { l: 'Index Level', v: p.indexLevel.toFixed(4), accent: true },
          { l: 'Expected YoY', v: `${(p.expectedYoyPct ?? 0).toFixed(4)}%` },
          ...(priorPt ? [{ l: 'Prior level', v: priorPt.indexLevel.toFixed(4), muted: true }] : []),
        ],
      });
    };

    return (
      <div ref={ref} className="perp-chart-svg-wrap" style={{ position: 'relative' }}>
        {/* Legend (matches v7's plotly legend trace names) */}
        <div className="perp-chart-legend">
          {ysP.length > 0 && (
            <span className="perp-legend-item">
              <span className="perp-legend-dash" /> Prior Curve
            </span>
          )}
          <span className="perp-legend-item">
            <span className={cn('perp-legend-dot', `accent-${accent}`)} /> Current Curve
          </span>
          <span className="perp-legend-item">
            <span className="perp-legend-marker" /> FV horizon
          </span>
        </div>
        <svg width={w} height={h} className="perp-chart-svg"
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {[0,0.25,0.5,0.75,1].map((t,i) => (
            <line key={i} x1={padL} x2={padL+innerW}
              y1={padT + innerH * t} y2={padT + innerH * t}
              className="perp-chart-grid" />
          ))}
          {ysP.length > 0 && <path d={path(pri)} className="perp-chart-prior" />}
          <path d={path(cur)} className={cn('perp-chart-curve', `accent-${accent}`)} />
          {cur.map((p,i) => (
            <circle key={i} cx={x(p.daysFromValuation)} cy={y(p.indexLevel)}
              r={hover?.i === i ? 6 : 4}
              className={cn('perp-chart-dot', `accent-${accent}`, hover?.i === i && 'active')} />
          ))}
          <line x1={x(fv)} x2={x(fv)} y1={padT} y2={padT+innerH} className="perp-chart-fv-vline" />
          <line x1={padL} x2={padL+innerW} y1={y(fvIndex)} y2={y(fvIndex)} className="perp-chart-fv-hline" />
          <circle cx={x(fv)} cy={y(fvIndex)} r={5} className="perp-chart-fv-dot" />
          <text x={x(fv) + 8} y={y(fvIndex) - 8} className="perp-chart-fv-label">
            FV @ {fv}d = {fvIndex.toFixed(4)}
          </text>
          {/* Axis tick labels */}
          {[yMin, (yMin+yMax)/2, yMax].map((v,i) => (
            <text key={i} x={padL - 8} y={y(v)} className="perp-chart-axis-y"
              textAnchor="end" dominantBaseline="middle">{v.toFixed(2)}</text>
          ))}
          {cur.map((p,i) => (
            <text key={i} x={x(p.daysFromValuation)} y={padT + innerH + 16}
              className="perp-chart-axis-x" textAnchor="middle">
              {p.daysFromValuation}d
            </text>
          ))}
          {/* Axis titles (matches v7 line 148-149) */}
          <text x={padL + innerW / 2} y={h - 4} className="perp-chart-axis-title" textAnchor="middle">
            Days from Valuation
          </text>
          <text x={14} y={padT + innerH / 2} className="perp-chart-axis-title"
            textAnchor="middle" transform={`rotate(-90 14 ${padT + innerH / 2})`}>
            Implied Index Level
          </text>
        </svg>
        {hover && <HoverTip x={hover.x} y={hover.y} rows={hover.rows} bound={w} />}
      </div>
    );
  }

  function SpotFvPerpBars({ perp, accent }) {
    const [ref, w, hMeasured] = useChartSize(720, 280);
    const [hover, setHover] = useState(null);
    const snap = perp.tier1Snapshot;
    const items = [
      { label: 'Spot',        v: snap.spotIndex,  tone: 'muted',
        sub: 'Front index level' },
      { label: 'Fair Value',  v: snap.fvIndex,    tone: 'gold',
        sub: `Interpolated at ${snap.fvHorizonDays}d horizon` },
      { label: 'Sim. Perp',   v: snap.perpPrice,
        tone: snap.basisBp >= 0 ? 'success' : 'danger',
        sub: `FV ${snap.basisBp >= 0 ? '+' : ''}${snap.basisBp.toFixed(1)} bp basis` },
    ];
    const h = Math.max(hMeasured || 0, 240);
    const padL = 60, padR = 24, padT = 16, padB = 40;
    const innerW = Math.max(w - padL - padR, 50);
    const innerH = h - padT - padB;
    const allV = items.map(i => i.v);
    const yMin = Math.min(...allV);
    const yMax = Math.max(...allV);
    const yPad = (yMax - yMin) * 0.4 || 0.5;
    const yLo = yMin - yPad;
    const yHi = yMax + yPad;
    const slot = innerW / items.length;
    const barW = slot * 0.46;
    const y = (v) => padT + innerH - ((v - yLo) / (yHi - yLo)) * innerH;
    return (
      <div ref={ref} className="perp-chart-svg-wrap" style={{ position: 'relative' }}>
        <svg width={w} height={h} className="perp-chart-svg" onMouseLeave={() => setHover(null)}>
          {[0,0.25,0.5,0.75,1].map((t,i) => (
            <line key={i} x1={padL} x2={padL+innerW}
              y1={padT + innerH * t} y2={padT + innerH * t}
              className="perp-chart-grid" />
          ))}
          {items.map((it,i) => {
            const cx = padL + slot * i + slot / 2;
            const top = y(it.v);
            const bot = padT + innerH;
            const onEnter = (e) => {
              const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
              const sx = rect.width / w;
              setHover({
                i,
                x: cx * sx, y: top * sx,
                rows: [
                  { l: it.label, v: it.v.toFixed(4), accent: true },
                  { l: 'Detail', v: it.sub, muted: true },
                ],
              });
            };
            return (
              <g key={i} onMouseEnter={onEnter}>
                <rect x={cx - barW/2} y={top} width={barW} height={Math.max(bot - top, 0)}
                  className={cn('perp-bar', `tone-${it.tone}`, hover?.i === i && 'active')} />
                <text x={cx} y={top - 6} className="perp-bar-value" textAnchor="middle">{it.v.toFixed(4)}</text>
                <text x={cx} y={padT + innerH + 18} className="perp-chart-axis-x" textAnchor="middle">{it.label}</text>
              </g>
            );
          })}
          {[yLo, (yLo+yHi)/2, yHi].map((v,i) => (
            <text key={i} x={padL - 8} y={y(v)} className="perp-chart-axis-y"
              textAnchor="end" dominantBaseline="middle">{v.toFixed(2)}</text>
          ))}
          {/* Y-axis title (v7 line 184) */}
          <text x={14} y={padT + innerH / 2} className="perp-chart-axis-title"
            textAnchor="middle" transform={`rotate(-90 14 ${padT + innerH / 2})`}>
            Index Level
          </text>
        </svg>
        {hover && <HoverTip x={hover.x} y={hover.y} rows={hover.rows} bound={w} />}
      </div>
    );
  }

  function PerpPrintCard({ perp, accent }) {
    const snap = perp.tier1Snapshot;
    const basisTone = snap.basisBp >= 0 ? 'success' : 'danger';
    const carryTone = snap.annualizedCarryBp >= 0 ? 'success' : 'danger';
    const carryDir  = snap.annualizedCarryBp >= 0 ? '↑' : '↓';
    const basisDir  = snap.basisBp >= 0 ? 'premium' : 'discount';
    return (
      <section className={cn('ip-card', `accent-${accent}`)}>
        <header className="ip-card-head">
          <span className="ip-card-eyebrow">Perp Print</span>
          <span className="ip-card-status ok">
            <span className="ip-status-dot" />
            Tier 1 Ready
          </span>
        </header>
        <div className="ip-card-highlight">
          <div className="ip-card-highlight-label">Fair Value ({snap.fvHorizonDays}d horizon)</div>
          <div className="ip-card-highlight-value font-mono">{snap.fvIndex.toFixed(4)}</div>
        </div>
        <dl className="ip-card-rows">
          <Row label="Spot Index"     value={snap.spotIndex.toFixed(2)} mono />
          <Row label="Fair Value"     value={snap.fvIndex.toFixed(4)}   mono />
          <Row label="Simulated Perp" value={snap.perpPrice.toFixed(4)} mono tone={basisTone} />
          <Row label="Basis"          value={`${snap.basisBp >= 0 ? '+' : ''}${snap.basisBp.toFixed(1)} bp (${basisDir})`} tone={basisTone} mono />
          <Row label="Ann. Carry"     value={`${snap.annualizedCarryBp >= 0 ? '+' : ''}${snap.annualizedCarryBp.toFixed(1)} bp ${carryDir}`} tone={carryTone} mono />
          <Row label="FV Horizon"     value={`${snap.fvHorizonDays} days`} mono />
          <Row label="Front CPI YoY"  value={`${snap.frontExpectedYoyPct.toFixed(2)}%`} mono />
          <Row label="Curve Points"   value={(perp.currentCurve || []).length} mono />
        </dl>
      </section>
    );
  }

  function PerpStructureCard({ perp, accent }) {
    const snap = perp.tier1Snapshot;
    const basisTone = snap.basisBp >= 0 ? 'success' : 'danger';
    const carryTone = snap.annualizedCarryBp >= 0 ? 'success' : 'danger';
    return (
      <section className={cn('mvs-card', `accent-${accent}`)}>
        <header className="mvs-card-head">
          <span className="mvs-card-eyebrow">Perp Structure</span>
          <Badge variant="default">Tier 1</Badge>
        </header>
        <ul className="mvs-card-rows">
          <MvsRow label="Perp vs FV"
                  value={`${snap.basisBp >= 0 ? '+' : ''}${snap.basisBp.toFixed(1)} bp`}
                  signal={snap.basisBp >= 0 ? 'premium' : 'discount'}
                  signalTone={basisTone} valueTone={basisTone} strong />
          <MvsRow label="Ann. Carry (spot→FV)"
                  value={`${snap.annualizedCarryBp >= 0 ? '+' : ''}${snap.annualizedCarryBp.toFixed(1)} bp`}
                  signal={snap.annualizedCarryBp >= 0 ? '↑' : '↓'}
                  signalTone={carryTone} valueTone={carryTone} />
          <MvsRow label="Venue Target" value="—" signal="Hyperliquid / AX" signalTone="muted" />
          <MvsRow label="Tier" value="1" signal="Spot / FV / Carry" signalTone="accent" />
        </ul>
      </section>
    );
  }

  /* =========================================================================
     CONSTRUCTION TAB — v7 §5 (3 panels) + §11 (pricing table)
     "How is the curve built?"  Calibration moved to Playbook tab to mirror
     v7's "Calibration / Trade Playbook" section grouping.
     ========================================================================= */
  function ConstructionTab({ perp, accent }) {
    const sm = perp.smoothingDiag || {};
    const cb = perp.confidenceBreakdown || {};
    const snap = perp.tier1Snapshot;
    const ci = perp.constituentsIncluded || {};

    return (
      <div className="perp-tab">
        <SubHeader>Curve Construction · Microstructure · Confidence</SubHeader>
        <div className="perp-grid-3">
          <PanelCard title="Explicit smoothing" accent={accent}>
            <PItem k="Requested"     v={sm.methodRequested || 'liquidity_weighted_monotone_linear'} mono />
            <PItem k="Used"          v={sm.methodUsed || '—'} mono />
            <PItem k="Direction"     v={sm.monotoneDirection || '—'} />
            <PItem k="RMSE"          v={`${(sm.rmseBp ?? 0).toFixed(1)} bp`} />
            <PItem k="Max residual"  v={`${(sm.maxResidualBp ?? 0).toFixed(1)} bp`} />
            <PItem k="Anchor count"  v={sm.anchorCount ?? '—'} />
            <PItem k="Coverage ratio" v={(sm.coverageRatio ?? 0).toFixed(2)} />
          </PanelCard>
          <PanelCard title="Microstructure rules" accent={accent}>
            <PItem k="Proxy spread gate" v="≤ 35 bp" />
            <PItem k="Staleness gate"    v="≤ 300s" />
            <PItem k="Selection waterfall" v="tight+fresh mid → guarded mid → exclude" />
            <PItem k="Kalshi included"     v={`${ci.kalshi ?? 0} / ${ci.kalshiTotal ?? 0}`} mono />
            <PItem k="ForecastEx included" v={`${ci.forecastex ?? 0} / ${ci.forecastexTotal ?? 0}`} mono />
          </PanelCard>
          <PanelCard title="Confidence gates" accent={accent}>
            <PItem k="Status" v={`${snap.publishabilityLabel} · ${snap.confidenceScorePct.toFixed(1)}%`}
                   tone={snap.publishabilityLabel === 'Eligible' ? 'success'
                         : snap.publishabilityLabel === 'Review' ? 'warning' : 'danger'} />
            <PItem k="High threshold"    v={`≥ ${(cb.high_threshold ?? 80).toFixed(0)}`} mono />
            <PItem k="Review threshold"  v={`≥ ${(cb.review_threshold ?? 65).toFixed(0)}`} mono />
            <PItem k="Quality"   v={(cb.quality_score ?? 0).toFixed(1)} mono />
            <PItem k="Freshness" v={(cb.freshness_score ?? 0).toFixed(1)} mono />
            <PItem k="Calibration" v={(cb.calibration_score ?? 0).toFixed(1)} mono />
            <PItem k="Maturity"  v={(cb.maturity_score ?? 0).toFixed(1)} mono />
            <PItem k="Source"    v={(cb.source_score ?? 0).toFixed(1)} mono />
            <PItem k="Balance"   v={(cb.balance_score ?? 0).toFixed(1)} mono />
          </PanelCard>
        </div>
        {sm.notes && sm.notes.length > 0 && (
          <NoteBox><strong>Smoothing notes:</strong> {sm.notes.join(' · ')}</NoteBox>
        )}

        <SubHeader>Pricing Table · Blended forward index</SubHeader>
        <SimpleTable
          headers={['Target Month', 'Days', 'Expected YoY (%)', 'Index Level', 'Std Dev (%)', 'Kalshi Wt', 'FX Wt', 'FV Marker']}
          rows={(perp.currentCurve || []).map(r => [
            r.targetMonth,
            r.daysFromValuation,
            (r.expectedYoyPct ?? 0).toFixed(4),
            (r.indexLevel ?? 0).toFixed(4),
            r.stdDevPct != null ? r.stdDevPct.toFixed(4) : 'n/a',
            r.kalshiWeight != null ? r.kalshiWeight.toFixed(2) : 'n/a',
            r.forecastexWeight != null ? r.forecastexWeight.toFixed(2) : 'n/a',
            r.daysFromValuation === snap.fvHorizonDays ? '◀ FV Horizon' : '',
          ])}
          highlightCol={3}
          fvHorizonRow={(perp.currentCurve || []).findIndex(r => r.daysFromValuation === snap.fvHorizonDays)}
        />
      </div>
    );
  }

  /* =========================================================================
     PLAYBOOK TAB — v7 §6 "Calibration / Trade Playbook" (line 694)
     2-col layout: Calibration card on left + 3 Trade idea cards on right.
     Mirrors v7's [1.15, 1] column ratio.
     ========================================================================= */
  function PlaybookTab({ perp, accent }) {
    const wc = perp.weightCalibration || {};
    const ideas = perp.tradeIdeas || [];
    const freshnessCommentary = perp.freshness?.commentary;
    const fmtPct = (x) => `${(x * 100).toFixed(1)}%`;
    return (
      <div className="perp-tab">
        <SubHeader>Calibration · Trade Playbook</SubHeader>
        <div className="perp-grid-playbook">
          {/* LEFT: Calibration card + freshness caption (matches v7 line 696-712) */}
          <div className="perp-playbook-cal">
            <PanelCard title="Weight calibration · governed weighting" accent={accent}>
              <div className="perp-pitem-2col">
                <PItem k="Blend alpha (α)"        v={(wc.blend_alpha ?? 0.35).toFixed(2)} mono />
                <PItem k="Calibration sample"     v={`K ${wc.kalshi_calibration_sample_size ?? 0} · FX ${wc.forecastex_calibration_sample_size ?? 0}`} mono />
                <PItem k="Score share · Kalshi"   v={fmtPct(wc.score_weight_share_kalshi || 0)} mono />
                <PItem k="Score share · FX"       v={fmtPct(wc.score_weight_share_forecastex || 0)} mono />
                <PItem k="Effective · Kalshi"     v={fmtPct(wc.effective_weight_share_kalshi || 0)} mono tone="accent" />
                <PItem k="Effective · FX"         v={fmtPct(wc.effective_weight_share_forecastex || 0)} mono tone="accent" />
                <PItem k="Hist. calibration · K"  v={(wc.kalshi_historical_calibration_score ?? 0).toFixed(1)} mono />
                <PItem k="Hist. calibration · FX" v={(wc.forecastex_historical_calibration_score ?? 0).toFixed(1)} mono />
                <PItem k="Weighted Brier · K"     v={(wc.kalshi_weighted_mean_brier_score ?? 0).toFixed(3)} mono />
                <PItem k="Weighted Brier · FX"    v={(wc.forecastex_weighted_mean_brier_score ?? 0).toFixed(3)} mono />
              </div>
              {wc.calibration_rule && (
                <div className="perp-pitem-rule">
                  <strong>Rule:</strong> {wc.calibration_rule}
                </div>
              )}
              <div className="perp-pitem-rule">
                <strong>Interpretation:</strong> requested weights are preserved only when venue
                quality and historical calibration confirm them.
              </div>
            </PanelCard>
            {/* v7 line 712: st.caption(freshness_commentary) inside the calibration column */}
            {freshnessCommentary && (
              <div className="perp-caption">{freshnessCommentary}</div>
            )}
          </div>

          {/* RIGHT: Trade idea cards stacked (matches v7 line 713-725) */}
          <div className="perp-playbook-ideas">
            {ideas.map((idea, i) => (
              <article key={i} className={cn('perp-idea-card', `accent-${accent}`)}>
                <header className="perp-idea-head">
                  <Icon name="sparkles" size={14} />
                  <h4>{idea.title}</h4>
                </header>
                <dl className="perp-idea-rows">
                  <div><dt>Expression</dt><dd>{idea.expression}</dd></div>
                  <div><dt>Why now</dt><dd>{idea.rationale}</dd></div>
                  <div><dt>Trigger</dt><dd>{idea.trigger}</dd></div>
                  <div className="risk"><dt>Risk</dt><dd>{idea.riskNote}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================================
     SOURCE BLEND TAB — v7 §7 (line 728)
     ========================================================================= */
  function SourceBlendTab({ perp, accent }) {
    const wd = perp.weightDiagnostics || [];
    const blend = perp.blendMeta || {};
    const fmtPct = (x) => `${(x * 100).toFixed(1)}%`;
    return (
      <div className="perp-tab">
        <SubHeader>Source Blend · Index Governance</SubHeader>
        <div className="perp-grid-2">
          <PanelCard title="Venue weight diagnostics" accent={accent}>
            <SimpleTable
              dense
              headers={['Venue', 'Req Wt', 'Raw Score', 'Score Wt', 'Eff Wt', 'Eligible', 'Median Age', 'Snap Span']}
              rows={wd.map(d => [
                d.venue,
                fmtPct(d.requestedWeight),
                d.rawVenueScore.toFixed(1),
                fmtPct(d.rawScoreWeight),
                fmtPct(d.effectiveWeight),
                d.eligible ? 'Yes' : 'No',
                d.medianQuoteAgeSeconds != null ? `${d.medianQuoteAgeSeconds.toFixed(0)}s` : 'n/a',
                d.snapshotSpanSeconds != null ? `${d.snapshotSpanSeconds.toFixed(0)}s` : 'n/a',
              ])}
              highlightCol={4}
            />
          </PanelCard>
          <PanelCard title="Index Governance" accent={accent}>
            <PItem k="Weighting rule"  v={`Blend α = ${(perp.weightCalibration?.blend_alpha ?? 0.35).toFixed(2)}`} sub="eff = α·req + (1-α)·score" mono />
            <PItem k="Eligibility"
                   v={`Kalshi ${blend.kalshiEligible ? 'Yes' : 'No'} · ForecastEx ${blend.forecastexEligible ? 'Yes' : 'No'}`}
                   sub="Coverage + consistency gate"
                   tone={blend.kalshiEligible && blend.forecastexEligible ? 'success' : 'warning'} />
            <PItem k="Methodology" v="v0.1.0-tier1" sub="Governed blend" mono tone="accent" />
            <PItem k="Effective shares"
                   v={`K ${(blend.effectiveKalshiWeight * 100 || 0).toFixed(1)}% · FX ${(blend.effectiveForecastexWeight * 100 || 0).toFixed(1)}%`} mono />
          </PanelCard>
        </div>
        {/* Per-venue weights as a horizontal bar viz so the blend is legible at a glance */}
        <PanelCard title="Effective weight share" accent={accent}>
          <BlendBars wd={wd} accent={accent} />
        </PanelCard>
      </div>
    );
  }

  function BlendBars({ wd, accent }) {
    const total = wd.reduce((s, d) => s + (d.effectiveWeight || 0), 0) || 1;
    return (
      <div className="perp-blend-bars">
        {wd.map((d, i) => {
          const pct = (d.effectiveWeight || 0) / total * 100;
          return (
            <div key={i} className="perp-blend-bar-row">
              <div className="perp-blend-bar-label">
                <span className="perp-blend-bar-venue">{d.venue}</span>
                <span className="perp-blend-bar-pct font-mono">{pct.toFixed(1)}%</span>
              </div>
              <div className="perp-blend-bar-track">
                <div className={cn('perp-blend-bar-fill', `accent-${accent}`, i === 1 && 'alt')}
                     style={{ width: `${pct}%` }} />
              </div>
              <div className="perp-blend-bar-meta">
                Requested {(d.requestedWeight * 100).toFixed(0)}% · Score {d.rawVenueScore.toFixed(1)} · {d.eligible ? 'Eligible' : 'Ineligible'}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* =========================================================================
     DISTRIBUTION TAB — v7 §8 (line 777)
     ========================================================================= */
  function DistributionTab({ perp, accent }) {
    const refs = perp.blendedReferencePoints || [];
    const fmtPct = (x) => `${(x * 100).toFixed(1)}%`;
    return (
      <div className="perp-tab">
        <SubHeader>Distribution · Threshold Probabilities</SubHeader>
        <div className="perp-grid-2-asym">
          <PanelCard title="Blended forward curve · index level by horizon" accent={accent}>
            <SpotToFvChart perp={perp} accent={accent} height={260} />
          </PanelCard>
          <PanelCard title="P(CPI YoY > threshold) · per horizon" accent={accent}>
            <SimpleTable
              headers={['Horizon', 'Mean', 'P(>2.0%)', 'P(>2.5%)', 'P(>3.0%)', 'Std Dev', 'Conf']}
              rows={refs.map(r => [
                `${r.horizonMonths.toFixed(1)}M`,
                `${r.blendedMeanPct.toFixed(2)}%`,
                fmtPct(r.blendedThresholdProbs?.gt_2_0 ?? 0),
                fmtPct(r.blendedThresholdProbs?.gt_2_5 ?? 0),
                fmtPct(r.blendedThresholdProbs?.gt_3_0 ?? 0),
                r.blendedStdDevPct != null ? `${r.blendedStdDevPct.toFixed(2)}%` : 'n/a',
                r.distributionConfidenceScore.toFixed(1),
              ])}
              highlightCol={1}
            />
          </PanelCard>
        </div>
        <NoteBox subtle>
          Per-horizon threshold probabilities use blended mean + std dev (Kalshi + ForecastEx) under the
          governed weights. Confidence score reflects coverage and venue dispersion at each maturity.
        </NoteBox>
        {/* Caption from v7 line 780 */}
        <div className="perp-caption">
          Blended forward curve (left) is the same governed blend shown on Overview's Spot-to-FV
          chart, restricted to the active FV horizon. Confidence bands planned for V2.
        </div>
      </div>
    );
  }

  /* =========================================================================
     FRESHNESS TAB — v7 §9 (line 807)
     ========================================================================= */
  function FreshnessTab({ perp, accent }) {
    const fr = perp.freshness || {};
    const venues = fr.venues || [];
    const blended = fr.blended || {};
    const fmtTone = (age) => age <= 30 ? 'success' : age <= 60 ? 'warning' : 'danger';
    return (
      <div className="perp-tab">
        <SubHeader>Timestamp · Freshness Diagnostics</SubHeader>
        <div className="perp-grid-2">
          {venues.map((v, i) => (
            <PanelCard key={i} title={`${v.venue} · quote freshness`} accent={accent}>
              <PItem k="Median quote age" v={`${v.medianQuoteAgeSeconds.toFixed(0)}s`}
                     mono tone={fmtTone(v.medianQuoteAgeSeconds)} />
              <PItem k="Max quote age"    v={`${v.maxQuoteAgeSeconds.toFixed(0)}s`}    mono />
              <PItem k="Fresh fraction"   v={`${(v.freshQuoteFraction * 100).toFixed(0)}%`} mono
                     tone={v.freshQuoteFraction >= 0.7 ? 'success' : v.freshQuoteFraction >= 0.4 ? 'warning' : 'danger'} />
              <PItem k="Stale fraction"   v={`${(v.staleQuoteFraction * 100).toFixed(0)}%`} mono />
              <PItem k="Snapshot span"    v={`${v.snapshotSpanSeconds.toFixed(0)}s`}     mono />
            </PanelCard>
          ))}
        </div>
        <PanelCard title="Cross-venue alignment" accent={accent}>
          <PItem k="Median age gap"  v={`${(blended.crossVenueMedianAgeGapSeconds ?? 0).toFixed(0)}s`} mono />
          <PItem k="Blended span"    v={`${(blended.blendedSnapshotSpanSeconds ?? 0).toFixed(0)}s`}    mono />
        </PanelCard>
        {fr.commentary && (
          <NoteBox><strong>Freshness commentary:</strong> {fr.commentary}</NoteBox>
        )}
      </div>
    );
  }

  /* =========================================================================
     DIAGNOSTICS DEEP-DIVE TAB — v7 §10 only (line 842, _render_basis_diagnostics)
     ========================================================================= */
  function DiagnosticsDeepTab({ perp, accent }) {
    const diag = perp.diagnostics || {};
    const sum  = diag.summary  || {};
    const meta = diag.metadata || {};
    const fmtBool = (x) => x === true ? 'Yes' : x === false ? 'No' : 'n/a';
    const sourceLabel = meta.uses_live_quote_fields
      ? 'Live venue quote fields'
      : 'Indicative proxy diagnostics from constituent set';

    const correlation = sum.dispersion_confidence_correlation;
    const corrLabel = correlation == null ? 'n/a'
      : correlation >= 0.5 ? `+${correlation.toFixed(2)}`
      : correlation <= -0.5 ? `${correlation.toFixed(2)}`
      : correlation.toFixed(2);
    const ribbon = [
      { label: 'Avg Venue Dispersion', value: `${(sum.avg_dispersion_bp ?? 0).toFixed(1)} bp`, sub: sourceLabel },
      { label: 'Max Venue Dispersion', value: `${(sum.max_dispersion_bp ?? 0).toFixed(1)} bp`, sub: 'Largest maturity gap' },
      { label: 'Least-Liquid Concentration', value: `${((sum.least_liquid_high_dispersion_share ?? 0) * 100).toFixed(0)}%`,
        sub: 'High-dispersion in weaker liquidity bucket' },
      { label: 'Disp ↔ Confidence Corr.', value: corrLabel,
        sub: 'Higher = dispersion clusters with low-confidence quotes',
        tone: correlation == null ? 'muted'
              : Math.abs(correlation) >= 0.5 ? 'warning' : 'muted' },
      { label: 'Spread Filter Narrows Gap?', value: fmtBool(sum.spread_filter_narrows_gap),
        sub: `Spread ≤ ${(meta.spread_threshold_bp ?? 0).toFixed(1)} bp`,
        tone: sum.spread_filter_narrows_gap === true ? 'success'
              : sum.spread_filter_narrows_gap === false ? 'danger' : 'muted' },
      { label: 'Confidence Weighting Narrows Gap?', value: fmtBool(sum.confidence_weighting_narrows_gap),
        sub: 'Liquidity / freshness aware',
        tone: sum.confidence_weighting_narrows_gap === true ? 'success'
              : sum.confidence_weighting_narrows_gap === false ? 'danger' : 'muted' },
    ];

    const [tablesTab, setTablesTab] = useState('byMaturity');

    return (
      <div className="perp-tab">
        <SubHeader>Venue Diagnostics</SubHeader>
        <KpiRibbon
          ribbon="Why blend venue surfaces rather than treat one as truth"
          cells={ribbon} accent={accent} cols={6} />
        <NoteBox subtle>
          <strong>Diagnostic framing:</strong> Tests whether venue disagreement is concentrated in less liquid maturities and whether the shape gap narrows under cleaner quote rules.
          {' '}<strong>Least-liquid concentration:</strong> {fmtBool(sum.dispersion_concentrated_in_least_liquid)}
          {' · '}<strong>Drop stale narrows gap:</strong> {fmtBool(sum.drop_stale_narrows_gap)}
          {' · '}<strong>Source mode:</strong> {sourceLabel}.
        </NoteBox>

        <div className="perp-grid-2">
          <PanelCard title="Dispersion by maturity" accent={accent}>
            <DispersionBarChart rows={diag.venueComparison || []} />
          </PanelCard>
          <PanelCard title="Confidence vs dispersion" accent={accent}>
            <ConfidenceScatter rows={diag.venueComparison || []} accent={accent} />
          </PanelCard>
        </div>

        <SubHeader>Detail tables</SubHeader>
        <div className="perp-tabs-bar">
          {[
            { k: 'byMaturity',  l: 'By maturity' },
            { k: 'crossVenue',  l: 'Cross-venue comparison' },
            { k: 'tests',       l: 'Diagnostic tests' },
          ].map(t => (
            <button key={t.k} type="button"
              className={cn('perp-mini-tab', tablesTab===t.k && 'active')}
              onClick={() => setTablesTab(t.k)}>{t.l}</button>
          ))}
        </div>

        {tablesTab === 'byMaturity' && (
          <SimpleTable
            headers={['Target Month', 'Venue', 'Raw Impl. CPI (%)', 'Bid/Ask Spread (bp)', 'Depth/Size', 'Open Interest', 'Confidence']}
            rows={(diag.maturityLevel || []).map(r => [
              fmtMonth(r.target_month), r.venue,
              fmtNum(r.raw_contract_implied_expected_cpi, 2),
              fmtNum(r.bid_ask_spread_bp, 2),
              fmtNum(r.depth_size, 0),
              fmtNum(r.open_interest, 0),
              fmtNum(r.confidence_score, 1),
            ])}
            highlightCol={2}
          />
        )}
        {tablesTab === 'crossVenue' && (() => {
          const rows = diag.venueComparison || [];
          // Mirror v7 line 381: flag every maturity whose dominant issue
          // isn't 'Healthy' (Wide spreads, Low confidence, etc).
          const flagged = new Set(
            rows.map((r, i) => r.liquidity_flag !== 'Healthy' ? i : null).filter(x => x !== null)
          );
          return (
            <SimpleTable
              headers={['Target Month', 'Days', 'Kalshi CPI (%)', 'FX CPI (%)', 'Abs Diff (bp)', 'Kalshi Conf', 'FX Conf', 'Dominant Issue']}
              rows={rows.map(r => [
                fmtMonth(r.target_month), r.days_from_valuation,
                fmtNum(r.kalshi_raw_contract_implied_expected_cpi, 2),
                fmtNum(r.forecastex_raw_contract_implied_expected_cpi, 2),
                fmtNum(r.abs_curve_diff_bp, 2),
                fmtNum(r.kalshi_confidence_score, 1),
                fmtNum(r.forecastex_confidence_score, 1),
                r.liquidity_flag || '—',
              ])}
              highlightCol={4}
              flaggedRows={flagged}
            />
          );
        })()}
        {tablesTab === 'tests' && (() => {
          const rows = diag.scenarioTests || [];
          // Mirror v7 line 387: flag rows where the scenario *worsens* the gap
          // (delta_vs_baseline_bp > 0).
          const flagged = new Set(
            rows.map((r, i) => (r.delta_vs_baseline_bp != null && Number(r.delta_vs_baseline_bp) > 0) ? i : null).filter(x => x !== null)
          );
          return (
            <SimpleTable
              headers={['Test', 'Rule', 'Avg Dispersion (bp)', 'Coverage', 'Δ vs Baseline (bp)']}
              rows={rows.map(r => [
                r.test, r.rule,
                fmtNum(r.avg_dispersion_bp, 2),
                r.coverage_maturities,
                r.delta_vs_baseline_bp != null ? fmtNum(r.delta_vs_baseline_bp, 2) : 'n/a',
              ])}
              highlightCol={2}
              flaggedRows={flagged}
            />
          );
        })()}
      </div>
    );
  }

  /* =========================================================================
     TRADE IDEAS TAB — v7 section 6 right column (3 cards from generate_trade_ideas)
     ========================================================================= */
  function IdeasSection({ perp, accent }) {
    const ideas = perp.tradeIdeas || [];
    return (
      <div className="perp-tab">
        <SubHeader>Trade Playbook</SubHeader>
        <div className="perp-ideas-grid">
          {ideas.map((idea, i) => (
            <article key={i} className={cn('perp-idea-card', `accent-${accent}`)}>
              <header className="perp-idea-head">
                <Icon name="sparkles" size={14} />
                <h4>{idea.title}</h4>
              </header>
              <dl className="perp-idea-rows">
                <div><dt>Expression</dt><dd>{idea.expression}</dd></div>
                <div><dt>Why now</dt><dd>{idea.rationale}</dd></div>
                <div><dt>Trigger</dt><dd>{idea.trigger}</dd></div>
                <div className="risk"><dt>Risk</dt><dd>{idea.riskNote}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </div>
    );
  }

  /* =========================================================================
     Charts in Diagnostics tab
     ========================================================================= */
  function DispersionBarChart({ rows }) {
    const [ref, w] = useChartSize(440, 320);
    const [hover, setHover] = useState(null);
    const h = 320;
    // padL bigger so the rotated y-axis title doesn't overlap tick numbers.
    // padB bigger for horizontal month labels + axis title below them.
    const padL = 76, padR = 16, padT = 12, padB = 64;
    const innerW = Math.max(w - padL - padR, 50);
    const innerH = h - padT - padB;
    const vals = rows.map(r => Math.abs(r.abs_curve_diff_bp || 0));
    const yMax = Math.max(...vals, 1) * 1.2;
    const median = vals.length ? [...vals].sort((a,b)=>a-b)[Math.floor(vals.length/2)] : 0;
    const slot = innerW / Math.max(rows.length, 1);
    const barW = slot * 0.5;
    return (
      <div ref={ref} className="perp-chart-svg-wrap" style={{ position: 'relative' }}>
        <svg width={w} height={h} className="perp-chart-svg" onMouseLeave={() => setHover(null)}>
          {[0,0.25,0.5,0.75,1].map((t,i) => (
            <line key={i} x1={padL} x2={padL+innerW}
              y1={padT + innerH * t} y2={padT + innerH * t}
              className="perp-chart-grid" />
          ))}
          {rows.map((r,i) => {
            const v = Math.abs(r.abs_curve_diff_bp || 0);
            const x = padL + slot * i + slot/2;
            const yTop = padT + innerH - (v / yMax) * innerH;
            const tone = v >= median ? 'danger' : 'gold';
            const onEnter = (e) => {
              const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
              const sx = rect.width / w;
              setHover({
                i,
                x: x * sx, y: yTop * sx,
                rows: [
                  { l: 'Maturity',   v: fmtMonth(r.target_month) },
                  { l: 'Dispersion', v: `${v.toFixed(2)} bp`, accent: true },
                  { l: 'Kalshi CPI', v: fmtNum(r.kalshi_raw_contract_implied_expected_cpi, 2) + '%' },
                  { l: 'FX CPI',     v: fmtNum(r.forecastex_raw_contract_implied_expected_cpi, 2) + '%' },
                  { l: 'Liquidity',  v: r.liquidity_flag || '—', muted: true },
                ],
              });
            };
            return (
              <g key={i} onMouseEnter={onEnter}>
                <rect x={x - barW/2} y={yTop} width={barW} height={Math.max(padT + innerH - yTop, 0)}
                  className={cn('perp-bar', `tone-${tone}`, hover?.i === i && 'active')} />
                <text x={x} y={yTop - 4} className="perp-bar-value" textAnchor="middle">{v.toFixed(1)}</text>
                <text x={x} y={padT + innerH + 16} className="perp-chart-axis-x" textAnchor="middle">
                  {fmtMonth(r.target_month)}
                </text>
              </g>
            );
          })}
          {/* Y-axis: 4 integer-ish ticks with bp suffix (v7 uses ticksuffix=" bp") */}
          {[0, 1, 2, 3, 4].filter(v => v <= yMax).map((v, i) => (
            <text key={i} x={padL - 10}
              y={padT + innerH - (v / yMax) * innerH}
              className="perp-chart-axis-y" textAnchor="end" dominantBaseline="middle">{v} bp</text>
          ))}
          {/* Axis titles (v7 line 215-216). Y-title positioned with extra padding
              so it never collides with tick numbers. */}
          <text x={padL + innerW / 2} y={h - 6} className="perp-chart-axis-title" textAnchor="middle">
            Maturity
          </text>
          <text x={20} y={padT + innerH / 2} className="perp-chart-axis-title"
            textAnchor="middle" transform={`rotate(-90 20 ${padT + innerH / 2})`}>
            Abs Diff (bp)
          </text>
        </svg>
        {hover && <HoverTip x={hover.x} y={hover.y} rows={hover.rows} bound={w} />}
      </div>
    );
  }

  function ConfidenceScatter({ rows, accent }) {
    const [ref, w] = useChartSize(440, 320);
    const [hover, setHover] = useState(null);
    const h = 320;
    // Match the bar chart's padL/padB so y-axis title and x-axis title get
    // proper breathing room — no collision with tick numbers.
    const padL = 76, padR = 24, padT = 12, padB = 56;
    const innerW = Math.max(w - padL - padR, 50);
    const innerH = h - padT - padB;
    const xs = rows.map(r => r.avg_confidence_score || 0);
    const ys = rows.map(r => Math.abs(r.abs_curve_diff_bp || 0));
    const xMin = Math.min(...xs, 0);
    const xMax = Math.max(...xs, 100);
    const yMax = Math.max(...ys, 1) * 1.2;
    return (
      <div ref={ref} className="perp-chart-svg-wrap" style={{ position: 'relative' }}>
        <svg width={w} height={h} className="perp-chart-svg" onMouseLeave={() => setHover(null)}>
          {[0,0.25,0.5,0.75,1].map((t,i) => (
            <line key={i} x1={padL} x2={padL+innerW}
              y1={padT + innerH * t} y2={padT + innerH * t}
              className="perp-chart-grid" />
          ))}
          {rows.map((r,i) => {
            const cx = padL + ((xs[i] - xMin) / Math.max(xMax - xMin, 1)) * innerW;
            const cy = padT + innerH - (ys[i] / yMax) * innerH;
            const onEnter = (e) => {
              const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
              const sx = rect.width / w;
              setHover({
                i,
                x: cx * sx, y: cy * sx,
                rows: [
                  { l: 'Maturity',   v: fmtMonth(r.target_month) },
                  { l: 'Confidence', v: (r.avg_confidence_score ?? 0).toFixed(1), accent: true },
                  { l: 'Dispersion', v: `${ys[i].toFixed(2)} bp` },
                  { l: 'Avg spread', v: fmtNum(r.avg_spread_bp, 2) + ' bp', muted: true },
                ],
              });
            };
            return (
              <g key={i} onMouseEnter={onEnter}>
                <circle cx={cx} cy={cy} r={hover?.i === i ? 8 : 6}
                  className={cn('perp-scatter-dot', `accent-${accent}`, hover?.i === i && 'active')} />
                <text x={cx + 8} y={cy} className="perp-scatter-label" dominantBaseline="middle">{fmtMonth(r.target_month)}</text>
              </g>
            );
          })}
          {/* Axis tick labels */}
          {[0, 50, 100].map((v,i) => (
            <text key={`xt${i}`} x={padL + ((v - xMin) / Math.max(xMax - xMin, 1)) * innerW}
              y={padT + innerH + 14}
              className="perp-chart-axis-x" textAnchor="middle">{v}</text>
          ))}
          {[0, yMax/2, yMax].map((v,i) => (
            <text key={`yt${i}`} x={padL - 8}
              y={padT + innerH - (v / yMax) * innerH}
              className="perp-chart-axis-y" textAnchor="end" dominantBaseline="middle">{v.toFixed(1)} bp</text>
          ))}
          {/* Axis titles (v7 line 245-246) */}
          <text x={padL + innerW/2} y={h - 4} className="perp-chart-axis-title" textAnchor="middle">
            Avg Confidence Score
          </text>
          <text x={14} y={padT + innerH/2} className="perp-chart-axis-title"
            textAnchor="middle" transform={`rotate(-90 14 ${padT + innerH/2})`}>
            Abs Diff (bp)
          </text>
        </svg>
        {hover && <HoverTip x={hover.x} y={hover.y} rows={hover.rows} bound={w} />}
      </div>
    );
  }

  /* Leaf primitives (HoverTip, PanelCard, PItem, etc.) and tiny formatters
     live in PerpPrimitives.jsx — destructured from window.App.PerpPrimitives
     at the top of this IIFE. */

  window.App = window.App || {};
  window.App.PerpReadinessPanel = PerpReadinessPanel;
  window.App.PerpControlsBar    = PerpControlsBar;
})();
