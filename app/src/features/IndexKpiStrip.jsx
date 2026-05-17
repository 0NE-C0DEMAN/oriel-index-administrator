/* ==========================================================================
   IndexKpiStrip.jsx — Top-of-detail KPI strip with 5 cells.
   Mirrors v7's render_index() KPI ribbon but in our light theme:
     1. Index Print (level + base)
     2. Front (e.g. 1M implied — value + maturity)
     3. Back (e.g. 6M implied — value + maturity)
     4. Term Structure (slope in pp + slope %)
     5. Publishability (Eligible/Not + flagged count)

   Description acts as the ribbon at the top of the card.
   Registers window.App.IndexKpiStrip.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;
  const { Icon, Badge } = window.App;

  function IndexKpiStrip({ index, liveOn: liveOnProp, onLiveChange }) {
    const print = index?.detail?.indexPrint;
    if (!print) return null;

    const accent = index.accent || 'accent';
    const { indexLevel, baseValue, front, back, slope, publishable, flaggedCount, constituentCount, customLabels = {} } = print;

    // Default to today (the user's "valuation as of now"). The detail blob's
    // historical valuationTime is shown elsewhere if needed.
    const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
    const [valuationDate, setValuationDate] = React.useState(today);
    const dateInputRef = React.useRef(null);
    const openDatePicker = (e) => {
      // Make the picker open from a click anywhere on the wrapper, not just
      // the small calendar icon. showPicker() is supported in Chrome/Edge/
      // Safari; falls back to native click behavior in Firefox.
      if (dateInputRef.current && typeof dateInputRef.current.showPicker === 'function') {
        try { dateInputRef.current.showPicker(); } catch { /* ignore */ }
      }
    };

    // Live data toggle. State is owned by IndexDetailView (for cross-card
    // propagation) — fall back to a local state if no parent prop given.
    const runtimeMeta = index?.detail?.runtimeMeta;
    const isControlled = typeof liveOnProp === 'boolean';
    const [localLive, setLocalLive] = React.useState(runtimeMeta?.feedStatus === 'live');
    const liveOn = isControlled ? liveOnProp : localLive;
    const setLiveOn = (v) => {
      if (isControlled) onLiveChange && onLiveChange(v);
      else setLocalLive(v);
    };
    const slopeTone = slope.direction === 'up' ? 'pos' : slope.direction === 'down' ? 'neg' : 'neutral';
    const slopeUnit = slope.unit || 'pp';
    const slopeSign = slope.delta > 0 ? '+' : '';
    const slopePctSign = slope.pct > 0 ? '+' : '';

    const indexLevelLabel = customLabels.indexLevel || 'Official index print';
    const indexLevelStr =
      slope.unit === 'bps'
        ? `${indexLevel >= 0 ? '+' : ''}${indexLevel} bps`
        : Number(indexLevel).toFixed(2);
    const baseStr =
      slope.unit === 'bps' ? `Reference 0 bps` : `Base ${Number(baseValue).toFixed(0)}`;

    return (
      <section className={cn('idx-kpi', `accent-${accent}`)}>
        <div className="idx-kpi-ribbon">
          <span className="idx-kpi-ribbon-tag">{index.family}</span>
          <span className="idx-kpi-ribbon-sep">·</span>
          <span className="idx-kpi-ribbon-venue">{index.venue}</span>
          <span className="idx-kpi-ribbon-sep">·</span>
          <span className="idx-kpi-ribbon-desc">{index.description}</span>
          {runtimeMeta && !runtimeMeta.hideLiveToggle && (
            <label className={cn('idx-kpi-ribbon-toggle', liveOn && 'on')} title="Toggle live data feed">
              <input
                type="checkbox"
                checked={liveOn}
                onChange={(e) => setLiveOn(e.target.checked)}
              />
              <span className="idx-kpi-ribbon-toggle-track">
                <span className="idx-kpi-ribbon-toggle-thumb" />
              </span>
              <span className="idx-kpi-ribbon-toggle-label">
                {liveOn ? 'Live data' : 'Sample data'}
              </span>
            </label>
          )}
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

        <div className="idx-kpi-grid">
          <KpiCell label={indexLevelLabel} value={indexLevelStr} sub={baseStr} />
          <KpiCell
            label={front.label}
            value={<span className="idx-kpi-mono lead">{Number(front.value).toFixed(2)}{slope.unit === 'bps' ? ' bps' : '%'}</span>}
            sub={front.maturity}
            lead
          />
          <KpiCell
            label={back.label}
            value={<span className="idx-kpi-mono back">{Number(back.value).toFixed(2)}{slope.unit === 'bps' ? ' bps' : '%'}</span>}
            sub={back.maturity}
            lead
          />
          <KpiCell
            label="Term structure"
            value={
              <span className={cn('idx-kpi-mono', `tone-${slopeTone}`)}>
                {slopeSign}{Number(slope.delta).toFixed(slope.unit === 'bps' ? 0 : 4)}{slope.unit === 'bps' ? ' bps' : '%'}
              </span>
            }
            sub={
              <span className={cn(`tone-${slopeTone}`)}>
                {slopePctSign}{Number(slope.pct).toFixed(2)}% term
              </span>
            }
            lead
          />
          <KpiCell
            label="Publishability"
            value={
              <span className={cn('idx-kpi-pub', publishable ? 'ok' : 'no')}>
                <Icon name={publishable ? 'check' : 'info'} size={13} />
                {publishable ? 'Eligible' : 'Not eligible'}
              </span>
            }
            sub={
              <span className={flaggedCount > 0 ? 'tone-warning' : 'text-muted'}>
                {flaggedCount > 0
                  ? `${flaggedCount} flagged · ${constituentCount} constituents`
                  : `${constituentCount} constituents`}
              </span>
            }
            highlight={publishable ? 'pub-ok' : 'pub-no'}
          />
        </div>

      </section>
    );
  }

  function KpiCell({ label, value, sub, lead, highlight }) {
    return (
      <div className={cn('idx-kpi-cell', lead && 'lead', highlight && `cell-${highlight}`)}>
        <div className="idx-kpi-cell-label">{label}</div>
        <div className="idx-kpi-cell-value">{value}</div>
        <div className="idx-kpi-cell-sub">{sub}</div>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.IndexKpiStrip = IndexKpiStrip;
})();
