/* ==========================================================================
   IndexHero.jsx — Top section of the index detail page.
   Left: big primary metric (front anchor or similar) with change + meta.
   Right: forward curve chart for the index.
   Registers window.App.IndexHero.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;
  const { Icon, Badge, ForwardCurveChart } = window.App;

  function IndexHero({ index }) {
    const d = index.detail;
    if (!d) return null;
    const accent = index.accent || 'accent';
    const change = d.primaryMetric.change || null;

    return (
      <section className="hero">
        <aside className={cn('hero-metric', `accent-${accent}`)}>
          <div className="hero-metric-eyebrow">
            <Icon name={index.icon} size={14} />
            {d.primaryMetric.label}
          </div>
          <div className="hero-metric-value">{d.primaryMetric.formatted}</div>
          <div className="hero-metric-sub">{d.primaryMetric.sub}</div>
          {change && (
            <div className={cn('hero-metric-change', `dir-${change.direction}`)}>
              <Icon name={change.direction === 'down' ? 'trend-down' : 'trending-up'} size={12} />
              <span className="font-mono tabular">{change.formatted}</span>
              <span className="hero-metric-change-since">{change.since}</span>
            </div>
          )}

          <hr className="hero-metric-rule" />

          <dl className="hero-metric-meta">
            <div>
              <dt>Index</dt>
              <dd>{d.methodology.name}</dd>
            </div>
            <div>
              <dt>Methodology</dt>
              <dd className="font-mono">v{d.methodology.version}</dd>
            </div>
            <div>
              <dt>Price basis</dt>
              <dd className="font-mono">{d.methodology.basis}</dd>
            </div>
            <div>
              <dt>Weighting</dt>
              <dd className="font-mono">{d.methodology.weighting}</dd>
            </div>
          </dl>

          <div className="hero-metric-actions">
            <button type="button" className="btn-ghost-link">
              Methodology <Icon name="external" size={11} />
            </button>
            <button type="button" className="btn-ghost-link">
              Field schema <Icon name="external" size={11} />
            </button>
          </div>
        </aside>

        <div className="hero-chart">
          <header className="hero-chart-head">
            <div>
              <div className="hero-chart-title">Forward curve</div>
              <div className="hero-chart-sub">Implied {d.unit} across maturities · {d.forwardCurve.length} anchor points</div>
            </div>
            <div className="hero-chart-legend">
              <span className={cn('hero-chart-legend-dot', `accent-${accent}`)} />
              <span>Expected value</span>
              <span className="hero-chart-legend-band" />
              <span>Bucket band</span>
            </div>
          </header>
          <div className="hero-chart-body">
            <ForwardCurveChart
              data={d.forwardCurve}
              unit={d.curveUnit ?? d.unit}
              precision={d.curvePrecision ?? 2}
              accent={accent}
              height={260}
            />
          </div>
        </div>
      </section>
    );
  }

  window.App = window.App || {};
  window.App.IndexHero = IndexHero;
})();
