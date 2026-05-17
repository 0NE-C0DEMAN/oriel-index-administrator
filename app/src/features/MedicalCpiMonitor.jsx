/* ==========================================================================
   MedicalCpiMonitor.jsx — Healthcare-tab-only section that mirrors v7's
   render_medical_cpi_monitor() output:
     1) Signal vs print note (Oriel front anchor vs latest BLS Medical Y/Y, gap bps)
     2) Medical CPI Breadth KPI strip (3 cells)
     3) Monthly Medical CPI Tracker table (M/M, Y/Y, Prev Y/Y, Weight, BLS Series)
     4) Breadth methodology note
   Registers window.App.MedicalCpiMonitor.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;
  const { Icon, Badge } = window.App;

  function MedicalCpiMonitor({ data }) {
    if (!data) return null;
    const { signal, breadth, components, asOfLabel, source, sourceDetail } = data;
    const gapTone = signal.gapBps > 0 ? 'warn' : signal.gapBps < 0 ? 'pos' : 'neutral';
    const gapSign = signal.gapBps > 0 ? '+' : '';

    return (
      <div className="mcm">
        {/* Section eyebrow */}
        <header className="mcm-section-head">
          <div>
            <div className="mcm-eyebrow">Medical CPI Monitor</div>
            <div className="mcm-title">BLS Medical CPI · breadth, dispersion & signal-vs-print</div>
          </div>
          <Badge variant="info">{asOfLabel}</Badge>
        </header>

        {/* Signal vs print + source */}
        <div className="mcm-signal-row">
          <div className="mcm-signal-card">
            <div className="mcm-signal-eyebrow">Signal vs Print</div>
            <ul className="mcm-signal-list">
              <li><span className="mcm-signal-label">Oriel front anchor</span><span className="mcm-signal-value font-mono">{signal.orielFront.toFixed(2)}%</span></li>
              <li><span className="mcm-signal-label">Latest medical Y/Y</span><span className="mcm-signal-value font-mono">{signal.medicalYoY.toFixed(2)}%</span></li>
              <li>
                <span className="mcm-signal-label">Gap</span>
                <span className={cn('mcm-signal-value', 'font-mono', `tone-${gapTone}`, 'strong')}>
                  {gapSign}{signal.gapBps.toFixed(1)} bp
                </span>
              </li>
            </ul>
          </div>
          <div className="mcm-source-card">
            <div className="mcm-signal-eyebrow">Data source</div>
            <div className="mcm-source-name">{source}</div>
            <div className="mcm-source-detail">{sourceDetail}</div>
          </div>
        </div>

        {/* Breadth KPI strip */}
        <section className="mcm-kpi">
          <div className="mcm-kpi-ribbon">
            Medical CPI Breadth · {breadth.componentCount} subcomponents
          </div>
          <div className="mcm-kpi-grid">
            <BreadthCell
              label="Accelerating share"
              value={`${breadth.acceleratingShare}%`}
              sub="Y/Y above prior-month Y/Y"
            />
            <BreadthCell
              label={`Weighted share above ${breadth.thresholdPct}%`}
              value={`${breadth.weightedShareAboveThreshold}%`}
              sub="BLS relative-importance weights"
            />
            <BreadthCell
              label="Cross-sectional dispersion"
              value={breadth.dispersionStd.toFixed(2)}
              sub="Std dev of Y/Y across components"
            />
          </div>
        </section>

        {/* Two-column: tracker table + methodology note */}
        <div className="mcm-grid-2">
          <div className="card">
            <header className="card-header">
              <div>
                <div className="card-title">Monthly Medical CPI Tracker</div>
                <div className="card-subtitle">Per-subcomponent M/M and Y/Y prints; BLS series IDs surfaced.</div>
              </div>
              <Badge variant="default">{components.length} components</Badge>
            </header>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th className="num">M/M (%)</th>
                    <th className="num">Y/Y (%)</th>
                    <th className="num">Prev Y/Y</th>
                    <th className="num">Weight</th>
                    <th>BLS Series</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((c) => {
                    const accelerating = c.yoy > c.prevYoy;
                    const aboveThreshold = c.yoy >= breadth.thresholdPct;
                    return (
                      <tr key={c.seriesId}>
                        <td className="strong">{c.component}</td>
                        <td className="num font-mono">{c.mm.toFixed(2)}</td>
                        <td className={cn('num font-mono strong', accelerating ? 'tone-warning' : 'tone-success')}>
                          {c.yoy.toFixed(2)}
                          {accelerating && <span className="mcm-up-arrow"> ↑</span>}
                        </td>
                        <td className="num font-mono text-muted">{c.prevYoy.toFixed(2)}</td>
                        <td className={cn('num font-mono', aboveThreshold && 'strong')}>{c.weight.toFixed(2)}</td>
                        <td className="font-mono small text-muted">{c.seriesId}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <header className="card-header">
              <div>
                <div className="card-title">Breadth methodology</div>
                <div className="card-subtitle">How accelerating share, weighted share, and dispersion are defined.</div>
              </div>
            </header>
            <div className="card-body">
              <dl className="mcm-method">
                <div>
                  <dt>Accelerating share</dt>
                  <dd>Share of tracked medical subcomponents whose current Y/Y is above the prior-month Y/Y. Captures momentum, not levels.</dd>
                </div>
                <div>
                  <dt>Weighted share above {breadth.thresholdPct}%</dt>
                  <dd>Share of tracked weights with Y/Y at or above the threshold, using BLS relative-importance seed weights as the weighting scheme.</dd>
                </div>
                <div>
                  <dt>Dispersion</dt>
                  <dd>Cross-sectional standard deviation of Y/Y readings across the tracked medical subcomponents.</dd>
                </div>
                <div>
                  <dt>Components in breadth set</dt>
                  <dd className="strong">{breadth.componentCount}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function BreadthCell({ label, value, sub }) {
    return (
      <div className="mcm-kpi-cell">
        <div className="mcm-kpi-label">{label}</div>
        <div className="mcm-kpi-value">{value}</div>
        <div className="mcm-kpi-sub">{sub}</div>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.MedicalCpiMonitor = MedicalCpiMonitor;
})();
