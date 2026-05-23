/* ==========================================================================
   ExecutionView.jsx — Renders the Execution Workbench tab against the
   summary payload (`window.__EXECUTION__`) produced by execution_data.py.

   Layout matches every other Redesign detail tab (see IndexDetailView):

     [sticky head: compact-page-head + regime strip + DetailTabBar]
     [body: each sub-tab is a series of info-cards / step flows / tables]

   No streamlit-old elements: no lede paragraphs, no uppercase plain
   section heads, no flat tables sitting outside card chrome. Section
   headers use .info-card-head with eyebrow + badge. Methodology uses
   the shared MethodologySteps component + an info-row footer with three
   info-cards (Defaults · Formulas · Status).

   Sub-tab map:
     Risk Posture     - 3 PostureCards + Regime Comparison strip + regime
                        explainer card
     Dislocations     - Dislocation Strip + Cross-Venue Contribution +
                        per-row Reference Audit + Oriel Decision
     ScaleTrader      - Ticket card + computed ladder rungs +
                        disable conditions
     TRS Deployment   - Backtest Summary + Pilot Economics + Components
                        + Scenario Comparison
     Methodology      - MethodologySteps 5-step flow + info-row cols-3

   Registers window.App.ExecutionView.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useMemo } = React;
  const { cn } = window.App.utils;
  const { Icon, Badge, MethodologySteps } = window.App;

  const REGIME_TONE = {
    Low:      'success',
    Moderate: 'info',
    Elevated: 'warning',
  };

  const REGIME_EXPLAINER = {
    Low: {
      headline: 'Tight quotes, wider inventory, lower edge floor',
      body: 'Cross-venue dispersion is contained and dislocations are small. The book quotes through tighter than baseline, carries more inventory, and accepts lower-edge trades.',
    },
    Moderate: {
      headline: 'Neutral posture against the baseline config',
      body: 'Dispersion and dislocations sit in the middle of the historical range. Posture multipliers all sit at 1.00 — the visible spread / inventory / edge hurdle match the published base config.',
    },
    Elevated: {
      headline: 'Wider quotes, shrunken inventory, higher edge floor',
      body: 'Cross-venue dispersion or dislocations are running hot. The book widens quotes, pulls back inventory, and only fills against larger residuals — protective stance, not opportunistic.',
    },
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

    const dislocationsTable = ex.dislocationsTable || [];
    const scaletraderLadder = useMemo(() => buildLadder(ex.scaletraderTicket), [ex.scaletraderTicket]);
    const explainer = REGIME_EXPLAINER[ex.regime] || REGIME_EXPLAINER.Moderate;

    const methodologySteps = useMemo(() => ([
      {
        title: 'Regime classifier reads the venue stack',
        body: 'Forward Risk Regime comes from analytics.forward_risk_engine.build_forward_risk_summary, the same module the standalone v7 simulator uses. Inputs: forward curve (Oriel reference per release month), implied-vol proxy (per-maturity cross-venue dispersion of implied YoY), and per-row dislocations. The engine emits a 0–100 risk score.',
      },
      {
        title: 'Score → regime',
        body: 'Score thresholds Low < 35, Moderate < 65, Elevated ≥ 65 classify the snapshot. The regime label then drives a RiskRegimeAdjustment with three multipliers, one per posture axis.',
      },
      {
        title: 'Posture multipliers applied',
        body: 'Spread × inventory × edge-hurdle multipliers applied to the base config (12 bp / $5M / 10 bp). Same table v7 oriel/sim/risk.py ships: Low (0.85 / 1.15 / 0.85), Moderate (1.00 neutral), Elevated (1.35 / 0.65 / 1.50).',
      },
      {
        title: 'Dislocations → ScaleTrader ticket',
        body: 'Top-edge dislocation row (by net executable edge after a 10 bp cost buffer) drives an illustrative laddered ticket: side / start price / increment / clip / max exposure / profit-taker offset. Read-only — no IBKR auth, no TWS routing, no live order submission is wired in.',
      },
      {
        title: 'Pilot TRS scenario sized',
        body: 'trs_deployment.build_trs_deployment_scenario takes a representative backtest summary ($3M launch, $24k spread capture, −$6k directional, $18k total PnL, $850k max inventory) and default inputs (2× notional, 25% IM, 6% financing, 75% partial CPI perp/reference hedge). Scenario comparison runs the same math across four hedge modes: No TRS / Unhedged / Partial / Full.',
      },
    ]), []);

    return (
      <div className="view detail-view execution-view">
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
          {/* ───────────────────────  Risk Posture tab  ────────────────────── */}
          {tab === 'posture' && (
            <>
              <section className="exec-posture-grid">
                <PostureCard title="Quoted spread"          unit="bp"  base={ex.baseSpreadBps}     mult={ex.spreadMultiplier}    eff={ex.effectiveSpreadBps}     tone={tone} fmt={fmtBp1} />
                <PostureCard title="Inventory limit"        unit="USD" base={ex.baseInventoryUsd}  mult={ex.inventoryMultiplier} eff={ex.effectiveInventoryUsd}  tone={tone} fmt={fmtUsd} />
                <PostureCard title="Executable edge hurdle" unit="bp"  base={ex.baseEdgeHurdleBps} mult={ex.edgeHurdleMultiplier} eff={ex.effectiveEdgeHurdleBps} tone={tone} fmt={fmtBp1} />
              </section>

              {ex.regimeComparison && ex.regimeComparison.length > 0 && (
                <section className="exec-rc-section">
                  <header className="info-card-head">
                    <span className="info-card-eyebrow">Regime comparison · same dislocation under each regime</span>
                    <Badge variant={tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'accent'}>
                      Current: {ex.regime}
                    </Badge>
                  </header>
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

              <section className={`exec-regime-explainer-card exec-regime-explainer-${tone}`}>
                <div className="exec-regime-explainer-head">
                  <span className="exec-regime-explainer-eyebrow">Current regime</span>
                  <span className={`exec-regime-explainer-tag tone-${tone}`}>{ex.regime}</span>
                </div>
                <div className="exec-regime-explainer-headline">{explainer.headline}</div>
                <p className="exec-regime-explainer-body">{explainer.body}</p>
                {ex.regimeExplainer && (
                  <p className="exec-regime-explainer-source">Engine note: {ex.regimeExplainer}</p>
                )}
              </section>
            </>
          )}

          {/* ───────────────────────  Dislocations tab  ──────────────────────
              Top-down narrative: summary strip → trade decision (the
              actionable thing) → supporting cross-venue weights and
              per-row audit table. Decision sits at the top because that
              is what desks act on. */}
          {tab === 'dislocations' && (
            <>
              <section className="exec-strip-section">
                <header className="info-card-head">
                  <span className="info-card-eyebrow">CPI dislocation strip · cross-venue residuals vs Oriel Reference</span>
                  <Badge variant="default">{ex.strip.venueCount} venues · {ex.strip.maturityCount} maturities</Badge>
                </header>
                <div className="exec-strip-grid">
                  <StripCell label="Avg dislocation"      value={fmtBp(ex.strip.avgDislocationBps)} />
                  <StripCell label="Median dislocation"   value={fmtBp(ex.strip.medianDislocationBps)} />
                  <StripCell label="Max dislocation"      value={fmtBp(ex.strip.maxDislocationBps)} />
                  <StripCell label="Net executable edge"  value={fmtBp(ex.strip.netExecutableEdgeBps)} sub="after 10 bp cost buffer" />
                  <StripCell label="Venues"               value={String(ex.strip.venueCount)} />
                  <StripCell label="Maturities"           value={String(ex.strip.maturityCount)} />
                </div>
              </section>

              {ex.orielDecision && (
                <section className="exec-decision-section">
                  <header className="info-card-head">
                    <span className="info-card-eyebrow">Oriel decision · trade-worth-doing chain</span>
                    <Badge variant="warning">{ex.orielDecision.status}</Badge>
                  </header>
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

              {ex.venueContribution && ex.venueContribution.length > 0 && (
                <section className="exec-vc-section">
                  <header className="info-card-head">
                    <span className="info-card-eyebrow">Cross-venue contribution · weight into Oriel Reference</span>
                    <Badge variant="accent">{ex.venueContribution.length} rows</Badge>
                  </header>
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

              {dislocationsTable.length > 0 && (
                <section className="exec-ra-section">
                  <header className="info-card-head">
                    <span className="info-card-eyebrow">Reference audit · per-(venue, maturity) dislocation &amp; edge</span>
                    <Badge variant="default">{dislocationsTable.length} rows</Badge>
                  </header>
                  <div className="exec-ra-scroll">
                    <table className="exec-ra-table">
                      <thead>
                        <tr>
                          <th>Release Month</th>
                          <th>Venue</th>
                          <th className="num">Implied YoY</th>
                          <th className="num">Oriel Reference</th>
                          <th className="num">Dislocation</th>
                          <th className="num">Gross Edge</th>
                          <th className="num">Net Edge (after 10 bp)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dislocationsTable.map((row, i) => (
                          <tr key={i}>
                            <td>{row.releaseMonth}</td>
                            <td>{row.venue}</td>
                            <td className="num">{row.impliedYoy != null ? Number(row.impliedYoy).toFixed(4) : '—'}</td>
                            <td className="num">{row.orielReferenceYoy != null ? Number(row.orielReferenceYoy).toFixed(4) : '—'}</td>
                            <td className={`num ${row.dislocationBps != null && row.dislocationBps < 0 ? 'negative' : 'positive'}`}>
                              {row.dislocationBps != null ? `${Number(row.dislocationBps).toFixed(2)} bp` : '—'}
                            </td>
                            <td className="num">{row.grossEdgeBps != null ? `${Number(row.grossEdgeBps).toFixed(2)} bp` : '—'}</td>
                            <td className={`num ${row.netExecutableEdgeBps != null && row.netExecutableEdgeBps > 0 ? 'gold' : 'muted'}`}>
                              {row.netExecutableEdgeBps != null ? `${Number(row.netExecutableEdgeBps).toFixed(2)} bp` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}

          {/* ───────────────────────  ScaleTrader tab  ─────────────────────── */}
          {tab === 'scaletrader' && (
            ex.scaletraderTicket ? (
              <>
                <section className="exec-st-section">
                  <header className="info-card-head">
                    <span className="info-card-eyebrow">Illustrative ScaleTrader ticket · not routed</span>
                    <Badge variant={ex.scaletraderTicket.side === 'Buy YES' ? 'success' : 'danger'}>
                      {ex.scaletraderTicket.side} · {ex.scaletraderTicket.selectedVenueContract}
                    </Badge>
                  </header>
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
                </section>

                {scaletraderLadder.length > 0 && (
                  <section className="exec-st-ladder">
                    <header className="info-card-head">
                      <span className="info-card-eyebrow">Ladder rungs · {ex.scaletraderTicket.side === 'Buy YES' ? 'buy ladder · cheaper levels deeper' : 'sell ladder · richer levels deeper'}</span>
                      <Badge variant="default">{scaletraderLadder.length} levels · clip {ex.scaletraderTicket.clipSize.toLocaleString()}</Badge>
                    </header>
                    <div className="exec-st-ladder-grid">
                      {scaletraderLadder.map((rung) => {
                        const pct = (rung.level / scaletraderLadder.length) * 100;
                        return (
                          <div key={rung.level} className="exec-st-ladder-cell">
                            <div className="exec-st-ladder-mini">Level {rung.level}</div>
                            <div className="exec-st-ladder-price">${rung.price.toFixed(2)}</div>
                            <div className="exec-st-ladder-sub">Clip {ex.scaletraderTicket.clipSize.toLocaleString()}</div>
                            <div className="exec-st-ladder-bar" style={{ width: `${pct}%` }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="exec-st-ladder-foot">
                      Profit-taker offset {ex.scaletraderTicket.profitTakerOffset >= 0 ? '+' : '−'}${Math.abs(ex.scaletraderTicket.profitTakerOffset).toFixed(2)} applied to each fill.
                      Total max exposure = levels × clip = {ex.scaletraderTicket.maxExposure.toLocaleString()} units.
                    </div>
                  </section>
                )}

                <div className="exec-st-disable">
                  <div className="exec-st-disable-label">Disable Conditions</div>
                  <div className="exec-st-disable-text">{ex.scaletraderTicket.disableConditions}</div>
                </div>
              </>
            ) : <EmptyPanel label="No ScaleTrader ticket available (no dislocations to pick from)." />
          )}

          {/* ───────────────────────  TRS Deployment tab  ──────────────────── */}
          {tab === 'trs' && (
            <>
              {ex.backtestSummary && (
                <section className="exec-bt-section">
                  <header className="info-card-head">
                    <span className="info-card-eyebrow">Representative backtest summary · drives the TRS scenario below</span>
                    <Badge variant="default">30-day · {Number(ex.baseSpreadBps).toFixed(0)} bp · ${(ex.backtestSummary.launchNotionalUsd / 1e6).toFixed(1)}M launch · {ex.regime}</Badge>
                  </header>
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
                  <header className="info-card-head">
                    <span className="info-card-eyebrow">Pilot deployment economics · illustrative 30-day TRS scenario</span>
                    <Badge variant="info">not dealer pricing</Badge>
                  </header>
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
                    <div className="exec-trs-components-head">Economic components</div>
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
                  <header className="info-card-head">
                    <span className="info-card-eyebrow">TRS scenario comparison · No TRS / Unhedged / Partial / Full hedge</span>
                    <Badge variant="default">{ex.trsComparison.length} scenarios</Badge>
                  </header>
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
                </section>
              )}
            </>
          )}

          {/* ───────────────────────  Methodology tab  ─────────────────────── */}
          {tab === 'methodology' && (
            <div className="methodology-panel">
              {MethodologySteps && (
                <MethodologySteps
                  steps={methodologySteps}
                  accent="accent"
                />
              )}

              <div className="info-row cols-3">
                <ExecDefaultsCard ex={ex} fmtUsd={fmtUsd} fmtBp1={fmtBp1} />
                <ExecFormulasCard />
                <ExecStatusCard onNavigate={onNavigate} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ──────────────────  Methodology footer cards  ──────────────────── */
  function ExecDefaultsCard({ ex, fmtUsd, fmtBp1 }) {
    return (
      <section className="info-card">
        <header className="info-card-head">
          <span className="info-card-eyebrow">Base config &amp; multipliers</span>
          <Badge variant="accent">v7 oriel/sim/risk.py</Badge>
        </header>
        <div className="info-kv-list">
          <Kv label="Base spread"          value={fmtBp1(ex.baseSpreadBps)} mono />
          <Kv label="Base inventory limit" value={fmtUsd(ex.baseInventoryUsd)} mono />
          <Kv label="Base edge hurdle"     value={fmtBp1(ex.baseEdgeHurdleBps)} mono />
          <Kv label="Low (s / inv / edge)"      value="0.85 / 1.15 / 0.85" mono />
          <Kv label="Moderate (s / inv / edge)" value="1.00 / 1.00 / 1.00" mono />
          <Kv label="Elevated (s / inv / edge)" value="1.35 / 0.65 / 1.50" mono />
        </div>
      </section>
    );
  }

  function ExecFormulasCard() {
    return (
      <section className="info-card">
        <header className="info-card-head">
          <span className="info-card-eyebrow">Key formulas</span>
          <Badge variant="default">decision support</Badge>
        </header>
        <div className="info-kv-list">
          <Kv label="Net executable edge" value="max(0, |disl_bps| − cost_buffer_bps)" mono />
          <Kv label="Cross-venue weight"  value="0.6·conf + 0.4·liq (norm/maturity)" mono />
          <Kv label="Effective posture"   value="base × regime_multiplier" mono />
          <Kv label="Required margin"     value="trs_notional × initial_margin_pct" mono />
          <Kv label="Net fund PnL"        value="spread + dir + hedge + residual − fin + coll" mono />
          <Kv label="Return on capital"   value="net_pnl / capital × 365 / horizon_days" mono />
          <Kv label="Capital efficiency"  value="trs_notional / required_margin" mono />
        </div>
      </section>
    );
  }

  function ExecStatusCard({ onNavigate }) {
    return (
      <section className="info-card">
        <header className="info-card-head">
          <span className="info-card-eyebrow">Status &amp; disclosure</span>
          <span className="feed-pill feed-pill-warning">
            <span className="feed-dot feed-warn" />
            Decision support
          </span>
        </header>
        <div className="info-kv-list">
          <Kv label="Order routing"    value="None — no IBKR / TWS / venue auth wired" />
          <Kv label="Backtest source"  value="Representative 30-day sim summary" />
          <Kv label="TRS pricing"      value="Illustrative · not dealer pricing" />
          <Kv label="Legal scope"      value="Not legal / CSA / tax / accounting advice" />
          <Kv label="Live simulator"   value="apps/market_sim/ (standalone)" mono />
        </div>
        <p className="info-card-body muted">
          Full interactive simulator (ScaleTrader controls, parameter
          sweep, heatmap, run_backtest) ships as the standalone Oriel
          Execution Workbench at <code>apps/market_sim/</code> until the
          React port lands.
        </p>
        <div className="info-card-foot info-card-foot-actions">
          <button
            type="button"
            className="placeholder-cta primary"
            onClick={() => onNavigate && onNavigate('perp')}
          >
            See dislocation source <Icon name="arrow-right" size={11} />
          </button>
          <button
            type="button"
            className="placeholder-cta"
            onClick={() => onNavigate && onNavigate('overview')}
          >
            Back to Overview <Icon name="arrow-right" size={11} />
          </button>
        </div>
      </section>
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

  function Kv({ label, value, mono }) {
    return (
      <div className="info-kv-row">
        <span className="info-kv-key">{label}</span>
        <span className={cn('info-kv-value', mono && 'font-mono')}>{value}</span>
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

  /* ─────────────────────────  Ladder builder  ────────────────────────── */
  function buildLadder(ticket) {
    if (!ticket || !ticket.levels || ticket.levels <= 0) return [];
    const start = Number(ticket.startPrice) || 0;
    const incr  = Number(ticket.increment)  || 0;
    const buy   = ticket.side === 'Buy YES';
    const out   = [];
    for (let i = 0; i < ticket.levels; i++) {
      const raw = buy ? start - i * incr : start + i * incr;
      const px  = Math.max(0.01, Math.min(0.99, raw));
      out.push({ level: i + 1, price: px });
    }
    return out;
  }

  window.App = window.App || {};
  window.App.ExecutionView = ExecutionView;
})();
