/* ==========================================================================
   CmsKpiStrip.jsx — KPI strip swap-in for the cms tab.

   Reuses IndexKpiStrip's ribbon-and-grid rhythm 1:1 — same single-line
   ribbon (family pill · venue · description · date input), same cell
   chrome — but with 6 cells instead of 5 to surface the v7 cms_tab
   metrics: Medical CPI · Oriel Healthcare Spot · CMS Anchor · Public-
   Print Basis · Expected Convergence · Signal Confidence.

   Deliberately NO version chips, NO description paragraph, NO secondary
   ribbon — those were vertical noise that other tabs don't carry. The
   strip stays as compact as HC / CPI Kalshi / FX / Polymarket.

   Registers window.App.CmsKpiStrip.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;
  const { Icon } = window.App;

  const fmtPct = (v) => v == null || !isFinite(v) ? '—' : `${Number(v).toFixed(2)}%`;
  const fmtBp  = (v) => v == null || !isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} bp`;
  const tonePct  = (v) => v == null ? 'neutral' : v >= 0 ? 'pos' : 'neg';
  const toneConf = (label) => label === 'High' ? 'pos'
                              : label === 'Medium' ? 'warn'
                              : label === 'Low' ? 'neg' : 'neutral';

  function CmsKpiStrip({ index }) {
    const cms = index?.detail?.cms;
    if (!cms || !cms.kpiStrip) return null;
    const accent = index.accent || 'pink';
    const k = cms.kpiStrip;

    const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
    const [valuationDate, setValuationDate] = React.useState(today);
    const dateInputRef = React.useRef(null);
    const openDatePicker = () => {
      if (dateInputRef.current && typeof dateInputRef.current.showPicker === 'function') {
        try { dateInputRef.current.showPicker(); } catch { /* ignore */ }
      }
    };

    return (
      <section className={cn('idx-kpi cms-kpi-strip', `accent-${accent}`)}>
        {/* Single-line ribbon — same shape as IndexKpiStrip's. */}
        <div className="idx-kpi-ribbon">
          <span className="idx-kpi-ribbon-tag">{index.family}</span>
          <span className="idx-kpi-ribbon-sep">·</span>
          <span className="idx-kpi-ribbon-venue">{index.venue}</span>
          <span className="idx-kpi-ribbon-sep">·</span>
          <span className="idx-kpi-ribbon-desc">{index.description}</span>
          <label className="idx-kpi-ribbon-date" title="Valuation date" onClick={openDatePicker}>
            <Icon name="info" size={11} />
            <span className="idx-kpi-ribbon-date-label">Valuation date</span>
            <input
              ref={dateInputRef}
              type="date"
              value={valuationDate}
              onChange={(e) => setValuationDate(e.target.value)}
              className="idx-kpi-ribbon-date-input"
            />
          </label>
        </div>

        {/* 6-cell grid (override of the standard 5-col idx-kpi-grid). */}
        <div className="idx-kpi-grid cms-kpi-grid-6">
          <Cell label="Medical CPI"
                value={fmtPct(k.medicalCpiPct)}
                sub="BLS public rail" />
          <Cell label="Oriel Healthcare Spot"
                value={<span className="idx-kpi-mono lead">{fmtPct(k.orielSpotPct)}</span>}
                sub="Translated reference"
                lead />
          <Cell label="CMS Official Anchor"
                value={<span className="idx-kpi-mono back">{fmtPct(k.cmsAnchorPct)}</span>}
                sub="Latest official print"
                lead />
          <Cell label="Public-Print Basis"
                value={<span className={cn('idx-kpi-mono', `tone-${tonePct(k.publicBasisBp)}`)}>{fmtBp(k.publicBasisBp)}</span>}
                sub="Rail vs Oriel translation"
                lead />
          <Cell label="Expected Convergence"
                value={<span className="idx-kpi-mono lead">{k.convergenceShort}</span>}
                sub="Releases to convergence"
                lead />
          <Cell label="Signal Confidence"
                value={<span className={cn('idx-kpi-pub', toneConf(k.signalConfidence) === 'pos' ? 'ok' : 'no')}>
                  <Icon name={toneConf(k.signalConfidence) === 'pos' ? 'check' : 'info'} size={13} />
                  {k.signalConfidence}
                </span>}
                sub={`${k.historicalPct.toFixed(0)}th historical pct`}
                highlight={toneConf(k.signalConfidence) === 'pos' ? 'pub-ok' : 'pub-no'} />
        </div>
      </section>
    );
  }

  function Cell({ label, value, sub, lead, highlight }) {
    return (
      <div className={cn('idx-kpi-cell', lead && 'lead', highlight && `cell-${highlight}`)}>
        <div className="idx-kpi-cell-label">{label}</div>
        <div className="idx-kpi-cell-value">{value}</div>
        <div className="idx-kpi-cell-sub">{sub}</div>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.CmsKpiStrip = CmsKpiStrip;
})();
