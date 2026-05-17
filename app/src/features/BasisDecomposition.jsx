/* ==========================================================================
   BasisDecomposition.jsx — Spot / FV / Sim-perp comparison + basis breakdown.
   The visual translates v7's spot/FV/perp bar chart into a denser, more
   information-rich card: three vertical bars with delta annotations, and a
   list of contributing components below.
   Registers window.App.BasisDecomposition.
   ========================================================================== */
(() => {
  'use strict';
  const { useMemo } = React;
  const { cn } = window.App.utils;
  const { Icon } = window.App;

  function BasisDecomposition({ basis, accent = 'pink' }) {
    if (!basis) return null;
    const { spot, fairValue, perpPrice, decomposition = [], horizonLabel } = basis;

    const layout = useMemo(() => {
      const rows = [spot, fairValue, perpPrice];
      const min = Math.min(...rows.map((r) => r.value));
      const max = Math.max(...rows.map((r) => r.value));
      const span = max - min || 1;
      const pad = span * 0.08;
      return {
        yMin: min - pad,
        yMax: max + pad,
        norm: (v) => 1 - (v - (min - pad)) / (span + 2 * pad),  // 0=top, 1=bottom (CSS uses bottom=0)
        height: (v) => `${Math.max(6, ((v - (min - pad)) / (span + 2 * pad)) * 100)}%`,
      };
    }, [spot, fairValue, perpPrice]);

    return (
      <section className={cn('basis-card', `accent-${accent}`)}>
        <header className="basis-card-head">
          <div>
            <div className="basis-card-eyebrow">Basis decomposition</div>
            <div className="basis-card-title">Spot · Fair Value · Sim. Perp @ {horizonLabel}</div>
            <div className="basis-card-sub">
              Reference curve evaluated at the perp horizon. Basis is the gap between
              simulated perp price and fair value.
            </div>
          </div>
        </header>

        <div className="basis-card-body">
          <div className="basis-bars">
            <BasisBar label={spot.label}      value={spot.value}      sub={spot.sub}      tone="neutral" heightPct={layout.height(spot.value)} />
            <BasisBar label={fairValue.label} value={fairValue.value} sub={fairValue.sub} tone={fairValue.delta?.positive ? 'up' : 'down'} delta={fairValue.delta?.label} heightPct={layout.height(fairValue.value)} accent={accent} highlighted />
            <BasisBar label={perpPrice.label} value={perpPrice.value} sub={perpPrice.sub} tone={perpPrice.delta?.positive ? 'up' : 'down'} delta={perpPrice.delta?.label} heightPct={layout.height(perpPrice.value)} />
          </div>

          <div className="basis-decomp">
            <div className="basis-decomp-eyebrow">Components</div>
            <ul className="basis-decomp-list">
              {decomposition.map((d, i) => (
                <li key={i} className={cn('basis-decomp-row', `tone-${d.tone || 'neutral'}`)}>
                  <div className="basis-decomp-row-label">
                    <span className="basis-decomp-bullet" />
                    <span>{d.label}</span>
                  </div>
                  <div className="basis-decomp-row-value font-mono">{d.value}</div>
                  <div className="basis-decomp-row-sub">{d.sub}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    );
  }

  function BasisBar({ label, value, sub, tone = 'neutral', delta, heightPct, accent, highlighted }) {
    return (
      <div className={cn('basis-bar', `tone-${tone}`, highlighted && 'highlighted', accent && `accent-${accent}`)}>
        <div className="basis-bar-track">
          <div className="basis-bar-fill" style={{ height: heightPct }}>
            <div className="basis-bar-cap font-mono">{value.toFixed(4)}</div>
          </div>
        </div>
        <div className="basis-bar-foot">
          <div className="basis-bar-label">{label}</div>
          <div className="basis-bar-sub">{sub}</div>
          {delta && (
            <div className={cn('basis-bar-delta', `tone-${tone}`)}>
              <Icon name={tone === 'down' ? 'trend-down' : 'trending-up'} size={10} />
              <span className="font-mono">{delta}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.BasisDecomposition = BasisDecomposition;
})();
