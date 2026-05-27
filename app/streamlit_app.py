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
from cme_data       import cme_payload_json
from perp_data       import perp_payload_json
from cms_data        import cms_payload_json
from medical_basis_data import medical_basis_payload_json
from parity_data         import parity_payload_json
from admin_data          import admin_payload_json
from execution_data      import execution_payload_json

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


@st.cache_data(ttl=600, show_spinner=False)
def _cached_cme_payload() -> str:
    """Build the v7 CME CPI proxy package (source_status, contracts,
    curve points, publishability) for the new CPI · CME tab. v7's
    @st.cache_data ttl=600 on _cached_cme_proxy_package — mirrored here."""
    return cme_payload_json()


@st.cache_data(ttl=600, show_spinner=False)
def _cached_execution_payload() -> str:
    """Build the Execution Workbench summary (forward risk regime,
    dislocation strip, posture multipliers) derived from the existing
    Redesign perp / venue stack. Refresh in lockstep with the perp /
    venue caches."""
    return execution_payload_json()


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
# Per Ksenia's MVP-app-lock review the global shell should not box Oriel
# into an admin console. Page title now says "Oriel CPI Surface"; the
# "Index Administrator" wording is reserved for the Admin section's own
# page header.
st.set_page_config(
    page_title="Oriel CPI Surface",
    page_icon="◈",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── Auth gate ────────────────────────────────────────────────────────────────
# Single admin login. Credentials come from env vars when deployed to Hugging
# Face (Space Settings -> Secrets -> ORIEL_ADMIN_USERNAME / ORIEL_ADMIN_PASSWORD,
# which HF surfaces as plain environment variables), with a built-in fallback
# so local dev still works.
#
# We deliberately do NOT touch st.secrets here. Without a secrets.toml on disk
# st.secrets.get raises StreamlitSecretNotFoundError whose message lists local
# file paths like ".streamlit/secrets.toml", and Streamlit surfaces that error
# in the UI even if we catch the exception in Python. Reading os.environ has
# no side-effects and works identically on HF and locally.
#
# Session persistence: we set a signed HMAC token in an `oriel_session`
# cookie (7-day TTL) so refreshing the tab or closing + reopening within the
# window keeps the user logged in. The cookie value is base64(user|expiry|sig)
# where sig = HMAC-SHA256(secret, user|expiry). Tampering invalidates the sig
# so the session can't be forged. Closing the tab no longer logs the user
# out — real apps don't do that.
#
# Reading uses Streamlit's native `st.context.cookies` (added in 1.35);
# writing uses a tiny inline-iframe <script> that touches
# window.top.document.cookie directly so the cookie lands on the parent
# page (and survives full reloads), not just inside a component iframe.
import hmac
import hashlib
import base64
import time
import os
from datetime import datetime, timedelta, timezone

import streamlit.components.v1 as components

# Cookie name + TTL.
_SESSION_COOKIE = "oriel_session"
_SESSION_TTL_DAYS = 7


def _admin_credentials() -> tuple[str, str]:
    """Pull the admin credentials. Env vars win over the in-file default.

    Default username is "Macro Desk" so the credential matches the
    productized branding shown in the top-right TopNav account display.
    Operators can override via ORIEL_ADMIN_USERNAME on the HF Space."""
    u = os.environ.get("ORIEL_ADMIN_USERNAME", "Macro Desk")
    p = os.environ.get("ORIEL_ADMIN_PASSWORD", "Oriel2026@123!")
    return u, p

def _check_credentials(username: str, password: str) -> bool:
    expected_u, expected_p = _admin_credentials()
    return (
        hmac.compare_digest(username.strip(), expected_u) and
        hmac.compare_digest(password,         expected_p)
    )


def _make_session_token(username: str, ttl_seconds: int = _SESSION_TTL_DAYS * 86400) -> str:
    """Pack username + expiry + HMAC signature into a base64-url token."""
    _, secret = _admin_credentials()
    expiry = int(time.time()) + ttl_seconds
    msg = f"{username}|{expiry}".encode()
    sig = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
    raw = f"{username}|{expiry}|{sig}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _verify_session_token(token: str) -> str | None:
    """Return username if the token is well-formed, not expired, and
    signature matches the current secret. Otherwise return None."""
    if not token:
        return None
    try:
        # Re-pad base64 in case the trailing '=' was stripped.
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode()).decode()
        parts = raw.split("|")
        if len(parts) != 3:
            return None
        username, expiry_str, sig = parts
        expiry = int(expiry_str)
        if expiry < time.time():
            return None
        _, secret = _admin_credentials()
        expected_sig = hmac.new(secret.encode(), f"{username}|{expiry}".encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        expected_u, _ = _admin_credentials()
        if not hmac.compare_digest(username, expected_u):
            return None
        return username
    except Exception:
        return None


def _read_session_cookie() -> str | None:
    """Read oriel_session cookie from the parent page via the native
    st.context.cookies API. Returns None if not present or unavailable."""
    try:
        ctx = getattr(st, "context", None)
        if ctx is None:
            return None
        cookies = getattr(ctx, "cookies", None)
        if cookies is None:
            return None
        return cookies.get(_SESSION_COOKIE)
    except Exception:
        return None


def _write_session_cookie(token: str, ttl_seconds: int = _SESSION_TTL_DAYS * 86400) -> None:
    """Set the oriel_session cookie on the PARENT page (not in a sandboxed
    iframe) via a tiny window.top.document.cookie write. Streamlit's
    components.v1.html() runs the script inside an iframe that shares the
    parent origin, so window.top.document.cookie is accessible. Without
    `window.top.` we'd be writing to the iframe's own document, which
    would never survive a full page reload."""
    # Cookie attributes: max-age (seconds), path=/ so all routes can read,
    # SameSite=Lax so cross-tab navigations preserve it. Secure flag is
    # auto-added in HTTPS context by browser default behaviour.
    js = f"""
    <script>
      (function() {{
        try {{
          var doc = (window.top && window.top.document) || document;
          doc.cookie = "{_SESSION_COOKIE}=" + "{token}" +
                       "; max-age={ttl_seconds}" +
                       "; path=/" +
                       "; SameSite=Lax";
        }} catch (e) {{ /* cross-origin blocked — fall through */ }}
      }})();
    </script>
    """
    components.html(js, height=0)


def _clear_session_cookie() -> None:
    """Drop the oriel_session cookie on the parent page (sets max-age=0)."""
    js = f"""
    <script>
      (function() {{
        try {{
          var doc = (window.top && window.top.document) || document;
          doc.cookie = "{_SESSION_COOKIE}=; max-age=0; path=/; SameSite=Lax";
        }} catch (e) {{ /* cross-origin blocked */ }}
      }})();
    </script>
    """
    components.html(js, height=0)

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
    """Split-screen login: gradient hero on the left, Streamlit form on
    the right. We position a fixed accent-gradient `<aside>` covering the
    left half of the viewport, and constrain Streamlit's natural main
    container to the right half via CSS — that way the Streamlit form is
    real and interactive (no JS bridge needed) and the page LOOKS like a
    polished two-column JSX login.

    Theme is forced light via `.streamlit/config.toml` so HF Spaces' dark
    default doesn't fight our input styling.
    """
    logo_uri = _oriel_logo_uri()
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
          /* ── Kill Streamlit chrome ───────────────────────────────────── */
          header[data-testid="stHeader"],
          footer,
          [data-testid="stSidebar"],
          [data-testid="stToolbar"],
          [data-testid="stStatusWidget"],
          [data-testid="stDecoration"] {{ display: none !important; }}
          html, body, .stApp {{
            margin: 0 !important; padding: 0 !important;
            min-height: 100vh !important;
            background: #FFFFFF !important;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
            color-scheme: light !important;
            color: #0E1733 !important;
          }}
          [data-testid="stAppViewContainer"],
          [data-testid="stMain"] {{
            padding: 0 !important; margin: 0 !important;
            background: transparent !important;
          }}
          /* RIGHT pane = Streamlit's natural main container. Slide it to
             the right half of the viewport, anchor the form vertically,
             and lay a very faint dot-grid + cool warmth gradient so the
             pane has the same visual depth as the hero on the left. */
          [data-testid="stMainBlockContainer"] {{
            position: relative !important;
            margin-left: 50% !important;
            width: 50% !important;
            max-width: none !important;
            min-height: 100vh !important;
            padding: 16px 48px 10px !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            background: #FFFFFF !important;
            overflow: hidden !important;
          }}
          [data-testid="stMainBlockContainer"] > div {{
            width: 100% !important;
            max-width: 440px !important;
            margin: 0 auto !important;
          }}
          /* ── LEFT pane: fixed accent-gradient hero ───────────────────── */
          .oriel-login-hero {{
            position: fixed; top: 0; left: 0; bottom: 0; width: 50%;
            background:
              radial-gradient(circle at 18% 22%, rgba(255,255,255,0.20) 0%, transparent 38%),
              radial-gradient(circle at 82% 78%, rgba(91,138,255,0.30) 0%, transparent 42%),
              linear-gradient(135deg, #1C39B0 0%, #2D5BFF 50%, #4F7BFF 100%);
            overflow: hidden;
            padding: 56px 64px;
            box-sizing: border-box;
            display: flex; flex-direction: column; justify-content: space-between;
            color: #FFFFFF;
            z-index: 1;
          }}
          .oriel-login-hero::before {{
            content: ''; position: absolute; inset: 0;
            background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,0.10) 1px, transparent 1px);
            background-size: 28px 28px;
            mask-image: linear-gradient(180deg, transparent 0%, black 22%, black 78%, transparent 100%);
            -webkit-mask-image: linear-gradient(180deg, transparent 0%, black 22%, black 78%, transparent 100%);
            pointer-events: none; opacity: 0.7;
          }}
          .oriel-login-hero::after {{
            content: ''; position: absolute;
            bottom: -180px; right: -180px;
            width: 520px; height: 520px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 35%, transparent 65%);
            pointer-events: none; filter: blur(2px);
          }}
          .oriel-hero-mark {{
            display: flex; align-items: center; gap: 14px;
            position: relative; z-index: 2;
          }}
          .oriel-hero-mark img {{
            height: 104px; width: auto;
            filter: brightness(0) invert(1); opacity: 0.96;
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
          .oriel-hero-tags {{ display: flex; gap: 8px; flex-wrap: wrap; }}
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
          /* ── RIGHT pane content (above the Streamlit form) ───────────── */
          .oriel-form-eyebrow {{
            display: inline-flex; align-items: center; gap: 7px;
            padding: 4px 10px 4px 8px;
            background: rgba(45, 91, 255, 0.08);
            border: 1px solid rgba(45, 91, 255, 0.18);
            border-radius: 999px;
            font-size: 10px; font-weight: 700;
            letter-spacing: 0.14em; text-transform: uppercase;
            color: #2D5BFF;
            margin-bottom: 6px;
          }}
          .oriel-form-eyebrow svg {{ color: #2D5BFF; }}
          .oriel-form-title {{
            font-size: 24px; font-weight: 700;
            letter-spacing: -0.02em; line-height: 1.1;
            color: #0E1733;
            margin: 0 0 8px 0;
          }}
          .oriel-form-subtitle {{ display: none; }}
          .oriel-form-sub {{
            font-size: 14px; line-height: 1.5;
            color: #5A6478;
            margin: 0 0 16px 0;
          }}
          /* Secure-workspace foot chip is dropped in the no-scroll layout.
             The 'Secure admin access' chip at the top of the form already
             carries the security signal. */
          .oriel-form-foot {{ display: none !important; }}
          /* What-Oriel-enables stack below the form. Compact section
             header + vertically stacked horizontal cards. Lives directly
             under the form so the right pane has two visual halves: the
             auth block on top, the capability block below. */
          .oriel-form-features {{
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px solid #EEF1F6;
          }}
          .oriel-form-features-eyebrow {{
            font-size: 9.5px; font-weight: 700;
            letter-spacing: 0.16em; text-transform: uppercase;
            color: #8A93A6;
            margin-bottom: 6px;
            display: flex; align-items: center; gap: 8px;
          }}
          .oriel-form-features-eyebrow::before {{
            content: ''; display: inline-block;
            width: 18px; height: 1px; background: #CFD5E1;
          }}
          /* Cards stacked vertically, each one a horizontal banner with
             the icon on the left and the (label + body) on the right.
             This gives every card the full form-column width so the
             sentence-level copy from the CEO doc wraps to 1-2 lines
             instead of being squeezed into a 140px column and wrapping
             6-7 lines. Total stack height ends up roughly the same as
             the old 3-up grid but with massively more breathing room
             per card. */
          .oriel-form-features-grid {{
            display: flex;
            flex-direction: column;
            gap: 5px;
          }}
          .oriel-form-feature {{
            position: relative;
            display: flex;
            align-items: center;
            gap: 10px;
            background: #F8FAFD;
            border: 1px solid #EEF1F6;
            border-radius: 10px;
            padding: 7px 14px 7px 10px;
            transition: border-color 0.15s ease, background 0.15s ease,
                        transform 0.15s ease, box-shadow 0.15s ease;
          }}
          .oriel-form-feature:hover {{
            background: #FFFFFF;
            border-color: #CFD5E1;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
          }}
          .oriel-form-feature-icon {{
            flex: none;
            width: 30px; height: 30px;
            background: linear-gradient(135deg, #E0E7FF 0%, #C7D2FE 100%);
            border-radius: 8px;
            display: inline-flex; align-items: center; justify-content: center;
            color: #2D5BFF;
          }}
          .oriel-form-feature-icon svg {{ width: 15px; height: 15px; }}
          .oriel-form-feature-body {{
            min-width: 0;
            flex: 1;
            padding-right: 18px;
          }}
          .oriel-form-feature-label {{
            font-size: 12.5px; font-weight: 700;
            color: #0E1733;
            letter-spacing: -0.005em;
            line-height: 1.25;
            margin-bottom: 1px;
          }}
          /* Body copy on the three cards. Full sentence per card, with
             the full form column to wrap in — never gets squeezed. */
          .oriel-form-feature-sub {{
            font-size: 10.5px;
            color: #5C6680;
            font-weight: 500;
            letter-spacing: 0.005em;
            line-height: 1.4;
          }}
          /* ── Streamlit form polish — light theme bulletproof ─────────── */
          [data-testid="stForm"] {{
            background: transparent !important;
            border: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }}
          /* Tighten the vertical gap Streamlit injects between form
             elements so the login fits in the viewport without scroll. */
          [data-testid="stForm"] [data-testid="stVerticalBlockBorderWrapper"] {{
            margin-bottom: -6px !important;
          }}
          [data-testid="stForm"] [data-testid="stFormSubmitButton"] {{
            margin-top: 2px !important;
          }}
          /* Field labels */
          [data-testid="stForm"] .stTextInput label,
          [data-testid="stForm"] .stTextInput label p {{
            font-size: 10.5px !important;
            font-weight: 700 !important;
            color: #5A6478 !important;
            letter-spacing: 0.10em !important;
            text-transform: uppercase !important;
            margin-bottom: 4px !important;
          }}
          /* Outer BaseWeb wrapper [data-baseweb="input"] is structural
             only — no visible chrome. CAREFUL: do not also strip the
             inner [data-baseweb="base-input"], that is the element we
             style as the actual visible shell below. The previous pass
             used `.stTextInput > div > div` here, which matches the
             inner base-input element (it sits two divs deep inside
             stTextInput) and silently zeroed out the border I was
             trying to apply on the next rule. */
          [data-testid="stForm"] [data-baseweb="input"],
          [data-testid="stForm"] [data-testid="stTextInputRootElement"] {{
            background: transparent !important;
            background-color: transparent !important;
            border-width: 0 !important;
            border-style: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            min-height: 0 !important;
            height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
          }}
          /* Visible input shell. Streamlit's emotion-cache stylesheet
             clamps any border-width set on this element to ~0.8px
             regardless of !important or inline overrides, so we draw
             the "border" with an inset box-shadow instead. Same visual
             result, completely outside Streamlit's border-width
             pipeline. The second inset shadow is a one-pixel inner
             highlight for depth. */
          [data-testid="stForm"] [data-baseweb="base-input"] {{
            background-color: #F5F7FB !important;
            border-width: 0 !important;
            border-radius: 10px !important;
            box-shadow:
              inset 0 0 0 1.5px #B8C2D4,
              inset 0 1px 0 rgba(15, 23, 42, 0.02) !important;
            color: #0E1733 !important;
            min-height: 48px !important;
            transition: background-color 0.15s ease, box-shadow 0.15s ease !important;
          }}
          [data-testid="stForm"] [data-baseweb="base-input"]:hover {{
            background-color: #FFFFFF !important;
            box-shadow:
              inset 0 0 0 1.5px #8A93A6,
              inset 0 1px 0 rgba(15, 23, 42, 0.02) !important;
          }}
          [data-testid="stForm"] [data-baseweb="base-input"]:focus-within {{
            background-color: #FFFFFF !important;
            box-shadow:
              inset 0 0 0 1.5px #2D5BFF,
              0 0 0 4px rgba(45, 91, 255, 0.12) !important;
          }}
          /* The actual <input> — strip native bg/border, set color.
             Explicit line-height matches the visible cap-height so the
             text sits centered in the 48px shell without the bottom of
             descenders (g, p, y) getting clipped against the inner
             border radius. */
          [data-testid="stForm"] input,
          [data-testid="stForm"] input[type="text"],
          [data-testid="stForm"] input[type="password"] {{
            background: transparent !important;
            background-color: transparent !important;
            border: 0 !important;
            outline: 0 !important;
            box-shadow: none !important;
            color: #0E1733 !important;
            -webkit-text-fill-color: #0E1733 !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            letter-spacing: -0.005em !important;
            line-height: 20px !important;
            padding: 12px 14px !important;
            caret-color: #2D5BFF !important;
          }}
          [data-testid="stForm"] input::placeholder {{
            color: #A8B0BF !important; font-weight: 400 !important;
            -webkit-text-fill-color: #A8B0BF !important;
            letter-spacing: 0 !important;
          }}
          /* Kill Chrome autofill yellow bg — match the input shell tint */
          [data-testid="stForm"] input:-webkit-autofill,
          [data-testid="stForm"] input:-webkit-autofill:hover,
          [data-testid="stForm"] input:-webkit-autofill:focus {{
            -webkit-text-fill-color: #0E1733 !important;
            -webkit-box-shadow: 0 0 0 1000px #F5F7FB inset !important;
            transition: background-color 5000s ease-in-out 0s !important;
          }}
          /* Password reveal eye button — replace dark Streamlit default */
          [data-testid="stForm"] [data-baseweb="input"] button,
          [data-testid="stForm"] [data-testid="stTextInput"] button {{
            background: transparent !important;
            background-color: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
            color: #8A93A6 !important;
            padding: 0 14px !important;
            height: 100% !important;
            display: flex !important;
            align-items: center !important;
          }}
          [data-testid="stForm"] [data-baseweb="input"] button:hover,
          [data-testid="stForm"] [data-testid="stTextInput"] button:hover {{
            color: #2D5BFF !important;
            background: transparent !important;
          }}
          [data-testid="stForm"] [data-baseweb="input"] button svg,
          [data-testid="stForm"] [data-testid="stTextInput"] button svg {{
            width: 16px !important; height: 16px !important;
            fill: currentColor !important;
            color: currentColor !important;
          }}
          /* Submit button — accent gradient with hover lift */
          [data-testid="stForm"] [data-testid="stFormSubmitButton"] button,
          [data-testid="stForm"] .stFormSubmitButton button {{
            width: 100% !important;
            background: linear-gradient(180deg, #2D5BFF 0%, #2347D6 100%) !important;
            background-color: #2D5BFF !important;
            color: #FFFFFF !important;
            font-weight: 650 !important;
            font-size: 14px !important;
            letter-spacing: 0.01em !important;
            padding: 11px 18px !important;
            height: 44px !important;
            border-radius: 10px !important;
            border: 0 !important;
            margin-top: 8px !important;
            box-shadow:
              0 4px 14px rgba(45, 91, 255, 0.32),
              inset 0 1px 0 rgba(255,255,255,0.16) !important;
            transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease !important;
          }}
          [data-testid="stForm"] [data-testid="stFormSubmitButton"] button:hover,
          [data-testid="stForm"] .stFormSubmitButton button:hover {{
            transform: translateY(-1px);
            background: linear-gradient(180deg, #3565FF 0%, #2A52E6 100%) !important;
            box-shadow:
              0 8px 22px rgba(45, 91, 255, 0.42),
              inset 0 1px 0 rgba(255,255,255,0.18) !important;
          }}
          [data-testid="stForm"] [data-testid="stFormSubmitButton"] button p {{
            color: #FFFFFF !important;
            font-weight: 650 !important;
            margin: 0 !important;
          }}
          /* Field spacing inside the form */
          [data-testid="stForm"] [data-testid="stElementContainer"] {{
            margin-bottom: 14px !important;
          }}
          /* Error alert tint */
          [data-testid="stAlert"] {{
            border-radius: 10px !important;
            margin-top: 14px !important;
            border: 1px solid rgba(220, 38, 38, 0.20) !important;
            background: #FEF2F2 !important;
          }}
          [data-testid="stAlert"] p,
          [data-testid="stAlert"] div {{
            color: #B91C1C !important; font-size: 13px !important;
          }}
          /* Fade-up entrance for the right pane */
          [data-testid="stMainBlockContainer"] > div {{
            animation: oriel-fade-up 360ms cubic-bezier(0.16, 1, 0.3, 1);
          }}
          @keyframes oriel-fade-up {{
            from {{ opacity: 0; transform: translateY(8px); }}
            to   {{ opacity: 1; transform: translateY(0); }}
          }}
          /* ── Branded loading overlay ─────────────────────────────────
             Fires on every Streamlit render: initial page load, every
             form submit (which triggers a server rerun → markdown re-renders
             → this div appears again). The fade-out animation runs once
             and finishes after 700ms — covering the brief window where
             Streamlit's default chrome would otherwise flash. */
          .oriel-login-boot {{
            position: fixed; inset: 0;
            z-index: 9999;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            gap: 18px;
            color: #FFFFFF;
            background:
              radial-gradient(circle at 18% 22%, rgba(255,255,255,0.16) 0%, transparent 38%),
              radial-gradient(circle at 82% 78%, rgba(91,138,255,0.30) 0%, transparent 42%),
              linear-gradient(135deg, #1C39B0 0%, #2D5BFF 50%, #4F7BFF 100%);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
            /* delay 350ms keeps the overlay visible long enough to mask the
               Streamlit boot flash, then fades over 350ms (700ms total) */
            animation: oriel-login-boot-out 350ms cubic-bezier(0.4, 0, 0.2, 1) 350ms forwards;
          }}
          @keyframes oriel-login-boot-out {{
            to {{ opacity: 0; visibility: hidden; pointer-events: none; }}
          }}
          .oriel-login-boot-spin {{
            width: 32px; height: 32px;
            border-radius: 50%;
            border: 3px solid rgba(255,255,255,0.20);
            border-top-color: rgba(255,255,255,0.96);
            animation: oriel-spin 700ms linear infinite;
          }}
          @keyframes oriel-spin {{ to {{ transform: rotate(360deg); }} }}
          .oriel-login-boot-text {{
            font-size: 13px; font-weight: 600; letter-spacing: 0.02em;
            opacity: 0.92;
          }}
          /* ── Suppress every Streamlit default loading indicator ─────── */
          [data-testid="stStatusWidget"],
          [data-testid="stConnectionStatus"],
          [data-testid="stSkeleton"],
          [data-testid="stToast"],
          [data-testid="stToastContainer"],
          .stSpinner,
          [data-testid="stSpinner"],
          [data-testid="stProgress"],
          [class*="loadingIndicator"],
          [class*="LoadingIndicator"] {{
            display: none !important;
            visibility: hidden !important;
          }}
          /* Submit button — when Streamlit injects its loading spinner,
             style it to match our brand instead of using the dark default */
          [data-testid="stForm"] [data-testid="stFormSubmitButton"] button [data-testid="stSpinner"],
          [data-testid="stForm"] .stFormSubmitButton button [data-testid="stSpinner"] {{
            display: inline-block !important; visibility: visible !important;
            color: #FFFFFF !important;
          }}
          /* Low-contrast copyright footer at the bottom of the viewport
             per Ksenia's MVP-app-lock review. Sits beneath both panels,
             centered, intentionally quiet so it never competes with the
             form. */
          .oriel-login-copyright {{
            text-align: center;
            font-size: 10.5px;
            font-weight: 500;
            letter-spacing: 0.04em;
            color: rgba(14, 23, 51, 0.36);
            margin-top: 6px;
            padding-bottom: 2px;
          }}
          /* Responsive: collapse on narrow viewports */
          @media (max-width: 880px) {{
            .oriel-login-hero {{ display: none; }}
            [data-testid="stMainBlockContainer"] {{
              margin-left: 0 !important;
              width: 100% !important;
              padding: 24px !important;
            }}
          }}
        </style>
        <div class="oriel-login-boot" aria-hidden="true">
          <div class="oriel-login-boot-spin"></div>
          <div class="oriel-login-boot-text">Loading Oriel</div>
        </div>
        <aside class="oriel-login-hero">
          <div class="oriel-hero-mark">
            {logo_html}
          </div>
          <div class="oriel-hero-body">
            <div class="oriel-hero-title">Trade the dislocation.<br /><em>Trust the reference.</em></div>
            <div class="oriel-hero-sub">Oriel turns fragmented prediction-market pricing into reference curves, fair value, and execution intelligence - helping users identify market dislocations and act with greater confidence.</div>
            <div class="oriel-hero-tags">
              <span class="oriel-hero-tag">Reference Curves</span>
              <span class="oriel-hero-tag">Fair Value</span>
              <span class="oriel-hero-tag">Basis Signals</span>
              <span class="oriel-hero-tag">Execution Intelligence</span>
            </div>
          </div>
          <div class="oriel-hero-foot">
            <div class="oriel-hero-foot-left">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Oriel v7.0
            </div>
            <span class="oriel-hero-foot-pill"><span class="live-dot"></span> Live workspace</span>
          </div>
        </aside>
        <div class="oriel-form-eyebrow">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Secure admin access
        </div>
        <h1 class="oriel-form-title">Welcome back.</h1>
        <p class="oriel-form-subtitle">Sign in to your Oriel workspace.</p>
        """
    _login_html = _tw_login.dedent(_login_html)
    _login_html = _re_login.sub(r"\n[ \t]*\n+", "\n", _login_html)
    st.markdown(_login_html, unsafe_allow_html=True)

    # The actual login form — Streamlit's native widgets, styled by our
    # CSS above to look like the JSX/React design system.
    with st.form("oriel_login", clear_on_submit=False, border=False):
        username = st.text_input(
            "Username", placeholder="Macro Desk", key="_login_u",
        )
        password = st.text_input(
            "Password", type="password", placeholder="••••••••••", key="_login_p",
        )
        submitted = st.form_submit_button(
            "Sign in to Oriel", type="primary", use_container_width=True
        )
        if submitted:
            if _check_credentials(username or "", password or ""):
                clean_user = (username or "").strip()
                st.session_state["oriel_auth"] = True
                st.session_state["oriel_user"] = clean_user
                # Persistent session: drop a signed HMAC cookie on the
                # PARENT page so refresh / close+reopen keeps the user
                # logged in for 7 days. We render the cookie-write
                # iframe ONCE here (not rerun immediately) so the
                # browser has time to commit the cookie before the next
                # render reads it.
                _write_session_cookie(_make_session_token(clean_user))
                # Give the cookie a beat to land, then rerun into the
                # authenticated app.
                time.sleep(0.25)
                st.rerun()
            else:
                st.error("Invalid username or password.")

    st.markdown(
        """<div class="oriel-form-foot">"""
        """<svg width="12" height="12" viewBox="0 0 24 24" fill="none" """
        """stroke="currentColor" stroke-width="2" stroke-linecap="round" """
        """stroke-linejoin="round"><circle cx="12" cy="12" r="10"/>"""
        """<polyline points="12 6 12 12 16 14"/></svg>"""
        """Secure workspace · session ends when you close this tab.</div>"""
        """<div class="oriel-form-features">"""
        """  <div class="oriel-form-features-eyebrow">What Oriel enables</div>"""
        """  <div class="oriel-form-features-grid">"""
        """    <div class="oriel-form-feature">"""
        """      <div class="oriel-form-feature-icon">"""
        """        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" """
        """             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">"""
        """          <polygon points="12 2 2 7 12 12 22 7 12 2"/>"""
        """          <polyline points="2 17 12 22 22 17"/>"""
        """          <polyline points="2 12 12 17 22 12"/>"""
        """        </svg>"""
        """      </div>"""
        """      <div class="oriel-form-feature-body">"""
        """        <div class="oriel-form-feature-label">Build the reference</div>"""
        """        <div class="oriel-form-feature-sub">Turn fragmented market pricing into comparable fair value, forward curves, and trusted market surfaces.</div>"""
        """      </div>"""
        """    </div>"""
        """    <div class="oriel-form-feature">"""
        """      <div class="oriel-form-feature-icon">"""
        """        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" """
        """             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">"""
        """          <circle cx="12" cy="12" r="9"/>"""
        """          <line x1="12" y1="2" x2="12" y2="6"/>"""
        """          <line x1="12" y1="18" x2="12" y2="22"/>"""
        """          <line x1="2" y1="12" x2="6" y2="12"/>"""
        """          <line x1="18" y1="12" x2="22" y2="12"/>"""
        """          <circle cx="12" cy="12" r="2.2"/>"""
        """        </svg>"""
        """      </div>"""
        """      <div class="oriel-form-feature-body">"""
        """        <div class="oriel-form-feature-label">Surface the dislocation</div>"""
        """        <div class="oriel-form-feature-sub">Compare venues, detect curve-relative mispricing, and identify cross-market basis opportunities in real time.</div>"""
        """      </div>"""
        """    </div>"""
        """    <div class="oriel-form-feature">"""
        """      <div class="oriel-form-feature-icon">"""
        """        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" """
        """             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">"""
        """          <line x1="3" y1="6" x2="14" y2="6"/>"""
        """          <line x1="18" y1="6" x2="21" y2="6"/>"""
        """          <circle cx="16" cy="6" r="2"/>"""
        """          <line x1="3" y1="12" x2="7" y2="12"/>"""
        """          <line x1="11" y1="12" x2="21" y2="12"/>"""
        """          <circle cx="9" cy="12" r="2"/>"""
        """          <line x1="3" y1="18" x2="16" y2="18"/>"""
        """          <line x1="20" y1="18" x2="21" y2="18"/>"""
        """          <circle cx="18" cy="18" r="2"/>"""
        """        </svg>"""
        """      </div>"""
        """      <div class="oriel-form-feature-body">"""
        """        <div class="oriel-form-feature-label">Simulate the response</div>"""
        """        <div class="oriel-form-feature-sub">Test quoting, inventory, and edge posture as market conditions shift, before turning signals into execution.</div>"""
        """      </div>"""
        """    </div>"""
        """  </div>"""
        """</div>""",
        unsafe_allow_html=True,
    )

    # Low-contrast copyright footer at the bottom of the login viewport
    # per Ksenia's MVP-app-lock review.
    st.markdown(
        """<div class="oriel-login-copyright">© 2026 Oriel Labs, LLC. All rights reserved.</div>""",
        unsafe_allow_html=True,
    )

    # Suppress Chrome password-manager popup by setting autocomplete="off"
    # on the form and its inputs. Runs in a zero-height iframe that touches
    # the parent document's DOM.
    components.html(
        """<script>
        (function(){
          try {
            var d = window.top.document || window.parent.document;
            var f = d.querySelector('[data-testid="stForm"]');
            if(f) { f.setAttribute('autocomplete','off'); }
            var ins = d.querySelectorAll('[data-testid="stForm"] input');
            ins.forEach(function(el){
              el.setAttribute('autocomplete','off');
            });
          } catch(e){}
        })();
        </script>""",
        height=0,
    )

# Logout handler — triggered by `?logout=1` from the React app's profile
# dropdown. Clear session state, drop the persistent cookie via inline
# JS on the parent page, scrub the query param, then rerun into the
# login screen.
if st.query_params.get("logout") in ("1", "true"):
    for k in ("oriel_auth", "oriel_user"):
        st.session_state.pop(k, None)
    _clear_session_cookie()
    try:
        st.query_params.clear()
    except Exception:
        pass
    time.sleep(0.15)
    st.rerun()

# ── Restore session from persistent cookie ──────────────────────────────
# Read the oriel_session cookie via Streamlit's native st.context.cookies.
# If it's a valid signed token, lift st.session_state.oriel_auth = True
# without forcing the user to log in again. This is what makes refresh
# (and tab close+reopen within the 7-day TTL) NOT log them out — real
# apps don't drop sessions on reload.
if not st.session_state.get("oriel_auth"):
    _tok = _read_session_cookie()
    _user_from_cookie = _verify_session_token(_tok) if _tok else None
    if _user_from_cookie:
        st.session_state["oriel_auth"] = True
        st.session_state["oriel_user"] = _user_from_cookie

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
cme_payload        = _cached_cme_payload()
perp_payload       = _cached_perp_payload()
cms_payload        = _cached_cms_payload()
mb_payload         = _cached_medical_basis_payload()
parity_payload     = _cached_parity_payload()
admin_payload      = _cached_admin_payload()
execution_payload  = _cached_execution_payload()
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
    cme_payload_json=cme_payload,
    execution_payload_json=execution_payload,
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
