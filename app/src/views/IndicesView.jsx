/* ==========================================================================
   IndicesView.jsx — Final-MVP-app-lock Overview.

   Per Ksenia's MVP-app-lock review the Overview should explain the Oriel
   hierarchy, not read as eight equal-weight demos. We organize cards into
   three bands matching v7's tabs/overview_tab.py:

     A. Core Oriel CPI Layer
        1. CPI Reference Surface  → opens CPI Basis Engine (interim home)
        2. CPI Basis & RV Engine  → opens CPI Basis Engine
        3. Simulation & Execution Intelligence → opens Execution Workbench

     B. Market Inputs & Validation
        4. Venue Coverage         → opens CPI · Kalshi (first venue)
        5. Validation & Publishability → opens Validation

     C. Client Modules / Future Surfaces
        6. Healthcare Trend Module → opens Healthcare Trend
        7. Healthcare Reference Module → opens Healthcare Reference
        8. Medical CPI Basis Module → opens Medical CPI Basis

   Cards are informational info-cards (not the IndexCard tile component);
   they each carry a low-key badge that signals tier (Core CPI / Basis /
   Workbench / Module Preview / etc.) and click to the matching tab via
   onOpenIndex({key:...}).

   Registers window.App.IndicesView.
   ========================================================================== */
(() => {
  'use strict';
  const { Icon } = window.App;

  const BANDS = [
    {
      key: 'core',
      title: 'Core Oriel CPI Layer',
      sub: 'Reference → Basis → Execution. The CPI spine of the product.',
      columns: 3,
      cards: [
        {
          key: 'perp',
          title: 'CPI Reference Surface',
          body: 'Cross-venue macro reference built from normalized event-market pricing, Oriel Reference construction, and maturity alignment.',
          badge: { variant: 'accent', label: 'Core CPI' },
          icon: 'layers',
        },
        {
          key: 'perp',
          title: 'CPI Basis & RV Engine',
          body: 'Detect curve-relative mispricing, perp/reference basis, and tradable dislocations across the CPI surface.',
          badge: { variant: 'success', label: 'Basis signal' },
          icon: 'activity',
        },
        {
          key: 'execution',
          title: 'Simulation & Execution Intelligence',
          body: 'Stress-test dislocations, quote posture, inventory tolerance, and edge thresholds before turning signals into a workflow.',
          badge: { variant: 'info', label: 'Execution workbench' },
          icon: 'sliders',
        },
      ],
    },
    {
      key: 'inputs',
      title: 'Market Inputs & Validation',
      sub: 'Important, but not what defines the home page.',
      columns: 2,
      cards: [
        {
          key: 'cpi',
          title: 'Venue Coverage',
          body: 'Kalshi, ForecastEx, CME, and Polymarket are normalized into a comparable CPI market stack; each venue then gets separate Signal Status, Reference Readiness, and Trade Use labels.',
          badge: { variant: 'accent', label: 'Governed baseline + candidate/shadow diagnostics' },
          icon: 'globe',
        },
        {
          key: 'parity',
          title: 'Validation & Publishability',
          body: 'OTC parity, SDR cross-checks, calibration evidence, and publication controls determine which contract rows can support governed reference outputs.',
          badge: { variant: 'success', label: 'Eligibility-gated controls' },
          icon: 'shield',
        },
      ],
    },
    {
      key: 'modules',
      title: 'Client Modules / Future Surfaces',
      sub: 'Healthcare lives here as a module, not as the first product impression.',
      columns: 3,
      cards: [
        {
          key: 'hc',
          title: 'Healthcare Trend Module',
          body: 'Client-specific healthcare inflation module translating emerging market signals into trend expectations.',
          badge: { variant: 'warning', label: 'Module Preview' },
          icon: 'heart',
        },
        {
          key: 'cms',
          title: 'Healthcare Reference Module',
          body: 'Public-print-to-reference translation for healthcare cost benchmarks and market design.',
          badge: { variant: 'success', label: 'Live Reference · Public-data translation' },
          icon: 'shield',
        },
        {
          key: 'mb',
          title: 'Medical CPI Basis Module',
          body: 'Future-state spread framework for medical inflation versus general CPI, subject to market listing and eligibility.',
          badge: { variant: 'warning', label: 'Future-State Module · Listing-Dependent' },
          icon: 'activity',
        },
      ],
    },
  ];

  function IndicesView({ onOpenIndex }) {
    const openTab = (key) => onOpenIndex && onOpenIndex({ key });

    return (
      <div className="view overview-view">
        <header className="overview-hero">
          <div className="overview-hero-eyebrow">
            <Icon name="layers" size={12} /> Oriel CPI Surface
          </div>
          <h1 className="overview-hero-title">Reference. Basis. Execution.</h1>
          <p className="overview-hero-sub">
            One reviewer-facing path for CPI: ingest fragmented venue signals,
            normalize them onto implied YoY CPI, construct the Oriel Reference,
            compute dislocation / basis, then stress-test execution and
            deployment.
          </p>
        </header>

        {BANDS.map((band) => (
          <section key={band.key} className={`overview-band overview-band-${band.key}`}>
            <div className="overview-band-head">
              <div className="overview-band-title">{band.title}</div>
              <div className="overview-band-sub">{band.sub}</div>
            </div>
            <div className={`overview-band-grid cols-${band.columns}`}>
              {band.cards.map((c, i) => (
                <OverviewCard key={`${band.key}-${i}`} card={c} onOpen={() => openTab(c.key)} />
              ))}
            </div>
          </section>
        ))}

        <aside className="indices-callout overview-footnote">
          <div className="indices-callout-icon"><Icon name="info" size={18} /></div>
          <div className="indices-callout-text">
            <strong>How to read this page.</strong> The Overview describes the
            Oriel hierarchy — top band is the differentiated CPI product, the
            middle band is the inputs and validation that feed it, the bottom
            band is the healthcare module family. Click any card to land on the
            matching tab.
          </div>
        </aside>
      </div>
    );
  }

  function OverviewCard({ card, onOpen }) {
    const handleKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
    };
    return (
      <article
        className="overview-card"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={handleKey}
        aria-label={`Open ${card.title}`}
      >
        <header className="overview-card-head">
          <div className={`overview-card-icon overview-card-icon-${card.badge.variant}`}>
            <Icon name={card.icon} size={16} strokeWidth={1.9} />
          </div>
          <div className="overview-card-title">{card.title}</div>
        </header>
        <p className="overview-card-body">{card.body}</p>
        <footer className="overview-card-foot">
          <span className={`overview-card-badge overview-card-badge-${card.badge.variant}`}>
            {card.badge.label}
          </span>
          <span className="overview-card-link">
            View <Icon name="arrow-right" size={11} />
          </span>
        </footer>
      </article>
    );
  }

  window.App = window.App || {};
  window.App.IndicesView = IndicesView;
})();
