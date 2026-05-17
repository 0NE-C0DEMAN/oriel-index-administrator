/* ==========================================================================
   Badge.jsx — Status pill. Variants: default | success | warning | danger |
                                       info | accent | pink
   Registers window.App.Badge.
   ========================================================================== */
(() => {
  'use strict';
  const { cn } = window.App.utils;

  function Badge({ variant = 'default', dot = false, children, className, style }) {
    return (
      <span className={cn('badge', `badge-${variant}`, className)} style={style}>
        {dot && <span className="dot" />}
        {children}
      </span>
    );
  }

  window.App = window.App || {};
  window.App.Badge = Badge;
})();
