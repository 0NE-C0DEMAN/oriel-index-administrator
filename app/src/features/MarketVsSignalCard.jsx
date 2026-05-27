/* ==========================================================================
   MarketVsSignalCard.jsx — Right-rail panel showing where the index sits
   relative to a swap proxy and a directional signal.
   Mirrors v7's "Market vs Signal" / dislocation panel.
   Only renders when `detail.dislocation` is present (HC + CPI tabs).
   Registers window.App.MarketVsSignalCard.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;
  const { Icon, Badge } = window.App;

  function MarketVsSignalCard({ index }) {
    const d = index.detail;
    const dis = d?.dislocation;
    if (!dis) return null;
    const accent = index.accent || 'accent';
    const tone = dis.dislocationBps < 0 ? 'success' : dis.dislocationBps > 0 ? 'danger' : 'muted';
    const sign = dis.dislocationBps > 0 ? '+' : '';
    const arrow = dis.dislocationBps > 0 ? '↑' : dis.dislocationBps < 0 ? '↓' : '—';

    return (
      <section className={cn('mvs-card', `accent-${accent}`)}>
        <header className="mvs-card-head">
          <span className="mvs-card-eyebrow">Market vs Signal</span>
          <Badge variant="default">illustrative</Badge>
        </header>

        <ul className="mvs-card-rows">
          <Row
            label="Oriel Forward"
            value={`${dis.orielForward.toFixed(4)}${dis.unit}`}
            signal="—"
            signalTone="accent"
          />
          <Row
            label={dis.swapLabel || 'CPI Swap (illustrative)'}
            value={`${dis.cpiSwapProxy.toFixed(4)}${dis.unit}`}
            signal={dis.swapTag || 'placeholder'}
            signalTone="muted"
            title={dis.swapNote || 'Illustrative placeholder, not a real swap quote. Wire to a licensed CPI swap source in a later validation PR.'}
          />
          {/* Middle row default = "Energy Signal · — · ↑ Elevated" (CPI Kalshi).
              Venue payloads can override the entire row via `dis.middleRow`
              (e.g. v7's Polymarket tab: "Avg spread · 20.0 bp · venue"). */}
          {dis.middleRow ? (
            <Row
              label={dis.middleRow.label}
              value={dis.middleRow.value}
              signal={dis.middleRow.signal}
              signalTone={dis.middleRow.signalTone || 'muted'}
            />
          ) : (
            <Row
              label={dis.signalLabel || 'Energy Signal'}
              value="—"
              signal={dis.energySignal}
              signalTone={dis.energyTone || 'muted'}
            />
          )}
          <Row
            label="Dislocation"
            value={`${sign}${dis.dislocationBps.toFixed(1)} bp`}
            signal={arrow}
            signalTone={tone}
            valueTone={tone}
            strong
          />
        </ul>
      </section>
    );
  }

  function Row({ label, value, signal, signalTone, valueTone, strong, title }) {
    return (
      <li className="mvs-card-row" title={title || undefined}>
        <span className="mvs-card-row-label">{label}</span>
        <span className={cn('mvs-card-row-value', 'font-mono', valueTone && `tone-${valueTone}`, strong && 'strong')}>
          {value}
        </span>
        <span className={cn('mvs-card-row-signal', signalTone && `signal-${signalTone}`)}>{signal}</span>
      </li>
    );
  }

  window.App = window.App || {};
  window.App.MarketVsSignalCard = MarketVsSignalCard;
})();
