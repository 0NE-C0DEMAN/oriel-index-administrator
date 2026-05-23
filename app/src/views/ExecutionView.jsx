/* ==========================================================================
   ExecutionView.jsx — Renders the Execution Workbench tab against the
   summary payload (`window.__EXECUTION__`) produced by execution_data.py.

   Mirrors the v7 falconx_sim_tab Sim Posture + CPI Dislocation Strip
   sections — the parts Chris asked to make obvious on screen:

       Forward Risk Regime banner    (Low / Moderate / Elevated + explainer)
       Risk score (0-100)            (regime thresholds 35 / 65)
       3 posture cards               (base . xmultiplier . effective)
                                       - quoted spread bp
                                       - inventory limit USD
                                       - executable edge hurdle bp
       CPI Dislocation Strip         (avg / median / max / net edge / venues / maturities)
       Handoff CTAs                  (back to Basis Engine, open standalone sim)

   The full v7 simulator (ScaleTrader ticket, TRS scenario, sweep,
   ladder) stays in `apps/market_sim/`. This view is the React-side
   readout of the same regime + dislocation strip data so the audience
   sees real numbers, not just buttons.

   Registers window.App.ExecutionView.
   ========================================================================== */
(() => {
  'use strict';
  const { Icon, Badge } = window.App;

  const REGIME_TONE = {
    Low:      'success',
    Moderate: 'info',
    Elevated: 'warning',
  };

  function ExecutionView({ onNavigate }) {
    const ex = (typeof window !== 'undefined' && window.__EXECUTION__) || null;

    if (!ex || !ex.available) {
      const reason = ex ? ex.unavailableReason : 'Execution payload missing.';
      return (
        <div className="view execution-view">
          <header className="placeholder-hero">
            <div className="placeholder-eyebrow">Execution Workbench</div>
            <h1 className="placeholder-title">Execution Workbench unavailable</h1>
            <p className="placeholder-lede">{reason}</p>
            <div className="placeholder-ctas">
              <button
                type="button"
                className="placeholder-cta primary"
                onClick={() => onNavigate && onNavigate('perp')}
              >
                Open CPI Basis Engine instead <Icon name="arrow-right" size={12} />
              </button>
            </div>
          </header>
        </div>
      );
    }

    const tone = REGIME_TONE[ex.regime] || 'info';
    const fmtPct = (n) => (n == null ? '—' : `${Number(n).toFixed(0)}`);
    const fmtBp = (n) => (n == null ? '—' : `${Number(n).toFixed(2)} bp`);
    const fmtBp1 = (n) => (n == null ? '—' : `${Number(n).toFixed(1)} bp`);
    const fmtX = (n) => (n == null ? '—' : `×${Number(n).toFixed(2)}`);
    const fmtUsd = (n) => {
      if (n == null) return '—';
      const m = Number(n);
      if (Math.abs(m) >= 1e6) return `$${(m / 1e6).toFixed(2)}M`;
      if (Math.abs(m) >= 1e3) return `$${(m / 1e3).toFixed(0)}k`;
      return `$${m.toFixed(0)}`;
    };

    return (
      <div className="view execution-view">
        <header className="placeholder-hero">
          <div className="placeholder-eyebrow">Execution Workbench</div>
          <h1 className="placeholder-title">Forward Risk Regime · Posture · Dislocations</h1>
          <div className="placeholder-tag">
            <Badge variant="info" dot>Decision-support only · Not routed</Badge>
          </div>
          <p className="placeholder-lede">
            Translates the live venue stack into a Forward Risk Regime
            (Low / Moderate / Elevated), the three posture multipliers
            (spread, inventory, edge hurdle) the simulator applies under
            that regime, and the CPI Dislocation Strip Chris asked to make
            prominent. The standalone Oriel Execution Workbench (apps/market_sim)
            still owns the full simulator — ScaleTrader ticket, TRS / micro-fund
            scenario, parameter sweep — until the React port lands.
          </p>
        </header>

        {/* Regime banner */}
        <section className={`exec-regime-banner exec-regime-${tone}`}>
          <div className="exec-regime-head">
            <Badge variant={tone} dot>Forward Risk Regime · {ex.regime}</Badge>
            {ex.riskScore != null && (
              <span className="exec-regime-score">
                Risk score <strong>{fmtPct(ex.riskScore)}</strong>/100
                <span className="exec-regime-thresholds"> (Low &lt; 35 · Moderate &lt; 65 · Elevated ≥ 65)</span>
              </span>
            )}
          </div>
          <p className="exec-regime-explainer">{ex.regimeExplainer}</p>
        </section>

        {/* Posture cards */}
        <section className="exec-posture-grid">
          <PostureCard
            title="Quoted spread"
            unit="bp"
            base={ex.baseSpreadBps}
            mult={ex.spreadMultiplier}
            eff={ex.effectiveSpreadBps}
            tone={tone}
            fmt={fmtBp1}
          />
          <PostureCard
            title="Inventory limit"
            unit="USD"
            base={ex.baseInventoryUsd}
            mult={ex.inventoryMultiplier}
            eff={ex.effectiveInventoryUsd}
            tone={tone}
            fmt={fmtUsd}
          />
          <PostureCard
            title="Executable edge hurdle"
            unit="bp"
            base={ex.baseEdgeHurdleBps}
            mult={ex.edgeHurdleMultiplier}
            eff={ex.effectiveEdgeHurdleBps}
            tone={tone}
            fmt={fmtBp1}
          />
        </section>

        {/* Dislocation strip */}
        <section className="exec-strip-section">
          <div className="exec-strip-head">CPI Dislocation Strip · cross-venue residuals vs Oriel Reference</div>
          <div className="exec-strip-grid">
            <StripCell label="Avg dislocation"      value={fmtBp(ex.strip.avgDislocationBps)} />
            <StripCell label="Median dislocation"   value={fmtBp(ex.strip.medianDislocationBps)} />
            <StripCell label="Max dislocation"      value={fmtBp(ex.strip.maxDislocationBps)} />
            <StripCell label="Net executable edge"  value={fmtBp(ex.strip.netExecutableEdgeBps)} sub="after 10 bp cost buffer" />
            <StripCell label="Venues"               value={String(ex.strip.venueCount)} />
            <StripCell label="Maturities"           value={String(ex.strip.maturityCount)} />
          </div>
        </section>

        {/* Handoff */}
        <div className="exec-handoff">
          <button
            type="button"
            className="placeholder-cta primary"
            onClick={() => onNavigate && onNavigate('perp')}
          >
            See the dislocation source in CPI Basis Engine <Icon name="arrow-right" size={12} />
          </button>
          <button
            type="button"
            className="placeholder-cta"
            onClick={() => onNavigate && onNavigate('overview')}
          >
            Back to Overview <Icon name="arrow-right" size={12} />
          </button>
          <span className="exec-disclaimer">
            No live order routing is wired in. Full simulator (ScaleTrader,
            TRS scenario, sweep) ships as the standalone Oriel Execution
            Workbench (apps/market_sim) until the React port lands.
          </span>
        </div>
      </div>
    );
  }

  function PostureCard({ title, unit, base, mult, eff, tone, fmt }) {
    return (
      <article className={`exec-posture-card exec-posture-${tone}`}>
        <div className="exec-posture-title">{title}</div>
        <div className="exec-posture-row">
          <div className="exec-posture-base">
            <div className="exec-posture-mini">Base</div>
            <div className="exec-posture-value">{fmt(base)}</div>
          </div>
          <div className="exec-posture-mult">×{Number(mult).toFixed(2)}</div>
          <div className="exec-posture-eff">
            <div className="exec-posture-mini">Effective</div>
            <div className="exec-posture-value exec-posture-eff-value">{fmt(eff)}</div>
          </div>
        </div>
      </article>
    );
  }

  function StripCell({ label, value, sub }) {
    return (
      <div className="exec-strip-cell">
        <div className="exec-strip-label">{label}</div>
        <div className="exec-strip-value">{value}</div>
        {sub && <div className="exec-strip-sub">{sub}</div>}
      </div>
    );
  }

  window.App = window.App || {};
  window.App.ExecutionView = ExecutionView;
})();
