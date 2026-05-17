/* ==========================================================================
   IndexInfoRow.jsx — A horizontal row of three info cards on the detail page:
     • IndexStatsCard       — mean / avg σ / min / max / # constituents
     • MethodologyTable     — 6-row key/value (basis · interp · weighting · …)
     • LiveFeedCard         — only when runtimeMeta is present (CPI · Perp)

   Lays out as 3 columns when a live feed exists, otherwise 2 columns.
   Mirrors v7's `Index Stats / Methodology / Live Feed Status` row.
   Registers window.App.IndexInfoRow.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;
  const { Icon, Badge } = window.App;

  function IndexInfoRow({ index }) {
    const d = index?.detail;
    if (!d) return null;
    const accent = index.accent || 'accent';
    const hasFeed = !!d.runtimeMeta;
    const cls = cn('info-row', `accent-${accent}`, hasFeed ? 'cols-3' : 'cols-2');

    return (
      <div className={cls}>
        <IndexStatsCard stats={d.stats} accent={accent} />
        <MethodologyTable methodology={d.methodology} accent={accent} />
        {hasFeed && <LiveFeedCard meta={d.runtimeMeta} accent={accent} />}
      </div>
    );
  }

  /* ───────────────────────────  Stats card  ─────────────────────────── */
  function IndexStatsCard({ stats, accent }) {
    if (!stats) return null;
    const dp = stats.precision ?? 2;
    const u = stats.unit || '';
    const fmt = (v) => `${Number(v).toFixed(dp)}${u}`;

    // If the venue payload supplies an explicit `rows` array, render that
    // (e.g. v7's Polymarket tab uses 3 cards: Mean / Avg σ / Avg confidence).
    const customRows = Array.isArray(stats.rows) && stats.rows.length ? stats.rows : null;

    return (
      <section className={cn('info-card', `accent-${accent}`)}>
        <header className="info-card-head">
          <span className="info-card-eyebrow">Index Stats</span>
          {stats.unitLabel && <Badge variant="default">{stats.unitLabel}</Badge>}
        </header>
        <div className="info-stats-grid">
          {customRows ? (
            customRows.map((r, i) => (
              <Stat
                key={r.label || i}
                label={r.label}
                value={String(r.value)}
                muted={!!r.muted}
              />
            ))
          ) : (
            <>
              <Stat label="Mean (all maturities)" value={fmt(stats.mean)} />
              <Stat label="Avg Std Dev"           value={fmt(stats.avgStdDev)} muted />
              <Stat label="Min"                   value={fmt(stats.minValue)} muted />
              <Stat label="Max"                   value={fmt(stats.maxValue)} muted />
              <Stat label="Constituents"          value={String(stats.constituentCount)} />
            </>
          )}
        </div>
      </section>
    );
  }

  function Stat({ label, value, muted }) {
    return (
      <div className="info-stat">
        <div className="info-stat-label">{label}</div>
        <div className={cn('info-stat-value', 'font-mono', muted && 'muted')}>{value}</div>
      </div>
    );
  }

  /* ────────────────────────  Methodology table  ────────────────────── */
  function MethodologyTable({ methodology, accent }) {
    if (!methodology) return null;
    // If a venue's payload supplies its own labelled rows (e.g. v7's
    // ForecastEx tab uses Price basis · Normalization · Interpolation ·
    // Publishability · Stale rule · Fallback), render them verbatim so the
    // table mirrors that venue's spec rather than the CPI-Kalshi schema.
    const rows = Array.isArray(methodology.rows) && methodology.rows.length
      ? methodology.rows.map((r) => ({ label: r.label || r.key, value: r.value }))
      : [
          { label: 'Price basis',      value: methodology.basis },
          { label: 'Interpolation',    value: methodology.interpolation },
          { label: 'Weighting',        value: methodology.weighting },
          { label: 'Smoothing',        value: methodology.smoothing || '—' },
          { label: 'Stale market',     value: methodology.staleMarket || '—' },
          { label: 'Fallback',         value: methodology.fallback || '—' },
        ];

    return (
      <section className={cn('info-card', `accent-${accent}`)}>
        <header className="info-card-head">
          <span className="info-card-eyebrow">Methodology</span>
          <Badge variant="accent">v{methodology.version}</Badge>
        </header>
        <div className="info-kv-list">
          {rows.map((r) => (
            <div key={r.label} className="info-kv-row">
              <span className="info-kv-key">{r.label}</span>
              <span className="info-kv-value font-mono">{r.value}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  /* ─────────────────────────  Live feed card  ─────────────────────── */
  function LiveFeedCard({ meta, accent }) {
    const status = meta.feedStatus || 'sample';
    const variant =
      status === 'live'         ? 'success' :
      status === 'unavailable'  ? 'danger'  :
                                  'warning';
    const dotCls =
      status === 'live'         ? 'feed-live' :
      status === 'unavailable'  ? 'feed-warn' :
                                  'feed-mute';

    // Three rendering modes, in priority order:
    //   1. meta.feedRows — explicit key/value rows supplied by the venue's
    //      payload (e.g. v7's ForecastEx tab: series_ticker / source_status
    //      / sample_mode / min_volume / min_open_interest / max_curve_points)
    //   2. meta.feedConfig — Kalshi LiveFeedConfig blob (live mode)
    //   3. Generic runtime status (source / cache TTL / errors)
    const cfg = meta.feedConfig;
    const lastFetch = window.App.utils.nowUtcDateTime(true);
    let rows;
    if (Array.isArray(meta.feedRows) && meta.feedRows.length) {
      rows = meta.feedRows.map((r) => {
        const out = { label: r.label || r.key, value: String(r.value ?? '—') };
        if (r.badge) out.badge = r.badge;
        return out;
      });
    } else if (cfg && status === 'live') {
      rows = [
        { label: 'series_ticker',              value: cfg.series_ticker },
        { label: 'price_mode',                 value: cfg.price_mode },
        { label: 'min_open_interest',          value: Number(cfg.min_open_interest).toFixed(1) },
        { label: 'min_volume',                 value: Number(cfg.min_volume).toFixed(1) },
        { label: 'max_wide_spread',            value: Number(cfg.max_wide_spread).toFixed(2) },
        { label: 'min_contracts_per_maturity', value: String(cfg.min_contracts_per_maturity) },
        { label: 'max_maturities',             value: String(cfg.max_maturities) },
      ];
    } else {
      rows = [
        { label: 'Source',           value: meta.source || '—' },
        { label: 'Status',           value: status, badge: variant },
        { label: 'Cache TTL',        value: `${meta.cacheTtlSeconds}s` },
        { label: 'Last fetch',       value: lastFetch },
        { label: 'Contracts pulled', value: String(meta.contractsFetched ?? '—') },
        { label: 'Errors',           value: String(meta.errorCount ?? 0) },
      ];
    }

    return (
      <section className={cn('info-card', `accent-${accent}`)}>
        <header className="info-card-head">
          <span className="info-card-eyebrow">Live Feed Status</span>
          <span className={cn('feed-pill', `feed-pill-${variant}`)}>
            <span className={cn('feed-dot', dotCls)} />
            {status === 'live' ? 'Live' : status === 'unavailable' ? 'Offline' : 'Sample'}
          </span>
        </header>
        <div className="info-kv-list">
          {rows.map((r) => (
            <div key={r.label} className="info-kv-row">
              <span className="info-kv-key">{r.label}</span>
              {r.badge ? (
                <Badge variant={r.badge}>{r.value}</Badge>
              ) : (
                <span className="info-kv-value font-mono">{r.value}</span>
              )}
            </div>
          ))}
        </div>
        {meta.enableEnvVar && (
          <footer className="info-card-foot">
            <Icon name="info" size={11} />
            Enable: <code>{meta.enableEnvVar}=true</code>
          </footer>
        )}
      </section>
    );
  }

  window.App = window.App || {};
  window.App.IndexInfoRow = IndexInfoRow;
})();
