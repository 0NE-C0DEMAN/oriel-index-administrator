# HANDOFF - Oriel Index Administrator (Redesign)

Last updated: 2026-05-18
Author of handoff: Siddhant Mishra (goskm123@gmail.com)
Repo root: `D:\StreamlitPred\Redesign`

---

## 1. PROJECT OVERVIEW

This repo is the **redesign** of the Oriel Index Administrator front-end. It is a React-via-CDN UI rebuild of the v7 Streamlit dashboard that lives in the sibling `oriel_demo_v7/` folder. The audience is Chris Langley and his commercial partners (institutional capital-markets buyers). It is the polished surface they see during demos.

How it relates to `oriel_demo_v7`:

- `oriel_demo_v7/` is the canonical engine. It owns every Python pipeline (Kalshi, ForecastEx, Polymarket, CMS, parity, perp, blended curve, index_admin services). It still has its own Streamlit `app.py`. Do not modify v7 source.
- `app/` (this repo) is the React-via-CDN UI redesign. It loads v7's Python output via small adapter modules in `app/` (one per data source) and renders a CareFi-styled SPA inside a Streamlit `components.v1.html` iframe.
- `streamlit_app.py` is the Streamlit wrapper. It auth-gates the page, calls each adapter to build payloads, then injects them as `window.__BLENDED_CPI__`, `window.__LIVE_CPI__`, `window.__FORECASTEX__`, etc. before the React iframe boots.

Deployment target: a private (now public) Hugging Face Space at:
`https://huggingface.co/spaces/SamTwo/oriel-index-administrator`
Public iframe URL: `https://samtwo-oriel-index-administrator.hf.space`

---

## 2. CURRENT STATE

### Shipped / merged
- Single-commit clean git history rooted at `Siddhant Mishra <goskm123@gmail.com>`. No Claude co-author lines.
- HF Space deployed, **public** (Chris flipped the visibility this session so his team could open the URL).
- Auth-gated entry. Username `Chris`, password `Oriel2026@123!` (in code as fallback; HF Settings -> Secrets can override via `ORIEL_ADMIN_USERNAME` / `ORIEL_ADMIN_PASSWORD`).
- JSX-styled split-screen login (gradient hero left, light form right) using Streamlit's native `st.form` widgets with bulletproof CSS overrides and forced light theme.
- Branded loading overlay (`.oriel-login-boot`) that re-fires on every Streamlit rerun so users never see default Streamlit chrome during the login flow.
- Separate post-auth boot overlay (`.oriel-boot-overlay`) sits BEHIND the React iframe (z-index 1, iframe is 99999) and shows "Loading Oriel - Fetching live venue feeds..." while the iframe cold-starts. Different element, different stylesheet block. Both must stay; do not unify them. See `streamlit_app.py` lines ~740-773.
- Profile dropdown in TopNav with working Sign out. Logout writes `top.location.search = '?logout=1'` (does not read parent pathname, so it works from inside the cross-origin srcdoc iframe).
- App defaults to a 0.8 zoom (denser layout) baked in via `app/styles/01-base.css`. Body is set to `125vw` to compensate for the zoom so the app still fills the viewport.

### In progress
Nothing actively in progress. Last verified flow:

1. User lands on login (clean split-screen).
2. User signs in with `Chris / Oriel2026@123!`.
3. React app loads with TopNav, all 10 tabs, profile chip, index cards.
4. Sign out -> back to login (no `/srcdoc` 404).

### Blocked / waiting on
Nothing blocked at the moment. The most recent Chris message was about the URL being unreachable; he resolved it by making the Space public.

### Last 5 commits (newest first)
```
ac807b9 Fix zoom: body 125vw to compensate for html zoom 0.8, fills viewport
afe597b App: default to 80% zoom for tighter, more dense layout
40156e8 Add branded loading overlay to login + suppress Streamlit indicators
a3b26cc Fix logout: write top.location.search instead of reading pathname
e2217a4 Fix login: drop JS bridge, use Streamlit form with light theme
```
(Just before those: `0e7420d` fixed HTML rendering by dedenting and stripping blank lines; `070ebbb` is the orphan root commit.)

### Uncommitted local changes
None. `git status` is clean.

### Branches not pushed
None. Only `main`, in sync with both remotes:
- `origin` -> https://github.com/0NE-C0DEMAN/oriel-index-administrator.git
- `hf` -> https://SamTwo:hf_TIH...@huggingface.co/spaces/SamTwo/oriel-index-administrator (token embedded in remote URL)

---

## 3. ARCHITECTURE

### Directory layout (key folders only)
```
Redesign/
  README.md                  HF Space front-matter + project blurb
  HANDOFF.md                 (this file)
  requirements.txt           streamlit, pandas, numpy, requests
  .streamlit/
    config.toml              forces light theme, hides toolbar/sidebar
  app/
    streamlit_app.py         Auth gate + payload builder + iframe injector
    streamlit_bundle.py      Inlines local JS/CSS into one HTML blob
    index.html               React-via-CDN shell
    *_data.py                One adapter per v7 data source (see below)
    bundled.html             190KB snapshot of an earlier bundled build, kept as a reference. Not used at runtime; the bundler regenerates HTML every request.
    start.bat                One-click Windows dev. `cd /d %~dp0 && python -m http.server 8000`. Boots the standalone React dev server (no Streamlit, no auth).
    src/
      App.jsx                Root React component (window.App.App)
      main.jsx               Mounts <App /> on #root
      lib/
        adminData.js         indices.js  engine.js  utils.js  nav.js
        oriel_logo.js        237KB base64 PNG data URI
      layout/
        TopNav.jsx           SubHeader.jsx
      components/
        Badge BrandMark ChartModal Icon IndexCard
      features/              25+ panels (KPI strips, charts, tables, parity, etc.)
      views/
        IndicesView IndexDetailView IndexAdminView PlaceholderView
    styles/
      01-base.css            tokens + reset + zoom
      02-views.css ... 09-parity.css   per-feature stylesheets
  oriel_demo_v7/             DO NOT MODIFY. Canonical engine.
    app.py services/ venues/ analytics/ index_admin/ parity/ tabs/ ui/
  references/                DO NOT MODIFY. CareFi design refs.
    CareFi_CPI_Vaults (2).pdf
    CareFi_Presentation_Dark (2).pdf
    CareFi_Prototype_v1.0/
    Index View (1).png
    Maternity Health (1).png
    Oriel_From Prediction Markets to Tradeable CPI Perp (1).pdf
```

There is also a sibling reference repo at `D:\ParkerJones` (outside this repo). It is the architectural template for the IIFE + window.App pattern this app uses. Read-only.

### Main entrypoints

- **Production (HF Space):** `streamlit run app/streamlit_app.py` (this is what HF runs on push)
- **Local dev, standalone React (no Streamlit):** `cd app && python -m http.server 8000` then open `http://localhost:8000`
- **Local dev, Streamlit-wrapped:** `streamlit run app/streamlit_app.py` from repo root

### Key modules

| Module | Job |
|---|---|
| `app/streamlit_app.py` | Auth gate (`_render_login`, `_check_credentials`), reads each adapter, calls `build_bundle` with all payloads, embeds via `components.html`. Handles `?logout=1`. |
| `app/streamlit_bundle.py` | Reads `index.html`, replaces `<script src=...>` and `<link href=...>` of local files with their inlined contents. CDN scripts (React, ReactDOM, Babel, Google Fonts) stay external. Injects `window.__*__` startup blob. |
| `app/index.html` | The page the React app boots from. Has React 18 + ReactDOM + Babel-Standalone via unpkg, then loads each component via `<script type="text/babel" src="src/...jsx">`. |
| `app/src/App.jsx` | Top-level router. Decides Overview vs Detail vs Admin based on `activeKey` from TopNav. |
| `app/src/lib/indices.js` | Static index metadata (id, name, risk tier, etc.). Hydrates with `window.__BLENDED_CPI__` etc. on boot. |
| `app/src/lib/oriel_logo.js` | Base64 data URI of the Oriel logo. Exposes `window.App.OrielLogo`. |
| `app/src/lib/nav.js` | The TopNav tab list. Single source of truth for tab keys, labels, icons. |
| `app/*_data.py` | One adapter per v7 source. Each returns a JSON string the bundler injects as `window.__X__`. |

### Adapter naming convention
Most adapters follow `<source>_data.py`. Two exceptions are `live_kalshi.py` and `blended_curve.py` (predate the convention). All 9 sit at `app/` root and are imported into `streamlit_app.py`. If you add a new source, follow the `_data.py` convention.

### Cache TTLs (mirror v7 exactly, do not loosen)
Each adapter is wrapped in `@st.cache_data(ttl=..., show_spinner=False)` inside `streamlit_app.py`:

| Adapter | TTL | Why |
|---|---|---|
| `_cached_live_cpi_payload` (Kalshi) | 60s | Live order-book snapshots |
| `_cached_forecastex_payload` | 600s | Live + sample variants |
| `_cached_polymarket_payload` | 600s | On-chain snapshots |
| `_cached_medical_basis_payload` | 600s | Deterministic, mirrors v7 |
| `_cached_blended_payload` | 3600s | Static CSV inputs |
| `_cached_perp_payload` | 3600s | Mirrors v7 `_cached_tier1_curves` |
| `_cached_cms_payload` | 3600s | Mirrors v7 `_cached_cms_outputs` |
| `_cached_parity_payload` | 3600s | Mirrors v7 parity + DTCC calibration |
| `_cached_admin_payload` | 3600s | Mirrors v7 `services.index_admin` |

`show_spinner=False` is mandatory; we own all loading UI via the boot overlays.

### Iframe embed parameters
`components.html(html, height=900, scrolling=True)`:
- `height=900` is a numeric requirement of `components.v1.html`. The CSS then stretches the iframe to 100vh anyway via `position: fixed`.
- `scrolling=True` is critical. With `False`, the iframe gets `scrolling="no"` which hard-disables scroll inside and breaks sticky headers and any overflowing content. Do not change this to False.

### Iframe pinning defense
The post-auth markdown re-runs `pin()` on `load`, `resize`, AND at fixed delays `[50, 200, 500, 1000, 2000] ms`. This is defensive against Streamlit re-applying transforms on its wrapper divs (which would turn them into containing blocks for our `position: fixed` and break the pin). Do not remove the delayed schedule.

### ChartModal (app-level)
`app/src/components/ChartModal.jsx` renders a global expandable chart modal mounted at the App root. It exposes a `window.App.expandChart(...)` helper that any feature card can call to open a full-screen view of its own chart. The modal manages its own `display: block/none` state via the helper. If you add a new chart component, integrate with `window.App.expandChart` rather than building a per-component modal.

### Feature panels
26 files in `app/src/features/`. Each is one panel (KPI strip, chart, table, etc.). They are pure presentation components - they read from `window.App.INDICES` (which has already been hydrated from `window.__*__` payloads) and never fetch data themselves.

### IndexAdminView sub-tabs
The Admin view (`app/src/views/IndexAdminView.jsx`) has its own 5 sub-tabs: Definition, Inputs, Calculation, Publication, Audit. These are NOT in `nav.js`; they are internal to the Admin view and mirror v7's `tabs/index_admin_tab.py` exactly. Data source: `window.__ADMIN_PAYLOAD__` from v7's `services.index_admin`.

### Stylesheet sizing
9 CSS files total ~7300 lines. `01-base.css` (1029 lines) holds tokens, reset, and the zoom rule. `02-views.css` (1338) and `04-detail-cards.css` (1192) are the next-largest. Avoid adding new top-level CSS files; extend an existing one or create a `10-*.css` and register it in `index.html`.

### Tab list (from `app/src/lib/nav.js`)
1. `overview` - Overview (kind: overview, icon: layers)
2. `hc` - Healthcare Trend (icon: heart)
3. `cpi` - CPI · Kalshi (icon: trending-up)
4. `fx` - CPI · ForecastEx (icon: bar-chart)
5. `poly` - CPI · Polymarket (icon: globe)
6. `perp` - CPI Basis (icon: activity)
7. `cms` - Healthcare Ref (icon: shield)
8. `mb` - Medical Basis (icon: activity)
9. `parity` - Parity (icon: sliders)
10. `admin` - Admin (kind: admin, separated by a divider in the TopNav)

### Data flow

```
HF Space rebuild
  -> streamlit_app.py runs
  -> _check_credentials gate
  -> each *_data.py adapter calls into oriel_demo_v7 services
       blended_curve.py  -> services/blended (v7 venue-blend pipeline)
       live_kalshi.py    -> venues/kalshi
       forecastex_data.py -> venues/forecastex (live + sample)
       polymarket_data.py -> venues/polymarket
       perp_data.py      -> services/tier1_fv_engine
       cms_data.py       -> services/cms_lag_loader
       medical_basis_data.py -> services/medical_basis_contract
       parity_data.py    -> services/parity + dtcc_term_calibration
       admin_data.py     -> services/index_admin
  -> streamlit_bundle.build_bundle(payloads...)
       inlines every local CSS/JS into one HTML string
       prepends `<script>window.__X__ = {...};</script>` for each payload
  -> components.v1.html(bundle, ...) embeds the React app as an iframe
  -> React mounts, reads window.__X__, renders SPA
```

### External integrations / data sources

All live data is fetched by v7 (NOT by this repo). Adapters here just call v7 services and serialize the result to JSON. Sources:

- Kalshi binary CPI contracts (live)
- ForecastEx binary CPI thresholds (live, CFTC-regulated)
- Polymarket on-chain CPI threshold markets (live)
- DTCC CPI swap term calibration (live)
- CMS healthcare cost schedules (static + lag engine)

If any live feed fails, v7 falls back to bundled sample payloads. The UI surfaces this via the `Live` vs `Sample` badge on each card.

---

## 4. STACK + DEPENDENCIES

- **Python:** 3.10+ (HF Space default). `runtime.txt` is not pinned at the Redesign root; v7 has its own.
- **Streamlit:** `>=1.32` (HF runs ~1.39 per the README front-matter).
- **Other Python:** `pandas>=2.0`, `numpy>=1.24`, `requests>=2.31`. See `requirements.txt`.
- **Front-end:** React 18 + ReactDOM 18 + Babel-Standalone, all via unpkg CDN. No build step. No npm, no webpack. JSX is transpiled in-browser.
- **Pattern:** Parker Jones IIFE pattern. Each component registers itself on `window.App.<Name>` rather than using ESM imports.

### Run locally

```bash
# Repo root
pip install -r requirements.txt
streamlit run app/streamlit_app.py
```

Then open the URL Streamlit prints. The auth gate appears. Use the fallback credentials unless `.streamlit/secrets.toml` is present.

### Tests
There are no tests in this repo. The v7 repo has its own tests under `oriel_demo_v7/tests/` but those are out of scope here.

### Env vars / secrets
- `ORIEL_ADMIN_USERNAME` (optional, defaults to `Chris`)
- `ORIEL_ADMIN_PASSWORD` (optional, defaults to `Oriel2026@123!`)

Set via `.streamlit/secrets.toml` locally, or HF Space Settings -> Secrets in production.

### Files NOT to expect
- No `runtime.txt` at repo root. HF uses its default Python. v7 has its own `runtime.txt` but it does not apply here.
- No `app/requirements.txt`. Only the root `requirements.txt` is read.
- No `tests/` directory. Add one if/when tests are written.
- No `.env` or `.env.example`. The contract lives in `_admin_credentials()` in `streamlit_app.py`.

### .gitignore
Standard Python ignores: `__pycache__/`, `*.py[cod]`, `.pytest_cache/`, `venv/`, `.venv/`, `.env`, `.DS_Store`, `Thumbs.db`, `.vscode/`, `.idea/`. Nothing project-specific is ignored. If you generate build artifacts (e.g., a real bundled `bundle.html`), add it here.

---

## 5. WORKING DECISIONS

Things settled in chat that the code does not explain on its own.

### Architectural calls
- **No build step.** React + Babel-Standalone via CDN. Every `.jsx` is loaded as `text/babel` and transpiled at runtime. Side-effect: every component file is an IIFE that registers on `window.App.<Name>`. Do not introduce ESM, npm, or Vite without asking.
- **No JS bridge inside `st.markdown`.** We tried a hidden Streamlit form + visible HTML form + JS bridge to copy values across. It does not work because `<script>` tags inserted via `innerHTML` (which is what `st.markdown(unsafe_allow_html=True)` does) are parsed as inert DOM nodes and never execute. The login now uses Streamlit's native `st.form` widgets, heavily restyled with CSS.
- **Forced light theme.** `.streamlit/config.toml` sets `base = "light"` so HF Spaces does not auto-flip to dark and fight our input styling.
- **Markdown whitespace handling.** Streamlit's markdown engine breaks HTML blocks on blank lines and treats deeply indented chunks as code blocks. The login HTML is built into a variable, dedented with `textwrap.dedent`, then has blank lines stripped with a regex before being handed to `st.markdown`. See the `_re_login.sub(...)` call inside `_render_login`. Do not casually re-introduce blank lines into that HTML block.
- **80% zoom baked in.** `html { zoom: 0.8 }` plus `body { width: 125vw }` to compensate. The compensation is mandatory; without it, the app shrinks to 80% of viewport and leaves an empty band on the right. The width comp lives in `app/styles/01-base.css` right next to the zoom rule.
- **Logout flow.** From inside the `about:srcdoc` iframe we cannot read `window.top.location.pathname` (cross-origin). The fix is to only write to `top.location.search`. The browser keeps the parent path intact and routes back to Streamlit, which sees `?logout=1` and clears session state. Do not "improve" this by reading pathname.

### Design / style calls Chris and we agreed on
- Retain v7 naming for all indices and engines. Do not rebrand.
- Retain the real Oriel logo (lives as base64 in `app/src/lib/oriel_logo.js`).
- Tabbed top nav, ForecastTrader-style.
- CareFi blue as the primary accent (`#2D5BFF`). Pink accent for healthcare. Subtle borders, generous whitespace.
- Lock the current theme. Layouts can change, theme cannot.
- Every top-level screen is tabbed. No drill-down without tabs at the top.
- Polish bar is high. No half-finished panels, no placeholder copy in the demo flow.
- Overview view uses a 3-column tile grid, 4-section grouping (Healthcare / CPI Forward / Analytics filters across the cards). This pattern was validated as "Module 1+2" in an earlier session and is the locked baseline for the Overview screen.
- Port v7 content and interactions, but design the layout freely. We are not preserving v7's theme, fonts, or layout. We ARE preserving v7's data, terminology, and product semantics.

### Collaboration style with Siddhant
- Slow, module-by-module pace. Ship one piece, screenshot or open it in the browser to confirm, then move to the next. Do not rush a multi-module change without a checkpoint.
- Show, don't tell. After any visual change, take a screenshot or describe what the result looks like rather than just claiming "done".
- He will sometimes use blunt or profane phrasing in chat. Treat it as direct feedback, not hostility. Reply briefly and fix the thing.

### Things we deliberately chose NOT to do
- Do not build a true JSX iframe for the login. Cross-origin to Streamlit would break the auth round-trip. The current Streamlit-form + CSS approach is the answer.
- Do not put credentials in URL params. The Streamlit form mechanism keeps them in the POST body of Streamlit's own websocket.
- Do not amend commits. Always create new commits.
- Do not add `Co-Authored-By: Claude` (or any Claude attribution) to commit messages. Chris explicitly does not want this. Author should be `Siddhant Mishra <goskm123@gmail.com>`, no co-author line.

---

## 6. OPEN TODOS / NEXT STEPS

In priority order based on the current state of the work:

1. **Verify the 80% zoom on real machines.** Currently confirmed on a 1568x746 Chrome window. Worth a quick check on a 1080p and a 4K display. Files: `app/styles/01-base.css`.
2. **Tune the boot overlay timing if it feels off.** Currently 350ms hold + 350ms fade = 700ms total. If Streamlit cold-start runs longer on HF and the overlay disappears too early, bump those numbers. Files: `app/streamlit_app.py` (search for `.oriel-login-boot` and `oriel-login-boot-out`).
3. **Reconfirm sign-out end-to-end** on a fresh tab on Chris's machine. We verified once; one more browser/profile is worth it before the next demo.
4. **Consider a real session cookie** rather than tab-scoped `st.session_state`. Right now closing the tab logs the user out. Fine for a demo, may not be fine for partners' workflows.
5. **Add `.streamlit/secrets.toml.example`** so anyone cloning the repo sees the expected secret keys. Currently the contract is only documented in `_admin_credentials()`.

Chris is not waiting on anything specific right now. He confirmed making the Space public, and the last thing he saw was the layout working.

---

## 7. STYLE + PREFERENCES (Siddhant)

- **No em dashes.** Use a hyphen or rephrase. This applies to chat replies AND to anything written into the repo (commit messages, comments, docs).
- **Short and direct.** No corporate fluff, no "happy to" / "delighted to" phrasing. Get to the point.
- **Plain words.** "Fix" not "remediate". "Use" not "leverage". "Now" not "at this time".
- **Commit messages** are imperative-mood one-liners. Optional body if it actually adds context. No Claude attribution lines.
- **Bullet lists are preferred** over prose for status updates and verification reports.
- **Tables are fine** when the structure is genuinely tabular (sync state across remotes, before/after comparisons, etc.).
- **Code comments** explain the why, not the what. The `_render_login` docstring is the template to mirror.

---

## 8. PROTECTED FILES OR AREAS

Do not modify these without an explicit instruction from Siddhant or Chris.

- `oriel_demo_v7/` - the entire folder. This is the canonical engine. The redesign reads from it via adapters; it never writes to it.
- `references/` - CareFi design references (PDFs, mockup PNGs, prototype folder). Read-only.
- `app/src/lib/oriel_logo.js` - 237KB of base64 PNG. Do not touch unless replacing the logo with a new asset.
- `app/index.html` - touch carefully. The bundler relies on `<script src="...">` and `<link href="...">` ordering and exact attribute format (see `_SCRIPT_RE` and `_LINK_RE` in `streamlit_bundle.py`).
- `.streamlit/config.toml` - forces light theme. Removing the `base = "light"` line will let HF flip the page back to dark and break input styling on the login.

---

## 9. RECENT CHRIS-INTERACTION CONTEXT

Last exchange (today, 2026-05-18):

> **Chris (6:04 AM):** "The URL you shared is resolving as unavailable/404 on my side. Is it private, sleeping behind an access layer, or exposed under a different public path? I shared the link with the team, and they're getting the same error message."

What that was about: the HF Space was set to **private**. Anyone outside the collaborator list gets a 404 (HF hides private Spaces entirely rather than returning a permission error). Chris then flipped the visibility to **public** himself and confirmed it.

After that, the rest of the day was on UI polish:

- Defaulted the app to a denser 80% zoom (he asked for it).
- Fixed the zoom shifting the app to the left at 100% browser zoom (added the `body { width: 125vw }` compensation).
- Chris confirmed it looks good.

Demo cadence: he has been doing rolling demos with partners. There is no fixed Friday-demo flag on file in this session, but treat the app as demo-ready at all times.

---

## 10. ANYTHING THE NEW SESSION WILL OTHERWISE MISS

### Subtle but intentional

- **The login form is a real Streamlit form, not a JSX form.** It looks like JSX because of aggressive CSS overrides on `[data-baseweb="input"]`, `[data-baseweb="base-input"]`, and the BaseWeb button wrappers. Do not "modernize" this to a custom React form unless you also solve the auth round-trip without putting creds in URL params.
- **The hero on the login is `<aside class="oriel-login-hero">` with `position: fixed; left: 0; width: 50%`**, and the Streamlit main container is constrained to `margin-left: 50%; width: 50%`. This is how the split-screen layout works without JS. If you change the hero positioning you must also change the main container CSS.
- **The boot overlay re-fires on every Streamlit rerun** because the markdown re-renders. This is intentional. Each form submit, error, or login success briefly shows the brand spinner instead of Streamlit chrome.
- **`window.__ORIEL_SESSION__`** is the bridge that tells the React TopNav who is logged in. It is injected by `streamlit_app.py` into the bundle. The profile chip reads `window.__ORIEL_SESSION__.user`.
- **`?logout=1`** is the single trigger that clears session state. The TopNav's `_logout()` sets `top.location.search` to that string. The Python at the bottom of `streamlit_app.py` pops `oriel_auth` and `oriel_user`, then clears query params, then reruns.

### App boot order and state model

- `app/index.html` loads files in a strict order: CDN React/ReactDOM/Babel, then 9 CSS files (`01-base` through `09-parity`), then plain JS libs (`utils, oriel_logo, engine, nav, indices, adminData`), then Babel `text/babel` JSX files (components, layout, features, views), then `main.jsx` LAST. This order is non-negotiable because the IIFE pattern requires every module to register on `window.App.*` before `main.jsx` mounts the React tree.
- `app/src/main.jsx` posts a `streamlit:setFrameHeight` message to the parent on mount and resize. Best-effort. `components.v1.html` ignores it (fixed-height iframe); `declare_component` would honor it. Do not depend on it.
- `app/src/App.jsx` holds the active tab key in local React state (`useState('overview')`). There is NO URL-based routing. Refreshing the page loses the active tab. This is intentional for now; if you add URL state later, watch out for the iframe being inside `about:srcdoc` (URL is not addressable from outside).
- The CPI Kalshi tab's runtime feed status drives the TopNav `CPI . Live` / `CPI . Sample` pill. It is read from `indexByKey('cpi').detail.runtimeMeta.feedStatus`. Other tabs do not drive that pill. Matches v7 behavior.

### Workarounds that look weird but are intentional

- **`textwrap.dedent` + blank-line strip** before `st.markdown`. Necessary because Streamlit's markdown engine misinterprets deeply indented or blank-line-separated HTML as code blocks.
- **Every Streamlit loading indicator hidden in CSS** (`stStatusWidget`, `stConnectionStatus`, `stSkeleton`, `stToast`, `stSpinner`, `stProgress`, anything with `loadingIndicator`). We surface our own branded spinner instead. Removing those CSS rules makes the default Streamlit chrome leak through.
- **`pointer-events: none` on the boot overlay after fade** so clicks pass through to the form underneath even though the element technically still exists in the DOM.
- **Iframe is pinned to `position: fixed; inset: 0; z-index: 99999`** by `streamlit_app.py` once the user is authenticated. There is also a JS belt-and-suspenders re-pin on `window load` and `resize`. Streamlit's wrapper divs sometimes apply transforms that would otherwise turn into containing blocks for our `position: fixed` and break the pin.

### Half-finished trains of thought
None that need surfacing. Everything attempted this session was either shipped or explicitly abandoned (the JS bridge approach is documented above so we do not redo it).

### Session history note
This session rewrote git history once to scrub all `Co-Authored-By: Claude` lines and to set the author identity to `Siddhant Mishra <goskm123@gmail.com>`. The repo now has a single root commit `070ebbb` followed by the fixes in section 2. Do not re-run that operation. Do not rebase or amend to add Claude attribution back. Future commits should just be normal forward commits, author already configured locally via `git config user.email goskm123@gmail.com`.

### Security observations not yet acted on
- The HF push token is embedded directly in the `hf` remote URL (`https://SamTwo:hf_TIH...@huggingface.co/...`). Convenient for one-command pushes, but it means anyone with read access to `.git/config` has the token. Acceptable for a solo developer machine; rotate if the box is ever shared.
- The fallback admin password (`Oriel2026@123!`) is committed in the source of `streamlit_app.py`. The Space is public now, so this is effectively the public credential. If Chris wants real security, move to HF Secrets and remove the in-code fallback. He has not asked for this yet.

### Subtle bugs noticed but not fixed
- **Click-through coordinates inside the iframe sometimes miss** when running the Chrome MCP. This is a tool quirk, not an app bug. End users with a real mouse do not see this.
- **Streamlit's default text-input "Press Enter to submit form" tooltip** still appears under the password field on focus. Cosmetic; would need additional CSS on `[data-testid="InputInstructions"]` or similar to suppress. Not currently in scope.

---

## Quick reference

| Thing | Value |
|---|---|
| Repo root | `D:\StreamlitPred\Redesign` |
| GitHub | `https://github.com/0NE-C0DEMAN/oriel-index-administrator` |
| HF Space | `https://huggingface.co/spaces/SamTwo/oriel-index-administrator` |
| Live iframe | `https://samtwo-oriel-index-administrator.hf.space` |
| Default creds | `Chris` / `Oriel2026@123!` |
| Git author | `Siddhant Mishra <goskm123@gmail.com>` |
| Current HEAD | `ac807b9` |
| Branch | `main` (in sync with `origin` and `hf`) |

End of handoff.
