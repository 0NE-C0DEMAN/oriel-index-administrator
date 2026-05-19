/* ==========================================================================
   MedicalBasisKpiStrip.jsx — KPI strip swap-in for the ForecastEx Medical
   Basis tab (sticky-head replacement for IndexKpiStrip).

   Same .idx-kpi card chrome + single-line ribbon as every other tab so
   the strip drops in as a visual peer. v7's medical_basis_tab uses 4
   custom cells (not the standard 5-cell idx-kpi); we mirror those here:

     • Expected Basis        — selected maturity's expected_spread_bps (lead)
     • P(spread > 200 bps)   — YES price proxy at 200 bp threshold
     • Settlement Example    — default 5.6% medical vs 3.1% CPI ⇒ YES / $1.00
     • Ladder Thresholds     — span of the threshold ladder, e.g. 0–400 bps

   The ribbon also carries a compact maturity selector so the user can
   switch maturities without leaving the sticky head — same pattern as
   the date input on every other tab.

   Registers window.App.MedicalBasisKpiStrip.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;
  const { Icon } = window.App;

  const fmtBp = (v) => v == null || !isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${Math.round(Number(v))} bp`;
  const fmtPct100 = (v) => v == null || !isFinite(v) ? '—' : `${(Number(v) * 100).toFixed(1)}%`;

  function MedicalBasisKpiStrip({ index, selectedIdx, onSelectIdx }) {
    const mb = index?.detail?.mb;
    if (!mb || !Array.isArray(mb.basisPoints) || !mb.basisPoints.length) return null;
    const accent = index.accent || 'pink';
    const points = mb.basisPoints;
    const idx = Math.max(0, Math.min(selectedIdx ?? 1, points.length - 1));
    const sel = points[idx];

    const [low, high] = mb.meta?.thresholdRange || [0, 400];
    const settle = mb.settlementExample;

    const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
    const [valuationDate, setValuationDate] = React.useState(today);
    const dateInputRef = React.useRef(null);
    const openDatePicker = () => {
      if (dateInputRef.current && typeof dateInputRef.current.showPicker === 'function') {
        try { dateInputRef.current.showPicker(); } catch { /* ignore */ }
      }
    };

    return (
      <section className={cn('idx-kpi mb-kpi-strip', `accent-${accent}`)}>
        {/* Single-line ribbon — same shape as IndexKpiStrip */}
        <div className="idx-kpi-ribbon">
          <span className="idx-kpi-ribbon-tag">{index.family}</span>
          <span className="idx-kpi-ribbon-sep">·</span>
          <span className="idx-kpi-ribbon-venue">{index.venue}</span>
          <span className="idx-kpi-ribbon-sep">·</span>
          <span className="idx-kpi-ribbon-desc">{index.description}</span>

          {/* Compact maturity selector — replaces the live toggle slot */}
          <label className="idx-kpi-ribbon-toggle mb-mat-pick" title="Contract maturity">
            <Icon name="layers" size={11} />
            <span className="idx-kpi-ribbon-date-label">Maturity</span>
            <select
              className="mb-mat-select"
              value={idx}
              onChange={(e) => onSelectIdx && onSelectIdx(parseInt(e.target.value, 10))}
            >
              {points.map((p, i) => (
                <option key={p.maturity} value={i}>{p.year}</option>
              ))}
            </select>
          </label>

          {/* Standard valuation-date input on the right */}
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

        {/* 4-cell grid (override of standard 5-col idx-kpi-grid). */}
        <div className="idx-kpi-grid mb-kpi-grid-4">
          <Cell label="Expected Basis"
                value={<span className="idx-kpi-mono lead">{fmtBp(sel.expectedSpreadBps)}</span>}
                sub={`Medical CPI − CPI-U · ${sel.year}`}
                lead />
          <Cell label="P(spread > 200 bps)"
                value={<span className="idx-kpi-mono">{fmtPct100(sel.probabilityGt200)}</span>}
                sub="YES price proxy"
                lead />
          <Cell label="Illustrative Settlement"
                value={<span className={cn('idx-kpi-pub', settle.settlesYes ? 'ok' : 'no')}>
                  <Icon name={settle.settlesYes ? 'check' : 'info'} size={13} />
                  {settle.settlesYes ? 'YES / $1.00' : 'NO / $0.00'}
                </span>}
                sub={`${settle.medicalCpiYoyPct.toFixed(1)}% medical vs ${settle.cpiYoyPct.toFixed(1)}% CPI`}
                highlight={settle.settlesYes ? 'pub-ok' : 'pub-no'} />
          <Cell label="Contract Thresholds"
                value={<span className="idx-kpi-mono">{`${low}–${high} bps`}</span>}
                sub="Spread > threshold contracts" />
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
  window.App.MedicalBasisKpiStrip = MedicalBasisKpiStrip;
})();
