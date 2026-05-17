/* ==========================================================================
   TopNav.jsx — Two-row top header for breathing room.

     Row 1 (.topnav-bar)  : [Logo + tag] ... [Status pills + Connect]
     Row 2 (.topnav-tabs) : [Overview · 7 indices · Admin] (scrolls if overflow)

   Tab strip uses underline-on-active. The Admin tab is separated by a
   subtle divider (it's an admin section, distinct from the indices).
   Registers window.App.TopNav.
   ========================================================================== */
(() => {
  'use strict';
  const { useEffect, useState, useRef } = React;
  const { cn, formatClockUtc } = window.App.utils;
  const { Icon, BrandMark } = window.App;
  const { TABS } = window.App.NAV;

  /* Pull the authenticated user injected by streamlit_app.py
     (window.__ORIEL_SESSION__ = {"user":"Chris"}). Falls back to "Admin"
     when running outside the Streamlit wrapper. */
  function _currentUser() {
    try {
      const s = (typeof window !== 'undefined' && window.__ORIEL_SESSION__) || null;
      return (s && s.user) ? String(s.user) : 'Admin';
    } catch (e) {
      return 'Admin';
    }
  }
  function _initials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* Logout — drop to the Streamlit parent page with ?logout=1, which our
     server-side handler in streamlit_app.py picks up to clear the session
     and re-render the login screen. Inside the iframe we can't reach
     server-side session_state directly, so a top-level redirect is the
     cleanest way to round-trip back through the auth gate. */
  function _logout() {
    try {
      const target = window.top || window.parent || window;
      const loc = target.location;
      const base = loc.pathname + (loc.search ? '' : '');
      loc.href = base + '?logout=1';
    } catch (e) {
      // Same-origin failure (rare) — fall back to in-iframe nav.
      window.location.href = window.location.pathname + '?logout=1';
    }
  }

  function TopNav({ activeKey, onNavigate, cpiStatus = 'sample', demo = true }) {
    const [now, setNow] = useState(() => formatClockUtc());
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const user = _currentUser();

    useEffect(() => {
      const id = setInterval(() => setNow(formatClockUtc()), 30 * 1000);
      return () => clearInterval(id);
    }, []);

    /* Outside-click + Escape close the profile menu */
    useEffect(() => {
      if (!menuOpen) return;
      const onDown = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      };
      const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('keydown', onKey);
      };
    }, [menuOpen]);

    const cpiPill =
      cpiStatus === 'live'    ? { cls: 'live', label: 'CPI · Live' } :
      cpiStatus === 'offline' ? { cls: 'warn', label: 'CPI · Offline' } :
                                { cls: 'mute', label: 'CPI · Sample' };

    return (
      <header className="topnav" role="banner">
        {/* Row 1 — brand + status + connect */}
        <div className="topnav-bar">
          <div className="topnav-brand-group" aria-label="Oriel · Index Administrator">
            <button
              type="button"
              className="topnav-brand-link"
              onClick={() => onNavigate('overview')}
              aria-label="Go to Overview"
              title="Overview"
            >
              <BrandMark height={48} />
            </button>
            <span className="topnav-brand-divider" aria-hidden="true" />
            <button
              type="button"
              className={cn('topnav-tag-link', activeKey === 'admin' && 'active')}
              onClick={() => onNavigate('admin')}
              aria-label="Go to Index Administrator"
              title="Index Administrator"
            >
              <Icon name="shield" size={13} className="topnav-tag-icon" />
              <span className="topnav-tag-label">Index Administrator</span>
            </button>
          </div>

          <div className="topnav-bar-spacer" aria-hidden="true" />

          <div className="topnav-actions">
            <span className="topnav-clock" title="Current valuation time (UTC)">
              <span className="live-dot" />
              {now}
            </span>
            <span className={cn('topnav-pill', cpiPill.cls)} title={`Live data status: ${cpiPill.label}`}>
              <span className="dot" />
              {cpiPill.label}
            </span>
            {demo && (
              <span className="topnav-pill mute demo" title="Sample data — for demonstration">
                <Icon name="rhombus" size={11} /> Demo
              </span>
            )}
            <span className="topnav-divider" />
            <div className="topnav-profile" ref={menuRef}>
              <button
                type="button"
                className={cn('topnav-profile-trigger', menuOpen && 'open')}
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Account · ${user}`}
                title={`Signed in as ${user}`}
              >
                <span className="topnav-profile-avatar">{_initials(user)}</span>
                <span className="topnav-profile-name">{user}</span>
                <Icon name={menuOpen ? 'chevron-up' : 'chevron-down'} size={12} />
              </button>
              {menuOpen && (
                <div className="topnav-profile-menu" role="menu">
                  <div className="topnav-profile-menu-head">
                    <span className="topnav-profile-menu-avatar">{_initials(user)}</span>
                    <span className="topnav-profile-menu-text">
                      <span className="topnav-profile-menu-name">{user}</span>
                      <span className="topnav-profile-menu-role">Admin · Index Administrator</span>
                    </span>
                  </div>
                  <div className="topnav-profile-menu-divider" />
                  <button
                    type="button"
                    role="menuitem"
                    className="topnav-profile-menu-item logout"
                    onClick={_logout}
                  >
                    <Icon name="log-out" size={14} />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2 — tab strip */}
        <nav className="topnav-tabs" aria-label="Sections">
          <div className="topnav-tabs-inner">
            {TABS.map((t) => {
              const isAdmin = t.kind === 'admin';
              return (
                <React.Fragment key={t.key}>
                  {isAdmin && <span className="topnav-tabs-divider" aria-hidden="true" />}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeKey === t.key}
                    className={cn('topnav-tab', activeKey === t.key && 'active', isAdmin && 'admin')}
                    onClick={() => onNavigate(t.key)}
                  >
                    <Icon name={t.icon} size={13} className="topnav-tab-icon" />
                    <span>{t.label}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </nav>
      </header>
    );
  }

  window.App = window.App || {};
  window.App.TopNav = TopNav;
})();
