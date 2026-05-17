/* ==========================================================================
   App.jsx — Root component.
   Owns the active top-tab key and routes to the matching view.
   Per "all our screens should be tabbed", we have a flat tab strip:
     overview → IndicesView (tile grid)
     <indexKey> → IndexDetailView (with internal sub-tabs)
     admin → IndexAdminView
   No SubHeader: each view owns its own header.
   Registers window.App.App.
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useCallback } = React;
  const { TopNav, IndicesView, IndexDetailView, IndexAdminView, ChartModal } = window.App;
  const { findTab } = window.App.NAV;
  const { byKey: indexByKey } = window.App.INDICES;

  function App() {
    const [activeKey, setActiveKey] = useState('overview');
    const tab = findTab(activeKey);

    // Top-nav CPI pill reflects CPI Kalshi's runtime feed status (matches v7,
    // which globally tracks Kalshi via _cpi_runtime_meta).
    const cpiKalshi = indexByKey('cpi');
    const cpiStatus = cpiKalshi?.detail?.runtimeMeta?.feedStatus || 'sample';

    const onNavigate = useCallback((key) => {
      setActiveKey(key);
      // Scroll the main scroll region to top on navigation so the user
      // lands at the top of the new view.
      const main = document.querySelector('.main');
      if (main) main.scrollTop = 0;
    }, []);

    const onOpenIndex = useCallback((idx) => {
      onNavigate(idx.key);
    }, [onNavigate]);

    return (
      <div className="app">
        <TopNav
          activeKey={activeKey}
          onNavigate={onNavigate}
          cpiStatus={cpiStatus}
          demo
        />
        <main className="main">
          <div className="content">
            {tab.kind === 'overview' && <IndicesView onOpenIndex={onOpenIndex} />}
            {tab.kind === 'admin'    && <IndexAdminView />}
            {tab.kind === 'index'    && (() => {
              const idx = indexByKey(tab.key);
              if (!idx) return null;
              return <IndexDetailView index={idx} />;
            })()}
          </div>
        </main>
        {/* App-level chart expansion modal — listens for `chart:expand`
            events dispatched by any chart card via window.App.expandChart(). */}
        <ChartModal />
      </div>
    );
  }

  window.App = window.App || {};
  window.App.App = App;
})();
