/* ==========================================================================
   IndexDetailView.jsx — Detail page for one index, with horizontal sub-tabs
   at the top (per Chris: "I'd like to retain the tab navigation or modules
   at the top -- consistent with ForecastTrader (Interactive Brokers)").

   Layout:
     [KPI strip — always]
     [DetailTabBar — Overview | Methodology | Distribution | Constituents | …]
     [Active panel]

   Tab visibility is conditional on the detail blob's flags:
     • overview      — always (when detail exists)
     • methodology   — always
     • distribution  — when bucketSnapshots[]
     • basis         — when basis (Tier 1 perp)
     • gates         — when parityGates
     • constituents  — always (forwardCurve + constituents)
     • monitor       — when medicalCpiMonitor (HC only)
     • notes         — always

   Registers window.App.IndexDetailView.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useMemo, useEffect } = React;
  const { cn } = window.App.utils;
  const {
    Icon, Badge,
    IndexKpiStrip,
    HeroChartCard, IndexPrintCard, MarketVsSignalCard,
    MethodologySteps, IndexInfoRow, IndexDataTabs, PerpReadinessPanel, PerpControlsBar,
    BasisDecomposition, VenueBlend, ParityGateStrip,
    MedicalCpiMonitor, NotesPanel, VolSurfacePanel,
    CmsKpiStrip, CmsOverviewPanel, CmsValidationPanel,
    MedicalBasisKpiStrip, MedicalBasisOverviewPanel,
    ParityOverviewPanel,
  } = window.App;

  // The standalone "Distribution" tab was removed — the Overview's
  // HeroChartCard already exposes a "Front maturity" inner tab that renders
  // the same DistributionChart for the front anchor.
  const TAB_DEFS = [
    { key: 'overview',     label: 'Overview',           icon: 'layers' },
    { key: 'methodology',  label: 'Methodology',        icon: 'sliders' },
    { key: 'basis',        label: 'Basis',              icon: 'activity',   needs: 'basis' },
    { key: 'gates',        label: 'Gates',              icon: 'shield',     needs: 'parity' },
    { key: 'volsurface',   label: 'Vol Surface',        icon: 'pulse',      needs: 'volSurface' },
    { key: 'constituents', label: 'Constituents',       icon: 'database' },
    { key: 'monitor',      label: 'Medical CPI Monitor', icon: 'pulse',     needs: 'monitor' },
    { key: 'notes',        label: 'Notes',              icon: 'book' },
  ];

  // Perp index extra tabs — one per major v7 section so each page stays
  // focused. v7 packs 7 sections onto one long scroll; we split them into
  // their own sub-pages (parent renders single nav bar; each tab is one
  // section deep-dive). User explicitly asked for "more tabs" instead of
  // dense single tabs.
  //   v7 §5+§11+§6cal → Construction
  //   v7 §7           → Source Blend
  //   v7 §8           → Distribution
  //   v7 §9           → Freshness
  //   v7 §10          → Diagnostics
  //   v7 §6 right     → Trade Ideas
  const PERP_EXTRA_TABS = [
    { key: 'perp-construction', label: 'Construction',           icon: 'sliders' },
    { key: 'perp-playbook',     label: 'Calibration & Playbook', icon: 'sparkles' },
    { key: 'perp-blend',        label: 'Source Blend',           icon: 'shuffle' },
    { key: 'perp-distribution', label: 'Distribution',           icon: 'bar-chart' },
    { key: 'perp-freshness',    label: 'Freshness',              icon: 'clock' },
    { key: 'perp-diagnostics',  label: 'Diagnostics',            icon: 'activity' },
  ];

  // Parity index extra tabs — same splice pattern as perp. v7 stacks 4 huge
  // sub-tabs INSIDE one parity_tab; we promote them to the main tab bar so
  // each parity sub-view is its own focused page (same layout vocabulary
  // — hero-row + herochart-card + info-row — as every other index tab).
  //   v7 pt_term  → Term Calibration  (DTCC live, REFERENCE only)
  //   v7 pt_tight → Reference OTC     (tighter sample)
  //   v7 pt_dtcc  → DTCC SDR Sample   (static dtcc demo)
  //   v7 pt_neg   → Stress Case       (negative control)
  const PARITY_EXTRA_TABS = [
    { key: 'parity-term',   label: 'Term Calibration', icon: 'database' },
    { key: 'parity-tight',  label: 'Reference OTC',    icon: 'check' },
    { key: 'parity-dtcc',   label: 'DTCC SDR',         icon: 'shield' },
    { key: 'parity-stress', label: 'Stress Case',      icon: 'info' },
  ];

  // Per-index tab visibility overrides. Constituents stays visible whenever
  // we have the data (even if v7 doesn't expose it as a tab — the redesign's
  // job is to surface what's there). Notes is hidden for venues where v7
  // has no notes/disclosure source so we don't ship invented copy.
  const HIDDEN_TABS_BY_INDEX = {
    fx:   new Set(['notes']),
    // perp's overview now renders the full PerpReadinessPanel (v7-equivalent
    // KPI strips + charts + Perp Print + sub-tabs), so the standalone 'basis'
    // tab becomes redundant. 'notes' was hand-authored copy with no v7 source.
    perp: new Set(['notes', 'basis']),
    // cms uses the standard tab set (Overview, Methodology, Constituents).
    // The pipeline-specific KPI strip lives in the sticky head via
    // CmsKpiStrip; v7 cms_tab body sections will be ported back in
    // user-guided steps. No notes/basis tab for now.
    cms:  new Set(['notes', 'basis']),
    // mb: ForecastEx Medical Basis tab — Overview is the entire v7
    // medical_basis_tab content. Methodology + Constituents stay
    // standard. No notes/basis sub-tab for now.
    mb:   new Set(['notes', 'basis']),
    // parity: full v7 parity_tab body lives inside the Overview's 4
    // sub-tabs. The standard 'gates' tab becomes redundant (the Publish
    // Gate table is shown inline per benchmark). Methodology and
    // Constituents stay so users can drill into the v7 thresholds and
    // benchmark file list. No basis/notes for now.
    parity: new Set(['overview', 'notes', 'basis', 'gates']),
  };

  function buildTabs(index) {
    const d = index.detail;
    const hidden = HIDDEN_TABS_BY_INDEX[index.key] || new Set();
    const base = TAB_DEFS.filter((t) => {
      if (hidden.has(t.key)) return false;
      if (!t.needs) return true;
      if (t.needs === 'basis')      return !!d.basis;
      if (t.needs === 'parity')     return !!d.parityGates;
      if (t.needs === 'monitor')    return !!d.medicalCpiMonitor;
      if (t.needs === 'volSurface') return !!d.volSurface;
      return true;
    });
    // For perp, splice the v7 perp sub-sections in right after Overview so
    // the user sees one flat tab bar (Overview · Construction · Source
    // Blend · …) instead of nested tab strips.
    if (index.key === 'perp' && d.perp) {
      const overviewIdx = base.findIndex((t) => t.key === 'overview');
      base.splice(overviewIdx + 1, 0, ...PERP_EXTRA_TABS);
    }
    // CMS — splice the "Validation" sub-tab right after Overview.
    // Carries v7's Trading + Benchmark + Provenance content combined.
    if (index.key === 'cms' && d.cms) {
      const overviewIdx = base.findIndex((t) => t.key === 'overview');
      base.splice(overviewIdx + 1, 0, { key: 'cms-validation', label: 'Validation', icon: 'sparkles' });
    }
    // Parity — splice the 4 v7 parity sub-views as their own top-level
    // tabs (Term Calibration · Reference OTC · DTCC SDR · Stress Case).
    // Same pattern as perp: each gets a focused page rather than being
    // crammed into a single dense scroll.
    if (index.key === 'parity' && d.parity) {
      const overviewIdx = base.findIndex((t) => t.key === 'overview');
      base.splice(overviewIdx + 1, 0, ...PARITY_EXTRA_TABS);
    }
    return base;
  }

  function IndexDetailView({ index, onBack }) {
    if (!index) return null;
    const d = index.detail;
    const hasDetail = !!d;

    const tabs = useMemo(() => (hasDetail ? buildTabs(index) : []), [index, hasDetail]);
    const [tab, setTab] = useState(tabs[0]?.key || 'overview');

    // Live data mode is owned by the detail view so the toggle in
    // IndexKpiStrip can drive label / version / source changes in
    // sibling cards (IndexPrintCard, NotesPanel, etc.).
    // Default ON when a live variant exists; OFF reverts to v7 sample data.
    const hasLive = !!(d && d.liveVariant);
    const [liveOn, setLiveOn] = useState(hasLive);
    useEffect(() => { setLiveOn(!!(d && d.liveVariant)); }, [d]);

    // Whenever the toggle flips, apply the matching variant in-place on the
    // index detail object so all sibling cards (forward curve, vol surface,
    // constituents, etc.) re-render with the active dataset.
    // `_variantTick` forces a re-render after the in-place mutation.
    const [variantTick, setVariantTick] = useState(0);

    // Medical Basis maturity selector — lifted out of the panel so the
    // sticky-head MedicalBasisKpiStrip can drive it and the Overview
    // body charts re-render in lockstep. Defaults to v7's `default_ix =
    // min(1, len(maturities) - 1)` so the strip lands on 2027 first.
    const mbDefaultIdx = (index.key === 'mb' && d?.mb?.basisPoints?.length)
      ? Math.min(1, d.mb.basisPoints.length - 1) : 0;
    const [mbSelectedIdx, setMbSelectedIdx] = useState(mbDefaultIdx);
    useEffect(() => { setMbSelectedIdx(mbDefaultIdx); }, [index.key, mbDefaultIdx]);

    // Perp controls — lifted up from PerpReadinessPanel so the controls
    // bar can live in the sticky head and stay visible on scroll. Only
    // initialized when the index is perp; other indices ignore these.
    const perpDefaults = (index.key === 'perp' && d?.perp?.controls) || {};
    const [perpFv,  setPerpFv]  = useState(perpDefaults.fvHorizonDays ?? 30);
    const [perpPb,  setPerpPb]  = useState(perpDefaults.perpBasisBp ?? 12);
    const [perpDs,  setPerpDs]  = useState(perpDefaults.diagSpreadBp ?? 12);
    const [perpStale, setPerpStale] = useState(perpDefaults.diagStaleMin ?? 15);
    const perpControls = {
      fvHorizon: perpFv,   setFvHorizon: setPerpFv,
      perpBasis: perpPb,   setPerpBasis: setPerpPb,
      diagSpread: perpDs,  setDiagSpread: setPerpDs,
      diagStale: perpStale, setDiagStale: setPerpStale,
    };
    useEffect(() => {
      if (!d || (!d.liveVariant && !d.sampleVariant)) return;
      window.App.applyDetailVariant(d, liveOn ? 'live' : 'sample');
      setVariantTick((t) => t + 1);
    }, [liveOn, d]);

    // If we land on a different index whose tab set doesn't include the
    // currently-selected tab, snap back to the first available tab.
    useEffect(() => {
      if (!tabs.find((t) => t.key === tab)) setTab(tabs[0]?.key || 'overview');
    }, [tabs, tab]);

    // Parity Cockpit cards dispatch a 'parity:goto' CustomEvent when clicked
    // (carries { tab: 'parity-tight' | 'parity-dtcc' | ... }). Listen here
    // so the cockpit can drive the main tab bar without prop-drilling state
    // into a deeply nested panel component.
    useEffect(() => {
      if (index.key !== 'parity') return;
      const onGoto = (e) => {
        const target = e?.detail?.tab;
        if (target && tabs.find((t) => t.key === target)) {
          setTab(target);
          // scroll back to top so the user sees the destination's hero
          window.scrollTo?.({ top: 0, behavior: 'smooth' });
        }
      };
      window.addEventListener('parity:goto', onGoto);
      return () => window.removeEventListener('parity:goto', onGoto);
    }, [index.key, tabs]);

    if (!hasDetail) {
      return (
        <div className="view detail-view">
          <DetailScaffold index={index} onBack={onBack} />
        </div>
      );
    }

    return (
      <div className="view detail-view">
        {/* Sticky head: KPI strip + sub-tab bar stay pinned while body scrolls.
            CMS and Medical Basis each swap in their own custom strip,
            same .idx-kpi card chrome but with index-specific cells. */}
        <div className="detail-sticky-head">
          {index.key === 'cms' && d.cms ? (
            <CmsKpiStrip index={index} />
          ) : index.key === 'mb' && d.mb ? (
            <MedicalBasisKpiStrip
              index={index}
              selectedIdx={mbSelectedIdx}
              onSelectIdx={setMbSelectedIdx}
            />
          ) : index.key === 'parity' && d.parity ? (
            // Parity: skip the standard IndexKpiStrip entirely. v7's
            // parity_tab.py has no global KPI ribbon — each of the 4 sub-
            // tabs carries its own context-specific KPI strip in the body.
            // Showing a generic strip here would (a) duplicate that info
            // and (b) misrender bps as % via the IndexPrint front/back
            // formatter. Only the DetailTabBar pins to the sticky head.
            null
          ) : (
            d.indexPrint && <IndexKpiStrip index={index} liveOn={liveOn} onLiveChange={setLiveOn} />
          )}
          <DetailTabBar tabs={tabs} active={tab} onChange={setTab} accent={index.accent} />
        </div>

        <div className="detail-tab-body">
          {tab === 'overview'     && <OverviewPanel     index={index} liveOn={liveOn} mbSelectedIdx={mbSelectedIdx} />}
          {tab === 'methodology'  && <MethodologyPanel  index={index} />}
          {tab === 'basis'        && <BasisPanel        index={index} />}
          {tab === 'gates'        && <GatesPanel        index={index} />}
          {tab === 'volsurface'   && <VolSurfacePanel   index={index} />}
          {tab === 'constituents' && <ConstituentsPanel index={index} />}
          {tab === 'monitor'      && <MonitorPanel      index={index} />}
          {tab === 'notes'        && <NotesPanel        index={index} liveOn={liveOn} />}
          {tab.startsWith('perp-') && <PerpReadinessPanel index={index} subtab={tab.slice(5)} />}
          {tab.startsWith('parity-') && <ParityOverviewPanel index={index} subtab={tab.slice(7)} />}
          {tab === 'cms-validation' && <CmsValidationPanel index={index} />}
        </div>
      </div>
    );
  }

  /* ─────────────────────────  Tab bar  ───────────────────────────── */
  function DetailTabBar({ tabs, active, onChange, accent }) {
    return (
      <nav className={cn('detail-tabbar', `accent-${accent}`)} role="tablist" aria-label="Index sections">
        <div className="detail-tabbar-inner">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              className={cn('detail-tab', active === t.key && 'active')}
              onClick={() => onChange(t.key)}
            >
              <Icon name={t.icon} size={14} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    );
  }

  /* ─────────────────────────  Panels  ────────────────────────────── */
  function OverviewPanel({ index, liveOn, mbSelectedIdx }) {
    const d = index.detail;
    // Perp/CPI Basis lands directly on the Tier-1 readiness panel (the v7
    // perp_readiness_tab equivalent), since it has its own KPI strips and
    // charts that supersede the generic hero/print layout.
    if (index.key === 'perp' && d.perp) {
      return <PerpReadinessPanel index={index} subtab="overview" />;
    }
    // CMS / Healthcare Reference uses its own Overview body — a 3-line
    // translation chart (public rail / Oriel spot / CMS anchor with band)
    // plus Basis & Action and Crosswalk Decomposition cards in the rail.
    // Same .hero-row + .ip-card + .mvs-card primitives as every other tab.
    if (index.key === 'cms' && d.cms) {
      return <CmsOverviewPanel index={index} />;
    }
    // ForecastEx Medical Basis — its own contract-design Overview body
    // (reference legs + spec table + settlement calculator + 3-sub-tab
    // chart card + sample ladder). Maturity state is driven from the
    // sticky head so the strip and charts stay in lockstep.
    if (index.key === 'mb' && d.mb) {
      return <MedicalBasisOverviewPanel index={index} selectedIdx={mbSelectedIdx} />;
    }
    // OTC Parity Validation — its own 4-sub-tab body (Term Calibration ·
    // Reference OTC · DTCC SDR · Stress Case). Each parity sub-view shows
    // status banner + KPI row + 2 charts + gate/detail tables + front
    // month + methodology. Mirrors v7 tabs/parity_tab.py 1:1 in DATA.
    if (index.key === 'parity' && d.parity) {
      return <ParityOverviewPanel index={index} />;
    }
    return (
      <div className="hero-row">
        <HeroChartCard index={index} />
        <div className="hero-row-rail">
          {d.indexPrint && <IndexPrintCard index={index} liveOn={liveOn} />}
          {d.dislocation && <MarketVsSignalCard index={index} />}
        </div>
      </div>
    );
  }

  function MethodologyPanel({ index }) {
    const d = index.detail;
    return (
      <div className="methodology-panel">
        <MethodologySteps steps={d.methodology.steps} accent={index.accent} />
        <IndexInfoRow index={index} />
      </div>
    );
  }

  function BasisPanel({ index }) {
    const d = index.detail;
    // Perp index gets the rich Tier-1 readiness panel powered by v7's
    // analytics.tier1_fv_engine + cpi_basis_diagnostics output. Other
    // indices fall back to the simpler basis decomposition.
    if (index.key === 'perp' && d.perp) {
      return <PerpReadinessPanel index={index} subtab="overview" />;
    }
    return (
      <div className="basis-panel">
        <BasisDecomposition basis={d.basis} accent={index.accent} />
        {d.venueBlend && <VenueBlend blend={d.venueBlend} accent={index.accent} />}
      </div>
    );
  }

  function GatesPanel({ index }) {
    const d = index.detail;
    return <ParityGateStrip gates={d.parityGates} accent={index.accent} />;
  }

  function ConstituentsPanel({ index }) {
    return <IndexDataTabs index={index} />;
  }

  function MonitorPanel({ index }) {
    return <MedicalCpiMonitor data={index.detail.medicalCpiMonitor} />;
  }

  /* ─────────────────────────  Scaffold (no detail)  ───────────────── */
  function DetailScaffold({ index, onBack }) {
    return (
      <div className="card">
        <div className="placeholder">
          <div className="placeholder-icon"><Icon name={index.icon} size={26} /></div>
          <div className="placeholder-title">{index.name}</div>
          <div className="placeholder-text">{index.venue}. Detail blob not yet wired.</div>
          <button type="button" className="btn-ghost-link" onClick={onBack}>
            <Icon name="arrow-left" size={12} /> Back to all indices
          </button>
        </div>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.IndexDetailView = IndexDetailView;
})();
