/* ==========================================================================
   BrandMark.jsx — Renders the actual Oriel logo (PNG) inlined as a base64
   data URI from src/lib/oriel_logo.js. Per Chris's instruction we keep the
   real Oriel mark, not a custom rhombus.
   Registers window.App.BrandMark.
   ========================================================================== */
(() => {
  'use strict';

  function BrandMark({ height = 28, alt = 'Oriel' }) {
    const src = window.App && window.App.OrielLogo;
    if (!src) {
      return (
        <span
          aria-label={alt}
          style={{
            height, display: 'inline-flex', alignItems: 'center',
            color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.04em',
            fontSize: Math.max(13, Math.round(height * 0.5)),
          }}
        >ORIEL</span>
      );
    }
    return (
      <img
        src={src}
        alt={alt}
        style={{ height, width: 'auto', display: 'block', objectFit: 'contain' }}
      />
    );
  }

  window.App = window.App || {};
  window.App.BrandMark = BrandMark;
})();
