/* ==========================================================================
   main.jsx — Boot the React tree. Loaded last after every module is
   registered on window.App.

   We also try to tell the parent (Streamlit) what height we'd like the
   iframe to be — this is best-effort for `streamlit.components.v1.html`
   which uses a fixed height; declare_component pages honor the message.
   No-op if running standalone outside Streamlit.
   ========================================================================== */
(() => {
  'use strict';
  const { App } = window.App;

  if (!App) {
    document.body.innerHTML =
      '<div style="padding:40px;font-family:Inter,system-ui;color:#DC2626;">' +
      'App component failed to load. Check the browser console for errors.</div>';
    return;
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);

  // Tell the parent we'd like a fixed full-iframe height (best-effort).
  function postHeight() {
    try {
      const h = Math.max(window.innerHeight, 600);
      window.parent.postMessage({ type: 'streamlit:setFrameHeight', height: h }, '*');
    } catch (e) { /* ignore — running standalone */ }
  }
  window.addEventListener('load', postHeight);
  window.addEventListener('resize', postHeight);
  setTimeout(postHeight, 200);
})();
