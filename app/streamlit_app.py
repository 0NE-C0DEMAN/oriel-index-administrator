"""
streamlit_app.py — Embed the Oriel UI redesign inside Streamlit.

The React app in app/ is a fully self-contained UI. This file wraps it
into a Streamlit page using streamlit.components.v1.html, hiding Streamlit's
own chrome (header, padding) so the React shell takes the full viewport.

Run from the project root:
    streamlit run app/streamlit_app.py

Once the JS<->Python bridge is wired (post-Module 10), this file is also where
we'd inject runtime payloads — e.g.
    components.html(html.replace("__INDICES_JSON__", json.dumps(payload)), ...)
or use streamlit.components.v1.declare_component() for a two-way bridge.
"""
from __future__ import annotations

import json
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

from streamlit_bundle import build_bundle
from live_kalshi import live_cpi_payload_json
from blended_curve import blended_payload_json
from forecastex_data import forecastex_payload_json
from polymarket_data import polymarket_payload_json
from perp_data       import perp_payload_json
from cms_data        import cms_payload_json
from medical_basis_data import medical_basis_payload_json
from parity_data         import parity_payload_json
from admin_data          import admin_payload_json

APP_ROOT = Path(__file__).resolve().parent


@st.cache_data(ttl=60, show_spinner=False)
def _cached_live_cpi_payload() -> str:
    """Fetch the live Kalshi CPI payload, cached for 60s. Returns 'null'
    on any failure so the React app can fall back to sample data."""
    return live_cpi_payload_json()


@st.cache_data(ttl=3600, show_spinner=False)
def _cached_blended_payload() -> str:
    """Build the v7 blended parent curve from static CSVs. Cache for 1h
    since the inputs are static. Returns 'null' on any failure so the
    React app falls back to its own forward curve for vol surface."""
    return blended_payload_json()


@st.cache_data(ttl=600, show_spinner=False)
def _cached_forecastex_payload() -> str:
    """Build the v7 ForecastEx package (live + sample) for the FX index
    tab. v7's own cache_data TTL is 600s, so we mirror that here."""
    return forecastex_payload_json()


@st.cache_data(ttl=600, show_spinner=False)
def _cached_polymarket_payload() -> str:
    """Build the v7 Polymarket package (live + sample) for the poly index
    tab. v7's own cache_data TTL is 600s, so we mirror that here."""
    return polymarket_payload_json()


@st.cache_data(ttl=3600, show_spinner=False)
def _cached_perp_payload() -> str:
    """Build the v7 Tier-1 perp readiness bundle (curves, snapshot,
    diagnostics, blend governance, freshness, trade ideas). v7's own
    @st.cache_data ttl on _cached_tier1_curves is 3600s — we mirror that."""
    return perp_payload_json()


@st.cache_data(ttl=3600, show_spinner=False)
def _cached_cms_payload() -> str:
    """Build the v7 Oriel Healthcare Reference / CMS Lag Engine bundle
    (basis_action, anchor_timeseries, service_lines, historical_benchmark,
    provenance). Inputs are static CSVs so 1h cache is safe — mirrors v7's
    @st.cache_data ttl=3600 on _cached_cms_outputs."""
    return cms_payload_json()


@st.cache_data(ttl=600, show_spinner=False)
def _cached_medical_basis_payload() -> str:
    """Build the v7 ForecastEx Medical Inflation Basis Contract bundle
    (basis curve points, ladder rows, distribution, contract spec,
    settlement example, reference legs). Inputs are a static CSV so
    deterministic — mirrors v7's @st.cache_data ttl=600."""
    return medical_basis_payload_json()


@st.cache_data(ttl=3600, show_spinner=False)
def _cached_parity_payload() -> str:
    """Build the v7 OTC Parity Validation + DTCC Term Calibration bundle
    (3 parity benchmarks: tighter / dtcc / negative + DTCC live tenor
    calibration reference). Inputs are static CSVs so deterministic —
    mirrors v7's @st.cache_data on _cached_parity (no TTL)
    + ttl=3600 on _cached_term_calibration."""
    return parity_payload_json()


@st.cache_data(ttl=3600, show_spinner=False)
def _cached_admin_payload() -> str:
    """Build the v7 Index Administrator bundle (definition, observations,
    quality scores, calculation outputs, runs, fallback usage, publication
    record). Inputs are static CSVs so deterministic — mirrors v7's
    @st.cache_data on services.index_admin.load_index_admin_bundle()."""
    return admin_payload_json()


# ── Streamlit page setup ─────────────────────────────────────────────────────
st.set_page_config(
    page_title="Oriel · Index Administrator",
    page_icon="◈",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── Auth gate ────────────────────────────────────────────────────────────────
# Single admin login. Credentials live in Streamlit secrets when deployed to
# Hugging Face (Settings → Secrets → ORIEL_ADMIN_USERNAME / ORIEL_ADMIN_PASSWORD),
# with a built-in fallback so local dev still works.
#
# Session is held in st.session_state for the duration of the browser tab —
# no cookies, no JWT. Closing the tab logs the user out.
import hmac

def _admin_credentials() -> tuple[str, str]:
    """Pull the admin credentials. Secrets win over the in-file default."""
    try:
        u = st.secrets.get("ORIEL_ADMIN_USERNAME", "Chris")
        p = st.secrets.get("ORIEL_ADMIN_PASSWORD", "Oriel2026@123!")
        return str(u), str(p)
    except Exception:
        return "Chris", "Oriel2026@123!"

def _check_credentials(username: str, password: str) -> bool:
    expected_u, expected_p = _admin_credentials()
    return (
        hmac.compare_digest(username.strip(), expected_u) and
        hmac.compare_digest(password,         expected_p)
    )

def _oriel_logo_uri() -> str:
    """Pull the base64 PNG data URI of the Oriel logo out of the React
    bundle's oriel_logo.js so the login screen can render the real mark
    (white-tinted via a CSS filter) without a separate asset file."""
    import re as _re
    try:
        txt = (APP_ROOT / "src" / "lib" / "oriel_logo.js").read_text(encoding="utf-8")
        m = _re.search(r"window\.App\.OrielLogo\s*=\s*['\"]([^'\"]+)['\"]", txt)
        return m.group(1) if m else ""
    except Exception:
        return ""


def _render_login():
    """Fully custom JSX-style login screen.

    Architecture (Façade pattern):
      • We render OUR OWN HTML/CSS form — every pixel under our control.
        No Streamlit widget defaults fighting us on input shells, the
        password-toggle button, focus rings, fonts, etc.
      • A hidden `st.form(...)` sits off-screen as the auth backend. It
        owns Streamlit's session_state and rerun lifecycle.
      • A tiny JS bridge copies values from our visible inputs into the
        hidden Streamlit inputs (via React's nativeInputValueSetter so
        React tracks the change), then clicks the hidden submit button.

    Why not a true JSX iframe? An iframe is cross-origin from Streamlit's
    page → can't reach Streamlit's form via JS → would need postMessage
    relay. The façade is simpler and visually identical to JSX.
    """
    logo_uri = _oriel_logo_uri()

    # Surface validation errors from the previous submit attempt. We pop
    # so the error doesn't persist across renders.
    login_err = st.session_state.pop("_login_err", False)
    err_html = ""
    if login_err:
        err_html = """
        <div class="oriel-jsx-error" role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Invalid username or password.
        </div>
        """

    logo_html = (
        f'<img src="{logo_uri}" alt="Oriel" />'
        if logo_uri
        else '<span style="font-size:28px;font-weight:800;letter-spacing:-0.02em;">ORIEL</span>'
    )

    # Build the login HTML into a variable, then collapse blank lines and
    # leading indentation before handing to st.markdown. Streamlit's
    # markdown engine breaks HTML blocks on blank lines and treats deeply
    # indented chunks as code blocks — both would corrupt our form. Stripping
    # blank lines keeps the entire HTML as one continuous block; CSS inside
    # <style> is whitespace-tolerant so this is a safe transformation.
    import re as _re_login
    import textwrap as _tw_login
    _login_html = f"""
        <style>
          /* ── Kill Streamlit chrome completely ────────────────────────── */
          header[data-testid="stHeader"],
          footer,
          [data-testid="stSidebar"],
          [data-testid="stToolbar"],
          [data-testid="stStatusWidget"],
          [data-testid="stDecoration"] {{ display: none !important; }}

          html, body, .stApp {{
            margin: 0 !important; padding: 0 !important;
            height: 100vh !important; overflow: hidden !important;
            background: #FFFFFF !important;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
            color-scheme: light !important;
          }}
          [data-testid="stAppViewContainer"],
          [data-testid="stMain"],
          [data-testid="stMainBlockContainer"] {{
            padding: 0 !important; margin: 0 !important;
            background: transparent !important;
            max-width: none !important;
          }}

          /* HIDE the Streamlit form completely — it's our submission backend.
             We keep it in the DOM (just visually hidden + non-interactive)
             so its inputs and submit button can be programmatically driven
             from our visible JSX-styled form. */
          [data-testid="stForm"] {{
            position: fixed !important;
            left: -10000px !important;
            top: -10000px !important;
            width: 1px !important;
            height: 1px !important;
            opacity: 0 !important;
            overflow: hidden !important;
            pointer-events: none !important;
            z-index: -1 !important;
          }}

          /* ── Login canvas (full-bleed split-screen) ──────────────────── */
          .oriel-jsx-login {{
            position: fixed; inset: 0;
            display: grid;
            grid-template-columns: 1fr 1fr;
            min-height: 100vh;
            color: #0E1733;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          }}

          /* ── LEFT pane: accent gradient hero ─────────────────────────── */
          .oriel-jsx-hero {{
            position: relative;
            background:
              radial-gradient(circle at 18% 22%, rgba(255,255,255,0.20) 0%, transparent 38%),
              radial-gradient(circle at 82% 78%, rgba(91,138,255,0.30) 0%, transparent 42%),
              linear-gradient(135deg, #1C39B0 0%, #2D5BFF 50%, #4F7BFF 100%);
            overflow: hidden;
            padding: 56px 64px;
            display: flex; flex-direction: column; justify-content: space-between;
            color: #FFFFFF;
          }}
          .oriel-jsx-hero::before {{
            content: '';
            position: absolute; inset: 0;
            background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.10) 1px, transparent 1px);
            background-size: 28px 28px;
            mask-image: linear-gradient(180deg, transparent 0%, black 22%, black 78%, transparent 100%);
            -webkit-mask-image: linear-gradient(180deg, transparent 0%, black 22%, black 78%, transparent 100%);
            pointer-events: none;
            opacity: 0.7;
          }}
          .oriel-jsx-hero::after {{
            content: '';
            position: absolute;
            bottom: -180px; right: -180px;
            width: 520px; height: 520px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 35%, transparent 65%);
            pointer-events: none;
            filter: blur(2px);
          }}

          .oriel-hero-mark {{
            display: flex; align-items: center; gap: 14px;
            position: relative; z-index: 2;
          }}
          .oriel-hero-mark img {{
            height: 56px; width: auto;
            filter: brightness(0) invert(1);
            opacity: 0.96;
          }}
          .oriel-hero-mark-tag {{
            font-size: 10.5px; font-weight: 700; letter-spacing: 0.16em;
            text-transform: uppercase;
            color: rgba(255,255,255,0.78);
            padding: 5px 11px;
            border: 1px solid rgba(255,255,255,0.28);
            border-radius: 999px;
            background: rgba(255,255,255,0.06);
            backdrop-filter: blur(6px);
          }}

          .oriel-hero-body {{ position: relative; z-index: 2; max-width: 460px; }}
          .oriel-hero-eyebrow {{
            font-size: 11.5px; font-weight: 700;
            letter-spacing: 0.18em; text-transform: uppercase;
            color: rgba(255,255,255,0.72);
            margin-bottom: 18px;
            display: flex; align-items: center; gap: 10px;
          }}
          .oriel-hero-eyebrow::before {{
            content: ''; display: inline-block;
            width: 24px; height: 1px; background: rgba(255,255,255,0.5);
          }}
          .oriel-hero-title {{
            font-size: 40px; font-weight: 700; line-height: 1.12;
            letter-spacing: -0.025em;
            margin-bottom: 18px;
            color: #FFFFFF;
          }}
          .oriel-hero-title em {{
            font-style: normal;
            background: linear-gradient(90deg, #FFFFFF 0%, #BFD0FF 100%);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text;
          }}
          .oriel-hero-sub {{
            font-size: 15px; line-height: 1.65;
            color: rgba(255,255,255,0.82);
            margin-bottom: 26px;
          }}
          .oriel-hero-tags {{
            display: flex; gap: 8px; flex-wrap: wrap;
          }}
          .oriel-hero-tag {{
            font-size: 11.5px; font-weight: 600;
            letter-spacing: 0.04em;
            padding: 6px 12px;
            background: rgba(255,255,255,0.10);
            border: 1px solid rgba(255,255,255,0.22);
            border-radius: 999px;
            backdrop-filter: blur(4px);
            color: #FFFFFF;
          }}

          .oriel-hero-foot {{
            position: relative; z-index: 2;
            display: flex; align-items: center; justify-content: space-between;
            color: rgba(255,255,255,0.70);
            font-size: 11.5px; font-weight: 500; letter-spacing: 0.02em;
          }}
          .oriel-hero-foot-left {{ display: flex; align-items: center; gap: 8px; }}
          .oriel-hero-foot svg {{ opacity: 0.85; }}
          .oriel-hero-foot-pill {{
            display: inline-flex; align-items: center; gap: 6px;
            padding: 4px 10px;
            background: rgba(255,255,255,0.10);
            border: 1px solid rgba(255,255,255,0.20);
            border-radius: 999px;
            font-size: 10.5px; font-weight: 600;
            letter-spacing: 0.05em; text-transform: uppercase;
          }}
          .oriel-hero-foot-pill .live-dot {{
            width: 6px; height: 6px; border-radius: 50%;
            background: #4ADE80;
            box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.20);
            animation: oriel-pulse-dot 2.4s ease-in-out infinite;
          }}
          @keyframes oriel-pulse-dot {{
            0%, 100% {{ opacity: 1; }}
            50%      {{ opacity: 0.55; }}
          }}

          /* ── RIGHT pane: our JSX-style form ──────────────────────────── */
          .oriel-jsx-formpane {{
            display: flex; align-items: center; justify-content: center;
            padding: 48px 56px;
            background: #FFFFFF;
          }}
          .oriel-jsx-form-wrap {{
            width: 100%;
            max-width: 400px;
            animation: oriel-fade-up 360ms cubic-bezier(0.16, 1, 0.3, 1);
          }}
          @keyframes oriel-fade-up {{
            from {{ opacity: 0; transform: translateY(8px); }}
            to   {{ opacity: 1; transform: translateY(0); }}
          }}

          .oriel-form-eyebrow {{
            font-size: 11px; font-weight: 700;
            letter-spacing: 0.16em; text-transform: uppercase;
            color: #2D5BFF;
            margin-bottom: 14px;
            display: flex; align-items: center; gap: 8px;
          }}
          .oriel-form-title {{
            font-size: 32px; font-weight: 700;
            letter-spacing: -0.02em; line-height: 1.15;
            color: #0E1733;
            margin: 0 0 10px 0;
          }}
          .oriel-form-sub {{
            font-size: 14.5px; line-height: 1.55;
            color: #5A6478;
            margin: 0 0 28px 0;
          }}

          /* The visible form */
          .oriel-jsx-form {{ display: block; }}
          .oriel-jsx-field {{ margin-bottom: 14px; }}
          .oriel-jsx-label {{
            display: block;
            font-size: 11px; font-weight: 700;
            color: #5A6478;
            letter-spacing: 0.10em;
            text-transform: uppercase;
            margin-bottom: 8px;
          }}
          .oriel-jsx-input-wrap {{
            position: relative;
            display: flex; align-items: center;
            background: #F8FAFD;
            border: 1.5px solid #E3E7EF;
            border-radius: 10px;
            transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
            height: 48px;
            overflow: hidden;
          }}
          .oriel-jsx-input-wrap:hover {{ border-color: #CFD5E1; }}
          .oriel-jsx-input-wrap:focus-within {{
            background: #FFFFFF;
            border-color: #2D5BFF;
            box-shadow: 0 0 0 4px rgba(45, 91, 255, 0.10);
          }}
          .oriel-jsx-input {{
            flex: 1; min-width: 0;
            background: transparent;
            border: 0; outline: 0;
            padding: 0 15px;
            font-family: inherit;
            font-size: 14.5px;
            font-weight: 500;
            color: #0E1733;
            height: 100%;
            line-height: 1.2;
          }}
          .oriel-jsx-input::placeholder {{ color: #B4BAC8; font-weight: 400; }}
          /* Kill autofill's yellow background (Chrome) */
          .oriel-jsx-input:-webkit-autofill,
          .oriel-jsx-input:-webkit-autofill:hover,
          .oriel-jsx-input:-webkit-autofill:focus {{
            -webkit-text-fill-color: #0E1733;
            -webkit-box-shadow: 0 0 0 1000px #F8FAFD inset;
            transition: background-color 5000s ease-in-out 0s;
          }}
          .oriel-jsx-input-wrap:focus-within .oriel-jsx-input:-webkit-autofill {{
            -webkit-box-shadow: 0 0 0 1000px #FFFFFF inset;
          }}

          .oriel-jsx-eye {{
            background: transparent;
            border: 0;
            color: #8A93A6;
            padding: 0 14px;
            height: 100%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            transition: color 0.15s ease;
            -webkit-tap-highlight-color: transparent;
          }}
          .oriel-jsx-eye:hover {{ color: #2D5BFF; }}
          .oriel-jsx-eye:focus {{ outline: 0; color: #2D5BFF; }}

          .oriel-jsx-submit {{
            width: 100%;
            height: 50px;
            background: linear-gradient(180deg, #2D5BFF 0%, #2347D6 100%);
            color: #FFFFFF;
            font-family: inherit;
            font-weight: 650;
            font-size: 14.5px;
            letter-spacing: 0.01em;
            border: 0;
            border-radius: 10px;
            margin-top: 14px;
            cursor: pointer;
            box-shadow:
              0 4px 14px rgba(45, 91, 255, 0.32),
              inset 0 1px 0 rgba(255,255,255,0.16);
            transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
            display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          }}
          .oriel-jsx-submit:hover {{
            transform: translateY(-1px);
            box-shadow:
              0 8px 22px rgba(45, 91, 255, 0.42),
              inset 0 1px 0 rgba(255,255,255,0.18);
            background: linear-gradient(180deg, #3565FF 0%, #2A52E6 100%);
          }}
          .oriel-jsx-submit:active {{ transform: translateY(0); }}
          .oriel-jsx-submit:disabled {{
            opacity: 0.7; cursor: not-allowed; transform: none;
            box-shadow: 0 2px 6px rgba(45, 91, 255, 0.18);
          }}
          .oriel-jsx-spin {{
            width: 14px; height: 14px;
            border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.32);
            border-top-color: #FFFFFF;
            animation: oriel-spin 700ms linear infinite;
            display: inline-block;
          }}
          @keyframes oriel-spin {{ to {{ transform: rotate(360deg); }} }}

          .oriel-jsx-error {{
            display: flex; align-items: center; gap: 8px;
            margin-top: 14px;
            padding: 11px 14px;
            background: #FEF2F2;
            border: 1px solid rgba(220, 38, 38, 0.20);
            border-radius: 10px;
            color: #B91C1C; font-size: 13px; font-weight: 500;
            animation: oriel-fade-up 240ms ease;
          }}
          .oriel-jsx-error svg {{ flex: none; color: #DC2626; }}

          .oriel-form-foot {{
            margin-top: 24px;
            display: flex; align-items: center; gap: 8px;
            font-size: 11.5px; color: #8A93A6;
            font-weight: 500;
          }}
          .oriel-form-foot svg {{ color: #8A93A6; flex: none; }}

          /* ── Responsive: collapse to single column on narrow viewports ─ */
          @media (max-width: 880px) {{
            .oriel-jsx-login {{ grid-template-columns: 1fr; }}
            .oriel-jsx-hero {{ display: none; }}
            .oriel-jsx-formpane {{ padding: 24px; }}
          }}
        </style>

        <div class="oriel-jsx-login">

          <!-- LEFT: hero -->
          <aside class="oriel-jsx-hero">
            <div class="oriel-hero-mark">
              {logo_html}
              <span class="oriel-hero-mark-tag">Index Administrator</span>
            </div>

            <div class="oriel-hero-body">
              <div class="oriel-hero-eyebrow">A governed reference platform</div>
              <div class="oriel-hero-title">
                Reference indices,<br />
                <em>built for capital markets.</em>
              </div>
              <div class="oriel-hero-sub">
                Healthcare cost benchmarks, CPI forwards, and parity-validated
                settlement curves — auditable, fallback-safe, and ready for the
                next era of structured contracts.
              </div>
              <div class="oriel-hero-tags">
                <span class="oriel-hero-tag">CPI Forwards</span>
                <span class="oriel-hero-tag">Healthcare</span>
                <span class="oriel-hero-tag">Parity Validation</span>
                <span class="oriel-hero-tag">Tier-1 Basis</span>
              </div>
            </div>

            <div class="oriel-hero-foot">
              <div class="oriel-hero-foot-left">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Oriel · Index Administrator v7.0
              </div>
              <span class="oriel-hero-foot-pill">
                <span class="live-dot"></span> Live workspace
              </span>
            </div>
          </aside>

          <!-- RIGHT: our JSX-style form -->
          <div class="oriel-jsx-formpane">
            <div class="oriel-jsx-form-wrap">

              <div class="oriel-form-eyebrow">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.4"
                     stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Secure admin access
              </div>
              <h1 class="oriel-form-title">Welcome back.</h1>
              <p class="oriel-form-sub">
                Sign in to your private workspace to publish, review, and
                audit governed reference indices.
              </p>

              <form id="oriel-jsx-form" class="oriel-jsx-form" autocomplete="on" novalidate>
                <div class="oriel-jsx-field">
                  <label class="oriel-jsx-label" for="oriel_u">Username</label>
                  <div class="oriel-jsx-input-wrap">
                    <input
                      id="oriel_u" name="username" type="text"
                      class="oriel-jsx-input"
                      autocomplete="username"
                      placeholder="Chris"
                      autocapitalize="off"
                      autocorrect="off"
                      spellcheck="false"
                    />
                  </div>
                </div>

                <div class="oriel-jsx-field">
                  <label class="oriel-jsx-label" for="oriel_p">Password</label>
                  <div class="oriel-jsx-input-wrap">
                    <input
                      id="oriel_p" name="password" type="password"
                      class="oriel-jsx-input"
                      autocomplete="current-password"
                      placeholder="••••••••••"
                    />
                    <button type="button" class="oriel-jsx-eye"
                            id="oriel_eye" aria-label="Show password">
                      <svg id="oriel_eye_icon" width="16" height="16"
                           viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" stroke-width="2"
                           stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <button type="submit" class="oriel-jsx-submit" id="oriel_submit">
                  <span id="oriel_submit_label">Sign in to Oriel</span>
                </button>

                {err_html}
              </form>

              <div class="oriel-form-foot">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                Secure workspace · session ends when you close this tab.
              </div>
            </div>
          </div>
        </div>

        <script>
          /* JSX-form → hidden Streamlit form bridge.

             The visible form is plain HTML we control 100%. When the user
             submits, we copy values into the hidden Streamlit text_inputs
             (using React's nativeInputValueSetter so React tracks the
             change), then programmatically click the hidden submit button.
             Streamlit reruns server-side, validates, and either sets
             session_state["oriel_auth"] or re-renders with an error. */
          (function () {{
            if (window.__orielLoginInit) return;
            window.__orielLoginInit = true;

            function ready(fn) {{
              if (document.readyState !== 'loading') fn();
              else document.addEventListener('DOMContentLoaded', fn);
            }}

            function setReactValue(input, value) {{
              try {{
                var proto = Object.getPrototypeOf(input);
                var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                setter.call(input, value);
              }} catch (e) {{
                input.value = value;
              }}
              input.dispatchEvent(new Event('input', {{ bubbles: true }}));
              input.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }}

            function findStreamlitForm() {{
              var stForm = document.querySelector('[data-testid="stForm"]');
              if (!stForm) return null;
              var allInputs = stForm.querySelectorAll('input');
              var u = null, p = null;
              allInputs.forEach(function (el) {{
                if (el.type === 'password' && !p) p = el;
                else if ((el.type === 'text' || !el.type) && !u) u = el;
              }});
              var btn = stForm.querySelector(
                '[data-testid="stFormSubmitButton"] button, button[kind="primaryFormSubmit"], button[kind="secondaryFormSubmit"]'
              );
              if (!btn) btn = stForm.querySelector('button');
              return (u && p && btn) ? {{ u: u, p: p, btn: btn }} : null;
            }}

            function waitFor(predicate, cb, attempts) {{
              attempts = attempts || 40;
              var result = predicate();
              if (result) {{ cb(result); return; }}
              if (attempts <= 0) {{ cb(null); return; }}
              setTimeout(function () {{ waitFor(predicate, cb, attempts - 1); }}, 75);
            }}

            ready(function () {{
              var form = document.getElementById('oriel-jsx-form');
              var uInput = document.getElementById('oriel_u');
              var pInput = document.getElementById('oriel_p');
              var eyeBtn = document.getElementById('oriel_eye');
              var submitBtn = document.getElementById('oriel_submit');
              var submitLbl = document.getElementById('oriel_submit_label');
              if (!form || !uInput || !pInput || !submitBtn) return;

              /* Password show/hide toggle */
              eyeBtn.addEventListener('click', function () {{
                var hidden = pInput.type === 'password';
                pInput.type = hidden ? 'text' : 'password';
                eyeBtn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
              }});

              /* Auto-focus the username field */
              setTimeout(function () {{ uInput.focus(); }}, 150);

              /* Submit bridge */
              form.addEventListener('submit', function (e) {{
                e.preventDefault();
                waitFor(findStreamlitForm, function (st) {{
                  if (!st) {{
                    console.error('[oriel] hidden Streamlit form not found');
                    submitLbl.textContent = 'Sign in to Oriel';
                    submitBtn.disabled = false;
                    return;
                  }}
                  setReactValue(st.u, uInput.value);
                  setReactValue(st.p, pInput.value);

                  submitBtn.disabled = true;
                  submitLbl.innerHTML = '<span class="oriel-jsx-spin"></span> Signing in…';

                  /* Give React a microtask to commit the input values
                     before we click submit. */
                  setTimeout(function () {{ st.btn.click(); }}, 60);
                }});
              }});
            }});
          }})();
        </script>
        """
    # 1) Dedent: textwrap strips the common leading whitespace introduced
    #    by the f-string being inside the function body. After this, top-
    #    level HTML tags start at column 0, satisfying CommonMark's "less
    #    than 4 spaces" rule for HTML blocks.
    # 2) Collapse blank lines: this keeps the whole HTML as a single block
    #    in the markdown parser's eyes — so it passes through verbatim
    #    instead of breaking into separate blocks (some of which would be
    #    interpreted as indented code blocks).
    _login_html = _tw_login.dedent(_login_html)
    _login_html = _re_login.sub(r"\n[ \t]*\n+", "\n", _login_html)
    st.markdown(_login_html, unsafe_allow_html=True)

    # Hidden Streamlit form — the real auth backend. Off-screen via CSS;
    # driven by JS bridge above. On submit, validates credentials and
    # either flips session_state["oriel_auth"] or sets the error flag and
    # reruns so our visible form re-renders with the error inlined.
    with st.form("oriel_login", clear_on_submit=False, border=False):
        username = st.text_input(
            "Username", label_visibility="collapsed",
            key="_login_u_hidden",
        )
        password = st.text_input(
            "Password", type="password", label_visibility="collapsed",
            key="_login_p_hidden",
        )
        submitted = st.form_submit_button("Sign in", type="primary")
        if submitted:
            if _check_credentials(username or "", password or ""):
                st.session_state["oriel_auth"] = True
                st.session_state["oriel_user"] = (username or "").strip()
                st.rerun()
            else:
                st.session_state["_login_err"] = True
                st.rerun()

# Logout handler — triggered by `?logout=1` from the React app's profile
# dropdown. Clear session, drop the query param, rerun → login screen.
if st.query_params.get("logout") in ("1", "true"):
    for k in ("oriel_auth", "oriel_user"):
        st.session_state.pop(k, None)
    try:
        st.query_params.clear()
    except Exception:
        pass
    st.rerun()

if not st.session_state.get("oriel_auth"):
    _render_login()
    st.stop()

# Hide Streamlit chrome and pin the components iframe to the browser viewport
# via `position: fixed`. This is the simplest way to bypass the multiple
# nested wrappers Streamlit puts around our iframe — we don't need to fight
# their sizing, we just take the iframe out of flow and pin it to 100vw/100vh.
st.markdown(
    """
    <style>
      /* Kill Streamlit chrome + paint the body our app's bg so any 1px sliver
         around the iframe blends in instead of looking like a black border. */
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        height: 100vh !important;
        background: #F4F6FB !important;
      }
      header[data-testid="stHeader"] { display: none !important; }
      footer { display: none !important; }
      [data-testid="stSidebar"] { display: none !important; }
      [data-testid="stToolbar"] { display: none !important; }
      [data-testid="stStatusWidget"] { display: none !important; }
      [data-testid="stDecoration"] { display: none !important; }

      /* Clear transforms / filters on every Streamlit wrapper. CSS `transform`
         on any ancestor turns it into the containing block for descendants
         with position:fixed, which would defeat our viewport pin below. */
      html, body,
      [data-testid="stAppViewContainer"],
      [data-testid="stMain"],
      [data-testid="stMainBlockContainer"],
      [data-testid="stIFrame"],
      [data-testid="stCustomComponentV1"],
      [data-testid="stElementContainer"],
      .stCustomComponentV1, .stHtml,
      .main, .block-container,
      .element-container, .stElementContainer {
        transform: none !important;
        filter: none !important;
        perspective: none !important;
        contain: none !important;
        background: transparent !important;
      }

      /* Pin ANY iframe to the full browser viewport. Only one iframe exists
         on this page (our React component), so a tag-only selector is safe. */
      iframe {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        z-index: 99999 !important;
        display: block !important;
      }

      /* ── Loading overlay shown while Streamlit cold-starts (Kalshi /
         Polymarket / Tier-1 fetch + bundle build, ~5-15s). The iframe lands
         with z-index: 99999 on top — once it paints, this sits behind it.
         If the iframe is still building, the overlay is the only thing the
         user sees, so they get a spinner instead of a black/white blank. */
      .oriel-boot-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        z-index: 1;        /* below iframe (99999), above streamlit chrome */
        background: #F4F6FB;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 16px;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        color: #5A6478;
      }
      .oriel-boot-overlay-spin {
        width: 26px; height: 26px;
        border-radius: 50%;
        border: 3px solid #E5ECFF;
        border-top-color: #2D5BFF;
        animation: oriel-boot-spin 700ms linear infinite;
      }
      .oriel-boot-overlay-text {
        font-size: 13px; font-weight: 500; letter-spacing: 0.01em;
      }
      .oriel-boot-overlay-sub {
        font-size: 11px; color: #8a93a6; letter-spacing: 0.02em;
      }
      @keyframes oriel-boot-spin { to { transform: rotate(360deg); } }
    </style>

    <!-- Pre-React loading screen. Renders the instant the streamlit page hits
         the browser — sits behind the iframe (z-index 1 vs iframe's 99999).
         User no longer sees a black/white blank during cold start. -->
    <div class="oriel-boot-overlay">
      <div class="oriel-boot-overlay-spin"></div>
      <div class="oriel-boot-overlay-text">Loading Oriel</div>
      <div class="oriel-boot-overlay-sub">Fetching live venue feeds…</div>
    </div>

    <script>
      // JS belt-and-suspenders: re-pin via inline styles after Streamlit
      // mounts. Inline styles with !important beat any rule Streamlit
      // re-applies during its render lifecycle.
      (function () {
        function pin() {
          document.querySelectorAll('iframe').forEach(function (f) {
            var s = f.style;
            s.setProperty('position', 'fixed', 'important');
            s.setProperty('top', '0', 'important');
            s.setProperty('left', '0', 'important');
            s.setProperty('right', '0', 'important');
            s.setProperty('bottom', '0', 'important');
            s.setProperty('width', '100vw', 'important');
            s.setProperty('height', '100vh', 'important');
            s.setProperty('margin', '0', 'important');
            s.setProperty('border', '0', 'important');
            s.setProperty('z-index', '99999', 'important');
            s.setProperty('display', 'block', 'important');
          });
          // Strip transforms on common ancestors (defensive — should already
          // be cleared by CSS above but not all Streamlit versions tag the
          // same way).
          var ancestors = [
            document.documentElement, document.body,
            ...document.querySelectorAll('[data-testid], .main, .block-container, .element-container'),
          ];
          ancestors.forEach(function (el) {
            if (!el || !el.style) return;
            el.style.setProperty('transform', 'none', 'important');
            el.style.setProperty('filter', 'none', 'important');
          });
        }
        window.addEventListener('load', pin);
        window.addEventListener('resize', pin);
        [50, 200, 500, 1000, 2000].forEach(function (ms) { setTimeout(pin, ms); });
        pin();
      })();
    </script>
    """,
    unsafe_allow_html=True,
)

# ── Build the inlined bundle and embed ───────────────────────────────────────
# Fetch live Kalshi CPI snapshots on each render (60s cache). Falls back to
# sample data inside the React app when the payload is "null".
live_payload = _cached_live_cpi_payload()
# Build the v7 venue-blend parent curve once (1h cache; static CSV inputs).
blended_payload = _cached_blended_payload()
# Build v7's ForecastEx package (live + sample) for the FX index tab.
forecastex_payload = _cached_forecastex_payload()
polymarket_payload = _cached_polymarket_payload()
perp_payload       = _cached_perp_payload()
cms_payload        = _cached_cms_payload()
mb_payload         = _cached_medical_basis_payload()
parity_payload     = _cached_parity_payload()
admin_payload      = _cached_admin_payload()
# Inject the logged-in user so the React top nav can render a profile
# pill + logout option (replaces the old "Connect" button).
session_user       = st.session_state.get("oriel_user", "Admin")
session_payload    = json.dumps({"user": session_user})
html = build_bundle(
    APP_ROOT,
    live_payload_json=live_payload,
    blended_payload_json=blended_payload,
    forecastex_payload_json=forecastex_payload,
    polymarket_payload_json=polymarket_payload,
    perp_payload_json=perp_payload,
    cms_payload_json=cms_payload,
    medical_basis_payload_json=mb_payload,
    parity_payload_json=parity_payload,
    admin_payload_json=admin_payload,
    session_payload_json=session_payload,
)

# Pick a height that's <= a typical browser viewport so the iframe doesn't
# overflow the page and force a browser-level scroll (which would carry the
# topnav off-screen). The CSS above stretches the iframe to 100vh anyway,
# but Streamlit needs a numeric `height` argument.
# scrolling=True is critical: with scrolling=False, the iframe's `scrolling="no"`
# attribute hard-disables scroll on the inner document AND constrains body
# height to the iframe height — sticky headers and overflowing content can't
# scroll at all. Enabling it lets the iframe body's overflow:auto take effect.
components.html(html, height=900, scrolling=True)
