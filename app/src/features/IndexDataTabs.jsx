/* ==========================================================================
   IndexDataTabs.jsx — Tabbed data-tables card with CSV download per tab.
   Three tabs (each ports a v7 element):
     • Curve Table        — per-maturity expected value / index level / σ
                            with σ-row highlight + "Show index levels" toggle
     • Contract Observations — raw contracts (with flagged-row highlighting)
     • Index Constituents — per-maturity with flag + source columns
   Registers window.App.IndexDataTabs.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useMemo } = React;
  const { cn, downloadCsv, slugify } = window.App.utils;
  const { Icon, Badge } = window.App;

  // Per user feedback the three v7 tables (Curve / Observations /
  // Constituents) make more sense as separate stacked sections than as
  // sub-tabs. Render them vertically in the Constituents panel.
  function IndexDataTabs({ index }) {
    const d = index?.detail;
    if (!d) return null;
    const slug = slugify(`${index.key}_${d.methodology.name}`);
    const accent = index.accent || 'accent';

    return (
      <div className={cn('data-sections', `accent-${accent}`)}>
        {/* The two narrow per-maturity tables sit side-by-side; the wide
            contract-level table spans full width below them. */}
        <div className="data-sections-row">
          <CurveTable        detail={d} slug={slug} />
          <ConstituentsView  detail={d} slug={slug} />
        </div>
        <ObservationsTable   detail={d} slug={slug} />
      </div>
    );
  }

  /* ──────────────────────────  Curve Table  ─────────────────────────── */
  function CurveTable({ detail, slug }) {
    const [showIdx, setShowIdx] = useState(true);
    const dp = detail.curvePrecision ?? 2;
    const unit = detail.curveUnit ?? detail.unit ?? '';
    const isBps = unit.trim() === 'bps';

    const rows = useMemo(() => {
      const engine = window.App.engine;
      const front = detail.forwardCurve[0]?.expected || 1;
      return detail.forwardCurve.map((r) => {
        // Prefer the engine-derived std_dev when present (HC scalar buckets),
        // otherwise fall back to half the band width.
        const stdDev = Number.isFinite(r.std_dev) ? r.std_dev : (r.upper - r.lower) / 2;
        const indexLevel = isBps ? r.expected : (100 * r.expected) / front;
        const ttm = engine && engine.ttmYears ? engine.ttmYears(r.maturity) : null;
        return {
          maturity: r.maturity,
          ttm,
          expected: r.expected,
          stdDev,
          indexLevel,
          contractType: r.contractType,
        };
      });
    }, [detail.forwardCurve, isBps]);

    const sigmaRow = useMemo(() => {
      let max = -Infinity, idx = -1;
      rows.forEach((r, i) => { if (r.stdDev > max) { max = r.stdDev; idx = i; } });
      return idx;
    }, [rows]);

    const sigmaHint =
      sigmaRow >= 0 && rows[sigmaRow].stdDev > 0
        ? `Highest dispersion (σ): ${rows[sigmaRow].maturity} · ${rows[sigmaRow].stdDev.toFixed(dp)}${unit}`
        : null;

    const handleDownload = () => {
      const out = rows.map((r) => ({
        Maturity: r.maturity,
        'TTM (yrs)': r.ttm,
        [`Expected Value (${unit.trim() || 'val'})`]: r.expected.toFixed(dp + 1),
        ...(showIdx ? { 'Index Level': r.indexLevel.toFixed(4) } : {}),
        [`Std Dev (${unit.trim() || 'val'})`]: r.stdDev.toFixed(dp + 1),
      }));
      downloadCsv(`oriel_${slug}_curve.csv`, out);
    };

    return (
      <section className="data-section">
        <header className="data-tabs-toolbar">
          <div className="data-tabs-toolbar-text">
            <div className="data-tabs-title">Implied Values by Maturity</div>
            <div className="data-tabs-hint">
              {sigmaHint || 'Per-maturity expected value with derived dispersion band.'}
            </div>
          </div>
          <div className="data-tabs-toolbar-actions">
            <label className="data-tabs-toggle">
              <input type="checkbox" checked={showIdx} onChange={(e) => setShowIdx(e.target.checked)} />
              <Icon name={showIdx ? 'eye' : 'eye-off'} size={12} />
              Show index levels
            </label>
            <button type="button" className="data-tabs-csv" onClick={handleDownload}>
              <Icon name="download" size={12} /> CSV
            </button>
          </div>
        </header>

        <div className="data-tabs-table-scroll">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Maturity</th>
                <th className="num">TTM (yrs)</th>
                <th>Type</th>
                <th className="num">Expected ({unit.trim() || 'val'})</th>
                {showIdx && <th className="num">Index Level</th>}
                <th className="num">Std Dev</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.maturity} className={cn(i === sigmaRow && 'data-tabs-row-sigma')}>
                  <td className="font-mono">{r.maturity}</td>
                  <td className="num font-mono text-muted">{Number.isFinite(r.ttm) ? r.ttm.toFixed(2) : '—'}</td>
                  <td><TypeBadge type={r.contractType} /></td>
                  <td className="num font-mono strong">{r.expected.toFixed(dp)}{unit}</td>
                  {showIdx && <td className="num font-mono">{r.indexLevel.toFixed(4)}</td>}
                  <td className="num font-mono">
                    {i === sigmaRow && (
                      <Icon name="flag" size={10} className="data-tabs-sigma-flag" />
                    )}
                    {r.stdDev.toFixed(dp + 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  /* ────────────────────  Contract Observations  ────────────────────── */
  function ObservationsTable({ detail, slug }) {
    const [filter, setFilter] = useState('all');
    const showVenue = detail.constituents.some((r) => !!r.venue);

    const filtered = detail.constituents.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 'flagged')  return r.status !== 'Included';
      if (filter === 'binary')   return r.type === 'Binary threshold';
      if (filter === 'exact')    return r.type === 'Exact outcome';
      if (filter === 'scalar')   return r.type === 'Scalar bucket';
      return true;
    });

    const handleDownload = () => {
      downloadCsv(`oriel_${slug}_contracts.csv`, detail.constituents.map((r) => ({
        Ticker: r.ticker,
        Venue:  r.venue || '',
        Bucket: r.label,
        Type:   r.type,
        Price:  r.price,
        Method: r.method || 'Midpoint',
        Status: r.status,
      })));
    };

    const filters = ['all', 'binary', 'exact', 'scalar', 'flagged'];

    return (
      <section className="data-section">
        <header className="data-tabs-toolbar">
          <div className="data-tabs-toolbar-text">
            <div className="data-tabs-title">Contract Observations</div>
            <div className="data-tabs-hint">
              Source: {detail.feedConfig?.source || 'sample data'}. Flagged inputs included but marked for review.
            </div>
          </div>
          <div className="data-tabs-toolbar-actions">
            <div className="data-card-filters">
              {filters.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={cn('chip', filter === f && 'chip-active')}
                  onClick={() => setFilter(f)}
                >
                  {{
                    all: 'All', binary: 'Threshold', exact: 'Exact',
                    scalar: 'Scalar', flagged: 'Flagged',
                  }[f]}
                </button>
              ))}
            </div>
            <button type="button" className="data-tabs-csv" onClick={handleDownload}>
              <Icon name="download" size={12} /> CSV
            </button>
          </div>
        </header>

        <div className="data-tabs-table-scroll">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Ticker</th>
                {showVenue && <th>Venue</th>}
                <th>Bucket</th>
                <th>Type</th>
                <th className="num">Price</th>
                <th>Method</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={showVenue ? 7 : 6} className="empty-row">No contracts match this filter.</td></tr>
              )}
              {filtered.map((r, i) => (
                <tr key={i} className={cn(r.status === 'Flagged' && 'data-tabs-row-flagged')}>
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
                  <td className="num font-mono">{Number(r.price).toFixed(2)}</td>
                  <td className="text-muted">{r.method || 'Midpoint'}</td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  /* ────────────────────  Index Constituents view  ─────────────────── */
  function ConstituentsView({ detail, slug }) {
    const dp = detail.curvePrecision ?? 2;
    const unit = detail.curveUnit ?? detail.unit ?? '';
    const isBps = unit.trim() === 'bps';
    const front = detail.forwardCurve[0]?.expected || 1;

    const rows = detail.forwardCurve.map((r) => ({
      maturity: r.maturity,
      expected: r.expected,
      indexLevel: isBps ? r.expected : (100 * r.expected) / front,
      stdDev: (r.upper - r.lower) / 2,
      source: r.contractType,
      flagged: r.bucketCount && r.bucketCount < 4,
    }));

    const handleDownload = () => {
      downloadCsv(`oriel_${slug}_constituents.csv`, rows.map((r) => ({
        Maturity: r.maturity,
        [`Exp. Value (${unit.trim() || 'val'})`]: r.expected.toFixed(dp + 1),
        'Index Level': r.indexLevel.toFixed(4),
        'Std Dev':     r.stdDev.toFixed(dp + 1),
        Source:        r.source,
        Flag:          r.flagged ? 'flagged' : '',
      })));
    };

    return (
      <section className="data-section">
        <header className="data-tabs-toolbar">
          <div className="data-tabs-toolbar-text">
            <div className="data-tabs-title">Index Constituent Detail</div>
            <div className="data-tabs-hint">
              Constituent-level breakdown as published in the Index Print.
            </div>
          </div>
          <div className="data-tabs-toolbar-actions">
            <button type="button" className="data-tabs-csv" onClick={handleDownload}>
              <Icon name="download" size={12} /> CSV
            </button>
          </div>
        </header>

        <div className="data-tabs-table-scroll">
          <table className="data-table compact">
            <thead>
              <tr>
                <th>Maturity</th>
                <th className="num">Exp. Value</th>
                <th className="num">Index Level</th>
                <th className="num">Std Dev</th>
                <th>Source</th>
                <th className="num">Flag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.maturity} className={cn(r.flagged && 'data-tabs-row-flagged')}>
                  <td className="font-mono">{r.maturity}</td>
                  <td className="num font-mono strong">{r.expected.toFixed(dp)}{unit}</td>
                  <td className="num font-mono">{r.indexLevel.toFixed(4)}</td>
                  <td className="num font-mono">{r.stdDev.toFixed(dp + 1)}</td>
                  <td className="text-muted small">{r.source}</td>
                  <td className="num">
                    {r.flagged
                      ? <Icon name="flag" size={11} className="data-tabs-sigma-flag" />
                      : <span className="text-subtle">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  /* ──────────────────────────  Helpers  ─────────────────────────────── */
  function TypeBadge({ type }) {
    const map = {
      exact_outcome:    { variant: 'pink',    label: 'Exact' },
      binary_threshold: { variant: 'accent',  label: 'Threshold' },
      scalar_bucket:    { variant: 'pink',    label: 'Scalar' },
      reference:        { variant: 'info',    label: 'Reference' },
      parity_gap:       { variant: 'warning', label: 'Parity' },
    };
    const m = map[type] || { variant: 'default', label: type || '—' };
    return <Badge variant={m.variant}>{m.label}</Badge>;
  }

  function StatusBadge({ status }) {
    const map = {
      Included: 'success',
      Flagged:  'warning',
      Repaired: 'info',
    };
    return <Badge variant={map[status] || 'default'}>{status}</Badge>;
  }

  window.App = window.App || {};
  window.App.IndexDataTabs = IndexDataTabs;
})();
