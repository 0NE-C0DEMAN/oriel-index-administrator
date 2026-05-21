"""
app.py — Oriel Prediction Index Administrator v7
Thin entrypoint: page config, CSS injection, nav bar, tab routing.
All rendering logic lives in tabs/, UI infrastructure in ui/.
"""
from __future__ import annotations

import os
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

# ── Core imports ──────────────────────────────────────────────────────────────
from sample_data import (
    HEALTHCARE_CONTRACTS_TABLE, HEALTHCARE_METHODOLOGY, HEALTHCARE_SNAPSHOTS,
)

# ── Feature flags (check if venue/analytics packages are importable) ──────────
try:
    import venues.kalshi  # noqa: F401
    PHASE2_AVAILABLE = True
except ImportError:
    PHASE2_AVAILABLE = False

try:
    import parity  # noqa: F401
    PARITY_AVAILABLE = True
except ImportError:
    PARITY_AVAILABLE = False

try:
    import venues.forecastex  # noqa: F401
    FORECASTEX_AVAILABLE = True
except Exception:
    FORECASTEX_AVAILABLE = False

try:
    import venues.polymarket  # noqa: F401
    POLYMARKET_AVAILABLE = True
except Exception:
    POLYMARKET_AVAILABLE = False

try:
    import analytics.tier1_fv_engine  # noqa: F401
    import analytics.cpi_basis_diagnostics  # noqa: F401
    TIER1_AVAILABLE = True
except Exception:
    TIER1_AVAILABLE = False

try:
    import analytics.medical_basis_contract  # noqa: F401
    MEDICAL_BASIS_AVAILABLE = True
except Exception:
    MEDICAL_BASIS_AVAILABLE = False

# ── UI infrastructure ─────────────────────────────────────────────────────────
from ui.tokens import LIVE_TOGGLE_WIDGET_KEY
from ui.css import inject_css
from ui.nav import render_nav_bar
from ui.components import HC_STEPS, CPI_STEPS


from tabs.index_tab import _live_cpi_enabled
from tabs.index_admin_tab import render_index_admin_tab


# ── Page config + CSS ─────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Oriel · Index Administrator",
    page_icon="◈",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Initialize session state for active tab (if using sidebar nav in future)
if "active_tab" not in st.session_state:
    st.session_state.active_tab = "hc"

# Tab metadata for potential top bar use
_TAB_META = {
    "hc":     ("CareFi Healthcare Trend Index",          "Healthcare / Scalar buckets"),
    "cpi":    ("Oriel CPI Forward Index",                "Kalshi-style binary contracts"),
    "fx":     ("Oriel CPI Forward Index",                "ForecastEx-style binary thresholds"),
    "poly":   ("Oriel CPI Forward Index",                "Polymarket-style threshold contracts"),
    "perp":   ("Oriel CPI Basis",                        "Tier 1 · Spot / FV / Carry / Basis"),
    "cms":    ("Oriel Healthcare Reference",             "Healthcare cost translation layer"),
    "med_basis": ("ForecastEx Medical Basis",             "Medical inflation vs. CPI spread contracts"),
    "parity": ("OTC Parity Validation",                  "Benchmark gate · OTC CPI swap curves"),
}

inject_css()

# ── Pre-load CPI data ─────────────────────────────────────────────────────────
from tabs.index_tab import resolve_cpi_inputs

_use_live_cpi = bool(_live_cpi_enabled() and PHASE2_AVAILABLE and st.session_state.get(LIVE_TOGGLE_WIDGET_KEY, True))
_cpi_methodology, _cpi_snapshots, _cpi_contracts, _cpi_runtime_meta = resolve_cpi_inputs(_use_live_cpi)

# ── Top-level routing via query params ────────────────────────────────────────
active_view = st.query_params.get('view', 'main')
if isinstance(active_view, list):
    active_view = active_view[0]
active_view = active_view or 'main'

# ── Navigation bar ────────────────────────────────────────────────────────────
render_nav_bar(
    cpi_runtime_meta=_cpi_runtime_meta,
    use_live_cpi=_use_live_cpi,
    live_cpi_enabled=_live_cpi_enabled(),
    phase2_available=PHASE2_AVAILABLE,
    active_view=active_view,
)

# ── View routing ──────────────────────────────────────────────────────────────
if active_view == 'index_admin':
    render_index_admin_tab()
else:
    # ── Tab definitions ───────────────────────────────────────────────────────
    tab_hc, tab_cpi, tab_fx, tab_poly, tab_perp, tab_cms, tab_med_basis, tab_parity = st.tabs([
        "CareFi Healthcare Trend Index",
        "Oriel CPI Forward Index (Kalshi-style)",
        "Oriel CPI Forward Index (ForecastEx-style)",
        "Oriel CPI Forward Index (Polymarket-style)",
        "Oriel CPI Basis",
        "Oriel Healthcare Reference",
        "ForecastEx Medical Basis",
        "OTC Parity Validation",
    ])

    # ── Tab routing ───────────────────────────────────────────────────────────
    from tabs import (
        render_index, render_forecastex_tab, render_polymarket_tab,
        render_perp_readiness_tab, render_cms_lag_engine_tab,
        render_medical_basis_tab, render_parity_tab,
    )

    with tab_hc:
        render_index(
            HEALTHCARE_METHODOLOGY, HEALTHCARE_SNAPSHOTS, HEALTHCARE_CONTRACTS_TABLE,
            "Implied Healthcare Trend (%)", "%",
            "US healthcare cost trend, derived from prediction-market scalar bucket contracts.",
            HC_STEPS, "hc",
        )

    with tab_cpi:
        render_index(
            _cpi_methodology, _cpi_snapshots, _cpi_contracts,
            "Implied CPI YoY (%)", "%",
            "US CPI year-over-year, derived from Kalshi-style binary threshold and exact-outcome contracts.",
            CPI_STEPS, "cpi",
            runtime_meta=_cpi_runtime_meta,
            show_live_toggle=bool(PHASE2_AVAILABLE),
        )

    with tab_fx:
        if FORECASTEX_AVAILABLE:
            render_forecastex_tab()
        else:
            st.warning("ForecastEx modules not found. Place forecastex_*.py files in the app root directory.")

    with tab_poly:
        if POLYMARKET_AVAILABLE:
            render_polymarket_tab()
        else:
            st.warning("Polymarket modules not found. Place polymarket_*.py files in the app root directory.")

    with tab_perp:
        if TIER1_AVAILABLE:
            render_perp_readiness_tab()
        else:
            st.warning("Tier 1 engine not found. Place tier1_fv_engine.py in the analytics directory.")

    with tab_cms:
        render_cms_lag_engine_tab()

    with tab_med_basis:
        if MEDICAL_BASIS_AVAILABLE:
            render_medical_basis_tab()
        else:
            st.warning("Medical basis contract module not found. Place medical_basis_contract.py in the analytics directory.")

    with tab_parity:
        if PARITY_AVAILABLE:
            render_parity_tab()
        else:
            st.warning("Parity modules not found. Place parity_*.py files in the parity directory.")
