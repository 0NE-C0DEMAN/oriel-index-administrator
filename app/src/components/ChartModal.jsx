/* ==========================================================================
   ChartModal.jsx — App-level expandable chart modal.

   Any chart in the app can request itself to be displayed full-size in
   a modal by dispatching a CustomEvent:

       window.dispatchEvent(new CustomEvent('chart:expand', {
         detail: {
           title:  'ORIEL vs OTC swap curve',
           sub:    'Both curves overlaid · 4 pillar months',
           accent: 'accent',
           render: () => <RatesChart blob={blob} accent="accent" />,
         }
       }));

   The render fn is called inside the modal's big container — the chart's
   ResizeObserver picks up the larger size and automatically renders at
   the new dimensions. Same chart code, no duplication.

   Closes on:
     • Escape key
     • Backdrop click
     • Close (×) button

   Mounted once at App.jsx level so a single instance handles all charts.
   Registers window.App.ChartModal (and a helper window.App.expandChart).
   ========================================================================== */
(() => {
  'use strict';
  const { useState, useEffect, useCallback } = React;
  const { cn } = window.App.utils;
  const { Icon } = window.App;

  function ChartModal() {
    const [open, setOpen] = useState(null);  // null or { title, sub, accent, render }

    /* Listen for global expand events */
    useEffect(() => {
      const onExpand = (e) => {
        if (!e?.detail || typeof e.detail.render !== 'function') return;
        setOpen(e.detail);
      };
      window.addEventListener('chart:expand', onExpand);
      return () => window.removeEventListener('chart:expand', onExpand);
    }, []);

    /* Esc to close */
    const onClose = useCallback(() => setOpen(null), []);
    useEffect(() => {
      if (!open) return;
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      // Lock body scroll while modal is open
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = prevOverflow;
      };
    }, [open, onClose]);

    if (!open) return null;
    const accent = open.accent || 'accent';

    return (
      <div className="chart-modal-backdrop" onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}>
        <div className={cn('chart-modal', `accent-${accent}`)} role="dialog" aria-modal="true" aria-labelledby="chart-modal-title">
          <header className="chart-modal-head">
            <div className="chart-modal-titleblock">
              <div id="chart-modal-title" className="chart-modal-title">{open.title}</div>
              {open.sub && <div className="chart-modal-sub">{open.sub}</div>}
            </div>
            <div className="chart-modal-actions">
              <span className="chart-modal-hint">Press <kbd>Esc</kbd> to close</span>
              <button type="button" className="chart-modal-close" onClick={onClose} aria-label="Close">
                <Icon name="x" size={16} />
              </button>
            </div>
          </header>
          <div className="chart-modal-body">
            {open.render()}
          </div>
        </div>
      </div>
    );
  }

  /* Helper for chart code: window.App.expandChart({ title, sub, accent, render }) */
  function expandChart(detail) {
    try {
      window.dispatchEvent(new CustomEvent('chart:expand', { detail }));
    } catch (e) {
      console.error('expandChart failed:', e);
    }
  }

  window.App = window.App || {};
  window.App.ChartModal  = ChartModal;
  window.App.expandChart = expandChart;
})();
