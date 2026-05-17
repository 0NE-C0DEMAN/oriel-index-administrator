/* ==========================================================================
   VolSurfacePanel.jsx — CPI Kalshi-only "Volatility & Surface Engine".
   Mirrors v7's render_vol_surface_engine(): KPI strip + 4 sub-tabs
   (Implied Vol Surface · Venue Dispersion · Forward / Vol Sensitivity ·
   Component Vol Framework). Driven entirely by engine-derived volSurface
   data; legend names + colours mirror v7 exactly.
   Registers window.App.VolSurfacePanel.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useMemo, useRef, useEffect } = React;
  const { cn } = window.App.utils;
  const { Icon } = window.App;

  const SUB_TABS = [
    { key: 'surface',     label: 'Implied Vol Surface' },
    { key: 'dispersion',  label: 'Venue Dispersion' },
    { key: 'sensitivity', label: 'Forward / Vol Sensitivity' },
    { key: 'component',   label: 'Component Vol Framework' },
  ];

  // v7 colours (tokens) → CareFi palette equivalents we use in this app.
  // GOLD (forward / Medical CPI) → --pink
  // SERIES2 (vol bars / Core Svc) → --accent (blue)
  // NEGATIVE (dispersion bars) → --danger
  // POSITIVE_MUTED (confidence) → --success
  // SERIES_MUTE (Shelter CPI) → muted text
  const C = {
    gold:        'var(--pink)',
    goldFill:    'rgba(236, 72, 153, 0.42)',
    accent:      'var(--accent)',
    accentFill:  'rgba(45, 91, 255, 0.42)',
    danger:      'var(--danger)',
    dangerFill:  'rgba(220, 38, 38, 0.42)',
    success:     'var(--success)',
    mute:        'var(--text-subtle)',
  };

  function VolSurfacePanel({ index }) {
    const vs = index?.detail?.volSurface;
    if (!vs) return null;
    const accent = index.accent || 'accent';
    const [tab, setTab] = useState('surface');

    return (
      <section className={cn('volsurf', `accent-${accent}`)}>
        <header className="volsurf-head">
          <div>
            <div className="volsurf-eyebrow">Volatility & Surface Engine</div>
            <div className="volsurf-title">Binary-implied vol · venue dispersion · scenario sensitivity · component framework</div>
            <div className="volsurf-sub">
              Binary-implied vol by maturity, venue dispersion vs the blended
              reference, and component-vol scaffolding for medical / shelter /
              core services.
            </div>
          </div>
        </header>

        <KpiStrip s={vs.summary} />

        <nav className="volsurf-tabs" role="tablist">
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={cn('volsurf-tab', tab === t.key && 'active')}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="volsurf-body">
          {tab === 'surface'     && <SurfaceTab     vs={vs} accent={accent} />}
          {tab === 'dispersion'  && <DispersionTab  vs={vs} accent={accent} />}
          {tab === 'sensitivity' && <SensitivityTab vs={vs} accent={accent} />}
          {tab === 'component'   && <ComponentTab   vs={vs} accent={accent} />}
        </div>

        <footer className="volsurf-foot">
          Binary-implied vols approximated by inverting threshold prices
          against the parent CPI forward. Component framework uses
          user-controlled beta / correlation assumptions — placeholder for
          roadmap discussions.
        </footer>
      </section>
    );
  }

  /* ─────────────────────────  KPI strip  ────────────────────────── */
  function KpiStrip({ s }) {
    if (!s) return null;
    const f = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d) : '—';
    return (
      <div className="volsurf-kpi">
        <div className="volsurf-kpi-ribbon">VOLATILITY SURFACE · Binary-implied · Parent CPI forward</div>
        <div className="volsurf-kpi-grid">
          <Cell label="Front Vol" value={`${f(s.frontVolPct)}%`} accent />
          <Cell label="Back Vol"  value={`${f(s.backVolPct)}%`} />
          <Cell label="Avg Vol"   value={`${f(s.avgVolPct)}%`} />
          <Cell label="Avg Dispersion"  value={`${f(s.dispersionAvgBp, 1)} bp`} />
          <Cell label="Peak Dispersion" value={`${f(s.dispersionPeakBp, 1)} bp`} warn />
        </div>
      </div>
    );
  }

  function Cell({ label, value, accent, warn }) {
    return (
      <div className="volsurf-kpi-cell">
        <div className="volsurf-kpi-label">{label}</div>
        <div className={cn('volsurf-kpi-value', accent && 'accent', warn && 'warn')}>{value}</div>
      </div>
    );
  }

  /* ───────────────  Card / chart shell with legend  ─────────────── */
  function ChartCard({ title, items, height, children }) {
    return (
      <div className="volsurf-card">
        <div className="volsurf-card-head">
          <div className="volsurf-card-title">{title}</div>
          <div className="volsurf-card-legend">
            {items.map((it, i) => (
              <span key={i} className="volsurf-legend-item">
                {it.kind === 'bar' ? (
                  <span className="volsurf-legend-bar"
                    style={{ background: it.fill, borderColor: it.color }} />
                ) : it.kind === 'dash' ? (
                  <span className="volsurf-legend-dash"
                    style={{ borderColor: it.color }} />
                ) : (
                  <span className="volsurf-legend-line">
                    <span className="volsurf-legend-line-bar"
                      style={{ background: it.color }} />
                    <span className="volsurf-legend-line-dot"
                      style={{ borderColor: it.color }} />
                  </span>
                )}
                <span className="volsurf-legend-label">{it.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="volsurf-chart" style={{ height }}>
          {children}
        </div>
      </div>
    );
  }

  function useChartWidth(initial = 720) {
    const ref = useRef(null);
    const [w, setW] = useState(initial);
    useEffect(() => {
      if (!ref.current) return;
      const obs = new ResizeObserver((entries) => {
        for (const e of entries) setW(Math.max(320, Math.floor(e.contentRect.width)));
      });
      obs.observe(ref.current);
      return () => obs.disconnect();
    }, []);
    return [ref, w];
  }

  /* Hover tooltip overlay positioned above a hovered chart point. */
  function HoverTooltip({ rect, lines }) {
    if (!rect) return null;
    return (
      <div
        className="volsurf-tip"
        style={{ left: rect.x, top: rect.y }}
      >
        {lines.map((l, i) => (
          <div key={i} className={cn('volsurf-tip-row', l.title && 'title')}>
            {l.swatch && (
              <span className="volsurf-tip-swatch"
                style={{ background: l.swatch }} />
            )}
            <span className="volsurf-tip-label">{l.label}</span>
            {l.value != null && (
              <span className="volsurf-tip-value font-mono">{l.value}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  /* ─────────────────────────  Tab 1: Surface  ───────────────────── */
  function SurfaceTab({ vs }) {
    const rows = vs.impliedVol;
    // Per-maturity selector mirrors v7: lets the user focus on any single
    // anchor (e.g. the front, May, Jun…) rather than always the whole curve.
    const months = rows.map((r) => r.targetMonth);
    const [filter, setFilter] = useState('all');
    const visibleRows = filter === 'all' ? rows : rows.filter((r) => r.targetMonth === filter);

    const sourceLabel = (s) => s === 'binary_inversion' ? 'Binary inv.'
                            : s === 'pmf_proxy'        ? 'PMF'
                            : 'Fallback σ';
    return (
      <div className="volsurf-tab-content">
        <div className="volsurf-scn-controls" style={{ marginBottom: 4 }}>
          <span className="volsurf-scn-label">Maturity</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="volsurf-scn-select">
            <option value="all">All maturities</option>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="volsurf-split">
          <ChartCard
            title="Forward vs binary-implied vol"
            height={260}
            items={[
              { kind: 'line', color: C.gold,   label: 'Parent CPI forward' },
              { kind: 'bar',  color: C.accent, fill: C.accentFill, label: 'Implied vol' },
            ]}
          >
            <DualAxisChart rows={visibleRows.length ? visibleRows : rows} />
          </ChartCard>

          <SimpleTable
            rows={visibleRows.length ? visibleRows : rows}
            headers={['Maturity', 'TTM', 'Fwd (%)', 'ATM K', 'Px', 'σ (%)', 'Src', 'n', 'Conf']}
            getCells={(r) => [
              r.targetMonth,
              `${r.daysFromValuation}d`,
              r.parentForwardPct.toFixed(2),
              r.atmThresholdPct.toFixed(2),
              r.atmContractPrice.toFixed(3),
              r.impliedVolPct.toFixed(3),
              sourceLabel(r.volSource),
              r.nSupportingContracts,
              r.confidenceScore.toFixed(0),
            ]}
            highlightCol={5}
            textCols={[1, 6]}
          />
        </div>
      </div>
    );
  }

  function DualAxisChart({ rows }) {
    const [ref, w] = useChartWidth(720);
    const [hover, setHover] = useState(null);
    const h = 210;
    const padL = 56, padR = 56, padT = 16, padB = 36;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const fwds = rows.map((r) => r.parentForwardPct);
    const vols = rows.map((r) => r.impliedVolPct);
    // Match v7's plotly default: both axes auto-range from 0 to ~115% of
    // peak. With both starting at 0 the forward line and vol bars share
    // the same visual baseline, so the line passes naturally through the
    // bars rather than floating in a compressed band above/below them.
    const fwdLo = 0;
    const fwdHi = (Math.max(...fwds) || 1) * 1.15;
    const volLo = 0;
    const volHi = (Math.max(...vols) || 1) * 1.15;
    const slot = innerW / Math.max(rows.length, 1);
    const x = (i) => rows.length === 1
      ? padL + innerW / 2
      : padL + slot / 2 + i * (innerW - slot) / (rows.length - 1);
    const yL = (v) => padT + innerH - ((v - fwdLo) / (fwdHi - fwdLo || 1)) * innerH;
    const yR = (v) => padT + innerH - ((v - volLo) / (volHi - volLo || 1)) * innerH;
    const barW = Math.max(18, Math.min(48, slot * 0.45));
    const linePath = rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${yL(r.parentForwardPct).toFixed(2)}`).join(' ');

    const onMove = (e) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / w;
      const px = (e.clientX - rect.left) / scaleX;
      let bestI = 0, best = Infinity;
      rows.forEach((_, i) => {
        const d = Math.abs(px - x(i));
        if (d < best) { best = d; bestI = i; }
      });
      const r = rows[bestI];
      // Position the tooltip just above the chart top edge (y=-10), then
      // CSS transform translateY(-100%) lifts it fully above the bars so
      // it never overlaps the data being plotted.
      setHover({
        i: bestI,
        rect: { x: x(bestI) * scaleX, y: -10 },
        row: r,
      });
    };

    return (
      <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative' }}>
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none"
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
            const y = padT + innerH * t;
            return <line key={i} x1={padL} x2={w - padR} y1={y} y2={y} stroke="var(--border-subtle)" />;
          })}
          {/* Hover guide */}
          {hover && (
            <line x1={x(hover.i)} x2={x(hover.i)} y1={padT} y2={padT + innerH}
              stroke="var(--text-subtle)" strokeWidth="1" strokeDasharray="3 3" />
          )}
          {/* Vol bars (right axis) */}
          {rows.map((r, i) => {
            const cx = x(i);
            const yT = yR(r.impliedVolPct);
            const isHover = hover && hover.i === i;
            return (
              <rect key={i}
                x={cx - barW / 2} y={yT}
                width={barW} height={Math.max(0, padT + innerH - yT)}
                fill={isHover ? C.accent : C.accentFill}
                stroke={C.accent} strokeWidth="1" rx="2"
                opacity={isHover ? 0.85 : 1}
              />
            );
          })}
          {/* Forward line (left axis) */}
          <path d={linePath} fill="none" stroke={C.gold} strokeWidth="2.4" strokeLinejoin="round" />
          {rows.map((r, i) => (
            <circle key={i} cx={x(i)} cy={yL(r.parentForwardPct)} r="4.5"
              fill="white" stroke={C.gold} strokeWidth="2"
            />
          ))}
          {/* X labels */}
          {rows.map((r, i) => (
            <text key={i} x={x(i)} y={h - 12} textAnchor="middle"
              fontSize="10.5" fontFamily="Inter, system-ui" fill="var(--text-muted)"
            >{r.targetMonth}</text>
          ))}
          {/* Y left (forward) */}
          {[0, 0.5, 1].map((t, i) => {
            const v = fwdHi - t * (fwdHi - fwdLo);
            return (
              <text key={i} x={padL - 8} y={padT + innerH * t + 3} textAnchor="end"
                fontSize="10" fontFamily="JetBrains Mono, monospace" fill="var(--text-subtle)"
              >{v.toFixed(2)}%</text>
            );
          })}
          {/* Y right (vol) */}
          {[0, 0.5, 1].map((t, i) => {
            const v = volHi - t * (volHi - volLo);
            return (
              <text key={i} x={w - padR + 6} y={padT + innerH * t + 3} textAnchor="start"
                fontSize="10" fontFamily="JetBrains Mono, monospace" fill="var(--text-subtle)"
              >{v.toFixed(2)}%</text>
            );
          })}
          <text x={padL} y={padT - 4} fontSize="10" fill="var(--text-muted)">Parent CPI Forward (%)</text>
          <text x={w - padR} y={padT - 4} fontSize="10" fill="var(--text-muted)" textAnchor="end">Implied Vol (%)</text>
        </svg>
        {hover && (
          <HoverTooltip
            rect={hover.rect}
            lines={[
              { title: true, label: hover.row.targetMonth },
              { swatch: C.gold,   label: 'Forward',     value: `${hover.row.parentForwardPct.toFixed(4)}%` },
              { swatch: C.accent, label: 'Implied vol', value: `${hover.row.impliedVolPct.toFixed(4)}%` },
              { label: 'ATM K',  value: `${hover.row.atmThresholdPct.toFixed(2)}%` },
              { label: 'TTM',    value: `${hover.row.daysFromValuation}d` },
              { label: 'Source', value: hover.row.volSource.replace('_', ' ') },
            ]}
          />
        )}
      </div>
    );
  }

  /* ─────────────────────────  Tab 2: Dispersion  ───────────────── */
  function DispersionTab({ vs }) {
    const rows = vs.venueDispersion;
    return (
      <div className="volsurf-tab-content">
        <div className="volsurf-split">
          <ChartCard
            title="Venue dispersion vs blended reference"
            height={260}
            items={[
              { kind: 'bar',  color: C.danger,  fill: C.dangerFill, label: 'Abs venue diff (bp)' },
              { kind: 'line', color: C.success, label: 'Avg confidence' },
            ]}
          >
            <DispersionChart rows={rows} />
          </ChartCard>

          <SimpleTable
            rows={rows}
            headers={['Maturity', 'Diff (bp)', 'Conf.', 'Spread', 'Liquidity']}
            getCells={(r) => [
              r.targetMonth,
              r.absCurveDiffBp.toFixed(1),
              r.avgConfidenceScore.toFixed(0),
              r.avgSpreadBp.toFixed(1),
              r.liquidityFlag,
            ]}
            highlightCol={1}
            textCols={[4]}
          />
        </div>
      </div>
    );
  }

  function DispersionChart({ rows }) {
    const [ref, w] = useChartWidth(720);
    const [hover, setHover] = useState(null);
    const h = 210;
    const padL = 56, padR = 56, padT = 16, padB = 36;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    // Both axes from 0 → peak × 1.15 so the bars + line share a baseline
    // and the confidence line passes through the dispersion bars naturally.
    const dispMax = (Math.max(...rows.map((r) => r.absCurveDiffBp)) || 10) * 1.15;
    const slot = innerW / Math.max(rows.length, 1);
    const x = (i) => rows.length === 1
      ? padL + innerW / 2
      : padL + slot / 2 + i * (innerW - slot) / (rows.length - 1);
    const yL = (v) => padT + innerH - (v / dispMax) * innerH;
    const yR = (v) => padT + innerH - (v / 100) * innerH;
    const barW = Math.max(18, Math.min(48, slot * 0.45));
    const linePath = rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${yR(r.avgConfidenceScore).toFixed(2)}`).join(' ');

    const onMove = (e) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / w;
      const px = (e.clientX - rect.left) / scaleX;
      let bestI = 0, best = Infinity;
      rows.forEach((_, i) => { const d = Math.abs(px - x(i)); if (d < best) { best = d; bestI = i; } });
      setHover({ i: bestI, rect: { x: x(bestI) * scaleX, y: -10 }, row: rows[bestI] });
    };

    return (
      <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative' }}>
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none"
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
            <line key={i} x1={padL} x2={w - padR}
              y1={padT + innerH * t} y2={padT + innerH * t}
              stroke="var(--border-subtle)"
            />
          ))}
          {hover && (
            <line x1={x(hover.i)} x2={x(hover.i)} y1={padT} y2={padT + innerH}
              stroke="var(--text-subtle)" strokeWidth="1" strokeDasharray="3 3" />
          )}
          {rows.map((r, i) => (
            <rect key={i}
              x={x(i) - barW / 2} y={yL(r.absCurveDiffBp)}
              width={barW} height={Math.max(0, padT + innerH - yL(r.absCurveDiffBp))}
              fill={hover && hover.i === i ? C.danger : C.dangerFill}
              stroke={C.danger} strokeWidth="1" rx="2"
              opacity={hover && hover.i === i ? 0.85 : 1}
            />
          ))}
          <path d={linePath} fill="none" stroke={C.success} strokeWidth="2.4" strokeLinejoin="round" />
          {rows.map((r, i) => (
            <circle key={i} cx={x(i)} cy={yR(r.avgConfidenceScore)} r="4.5"
              fill="white" stroke={C.success} strokeWidth="2"
            />
          ))}
          {rows.map((r, i) => (
            <text key={i} x={x(i)} y={h - 12} textAnchor="middle"
              fontSize="10.5" fontFamily="Inter, system-ui" fill="var(--text-muted)"
            >{r.targetMonth}</text>
          ))}
          {[0, 0.5, 1].map((t, i) => {
            const v = dispMax - t * dispMax;
            return (
              <text key={i} x={padL - 8} y={padT + innerH * t + 3} textAnchor="end"
                fontSize="10" fontFamily="JetBrains Mono, monospace" fill="var(--text-subtle)"
              >{v.toFixed(1)}</text>
            );
          })}
          {[0, 0.5, 1].map((t, i) => {
            const v = 100 - t * 100;
            return (
              <text key={i} x={w - padR + 6} y={padT + innerH * t + 3} textAnchor="start"
                fontSize="10" fontFamily="JetBrains Mono, monospace" fill="var(--text-subtle)"
              >{v.toFixed(0)}</text>
            );
          })}
          <text x={padL} y={padT - 4} fontSize="10" fill="var(--text-muted)">Abs Diff (bp)</text>
          <text x={w - padR} y={padT - 4} fontSize="10" fill="var(--text-muted)" textAnchor="end">Confidence</text>
        </svg>
        {hover && (
          <HoverTooltip
            rect={hover.rect}
            lines={[
              { title: true, label: hover.row.targetMonth },
              { swatch: C.danger,  label: 'Abs diff',   value: `${hover.row.absCurveDiffBp.toFixed(1)} bp` },
              { swatch: C.success, label: 'Confidence', value: `${hover.row.avgConfidenceScore.toFixed(0)}` },
              { label: 'Spread',    value: `${hover.row.avgSpreadBp.toFixed(1)} bp` },
              { label: 'Liquidity', value: hover.row.liquidityFlag },
            ]}
          />
        )}
      </div>
    );
  }

  /* ─────────────────────────  Tab 3: Sensitivity  ──────────────── */
  function SensitivityTab({ vs }) {
    const months = Array.from(new Set(vs.scenarioGrid.map((s) => s.targetMonth)));
    const [month, setMonth] = useState(months[0]);
    const filtered = vs.scenarioGrid.filter((s) => s.targetMonth === month);
    const shifts = Array.from(new Set(filtered.map((s) => s.forwardShiftBp))).sort((a, b) => b - a);
    const vmults = Array.from(new Set(filtered.map((s) => s.volMultiplier))).sort((a, b) => a - b);
    const cellMap = {};
    filtered.forEach((s) => {
      cellMap[`${s.forwardShiftBp}_${s.volMultiplier}`] = s.scenarioEventPrice;
    });

    return (
      <div className="volsurf-tab-content">
        <div className="volsurf-card">
          <div className="volsurf-card-head">
            <div className="volsurf-card-title">Forward / vol scenario sensitivity</div>
            <div className="volsurf-card-legend">
              <div className="volsurf-scn-controls">
                <span className="volsurf-scn-label">Scenario maturity</span>
                <select value={month} onChange={(e) => setMonth(e.target.value)} className="volsurf-scn-select">
                  {months.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <span className="volsurf-legend-item">
                <span className="volsurf-legend-grad" />
                <span className="volsurf-legend-label">Event price 0 → 1</span>
              </span>
            </div>
          </div>

          <div className="volsurf-card-section">
            <div className="volsurf-section-eyebrow">Event-price grid (forward shift × vol multiplier)</div>
            <div className="volsurf-heatmap">
              <table className="volsurf-heatmap-tbl">
                <thead>
                  <tr>
                    <th>Shift \ Vol×</th>
                    {vmults.map((v) => <th key={v}>{v.toFixed(2)}×</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((sh) => (
                    <tr key={sh}>
                      <td className="volsurf-heatmap-row-label">{sh > 0 ? `+${sh}` : sh} bp</td>
                      {vmults.map((vm) => {
                        const v = cellMap[`${sh}_${vm}`] ?? 0;
                        const intensity = Math.min(1, Math.max(0, v));
                        const bg = `rgba(45, 91, 255, ${0.06 + intensity * 0.65})`;
                        return (
                          <td key={vm} style={{ background: bg }} className="volsurf-heatmap-cell">
                            {v.toFixed(3)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="volsurf-card-section volsurf-card-section-tbl">
            <div className="volsurf-section-eyebrow">Scenario detail</div>
            <div className="volsurf-tbl-scroll">
              <table className="data-table compact volsurf-sticky-tbl">
                <thead>
                  <tr>
                    <th>Shift (bp)</th>
                    <th className="num">Vol ×</th>
                    <th className="num">Forward (%)</th>
                    <th className="num">Vol (%)</th>
                    <th className="num">Event price</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={i}>
                      <td className="font-mono">{r.forwardShiftBp > 0 ? `+${r.forwardShiftBp}` : r.forwardShiftBp}</td>
                      <td className="num font-mono">{r.volMultiplier.toFixed(2)}</td>
                      <td className="num font-mono">{r.scenarioForwardPct.toFixed(4)}</td>
                      <td className="num font-mono">{r.scenarioVolPct.toFixed(4)}</td>
                      <td className="num font-mono strong">{r.scenarioEventPrice.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────  Tab 4: Component  ────────────────── */
  function ComponentTab({ vs }) {
    const [medBeta,     setMedBeta]     = useState(1.15);
    const [medRho,      setMedRho]      = useState(0.72);
    const [shelterBeta, setShelterBeta] = useState(0.95);
    const [shelterRho,  setShelterRho]  = useState(0.88);
    const [coreBeta,    setCoreBeta]    = useState(1.05);
    const [coreRho,     setCoreRho]     = useState(0.81);

    const parents = vs.impliedVol;
    const components = useMemo(() => {
      // v7: comp_σ = parent_σ × β / √ρ
      const compute = (b, r) => {
        const rho = Math.min(Math.max(r, 0.15), 0.99);
        const beta = Math.max(b, 0.10);
        return parents.map((p) => ({
          targetMonth: p.targetMonth,
          parentVolPct: p.impliedVolPct,
          componentImpliedVolPct: Math.max(p.impliedVolPct, 0.01) * beta / Math.sqrt(rho),
        }));
      };
      return [
        { name: 'Medical CPI',         color: C.gold,   data: compute(medBeta,     medRho) },
        { name: 'Shelter CPI',         color: C.mute,   data: compute(shelterBeta, shelterRho) },
        { name: 'Core Svc ex Shelter', color: C.accent, data: compute(coreBeta,    coreRho) },
      ];
    }, [parents, medBeta, medRho, shelterBeta, shelterRho, coreBeta, coreRho]);

    // Long-form rows for the table (mirrors v7 compdf)
    const tableRows = useMemo(() => {
      const out = [];
      components.forEach((c) => {
        c.data.forEach((d) => out.push({
          component: c.name,
          targetMonth: d.targetMonth,
          parentVolPct: d.parentVolPct,
          componentImpliedVolPct: d.componentImpliedVolPct,
        }));
      });
      return out;
    }, [components]);

    return (
      <div className="volsurf-tab-content volsurf-comp">
        <div className="volsurf-comp-left">
          <div className="volsurf-comp-eyebrow">Component Parameters</div>
          <Slider label="Medical CPI beta"          min={0.6} max={1.6}  step={0.05} value={medBeta}     onChange={setMedBeta} />
          <Slider label="Medical CPI corr"          min={0.2} max={0.95} step={0.01} value={medRho}      onChange={setMedRho} />
          <Slider label="Shelter beta"              min={0.6} max={1.4}  step={0.05} value={shelterBeta} onChange={setShelterBeta} />
          <Slider label="Shelter corr"              min={0.2} max={0.99} step={0.01} value={shelterRho}  onChange={setShelterRho} />
          <Slider label="Core svc ex-shelter beta"  min={0.6} max={1.6}  step={0.05} value={coreBeta}    onChange={setCoreBeta} />
          <Slider label="Core svc ex-shelter corr"  min={0.2} max={0.99} step={0.01} value={coreRho}     onChange={setCoreRho} />
        </div>
        <div className="volsurf-comp-right">
          <ChartCard
            title="Component implied vol curves"
            height={220}
            items={components.map((c) => ({ kind: 'line', color: c.color, label: c.name }))}
          >
            <ComponentChart components={components} parents={parents} />
          </ChartCard>

          <SimpleTable
            rows={tableRows}
            headers={['Component', 'Maturity', 'Parent Vol (%)', 'Component Vol (%)']}
            getCells={(r) => [
              r.component,
              r.targetMonth,
              r.parentVolPct.toFixed(4),
              r.componentImpliedVolPct.toFixed(4),
            ]}
            highlightCol={3}
          />
        </div>
      </div>
    );
  }

  function Slider({ label, min, max, step, value, onChange }) {
    return (
      <label className="volsurf-slider">
        <div className="volsurf-slider-row">
          <span>{label}</span>
          <span className="font-mono">{Number(value).toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </label>
    );
  }

  function ComponentChart({ components, parents }) {
    const [ref, w] = useChartWidth(560);
    const [hoverI, setHoverI] = useState(null);
    const h = 220;
    const padL = 56, padR = 18, padT = 16, padB = 36;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const allVols = components.flatMap((c) => c.data.map((d) => d.componentImpliedVolPct));
    const yMax = Math.max(...allVols, 1) * 1.15;
    const slot = innerW / Math.max(parents.length, 1);
    const x = (i) => parents.length === 1
      ? padL + innerW / 2
      : padL + slot / 2 + i * (innerW - slot) / (parents.length - 1);
    const y = (v) => padT + innerH - (v / yMax) * innerH;

    const onMove = (e) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / w;
      const px = (e.clientX - rect.left) / scaleX;
      let bestI = 0, best = Infinity;
      parents.forEach((_, i) => { const d = Math.abs(px - x(i)); if (d < best) { best = d; bestI = i; } });
      setHoverI({ i: bestI, rect: { x: x(bestI) * scaleX, y: -10 } });
    };

    return (
      <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative' }}>
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}
          onMouseMove={onMove} onMouseLeave={() => setHoverI(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
            <line key={i} x1={padL} x2={w - padR}
              y1={padT + innerH * t} y2={padT + innerH * t}
              stroke="var(--border-subtle)"
            />
          ))}
          {hoverI && (
            <line x1={x(hoverI.i)} x2={x(hoverI.i)} y1={padT} y2={padT + innerH}
              stroke="var(--text-subtle)" strokeWidth="1" strokeDasharray="3 3" />
          )}
          {components.map((c, ci) => (
            <g key={ci}>
              <path
                d={c.data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(d.componentImpliedVolPct).toFixed(2)}`).join(' ')}
                fill="none" stroke={c.color} strokeWidth="2.2" strokeLinejoin="round"
              />
              {c.data.map((d, i) => (
                <circle key={i} cx={x(i)} cy={y(d.componentImpliedVolPct)} r="4"
                  fill="white" stroke={c.color} strokeWidth="2"
                />
              ))}
            </g>
          ))}
          {parents.map((p, i) => (
            <text key={i} x={x(i)} y={h - 12} textAnchor="middle"
              fontSize="10.5" fontFamily="Inter, system-ui" fill="var(--text-muted)"
            >{p.targetMonth}</text>
          ))}
          {[0, 0.5, 1].map((t, i) => {
            const v = yMax * (1 - t);
            return (
              <text key={i} x={padL - 8} y={padT + innerH * t + 3} textAnchor="end"
                fontSize="10" fontFamily="JetBrains Mono, monospace" fill="var(--text-subtle)"
              >{v.toFixed(2)}%</text>
            );
          })}
          <text x={padL} y={padT - 4} fontSize="10" fill="var(--text-muted)">Component Implied Vol (%)</text>
        </svg>
        {hoverI && (
          <HoverTooltip
            rect={hoverI.rect}
            lines={[
              { title: true, label: parents[hoverI.i].targetMonth },
              { label: 'Parent σ', value: `${parents[hoverI.i].impliedVolPct.toFixed(3)}%` },
              ...components.map((c) => ({
                swatch: c.color,
                label:  c.name,
                value:  `${c.data[hoverI.i].componentImpliedVolPct.toFixed(3)}%`,
              })),
            ]}
          />
        )}
      </div>
    );
  }

  /* ─────────────────────────  Helpers  ──────────────────────────── */
  function SimpleTable({ rows, headers, getCells, highlightCol, textCols }) {
    const isText = (i) => i === 0 || (textCols && textCols.includes(i));
    return (
      <div className="volsurf-tbl-wrap">
        <table className="data-table compact">
          <thead>
            <tr>{headers.map((h, i) => <th key={i} className={isText(i) ? '' : 'num'}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const cells = getCells(r);
              return (
                <tr key={i}>
                  {cells.map((c, ci) => (
                    <td key={ci} className={cn(
                      isText(ci) ? 'font-mono' : 'num font-mono',
                      ci === highlightCol && 'strong',
                    )}>{c}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.VolSurfacePanel = VolSurfacePanel;
})();
