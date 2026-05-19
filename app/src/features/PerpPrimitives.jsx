/* ==========================================================================
   PerpPrimitives.jsx — Leaf presentation components and tiny formatters
   used throughout the Tier-1 CPI Basis perp readiness panel.

   These have no internal state and no cross-references — pure props in,
   JSX out. Extracted from PerpReadinessPanel.jsx to keep that file
   focused on tab structure and chart logic.

   Registers window.App.PerpPrimitives = {
     HoverTip, SubHeader, PanelCard, PItem, NoteBox, Row, MvsRow,
     SimpleTable, fmtMonth, fmtNum,
   };
   Must load BEFORE PerpReadinessPanel.jsx (which consumes these).
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;

  /* Shared chart hover tooltip. The .perp-tip CSS class anchors the
     tooltip at its bottom-centre via transform: translate(-50%, -100%),
     so a raw `left: x` will clip past the chart container whenever x
     is within half a tooltip width of either edge, and a raw
     `top: y - 12` will clip past the TOP of the chart whenever the
     hovered bar is so tall that y is small.

     Pass the chart's pixel width as `bound` and HoverTip will clamp x
     so its centre stays at least HALF_W from each side.  The vertical
     position is clamped to `TIP_H` below the chart's top so the
     tooltip's top edge stays at y >= 0 - for the tallest bars (where
     y - 12 would otherwise put the tooltip's top above the chart)
     this lets it overlap the upper portion of the bar instead of
     being clipped away by the chart's overflow:hidden.  Semi-
     transparent .perp-tip background (see 06-perp.css) lets the bar
     read through the overlap. */
  function HoverTip({ x, y, rows, bound }) {
    const HALF_W = 100;
    const TIP_H = 84;   // estimated tooltip card height in px
    const clampedX = bound
      ? Math.max(HALF_W, Math.min(bound - HALF_W, x))
      : x;
    const clampedY = Math.max(TIP_H + 2, y - 12);
    return (
      <div className="perp-tip" style={{ left: clampedX, top: clampedY }}>
        {rows.map((r, i) => (
          <div key={i} className={cn('perp-tip-row', r.accent && 'accent', r.muted && 'muted')}>
            <span className="perp-tip-l">{r.l}</span>
            <span className="perp-tip-v font-mono">{r.v}</span>
          </div>
        ))}
      </div>
    );
  }

  /* =========================================================================
     Shared building blocks — uniform styling across every tab
     ========================================================================= */
  function SubHeader({ children }) { return <h3 className="perp-subheader">{children}</h3>; }

  function PanelCard({ title, accent, children }) {
    return (
      <section className={cn('perp-panel-card', `accent-${accent}`)}>
        <div className="perp-panel-card-title">{title}</div>
        <div className="perp-panel-card-body">{children}</div>
      </section>
    );
  }

  function PItem({ k, v, sub, tone, mono }) {
    return (
      <div className="perp-pitem">
        <span className="perp-pitem-key">{k}</span>
        <span className={cn('perp-pitem-value', mono && 'font-mono', tone && `tone-${tone}`)}>{v}</span>
        {sub && <span className="perp-pitem-sub">{sub}</span>}
      </div>
    );
  }

  function NoteBox({ children, subtle }) {
    return <div className={cn('perp-note-box', subtle && 'subtle')}>{children}</div>;
  }

  function Row({ label, value, mono, tone, strong }) {
    return (
      <div className="ip-card-row">
        <dt>{label}</dt>
        <dd className={cn(mono && 'font-mono', tone && `tone-${tone}`, strong && 'strong')}>{value}</dd>
      </div>
    );
  }

  function MvsRow({ label, value, signal, signalTone, valueTone, strong }) {
    return (
      <li className="mvs-card-row">
        <span className="mvs-card-row-label">{label}</span>
        <span className={cn('mvs-card-row-value', 'font-mono', valueTone && `tone-${valueTone}`, strong && 'strong')}>{value}</span>
        <span className={cn('mvs-card-row-signal', signalTone && `signal-${signalTone}`)}>{signal}</span>
      </li>
    );
  }

  function SimpleTable({ headers, rows, highlightCol, fvHorizonRow, dense, flaggedRows }) {
    const flaggedSet = flaggedRows instanceof Set ? flaggedRows : new Set(flaggedRows || []);
    return (
      <div className={cn('perp-table-scroll', dense && 'dense')}>
        <table className="perp-table">
          <thead>
            <tr>{headers.map((h, i) => <th key={i} className={cn(highlightCol === i && 'highlight')}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={cn(
                fvHorizonRow === i && 'fv-row',
                flaggedSet.has(i) && 'flagged-row',
              )}>
                {row.map((cell, j) => <td key={j} className={cn(highlightCol === j && 'highlight', 'font-mono')}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function fmtMonth(s) {
    if (!s) return '';
    const m = String(s).match(/^(\d{4})-(\d{2})/);
    if (!m) return s;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m[2], 10) - 1]} ${m[1]}`;
  }
  function fmtNum(v, dp) {
    if (v == null || v === '') return '—';
    const n = Number(v);
    if (!isFinite(n)) return '—';
    return n.toFixed(dp);
  }

  window.App = window.App || {};
  window.App.PerpPrimitives = {
    HoverTip, SubHeader, PanelCard, PItem, NoteBox, Row, MvsRow,
    SimpleTable, fmtMonth, fmtNum,
  };
})();
