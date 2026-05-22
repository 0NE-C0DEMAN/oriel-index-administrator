/* ==========================================================================
   nav.js — Single source of truth for the top-nav tab strip.

   Order mirrors v7's final-MVP-app-lock pass (PR #19 on the v7 streamlit):
   CPI is the left-to-right spine, healthcare drops to the right as modules,
   Validation sits between Execution and the modules block, Admin is last.

   kind:
     'overview'    → IndicesView (3-band Overview)
     'index'       → IndexDetailView with INDICES.byKey(key)
     'placeholder' → PlaceholderView (CME proxy explainer, Execution Workbench
                                       handoff to standalone market-sim app)
     'admin'       → IndexAdminView

   The Admin tab is the last entry; UI may render a divider before it.
   Registers on window.App.NAV.
   ========================================================================== */
(() => {
  'use strict';

  const TABS = [
    { key: 'overview',  label: 'Overview',             kind: 'overview',    icon: 'layers'      },
    { key: 'perp',      label: 'CPI Basis Engine',     kind: 'index',       icon: 'activity'    },
    { key: 'cpi',       label: 'CPI · Kalshi',         kind: 'index',       icon: 'trending-up' },
    { key: 'fx',        label: 'CPI · ForecastEx',     kind: 'index',       icon: 'bar-chart'   },
    { key: 'cme',       label: 'CPI · CME',            kind: 'placeholder', icon: 'database'    },
    { key: 'poly',      label: 'CPI · Polymarket',     kind: 'index',       icon: 'globe'       },
    { key: 'execution', label: 'Execution Workbench',  kind: 'placeholder', icon: 'sliders'     },
    { key: 'parity',    label: 'Validation',           kind: 'index',       icon: 'shield'      },
    { key: 'hc',        label: 'Healthcare Trend',     kind: 'index',       icon: 'heart'       },
    { key: 'cms',       label: 'Healthcare Reference', kind: 'index',       icon: 'shield'      },
    { key: 'mb',        label: 'Medical CPI Basis',    kind: 'index',       icon: 'activity'    },
    { key: 'admin',     label: 'Admin',                kind: 'admin',       icon: 'shield'      },
  ];

  function findTab(key) {
    return TABS.find((t) => t.key === key) || TABS[0];
  }

  window.App = window.App || {};
  window.App.NAV = { TABS, findTab };
})();
