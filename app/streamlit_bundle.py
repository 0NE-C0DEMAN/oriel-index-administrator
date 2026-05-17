"""
streamlit_bundle.py — Inline every local <script src=...> and
<link rel=stylesheet href=...> referenced from index.html into a single
self-contained HTML blob.

Why: streamlit.components.v1.html embeds the HTML inside an iframe with
about:srcdoc (no resolvable origin), so local relative URLs can't be
fetched. We work around that by reading each local file and inlining its
body into the HTML before handing it to Streamlit.

CDN-hosted assets (unpkg, fonts.googleapis) keep their src/href so the
iframe loads them normally.

Babel-Standalone transpiles inline <script type="text/babel"> blocks just
the same as external ones — so the IIFE/registry pattern keeps working.

Usage:
    from streamlit_bundle import build_bundle
    html = build_bundle(Path(__file__).resolve().parent)  # path to app/

This file has no third-party deps; safe to import anywhere.
"""
from __future__ import annotations

from pathlib import Path
import re


# Matches <script ... src="..."></script> with the src last among attributes.
# Our index.html follows that convention; CDN scripts (https://...) match too
# but are filtered out by _is_local().
_SCRIPT_RE = re.compile(
    r'<script(?P<attrs>[^>]*?)\ssrc="(?P<src>[^"]+)"></script>',
    re.IGNORECASE,
)

# Matches <link rel="stylesheet" href="...">  (rel BEFORE href). The Google
# Fonts link in index.html has href first → won't match → stays external.
_LINK_RE = re.compile(
    r'<link\s+rel="stylesheet"\s+href="(?P<href>[^"]+)"\s*/?>',
    re.IGNORECASE,
)


def _is_local(path: str) -> bool:
    return not (path.startswith("http://") or path.startswith("https://") or path.startswith("//"))


def _inline_script(match: "re.Match[str]", root: Path) -> str:
    attrs = match.group("attrs") or ""
    src = match.group("src")
    if not _is_local(src):
        return match.group(0)  # CDN — leave as-is

    file_path = root / src
    if not file_path.exists():
        return f'<script>console.error("[oriel-bundle] missing file: {src}")</script>'

    body = file_path.read_text(encoding="utf-8")
    # Avoid premature script-tag closure if any source contains </script>.
    body = body.replace("</script>", "<\\/script>")
    return f"<script{attrs}>\n{body}\n</script>"


def _inline_link(match: "re.Match[str]", root: Path) -> str:
    href = match.group("href")
    if not _is_local(href):
        return match.group(0)

    file_path = root / href
    if not file_path.exists():
        return f"<style>/* [oriel-bundle] missing file: {href} */</style>"

    body = file_path.read_text(encoding="utf-8")
    return f"<style>\n{body}\n</style>"


def build_bundle(
    root: Path,
    live_payload_json: str | None = None,
    blended_payload_json: str | None = None,
    forecastex_payload_json: str | None = None,
    polymarket_payload_json: str | None = None,
    perp_payload_json: str | None = None,
    cms_payload_json: str | None = None,
    medical_basis_payload_json: str | None = None,
    parity_payload_json: str | None = None,
    admin_payload_json: str | None = None,
    session_payload_json: str | None = None,
) -> str:
    """Read root/index.html, inline every local asset, return one HTML string.

    `root` is the folder that contains index.html (i.e. the app/ folder).

    If `live_payload_json` is provided (already-serialized JSON string), it
    is injected as `window.__LIVE_CPI__ = …;` before any other script runs,
    so indices.js can pick it up and override the static CPI sample.

    If `blended_payload_json` is provided, it is injected as
    `window.__BLENDED_CPI__ = …;` — the v7 venue-blend pipeline output
    (Kalshi+ForecastEx smoothed parent curve + venue_comparison rows) used
    by the vol surface engine for the binary-IV inversion's parent_forward.
    """
    index_path = root / "index.html"
    if not index_path.exists():
        raise FileNotFoundError(f"Could not find {index_path}")
    html = index_path.read_text(encoding="utf-8")
    html = _LINK_RE.sub(lambda m: _inline_link(m, root), html)
    html = _SCRIPT_RE.sub(lambda m: _inline_script(m, root), html)

    # Build a single combined startup-script block so all payloads parse
    # before any other script. Order: blended first (always-on, drives vol
    # surface), then live (CPI Kalshi snapshots overlay), then ForecastEx
    # (CPI ForecastEx tab — both live + sample variants).
    parts: list[str] = []
    if blended_payload_json is not None:
        parts.append(
            "    /* blended parent curve (v7 Kalshi+ForecastEx pipeline) */\n"
            f"    window.__BLENDED_CPI__ = {blended_payload_json};"
        )
    if live_payload_json is not None:
        parts.append(
            "    /* live Kalshi payload injected at startup */\n"
            f"    window.__LIVE_CPI__ = {live_payload_json};"
        )
    if forecastex_payload_json is not None:
        parts.append(
            "    /* ForecastEx live + sample variants (v7 score_and_package) */\n"
            f"    window.__FORECASTEX__ = {forecastex_payload_json};"
        )
    if polymarket_payload_json is not None:
        parts.append(
            "    /* Polymarket live + sample variants (v7 score_and_package) */\n"
            f"    window.__POLYMARKET__ = {polymarket_payload_json};"
        )
    if perp_payload_json is not None:
        parts.append(
            "    /* Tier-1 CPI Basis / perp readiness (v7 tier1_fv_engine) */\n"
            f"    window.__PERP__ = {perp_payload_json};"
        )
    if cms_payload_json is not None:
        parts.append(
            "    /* Oriel Healthcare Reference / CMS Lag Engine (v7 cms_lag_loader) */\n"
            f"    window.__CMS__ = {cms_payload_json};"
        )
    if medical_basis_payload_json is not None:
        parts.append(
            "    /* ForecastEx Medical Inflation Basis Contract (v7 medical_basis_contract) */\n"
            f"    window.__MB__ = {medical_basis_payload_json};"
        )
    if parity_payload_json is not None:
        parts.append(
            "    /* OTC Parity Validation + DTCC Term Calibration (v7 parity + dtcc_term_calibration) */\n"
            f"    window.__PARITY__ = {parity_payload_json};"
        )
    if admin_payload_json is not None:
        parts.append(
            "    /* Index Administrator (v7 services.index_admin) */\n"
            f"    window.__ADMIN_PAYLOAD__ = {admin_payload_json};"
        )
    if session_payload_json is not None:
        parts.append(
            "    /* Authenticated session — drives the TopNav profile pill */\n"
            f"    window.__ORIEL_SESSION__ = {session_payload_json};"
        )
    if parts:
        body = "\n".join(parts)
        injection = (
            "</title>\n"
            "  <script>\n"
            f"{body}\n"
            "  </script>"
        )
        html = html.replace("</title>", injection, 1)
    return html


def bundle_size_summary(root: Path) -> dict:
    """Diagnostic helper — counts how many local files were inlined and total bytes."""
    html = (root / "index.html").read_text(encoding="utf-8")
    scripts = [m for m in _SCRIPT_RE.finditer(html) if _is_local(m.group("src"))]
    links   = [m for m in _LINK_RE.finditer(html)   if _is_local(m.group("href"))]
    bundled = build_bundle(root)
    return {
        "scripts_inlined": len(scripts),
        "links_inlined":   len(links),
        "bundle_bytes":    len(bundled.encode("utf-8")),
    }


if __name__ == "__main__":
    # Smoke-test from CLI: prints a size summary.
    import json
    here = Path(__file__).resolve().parent
    summary = bundle_size_summary(here)
    print(json.dumps(summary, indent=2))
