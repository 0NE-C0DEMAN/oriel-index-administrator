/* ==========================================================================
   MethodologySteps.jsx — Five-step horizontal flow describing how the index
   is constructed. Mirrors v7's CPI_STEPS / HC_STEPS layout.
   Registers window.App.MethodologySteps.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;
  const { Icon } = window.App;

  function MethodologySteps({ steps = [], accent = 'accent' }) {
    if (!steps.length) return null;
    return (
      <section className={cn('method-steps', `accent-${accent}`)}>
        <div className="method-steps-head">
          <div className="method-steps-eyebrow">Methodology</div>
          <div className="method-steps-title">From contract prices to index value</div>
        </div>
        <ol className="method-steps-list">
          {steps.map((s, i) => (
            <li key={i} className="method-step">
              <div className="method-step-num">{i + 1}</div>
              <div className="method-step-body">
                <div className="method-step-title">{s.title}</div>
                <div className="method-step-text">{s.body}</div>
              </div>
              {i < steps.length - 1 && (
                <div className="method-step-connector" aria-hidden="true">
                  <Icon name="chevron-right" size={14} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  window.App = window.App || {};
  window.App.MethodologySteps = MethodologySteps;
})();
