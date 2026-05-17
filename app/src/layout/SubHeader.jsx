/* ==========================================================================
   SubHeader.jsx — White strip beneath the top nav. Page title + subtitle +
   optional right-side actions/meta.
   Registers window.App.SubHeader.
   ========================================================================== */
(() => {
  'use strict';
  const { Icon } = window.App;

  function SubHeader({ title, subtitle, actions, backLabel, onBack }) {
    return (
      <div className="subheader" role="region" aria-label="Section header">
        <div className="subheader-inner">
          <div className="subheader-title-block">
            {backLabel && onBack && (
              <button type="button" className="subheader-back" onClick={onBack}>
                <Icon name="arrow-left" size={12} />
                {backLabel}
              </button>
            )}
            <div className="subheader-title">{title}</div>
            {subtitle && <div className="subheader-subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="subheader-actions">{actions}</div>}
        </div>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.SubHeader = SubHeader;
})();
