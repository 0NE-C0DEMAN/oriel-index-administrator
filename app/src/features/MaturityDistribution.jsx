/* ==========================================================================
   MaturityDistribution.jsx — Card for the index detail page.
   Maturity selector tabs + distribution chart + small bucket-list summary.
   Driven by the `bucketSnapshots` array on the index detail blob.
   Registers window.App.MaturityDistribution.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useMemo } = React;
  const { cn } = window.App.utils;
  const { Badge, DistributionChart, Icon } = window.App;

  function MaturityDistribution({ snapshots = [], unit = '%', accent = 'pink' }) {
    const [activeKey, setActiveKey] = useState(snapshots[0]?.key);
    const active = useMemo(
      () => snapshots.find((s) => s.key === activeKey) || snapshots[0],
      [snapshots, activeKey],
    );
    if (!active) return null;

    const totalProb = active.buckets.reduce((sum, b) => sum + b.prob, 0);
    const peak = active.buckets.reduce((acc, b) => (b.prob > acc.prob ? b : acc), active.buckets[0]);

    return (
      <section className={cn('dist-card', `accent-${accent}`)}>
        <header className="dist-card-head">
          <div>
            <div className="dist-card-eyebrow">Implied distribution</div>
            <div className="dist-card-title">Probability mass per bucket · {active.maturity}</div>
            <div className="dist-card-sub">
              Expected value = probability-weighted bucket midpoint.
            </div>
          </div>
          <div className="dist-card-tabs" role="tablist" aria-label="Maturity">
            {snapshots.map((s) => (
              <button
                key={s.key}
                role="tab"
                aria-selected={s.key === active.key}
                className={cn('dist-card-tab', s.key === active.key && 'active')}
                onClick={() => setActiveKey(s.key)}
                type="button"
              >
                {s.maturity}
              </button>
            ))}
          </div>
        </header>

        <div className="dist-card-body">
          <DistributionChart
            buckets={active.buckets}
            expected={active.expected}
            unit={unit}
            accent={accent}
            height={240}
          />
        </div>

        <footer className="dist-card-foot">
          <div className="dist-card-stat">
            <div className="dist-card-stat-label">Expected</div>
            <div className="dist-card-stat-value font-mono">{active.expected.toFixed(2)}{unit}</div>
          </div>
          <div className="dist-card-stat">
            <div className="dist-card-stat-label">Modal bucket</div>
            <div className="dist-card-stat-value font-mono">{peak.label}</div>
            <div className="dist-card-stat-sub">{(peak.prob * 100).toFixed(0)}% mass</div>
          </div>
          <div className="dist-card-stat">
            <div className="dist-card-stat-label">Buckets</div>
            <div className="dist-card-stat-value font-mono">{active.buckets.length}</div>
          </div>
          <div className="dist-card-stat">
            <div className="dist-card-stat-label">Mass total</div>
            <div className="dist-card-stat-value font-mono">{(totalProb * 100).toFixed(1)}%</div>
            <div className="dist-card-stat-sub">{Math.abs(totalProb - 1) < 0.005 ? 'normalized' : 'raw'}</div>
          </div>
          <div className="dist-card-spacer" />
          <div className="dist-card-info">
            <Icon name="info" size={12} />
            <span>Switch maturity to see the curve roll forward.</span>
          </div>
        </footer>
      </section>
    );
  }

  window.App = window.App || {};
  window.App.MaturityDistribution = MaturityDistribution;
})();
