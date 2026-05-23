/* ==========================================================================
   CmeView.jsx — Renders the CPI · CME tab against the live CME proxy
   payload (`window.__CME__`) produced by cme_data.py.

   Layout matches every other Redesign detail tab (see IndexDetailView +
   Kalshi tab as reference):

     [sticky head: compact-page-head + KPI strip + DetailTabBar]
     [body: each sub-tab is a horizontal numbered flow OR info-row of cards]

   No streamlit-old elements: no lede paragraphs, no uppercase plain
   section heads, no flat dl/dt grids. Everything uses the shared
   MethodologySteps / info-row / info-card / .feed-pill / .idx-kpi
   primitives so the CME tab reads as the same design system as every
   other tab.

   Registers window.App.CmeView.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useMemo } = React;
  const { cn } = window.App.utils;
  const { Icon, Badge, MethodologySteps } = window.App;

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

    const publishLabel = cme.publishable ? 'Shadow eligible' : 'Not eligible';
    const fmt2 = (v) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(2));
    const fmt4 = (v) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(4));
    const fmtPct = (v) => (v == null || Number.isNaN(v) ? '—' : `${(Number(v) * 100).toFixed(0)}%`);

    const points = useMemo(() => cme.points || [], [cme.points]);
    const contracts = useMemo(() => cme.contracts || [], [cme.contracts]);
    const methodology = useMemo(() => cme.methodologyTable || [], [cme.methodologyTable]);

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

    const promotionSteps = useMemo(() => ([
      {
        title: 'Proxy feed ingested',
        body: 'CMEClient(source_mode="proxy") pulls threshold-event CPI contracts. Every row carries the PROXY source-status tag end-to-end.',
      },
      {
        title: 'Score & package',
        body: 'score_and_package collapses raw contracts into per-maturity curve points (probability + threshold + direction + liquidity).',
      },
      {
        title: 'Shadow blend impact',
        body: 'Basis Engine · Source Blend section measures what adding CME to the governed blend changes (levels, weights, dispersion, dislocation).',
      },
      {
        title: 'Eligibility gate cleared',
        body: 'Same coverage + consistency + calibration + history checks Kalshi and ForecastEx passed. Failure on any gate keeps CME in shadow mode.',
      },
      {
        title: 'Governance promotion',
        body: 'Constituent registry updated, governed blend re-weighted, CPI Reference now includes CME. Role flips Candidate → Constituent.',
      },
    ]), []);

    // Eligibility gates as a numbered horizontal flow (matches the
    // MethodologySteps visual language). Each step's status drives a tone
    // class on the number circle.
    const gates = useMemo(() => ([
      {
        title: 'Licensed feed',
        body: cme.sourceStatus === 'PROXY'
          ? 'Interim proxy in use, licensed feed pending.'
          : `Source status: ${cme.sourceStatus}.`,
        status: cme.sourceStatus === 'PROXY' ? 'pending' : 'cleared',
      },
      {
        title: 'Maturity coverage',
        body: `${cme.maturityCount} release ${cme.maturityCount === 1 ? 'month' : 'months'} covered across the curve.`,
        status: cme.maturityCount >= 3 ? 'cleared' : 'partial',
      },
      {
        title: 'Liquidity depth',
        body: ladderStats.totalOi > 0
          ? `${ladderStats.totalOi.toLocaleString()} contracts open, avg liquidity ${fmtPct(ladderStats.avgLiq)}.`
          : 'No open interest yet — quote depth gate pending.',
        status: ladderStats.totalOi > 0 ? 'cleared' : 'pending',
      },
      {
        title: 'Shadow eligibility',
        body: cme.publishabilityReason || (cme.publishable
          ? 'Eligible for shadow blend; governed promotion still requires the licensed feed.'
          : 'Not yet eligible for shadow blend.'),
        status: cme.publishable ? 'cleared' : 'pending',
      },
    ]), [cme.sourceStatus, cme.maturityCount, cme.publishable, cme.publishabilityReason, ladderStats.totalOi, ladderStats.avgLiq]);

    return (
      <div className="view detail-view cme-view">
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
            <KpiCell label="Publishability" value={publishLabel}                 accent={cme.publishable ? 'success' : 'warning'} />
            <KpiCell label="Role"           value="Candidate"                    accent="default" sub="not governed-live" />
          </div>

          <SubTabBar tabs={SUB_TABS} active={tab} onChange={setTab} />
        </div>

        <div className="detail-tab-body">
          {/* ─────────────────────────  Status & Eligibility  ─────────────── */}
          {tab === 'overview' && (
            <>
              <CmeStepFlow
                eyebrow="Eligibility"
                title="Where CME stands against the gate"
                steps={gates}
              />

              <div className="info-row cols-3">
                <CmeRoleCard cme={cme} fmtPct={fmtPct} ladderStats={ladderStats} />
                <CmeShadowCard cme={cme} />
                <CmeLabelCard cme={cme} />
              </div>

              <CmeOverviewHandoff onNavigate={onNavigate} />
            </>
          )}

          {/* ─────────────────────────  Curve & Ladder  ────────────────────── */}
          {tab === 'ladder' && (
            (points.length > 0 || contracts.length > 0) ? (
              <>
                <section className="cme-stats-card">
                  <header className="info-card-head">
                    <span className="info-card-eyebrow">Ladder summary</span>
                    <Badge variant="accent">{points.length} curve points · {contracts.length} contracts</Badge>
                  </header>
                  <div className="info-stats-grid">
                    <Stat label="Avg probability"      value={fmt4(ladderStats.avgProb)} />
                    <Stat label="Avg liquidity score"  value={fmtPct(ladderStats.avgLiq)} muted />
                    <Stat label="Total volume"         value={ladderStats.totalVol.toLocaleString()} muted />
                    <Stat label="Total open interest"  value={ladderStats.totalOi.toLocaleString()} />
                  </div>
                </section>

                {points.length > 0 && (
                  <section className="cme-table-section">
                    <header className="info-card-head">
                      <span className="info-card-eyebrow">Curve points · per maturity</span>
                      <Badge variant="default">{points.length} rows</Badge>
                    </header>
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
                            <th>Source</th>
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
                    <header className="info-card-head">
                      <span className="info-card-eyebrow">Contracts · raw CME proxy ladder</span>
                      <Badge variant="default">{contracts.length} rows</Badge>
                    </header>
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
              </>
            ) : <EmptyPanel label="No CME ladder data available." />
          )}

          {/* ───────────────────  Methodology & Promotion  ─────────────────── */}
          {tab === 'methodology' && (
            <div className="methodology-panel">
              {MethodologySteps && (
                <MethodologySteps
                  steps={promotionSteps}
                  accent="accent"
                />
              )}

              <div className="info-row cols-3">
                <CmeStatusCard cme={cme} />
                <CmeMethodologyKvCard methodology={methodology} cme={cme} />
                <CmeFeedCard cme={cme} ladderStats={ladderStats} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─────────────────────────  Overview cards  ───────────────────────── */
  function CmeRoleCard({ cme, fmtPct, ladderStats }) {
    return (
      <section className="info-card">
        <header className="info-card-head">
          <span className="info-card-eyebrow">Role</span>
          <span className="feed-pill feed-pill-warning">
            <span className="feed-dot feed-warn" />
            Candidate
          </span>
        </header>
        <div className="info-kv-list">
          <Kv label="Source status"   value={cme.sourceStatus} />
          <Kv label="Venue"           value={cme.venue || 'CME'} />
          <Kv label="Contracts"       value={String(cme.contractCount)} />
          <Kv label="Curve points"    value={String(cme.curvePointCount)} />
          <Kv label="Maturities"      value={String(cme.maturityCount)} />
          <Kv label="Avg liquidity"   value={fmtPct(ladderStats.avgLiq)} />
        </div>
      </section>
    );
  }

  function CmeShadowCard({ cme }) {
    return (
      <section className="info-card">
        <header className="info-card-head">
          <span className="info-card-eyebrow">Shadow blend impact</span>
          <Badge variant={cme.publishable ? 'success' : 'warning'}>
            {cme.publishable ? 'Eligible' : 'Pending'}
          </Badge>
        </header>
        <p className="info-card-body">
          The Source Blend &amp; Shadow Impact section on the CPI Basis Engine
          tab quantifies what adding CME to the governed blend changes:
          per-maturity curve levels, source weights, dispersion, and the
          downstream CPI dislocation metrics.
        </p>
        <p className="info-card-body muted">
          CME stays a shadow surface until the governed eligibility gate
          (coverage · consistency · calibration · history) is cleared.
        </p>
      </section>
    );
  }

  function CmeLabelCard({ cme }) {
    return (
      <section className="info-card">
        <header className="info-card-head">
          <span className="info-card-eyebrow">Source label propagation</span>
          <Badge variant="default">end-to-end</Badge>
        </header>
        <div className="info-kv-list">
          <Kv label="Client"          value="CMEClient(source_mode=&quot;proxy&quot;)" mono />
          <Kv label="Contract field"  value="source_status=PROXY" mono />
          <Kv label="Constituent"     value="role=candidate" mono />
          <Kv label="Methodology"     value={cme.methodology || '—'} mono />
        </div>
        <p className="info-card-body muted">
          The PROXY tag rides every contract, curve point, and constituent
          row so downstream consumers never confuse the interim proxy with
          a licensed feed.
        </p>
      </section>
    );
  }

  function CmeOverviewHandoff({ onNavigate }) {
    return (
      <section className="cme-handoff-row">
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
        <span className="cme-handoff-note">
          Not promoted into the governed blend. Not claiming licensed CME
          market-data readiness.
        </span>
      </section>
    );
  }

  /* ──────────────────  Methodology-tab footer cards  ───────────────── */
  function CmeStatusCard({ cme }) {
    return (
      <section className="info-card">
        <header className="info-card-head">
          <span className="info-card-eyebrow">Source &amp; status</span>
          <Badge variant="warning">Proxy</Badge>
        </header>
        <div className="info-kv-list">
          <Kv label="Source mode"      value="proxy" mono />
          <Kv label="Role"             value="Shadow constituent candidate" />
          <Kv label="Venue"            value={cme.venue || 'CME'} />
          <Kv label="Contracts"        value={String(cme.contractCount)} />
          <Kv label="Curve points"     value={String(cme.curvePointCount)} />
          <Kv label="Maturities"       value={String(cme.maturityCount)} />
        </div>
      </section>
    );
  }

  function CmeMethodologyKvCard({ methodology, cme }) {
    return (
      <section className="info-card">
        <header className="info-card-head">
          <span className="info-card-eyebrow">Methodology</span>
          <Badge variant="accent">{cme.methodology || 'n/a'}</Badge>
        </header>
        <div className="info-kv-list">
          {methodology.map((row, i) => (
            <Kv key={i} label={row.key} value={row.value} mono={row.key === 'Methodology' || row.key === 'Source mode'} />
          ))}
        </div>
      </section>
    );
  }

  function CmeFeedCard({ cme, ladderStats }) {
    const isPending = cme.sourceStatus === 'PROXY';
    return (
      <section className="info-card">
        <header className="info-card-head">
          <span className="info-card-eyebrow">Live feed status</span>
          <span className={`feed-pill ${isPending ? 'feed-pill-warning' : 'feed-pill-success'}`}>
            <span className={`feed-dot ${isPending ? 'feed-warn' : 'feed-live'}`} />
            {isPending ? 'Proxy' : 'Live'}
          </span>
        </header>
        <div className="info-kv-list">
          <Kv label="Source status"        value={cme.sourceStatus} />
          <Kv label="Publishable"          value={cme.publishable ? 'Shadow eligible' : 'Not eligible'} />
          <Kv label="Valuation snapshot"   value={formatTimestamp(cme.valuationTimestamp)} mono />
          <Kv label="Avg liquidity"        value={`${(Number(ladderStats.avgLiq) * 100).toFixed(0)}%`} />
          <Kv label="Total volume"         value={ladderStats.totalVol.toLocaleString()} mono />
          <Kv label="Total open interest"  value={ladderStats.totalOi.toLocaleString()} mono />
        </div>
      </section>
    );
  }

  /* ────────────────  Numbered horizontal step flow  ────────────────── */
  // Matches MethodologySteps visual language but supports per-step tone
  // (cleared / partial / pending) so the eligibility gates can render in
  // the same horizontal-flow layout the rest of the app uses.
  function CmeStepFlow({ eyebrow, title, steps }) {
    return (
      <section className="method-steps cme-step-flow">
        <div className="method-steps-head">
          <div className="method-steps-eyebrow">{eyebrow}</div>
          <div className="method-steps-title">{title}</div>
        </div>
        <ol className="method-steps-list">
          {steps.map((s, i) => (
            <li key={i} className={`method-step cme-step-${s.status}`}>
              <div className={`method-step-num cme-step-num-${s.status}`}>{i + 1}</div>
              <div className="method-step-body">
                <div className="method-step-title">{s.title}</div>
                <div className="method-step-text">{s.body}</div>
              </div>
              {i < steps.length - 1 && (
                <div className="method-step-connector" aria-hidden="true">
                  <Icon name="chevron-right" size={14} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  /* ───────────────────────────  Sub-tab bar  ─────────────────────────── */
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

  /* ───────────────────────────  Cells  ───────────────────────────── */
  function KpiCell({ label, value, accent, sub }) {
    return (
      <div className={`cme-kpi-cell accent-${accent || 'default'}`}>
        <div className="cme-kpi-label">{label}</div>
        <div className="cme-kpi-value">{value}</div>
        {sub && <div className="cme-kpi-sub">{sub}</div>}
      </div>
    );
  }

  function Stat({ label, value, muted }) {
    return (
      <div className="info-stat">
        <div className="info-stat-label">{label}</div>
        <div className={cn('info-stat-value', 'font-mono', muted && 'muted')}>{value}</div>
      </div>
    );
  }

  function Kv({ label, value, mono }) {
    return (
      <div className="info-kv-row">
        <span className="info-kv-key">{label}</span>
        <span className={cn('info-kv-value', mono && 'font-mono')} dangerouslySetInnerHTML={{ __html: value }} />
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
