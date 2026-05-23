/* ==========================================================================
   CmeView.jsx — Renders the CPI · CME tab against the live CME proxy
   payload (`window.__CME__`) produced by cme_data.py. Mirrors v7's
   tabs/cme_tab.py: KPI strip (source status, contracts, curve points,
   publishability, role) + curve points table + contracts table.

   Per Ksenia's MVP-app-lock review, CME is the prospective third
   governed CPI curve constituent alongside Kalshi + ForecastEx. CPI
   Reference stays Kalshi + ForecastEx; CME is shown in interim proxy
   mode for the architectural demonstration. PROXY label flows through
   end-to-end on every cell so the audience never confuses it for a
   licensed feed.

   Registers window.App.CmeView.
   ========================================================================== */
(() => {
  'use strict';
  const { useMemo } = React;
  const { Icon, Badge } = window.App;

  function CmeView({ onNavigate }) {
    const cme = (typeof window !== 'undefined' && window.__CME__) || null;

    if (!cme) {
      return (
        <div className="view cme-view">
          <div className="placeholder-hero">
            <div className="placeholder-eyebrow">CPI · CME</div>
            <h1 className="placeholder-title">CME proxy payload unavailable</h1>
            <p className="placeholder-lede">
              The CME proxy package did not load. CPI Reference stays Kalshi
              + ForecastEx. Once the licensed CME feed is approved this tab
              will surface the real numbers.
            </p>
          </div>
        </div>
      );
    }

    const tagVariant = cme.publishable ? 'success' : 'warning';
    const publishLabel = cme.publishable ? 'Shadow eligible' : 'Not eligible';
    const fmt2 = (v) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(2));
    const fmt4 = (v) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(4));

    const points = useMemo(() => cme.points || [], [cme.points]);
    const contracts = useMemo(() => cme.contracts || [], [cme.contracts]);

    return (
      <div className="view cme-view">
        <header className="placeholder-hero">
          <div className="placeholder-eyebrow">CPI · CME</div>
          <h1 className="placeholder-title">CME CPI proxy · shadow constituent</h1>
          <div className="placeholder-tag" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge variant="warning" dot>Proxy / shadow mode</Badge>
            <Badge variant="accent" dot>Prospective governed constituent</Badge>
          </div>
          <p className="placeholder-lede">
            Interim CME CPI proxy path for reviewer demonstration. Final
            licensed-feed approval and governance promotion remain pending;
            current governed CPI Reference stays Kalshi + ForecastEx while
            CME is evaluated through shadow-blend diagnostics on the CPI
            Basis Engine.
          </p>
        </header>

        <div className="cme-kpi-strip">
          <KpiCell label="Source Status"  value={cme.sourceStatus}             accent="warning" sub="interim proxy" />
          <KpiCell label="Contracts"      value={String(cme.contractCount)}    accent="default" />
          <KpiCell label="Curve Points"   value={String(cme.curvePointCount)}  accent="default" />
          <KpiCell label="Maturities"     value={String(cme.maturityCount)}    accent="default" />
          <KpiCell label="Publishability" value={publishLabel}                 accent={tagVariant} />
          <KpiCell label="Role"           value="Candidate"                    accent="default" sub="not governed-live" />
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

        {(cme.methodologyTable || []).length > 0 && (
          <section className="cme-methodology">
            <div className="cme-methodology-head">Methodology</div>
            <dl className="cme-methodology-grid">
              {cme.methodologyTable.map((row, i) => (
                <div key={i} className="cme-methodology-row">
                  <dt>{row.key}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <div className="cme-handoff">
          <button
            type="button"
            className="placeholder-cta primary"
            onClick={() => onNavigate && onNavigate('perp')}
          >
            See CME's effect in CPI Basis Engine <Icon name="arrow-right" size={12} />
          </button>
          <span className="cme-disclaimer">
            Not promoted into the governed blend. Not claiming licensed CME
            market-data readiness.
          </span>
        </div>
      </div>
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

  window.App = window.App || {};
  window.App.CmeView = CmeView;
})();
