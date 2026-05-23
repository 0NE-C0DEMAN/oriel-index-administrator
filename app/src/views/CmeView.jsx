/* ==========================================================================
   CmeView.jsx — Renders the CPI · CME tab against the live CME proxy
   payload (`window.__CME__`) produced by cme_data.py. Mirrors v7's
   tabs/cme_tab.py content.

   Layout follows the same sticky-head + DetailTabBar + body pattern the
   rest of the Redesign tabs use (see IndexDetailView): compact page head
   + 6-cell KPI strip + sub-tab bar (Overview · Ladder · Methodology),
   then a body that switches on the active sub-tab. Each sub-tab is
   designed to feel substantive on its own: intro + diagnostics strip +
   data sections + closing handoff. Avoids the "naked tab" feel from the
   earlier pass where Methodology was only a small dl/dt grid.

   Registers window.App.CmeView.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useMemo } = React;
  const { cn } = window.App.utils;
  const { Icon, Badge } = window.App;

  const SUB_TABS = [
    { key: 'overview',    label: 'Status & Eligibility',     icon: 'layers'   },
    { key: 'ladder',      label: 'Curve & Ladder',           icon: 'database' },
    { key: 'methodology', label: 'Methodology & Promotion',  icon: 'sliders'  },
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
    const fmtPct = (v) => (v == null || Number.isNaN(v) ? '—' : `${(Number(v) * 100).toFixed(0)}%`);

    const points = useMemo(() => cme.points || [], [cme.points]);
    const contracts = useMemo(() => cme.contracts || [], [cme.contracts]);
    const methodology = useMemo(() => cme.methodologyTable || [], [cme.methodologyTable]);

    // Aggregate ladder diagnostics for the Ladder sub-tab KPI strip.
    const ladderStats = useMemo(() => {
      const ps = points;
      const cs = contracts;
      const avgProb = ps.length
        ? ps.reduce((s, p) => s + (Number(p.probability) || 0), 0) / ps.length
        : 0;
      const avgLiq = ps.length
        ? ps.reduce((s, p) => s + (Number(p.liquidityScore) || 0), 0) / ps.length
        : 0;
      const totalVol = cs.reduce((s, c) => s + (Number(c.volume) || 0), 0);
      const totalOi  = cs.reduce((s, c) => s + (Number(c.openInterest) || 0), 0);
      return { avgProb, avgLiq, totalVol, totalOi };
    }, [points, contracts]);

    // Promotion gates — surfaces what CME needs to clear to become governed.
    // Static list anchored to the v7 governance gate (coverage, consistency,
    // calibration, history); status comes from publishable + curve presence.
    const promotionGates = useMemo(() => ([
      {
        key: 'feed',
        label: 'Licensed feed approval',
        status: cme.sourceStatus === 'PROXY' ? 'pending' : 'cleared',
        detail: cme.sourceStatus === 'PROXY'
          ? 'Interim proxy in use, licensed feed pending.'
          : `Source status: ${cme.sourceStatus}`,
      },
      {
        key: 'coverage',
        label: 'Coverage across maturities',
        status: cme.maturityCount >= 3 ? 'cleared' : 'partial',
        detail: `${cme.maturityCount} release ${cme.maturityCount === 1 ? 'month' : 'months'} covered.`,
      },
      {
        key: 'liquidity',
        label: 'Liquidity / quote depth',
        status: ladderStats.totalOi > 0 ? 'cleared' : 'pending',
        detail: ladderStats.totalOi > 0
          ? `${ladderStats.totalOi.toLocaleString()} contracts open, avg liquidity ${fmtPct(ladderStats.avgLiq)}.`
          : 'No open interest yet — quote depth gate pending.',
      },
      {
        key: 'shadow',
        label: 'Shadow-blend eligibility',
        status: cme.publishable ? 'cleared' : 'pending',
        detail: cme.publishabilityReason || (cme.publishable
          ? 'CME passes the shadow-blend filter; governed promotion still requires the gate above.'
          : 'Not yet eligible for shadow blend — see Basis Engine for the live calc.'),
      },
    ]), [cme.sourceStatus, cme.maturityCount, cme.publishable, cme.publishabilityReason, ladderStats.totalOi, ladderStats.avgLiq]);

    const promotionSteps = [
      {
        n: 1,
        title: 'Licensed feed approved',
        body: 'CME licensed market-data agreement signed; PROXY label flips to LIVE end-to-end across client, contract, constituent, methodology_note.',
      },
      {
        n: 2,
        title: 'Shadow blend exposes CME-only delta',
        body: 'Basis Engine · Source Blend & Shadow Impact quantifies what adding CME to the governed blend changes (levels, weights, dispersion, dislocation).',
      },
      {
        n: 3,
        title: 'Eligibility gate cleared',
        body: 'Same coverage + consistency + calibration + history checks Kalshi and ForecastEx passed. Failure on any gate keeps CME in shadow mode.',
      },
      {
        n: 4,
        title: 'Governance promotion',
        body: 'Constituent registry updated, governed blend re-weighted, CPI Reference now includes CME. Front-end role label changes from Candidate to Constituent.',
      },
    ];

    return (
      <div className="view detail-view cme-view">
        {/* Sticky head: compact single-line page head + KPI strip + sub-tab
            bar. Long-form context lives inside each sub-tab body so the
            head stays compact like the Kalshi / ForecastEx / Polymarket
            detail pages. */}
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
          {/* ─────────────────────────  Overview tab  ─────────────────────── */}
          {tab === 'overview' && (
            <section className="cme-overview-panel">
              <p className="cme-tab-lede">
                CME is being evaluated as a candidate CPI curve constituent
                through an interim proxy feed. The four boxes below show how
                close CME is to passing the same eligibility gate Kalshi and
                ForecastEx cleared before they were promoted into the
                governed Oriel CPI Reference.
              </p>

              <div className="cme-source-diag-strip">
                <DiagCell label="Source Status"        value={cme.sourceStatus}                    accent="warning" />
                <DiagCell label="Venue"                value={cme.venue || 'CME'}                  accent="default" />
                <DiagCell label="Methodology Version"  value={cme.methodology || '—'}         accent="default" mono />
                <DiagCell label="Valuation Snapshot"   value={formatTimestamp(cme.valuationTimestamp)} accent="default" mono />
              </div>

              <div className="cme-overview-section-head">Where CME shows up in the product today</div>
              <div className="cme-overview-grid">
                <article className="cme-overview-card">
                  <div className="cme-overview-card-title">Basis Engine · Source Blend &amp; Shadow Impact</div>
                  <p className="cme-overview-card-body">
                    The Source Blend &amp; Shadow Impact section on the CPI
                    Basis Engine tab quantifies what adding CME to the
                    governed blend would do to curve levels, source weights,
                    dispersion, and downstream CPI dislocation metrics.
                  </p>
                </article>
                <article className="cme-overview-card">
                  <div className="cme-overview-card-title">Why shadow, not a third governed source yet</div>
                  <p className="cme-overview-card-body">
                    CME goes through the same eligibility gate as Kalshi and
                    ForecastEx (coverage, consistency, calibration, history)
                    before it can be promoted. The shadow blend lets us watch
                    CME alongside the governed blend without changing the
                    published Oriel CPI Reference.
                  </p>
                </article>
                <article className="cme-overview-card">
                  <div className="cme-overview-card-title">Role label flows through the data layer</div>
                  <p className="cme-overview-card-body">
                    Source status carries the <code>PROXY</code> label end-to-end
                    through client, contract, constituent, and
                    methodology_note fields so any downstream UI never
                    confuses the interim proxy with a licensed feed.
                  </p>
                </article>
              </div>

              <div className="cme-overview-section-head">Eligibility gates (current status)</div>
              <div className="cme-gates-grid">
                {promotionGates.map((g) => (
                  <article key={g.key} className={`cme-gate-card cme-gate-${g.status}`}>
                    <header className="cme-gate-head">
                      <span className={`cme-gate-dot cme-gate-dot-${g.status}`} aria-hidden="true" />
                      <span className="cme-gate-label">{g.label}</span>
                      <span className={`cme-gate-pill cme-gate-pill-${g.status}`}>
                        {g.status === 'cleared' ? 'Cleared' : g.status === 'partial' ? 'Partial' : 'Pending'}
                      </span>
                    </header>
                    <p className="cme-gate-detail">{g.detail}</p>
                  </article>
                ))}
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

          {/* ─────────────────────────  Ladder tab  ───────────────────────── */}
          {tab === 'ladder' && (
            (points.length > 0 || contracts.length > 0) ? (
              <section className="cme-ladder-panel">
                <p className="cme-tab-lede">
                  Per-maturity curve points and the raw contract ladder
                  underneath. Curve points are the threshold-event quotes the
                  scoring pipeline reads; contracts are the raw venue rows
                  before scoring. Each row carries the <code>PROXY</code>
                  source-status tag so downstream consumers can filter.
                </p>

                <div className="cme-ladder-diag-strip">
                  <DiagCell label="Avg Probability" value={fmt4(ladderStats.avgProb)} accent="warning" mono />
                  <DiagCell label="Avg Liquidity"   value={fmtPct(ladderStats.avgLiq)} accent="default" />
                  <DiagCell label="Total Volume"    value={ladderStats.totalVol.toLocaleString()} accent="default" mono />
                  <DiagCell label="Total Open Interest" value={ladderStats.totalOi.toLocaleString()} accent="default" mono />
                </div>

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
                            <th>Publishable</th>
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
                              <td className="num">{Number(p.volume || 0).toLocaleString()}</td>
                              <td className="num">{Number(p.openInterest || 0).toLocaleString()}</td>
                              <td>
                                <span className={`cme-pub-pill ${p.publishable ? 'ok' : 'no'}`}>
                                  {p.publishable ? 'Yes' : 'No'}
                                </span>
                              </td>
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
                            <th className="num">Bid</th>
                            <th className="num">Mid</th>
                            <th className="num">Ask</th>
                            <th className="num">EV</th>
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
                              <td className="num">{fmt4(c.bid)}</td>
                              <td className="num gold">{fmt4(c.mid)}</td>
                              <td className="num">{fmt4(c.ask)}</td>
                              <td className="num">{fmt4(c.expectedValue)}</td>
                              <td className="num">{Number(c.volume || 0).toLocaleString()}</td>
                              <td className="num">{Number(c.openInterest || 0).toLocaleString()}</td>
                              <td>{c.settlementSource || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </section>
            ) : <EmptyPanel label="No CME ladder data available." />
          )}

          {/* ───────────────────  Methodology & Promotion tab  ─────────────── */}
          {tab === 'methodology' && (
            <section className="cme-methodology-panel">
              <p className="cme-tab-lede">
                How the proxy is sourced and scored today, and the steps
                between today's shadow surface and a governed constituent
                role tomorrow. The same eligibility logic that gated Kalshi
                and ForecastEx applies here, run unchanged.
              </p>

              {methodology.length > 0 && (
                <section className="cme-methodology">
                  <div className="cme-methodology-head">Methodology metadata</div>
                  <dl className="cme-methodology-grid">
                    {methodology.map((row, i) => (
                      <div key={i} className="cme-methodology-row">
                        <dt>{row.key}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              <div className="cme-promo-section">
                <div className="cme-promo-head">Promotion path · proxy → shadow → governed</div>
                <ol className="cme-promo-steps">
                  {promotionSteps.map((s) => (
                    <li key={s.n} className="cme-promo-step">
                      <div className="cme-promo-step-num">{s.n}</div>
                      <div className="cme-promo-step-body">
                        <div className="cme-promo-step-title">{s.title}</div>
                        <p className="cme-promo-step-text">{s.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="cme-method-cta-row">
                <button
                  type="button"
                  className="placeholder-cta primary"
                  onClick={() => onNavigate && onNavigate('perp')}
                >
                  Open shadow-blend impact in Basis Engine <Icon name="arrow-right" size={12} />
                </button>
                <span className="cme-disclaimer">
                  Methodology version <code>{cme.methodology || '—'}</code> ·
                  PROXY label flows end-to-end · not yet governed-live.
                </span>
              </div>
            </section>
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

  function DiagCell({ label, value, accent, mono }) {
    return (
      <div className={`cme-diag-cell accent-${accent || 'default'}`}>
        <div className="cme-diag-label">{label}</div>
        <div className={`cme-diag-value${mono ? ' mono' : ''}`}>{value}</div>
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

  function formatTimestamp(iso) {
    if (!iso) return 'n/a';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm} UTC`;
    } catch {
      return iso;
    }
  }

  window.App = window.App || {};
  window.App.CmeView = CmeView;
})();
