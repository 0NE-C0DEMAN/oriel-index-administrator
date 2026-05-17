/* ==========================================================================
   IndexTables.jsx — Two side-by-side tables on the index detail page:
     (left)  SnapshotsTable      — per-maturity expected values
     (right) ConstituentsTable   — contract observations (tickers, prices)
   Registers window.App.SnapshotsTable, window.App.ConstituentsTable.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;
  const { Badge, Icon } = window.App;

  function SnapshotsTable({ rows = [], unit = '%', precision = 2 }) {
    // Detect precision automatically: use 4 decimals if rows look like index-level
    // floats (very small integer part). Caller can still override with `precision`.
    const auto = rows.length && Math.abs(rows[0].expected) < 5 ? 4 : 2;
    const dp = precision === 2 ? auto : precision;

    const labelFor = (t) =>
      t === 'exact_outcome' ? 'Exact'
      : t === 'reference'    ? 'Reference'
      : 'Threshold';
    const variantFor = (t) =>
      t === 'exact_outcome' ? 'pink'
      : t === 'reference'    ? 'info'
      : 'accent';

    return (
      <div className="data-card">
        <header className="data-card-head">
          <div>
            <div className="data-card-title">Maturity snapshots</div>
            <div className="data-card-sub">Expected value + bucket band per anchor.</div>
          </div>
          <Badge variant="default">{rows.length} maturities</Badge>
        </header>
        <div className="data-card-body">
          <table className="data-table">
            <thead>
              <tr>
                <th>Maturity</th>
                <th>Type</th>
                <th className="num">Lower</th>
                <th className="num">Expected</th>
                <th className="num">Upper</th>
                <th className="num">Buckets</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="font-mono">{r.maturity}</td>
                  <td>
                    <Badge variant={variantFor(r.contractType)}>{labelFor(r.contractType)}</Badge>
                  </td>
                  <td className="num font-mono text-muted">{r.lower.toFixed(dp)}{unit}</td>
                  <td className="num font-mono strong">{r.expected.toFixed(dp)}{unit}</td>
                  <td className="num font-mono text-muted">{r.upper.toFixed(dp)}{unit}</td>
                  <td className="num font-mono">{r.bucketCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function ConstituentsTable({ rows = [], feedConfig }) {
    const [filter, setFilter] = React.useState('all');
    const showVenue = rows.some((r) => !!r.venue);
    const filtered = rows.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 'flagged') return r.status !== 'Included';
      if (filter === 'binary') return r.type === 'Binary threshold';
      if (filter === 'exact')  return r.type === 'Exact outcome';
      return true;
    });

    return (
      <div className="data-card">
        <header className="data-card-head">
          <div>
            <div className="data-card-title">Constituents</div>
            <div className="data-card-sub">Contract observations · {feedConfig?.source || 'sample data'}</div>
          </div>
          <div className="data-card-filters">
            {['all', 'binary', 'exact', 'flagged'].map((f) => (
              <button
                key={f}
                type="button"
                className={cn('chip', filter === f && 'chip-active')}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'binary' ? 'Threshold' : f === 'exact' ? 'Exact' : 'Flagged'}
              </button>
            ))}
          </div>
        </header>
        <div className="data-card-body">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                {showVenue && <th>Venue</th>}
                <th>Strike</th>
                <th>Type</th>
                <th className="num">Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={showVenue ? 6 : 5} className="empty-row">No contracts match this filter.</td></tr>
              )}
              {filtered.map((r, i) => (
                <tr key={i}>
                  <td className="font-mono small">{r.ticker}</td>
                  {showVenue && (
                    <td>
                      <Badge variant={r.venue === 'Kalshi' ? 'accent' : r.venue === 'ForecastEx' ? 'info' : 'default'}>
                        {r.venue || '—'}
                      </Badge>
                    </td>
                  )}
                  <td>{r.label}</td>
                  <td className="text-muted">{r.type}</td>
                  <td className="num font-mono">{r.price.toFixed(2)}</td>
                  <td>
                    <Badge variant={
                      r.status === 'Included' ? 'success'
                      : r.status === 'Flagged' ? 'warning'
                      : r.status === 'Repaired' ? 'info'
                      : 'default'
                    }>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {feedConfig && (
          <footer className="data-card-foot">
            <div className="data-card-foot-stats">
              <span><Icon name="database" size={11} /> {feedConfig.counts.total} contracts</span>
              <span className="dot-sep">·</span>
              <span>{feedConfig.counts.included} included</span>
              {feedConfig.counts.flagged > 0 && (<><span className="dot-sep">·</span><span>{feedConfig.counts.flagged} flagged</span></>)}
            </div>
            <div className="data-card-foot-meta">
              cache {feedConfig.cacheTtlSeconds}s · refreshed {window.App.utils.nowUtcDateTime()}
            </div>
          </footer>
        )}
      </div>
    );
  }

  window.App = window.App || {};
  window.App.SnapshotsTable = SnapshotsTable;
  window.App.ConstituentsTable = ConstituentsTable;
})();
