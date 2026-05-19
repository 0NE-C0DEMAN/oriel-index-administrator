/* ==========================================================================
   IndicesView.jsx — Landing page for the "Indices" section.
   Renders the seven Oriel indices as a tile grid plus a small summary strip
   above. Clicking a tile is wired through onOpenIndex (drill-down lands in
   Module 3).
   Registers window.App.IndicesView.
   ========================================================================== */
(() => {
  'use strict';
  const { useMemo } = React;
  const { Icon, Badge, IndexCard } = window.App;
  const { LIST } = window.App.INDICES;

  function IndicesView({ onOpenIndex }) {
    const summary = useMemo(() => {
      const total = LIST.length;
      const live = LIST.filter((i) => i.feed.variant === 'live').length;
      const sample = total - live;
      const families = Array.from(new Set(LIST.map((i) => i.family)));
      return { total, live, sample, families };
    }, []);

    return (
      <div className="view">
        <div className="indices-summary">
          <div className="indices-summary-stats">
            <SummaryStat label="Index & basis views" value={summary.total} />
            <SummaryStat label="Live engines" value={summary.live} accent="success" />
            <SummaryStat label="Sample modules" value={summary.sample} />
          </div>
          <div className="indices-summary-families">
            {summary.families.map((f) => (
              <Badge key={f} variant="default">{f}</Badge>
            ))}
          </div>
        </div>

        <p className="indices-headline">
          Oriel converts prediction-market prices and public reference data into
          publishable curves, basis signals, and market-ready benchmarks.
        </p>

        <div className="indices-grid">
          {LIST.map((idx) => (
            <IndexCard key={idx.key} index={idx} onOpen={onOpenIndex} />
          ))}
        </div>

        <aside className="indices-callout">
          <div className="indices-callout-icon"><Icon name="info" size={18} /></div>
          <div className="indices-callout-text">
            <strong>How these indices work.</strong> Each index converts prediction-market
            contract prices (binary thresholds, scalar buckets, or exact outcomes) into a
            forward-curve anchor. Click a tile for the methodology, snapshots, and current
            constituents.
          </div>
        </aside>
      </div>
    );
  }

  function SummaryStat({ label, value, accent }) {
    return (
      <div className="indices-summary-stat">
        <div className={`indices-summary-stat-value${accent ? ` ${accent}` : ''}`}>{value}</div>
        <div className="indices-summary-stat-label">{label}</div>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.IndicesView = IndicesView;
})();
