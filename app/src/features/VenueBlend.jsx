/* ==========================================================================
   VenueBlend.jsx — Per-venue blend weights + eligibility + diagnostics.
   Drives v7's "venue weight diagnostics" panel: each venue shown with a
   weight bar, eligibility badge, and a small grid of metrics.
   Registers window.App.VenueBlend.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;
  const { Icon, Badge } = window.App;

  function VenueBlend({ blend, accent = 'pink' }) {
    if (!blend?.venues?.length) return null;
    const blendDate = window.App.utils.todayUtcDate();
    return (
      <section className={cn('blend-card', `accent-${accent}`)}>
        <header className="blend-card-head">
          <div>
            <div className="blend-card-eyebrow">Governed blend</div>
            <div className="blend-card-title">Venue weights · {blend.governance}</div>
            <div className="blend-card-sub">As of {blendDate}. Eligibility gates can shift weights or fall back to a single venue.</div>
          </div>
          <Badge variant="default" dot>auto-rebalanced</Badge>
        </header>

        <div className="blend-card-body">
          {blend.venues.map((v) => (
            <VenueRow key={v.name} venue={v} accent={accent} />
          ))}
        </div>
      </section>
    );
  }

  function VenueRow({ venue, accent }) {
    const pct = Math.round(venue.weight * 100);
    return (
      <div className={cn('blend-venue', `accent-${accent}`)}>
        <div className="blend-venue-head">
          <div className="blend-venue-name">
            <span className={cn('blend-venue-mark', venue.eligible ? 'eligible' : 'rejected')} />
            {venue.name}
          </div>
          <div className="blend-venue-weight">
            <span className="blend-venue-weight-pct font-mono">{pct}%</span>
            <Badge variant={venue.eligible ? 'success' : 'warning'}>
              {venue.eligible ? 'Eligible' : 'Rejected'}
            </Badge>
          </div>
        </div>
        <div className="blend-venue-bar">
          <div className={cn('blend-venue-bar-fill', `accent-${accent}`)} style={{ width: `${pct}%` }} />
        </div>
        <div className="blend-venue-metrics">
          {venue.metrics.map((m, i) => (
            <div key={i} className="blend-venue-metric">
              <div className="blend-venue-metric-label">{m.label}</div>
              <div className="blend-venue-metric-value font-mono">{m.value}</div>
            </div>
          ))}
        </div>
        {venue.note && (
          <div className="blend-venue-note">
            <Icon name="info" size={11} /> {venue.note}
          </div>
        )}
      </div>
    );
  }

  window.App = window.App || {};
  window.App.VenueBlend = VenueBlend;
})();
