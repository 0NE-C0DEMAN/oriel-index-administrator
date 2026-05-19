/* ==========================================================================
   nav.js — Single source of truth for the top-nav tab strip.
   Per the user's directive ("all our screens should be tabbed also just like
   in the old app"), each top-level screen is a tab:
     • Overview        — the cards/tile grid we already have
     • v7 indices      — each opens its own detail page (ForecastTrader-style)
     • Admin           — the Index Administrator section

   The Admin tab is the last entry; UI may render a divider before it.
   Registers on window.App.NAV.
   ========================================================================== */
(() => {
  'use strict';

  // kind:
  //   'overview' → IndicesView (tile grid)
  //   'index'    → IndexDetailView with INDICES.byKey(key)
  //   'admin'    → IndexAdminView
  const TABS = [
    { key: 'overview', label: 'Overview',           kind: 'overview', icon: 'layers'      },
    { key: 'hc',       label: 'Healthcare Trend',   kind: 'index',    icon: 'heart'       },
    { key: 'cpi',      label: 'CPI · Kalshi',       kind: 'index',    icon: 'trending-up' },
    { key: 'fx',       label: 'CPI · ForecastEx',   kind: 'index',    icon: 'bar-chart'   },
    { key: 'poly',     label: 'CPI · Polymarket',   kind: 'index',    icon: 'globe'       },
    { key: 'perp',     label: 'CPI Basis Engine',   kind: 'index',    icon: 'activity'    },
    { key: 'cms',      label: 'Healthcare Reference', kind: 'index',  icon: 'shield'      },
    // ForecastEx Medical Basis — pinned beside the other Healthcare-family
    // tabs so related work groups together in the top strip.
    { key: 'mb',       label: 'Medical CPI Basis',  kind: 'index',    icon: 'activity'    },
    { key: 'parity',   label: 'Validation',         kind: 'index',    icon: 'sliders'     },
    { key: 'admin',    label: 'Admin',              kind: 'admin',    icon: 'shield'      },
  ];

  function findTab(key) {
    return TABS.find((t) => t.key === key) || TABS[0];
  }

  window.App = window.App || {};
  window.App.NAV = { TABS, findTab };
})();
