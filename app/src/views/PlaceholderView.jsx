/* ==========================================================================
   PlaceholderView.jsx — Module 1 stand-in. Shows what tab is active and a
   note that real content lands in the next module.
   Registers window.App.PlaceholderView.
   ========================================================================== */
(() => {
  'use strict';
  const { Icon, Badge } = window.App;

  function PlaceholderView({ section }) {
    return (
      <div className="card view">
        <div className="placeholder">
          <div className="placeholder-icon"><Icon name="sparkles" size={26} /></div>
          <div className="placeholder-title">{section.title}</div>
          <div className="placeholder-text">
            {section.subtitle} The shell, navigation, and sub-header are wired up — content for
            this section is the next module we'll build.
          </div>
          <div className="placeholder-meta">
            <Badge variant="accent" dot>Module 1 · App Shell</Badge>
            <span>section: <code>{section.key}</code></span>
          </div>
        </div>
      </div>
    );
  }

  window.App = window.App || {};
  window.App.PlaceholderView = PlaceholderView;
})();
