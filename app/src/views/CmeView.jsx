/* ==========================================================================
   CmeView.jsx — Renders the CPI · CME tab against the live CME proxy
   payload (`window.__CME__`) produced by cme_data.py. Mirrors v7's
   tabs/cme_tab.py content.

   Layout follows the same sticky-head + DetailTabBar + body pattern the
   rest of the Redesign tabs use (see IndexDetailView): top hero card,
   then a 6-cell KPI strip, then a sub-tab bar (Overview · Curve Points
   · Contracts · Methodology), then a body that switches on the active
   sub-tab. Keeps the tab consistent with CPI · Kalshi / FX / Polymarket
   / Basis Engine / Validation etc.

   Registers window.App.CmeView.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useMemo } = React;
  const { cn } = window.App.utils;
  const { Icon, Badge } = window.App;

  const SUB_TABS = [
    { key: 'overview',    label: 'Overview',    icon: 'layers'   },
    { key: 'ladder',      label: 'Ladder',      icon: 'database' },
    { key: 'methodology', label: 'Methodology', icon: 'sliders'  },
  ];

  function CmeView({ onNavigate }) {
    const cme = (typeof window !== 'undefined' && window.__CME__) || null;
    const [tab, setTab] = useState('overview');

    if (!cme) {
      return (
        <div className="view detail-view cme-view">
          <header className="placeholder-hero">
            <div className="placeholder-eyebrow">CPI · CME</div>
            <h1 className="placeholder-title">CME proxy payload unavailable</h1>
            <p className="placeholder-lede">
              The CME proxy package did not load. CPI Reference stays Kalshi
              + ForecastEx. Once the licensed CME feed is approved this tab
              will surface the real numbers.
            </p>
          </header>
        </div>
      );
    }

    const tagVariant = cme.publishable ? 'success' : 'warning';
    const publishLabel = cme.publishable ? 'Shadow eligible' : 'Not eligible';
    const fmt2 = (v) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(2));
    const fmt4 = (v) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(4));

    const points = useMemo(() => cme.points || [], [cme.points]);
    const contracts = useMemo(() => cme.contracts || [], [cme.contracts]);
    const methodology = useMemo(() => cme.methodologyTable || [], [cme.methodologyTable]);

    return (
      <div className="view detail-view cme-view">
        {/* Sticky head: compact single-line page head + KPI strip +
            sub-tab bar. Long-form context moved into the Overview
            sub-tab's framing cards so the head stays compact like the
            Kalshi / ForecastEx / Polymarket detail pages. */}
        <div className="detail-sticky-head">
          <div className="compact-page-head">
            <span className="compact-page-eyebrow">CPI · CME</span>
            <span className="compact-page-divider" aria-hidden="true" />
            <span className="compact-page-title">CME proxy · shadow constituent</span>
            <span className="compact-page-tag warning">Proxy / shadow mode</span>
            <span className="compact-page-tag accent">Prospective governed constituent</span>
          </div>

          <div className="cme-kpi-strip">
            <KpiCell label="Source Status"  value={cme.sourceStatus}             accent="warning" sub="interim proxy" />
            <KpiCell label="Contracts"      value={String(cme.contractCount)}    accent="default" />
            <KpiCell label="Curve Points"   value={String(cme.curvePointCount)}  accent="default" />
            <KpiCell label="Maturities"     value={String(cme.maturityCount)}    accent="default" />
            <KpiCell label="Publishability" value={publishLabel}                 accent={tagVariant} />
            <KpiCell label="Role"           value="Candidate"                    accent="default" sub="not governed-live" />
          </div>

          <SubTabBar tabs={SUB_TABS} active={tab} onChange={setTab} />
        </div>

        <div className="detail-tab-body">
          {tab === 'overview' && (
            <section className="cme-overview-panel">
              <div className="cme-overview-grid">
                <article className="cme-overview-card">
                  <div className="cme-overview-card-title">Where CME shows up today</div>
                  <p className="cme-overview-card-body">
                    On the CPI Basis Engine tab, the Source Blend &amp; Shadow
                    Impact section quantifies what adding CME to the governed
                    blend would do to curve levels, source weights,
                    dispersion, and downstream CPI dislocation metrics.
                  </p>
                </article>
                <article className="cme-overview-card">
                  <div className="cme-overview-card-title">Why a shadow surface, not a third governed source yet</div>
                  <p className="cme-overview-card-body">
                    CME goes through the same eligibility gate as Kalshi and
                    ForecastEx (coverage, consistency, calibration, history)
                    before it can be promoted. The shadow blend lets us watch
                    CME alongside the governed blend without changing the
                    published Oriel CPI Reference.
                  </p>
                </article>
                <article className="cme-overview-card">
                  <div className="cme-overview-card-title">Role label on the data layer</div>
                  <p className="cme-overview-card-body">
                    Source status carries the <code>PROXY</code> label
                    end-to-end through the client, contract, constituent, and
                    methodology_note fields so any downstream UI never
                    confuses the interim proxy with a licensed feed.
                  </p>
                </article>
              </div>

              <div className="cme-handoff">
                <button
                  type="button"
                  className="placeholder-cta primary"
                  onClick={() => onNavigate && onNavigate('perp')}
                >
                  See CME's effect in CPI Basis Engine <Icon name="arrow-right" size={12} />
                </button>
                <button
                  type="button"
                  className="placeholder-cta"
                  onClick={() => onNavigate && onNavigate('cpi')}
                >
                  Compare against Kalshi <Icon name="arrow-right" size={12} />
                </button>
                <button
                  type="button"
                  className="placeholder-cta"
                  onClick={() => onNavigate && onNavigate('fx')}
                >
                  Compare against ForecastEx <Icon name="arrow-right" size={12} />
                </button>
                <span className="cme-disclaimer">
                  Not promoted into the governed blend. Not claiming licensed
                  CME market-data readiness.
                </span>
              </div>
            </section>
          )}

          {tab === 'ladder' && (
            (points.length > 0 || contracts.length > 0) ? (
              <>
                {points.length > 0 && (
                  <section className="cme-table-section">
                    <div className="cme-table-head">Curve Points · per maturity</div>
                    <div className="cme-table-scroll">
                      <table className="cme-table">
                        <thead>
                          <tr>
                            <th>Release Month</th>
                            <th className="num">Threshold</th>
                            <th>Direction</th>
                            <th className="num">Probability</th>
                            <th className="num">Liquidity</th>
                            <th className="num">Volume</th>
                            <th className="num">Open Interest</th>
                            <th>Source Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {points.map((p, i) => (
                            <tr key={i}>
                              <td>{p.releaseMonth}</td>
                              <td className="num">{fmt2(p.threshold)}</td>
                              <td>{p.direction}</td>
                              <td className="num gold">{fmt4(p.probability)}</td>
                              <td className="num">{fmt2(p.liquidityScore)}</td>
                              <td className="num">{p.volume}</td>
                              <td className="num">{p.openInterest}</td>
                              <td>{cme.sourceStatus}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
                {contracts.length > 0 && (
                  <section className="cme-table-section">
                    <div className="cme-table-head">Contracts · raw CME proxy ladder</div>
                    <div className="cme-table-scroll">
                      <table className="cme-table">
                        <thead>
                          <tr>
                            <th>Contract ID</th>
                            <th>Product</th>
                            <th>Release</th>
                            <th>Direction</th>
                            <th className="num">Threshold</th>
                            <th className="num">Mid</th>
                            <th className="num">Volume</th>
                            <th className="num">OI</th>
                            <th>Settlement</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contracts.map((c, i) => (
                            <tr key={i}>
                              <td>{c.contractId}</td>
                              <td>{c.productCode}</td>
                              <td>{c.releaseMonth}</td>
                              <td>{c.direction}</td>
                              <td className="num">{fmt2(c.threshold)}</td>
                              <td className="num gold">{fmt4(c.mid)}</td>
                              <td className="num">{c.volume}</td>
                              <td className="num">{c.openInterest}</td>
                              <td>{c.settlementSource || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            ) : <EmptyPanel label="No CME ladder data available." />
          )}

          {tab === 'methodology' && (
            methodology.length > 0 ? (
              <section className="cme-methodology">
                <div className="cme-methodology-head">Methodology</div>
                <dl className="cme-methodology-grid">
                  {methodology.map((row, i) => (
                    <div key={i} className="cme-methodology-row">
                      <dt>{row.key}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : <EmptyPanel label="No methodology metadata available." />
          )}
        </div>
      </div>
    );
  }

  function SubTabBar({ tabs, active, onChange }) {
    return (
      <nav className="detail-tabbar" role="tablist" aria-label="CME sections">
        <div className="detail-tabbar-inner">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              className={cn('detail-tab', active === t.key && 'active')}
              onClick={() => onChange(t.key)}
            >
              <Icon name={t.icon} size={14} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    );
  }

  function KpiCell({ label, value, accent, sub }) {
    return (
      <div className={`cme-kpi-cell accent-${accent || 'default'}`}>
        <div className="cme-kpi-label">{label}</div>
        <div className="cme-kpi-value">{value}</div>
        {sub && <div className="cme-kpi-sub">{sub}</div>}
      </div>
    );
  }

  function EmptyPanel({ label }) {
    return (
      <section className="cme-table-section" style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{label}</div>
      </section>
    );
  }

  window.App = window.App || {};
  window.App.CmeView = CmeView;
})();
