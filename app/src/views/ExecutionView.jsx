/* ==========================================================================
   ExecutionView.jsx — Renders the Execution Workbench tab against the
   summary payload (`window.__EXECUTION__`) produced by execution_data.py.

   Layout follows the same sticky-head + DetailTabBar + body pattern as the
   rest of the Redesign tabs (Kalshi / FX / Polymarket / Basis Engine /
   Validation / Healthcare): hero + regime banner stay pinned at the top
   for context, then a sub-tab bar splits the workbench into focused panes:

       Risk Posture     — Posture multipliers + Regime Comparison cards
                          (Ksenia §10 "compare same dislocation under
                          Low / Moderate / Elevated")
       Dislocations     — Dislocation Strip (6 metrics) + Cross-Venue
                          Contribution table + Oriel Decision strip
       ScaleTrader      — Illustrative ladder ticket card (v7
                          _render_scaletrader_card mirror)
       TRS Deployment   — Representative Backtest Summary + Pilot
                          Deployment Economics + Components + Scenario
                          Comparison (v7 PR #18 mirror)
       Methodology      — Disclaimers + handoff CTAs + how-this-works

   Mirrors v7's apps/market_sim/falconx_sim_tab sections Chris asked to
   make obvious; the full interactive simulator (sliders, parameter
   sweep, heatmap) still lives in the standalone apps/market_sim until
   the React port lands.

   Registers window.App.ExecutionView.
   ========================================================================== */
(() => {
  'use strict';
  const { useState } = React;
  const { cn } = window.App.utils;
  const { Icon, Badge } = window.App;

  const REGIME_TONE = {
    Low:      'success',
    Moderate: 'info',
    Elevated: 'warning',
  };

  const SUB_TABS = [
    { key: 'posture',      label: 'Risk Posture',     icon: 'sliders'  },
    { key: 'dislocations', label: 'Dislocations',     icon: 'activity' },
    { key: 'scaletrader',  label: 'ScaleTrader',      icon: 'layers'   },
    { key: 'trs',          label: 'TRS Deployment',   icon: 'shuffle'  },
    { key: 'methodology',  label: 'Methodology',      icon: 'book'     },
  ];

  function ExecutionView({ onNavigate }) {
    const ex = (typeof window !== 'undefined' && window.__EXECUTION__) || null;
    const [tab, setTab] = useState('posture');

    if (!ex || !ex.available) {
      const reason = ex ? ex.unavailableReason : 'Execution payload missing.';
      return (
        <div className="view detail-view execution-view">
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
    const fmtUsd = (n) => {
      if (n == null) return '—';
      const m = Number(n);
      if (Math.abs(m) >= 1e6) return `$${(m / 1e6).toFixed(2)}M`;
      if (Math.abs(m) >= 1e3) return `$${(m / 1e3).toFixed(0)}k`;
      return `$${m.toFixed(0)}`;
    };

    return (
      <div className="view detail-view execution-view">
        {/* Sticky head: compact single-line page head + regime strip +
            sub-tab bar. Methodology sub-tab carries the long-form
            explainer copy so the head stays dense and scannable like
            the rest of the Redesign tabs. */}
        <div className="detail-sticky-head">
          <div className="compact-page-head">
            <span className="compact-page-eyebrow">Execution Workbench</span>
            <span className="compact-page-divider" aria-hidden="true" />
            <span className="compact-page-title">Forward Risk Regime · Posture · Dislocations</span>
            <span className="compact-page-tag info">Decision-support only · Not routed</span>
          </div>

          <div className={`exec-regime-strip exec-regime-strip-${tone}`}>
            <span className={`exec-regime-strip-dot dot-${tone}`} aria-hidden="true" />
            <span className="exec-regime-strip-label">Forward Risk Regime</span>
            <span className={`exec-regime-strip-value tone-${tone}`}>{ex.regime}</span>
            {ex.riskScore != null && (
              <>
                <span className="exec-regime-strip-sep">·</span>
                <span className="exec-regime-strip-label">Risk score</span>
                <span className="exec-regime-strip-value">{fmtPct(ex.riskScore)}<span className="exec-regime-strip-unit">/100</span></span>
              </>
            )}
            <span className="exec-regime-strip-thresholds">Low &lt; 35 · Moderate &lt; 65 · Elevated ≥ 65</span>
          </div>

          <SubTabBar tabs={SUB_TABS} active={tab} onChange={setTab} />
        </div>

        <div className="detail-tab-body">
          {tab === 'posture' && (
            <>
              <section className="exec-posture-grid">
                <PostureCard title="Quoted spread"          unit="bp"  base={ex.baseSpreadBps}     mult={ex.spreadMultiplier}    eff={ex.effectiveSpreadBps}     tone={tone} fmt={fmtBp1} />
                <PostureCard title="Inventory limit"        unit="USD" base={ex.baseInventoryUsd}  mult={ex.inventoryMultiplier} eff={ex.effectiveInventoryUsd}  tone={tone} fmt={fmtUsd} />
                <PostureCard title="Executable edge hurdle" unit="bp"  base={ex.baseEdgeHurdleBps} mult={ex.edgeHurdleMultiplier} eff={ex.effectiveEdgeHurdleBps} tone={tone} fmt={fmtBp1} />
              </section>

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
            </>
          )}

          {tab === 'dislocations' && (
            <>
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
            </>
          )}

          {tab === 'scaletrader' && (
            ex.scaletraderTicket ? (
              <section className="exec-st-section">
                <div className={`exec-st-ribbon ${ex.scaletraderTicket.side === 'Buy YES' ? 'buy' : 'sell'}`}>
                  Illustrative ScaleTrader Ticket · {ex.scaletraderTicket.status} · <strong>{ex.scaletraderTicket.selectedVenueContract}</strong>
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
            ) : <EmptyPanel label="No ScaleTrader ticket available (no dislocations to pick from)." />
          )}

          {tab === 'trs' && (
            <>
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
                    <BtCell label="Launch Notional"    value={fmtUsd(ex.backtestSummary.launchNotionalUsd)} />
                    <BtCell label="Spread Capture PnL" value={fmtUsd(ex.backtestSummary.spreadCapturePnlUsd)} accent={ex.backtestSummary.spreadCapturePnlUsd > 0 ? 'success' : 'danger'} />
                    <BtCell label="Directional PnL"    value={fmtUsd(ex.backtestSummary.directionalPnlUsd)}   accent={ex.backtestSummary.directionalPnlUsd > 0 ? 'success' : 'danger'} />
                    <BtCell label="Total PnL"          value={fmtUsd(ex.backtestSummary.totalPnlUsd)}         accent={ex.backtestSummary.totalPnlUsd > 0 ? 'success' : 'danger'} />
                    <BtCell label="Max Inventory"      value={fmtUsd(ex.backtestSummary.maxInventoryUsd)} />
                    <BtCell label="Liquidity Score"    value={`${(ex.backtestSummary.liquiditySelfSufficiencyScore * 100).toFixed(0)}%`} />
                    <BtCell label="Stability Score"    value={`${(ex.backtestSummary.marketStabilityScore * 100).toFixed(0)}%`} />
                  </div>
                </section>
              )}

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

                  <div className="exec-trs-components">
                    <div className="exec-trs-components-head">Economic Components</div>
                    <table className="exec-trs-components-table">
                      <tbody>
                        <ComponentRow label="Spread capture PnL"          value={fmtUsd(ex.trsDeployment.spreadCapturePnlUsd)} />
                        <ComponentRow label="Directional PnL (pre-hedge)" value={fmtUsd(ex.trsDeployment.grossDirectionalPnlUsd)} />
                        <ComponentRow label="Hedge PnL"                   value={fmtUsd(ex.trsDeployment.hedgePnlUsd)} />
                        <ComponentRow label="Residual basis PnL"          value={fmtUsd(ex.trsDeployment.residualBasisPnlUsd)} />
                        <ComponentRow label="Financing cost"              value={`-${fmtUsd(ex.trsDeployment.financingCostUsd)}`} />
                        <ComponentRow label="Collateral yield"            value={`+${fmtUsd(ex.trsDeployment.collateralYieldUsd)}`} />
                        <ComponentRow label="Stress drawdown proxy"       value={fmtUsd(ex.trsDeployment.stressDrawdownProxyUsd)} muted />
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
            </>
          )}

          {tab === 'methodology' && (
            <section className="exec-method-panel">
              <div className="exec-method-card">
                <div className="exec-method-card-title">How the regime is derived</div>
                <p className="exec-method-card-body">
                  Forward Risk Regime comes from the same v7
                  <code> analytics.forward_risk_engine.build_forward_risk_summary </code>
                  the standalone simulator uses. Inputs are: forward curve
                  (Oriel reference per release month), implied-vol proxy
                  (per-maturity cross-venue dispersion of implied YoY), and
                  per-row dislocations from the venue stack. Score thresholds
                  Low &lt; 35, Moderate &lt; 65, Elevated ≥ 65.
                </p>
              </div>
              <div className="exec-method-card">
                <div className="exec-method-card-title">How the multipliers cascade</div>
                <p className="exec-method-card-body">
                  Regime → <code>RiskRegimeAdjustment</code> →
                  spread / inventory / edge-hurdle multipliers applied to
                  the base config (12 bp spread / $5M inventory limit /
                  10 bp edge hurdle). Same table v7
                  <code> oriel/sim/risk.py </code> ships:
                  Low (0.85 / 1.15 / 0.85), Moderate (1.00 neutral),
                  Elevated (1.35 / 0.65 / 1.50).
                </p>
              </div>
              <div className="exec-method-card">
                <div className="exec-method-card-title">How the TRS scenario is sized</div>
                <p className="exec-method-card-body">
                  Pilot deployment uses a representative backtest summary
                  ($3M launch notional, $24k spread capture, -$6k directional,
                  $18k total PnL, $850k max inventory) fed through
                  <code> trs_deployment.build_trs_deployment_scenario </code>
                  with default inputs (2× notional, 25% IM, 6% financing,
                  partial CPI perp/reference hedge at 75%). The scenario
                  comparison runs the same math at four hedge modes:
                  No TRS / Unhedged / Partial / Full.
                </p>
              </div>

              <div className="exec-method-handoff">
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
              </div>

              <p className="exec-method-disclaimer">
                Decision-support only · no live order routing is wired in ·
                illustrative scenario · not dealer pricing ·
                not legal / CSA / tax / accounting advice. Full simulator
                (interactive ScaleTrader controls, parameter sweep,
                heatmap, run_backtest) ships as the standalone Oriel
                Execution Workbench at <code>apps/market_sim/</code> until
                the React port lands.
              </p>
            </section>
          )}
        </div>
      </div>
    );
  }

  /* ───────────────────────────  Sub-tab bar  ─────────────────────────── */
  function SubTabBar({ tabs, active, onChange }) {
    return (
      <nav className="detail-tabbar" role="tablist" aria-label="Execution Workbench sections">
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

  /* ─────────────────────────────  Cells  ─────────────────────────────── */
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

  function BtCell({ label, value, accent }) {
    return (
      <div className={`exec-bt-cell accent-${accent || 'default'}`}>
        <div className="exec-bt-label">{label}</div>
        <div className="exec-bt-value">{value}</div>
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

  function EmptyPanel({ label }) {
    return (
      <section className="exec-strip-section" style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{label}</div>
      </section>
    );
  }

  window.App = window.App || {};
  window.App.ExecutionView = ExecutionView;
})();
