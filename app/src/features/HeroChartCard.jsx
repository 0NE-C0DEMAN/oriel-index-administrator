/* ==========================================================================
   HeroChartCard.jsx — Tabbed chart card for the index detail page hero.
   Tabs:
     • Forward curve  — implied curve across maturities (always)
     • Front maturity — bucket distribution at the front anchor
                        (only when bucketSnapshots is present)
   Replaces the previous "big metric + chart" IndexHero layout. The metric
   information now lives in IndexPrintCard / IndexKpiStrip.
   Registers window.App.HeroChartCard.
   ========================================================================== */
(() => {
  'use strict';
  const { useState } = React;
  const { cn } = window.App.utils;
  const { ForwardCurveChart, DistributionChart } = window.App;

  function HeroChartCard({ index }) {
    const d = index.detail;
    if (!d) return null;
    const accent = index.accent || 'accent';

    const hasDistribution = Array.isArray(d.bucketSnapshots) && d.bucketSnapshots.length > 0;
    const hasCurve        = Array.isArray(d.forwardCurve) && d.forwardCurve.length > 0;
    // Front-maturity tab is shown whenever we have anchor data — either
    // bucket distributions (CPI Kalshi / Healthcare) or just the forward
    // curve (ForecastEx, where v7's Front Maturity tab is the same line
    // chart restricted to a single point).
    const tabs = (hasDistribution || hasCurve)
      ? [{ key: 'curve', label: 'Forward curve' }, { key: 'front', label: 'Front maturity' }]
      : [{ key: 'curve', label: 'Forward curve' }];
    const [tab, setTab] = useState('curve');

    // Mirrors v7's per-maturity selector on the Front-Maturity panel: lets
    // the user inspect the bucket distribution for any anchor, not only the
    // front. Defaults to the first (front) anchor.
    const [matIdx, setMatIdx] = useState(0);
    const front = hasDistribution
      ? (d.bucketSnapshots[matIdx] || d.bucketSnapshots[0])
      : null;
    // For venues without bucket data (FX, etc.), build a synthetic front
    // anchor from forwardCurve[0] so the Front-Maturity tab can render.
    const curveFront = hasCurve ? d.forwardCurve[matIdx] || d.forwardCurve[0] : null;

    return (
      <section className={cn('herochart-card', `accent-${accent}`)}>
        <header className="herochart-head">
          <div className="herochart-head-text">
            <div className="herochart-title">
              {tab === 'curve'
                ? 'Forward curve'
                : `Front maturity · ${(hasDistribution ? front?.maturity : curveFront?.maturity) || ''}`}
            </div>
            <div className="herochart-sub">
              {tab === 'curve'
                ? `Implied ${d.unit.trim() || 'value'} across ${d.forwardCurve.length} anchor points`
                : hasDistribution
                ? `Probability mass at the front anchor. EV = ${front.expected.toFixed(2)}${d.unit}.`
                : `Front anchor implied ${d.unit.trim() || 'value'} = ${Number(curveFront?.expected ?? 0).toFixed(2)}${d.unit}.`}
            </div>
          </div>
          <div className="herochart-head-right">
            {tab === 'curve' ? (
              <div className="herochart-legend">
                <span className={cn('herochart-legend-band', `accent-${accent}`)} />
                <span>±1σ Band</span>
                <span className="herochart-legend-dash" />
                <span>Prior Curve (T-1)</span>
                <span className={cn('herochart-legend-dot', `accent-${accent}`)} />
                <span>Expected Value</span>
              </div>
            ) : (
              <div className="herochart-legend">
                {hasDistribution && d.bucketSnapshots.length > 1 && (
                  <label className="herochart-mat-pick">
                    <span>Maturity</span>
                    <select
                      value={matIdx}
                      onChange={(e) => setMatIdx(parseInt(e.target.value, 10))}
                      className="herochart-mat-select"
                    >
                      {d.bucketSnapshots.map((s, i) => (
                        <option key={s.key || i} value={i}>{s.maturity}</option>
                      ))}
                    </select>
                  </label>
                )}
                {!hasDistribution && hasCurve && d.forwardCurve.length > 1 && (
                  <label className="herochart-mat-pick">
                    <span>Maturity</span>
                    <select
                      value={matIdx}
                      onChange={(e) => setMatIdx(parseInt(e.target.value, 10))}
                      className="herochart-mat-select"
                    >
                      {d.forwardCurve.map((p, i) => (
                        <option key={p.maturity || i} value={i}>{p.maturity}</option>
                      ))}
                    </select>
                  </label>
                )}
                {hasDistribution ? (
                  <>
                    <span className={cn('herochart-legend-dot', `accent-${accent}`)} />
                    <span>Probability</span>
                    <span className="herochart-legend-evmarker" />
                    <span>EV marker</span>
                  </>
                ) : (
                  <>
                    <span className={cn('herochart-legend-band', `accent-${accent}`)} />
                    <span>±1σ Band</span>
                    <span className={cn('herochart-legend-dot', `accent-${accent}`)} />
                    <span>Implied YoY</span>
                  </>
                )}
              </div>
            )}
            {tabs.length > 1 && (
              <div className="herochart-tabs" role="tablist">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    className={cn('herochart-tab', tab === t.key && 'active')}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="herochart-body">
          {tab === 'curve' && (
            <ForwardCurveChart
              data={d.forwardCurve}
              unit={d.curveUnit ?? d.unit}
              precision={d.curvePrecision ?? 2}
              accent={accent}
              height={280}
              yLabel={d.curveYLabel || `Implied ${d.unit?.trim() || 'value'}`}
            />
          )}
          {tab === 'front' && hasDistribution && front && (
            <DistributionChart
              buckets={front.buckets}
              expected={front.expected}
              unit={d.unit}
              accent={accent}
              height={280}
            />
          )}
          {tab === 'front' && !hasDistribution && curveFront && (
            // ForecastEx-style: same line chart as the forward curve but
            // restricted to the selected anchor (mirrors v7 line 145-146).
            <ForwardCurveChart
              data={[curveFront]}
              unit={d.curveUnit ?? d.unit}
              precision={d.curvePrecision ?? 2}
              accent={accent}
              height={280}
              yLabel={d.curveYLabel || `Implied ${d.unit?.trim() || 'value'}`}
            />
          )}
        </div>

        {/* Legend lives in the card head's right side now (see herochart-head) —
            v7 puts the chart legend at the top, not the bottom. */}
      </section>
    );
  }

  window.App = window.App || {};
  window.App.HeroChartCard = HeroChartCard;
})();
