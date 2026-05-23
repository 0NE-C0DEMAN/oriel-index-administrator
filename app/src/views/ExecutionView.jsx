/* ==========================================================================
   ExecutionView.jsx — Renders the Execution Workbench tab against the
   summary payload (`window.__EXECUTION__`) produced by execution_data.py.

   Mirrors the v7 falconx_sim_tab sections Chris asked to make obvious:

       Forward Risk Regime banner    (Low / Moderate / Elevated + explainer)
       Risk score (0-100)            (regime thresholds 35 / 65)
       3 posture cards               (base . xmultiplier . effective)
                                       - quoted spread bp
                                       - inventory limit USD
                                       - executable edge hurdle bp
       CPI Dislocation Strip         (avg / median / max / net edge / venues / maturities)
       Oriel Decision strip          (preferred side / venue / Oriel ref / best
                                      price / net edge / rationale — PR #19)
       TRS Pilot Deployment KPIs     (7 cells: fund capital, TRS notional,
                                      required margin, net PnL, ROC, capital
                                      efficiency, hedge ratio — PR #18)
       TRS Scenario Comparison       (4 rows: No TRS / Unhedged / Partial / Full)
       Handoff CTAs                  (back to Basis Engine, open standalone sim)

   The full v7 simulator (interactive ScaleTrader ticket, parameter sweep,
   heatmap, backtest controls) stays in `apps/market_sim/`. This view is the
   React-side readout of the same data so the audience sees real numbers,
   not just buttons.

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

        {/* Regime Comparison — Ksenia §10 "compare same dislocation under
            Low / Moderate / Elevated" ask. Shows all three regimes side by
            side with each regime's multipliers + effective values. The
            current regime is highlighted so the audience sees how posture
            shifts as the regime moves. */}
        {ex.regimeComparison && ex.regimeComparison.length > 0 && (
          <section className="exec-rc-section">
            <div className="exec-rc-head">
              Regime Comparison · same dislocation under each regime · current → {ex.regime}
            </div>
            <div className="exec-rc-grid">
              {ex.regimeComparison.map((row) => (
                <article
                  key={row.regime}
                  className={`exec-rc-card${row.isCurrent ? ' current' : ''} exec-rc-${REGIME_TONE[row.regime] || 'info'}`}
                >
                  <header className="exec-rc-card-head">
                    <span className="exec-rc-card-name">{row.regime}</span>
                    {row.isCurrent && <span className="exec-rc-card-pill">Current</span>}
                  </header>
                  <div className="exec-rc-card-row">
                    <span className="exec-rc-card-mini">Quoted spread</span>
                    <span className="exec-rc-card-num">×{Number(row.spreadMultiplier).toFixed(2)} → {fmtBp1(row.effectiveSpreadBps)}</span>
                  </div>
                  <div className="exec-rc-card-row">
                    <span className="exec-rc-card-mini">Inventory limit</span>
                    <span className="exec-rc-card-num">×{Number(row.inventoryMultiplier).toFixed(2)} → {fmtUsd(row.effectiveInventoryUsd)}</span>
                  </div>
                  <div className="exec-rc-card-row">
                    <span className="exec-rc-card-mini">Edge hurdle</span>
                    <span className="exec-rc-card-num">×{Number(row.edgeHurdleMultiplier).toFixed(2)} → {fmtBp1(row.effectiveEdgeHurdleBps)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Cross-Venue Contribution — per-(release_month, venue) weight
            contribution to the Oriel reference. Mirrors v7's
            compute_venue_contribution_summary table. Weight =
            0.6 * confidence + 0.4 * liquidity, normalized within each
            maturity so venues sum to 100%. Helps the audience see
            which venue is driving the reference at each maturity. */}
        {ex.venueContribution && ex.venueContribution.length > 0 && (
          <section className="exec-vc-section">
            <div className="exec-vc-head">
              Cross-Venue Contribution · how each venue weights into the Oriel Reference
            </div>
            <div className="exec-vc-scroll">
              <table className="exec-vc-table">
                <thead>
                  <tr>
                    <th>Release Month</th>
                    <th>Venue</th>
                    <th className="num">Implied YoY</th>
                    <th className="num">Oriel Reference</th>
                    <th className="num">Weight %</th>
                    <th className="num">Liquidity</th>
                    <th className="num">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {ex.venueContribution.map((row, i) => (
                    <tr key={i}>
                      <td>{row.releaseMonth}</td>
                      <td>{row.venue}</td>
                      <td className="num">{row.impliedYoy != null ? Number(row.impliedYoy).toFixed(4) : '—'}</td>
                      <td className="num">{row.orielReferenceYoy != null ? Number(row.orielReferenceYoy).toFixed(4) : '—'}</td>
                      <td className="num gold">{row.weightPct != null ? `${Number(row.weightPct).toFixed(1)}%` : '—'}</td>
                      <td className="num">{`${(Number(row.liquidityScore) * 100).toFixed(0)}%`}</td>
                      <td className="num">{`${(Number(row.confidenceScore) * 100).toFixed(0)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Oriel Decision — picks the top-edge dislocation row.
            Mirrors v7's PR #19 "Oriel Decision · trade-worth-doing
            chain · not routed" KPI strip. */}
        {ex.orielDecision && (
          <section className="exec-decision-section">
            <div className="exec-decision-ribbon">
              Oriel Decision · trade-worth-doing chain · {ex.orielDecision.status}
            </div>
            <div className="exec-decision-grid">
              <DecisionCell label="Preferred Side"      value={ex.orielDecision.preferredSide} accent="gold" sub={`Status: ${ex.orielDecision.status}`} />
              <DecisionCell label="Preferred Venue"     value={ex.orielDecision.preferredVenue} />
              <DecisionCell label="Maturity"            value={ex.orielDecision.preferredMaturity} />
              <DecisionCell label="Oriel Reference"     value={`${Number(ex.orielDecision.orielReferenceYoy).toFixed(4)}`} suffix="% YoY" />
              <DecisionCell label="Best Displayed"      value={`${Number(ex.orielDecision.bestDisplayedYoy).toFixed(4)}`} suffix="% YoY" />
              <DecisionCell label="Net Executable Edge" value={fmtBp1(ex.orielDecision.netExecutableEdgeBps)} accent={ex.orielDecision.netExecutableEdgeBps > 0 ? 'success' : 'muted'} />
              <DecisionCell label="Rationale"           value={ex.orielDecision.rationale} small />
            </div>
          </section>
        )}

        {/* Representative backtest summary that drives the TRS scenario
            math. Surfaced explicitly so reviewers can see where the
            illustrative numbers come from — same fields v7
            run_backtest produces (launch notional, spread/directional/
            total PnL, max inventory, liquidity / market-stability
            scores). */}
        {ex.backtestSummary && (
          <section className="exec-bt-section">
            <div className="exec-bt-head">
              Representative backtest summary · drives the TRS scenario below
              <span className="exec-bt-head-sub">
                · 30-day simulator run · spread {Number(ex.baseSpreadBps).toFixed(0)}bp · launch ${(ex.backtestSummary.launchNotionalUsd / 1e6).toFixed(1)}M ·
                regime {ex.regime}
              </span>
            </div>
            <div className="exec-bt-grid">
              <BtCell label="Launch Notional"   value={fmtUsd(ex.backtestSummary.launchNotionalUsd)} />
              <BtCell label="Spread Capture PnL" value={fmtUsd(ex.backtestSummary.spreadCapturePnlUsd)} accent={ex.backtestSummary.spreadCapturePnlUsd > 0 ? 'success' : 'danger'} />
              <BtCell label="Directional PnL"   value={fmtUsd(ex.backtestSummary.directionalPnlUsd)}   accent={ex.backtestSummary.directionalPnlUsd > 0 ? 'success' : 'danger'} />
              <BtCell label="Total PnL"         value={fmtUsd(ex.backtestSummary.totalPnlUsd)}         accent={ex.backtestSummary.totalPnlUsd > 0 ? 'success' : 'danger'} />
              <BtCell label="Max Inventory"     value={fmtUsd(ex.backtestSummary.maxInventoryUsd)} />
              <BtCell label="Liquidity Score"   value={`${(ex.backtestSummary.liquiditySelfSufficiencyScore * 100).toFixed(0)}%`} />
              <BtCell label="Stability Score"   value={`${(ex.backtestSummary.marketStabilityScore * 100).toFixed(0)}%`} />
            </div>
          </section>
        )}

        {/* TRS Pilot Deployment Economics — illustrative 30-day scenario
            from v7 trs_deployment.py. */}
        {ex.trsDeployment && (
          <section className="exec-trs-section">
            <div className="exec-trs-ribbon">
              PILOT DEPLOYMENT ECONOMICS · illustrative 30-day TRS scenario · not dealer pricing
            </div>
            <div className="exec-trs-kpi-grid">
              <TrsKpiCell label="Fund Capital"      value={fmtUsd(ex.trsDeployment.fundCapitalUsd)} />
              <TrsKpiCell label="TRS Notional"      value={fmtUsd(ex.trsDeployment.trsNotionalUsd)}     sub={`×${Number(ex.trsInputs.trsNotionalMultiple).toFixed(1)} multiple`} />
              <TrsKpiCell label="Required Margin"   value={fmtUsd(ex.trsDeployment.requiredMarginUsd)}  sub={`${(ex.trsInputs.initialMarginPct * 100).toFixed(1)}% IM`} />
              <TrsKpiCell label="Net Fund PnL"      value={fmtUsd(ex.trsDeployment.netFundPnlUsd)}      accent={ex.trsDeployment.netFundPnlUsd > 0 ? 'success' : 'danger'} />
              <TrsKpiCell label="Return on Capital" value={`${Number(ex.trsDeployment.returnOnCapitalPct).toFixed(2)}%`} accent={ex.trsDeployment.returnOnCapitalPct > 0 ? 'success' : 'danger'} sub="30-day horizon" />
              <TrsKpiCell label="Capital Efficiency" value={`${Number(ex.trsDeployment.capitalEfficiencyRatio).toFixed(2)}x`} sub="notional / margin" />
              <TrsKpiCell label="Hedge Ratio"       value={`${(ex.trsDeployment.hedgeRatio * 100).toFixed(0)}%`} sub={ex.trsInputs.hedgeMode} />
            </div>

            {/* Economic component breakdown */}
            <div className="exec-trs-components">
              <div className="exec-trs-components-head">Economic Components</div>
              <table className="exec-trs-components-table">
                <tbody>
                  <ComponentRow label="Spread capture PnL"      value={fmtUsd(ex.trsDeployment.spreadCapturePnlUsd)} />
                  <ComponentRow label="Directional PnL (pre-hedge)" value={fmtUsd(ex.trsDeployment.grossDirectionalPnlUsd)} />
                  <ComponentRow label="Hedge PnL"               value={fmtUsd(ex.trsDeployment.hedgePnlUsd)} />
                  <ComponentRow label="Residual basis PnL"      value={fmtUsd(ex.trsDeployment.residualBasisPnlUsd)} />
                  <ComponentRow label="Financing cost"          value={`-${fmtUsd(ex.trsDeployment.financingCostUsd)}`} />
                  <ComponentRow label="Collateral yield"        value={`+${fmtUsd(ex.trsDeployment.collateralYieldUsd)}`} />
                  <ComponentRow label="Stress drawdown proxy"   value={fmtUsd(ex.trsDeployment.stressDrawdownProxyUsd)} muted />
                </tbody>
              </table>
            </div>

            {ex.trsDeployment.warnings && ex.trsDeployment.warnings.length > 0 && (
              <ul className="exec-trs-warnings">
                {ex.trsDeployment.warnings.map((w, i) => (
                  <li key={i}><Icon name="info" size={11} /> {w}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Illustrative ScaleTrader Ticket — Not Routed.
            Mirrors v7's _render_scaletrader_card output: a ladder
            ticket derived from the top-edge dislocation, with side,
            start price, increment, levels, clip, max exposure,
            profit-taker offset, Oriel reference, contract market
            price, liquidity/confidence, disable conditions. */}
        {ex.scaletraderTicket && (
          <section className="exec-st-section">
            <div className={`exec-st-ribbon ${ex.scaletraderTicket.side === 'Buy YES' ? 'buy' : 'sell'}`}>
              Illustrative ScaleTrader Ticket · {ex.scaletraderTicket.status} · {ex.scaletraderTicket.selectedVenueContract}
            </div>
            <div className="exec-st-kpi-grid">
              <StKpiCell label="Side"          value={ex.scaletraderTicket.side}                                              accent={ex.scaletraderTicket.side === 'Buy YES' ? 'success' : 'danger'} />
              <StKpiCell label="Start Price"   value={`$${Number(ex.scaletraderTicket.startPrice).toFixed(2)}`} />
              <StKpiCell label="Increment"     value={`$${Number(ex.scaletraderTicket.increment).toFixed(2)}`} />
              <StKpiCell label="Levels"        value={String(ex.scaletraderTicket.levels)} />
              <StKpiCell label="Clip Size"     value={ex.scaletraderTicket.clipSize.toLocaleString()} />
              <StKpiCell label="Max Exposure"  value={ex.scaletraderTicket.maxExposure.toLocaleString()} />
              <StKpiCell label="Profit-Taker"  value={`${ex.scaletraderTicket.profitTakerOffset >= 0 ? '+' : '−'}$${Math.abs(ex.scaletraderTicket.profitTakerOffset).toFixed(2)}`} />
              <StKpiCell label="Oriel Edge"    value={`${Number(ex.scaletraderTicket.edgeProbabilityPoints).toFixed(2)}`} suffix="pp" />
            </div>
            <div className="exec-st-detail-row">
              <div className="exec-st-detail-card">
                <div className="exec-st-detail-label">Oriel Reference</div>
                <div className="exec-st-detail-value">
                  {Number(ex.scaletraderTicket.orielFairValueYoy).toFixed(4)}
                  <span className="exec-st-detail-unit">% YoY</span>
                </div>
              </div>
              <div className="exec-st-detail-card">
                <div className="exec-st-detail-label">Contract Market Price</div>
                <div className="exec-st-detail-value">${Number(ex.scaletraderTicket.contractMarketPrice).toFixed(2)}</div>
              </div>
              <div className="exec-st-detail-card">
                <div className="exec-st-detail-label">Liquidity / Confidence</div>
                <div className="exec-st-detail-value">
                  {(Number(ex.scaletraderTicket.liquidityScore) * 100).toFixed(0)}%
                  <span className="exec-st-detail-sep"> / </span>
                  {(Number(ex.scaletraderTicket.confidenceScore) * 100).toFixed(0)}%
                </div>
              </div>
            </div>
            <div className="exec-st-disable">
              <div className="exec-st-disable-label">Disable Conditions</div>
              <div className="exec-st-disable-text">{ex.scaletraderTicket.disableConditions}</div>
            </div>
          </section>
        )}

        {/* TRS Scenario Comparison — 4 rows mirroring v7's
            build_trs_scenario_comparison output. */}
        {ex.trsComparison && ex.trsComparison.length > 0 && (
          <section className="exec-trs-compare-section">
            <div className="exec-trs-compare-head">TRS Scenario Comparison · No TRS / Unhedged / Partial / Full hedge</div>
            <div className="exec-trs-compare-scroll">
              <table className="exec-trs-compare-table">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th className="num">TRS Notional</th>
                    <th className="num">Required Margin</th>
                    <th className="num">Gross Exposure</th>
                    <th className="num">Net Exposure</th>
                    <th className="num">Net PnL</th>
                    <th className="num">ROC %</th>
                    <th className="num">Residual Basis Risk</th>
                    <th className="num">Capital Eff.</th>
                  </tr>
                </thead>
                <tbody>
                  {ex.trsComparison.map((row, i) => (
                    <tr key={i}>
                      <td>{row.scenario}</td>
                      <td className="num">{fmtUsd(row.trsNotionalUsd)}</td>
                      <td className="num">{fmtUsd(row.requiredMarginUsd)}</td>
                      <td className="num">{fmtUsd(row.grossExposureUsd)}</td>
                      <td className="num">{fmtUsd(row.netExposureAfterHedgeUsd)}</td>
                      <td className={`num ${row.netPnlUsd > 0 ? 'positive' : row.netPnlUsd < 0 ? 'negative' : ''}`}>{fmtUsd(row.netPnlUsd)}</td>
                      <td className={`num ${row.returnOnCapitalPct > 0 ? 'positive' : row.returnOnCapitalPct < 0 ? 'negative' : ''}`}>{Number(row.returnOnCapitalPct).toFixed(3)}%</td>
                      <td className="num">{fmtUsd(row.residualBasisRiskUsd)}</td>
                      <td className="num">{Number(row.capitalEfficiencyRatio).toFixed(2)}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="exec-trs-compare-foot">
              Illustrative scenario · not dealer pricing · not legal / CSA / tax / accounting advice
            </div>
          </section>
        )}

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

  function DecisionCell({ label, value, suffix, accent, sub, small }) {
    return (
      <div className={`exec-decision-cell accent-${accent || 'default'}${small ? ' small' : ''}`}>
        <div className="exec-decision-label">{label}</div>
        <div className="exec-decision-value">
          {value}
          {suffix && <span className="exec-decision-suffix">{suffix}</span>}
        </div>
        {sub && <div className="exec-decision-sub">{sub}</div>}
      </div>
    );
  }

  function TrsKpiCell({ label, value, sub, accent }) {
    return (
      <div className={`exec-trs-kpi-cell accent-${accent || 'default'}`}>
        <div className="exec-trs-kpi-label">{label}</div>
        <div className="exec-trs-kpi-value">{value}</div>
        {sub && <div className="exec-trs-kpi-sub">{sub}</div>}
      </div>
    );
  }

  function ComponentRow({ label, value, muted }) {
    return (
      <tr className={muted ? 'muted' : ''}>
        <td>{label}</td>
        <td className="num">{value}</td>
      </tr>
    );
  }

  function BtCell({ label, value, accent }) {
    return (
      <div className={`exec-bt-cell accent-${accent || 'default'}`}>
        <div className="exec-bt-label">{label}</div>
        <div className="exec-bt-value">{value}</div>
      </div>
    );
  }

  function StKpiCell({ label, value, suffix, accent }) {
    return (
      <div className={`exec-st-kpi-cell accent-${accent || 'default'}`}>
        <div className="exec-st-kpi-label">{label}</div>
        <div className="exec-st-kpi-value">
          {value}
          {suffix && <span className="exec-st-kpi-suffix">{suffix}</span>}
        </div>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.ExecutionView = ExecutionView;
})();
