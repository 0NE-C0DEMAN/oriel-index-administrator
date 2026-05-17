/* ==========================================================================
   ForwardCurveChart.jsx — Lightweight inline-SVG line chart.
   Renders a forward curve from an array of { maturity, expected, lower, upper }
   points. No Plotly yet; Module 4+ will swap in a richer chart engine.
   Registers window.App.ForwardCurveChart.
   ========================================================================== */
(() => {
  'use strict';
  const { useMemo, useState, useRef, useEffect } = React;
  const { cn } = window.App.utils;

  function ForwardCurveChart({
    data = [],
    unit = '%',
    precision = 2,
    height = 240,         // fallback / min height when no parent height is given
    accent = 'accent',
    showBand = true,
    showPrior = true,     // dashed Prior Curve (T-1) overlay (v7 parity)
    yLabel = 'Implied value',
  }) {
    const [hoverIdx, setHoverIdx] = useState(null);
    const containerRef = useRef(null);
    const [w, setW] = useState(720);
    const [h, setH] = useState(height);

    useEffect(() => {
      if (!containerRef.current) return;
      const obs = new ResizeObserver((entries) => {
        for (const e of entries) {
          const nextW = Math.max(320, Math.floor(e.contentRect.width));
          const nextH = Math.max(180, Math.floor(e.contentRect.height));
          setW((prev) => (Math.abs(prev - nextW) > 1 ? nextW : prev));
          setH((prev) => (Math.abs(prev - nextH) > 1 ? nextH : prev));
        }
      });
      obs.observe(containerRef.current);
      return () => obs.disconnect();
    }, []);

    const layout = useMemo(() => {
      if (!data.length) return null;
      // padL 56 makes room for rotated y-axis label + tick text
      const padL = 56, padR = 18, padT = 14, padB = 30;
      const innerW = w - padL - padR;
      const innerH = h - padT - padB;

      const lows  = data.map((d) => Number.isFinite(d.lower)    ? d.lower    : d.expected);
      const highs = data.map((d) => Number.isFinite(d.upper)    ? d.upper    : d.expected);
      const yMinRaw = Math.min(...lows);
      const yMaxRaw = Math.max(...highs);
      const span = yMaxRaw - yMinRaw || 1;
      const yMin = yMinRaw - span * 0.18;
      const yMax = yMaxRaw + span * 0.18;
      const ySpan = yMax - yMin || 1;

      const x = (i) => padL + (data.length === 1 ? innerW / 2 : (innerW * i) / (data.length - 1));
      const y = (v) => padT + innerH - ((v - yMin) / ySpan) * innerH;

      // 4 horizontal grid ticks
      const ticks = 4;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = yMin + (ySpan * k) / ticks;
        return { v, y: y(v) };
      });

      const points = data.map((d, i) => ({ ...d, cx: x(i), cy: y(d.expected) }));

      // Prior curve (T-1): take supplied d.prior if present; otherwise
      // synthesize a slightly-lower version of expected (matches v7's
      // _prior_curve_demo behavior — a small monotonic offset).
      const priorPoints = data.map((d, i) => {
        const v = Number.isFinite(d.prior) ? d.prior : d.expected * (1 - 0.006 - 0.0035 * i);
        return { cx: x(i), cy: y(v), value: v };
      });
      const priorPath = priorPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p.cy.toFixed(2)}`).join(' ');

      const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${p.cy.toFixed(2)}`).join(' ');
      const areaPath = `${linePath} L ${points[points.length - 1].cx.toFixed(2)} ${(padT + innerH).toFixed(2)} L ${points[0].cx.toFixed(2)} ${(padT + innerH).toFixed(2)} Z`;

      // Confidence band path (upper line forward, lower line back)
      let bandPath = '';
      if (showBand) {
        const upper = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx.toFixed(2)} ${y(p.upper).toFixed(2)}`).join(' ');
        const lower = points.slice().reverse().map((p, i) => `${i === 0 ? 'L' : 'L'} ${p.cx.toFixed(2)} ${y(p.lower).toFixed(2)}`).join(' ');
        bandPath = `${upper} ${lower} Z`;
      }

      return { w, h, padL, padR, padT, padB, innerW, innerH, points, priorPath, yTicks, yMin, yMax, linePath, areaPath, bandPath };
    }, [data, h, w, showBand]);

    if (!layout) return <div className="chart-empty">No data.</div>;

    const stroke = accent === 'pink' ? 'var(--pink)' : 'var(--accent)';
    const fill   = accent === 'pink' ? 'var(--pink-light)' : 'var(--accent-soft)';
    const band   = accent === 'pink' ? 'rgba(236, 72, 153, 0.10)' : 'rgba(45, 91, 255, 0.10)';

    const fmt = (v) => `${v.toFixed(precision)}${unit}`;
    const hover = hoverIdx !== null ? layout.points[hoverIdx] : null;

    return (
      <div
        ref={containerRef}
        className={cn('forward-chart', `accent-${accent}`)}
        style={{ width: '100%', height: '100%', minHeight: height }}
      >
        <svg
          viewBox={`0 0 ${layout.w} ${layout.h}`}
          width={layout.w}
          height={layout.h}
          role="img"
          aria-label="Forward curve"
        >
          <defs>
            <linearGradient id={`fc-area-${accent}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"  stopColor={stroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Y grid + labels */}
          {layout.yTicks.map((t, i) => (
            <g key={`yt-${i}`}>
              <line
                x1={layout.padL} x2={layout.w - layout.padR}
                y1={t.y} y2={t.y}
                stroke="var(--border-subtle)" strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={layout.padL - 8} y={t.y + 3}
                textAnchor="end"
                fontSize="10.5" fontFamily="JetBrains Mono, monospace"
                fill="var(--text-subtle)"
              >{fmt(t.v)}</text>
            </g>
          ))}

          {/* Y-axis label (rotated, on the left edge) */}
          <text
            x={14}
            y={layout.padT + layout.innerH / 2}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-muted)"
            fontFamily="Inter, system-ui"
            transform={`rotate(-90, 14, ${layout.padT + layout.innerH / 2})`}
          >{yLabel}</text>

          {/* Confidence band */}
          {showBand && layout.bandPath && (
            <path d={layout.bandPath} fill={band} />
          )}

          {/* Area under expected line */}
          <path d={layout.areaPath} fill={`url(#fc-area-${accent})`} />

          {/* Prior curve (T-1) — dashed muted overlay, drawn under the
              expected line so the current line reads as primary */}
          {showPrior && layout.priorPath && (
            <path
              d={layout.priorPath}
              fill="none"
              stroke="var(--text-subtle)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity="0.75"
            />
          )}

          {/* Expected line */}
          <path
            d={layout.linePath}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Markers + interactive hit-targets */}
          {layout.points.map((p, i) => (
            <g key={`pt-${i}`}>
              <circle cx={p.cx} cy={p.cy} r="5" fill="white" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <rect
                x={p.cx - 28} y={layout.padT}
                width="56" height={layout.innerH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onFocus={() => setHoverIdx(i)}
                onBlur={() => setHoverIdx(null)}
                tabIndex={0}
                aria-label={`${p.maturity}: ${fmt(p.expected)}`}
              />
            </g>
          ))}

          {/* X labels — expand 2-digit year ("Jun 26") to 4-digit ("Jun 2026")
              to match v7's "%b %Y" format */}
          {layout.points.map((p, i) => {
            const label = String(p.maturity || '').replace(/(\b[A-Za-z]{3,}\s)(\d{2})$/, (_m, a, b) => a + '20' + b);
            return (
              <text
                key={`xl-${i}`}
                x={p.cx} y={layout.h - 10}
                textAnchor="middle"
                fontSize="10.5"
                fill="var(--text-muted)"
                fontFamily="Inter, system-ui"
              >{label}</text>
            );
          })}
        </svg>

        {hover && (
          <div
            className="forward-chart-tooltip"
            style={{
              left:  `${(hover.cx / layout.w) * 100}%`,
              top:   `${hover.cy}px`,
            }}
          >
            <div className="forward-chart-tooltip-mat">{hover.maturity}</div>
            <div className="forward-chart-tooltip-val">{fmt(hover.expected)}</div>
            <div className="forward-chart-tooltip-band">[{fmt(hover.lower)} – {fmt(hover.upper)}]</div>
          </div>
        )}
      </div>
    );
  }

  window.App = window.App || {};
  window.App.ForwardCurveChart = ForwardCurveChart;
})();
