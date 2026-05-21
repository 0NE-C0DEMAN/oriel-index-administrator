"""
tabs/medical_basis_tab.py — ForecastEx-style medical inflation basis contract UI.

Drop-in Streamlit tab for the illustrative contract:
  Medical CPI YoY - CPI-U YoY > threshold

This intentionally uses sample ladder data until a venue lists the contract or a
live feed is available. All economic calculations live in
analytics.medical_basis_contract.
"""
from __future__ import annotations

from datetime import date

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from analytics.medical_basis_contract import (
    DEFAULT_THRESHOLDS_BPS,
    build_basis_curve,
    basis_curve_dataframe,
    contract_spec_dataframe,
    load_sample_medical_basis_contracts,
    settlement_example,
    settle_medical_basis_contract,
)
from analytics.healthcare_inflation_contracts import build_dec_2027_contract_ladder, evaluate_thresholds
from analytics.healthcare_inflation_methodology import (
    build_latest_methodology_snapshot,
    load_healthcare_weights,
    methodology_summary_text,
)
from ui.charts import _layout as _chart_layout, _xaxis, _yaxis
from ui.plotly_theme import PLOTLY_CONFIG
from ui.tables import _plotly_desk_table, desk_table_content_height_px
from ui.tokens import (
    BG_APP,
    BG_ELEVATED,
    BG_SURFACE,
    BORDER,
    BORDER_STR,
    DESK_TABLE_HEADER_PX,
    DESK_TABLE_PAD_PX,
    DESK_TABLE_ROW_PX,
    GOLD,
    GRID_SOFT,
    INFO,
    POSITIVE,
    SERIES2,
    TEXT_MUTED,
    TEXT_PRI,
    TEXT_SEC,
    WARNING,
)


@st.cache_data(show_spinner=False, ttl=600)
def _cached_medical_basis_curve():
    ladder = load_sample_medical_basis_contracts()
    return build_basis_curve(ladder)


def _make_ladder_chart(ladder_df: pd.DataFrame, maturity: pd.Timestamp) -> go.Figure:
    g = ladder_df[ladder_df["maturity"] == pd.to_datetime(maturity)].sort_values("threshold_bps")
    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=[f"> {int(x)}" for x in g["threshold_bps"]],
        y=g["yes_price"] * 100,
        marker=dict(color=GOLD, line=dict(color="rgba(255,255,255,0.14)", width=1)),
        name="YES price / implied probability",
        hovertemplate="<b>Spread %{x} bps</b><br>YES price: %{y:.1f}%<extra></extra>",
    ))
    fig.update_layout(**_chart_layout(
        height=306,
        xaxis=_xaxis(title="Medical CPI - CPI-U threshold (bps)"),
        yaxis=_yaxis(title="YES price / probability", ticksuffix="%", range=[0, 100]),
    ))
    return fig


def _make_distribution_chart(distribution_df: pd.DataFrame, maturity: pd.Timestamp) -> go.Figure:
    g = distribution_df[distribution_df["maturity"] == pd.to_datetime(maturity)].copy()
    y_max = max(50, float((g["probability"] * 100).max()) + 10)
    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=g["bucket"],
        y=g["probability"] * 100,
        marker=dict(color=SERIES2, line=dict(color="rgba(255,255,255,0.14)", width=1)),
        name="Implied bucket probability",
        hovertemplate="<b>%{x}</b><br>Probability: %{y:.1f}%<extra></extra>",
    ))
    fig.update_layout(**_chart_layout(
        height=306,
        margin=dict(l=56, r=24, t=28, b=78),
        xaxis=_xaxis(title="Implied spread bucket", tickangle=-20),
        yaxis=_yaxis(title="Probability", ticksuffix="%", range=[0, y_max]),
    ))
    return fig


def _make_component_yoy_chart(snapshot_df: pd.DataFrame) -> go.Figure:
    """Bar chart of the BLS medical sub-component YoY values that feed
    the weighted healthcare-inflation reference."""
    g = snapshot_df.sort_values("component_weight", ascending=False)
    weights_pct = (g["component_weight"] * 100).round(0).astype(int)
    labels = [f"{c}<br><span style='color:{TEXT_MUTED};font-size:10px;'>weight {w}%</span>"
              for c, w in zip(g["component_name"], weights_pct)]
    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=labels,
        y=g["component_yoy_pct"],
        marker=dict(color=GOLD, line=dict(color="rgba(255,255,255,0.14)", width=1)),
        text=[f"{v:.2f}%" for v in g["component_yoy_pct"]],
        textposition="outside",
        textfont=dict(color=TEXT_PRI, size=11),
        hovertemplate="<b>%{x}</b><br>YoY: %{y:.2f}%<extra></extra>",
        name="Component YoY",
    ))
    fig.update_layout(**_chart_layout(
        height=306,
        margin=dict(l=56, r=24, t=28, b=58),
        xaxis=_xaxis(title=""),
        yaxis=_yaxis(title="Component YoY (%)", ticksuffix="%"),
    ))
    return fig


def _make_threshold_resolution_chart(ladder_df: pd.DataFrame, current_spread_bp: float) -> go.Figure:
    """Visualize which threshold rungs resolve YES vs NO at the current spread."""
    g = ladder_df.sort_values("threshold_bp")
    resolves_yes = [bool(current_spread_bp > t) for t in g["threshold_bp"]]
    colors = [POSITIVE if y else WARNING for y in resolves_yes]
    labels = [f"&gt; {int(t)} bps" for t in g["threshold_bp"]]
    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=labels,
        y=[1] * len(g),
        marker=dict(color=colors, line=dict(color="rgba(255,255,255,0.18)", width=1)),
        text=["YES" if y else "NO" for y in resolves_yes],
        textposition="inside",
        textfont=dict(color=BG_APP, size=14, family="Inter"),
        hovertemplate="<b>Spread %{x}</b><br>Resolution: %{text}<extra></extra>",
        name="Resolution",
    ))
    fig.add_hline(y=0, line=dict(color="rgba(255,255,255,0.12)", width=1))
    fig.update_layout(**_chart_layout(
        height=306,
        margin=dict(l=20, r=24, t=28, b=40),
        xaxis=_xaxis(title="Threshold rung"),
        yaxis=_yaxis(title="", range=[0, 1.15], showticklabels=False, showgrid=False),
        showlegend=False,
    ))
    return fig


def _make_basis_curve(curve_df: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=curve_df["maturity"],
        y=curve_df["expected_spread_bps"],
        mode="lines+markers",
        line=dict(color=GOLD, width=2.6),
        marker=dict(size=8, color=GOLD, line=dict(color=BG_APP, width=1.5)),
        name="Expected medical-vs-CPI basis",
        hovertemplate="<b>%{x|%Y}</b><br>Expected spread: %{y:.1f} bps<extra></extra>",
    ))
    fig.add_trace(go.Scatter(
        x=curve_df["maturity"],
        y=curve_df["probability_spread_gt_200"] * 100,
        mode="lines+markers",
        yaxis="y2",
        line=dict(color=SERIES2, width=2, dash="dot"),
        marker=dict(size=6, color=SERIES2),
        name="P(spread > 200 bps)",
        hovertemplate="<b>%{x|%Y}</b><br>P(>200 bps): %{y:.1f}%<extra></extra>",
    ))
    fig.update_layout(**_chart_layout(
        height=322,
        xaxis=_xaxis(title="Maturity", tickformat="%Y"),
        yaxis=_yaxis(title="Expected spread (bps)"),
        yaxis2=dict(
            title=dict(text="Probability", font=dict(color=TEXT_SEC, size=11)),
            overlaying="y",
            side="right",
            ticksuffix="%",
            range=[0, 100],
            showgrid=False,
            tickfont=dict(color=TEXT_SEC),
            zeroline=False,
        ),
    ))
    return fig


def _render_contract_cards() -> None:
    """Three reference-leg / contract-event panels using the standard note-box class
    so the gold-accent border and surface gradient match every other tab."""
    st.markdown(
        f"""
        <div style='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:8px 0 12px;'>
          <div class='note-box'>
            <div style='font-size:0.72rem;color:{TEXT_MUTED};text-transform:uppercase;letter-spacing:.08em;font-weight:600;'>1 · Reference Leg</div>
            <div style='font-size:1.04rem;color:{TEXT_PRI};font-weight:700;margin-top:6px;'>BLS CPI-U YoY</div>
            <div style='font-size:0.74rem;color:{TEXT_SEC};margin-top:4px;'>General inflation benchmark and listed-contract starting point.</div>
          </div>
          <div class='note-box'>
            <div style='font-size:0.72rem;color:{TEXT_MUTED};text-transform:uppercase;letter-spacing:.08em;font-weight:600;'>2 · Reference Leg</div>
            <div style='font-size:1.04rem;color:{TEXT_PRI};font-weight:700;margin-top:6px;'>BLS Medical Care CPI YoY</div>
            <div style='font-size:0.74rem;color:{TEXT_SEC};margin-top:4px;'>Healthcare-specific inflation anchor for initial contract design.</div>
          </div>
          <div class='note-box'>
            <div style='font-size:0.72rem;color:{TEXT_MUTED};text-transform:uppercase;letter-spacing:.08em;font-weight:600;'>3 · Contract Event</div>
            <div style='font-size:1.04rem;color:{TEXT_PRI};font-weight:700;margin-top:6px;'>Medical CPI − CPI-U &gt; threshold</div>
            <div style='font-size:0.74rem;color:{TEXT_SEC};margin-top:4px;'>A YES/NO basis contract that prices healthcare inflation outperformance.</div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_medical_basis_tab() -> None:
    curve = _cached_medical_basis_curve()
    curve_df = basis_curve_dataframe(curve)
    ladder = curve.ladder

    with st.container(key="medical_basis_ctrl"):
        cl, cr_lbl, cr_dt = st.columns([5, 1, 2], gap="small", vertical_alignment="center", border=False)
        with cl:
            st.markdown(
                """
                <div class='oriel-page-head'>
                  <span class='oriel-page-title'>ForecastEx: Medical Inflation Basis Contract</span>
                  <span class='version-chip'>v0.1.0-medical-basis</span>
                  <span class='version-chip' style='background:#1b2a3e;color:#7aa2f7;border-color:#2e4a72;'>Illustrative contract design</span>
                </div>
                """,
                unsafe_allow_html=True,
            )
        with cr_lbl:
            st.markdown("<div class='ctrl-vd-label'>Valuation Date</div>", unsafe_allow_html=True)
        with cr_dt:
            st.date_input("Valuation Date", value=date.today(), key="vd_medical_basis", label_visibility="collapsed")

    st.markdown(
        "<div style='font-size:0.78rem;color:#8fa3b8;margin:4px 0 8px;'>"
        "First-ever prediction-market contract to price the spread between medical inflation and CPI — "
        "and seed a tradeable healthcare inflation surface.</div>",
        unsafe_allow_html=True,
    )

    _render_contract_cards()

    # ── Healthcare Inflation Methodology — Oriel pilot reference ────────────
    st.markdown(
        "<div class='shdr shdr-major oriel-section-gap'>Healthcare Inflation Methodology</div>",
        unsafe_allow_html=True,
    )
    weights = load_healthcare_weights()
    methodology = methodology_summary_text()
    snapshot_df, live_result = build_latest_methodology_snapshot(prefer_live=True)
    headline_yoy = live_result.headline_cpi_yoy_pct
    weighted_ref = live_result.healthcare_inflation_reference_yoy_pct
    spread_bp = live_result.healthcare_inflation_spread_bp

    source_is_live = live_result.source_status.lower() == "live"
    status_color = POSITIVE if source_is_live else WARNING
    spread_color = POSITIVE if spread_bp > 0 else WARNING

    # KPI strip — matches the rest of the tab
    st.markdown(
        f"""
        <div class='kpi-strip-wrap'>
          <div class='kpi-strip-ribbon'>ORIEL HEALTHCARE INFLATION REFERENCE · {live_result.methodology_version} · {live_result.weighting_method}</div>
          <div class='kpi-strip'>
            <div class='kpi-cell'>
              <div class='kpi-micro'>Source Status</div>
              <div class='kpi-value' style='color:{status_color};'>{live_result.source_status.upper()}</div>
              <div class='kpi-sub'>BLS CPI-U + medical sub-components</div>
            </div>
            <div class='kpi-cell'>
              <div class='kpi-micro'>Healthcare Reference</div>
              <div class='kpi-value kpi-value--lead'>{weighted_ref:.2f}%</div>
              <div class='kpi-sub'>Weighted YoY (pilot anchors)</div>
            </div>
            <div class='kpi-cell'>
              <div class='kpi-micro'>Headline CPI</div>
              <div class='kpi-value' style='color:{SERIES2};'>{headline_yoy:.2f}%</div>
              <div class='kpi-sub'>BLS CPI-U all items YoY</div>
            </div>
            <div class='kpi-cell'>
              <div class='kpi-micro'>Medical Inflation Spread</div>
              <div class='kpi-value' style='color:{spread_color};'>{spread_bp:.1f} bps</div>
              <div class='kpi-sub'>(Reference − Headline) × 100</div>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("<div class='oriel-section-gap'></div>", unsafe_allow_html=True)

    hi_left, hi_right = st.columns([1.05, 1.35], gap="large", vertical_alignment="top")

    with hi_left:
        st.markdown("<div class='shdr'>Pilot Component Weights</div>", unsafe_allow_html=True)
        wtbl = weights[["component_name", "bls_series_id", "component_weight", "effective_date"]].copy()
        wtbl["component_weight"] = (wtbl["component_weight"] * 100).map(lambda x: f"{x:.1f}%")
        wtbl = wtbl.rename(columns={
            "component_name": "Component",
            "bls_series_id": "BLS Series",
            "component_weight": "Weight",
            "effective_date": "Effective",
        })
        _w_h = DESK_TABLE_HEADER_PX + len(wtbl) * DESK_TABLE_ROW_PX + DESK_TABLE_PAD_PX
        w_fig = _plotly_desk_table(wtbl, gold_column="Weight")
        w_fig.update_layout(height=_w_h)
        with st.container(height=_w_h, border=False, key="scroll_healthcare_weights"):
            st.plotly_chart(w_fig, width="stretch", config=PLOTLY_CONFIG, theme=None, key="tbl_healthcare_weights")

        st.markdown(
            "<div class='shdr oriel-section-gap'>Latest BLS-Based Methodology Snapshot</div>",
            unsafe_allow_html=True,
        )
        snap = snapshot_df[["component_name", "bls_series_id", "component_weight", "component_yoy_pct"]].copy()
        snap["component_weight"] = (snap["component_weight"] * 100).map(lambda x: f"{x:.1f}%")
        snap["component_yoy_pct"] = snap["component_yoy_pct"].map(lambda x: f"{x:.2f}%")
        snap = snap.rename(columns={
            "component_name": "Component",
            "bls_series_id": "BLS Series",
            "component_weight": "Weight",
            "component_yoy_pct": "YoY",
        })
        _s_h = DESK_TABLE_HEADER_PX + len(snap) * DESK_TABLE_ROW_PX + DESK_TABLE_PAD_PX
        s_fig = _plotly_desk_table(snap, gold_column="YoY")
        s_fig.update_layout(height=_s_h)
        with st.container(height=_s_h, border=False, key="scroll_healthcare_snapshot"):
            st.plotly_chart(s_fig, width="stretch", config=PLOTLY_CONFIG, theme=None, key="tbl_healthcare_snapshot")

    with hi_right:
        st.markdown("<div class='shdr'>Component YoY Contribution</div>", unsafe_allow_html=True)
        st.caption("Latest BLS-based component YoY values — the weighted blend forms the healthcare inflation reference.")
        st.plotly_chart(
            _make_component_yoy_chart(snapshot_df),
            width="stretch", config=PLOTLY_CONFIG, key="chart_healthcare_components",
        )

    # Full-width methodology note-box below the columns — keeps the two
    # columns visually balanced and stops the left side from going empty
    # while the right side runs long with explanatory text.
    st.markdown(
        f"""
        <div class='note-box' style='margin-top:6px;'>
          <div style='display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;'>
            <div>
              <div style='font-size:0.70rem;color:{TEXT_MUTED};text-transform:uppercase;letter-spacing:.08em;font-weight:600;'>Reference build</div>
              <div style='font-size:0.78rem;color:{TEXT_SEC};margin-top:6px;line-height:1.5;'>{methodology['how_reference_is_calculated']}</div>
            </div>
            <div>
              <div style='font-size:0.70rem;color:{TEXT_MUTED};text-transform:uppercase;letter-spacing:.08em;font-weight:600;'>Weight philosophy</div>
              <div style='font-size:0.78rem;color:{TEXT_SEC};margin-top:6px;line-height:1.5;font-style:italic;'>{methodology['why_not_single_medical_cpi']}</div>
            </div>
            <div>
              <div style='font-size:0.70rem;color:{TEXT_MUTED};text-transform:uppercase;letter-spacing:.08em;font-weight:600;'>Spread formula</div>
              <div style='font-size:0.78rem;color:{TEXT_SEC};margin-top:6px;line-height:1.5;'>{methodology['how_spread_is_calculated']}</div>
            </div>
            <div>
              <div style='font-size:0.70rem;color:{TEXT_MUTED};text-transform:uppercase;letter-spacing:.08em;font-weight:600;'>Role separation</div>
              <div style='font-size:0.78rem;color:{TEXT_SEC};margin-top:6px;line-height:1.5;'>{methodology['role_separation']}</div>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # ── Illustrative Healthcare Inflation Spread Market Structure ────────────
    st.markdown(
        "<div class='shdr shdr-major oriel-section-gap'>Illustrative Healthcare Inflation Spread Market Structure</div>",
        unsafe_allow_html=True,
    )
    st.markdown(
        f"<div style='font-size:0.78rem;color:{TEXT_MUTED};margin:-2px 0 12px;'>"
        f"Dec 2027 threshold contract ladder — pilot venue: <b style='color:{TEXT_PRI};'>Manifold</b> · "
        f"later formal-listing target: <b style='color:{TEXT_PRI};'>ForecastEx</b>.</div>",
        unsafe_allow_html=True,
    )

    healthcare_ladder = build_dec_2027_contract_ladder(
        methodology_version=str(weights['methodology_version'].iloc[0])
    )
    outcomes = evaluate_thresholds(spread_bp)

    sl_left, sl_right = st.columns([1.35, 1.05], gap="large", vertical_alignment="top")

    with sl_left:
        st.markdown("<div class='shdr'>Threshold Ladder Resolution & Spec</div>", unsafe_allow_html=True)
        hi_t1, hi_t2 = st.tabs(["Resolution at current spread", "Contract spec details"])
        with hi_t1:
            st.caption(
                f"At observed spread = {spread_bp:.1f} bps, contracts with a threshold below the spread "
                f"resolve YES; those above resolve NO."
            )
            st.plotly_chart(
                _make_threshold_resolution_chart(healthcare_ladder, spread_bp),
                width="stretch", config=PLOTLY_CONFIG, key="chart_healthcare_ladder",
            )
        with hi_t2:
            st.caption("Common contract spec across every rung — only the threshold varies.")
            ladder_row = healthcare_ladder.iloc[0]
            spec_pairs = [
                ("Observation Period",    str(ladder_row["observation_period"])),
                ("Measurement Window",    f"{ladder_row['measurement_start_month']}  →  {ladder_row['measurement_end_month']}"),
                ("Settlement Formula",    str(ladder_row["settlement_formula"])),
                ("Data Source",           str(ladder_row["official_public_data_source"])),
                ("Methodology",           f"{ladder_row['methodology_reference']}  ·  {ladder_row['methodology_version']}"),
                ("Pilot Venue",           str(ladder_row["immediate_pilot_venue"])),
                ("Later Listing Target",  str(ladder_row["later_formal_listing_relevance"])),
                ("Worked Example",        str(ladder_row["worked_example_summary"])),
            ]
            spec_rows_html = "".join(
                f"<div style='color:{TEXT_MUTED};font-size:0.74rem;text-transform:uppercase;letter-spacing:.05em;font-weight:600;'>{field}</div>"
                f"<div style='color:{TEXT_PRI};font-size:0.80rem;line-height:1.5;'>{value}</div>"
                for field, value in spec_pairs
            )
            st.markdown(
                f"<div class='note-box' style='margin-top:4px;padding:14px 16px;'>"
                f"<div style='display:grid;grid-template-columns:170px 1fr;row-gap:10px;column-gap:16px;'>"
                f"{spec_rows_html}"
                f"</div></div>",
                unsafe_allow_html=True,
            )

    with sl_right:
        st.markdown("<div class='shdr'>Dec 2027 Contract Ladder</div>", unsafe_allow_html=True)
        ladder_disp = healthcare_ladder[[
            "threshold_bp", "contract_title", "immediate_pilot_venue", "later_formal_listing_relevance",
        ]].copy()
        ladder_disp["threshold_bp"] = ladder_disp["threshold_bp"].map(lambda x: f"> {int(x)} bps")
        ladder_disp = ladder_disp.rename(columns={
            "threshold_bp": "Threshold",
            "contract_title": "Contract",
            "immediate_pilot_venue": "Pilot",
            "later_formal_listing_relevance": "Later Listing",
        })
        _l_h = DESK_TABLE_HEADER_PX + len(ladder_disp) * DESK_TABLE_ROW_PX + DESK_TABLE_PAD_PX
        l_fig = _plotly_desk_table(ladder_disp, gold_column="Threshold")
        l_fig.update_layout(height=_l_h)
        with st.container(height=_l_h, border=False, key="scroll_healthcare_ladder_tbl"):
            st.plotly_chart(l_fig, width="stretch", config=PLOTLY_CONFIG, theme=None, key="tbl_healthcare_ladder")

        out_disp = outcomes.copy()
        out_disp["threshold_bp"] = out_disp["threshold_bp"].map(lambda x: f"> {int(x)} bps")
        out_disp["resolves_yes"] = out_disp["resolves_yes"].map(lambda x: "YES" if x else "NO")
        out_disp = out_disp.rename(columns={
            "threshold_bp": "Rung",
            "comparison_operator": "Op",
            "resolves_yes": "Resolution",
        })
        st.markdown("<div class='shdr oriel-section-gap'>Current Resolution by Threshold</div>", unsafe_allow_html=True)
        _o_h = DESK_TABLE_HEADER_PX + len(out_disp) * DESK_TABLE_ROW_PX + DESK_TABLE_PAD_PX
        o_fig = _plotly_desk_table(out_disp, gold_column="Resolution")
        o_fig.update_layout(height=_o_h)
        with st.container(height=_o_h, border=False, key="scroll_healthcare_outcomes"):
            st.plotly_chart(o_fig, width="stretch", config=PLOTLY_CONFIG, theme=None, key="tbl_healthcare_outcomes")

    # Full-width settlement-example + how-prices-populate strip below the
    # columns — keeps the two columns visually balanced and gives the
    # closing narrative its own breathing room (mirrors the
    # "From Contracts to a Surface" pattern further down the tab).
    st.markdown(
        f"""
        <div class='note-box' style='margin-top:8px;'>
          <div style='display:grid;grid-template-columns:1.2fr 1fr;gap:18px;align-items:center;'>
            <div>
              <div style='font-size:0.70rem;color:{TEXT_MUTED};text-transform:uppercase;letter-spacing:.08em;font-weight:600;'>Illustrative settlement example</div>
              <div style='font-size:0.80rem;color:{TEXT_SEC};margin-top:6px;line-height:1.55;'>
                Reference YoY <b style='color:{TEXT_PRI};'>4.20%</b>, headline YoY <b style='color:{TEXT_PRI};'>3.10%</b>, spread <b style='color:{TEXT_PRI};'>110 bps</b> &rarr;
                <span style='color:{POSITIVE};font-weight:700;'>YES</span> at &gt;0/&gt;50/&gt;100,
                <span style='color:{WARNING};font-weight:700;'>NO</span> at &gt;200.
                <span style='color:{TEXT_MUTED};font-style:italic;'>Not live BLS values.</span>
              </div>
            </div>
            <div>
              <div style='font-size:0.70rem;color:{TEXT_MUTED};text-transform:uppercase;letter-spacing:.08em;font-weight:600;'>How prices populate a distribution</div>
              <div style='font-size:0.80rem;color:{TEXT_SEC};margin-top:6px;line-height:1.55;'>
                As live YES prices populate this ladder, the set of prices approximates a probability distribution for the medical-inflation-spread outcome.
              </div>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    maturities = list(curve_df["maturity"])
    default_ix = min(1, len(maturities) - 1) if maturities else 0
    # Compact maturity selector — narrow column matching the valuation-date
    # picker pattern used in the rest of the app.
    mat_col, _spacer = st.columns([1, 6], gap="small", vertical_alignment="bottom")
    with mat_col:
        st.markdown("<div class='ctrl-vd-label'>Contract Maturity</div>", unsafe_allow_html=True)
        selected_maturity = st.selectbox(
            "Contract maturity",
            options=maturities,
            index=default_ix,
            format_func=lambda x: pd.to_datetime(x).strftime("%Y"),
            key="medical_basis_maturity",
            label_visibility="collapsed",
        )

    selected_row = curve_df[curve_df["maturity"] == pd.to_datetime(selected_maturity)].iloc[0]

    # ── KPI Trading Strip — matches Healthcare / CPI / Basis tabs ──────────
    obs_window = str(selected_row.observation_window)
    maturity_year = pd.to_datetime(selected_row.maturity).strftime("%Y")
    st.markdown(
        f"""
        <div class='kpi-strip-wrap'>
          <div class='kpi-strip-ribbon'>FORECASTEX MEDICAL BASIS · {obs_window} · Maturity {maturity_year}</div>
          <div class='kpi-strip'>
            <div class='kpi-cell'>
              <div class='kpi-micro'>Expected Basis</div>
              <div class='kpi-value kpi-value--lead'>{selected_row.expected_spread_bps:.1f} bps</div>
              <div class='kpi-sub'>Medical CPI − CPI-U</div>
            </div>
            <div class='kpi-cell'>
              <div class='kpi-micro'>P(spread &gt; 200 bps)</div>
              <div class='kpi-value' style='color:{SERIES2};'>{selected_row.probability_spread_gt_200 * 100:.1f}%</div>
              <div class='kpi-sub'>YES price proxy</div>
            </div>
            <div class='kpi-cell'>
              <div class='kpi-micro'>Settlement Example</div>
              <div class='kpi-value' style='color:{POSITIVE};'>YES / $1.00</div>
              <div class='kpi-sub'>5.6% medical vs. 3.1% CPI</div>
            </div>
            <div class='kpi-cell'>
              <div class='kpi-micro'>Ladder Thresholds</div>
              <div class='kpi-value' style='color:{INFO};'>0–400 bps</div>
              <div class='kpi-sub'>Spread &gt; threshold</div>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("<div class='oriel-section-gap'></div>", unsafe_allow_html=True)

    left, right = st.columns([1.05, 1.35], gap="large", vertical_alignment="top")
    with left:
        st.markdown("<div class='shdr'>Illustrative Contract Spec</div>", unsafe_allow_html=True)
        spec_df = contract_spec_dataframe()
        _spec_row_h = 44
        _spec_content_h  = DESK_TABLE_HEADER_PX + len(spec_df) * _spec_row_h + DESK_TABLE_PAD_PX
        _spec_viewport_h = DESK_TABLE_HEADER_PX + min(len(spec_df), 5) * _spec_row_h + DESK_TABLE_PAD_PX
        spec_fig = _plotly_desk_table(spec_df, row_height=_spec_row_h)
        spec_fig.update_layout(height=_spec_content_h)
        with st.container(height=_spec_viewport_h, border=False, key="scroll_med_basis_spec"):
            st.plotly_chart(spec_fig, width="stretch", config=PLOTLY_CONFIG, theme=None, key="tbl_med_basis_spec")

        st.markdown("<div class='shdr oriel-section-gap'>Objective Settlement Calculator</div>", unsafe_allow_html=True)
        c1, c2, c3 = st.columns(3, gap="small")
        with c1:
            st.markdown("<div class='ctrl-vd-label'>CPI-U YoY (%)</div>", unsafe_allow_html=True)
            cpi_yoy = st.number_input(
                "CPI-U YoY (%)", min_value=-5.0, max_value=20.0, value=3.1, step=0.1,
                key="mb_cpi_yoy", label_visibility="collapsed",
            )
        with c2:
            st.markdown("<div class='ctrl-vd-label'>Medical CPI YoY (%)</div>", unsafe_allow_html=True)
            med_yoy = st.number_input(
                "Medical CPI YoY (%)", min_value=-5.0, max_value=25.0, value=5.6, step=0.1,
                key="mb_med_yoy", label_visibility="collapsed",
            )
        with c3:
            st.markdown("<div class='ctrl-vd-label'>Threshold (bps)</div>", unsafe_allow_html=True)
            threshold = st.selectbox(
                "Threshold (bps)", list(DEFAULT_THRESHOLDS_BPS), index=2,
                key="mb_threshold", label_visibility="collapsed",
            )
        res = settle_medical_basis_contract(cpi_yoy_pct=cpi_yoy, medical_cpi_yoy_pct=med_yoy, threshold_bps=int(threshold))
        outcome_color = POSITIVE if res.settles_yes else WARNING
        st.markdown(
            f"""
            <div class='note-box' style='margin-top:10px;'>
              <div style='font-size:0.72rem;color:{TEXT_MUTED};text-transform:uppercase;letter-spacing:.08em;font-weight:600;'>Settlement Output</div>
              <div style='display:flex;justify-content:space-between;margin-top:8px;font-size:0.82rem;'>
                <span style='color:{TEXT_SEC};'>Observed spread</span><span style='color:{TEXT_PRI};font-weight:700;font-variant-numeric:tabular-nums;'>{res.spread_bps:.1f} bps</span>
              </div>
              <div style='display:flex;justify-content:space-between;margin-top:6px;font-size:0.82rem;'>
                <span style='color:{TEXT_SEC};'>Contract threshold</span><span style='color:{TEXT_PRI};font-weight:700;font-variant-numeric:tabular-nums;'>{res.threshold_bps} bps</span>
              </div>
              <div style='display:flex;justify-content:space-between;margin-top:6px;font-size:0.82rem;'>
                <span style='color:{TEXT_SEC};'>Outcome</span><span style='color:{outcome_color};font-weight:800;'>{'YES settles $1.00' if res.settles_yes else 'NO settles $0.00'}</span>
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    with right:
        st.markdown("<div class='shdr'>Contract Ladder & Implied Distribution</div>", unsafe_allow_html=True)
        t1, t2, t3 = st.tabs(["Threshold ladder", "Implied distribution", "Basis curve"])
        with t1:
            st.caption("YES prices approximate market-implied probabilities for each medical-vs-CPI spread threshold.")
            st.plotly_chart(_make_ladder_chart(ladder, selected_maturity), width="stretch", config=PLOTLY_CONFIG, key="chart_med_basis_ladder")
        with t2:
            st.caption("Exceedance prices are converted into a bucketed probability distribution for the spread.")
            st.plotly_chart(_make_distribution_chart(curve.distribution, selected_maturity), width="stretch", config=PLOTLY_CONFIG, key="chart_med_basis_dist")
        with t3:
            st.caption("Expected spread by maturity seeds a market-implied healthcare inflation basis surface.")
            st.plotly_chart(_make_basis_curve(curve_df), width="stretch", config=PLOTLY_CONFIG, key="chart_med_basis_curve")

        st.markdown("<div class='shdr oriel-section-gap'>From Contracts to a Surface</div>", unsafe_allow_html=True)
        st.markdown(
            f"""
            <div class='note-box'>
              <div style='display:grid;grid-template-columns:1fr 34px 1fr 34px 1fr;gap:8px;align-items:center;text-align:center;'>
                <div>
                  <div style='font-weight:700;color:{TEXT_PRI};font-size:0.86rem;'>Binary spread contracts</div>
                  <div style='font-size:.72rem;color:{TEXT_MUTED};margin-top:3px;'>YES prices by threshold</div>
                </div>
                <div style='font-size:1.4rem;color:{GOLD};'>→</div>
                <div>
                  <div style='font-weight:700;color:{TEXT_PRI};font-size:0.86rem;'>Oriel reference engine</div>
                  <div style='font-size:.72rem;color:{TEXT_MUTED};margin-top:3px;'>normalize · repair · infer</div>
                </div>
                <div style='font-size:1.4rem;color:{GOLD};'>→</div>
                <div>
                  <div style='font-weight:700;color:{TEXT_PRI};font-size:0.86rem;'>Market-implied basis curve</div>
                  <div style='font-size:.72rem;color:{TEXT_MUTED};margin-top:3px;'>hedges · perps · notes</div>
                </div>
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # ── Sample contract ladder — gold-accent desk table matching the rest ──
    st.markdown("<div class='shdr oriel-section-gap'>Sample Contract Ladder</div>", unsafe_allow_html=True)
    st.markdown(
        f"<div style='font-size:0.74rem;color:{TEXT_MUTED};margin:-2px 0 8px;'>"
        f"Illustrative ForecastEx-style ladder — YES prices, bid/ask, volume, open interest by threshold and maturity.</div>",
        unsafe_allow_html=True,
    )
    ladder_table = ladder.copy()
    ladder_table["maturity"] = ladder_table["maturity"].dt.strftime("%Y-%m-%d")
    ladder_table["yes_price"] = (ladder_table["yes_price"] * 100).round(1).astype(str) + "%"
    ladder_table["bid"] = ladder_table["bid"].map(lambda v: f"{v:.2f}")
    ladder_table["ask"] = ladder_table["ask"].map(lambda v: f"{v:.2f}")
    ladder_table["volume"] = ladder_table["volume"].astype(int).map(lambda v: f"{v:,}")
    ladder_table["open_interest"] = ladder_table["open_interest"].astype(int).map(lambda v: f"{v:,}")
    visible_cols = ["maturity", "observation_window", "contract_label", "yes_price", "bid", "ask", "volume", "open_interest", "source_status"]
    ladder_view = ladder_table[visible_cols].rename(columns={
        "maturity":           "Maturity",
        "observation_window": "Observation Window",
        "contract_label":     "Contract",
        "yes_price":          "YES Price",
        "bid":                "Bid",
        "ask":                "Ask",
        "volume":             "Volume",
        "open_interest":      "Open Interest",
        "source_status":      "Status",
    })
    _ladder_h = DESK_TABLE_HEADER_PX + min(len(ladder_view), 8) * DESK_TABLE_ROW_PX + DESK_TABLE_PAD_PX
    _ladder_content_h = DESK_TABLE_HEADER_PX + len(ladder_view) * DESK_TABLE_ROW_PX + DESK_TABLE_PAD_PX
    ladder_fig = _plotly_desk_table(ladder_view, gold_column="YES Price")
    ladder_fig.update_layout(height=_ladder_content_h)
    with st.container(height=_ladder_h, border=False, key="scroll_med_basis_ladder"):
        st.plotly_chart(ladder_fig, width="stretch", config=PLOTLY_CONFIG, theme=None, key="tbl_med_basis_ladder")

    if curve.repaired:
        st.warning("One or more ladders required monotonic repair. Check YES prices for arbitrage consistency.")
    else:
        st.markdown(
            f"<div class='note-box' style='margin-top:6px;'>"
            f"<span style='color:{TEXT_SEC};font-size:0.78rem;'>"
            f"<b style='color:{TEXT_PRI};'>Monotonic ✓</b> &nbsp;Sample ladders are arbitrage-consistent: higher thresholds have lower or equal YES prices.</span>"
            f"</div>",
            unsafe_allow_html=True,
        )
