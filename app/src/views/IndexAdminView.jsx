/* ==========================================================================
   IndexAdminView.jsx — Index Administrator section.

   Mirrors v7 tabs/index_admin_tab.py 1:1 in DATA, redesigned in our
   visual vocabulary (.idx-kpi · hero-row · ip-card · data-card).

   Layout:
     [Toolbar]          Index selector + As-of run selector + Export button
     [KPI strip]        5-cell ribbon with methodology / pub status /
                        published buckets / avg publishability / latest run
     [Sub-tab bar]      5 tabs (Definition · Inputs · Calculation ·
                        Publication · Audit)
     [Active sub-tab]   Per-tab body content

   Live data: window.__ADMIN_PAYLOAD__ from v7 services.index_admin (via
   window.App.ADMIN). Falls back to a small in-bundle sample when the
   page is opened without the Streamlit wrapper.

   Registers window.App.IndexAdminView.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useMemo, useRef, useEffect } = React;
  const { cn, formatNumber } = window.App.utils;
  const { Icon, Badge } = window.App;
  const ADMIN = window.App.ADMIN;

  /* ───────────────────────── helpers ───────────────────────── */
  const fmt4 = (v) => v == null || !isFinite(v) ? '—' : Number(v).toFixed(4);
  const fmt2 = (v) => v == null || !isFinite(v) ? '—' : Number(v).toFixed(2);
  const fmt1 = (v) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const fmtInt = (v) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString();
  const fmtBool = (v) => v ? 'Yes' : 'No';
  const fmtIso = (v) => v ? String(v).slice(0, 19).replace('T', ' ') + ' UTC' : '—';
  const fmtIsoShort = (v) => v ? String(v).slice(0, 16).replace('T', ' ') + ' UTC' : '—';

  function useChartSize(initialW = 560, initialH = 320) {
    const ref = useRef(null);
    const [size, setSize] = useState({ w: initialW, h: initialH });
    useEffect(() => {
      if (!ref.current || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(([e]) => {
        const rect = e.contentRect;
        setSize({ w: rect.width || initialW, h: rect.height || initialH });
      });
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, []);
    return [ref, size.w, size.h];
  }

  const TABS = [
    { key: 'def',     label: 'Index Definition',     icon: 'sliders' },
    { key: 'inputs',  label: 'Eligibility & Inputs', icon: 'database' },
    { key: 'calc',    label: 'Calculation Engine',   icon: 'activity' },
    { key: 'pub',     label: 'Publication Controls', icon: 'shield' },
    { key: 'audit',   label: 'Audit Trail',          icon: 'book' },
  ];

  /* ═══════════════════════════════════════════════════════════════════════
     TOP-LEVEL VIEW
     ═══════════════════════════════════════════════════════════════════════ */
  function IndexAdminView() {
    const [tab, setTab] = useState('def');
    const def     = ADMIN.DEFINITION;
    const record  = ADMIN.PUBLICATION_RECORD;
    const outputs = ADMIN.OUTPUTS;
    const runs    = ADMIN.RUNS;
    const avgPub  = ADMIN.avgPublishability();

    const publishedN = (record.publishedBuckets || []).length;
    const totalN     = outputs.length;

    return (
      <div className="view admin-view">
        {/* Sticky head — toolbar + KPI strip + sub-tab bar all stay pinned
            while the body scrolls. Same pattern as IndexDetailView. */}
        <div className="admin-sticky-head">
          {/* Toolbar — card-style header with title, chips, selectors,
              export, and a sub-description. Same visual chrome as the
              .idx-kpi card below for cohesion. */}
          <header className="admin-toolbar-card">
            <div className="admin-toolbar-row">
              <div className="admin-toolbar-left">
                <Icon name="shield" size={20} className="admin-toolbar-icon" />
                <div className="admin-toolbar-titleblock">
                  <div className="admin-toolbar-title">Index Administrator</div>
                  <div className="admin-toolbar-sub">
                    Governed reference construction · publication controls · audit traceability
                  </div>
                </div>
                <div className="admin-toolbar-chips">
                  <span className="admin-toolbar-chip accent">v{def.methodologyVersion}</span>
                  <span className="admin-toolbar-chip">{def.indexId}</span>
                  {!ADMIN.isLive && <span className="admin-toolbar-chip warn">sample</span>}
                </div>
              </div>
              <div className="admin-toolbar-right">
                <div className="admin-control">
                  <span className="admin-control-label">Index</span>
                  <select className="admin-select" defaultValue={def.indexId}>
                    <option value={def.indexId}>{def.indexId}</option>
                  </select>
                </div>
                <div className="admin-control">
                  <span className="admin-control-label">As-of run</span>
                  <select className="admin-select" defaultValue={record.runId}>
                    {runs.map((r) => (
                      <option key={r.runId} value={r.runId}>{r.runId}</option>
                    ))}
                  </select>
                </div>
                <button type="button" className="admin-export-btn"
                        onClick={() => downloadCsv('index_admin_outputs.csv', outputs)}>
                  <Icon name="download" size={13} /> Export run
                </button>
              </div>
            </div>
          </header>

          <KpiStrip
            def={def}
            record={record}
            publishedN={publishedN}
            totalN={totalN}
            avgPub={avgPub}
          />

          <nav className="admin-tabs" role="tablist" aria-label="Index admin tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={cn('admin-tab', tab === t.key && 'active')}
                onClick={() => setTab(t.key)}
              >
                <Icon name={t.icon} size={13} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Scrollable body */}
        <div className="admin-tab-body">
          {tab === 'def'    && <DefinitionTab    def={def} record={record} outputs={outputs} quality={ADMIN.QUALITY} />}
          {tab === 'inputs' && <InputsTab        observations={ADMIN.OBSERVATIONS} />}
          {tab === 'calc'   && <CalculationTab   outputs={outputs} quality={ADMIN.QUALITY} obs={ADMIN.OBSERVATIONS} />}
          {tab === 'pub'    && <PublicationTab   quality={ADMIN.QUALITY} outputs={outputs} record={record} />}
          {tab === 'audit'  && <AuditTab         runs={runs} fallback={ADMIN.FALLBACK} record={record} def={def} />}
        </div>
      </div>
    );
  }

  /* ───────────────────────── KPI strip ──────────────────────── */
  function KpiStrip({ def, record, publishedN, totalN, avgPub }) {
    const pubColor =
      record.publicationStatus?.startsWith('published') ? 'success' :
      record.publicationStatus === 'restricted' ? 'warning' : 'danger';
    const bucketTone = publishedN === totalN ? 'success' : publishedN > 0 ? 'warning' : 'danger';
    const pubScoreTone = avgPub >= 0.80 ? 'success' : avgPub >= 0.65 ? 'warning' : 'danger';
    const heldN = (record.heldBuckets || []).length;

    return (
      <section className="idx-kpi admin-kpi">
        <div className="idx-kpi-ribbon">
          <span className="idx-kpi-ribbon-tag">ORIEL CPI BLENDED REFERENCE INDEX</span>
          <span className="idx-kpi-ribbon-sep">·</span>
          <span className="idx-kpi-ribbon-venue">Governed blend · Kalshi + ForecastEx · {def.publicationCadence} · {def.domain}</span>
        </div>
        <div className="admin-kpi-grid">
          <KpiCell label="Methodology"        value={def.methodologyVersion} sub={`${def.publicationCadence} · effective ${def.effectiveDate}`} mono />
          <KpiCell label="Publication status" value={record.publicationStatus} sub={`As of ${fmtIsoShort(record.asOf)}`} tone={pubColor} />
          <KpiCell label="Published buckets"  value={`${publishedN} / ${totalN}`} sub={`${heldN} held`} tone={bucketTone} mono lead />
          <KpiCell label="Avg publishability" value={avgPub.toFixed(2)} sub={`Across ${totalN} buckets · 0–1 scale`} tone={pubScoreTone} mono lead />
          <KpiCell label="Latest run"         value={fmtIsoShort(record.asOf)} sub={record.runId} mono small />
        </div>
      </section>
    );
  }

  function KpiCell({ label, value, sub, tone, mono, lead, small }) {
    return (
      <div className={cn('admin-kpi-cell', lead && 'lead', small && 'small', tone && `tone-${tone}`)}>
        <div className="admin-kpi-cell-label">{label}</div>
        <div className={cn('admin-kpi-cell-value', mono && 'font-mono')}>{value}</div>
        <div className="admin-kpi-cell-sub">{sub}</div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TAB 1 — INDEX DEFINITION
     ═══════════════════════════════════════════════════════════════════════ */
  function DefinitionTab({ def, record, outputs, quality }) {
    /* Merge outputs with quality for publication_decision per row.
       v7's tabs/index_admin_tab.py does the same merge — outputs_df
       doesn't carry publication_decision, only quality_df does. */
    const decisionByMonth = useMemo(() => {
      const m = {};
      (quality || []).forEach((q) => { m[q.targetMonth] = q.publicationDecision; });
      return m;
    }, [quality]);
    const maturityRows = useMemo(
      () => (outputs || []).map((o) => ({ ...o, publicationDecision: decisionByMonth[o.targetMonth] })),
      [outputs, decisionByMonth],
    );

    return (
      <div className="admin-grid-2">
        {/* LEFT — Benchmark Overview + Maturity Coverage table */}
        <section className="data-card">
          <header className="data-card-head">
            <div>
              <div className="data-card-title">Benchmark Overview</div>
              <div className="data-card-sub">Identity · status · currency</div>
            </div>
          </header>
          <div className="data-card-body admin-card-body">
            <DefList rows={[
              { label: 'Index ID',  value: def.indexId,   sub: def.domain, mono: true },
              { label: 'Name',      value: def.indexName, sub: '' },
              { label: 'Status',    value: <span className="tone-success">{def.status}</span>, sub: `since ${def.effectiveDate}` },
              { label: 'Currency',  value: def.currency,  sub: def.timezone },
            ]} />
          </div>
          <div className="data-card-section-head">Maturity coverage</div>
          <div className="data-card-body" style={{ padding: 0 }}>
            <div className="admin-table-scroll">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Pub score</th>
                    <th>Fallback</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {maturityRows.map((r) => (
                    <tr key={r.targetMonth}>
                      <td className="font-mono">{r.targetMonth}</td>
                      <td className="num font-mono strong">{fmt4(r.publishabilityScore)}</td>
                      <td>{r.fallbackUsed ? <Badge variant="warning" dot>{r.fallbackLevel || 'Yes'}</Badge> : <span className="text-muted">No</span>}</td>
                      <td><DecisionBadge decision={r.publicationDecision} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* RIGHT — Methodology Metadata + Methodology Summary + Publication Record */}
        <section className="data-card">
          <header className="data-card-head">
            <div>
              <div className="data-card-title">Methodology Metadata</div>
              <div className="data-card-sub">Version · cadence · timezone</div>
            </div>
          </header>
          <div className="data-card-body admin-card-body">
            <DefList rows={[
              { label: 'Methodology version', value: def.methodologyVersion, sub: def.effectiveDate, mono: true },
              { label: 'Publication cadence', value: def.publicationCadence, sub: '' },
              { label: 'Refresh cadence',     value: `${def.refreshCadenceSeconds}s`, sub: 'real-time', mono: true },
              { label: 'Timezone',            value: def.timezone, sub: '' },
            ]} />
          </div>
          <div className="data-card-section-head">Methodology summary</div>
          <div className="data-card-body admin-card-body">
            <p className="admin-meth-text">{def.description}</p>
            <p className="admin-meth-foot">
              Market-implied curve: normalized eligible market observations.
              Blended reference index: governed published output.
              Fair value curve: model-informed pricing layer.
            </p>
          </div>
          <div className="data-card-section-head">Publication record</div>
          <div className="data-card-body admin-card-body">
            <DefList rows={[
              { label: 'Status',    value: <span className={`tone-${record.publicationStatus?.startsWith('published') ? 'success' : 'warning'}`}>{record.publicationStatus}</span>, sub: record.runId, mono: true },
              { label: 'Published', value: <span className="tone-success">{(record.publishedBuckets || []).join(', ') || '—'}</span>, sub: `${(record.publishedBuckets || []).length} bucket(s)` },
              { label: 'Held',      value: <span className="tone-danger">{(record.heldBuckets || []).join(', ') || '—'}</span>, sub: `${(record.heldBuckets || []).length} bucket(s)` },
              { label: 'Override',  value: record.overrideApplied ? 'Applied' : 'None', sub: record.overrideNote || '' },
            ]} />
          </div>
        </section>
      </div>
    );
  }

  function DefList({ rows }) {
    return (
      <dl className="admin-deflist">
        {rows.map((r, i) => (
          <div key={i} className="admin-deflist-row">
            <dt>{r.label}</dt>
            <dd className={cn(r.mono && 'font-mono')}>{r.value}</dd>
            {r.sub && <dd className="admin-deflist-sub">{r.sub}</dd>}
          </div>
        ))}
      </dl>
    );
  }

  function DecisionBadge({ decision }) {
    const variant = ADMIN.decisionTone(decision);
    return <Badge variant={variant} dot>{ADMIN.decisionLabel(decision)}</Badge>;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TAB 2 — ELIGIBILITY & INPUTS
     ═══════════════════════════════════════════════════════════════════════ */
  function InputsTab({ observations }) {
    const months = useMemo(() => ['All', ...Array.from(new Set(observations.map((o) => o.targetMonth))).sort()], [observations]);
    const venues = useMemo(() => ['All', ...Array.from(new Set(observations.map((o) => o.venue))).sort()], [observations]);
    const [month, setMonth]     = useState('All');
    const [venue, setVenue]     = useState('All');
    const [eligibleOnly, setEO] = useState(false);

    const filtered = observations.filter((o) =>
      (month === 'All' || o.targetMonth === month) &&
      (venue === 'All' || o.venue === venue) &&
      (!eligibleOnly || o.isEligible)
    );

    return (
      <section className="data-card">
        <header className="data-card-head admin-inputs-head">
          <div>
            <div className="data-card-title">Eligibility &amp; Input Observations</div>
            <div className="data-card-sub">
              Per-instrument feed snapshot · weights and exclusion reasons surfaced for market-maker diligence
            </div>
          </div>
          <div className="admin-inputs-filters">
            <FilterSelect label="Month" value={month} onChange={setMonth} options={months} />
            <FilterSelect label="Venue" value={venue} onChange={setVenue} options={venues} />
            <label className="admin-toggle">
              <input type="checkbox" checked={eligibleOnly} onChange={(e) => setEO(e.target.checked)} />
              Eligible only
            </label>
          </div>
        </header>
        <div className="data-card-body" style={{ padding: 0 }}>
          <div className="admin-table-scroll">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Venue</th>
                  <th>Instrument</th>
                  <th className="num">Implied</th>
                  <th className="num">Bid</th>
                  <th className="num">Ask</th>
                  <th className="num">Spread (bp)</th>
                  <th className="num">Depth</th>
                  <th className="num">OI</th>
                  <th>Source ts</th>
                  <th className="num">Age (s)</th>
                  <th className="num">Weight</th>
                  <th>Eligible</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan="14" className="empty-row">No observations match the current filters.</td></tr>
                )}
                {filtered.map((o, i) => (
                  <tr key={i} className={cn(!o.isEligible && 'admin-row-flagged')}>
                    <td className="font-mono">{o.targetMonth}</td>
                    <td><Badge variant={o.venue === 'kalshi' ? 'accent' : 'info'}>{o.venue}</Badge></td>
                    <td className="font-mono small">{o.instrumentId}</td>
                    <td className="num font-mono">{fmt4(o.impliedValue)}</td>
                    <td className="num font-mono">{fmt4(o.bid)}</td>
                    <td className="num font-mono">{fmt4(o.ask)}</td>
                    <td className="num font-mono">{fmt1(o.spreadBps)}</td>
                    <td className="num font-mono">{fmtInt(o.depth)}</td>
                    <td className="num font-mono">{fmtInt(o.openInterest)}</td>
                    <td className="font-mono small">{(o.sourceTimestamp || '').slice(0, 19).replace('T', ' ')}</td>
                    <td className="num font-mono">{o.ageSeconds}</td>
                    <td className="num font-mono strong">{fmt4(o.weight)}</td>
                    <td>{o.isEligible ? <Badge variant="success">Yes</Badge> : <Badge variant="warning">No</Badge>}</td>
                    <td className="text-muted small">{o.exclusionReason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <footer className="admin-inputs-foot">
          <Icon name="info" size={12} />
          Flagged rows are ineligible. Timestamps and exclusion reasons are surfaced for market-maker diligence.
        </footer>
      </section>
    );
  }

  function FilterSelect({ label, value, onChange, options }) {
    return (
      <div className="admin-control">
        <span className="admin-control-label">{label}</span>
        <select className="admin-select" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TAB 3 — CALCULATION ENGINE
     ═══════════════════════════════════════════════════════════════════════ */
  function CalculationTab({ outputs, quality, obs }) {
    const [chartTab, setChartTab] = useState('weight');
    /* Merge outputs with quality to attach publication_decision per row —
       v7 does this exact merge in tabs/index_admin_tab.py because
       outputs_df has reason_codes but NOT publication_decision (that
       lives in quality_df). Without the merge our Decision column is
       blank because r.publicationDecision is undefined on outputs rows. */
    const decisionByMonth = useMemo(() => {
      const m = {};
      (quality || []).forEach((q) => { m[q.targetMonth] = q.publicationDecision; });
      return m;
    }, [quality]);
    const merged = useMemo(
      () => (outputs || []).map((o) => ({ ...o, publicationDecision: decisionByMonth[o.targetMonth] })),
      [outputs, decisionByMonth],
    );
    const onExpandLeft = () => window.App.expandChart({
      title: chartTab === 'weight' ? 'Venue Weight Distribution' : 'Publishability Score by Bucket',
      sub: chartTab === 'weight'
        ? 'Per-month sum of eligible-observation weights, stacked by venue'
        : 'Per-bucket publishability score · 0.80 publish · 0.65 restricted · below hold',
      render: () => chartTab === 'weight' ? <VenueWeightChart obs={obs} /> : <PublishabilityBarChart quality={quality} />,
    });
    const onExpandRight = () => window.App.expandChart({
      title: 'Curve Comparison',
      sub: 'Market-Implied · Blended Reference · Fair Value',
      render: () => <CurveComparisonChart outputs={outputs} />,
    });
    return (
      <div className="admin-calc">
        {/* Top row: chart card (left, switchable) + curve comparison (right) */}
        <div className="admin-calc-top">
          {/* LEFT — switchable chart card */}
          <section className="herochart-card">
            <header className="herochart-head">
              <div className="herochart-head-text">
                <div className="herochart-title">
                  {chartTab === 'weight' ? 'Venue Weight Distribution' : 'Publishability Score by Bucket'}
                </div>
                <div className="herochart-sub">
                  {chartTab === 'weight'
                    ? 'Per-month sum of eligible-observation weights, stacked by venue'
                    : 'Per-bucket publishability score · 0.80 publish · 0.65 restricted · below hold'}
                </div>
              </div>
              <div className="herochart-head-right">
                <div className="herochart-tabs" role="tablist">
                  <button type="button" className={cn('herochart-tab', chartTab === 'weight' && 'active')}
                          onClick={() => setChartTab('weight')}>Weight</button>
                  <button type="button" className={cn('herochart-tab', chartTab === 'pub' && 'active')}
                          onClick={() => setChartTab('pub')}>Publishability</button>
                </div>
                <button type="button" className="chart-expand-btn" onClick={onExpandLeft}
                        aria-label="Expand chart" title="Expand chart">
                  <Icon name="maximize" size={14} />
                </button>
              </div>
            </header>
            <div className="herochart-body">
              {chartTab === 'weight' ? <VenueWeightChart obs={obs} /> : <PublishabilityBarChart quality={quality} />}
            </div>
          </section>

          {/* RIGHT — curve comparison (Market vs Blended vs FV) */}
          <section className="herochart-card">
            <header className="herochart-head">
              <div className="herochart-head-text">
                <div className="herochart-title">Curve Comparison</div>
                <div className="herochart-sub">Market-Implied · Blended Reference · Fair Value</div>
              </div>
              <div className="herochart-head-right">
                <div className="admin-chart-legend">
                  <span className="admin-chart-legend-item"><span className="admin-chart-swatch market" /> Market</span>
                  <span className="admin-chart-legend-item"><span className="admin-chart-swatch blended" /> Blended</span>
                  <span className="admin-chart-legend-item"><span className="admin-chart-swatch fv" /> Fair Value</span>
                </div>
                <button type="button" className="chart-expand-btn" onClick={onExpandRight}
                        aria-label="Expand chart" title="Expand chart">
                  <Icon name="maximize" size={14} />
                </button>
              </div>
            </header>
            <div className="herochart-body">
              <CurveComparisonChart outputs={outputs} />
            </div>
          </section>
        </div>

        {/* Calculation Output table */}
        <section className="data-card">
          <header className="data-card-head">
            <div>
              <div className="data-card-title">Calculation Output</div>
              <div className="data-card-sub">
                Per-bucket blended reference, fair value, fallback usage, and publication decision
              </div>
            </div>
          </header>
          <div className="data-card-body" style={{ padding: 0 }}>
            <div className="admin-table-scroll">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Target Month</th>
                    <th className="num">Market-Implied</th>
                    <th className="num">Blended Reference</th>
                    <th className="num">Fair Value</th>
                    <th>Top Source</th>
                    <th>Fallback</th>
                    <th>Fallback Level</th>
                    <th className="num">Pub Score</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {merged.map((r) => (
                    <tr key={r.targetMonth}>
                      <td className="font-mono">{r.targetMonth}</td>
                      <td className="num font-mono">{fmt4(r.observedMarketImplied)}</td>
                      <td className="num font-mono strong">{fmt4(r.blendedReference)}</td>
                      <td className="num font-mono">{fmt4(r.fairValue)}</td>
                      <td className="text-muted">{r.topWeightedSource || '—'}</td>
                      <td>{r.fallbackUsed ? <Badge variant="warning">Yes</Badge> : <span className="text-muted">No</span>}</td>
                      <td className="text-muted small">{r.fallbackLevel || '—'}</td>
                      <td className="num font-mono">{fmt4(r.publishabilityScore)}</td>
                      <td><DecisionBadge decision={r.publicationDecision} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    );
  }

  /* ── Venue Weight stacked-bar chart ── */
  function VenueWeightChart({ obs }) {
    const [ref, w, hMeasured] = useChartSize(560, 320);
    const [hoverIdx, setHoverIdx] = useState(null);
    const stack = useMemo(() => ADMIN.venueWeightStack(), [obs]);

    const layout = useMemo(() => {
      if (!stack.months.length) return null;
      const h = Math.max(hMeasured || 0, 240);
      const padL = 56, padR = 22, padT = 16, padB = 50;
      const innerW = Math.max(w - padL - padR, 40);
      const innerH = h - padT - padB;
      const yMax = 1.05;
      const slot = innerW / Math.max(stack.months.length, 1);
      const barW = Math.min(slot * 0.55, 60);
      const x = (i) => padL + slot * (i + 0.5);
      const y = (v) => padT + innerH - (v / yMax) * innerH;
      const venueColors = {
        kalshi:     'var(--accent)',
        forecastex: '#f59e0b',
        polymarket: '#10b981',
        oriel:      '#8b5cf6',
      };
      const bars = stack.data.map((row, i) => {
        let cum = 0;
        const segs = stack.venues.map((v) => {
          const val = row[v] || 0;
          const seg = { venue: v, val, top: y(cum + val), bot: y(cum), color: venueColors[v] || '#94a3b8' };
          cum += val;
          return seg;
        });
        return { month: row.month, cx: x(i), segs, total: cum, top: y(cum) };
      });
      const ticks = 5;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = (yMax * k) / ticks;
        return { v, y: y(v) };
      });
      return { w, h, padL, padR, padT, padB, innerW, innerH, bars, yTicks, barW, slot };
    }, [stack, w, hMeasured]);

    if (!layout) return <div className="chart-empty">No observation data.</div>;
    const hover = hoverIdx !== null ? layout.bars[hoverIdx] : null;

    return (
      <div ref={ref} className="admin-chart-canvas">
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width={layout.w} height={layout.h}>
          {layout.yTicks.map((t, i) => (
            <line key={`g-${i}`} x1={layout.padL} x2={layout.w - layout.padR}
                  y1={t.y} y2={t.y}
                  stroke="var(--border-subtle)" strokeWidth="1"
                  vectorEffect="non-scaling-stroke" />
          ))}
          {layout.bars.map((b, i) => (
            <g key={`b-${i}`}>
              {b.segs.map((s, j) => (
                <rect key={j}
                      x={b.cx - layout.barW / 2}
                      y={s.top}
                      width={layout.barW}
                      height={Math.max(s.bot - s.top, 1)}
                      fill={s.color} fillOpacity={hoverIdx === i ? 1 : 0.85}
                      stroke="white" strokeWidth="1"
                      vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          ))}
          {layout.yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={layout.padL - 8} y={t.y + 3}
                  textAnchor="end" fontSize="10.5" fontFamily="JetBrains Mono, monospace"
                  fill="var(--text-subtle)">
              {Number(t.v).toFixed(2)}
            </text>
          ))}
          <text x={14} y={layout.padT + layout.innerH / 2}
                textAnchor="middle" fontSize="11" fill="var(--text-muted)"
                fontFamily="Inter, system-ui"
                transform={`rotate(-90, 14, ${layout.padT + layout.innerH / 2})`}>
            Weight
          </text>
          {layout.bars.map((b, i) => (
            <text key={`xl-${i}`} x={b.cx} y={layout.h - 22}
                  textAnchor="middle" fontSize="10.5"
                  fill="var(--text-muted)" fontFamily="Inter, system-ui">
              {b.month}
            </text>
          ))}
          {/* Hit targets (full slot height for easier hovering) */}
          {layout.bars.map((b, i) => (
            <rect key={`hit-${i}`}
                  x={b.cx - layout.slot / 2}
                  y={layout.padT}
                  width={layout.slot}
                  height={layout.innerH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)} />
          ))}
        </svg>
        {/* Hover tooltip */}
        {hover && (
          <div className="admin-tooltip"
               style={{ left: `${(hover.cx / layout.w) * 100}%`, top: `${hover.top - 14}px` }}>
            <div className="admin-tooltip-title">{hover.month}</div>
            {hover.segs.map((s, j) => (
              <div key={j} className="admin-tooltip-row">
                <span className="admin-tooltip-key">
                  <span className="admin-tooltip-dot" style={{ background: s.color }} /> {s.venue}
                </span>
                <span className="admin-tooltip-val font-mono">{s.val.toFixed(3)}</span>
              </div>
            ))}
            <div className="admin-tooltip-row total">
              <span className="admin-tooltip-key">Total</span>
              <span className="admin-tooltip-val font-mono">{hover.total.toFixed(3)}</span>
            </div>
          </div>
        )}
        {/* Legend */}
        <div className="admin-chart-legend admin-chart-legend-bottom">
          {stack.venues.map((v) => (
            <span key={v} className="admin-chart-legend-item">
              <span className="admin-chart-swatch" style={{
                background: { kalshi: 'var(--accent)', forecastex: '#f59e0b', polymarket: '#10b981', oriel: '#8b5cf6' }[v] || '#94a3b8'
              }} />
              {v}
            </span>
          ))}
        </div>
      </div>
    );
  }

  /* ── Publishability bar chart with threshold lines ── */
  function PublishabilityBarChart({ quality }) {
    const [ref, w, hMeasured] = useChartSize(560, 320);
    const [hoverIdx, setHoverIdx] = useState(null);
    const layout = useMemo(() => {
      if (!quality.length) return null;
      const h = Math.max(hMeasured || 0, 240);
      const padL = 56, padR = 22, padT = 22, padB = 50;
      const innerW = Math.max(w - padL - padR, 40);
      const innerH = h - padT - padB;
      const yMax = 1.10;
      const slot = innerW / Math.max(quality.length, 1);
      const barW = Math.min(slot * 0.50, 50);
      const x = (i) => padL + slot * (i + 0.5);
      const y = (v) => padT + innerH - (v / yMax) * innerH;
      const decisionColor = (d) => d === 'publish' ? 'var(--success)' : d === 'restricted' ? '#f59e0b' : 'var(--danger)';
      const bars = quality.map((q, i) => ({
        ...q,
        month: q.targetMonth,
        score: q.publishabilityScore,
        decision: q.publicationDecision,
        cx: x(i),
        top: y(q.publishabilityScore),
        bot: y(0),
        color: decisionColor(q.publicationDecision),
      }));
      const ticks = 5;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = (1.0 * k) / ticks;
        return { v, y: y(v) };
      });
      return {
        w, h, padL, padR, padT, padB, innerW, innerH, bars, yTicks, barW, slot,
        publishLineY: y(0.80),
        restrictedLineY: y(0.65),
      };
    }, [quality, w, hMeasured]);

    if (!layout) return <div className="chart-empty">No quality data.</div>;
    const hover = hoverIdx !== null ? layout.bars[hoverIdx] : null;

    return (
      <div ref={ref} className="admin-chart-canvas">
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width={layout.w} height={layout.h}>
          {layout.yTicks.map((t, i) => (
            <line key={`g-${i}`} x1={layout.padL} x2={layout.w - layout.padR}
                  y1={t.y} y2={t.y}
                  stroke="var(--border-subtle)" strokeWidth="1"
                  vectorEffect="non-scaling-stroke" />
          ))}
          {/* Threshold lines */}
          <line x1={layout.padL} x2={layout.w - layout.padR}
                y1={layout.publishLineY} y2={layout.publishLineY}
                stroke="var(--success)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
          <line x1={layout.padL} x2={layout.w - layout.padR}
                y1={layout.restrictedLineY} y2={layout.restrictedLineY}
                stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
          <text x={layout.w - layout.padR - 4} y={layout.publishLineY - 4} textAnchor="end" fontSize="10" fill="var(--success)" fontFamily="JetBrains Mono, monospace">{'≥'}0.80 publish</text>
          <text x={layout.w - layout.padR - 4} y={layout.restrictedLineY - 4} textAnchor="end" fontSize="10" fill="#f59e0b" fontFamily="JetBrains Mono, monospace">{'≥'}0.65 restricted</text>
          {/* Bars */}
          {layout.bars.map((b, i) => (
            <g key={`b-${i}`}>
              <rect x={b.cx - layout.barW / 2} y={b.top}
                    width={layout.barW}
                    height={Math.max(b.bot - b.top, 1)}
                    rx="3" fill={b.color} fillOpacity={hoverIdx === i ? 0.80 : 0.50}
                    stroke={b.color} strokeWidth="1.4"
                    vectorEffect="non-scaling-stroke" />
              <text x={b.cx} y={b.top - 5} textAnchor="middle"
                    fontSize="10.5" fontFamily="JetBrains Mono, monospace" fill="var(--text)">
                {fmt2(b.score)}
              </text>
            </g>
          ))}
          {layout.yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={layout.padL - 8} y={t.y + 3}
                  textAnchor="end" fontSize="10.5" fontFamily="JetBrains Mono, monospace"
                  fill="var(--text-subtle)">
              {Number(t.v).toFixed(2)}
            </text>
          ))}
          {layout.bars.map((b, i) => (
            <text key={`xl-${i}`} x={b.cx} y={layout.h - 22}
                  textAnchor="middle" fontSize="10.5"
                  fill="var(--text-muted)" fontFamily="Inter, system-ui">
              {b.month}
            </text>
          ))}
          {/* Hit targets */}
          {layout.bars.map((b, i) => (
            <rect key={`hit-${i}`}
                  x={b.cx - layout.slot / 2}
                  y={layout.padT}
                  width={layout.slot}
                  height={layout.innerH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)} />
          ))}
        </svg>
        {hover && (
          <div className="admin-tooltip"
               style={{ left: `${(hover.cx / layout.w) * 100}%`, top: `${hover.top - 14}px` }}>
            <div className="admin-tooltip-title">{hover.month}</div>
            <div className="admin-tooltip-row">
              <span className="admin-tooltip-key">Pub score</span>
              <span className="admin-tooltip-val font-mono">{fmt4(hover.publishabilityScore)}</span>
            </div>
            <div className="admin-tooltip-row">
              <span className="admin-tooltip-key">Decision</span>
              <span className="admin-tooltip-val" style={{ color: hover.color }}>{ADMIN.decisionLabel(hover.decision)}</span>
            </div>
            <div className="admin-tooltip-row">
              <span className="admin-tooltip-key">Quality</span>
              <span className="admin-tooltip-val font-mono">{fmt4(hover.qualityScore)}</span>
            </div>
            <div className="admin-tooltip-row">
              <span className="admin-tooltip-key">Timestamp int.</span>
              <span className="admin-tooltip-val font-mono">{fmt4(hover.timestampIntegrityScore)}</span>
            </div>
            <div className="admin-tooltip-row">
              <span className="admin-tooltip-key">Source div.</span>
              <span className="admin-tooltip-val font-mono">{fmt4(hover.sourceDiversityScore)}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Curve comparison line chart ── */
  function CurveComparisonChart({ outputs }) {
    const [ref, w, hMeasured] = useChartSize(560, 320);
    const [hoverIdx, setHoverIdx] = useState(null);
    const layout = useMemo(() => {
      if (!outputs.length) return null;
      const h = Math.max(hMeasured || 0, 240);
      const padL = 56, padR = 22, padT = 18, padB = 48;
      const innerW = Math.max(w - padL - padR, 40);
      const innerH = h - padT - padB;
      const allY = [
        ...outputs.map((o) => o.observedMarketImplied),
        ...outputs.map((o) => o.blendedReference),
        ...outputs.map((o) => o.fairValue),
      ].filter((v) => v != null && isFinite(v));
      const yMin = Math.min(...allY);
      const yMax = Math.max(...allY);
      const span = (yMax - yMin) || 1;
      const yLo = yMin - span * 0.20;
      const yHi = yMax + span * 0.20;
      const ySpan = yHi - yLo || 1;
      const x = (i) => padL + (outputs.length === 1 ? innerW / 2 : (innerW * i) / (outputs.length - 1));
      const y = (v) => padT + innerH - ((v - yLo) / ySpan) * innerH;
      const marketPath = outputs.map((o, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(o.observedMarketImplied).toFixed(2)}`).join(' ');
      const blendedPath = outputs.map((o, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(o.blendedReference).toFixed(2)}`).join(' ');
      const fvPath = outputs.map((o, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(o.fairValue).toFixed(2)}`).join(' ');
      const points = outputs.map((o, i) => ({
        ...o, cx: x(i),
        marketY: y(o.observedMarketImplied),
        blendedY: y(o.blendedReference),
        fvY: y(o.fairValue),
      }));
      const ticks = 4;
      const yTicks = Array.from({ length: ticks + 1 }, (_, k) => {
        const v = yLo + (ySpan * k) / ticks;
        return { v, y: y(v) };
      });
      const hitW = Math.max(innerW / Math.max(outputs.length, 1), 32);
      return { w, h, padL, padR, padT, padB, innerW, innerH, marketPath, blendedPath, fvPath, points, yTicks, hitW };
    }, [outputs, w, hMeasured]);

    if (!layout) return <div className="chart-empty">No output data.</div>;
    const hover = hoverIdx !== null ? layout.points[hoverIdx] : null;

    return (
      <div ref={ref} className="admin-chart-canvas">
        <svg viewBox={`0 0 ${layout.w} ${layout.h}`} width={layout.w} height={layout.h}>
          {layout.yTicks.map((t, i) => (
            <line key={`g-${i}`} x1={layout.padL} x2={layout.w - layout.padR}
                  y1={t.y} y2={t.y}
                  stroke="var(--border-subtle)" strokeWidth="1"
                  vectorEffect="non-scaling-stroke" />
          ))}
          {/* Market (dashed muted) */}
          <path d={layout.marketPath} fill="none"
                stroke="var(--text-muted)" strokeWidth="1.8"
                strokeDasharray="5 4" strokeLinecap="round"
                vectorEffect="non-scaling-stroke" opacity="0.85" />
          {/* Fair Value (thin secondary) */}
          <path d={layout.fvPath} fill="none"
                stroke="#f59e0b" strokeWidth="1.6"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke" opacity="0.85" />
          {/* Blended (solid lead, accent) */}
          <path d={layout.blendedPath} fill="none"
                stroke="var(--accent)" strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" />
          {layout.points.map((p, i) => (
            <g key={`pt-${i}`}>
              <circle cx={p.cx} cy={p.marketY} r="3" fill="white" stroke="var(--text-muted)" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
              <circle cx={p.cx} cy={p.fvY} r="3" fill="white" stroke="#f59e0b" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
              <circle cx={p.cx} cy={p.blendedY} r={hoverIdx === i ? 6 : 4.5} fill="var(--accent)" stroke="white" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {layout.yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={layout.padL - 8} y={t.y + 3}
                  textAnchor="end" fontSize="10.5" fontFamily="JetBrains Mono, monospace"
                  fill="var(--text-subtle)">
              {Number(t.v).toFixed(3)}
            </text>
          ))}
          <text x={14} y={layout.padT + layout.innerH / 2}
                textAnchor="middle" fontSize="11" fill="var(--text-muted)"
                fontFamily="Inter, system-ui"
                transform={`rotate(-90, 14, ${layout.padT + layout.innerH / 2})`}>
            Implied YoY
          </text>
          {layout.points.map((p, i) => (
            <text key={`xl-${i}`} x={p.cx} y={layout.h - 22}
                  textAnchor="middle" fontSize="10.5"
                  fill="var(--text-muted)" fontFamily="Inter, system-ui">
              {p.targetMonth}
            </text>
          ))}
          {/* Hit targets */}
          {layout.points.map((p, i) => (
            <rect key={`hit-${i}`}
                  x={p.cx - layout.hitW / 2}
                  y={layout.padT}
                  width={layout.hitW}
                  height={layout.innerH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)} />
          ))}
        </svg>
        {hover && (
          <div className="admin-tooltip"
               style={{ left: `${(hover.cx / layout.w) * 100}%`,
                        top: `${Math.min(hover.marketY, hover.blendedY, hover.fvY) - 14}px` }}>
            <div className="admin-tooltip-title">{hover.targetMonth}</div>
            <div className="admin-tooltip-row">
              <span className="admin-tooltip-key"><span className="admin-tooltip-dot" style={{ background: 'var(--accent)' }} /> Blended</span>
              <span className="admin-tooltip-val font-mono">{fmt4(hover.blendedReference)}</span>
            </div>
            <div className="admin-tooltip-row">
              <span className="admin-tooltip-key"><span className="admin-tooltip-dot" style={{ background: 'var(--text-muted)' }} /> Market</span>
              <span className="admin-tooltip-val font-mono">{fmt4(hover.observedMarketImplied)}</span>
            </div>
            <div className="admin-tooltip-row">
              <span className="admin-tooltip-key"><span className="admin-tooltip-dot" style={{ background: '#f59e0b' }} /> Fair value</span>
              <span className="admin-tooltip-val font-mono">{fmt4(hover.fairValue)}</span>
            </div>
            <div className="admin-tooltip-row">
              <span className="admin-tooltip-key">Top source</span>
              <span className="admin-tooltip-val">{hover.topWeightedSource || '—'}</span>
            </div>
            <div className="admin-tooltip-row">
              <span className="admin-tooltip-key">Decision</span>
              <span className="admin-tooltip-val">{ADMIN.decisionLabel(hover.publicationDecision)}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TAB 4 — PUBLICATION CONTROLS
     ═══════════════════════════════════════════════════════════════════════ */
  function PublicationTab({ quality, outputs, record }) {
    const counts = ADMIN.decisionCounts();
    const avgTs  = ADMIN.avgScore('timestampIntegrityScore');
    const avgDiv = ADMIN.avgScore('sourceDiversityScore');

    /* Merge quality + outputs to get reasonCodes per row */
    const merged = useMemo(() => {
      const reasonByMonth = {};
      outputs.forEach((o) => { reasonByMonth[o.targetMonth] = o.reasonCodes || []; });
      return quality.map((q) => ({ ...q, reasonCodes: reasonByMonth[q.targetMonth] || [] }));
    }, [quality, outputs]);

    return (
      <div className="admin-pub">
        {/* Top KPI strip — publication summary */}
        <section className="idx-kpi admin-kpi">
          <div className="idx-kpi-ribbon">
            <span className="idx-kpi-ribbon-tag">PUBLICATION SUMMARY</span>
            <span className="idx-kpi-ribbon-sep">·</span>
            <span className="idx-kpi-ribbon-venue">Decision breakdown · governed quality thresholds</span>
          </div>
          <div className="admin-kpi-grid">
            <KpiCell label="Publish"            value={String(counts.publish)} sub="Score ≥ 0.80" tone="success" mono lead />
            <KpiCell label="Restricted"         value={String(counts.restricted)} sub="Score 0.65–0.80" tone="warning" mono lead />
            <KpiCell label="Hold"               value={String(counts.hold)} sub="Score < 0.65" tone="danger" mono lead />
            <KpiCell label="Avg timestamp integrity" value={avgTs != null ? avgTs.toFixed(2) : '—'} sub="Quote age freshness" tone={avgTs >= 0.80 ? 'success' : 'warning'} mono />
            <KpiCell label="Avg source diversity"    value={avgDiv != null ? avgDiv.toFixed(2) : '—'} sub="Venue concentration" tone={avgDiv >= 0.75 ? 'success' : 'warning'} mono />
          </div>
        </section>

        <div className="admin-pub-row">
          {/* LEFT — Quality breakdown table (full width on left side) */}
          <section className="data-card">
            <header className="data-card-head">
              <div>
                <div className="data-card-title">Quality Score Breakdown by Bucket</div>
                <div className="data-card-sub">
                  Quality (20%) + timestamp integrity (20%) + source diversity (20%) + fallback penalty (15%) + continuity (15%) + other (10%)
                </div>
              </div>
            </header>
            <div className="data-card-body" style={{ padding: 0 }}>
              <div className="admin-table-scroll">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Target Month</th>
                      <th className="num">Quality</th>
                      <th className="num">Timestamp Int.</th>
                      <th className="num">Source Div.</th>
                      <th className="num">Continuity</th>
                      <th className="num">Fallback Pen.</th>
                      <th className="num">Pub Score</th>
                      <th>Decision</th>
                      <th>Reason Codes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merged.map((q) => (
                      <tr key={q.targetMonth} className={cn(q.publicationDecision === 'hold' && 'admin-row-flagged')}>
                        <td className="font-mono">{q.targetMonth}</td>
                        <td className="num font-mono">{fmt4(q.qualityScore)}</td>
                        <td className="num font-mono">{fmt4(q.timestampIntegrityScore)}</td>
                        <td className="num font-mono">{fmt4(q.sourceDiversityScore)}</td>
                        <td className="num font-mono">{fmt4(q.continuityScore)}</td>
                        <td className="num font-mono">{fmt4(q.fallbackPenaltyAdjustedScore)}</td>
                        <td className="num font-mono strong">{fmt4(q.publishabilityScore)}</td>
                        <td><DecisionBadge decision={q.publicationDecision} /></td>
                        <td className="text-muted small">{q.reasonCodes.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* RIGHT — Decision Thresholds + Override Status */}
          <div className="admin-pub-rail">
            <section className="data-card">
              <header className="data-card-head">
                <div>
                  <div className="data-card-title">Decision Thresholds</div>
                  <div className="data-card-sub">Publication score bands</div>
                </div>
              </header>
              <div className="data-card-body admin-card-body">
                <DefList rows={[
                  { label: 'Publish',    value: <span className="tone-success">score ≥ 0.80</span>, sub: 'full publication' },
                  { label: 'Restricted', value: <span className="tone-warning">0.65–0.80</span>,    sub: 'diagnostic only' },
                  { label: 'Hold',       value: <span className="tone-danger">{'score < 0.65'}</span>, sub: 'withheld' },
                ]} />
              </div>
            </section>

            <section className="data-card">
              <header className="data-card-head">
                <div>
                  <div className="data-card-title">Override Status</div>
                  <div className="data-card-sub">Manual governance interventions</div>
                </div>
              </header>
              <div className="data-card-body admin-card-body">
                <DefList rows={[
                  { label: 'Override applied', value: record.overrideApplied ? <Badge variant="warning" dot>Yes</Badge> : <Badge variant="default" dot>None</Badge>, sub: '' },
                  { label: 'Override note',    value: record.overrideNote || '—', sub: '' },
                ]} />
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
     TAB 5 — AUDIT TRAIL
     ═══════════════════════════════════════════════════════════════════════ */
  function AuditTab({ runs, fallback, record, def }) {
    return (
      <div className="admin-audit">
        {/* Run history (full width) */}
        <section className="data-card">
          <header className="data-card-head">
            <div>
              <div className="data-card-title">Run History</div>
              <div className="data-card-sub">
                Last {runs.length} runs · publication status · bucket outcomes · override flag · fallback count
              </div>
            </div>
          </header>
          <div className="data-card-body" style={{ padding: 0 }}>
            <div className="admin-table-scroll">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>As-of</th>
                    <th>Methodology</th>
                    <th className="num">Published</th>
                    <th className="num">Held</th>
                    <th className="num">Restricted</th>
                    <th>Override</th>
                    <th className="num">Fallbacks</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.runId}>
                      <td className="font-mono small">{r.runId}</td>
                      <td className="font-mono">{fmtIsoShort(r.asOf)}</td>
                      <td className="font-mono">{r.methodologyVersion}</td>
                      <td className="num font-mono strong">{r.publishedBuckets}</td>
                      <td className="num font-mono">{r.heldBuckets}</td>
                      <td className="num font-mono">{r.restrictedBuckets}</td>
                      <td>{r.overrides === 'Yes' ? <Badge variant="warning">Override</Badge> : <span className="text-muted">No</span>}</td>
                      <td className="num font-mono">{r.fallbackCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 2-col row: Fallback Hierarchy + Latest Publication Record */}
        <div className="admin-audit-row">
          <section className="data-card">
            <header className="data-card-head">
              <div>
                <div className="data-card-title">Fallback Hierarchy Usage</div>
                <div className="data-card-sub">Per-bucket fallback level and reason</div>
              </div>
            </header>
            <div className="data-card-body" style={{ padding: 0 }}>
              <div className="admin-table-scroll">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Target Month</th>
                      <th>Fallback Used</th>
                      <th>Fallback Level</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fallback.map((f) => (
                      <tr key={f.targetMonth} className={cn(f.fallbackUsed && 'admin-row-flagged')}>
                        <td className="font-mono">{f.targetMonth}</td>
                        <td>{f.fallbackUsed ? <Badge variant="warning">Yes</Badge> : <span className="text-muted">No</span>}</td>
                        <td className="text-muted small">{f.fallbackLevel}</td>
                        <td className="text-muted small">{f.fallbackReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="data-card">
            <header className="data-card-head">
              <div>
                <div className="data-card-title">Latest Publication Record</div>
                <div className="data-card-sub">Run audit context for the active publication</div>
              </div>
            </header>
            <div className="data-card-body admin-card-body">
              <DefList rows={[
                { label: 'Run ID',     value: record.runId, sub: fmtIso(record.createdAt), mono: true },
                { label: 'Index',      value: record.indexId, sub: def.methodologyVersion, mono: true },
                { label: 'Status',     value: <span className={`tone-${record.publicationStatus?.startsWith('published') ? 'success' : 'warning'}`}>{record.publicationStatus}</span>, sub: 'governed' },
                { label: 'Published',  value: <span className="tone-success">{(record.publishedBuckets || []).join(', ') || '—'}</span>, sub: `${(record.publishedBuckets || []).length} bucket(s)` },
                { label: 'Held',       value: <span className="tone-danger">{(record.heldBuckets || []).join(', ') || '—'}</span>, sub: `${(record.heldBuckets || []).length} bucket(s)` },
                { label: 'Override',   value: record.overrideApplied ? 'Yes' : 'No', sub: record.overrideNote || '—' },
              ]} />
            </div>
          </section>
        </div>
      </div>
    );
  }

  /* ───────────────────────── helpers ───────────────────────── */
  function downloadCsv(filename, rows) {
    if (!rows || !rows.length) return;
    const cols = Object.keys(rows[0]);
    const csv = [cols.join(',')]
      .concat(rows.map((r) => cols.map((c) => {
        const v = r[c];
        if (v == null) return '';
        const s = Array.isArray(v) ? v.join('|') : String(v);
        return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.App = window.App || {};
  window.App.IndexAdminView = IndexAdminView;
})();
