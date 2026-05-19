---
title: Oriel Index Administrator
emoji: 📊
colorFrom: blue
colorTo: indigo
sdk: streamlit
sdk_version: 1.39.0
app_file: app/streamlit_app.py
pinned: false
short_description: Reference indices, fair value, and basis signals.
---

# Oriel Index Administrator

Reference-index administration surface for the Oriel platform. React-via-CDN
UI on top of the v7 demo engine, wrapped in a Streamlit auth gate. Covers
CPI (Kalshi / ForecastEx / Polymarket), CPI Basis Engine, Healthcare Trend,
Healthcare Reference (CMS-translated), Medical CPI Basis, Validation (OTC
parity + DTCC SDR cross-checks + publish-block stress test), and the full
Index Administrator section.

Authentication is enforced at the app level (single admin user).

## v0.1.0 - Ksenia's UI pass

First tagged release. CEO design-review pass over the redesign. No
structural changes; same routes, same panels, same data flow.

Color system refreshed: the pink/magenta healthcare accent was replaced
with a teal/aqua family so healthcare reads as a category rather than as
a warning. Red is now reserved for genuine failure / blocked / out-of-
tolerance states.

Top nav relabelled:

* Healthcare Ref → Healthcare Reference
* Medical Basis → Medical CPI Basis
* Parity → Validation
* CPI Basis → CPI Basis Engine

Login left panel rewritten to the new brand statement ("Trade the
dislocation. Trust the reference.") and the four product pills:
Reference Curves · Fair Value · Basis Signals · Execution Intelligence.

Overview, Healthcare Reference, Medical CPI Basis, Validation tabs, and
Admin labels rewritten per the CEO's UX pass.

See HANDOFF.md for full architecture and conventions.
