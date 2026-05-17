/* ==========================================================================
   IndexPrintCard.jsx — Right-rail panel on the detail page.
   Mirrors v7's "Index Print" card: a published/unpublished status header,
   a Base-N front-anchor highlight, and a 7-row metadata list.
   Registers window.App.IndexPrintCard.
   ========================================================================== */
(() => {
  'use strict';
  const { cn, nowUtcDateTime } = window.App.utils;
  const { Icon } = window.App;

  function IndexPrintCard({ index, liveOn }) {
    const d = index.detail;
    const print = d?.indexPrint;
    if (!print) return null;
    const accent = index.accent || 'accent';
    const isBps = (d.curveUnit || d.unit || '').trim() === 'bps';
    const unit = isBps ? ' bps' : '%';

    // Prefer the venue payload's actual valuation_timestamp (the moment
    // v7's pipeline last built this package — i.e. when the live feed was
    // queried). Fall back to "now" only when the payload doesn't carry it.
    // This is what makes the timestamp meaningful as a staleness indicator
    // — if the cache is 5 min old, the user sees that.
    const valuationTime = print.valuationTime || nowUtcDateTime();

    // Methodology version label:
    //  - Strip any leading 'v' so we don't render "vv0.3..." when the venue
    //    payload already includes the prefix (e.g. v7's ForecastEx returns
    //    "v0.3.0-forecastex-live" verbatim).
    //  - Append "-phase2-live" only for CPI Kalshi (matches v7's chip), and
    //    only when liveOn. Never append for venue versions that already
    //    carry their own "-<venue>-live" tag (FX, Polymarket, etc.).
    const rawVersion = String(d.methodology.version || '0.1.0').replace(/^v/, '');
    const hasVenueLiveTag = /-(?:phase2|forecastex|polymarket|perp|cms|parity)-live/i.test(rawVersion);
    const isCpiKalshi = (d.methodology.name || '').toLowerCase().includes('cpi forward')
                       && index.key === 'cpi';
    const versionLabel = liveOn
      ? (hasVenueLiveTag
          ? `v${rawVersion}`
          : isCpiKalshi
            ? `v${rawVersion}-phase2-live`
            : `v${rawVersion}`)
      : (hasVenueLiveTag && isCpiKalshi
          ? `v${rawVersion.replace(/-?phase2-live/g, '')}`
          : `v${rawVersion}`);

    // Source label flips too: live → runtimeMeta.source; off → "Sample data".
    const sourceLabel = liveOn
      ? (d.runtimeMeta?.source || 'Live feed')
      : 'Sample data';

    const fmtAnchor = (v) => isBps
      ? `${v >= 0 ? '+' : ''}${v.toFixed(0)} bps`
      : `${v.toFixed(4)}${unit}`;
    const fmtLevel = (v) => isBps
      ? `${v >= 0 ? '+' : ''}${v} bps`
      : v.toFixed(4);

    return (
      <section className={cn('ip-card', `accent-${accent}`)}>
        <header className="ip-card-head">
          <span className="ip-card-eyebrow">Index Print</span>
          <span className={cn('ip-card-status', print.publishable ? 'ok' : 'no')}>
            <span className="ip-status-dot" />
            {print.publishable ? 'Published' : 'Unpublished'}
          </span>
        </header>

        <div className="ip-card-highlight">
          <div className="ip-card-highlight-label">
            {isBps ? 'Reference 0 bps · Front Anchor' : `Base-${print.baseValue} Front Anchor`}
          </div>
          <div className="ip-card-highlight-value font-mono">{fmtLevel(print.indexLevel)}</div>
        </div>

        <dl className="ip-card-rows">
          {/* If the venue payload supplies its own row sequence (e.g. v7's
              Polymarket tab adds Venue Role / Venue Status / Reference Status
              between the standard rows), render those verbatim. Otherwise
              fall back to our default row set. */}
          {Array.isArray(print.rows) && print.rows.length ? (
            print.rows.map((r) => (
              <Row
                key={r.label}
                label={r.label}
                value={r.value}
                mono={!!r.mono}
                tone={r.tone}
                strong={!!r.strong}
              />
            ))
          ) : (
            <>
              <Row label="Index Name"        value={d.methodology.name} />
              <Row label="Methodology"       value={versionLabel} mono />
              {d.methodology.venue && <Row label="Venue" value={d.methodology.venue} />}
              {d.runtimeMeta && <Row label="Data Source" value={sourceLabel} tone={liveOn ? 'success' : 'warning'} />}
              <Row label="Valuation Time"    value={valuationTime} mono />
              <Row label="Base Value"        value={isBps ? '0 bps reference' : Number(print.baseValue).toFixed(2)} mono />
              <Row label="Anchor Exp. Value" value={fmtAnchor(print.anchorExpectedValue)} mono strong />
              <Row
                label="Publishable"
                value={print.publishable ? 'Yes ✓' : (d.methodology.unpublishableLabel || 'No ✗')}
                tone={print.publishable ? 'success' : 'warning'}
              />
              <Row label="Constituents"      value={print.constituentCount} mono />
            </>
          )}
        </dl>
      </section>
    );
  }

  function Row({ label, value, mono, tone, strong }) {
    return (
      <div className="ip-card-row">
        <dt>{label}</dt>
        <dd className={cn(mono && 'font-mono', tone && `tone-${tone}`, strong && 'strong')}>{value}</dd>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.IndexPrintCard = IndexPrintCard;
})();
