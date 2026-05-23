/* ==========================================================================
   PlaceholderView.jsx — Renders explainer panels for tabs that don't have a
   full React surface yet (CPI · CME proxy, Execution Workbench).

   Per Ksenia's MVP-app-lock review, these tabs need to be present in the
   CPI-first navigation but do not need to ship as fully built-out React
   pages in this pass — the underlying Python/Streamlit equivalents already
   exist (v7 CME proxy tab, v7 Execution Workbench). This view gives the
   audience a clear, framed handoff so the tab is never "empty".

   The component takes:
     • tabKey   — 'cme' | 'execution' | other
     • tabLabel — display label from nav
     • onNavigate(key) — function to switch to another tab

   Registers window.App.PlaceholderView.
   ========================================================================== */
(() => {
  'use strict';
  const { Icon, Badge } = window.App;

  const TAB_CONTENT = {
    cme: {
      eyebrow: 'CPI · CME',
      title: 'CME CPI proxy · shadow constituent',
      tag: { variant: 'warning', label: 'Proxy / shadow mode' },
      lede:
        'Interim CME CPI proxy path for reviewer demonstration. Final ' +
        'licensed-feed approval and governance promotion remain pending; ' +
        'the current governed CPI Reference stays Kalshi + ForecastEx ' +
        'while CME is evaluated through shadow-blend diagnostics on the ' +
        'CPI Basis Engine.',
      bullets: [
        {
          title: 'Where CME shows up today',
          body: 'On the CPI Basis Engine tab, the Source Blend & Shadow ' +
                'Impact section quantifies what adding CME to the governed ' +
                'blend would do to curve levels, source weights, dispersion, ' +
                'and downstream CPI dislocation metrics.',
        },
        {
          title: 'Why a shadow surface, not a third governed source yet',
          body: 'CME goes through the same eligibility gate as Kalshi and ' +
                'ForecastEx (coverage, consistency, calibration, history) ' +
                'before it can be promoted. The shadow blend lets us watch ' +
                'CME alongside the governed blend without changing the ' +
                'published Oriel CPI Reference.',
        },
        {
          title: 'Role label on the data layer',
          body: 'Source status carries the PROXY label end-to-end through ' +
                'the client, contract, constituent, and methodology_note ' +
                'fields so any downstream UI never confuses the interim ' +
                'proxy with a licensed feed.',
        },
      ],
      ctas: [
        { label: 'Open CPI Basis Engine', target: 'perp', primary: true },
        { label: 'Compare against Kalshi', target: 'cpi', primary: false },
        { label: 'Compare against ForecastEx', target: 'fx', primary: false },
      ],
      footer:
        'Not promoted into the governed blend. Not claiming licensed CME ' +
        'market-data readiness. Shown to demonstrate the architectural path.',
    },
    execution: {
      eyebrow: 'Execution Workbench',
      title: 'Stress-test dislocations before they become a workflow',
      tag: { variant: 'info', label: 'Decision-support only · Not routed' },
      lede:
        'The Execution Workbench is where Oriel signals (CPI basis, ' +
        'dislocation strip, forward-risk regime) translate into quoting ' +
        'posture, inventory tolerance, executable edge, ScaleTrader-style ' +
        'order planning, and TRS / micro-fund deployment scenarios.',
      bullets: [
        {
          title: 'Forward Risk Regime',
          body: 'Low / Moderate / Elevated derived from cross-venue ' +
                'dispersion, forward curve, and the dislocations frame. The ' +
                'regime drives quoted spread, inventory cap, and executable ' +
                'edge hurdle multipliers used inside the simulator.',
        },
        {
          title: 'CPI Dislocation Strip',
          body: 'Avg / median / max dislocation, net executable edge after ' +
                'cost buffer, plus venue count and maturity count — the ' +
                'six-metric proof-point Chris asked us to make prominent.',
        },
        {
          title: 'TRS micro-fund deployment',
          body: 'Pilot capital, TRS notional multiple, initial margin, ' +
                'dislocation retention, financing rate, collateral yield, ' +
                'and a hedge-mode toggle (Unhedged / Partial / Full) that ' +
                'drives a 4-row scenario comparison.',
        },
      ],
      ctas: [
        { label: 'Open CPI Basis Engine first', target: 'perp', primary: true },
        { label: 'Back to Overview', target: 'overview', primary: false },
      ],
      footer:
        'No live order routing is wired in. The full simulator ships as ' +
        'the standalone Oriel Execution Workbench (apps/market_sim) until ' +
        'the React port lands.',
    },
  };

  function PlaceholderView({ tabKey, tabLabel, onNavigate }) {
    const c = TAB_CONTENT[tabKey] || {
      eyebrow: tabLabel || 'Section',
      title: tabLabel || 'Section',
      tag: { variant: 'default', label: 'Module 1 · App Shell' },
      lede: 'The shell, navigation, and sub-header are wired up — content ' +
            'for this section is the next module we will build.',
      bullets: [],
      ctas: [{ label: 'Back to Overview', target: 'overview', primary: true }],
      footer: '',
    };

    return (
      <div className="view placeholder-view">
        <header className="placeholder-hero">
          <div className="placeholder-eyebrow">{c.eyebrow}</div>
          <h1 className="placeholder-title">{c.title}</h1>
          <div className="placeholder-tag">
            <Badge variant={c.tag.variant} dot>{c.tag.label}</Badge>
          </div>
          <p className="placeholder-lede">{c.lede}</p>
        </header>

        {c.bullets.length > 0 && (
          <div className="placeholder-grid">
            {c.bullets.map((b, i) => (
              <article key={i} className="placeholder-card">
                <div className="placeholder-card-title">{b.title}</div>
                <p className="placeholder-card-body">{b.body}</p>
              </article>
            ))}
          </div>
        )}

        {c.ctas.length > 0 && (
          <div className="placeholder-ctas">
            {c.ctas.map((cta, i) => (
              <button
                key={i}
                type="button"
                className={`placeholder-cta${cta.primary ? ' primary' : ''}`}
                onClick={() => onNavigate && onNavigate(cta.target)}
              >
                {cta.label} <Icon name="arrow-right" size={12} />
              </button>
            ))}
          </div>
        )}

        {c.footer && (
          <div className="placeholder-footer">
            <Icon name="info" size={14} />
            <span>{c.footer}</span>
          </div>
        )}
      </div>
    );
  }

  window.App = window.App || {};
  window.App.PlaceholderView = PlaceholderView;
})();
