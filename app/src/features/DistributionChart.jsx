/* ==========================================================================
   DistributionChart.jsx — SVG bar histogram for scalar-bucket probability
   distributions. Vertical bars per bucket + dashed EV marker + hover tooltip.
   Registers window.App.DistributionChart.
   ========================================================================== */
(() => {
  'use strict';
  const { useMemo, useState, useRef, useEffect } = React;
  const { cn } = window.App.utils;

  function DistributionChart({
    buckets = [],
    expected = null,
    unit = '%',
    height = 220,
    accent = 'pink',
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
      if (!buckets.length) return null;
      // padT 28 leaves room for the "EV xx%" pill above the bars without clipping
      // padL 56 leaves room for rotated "Probability (%)" axis label + tick text
      // padB needs enough room for angled labels which rotate -32° and extend
      // downward by ~sin(32°) × label width below their baseline. With ~13
      // buckets the labels can be 4–8 chars long → bump padB to 72.
      const padL = 56, padR = 16, padT = 28;
      const angled = buckets.length > 8;
      const padB = angled ? 72 : 36;
      const innerW = w - padL - padR;
      const innerH = h - padT - padB;

      const maxProb = Math.max(...buckets.map((b) => b.prob));
      const yMax = Math.ceil(maxProb * 100 / 5) * 5 / 100;     // round up to nearest 5%
      const yMaxSafe = Math.max(yMax, maxProb * 1.18);

      const binW = innerW / buckets.length;
      const barW = Math.min(binW * 0.74, 64);
      const barOffset = (binW - barW) / 2;

      const x = (i) => padL + i * binW + barOffset;
      const y = (p) => padT + innerH - (p / yMaxSafe) * innerH;

      // Y ticks (5 lines)
      const ticks = 4;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = (yMaxSafe * k) / ticks;
        return { v, y: padT + innerH - (v / yMaxSafe) * innerH };
      });

      // EV marker x position. Match v7's linear-axis behavior: position the
      // EV line WITHIN the bucket that contains the EV value, so it visibly
      // crosses through that bar. Fall back to mid-interpolation if EV sits
      // outside every bucket's [lower, upper] range.
      let evX = null;
      if (Number.isFinite(expected) && buckets.length) {
        const evBucketIdx = buckets.findIndex(
          (b) => expected >= b.lower && expected <= b.upper,
        );
        if (evBucketIdx >= 0) {
          const b = buckets[evBucketIdx];
          const barLeft = x(evBucketIdx);
          const ratio = (expected - b.lower) / Math.max(b.upper - b.lower, 1e-6);
          evX = barLeft + ratio * barW;
        } else {
          const mids = buckets.map((b) => b.mid);
          const minMid = Math.min(...mids);
          const maxMid = Math.max(...mids);
          const span = maxMid - minMid || 1;
          const t = Math.max(0, Math.min(1, (expected - minMid) / span));
          const firstCenter = padL + binW * 0.5;
          const lastCenter  = padL + binW * (buckets.length - 0.5);
          evX = firstCenter + t * (lastCenter - firstCenter);
        }
      }

      // Peak bucket = max probability. Mirrors v7's GOLD-vs-MUTED bar styling.
      let peakIdx = -1;
      let peakProb = -Infinity;
      buckets.forEach((b, i) => { if (b.prob > peakProb) { peakIdx = i; peakProb = b.prob; } });

      // Discrete skewness: E[((x - μ) / σ)^3] over bucket midpoints weighted
      // by probability. v7's distribution chart shows this in the top-right.
      let skew = null;
      const totalP = buckets.reduce((s, b) => s + b.prob, 0);
      if (totalP > 1e-6) {
        const mean = buckets.reduce((s, b) => s + b.prob * b.mid, 0) / totalP;
        const variance = buckets.reduce((s, b) => s + b.prob * (b.mid - mean) ** 2, 0) / totalP;
        const std = Math.sqrt(variance);
        if (std > 1e-6) {
          skew = buckets.reduce((s, b) => s + b.prob * ((b.mid - mean) / std) ** 3, 0) / totalP;
        }
      }

      return {
        w, h, padL, padR, padT, padB, innerW, innerH,
        binW, barW, x, y, yTicks, yMaxSafe, evX, peakIdx,
        skew, angled,
      };
    }, [buckets, expected, h, w]);

    if (!layout) return <div className="chart-empty">No buckets.</div>;

    // Color treatments per v7: peak bucket gets the accent color (gold in v7,
    // pink/blue here per index family); other bars are muted slate so the
    // peak reads as the modal mass at a glance.
    const peakStroke   = accent === 'pink' ? 'var(--pink)'                        : 'var(--accent)';
    const peakFillTop  = accent === 'pink' ? 'rgba(20, 184, 166, 0.90)'           : 'rgba(45, 91, 255, 0.90)';
    const peakFillBot  = accent === 'pink' ? 'rgba(20, 184, 166, 0.50)'           : 'rgba(45, 91, 255, 0.50)';
    const otherStroke  = '#94A3B8';
    const otherFillTop = 'rgba(148, 163, 184, 0.55)';
    const otherFillBot = 'rgba(148, 163, 184, 0.25)';

    const fmtP = (p) => `${(p * 100).toFixed(0)}%`;
    const fmtV = (v) => `${v.toFixed(2)}${unit}`;

    return (
      <div
        ref={containerRef}
        className={cn('dist-chart', `accent-${accent}`)}
        style={{ width: '100%', height: '100%', minHeight: height }}
      >
        <svg
          viewBox={`0 0 ${layout.w} ${layout.h}`}
          width={layout.w}
          height={layout.h}
          role="img"
          aria-label="Bucket probability distribution"
        >
          <defs>
            <linearGradient id={`dist-bar-peak-${accent}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"   stopColor={peakFillTop} />
              <stop offset="100%" stopColor={peakFillBot} />
            </linearGradient>
            <linearGradient id={`dist-bar-other-${accent}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%"   stopColor={otherFillTop} />
              <stop offset="100%" stopColor={otherFillBot} />
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
              >{fmtP(t.v)}</text>
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
          >Probability (%)</text>

          {/* Skew annotation in the top-right corner */}
          {Number.isFinite(layout.skew) && (
            <text
              x={layout.w - layout.padR - 4}
              y={layout.padT - 6}
              textAnchor="end"
              fontSize="10.5"
              fontFamily="JetBrains Mono, monospace"
              fill="var(--text-muted)"
            >Skew {layout.skew >= 0 ? '+' : ''}{layout.skew.toFixed(2)}</text>
          )}

          {/* Bars — peak bucket gets the accent color, others muted */}
          {buckets.map((b, i) => {
            const bx = layout.x(i);
            const by = layout.y(b.prob);
            const bh = layout.padT + layout.innerH - by;
            const isHover = hoverIdx === i;
            const isPeak  = i === layout.peakIdx;
            const fillUrl = isPeak ? `url(#dist-bar-peak-${accent})` : `url(#dist-bar-other-${accent})`;
            const stk     = isPeak ? peakStroke : otherStroke;
            return (
              <g key={`bar-${i}`}>
                <rect
                  x={bx} y={by}
                  width={layout.barW} height={bh}
                  fill={fillUrl}
                  stroke={stk}
                  strokeWidth={isHover ? 1.5 : isPeak ? 1.0 : 0.5}
                  vectorEffect="non-scaling-stroke"
                  rx="3"
                />
                <rect
                  x={bx - 4} y={layout.padT}
                  width={layout.barW + 8} height={layout.innerH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  onFocus={() => setHoverIdx(i)}
                  onBlur={() => setHoverIdx(null)}
                  tabIndex={0}
                  aria-label={`${b.label}: ${fmtP(b.prob)}`}
                />
                {/* Probability label above bar */}
                <text
                  x={bx + layout.barW / 2}
                  y={by - 5}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontFamily="JetBrains Mono, monospace"
                  fill={isHover || isPeak ? stk : 'var(--text-muted)'}
                  fontWeight={isHover || isPeak ? 700 : 500}
                >{fmtP(b.prob)}</text>
              </g>
            );
          })}

          {/* X labels — angled when many buckets so they don't overlap.
              cy is anchored to the inner chart bottom (padT + innerH + gap)
              so rotated text fits inside padB without escaping the SVG. */}
          {buckets.map((b, i) => {
            const cx = layout.x(i) + layout.barW / 2;
            const cy = layout.padT + layout.innerH + (layout.angled ? 14 : 18);
            return (
              <text
                key={`xl-${i}`}
                x={cx}
                y={cy}
                textAnchor={layout.angled ? 'end' : 'middle'}
                fontSize={layout.angled ? '9.5' : '10'}
                fill="var(--text-muted)"
                fontFamily="Inter, system-ui"
                transform={layout.angled ? `rotate(-32, ${cx}, ${cy})` : undefined}
              >{b.label}</text>
            );
          })}

          {/* EV marker */}
          {layout.evX != null && (
            <g>
              <line
                x1={layout.evX} x2={layout.evX}
                y1={layout.padT - 2} y2={layout.padT + layout.innerH + 2}
                stroke="var(--text)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
                opacity="0.75"
              />
              <g transform={`translate(${layout.evX}, ${layout.padT - 6})`}>
                <rect x="-26" y="-15" width="52" height="14" rx="3" fill="var(--text)" />
                <text x="0" y="-4" textAnchor="middle" fontSize="10" fill="white" fontFamily="JetBrains Mono, monospace" fontWeight="600">
                  EV {fmtV(expected)}
                </text>
              </g>
            </g>
          )}
        </svg>

        {hoverIdx !== null && (() => {
          // Clamp horizontal centre so the tooltip can't clip past
          // either chart edge (transform: translate(-50%, -100%)).
          const HALF_W = 110;
          const barCenterX = layout.x(hoverIdx) + layout.barW / 2;
          const clampedCx = Math.max(HALF_W, Math.min(layout.w - HALF_W, barCenterX));
          return (
            <div
              className="forward-chart-tooltip dist-tooltip"
              style={{
                left: `${clampedCx}px`,
                top:  `${layout.y(buckets[hoverIdx].prob) - 8}px`,
              }}
            >
              <div className="forward-chart-tooltip-mat">{buckets[hoverIdx].label}</div>
              <div className="forward-chart-tooltip-val">{fmtP(buckets[hoverIdx].prob)}</div>
              <div className="forward-chart-tooltip-band">mid {fmtV(buckets[hoverIdx].mid)}</div>
            </div>
          );
        })()}
      </div>
    );
  }

  window.App = window.App || {};
  window.App.DistributionChart = DistributionChart;
})();
