# Oriel · Index Administrator — Frontend (Redesign)

Modular React UI for the Oriel prediction-index admin app. Standalone for now;
will plug into Streamlit (`streamlit.components.v1.html`) once the UI is done.

## Run

There are two ways to run the app:

### A. Standalone (development) — http://localhost:8000

Babel-Standalone fetches the `.jsx` files via XHR, which is blocked on `file://`,
so we serve over HTTP.

**Windows (one click):**
```
start.bat
```

**Cross-platform (manual):**
```
cd app
python -m http.server 8000
# Then open http://localhost:8000
```

If Python isn't available, any static server works — `npx serve`, `npx http-server`, etc.

### B. Embedded in Streamlit

Once you want the React UI inside a Streamlit page (production target), run:

```
streamlit run app/streamlit_app.py
```

`streamlit_app.py` calls `streamlit_bundle.build_bundle()` which reads
`index.html` and inlines every local `<script src=...>` and `<link href=...>`
into one self-contained HTML string. CDN scripts (React, ReactDOM, Babel,
Google Fonts) stay external. The whole thing is then handed to
`streamlit.components.v1.html(...)`, which hides Streamlit's own chrome so the
React shell owns the viewport.

To verify the bundler standalone:

```
cd app
python streamlit_bundle.py
# Prints {"scripts_inlined": ..., "links_inlined": ..., "bundle_bytes": ...}
```

## Structure

```
app/
├── index.html              # Script load order (used in standalone mode)
├── styles.css              # Design tokens + component styles
├── start.bat               # Local HTTP server bootstrap (Windows)
├── streamlit_app.py        # Streamlit entry: embeds bundled UI in components.v1.html
├── streamlit_bundle.py     # Inlines all local JS/CSS into one HTML blob
├── README.md
└── src/
    ├── lib/
    │   ├── utils.js        # cn(), formatters, clock
    │   └── nav.js          # SECTIONS constant — top-nav source of truth
    ├── components/         # Generic atoms (Icon, Badge, BrandMark, ...)
    ├── layout/             # TopNav, SubHeader
    ├── views/              # One view per section (placeholder for now)
    ├── App.jsx             # Root — section state, routing
    └── main.jsx            # Boot
```

Each file is an IIFE that registers components/utilities on `window.App`.
This lets us split into many small files without an ES-module bundler.
The boot order in `index.html` matches the directory order above
(utils → atoms → layout → views → App → main).

## Build status

| Module | Status |
|---|---|
| 1. App shell (top nav + sub-header + placeholder) | ✅ |
| 2. Indices landing (tile grid of 7 indices) | ✅ |
| 3. Index detail shell + CPI · Kalshi populated | ✅ |
| 4. Healthcare Trend detail (HC scalar buckets + distribution chart) | ✅ |
| 5. CPI ForecastEx + Polymarket detail (data only — reuses M3 components) | ✅ |
| 6. CPI Basis detail (basis decomposition + venue blend) | ✅ |
| 7. Healthcare Reference (CMS) detail (reuses M3 components) | ✅ |
| 8. OTC Parity Validation detail (parity gate strip) | ✅ |
| 9. Index Administrator section (KPI strip + Definition + Inputs + Audit; Calc/Pub scaffold) | ✅ |
| 10. Streamlit wrapper (`streamlit_app.py` + `streamlit_bundle.py`) | ✅ |
