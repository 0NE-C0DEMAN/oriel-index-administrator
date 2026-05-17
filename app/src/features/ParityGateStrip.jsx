/* ==========================================================================
   ParityGateStrip.jsx — KPI strip for OTC parity validation gates.
   Shows overall PASS/FAIL plus individual gate cells with metrics.
   Mirrors v7's parity KPI ribbon.
   Registers window.App.ParityGateStrip.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;
  const { Icon, Badge } = window.App;

  function ParityGateStrip({ gates, accent = 'accent' }) {
    if (!gates) return null;
    const ok = gates.overall === 'PASS';

    return (
      <section className={cn('parity-card', `accent-${accent}`)}>
        <header className="parity-card-head">
          <div className="parity-card-head-left">
            <div className="parity-card-eyebrow">Parity validation</div>
            <div className="parity-card-title">Two-gate calibration check</div>
            <div className="parity-card-sub">
              Benchmarks: {gates.benchmarks.join(' · ')}
            </div>
          </div>
          <div className={cn('parity-overall', ok ? 'pass' : 'fail')}>
            <div className="parity-overall-label">Overall</div>
            <div className="parity-overall-value">
              <Icon name={ok ? 'check' : 'info'} size={14} />
              {gates.overall}
            </div>
          </div>
        </header>

        <div className="parity-gate-row">
          {gates.gates.map((g) => (
            <div key={g.key} className={cn('parity-gate', g.status === 'PASS' ? 'pass' : 'fail')}>
              <div className="parity-gate-head">
                <Badge variant={g.status === 'PASS' ? 'success' : 'danger'} dot>{g.status}</Badge>
                <div className="parity-gate-name">{g.label}</div>
              </div>
              <div className="parity-gate-desc">{g.description}</div>
            </div>
          ))}
        </div>

        <div className="parity-metrics">
          {gates.metrics.map((m, i) => (
            <div key={i} className={cn('parity-metric', m.pass === true && 'pass', m.pass === false && 'fail')}>
              <div className="parity-metric-label">{m.label}</div>
              <div className="parity-metric-value font-mono">{m.value}</div>
              <div className="parity-metric-limit">
                {m.pass === true && <Icon name="check" size={10} className="parity-metric-icon pass" />}
                {m.pass === false && <Icon name="info" size={10} className="parity-metric-icon fail" />}
                {m.limit}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  window.App = window.App || {};
  window.App.ParityGateStrip = ParityGateStrip;
})();
