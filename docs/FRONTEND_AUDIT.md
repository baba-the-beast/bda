# Frontend Audit & Overhaul Plan

**Audited commit:** `4cd9276` (branch `fix/ci-green-and-codebase-audit`)
**Scope:** `frontend/` — 21 TS/TSX files, 4,801 lines.
**Status:** Phases 0–4 complete (see §9–§12). Phases 5–7 pending.

---

## 1. Method, and what I could not verify

**Ran:** the backend (`scripts/dev_server.py`, runtime-only venv) on `:8000`; the real
`api-gateway` on `:8080`; `npm run build`; `npm run lint`; and curl flows against every
endpoint the UI consumes — login, datasets, upload, preprocess, quality, hive templates,
all six query templates, stream start/status/windows.

**Could not verify at audit time:** the screens in a browser. The Claude in Chrome extension
was not connected, so §1–§8 contain no visual pass, no Lighthouse baseline and no axe
baseline. Everything there comes from reading all 4,801 lines and exercising the APIs each
screen calls.

**Since resolved:** the extension is now connected, and the sign-in route has been inspected
visually and through the accessibility tree — findings in §9. Screenshots of the remaining
routes still require an authenticated session.

---

## 2. Derived requirements (Section 0 of the brief was left as a template)

The brief's Section 0 arrived with its `<e.g. ...>` placeholders intact, so per its own
instruction these are derived from the repo. **Assumptions — correct where wrong:**

| Field | Assumption | Source |
|---|---|---|
| Project | Big Data Analytics course project, assessed by viva/demo | `VivaDemoPage.tsx`, `docs/BDA_TRACEABILITY.md` |
| Must demonstrate | HDFS ingest, MapReduce, Hive, Spark streaming, data quality, RBAC | `docs/BDA_TRACEABILITY.md` maps each to a UI surface |
| Dataset | UCI Individual Household Electric Power Consumption, Dec 2006–Nov 2010, 1,442 days, minute resolution, **French household, so Europe/Paris and 50 Hz** | `docs/DATA_DICTIONARY.md`, `BUG-HIGH-04` |
| Deploy target | Render (`render.yaml`) + Docker Compose + Helm | `render.yaml`, `infrastructure/` |
| Runtime mode | `BDA_MODE=RENDER_LITE` is the demo path; `FULL_BDA` needs a real Hadoop/Hive cluster | `shared/engines/` |
| Evaluator priority | Traceability from UI to pipeline stage, and a live demo that survives scrutiny | `docs/BDA_TRACEABILITY.md` |
| **Timeline** | **One month** (confirmed) | User |

---

## 3. Confirmed issues

Every item in the brief was verified. Line numbers are as of `4cd9276`.

### 3.1 Structure

| Claim | Status | Evidence |
|---|---|---|
| No router, `useState<PageId>` | Confirmed | `App.tsx:20`, dispatch at `App.tsx:169-179` |
| Three pages unrouted | **Confirmed, worse** — all three are entirely unreferenced dead code, 925 lines | `OverviewPage.tsx` (228), `BatchAnalyticsPage.tsx` (346), `StreamingPage.tsx` (351); zero imports anywhere in `src/` |
| ADR-010 describes a 9-view IA that no longer matches | Confirmed | `ADR-010:11` lists 9 views; the app ships 11 different ones |
| `pages/stitch/` named after the design tool | Confirmed | 5 files; plus 10 raw HTML exports and 1 SVG in `frontend/stitch/` |
| Two icon systems | **Confirmed, wider than stated** — Material Symbols in **7** files, not just Sidebar | `index.html:11` (webfont), used in `Navbar.tsx:81`, `Sidebar.tsx:68,104`, and all 5 stitch screens |
| `onToggleTheme={() => {}}` dead control | Confirmed | `App.tsx:163`; `Navbar` destructures neither `isDark` nor `onToggleTheme` (`Navbar.tsx:11`) |

### 3.2 Data honesty

| Claim | Status | Evidence |
|---|---|---|
| Fake initial telemetry | Confirmed | `LiveTelemetryScreen.tsx:10-14` — 4.218 kW, 0.642 kvar, 238.6 V, 18.4 A, 5.14 kW peak |
| `sparkLatencyMs` is random | Confirmed | `LiveTelemetryScreen.tsx:121` — `Math.floor(25 + Math.random() * 30)` |
| Client-side EMA presented as window aggregates | Confirmed | `LiveTelemetryScreen.tsx:112-118` — 0.9/0.1 and 0.95/0.05 EMAs labelled "1-min tumbling" and "5-min sliding" |
| Anomaly threshold hardcoded | Confirmed | `LiveTelemetryScreen.tsx:85` — `p >= 5.0` |
| Substation voltage bands fabricated | Confirmed | `SubstationScreen.tsx:8-12` — `count: '1,894,200'` etc. |
| Silent fallback on query failure | **Confirmed, worse** — also silently keeps fake data when the query *succeeds but returns zero rows* | `SubstationScreen.tsx:44` (`if (records.length > 0)`), `:48` ("fallback to verified distribution stats") |
| Sidebar fake status | Confirmed | `Sidebar.tsx:116` `IEC 61850`, `:119` `BUS A/B VOLT BALANCED • CLUSTER OK` |
| `Math.random()` as React key | Confirmed | `LiveTelemetryScreen.tsx:93` |

### 3.3 Security

| Claim | Status | Evidence |
|---|---|---|
| Credentials pre-filled | Confirmed | `App.tsx:21-22` — form state *initialised* to the real admin password |
| One-click credential buttons in the bundle | Confirmed | `App.tsx:134-153` — admin and analyst, no build flag |
| Token in `localStorage` | Confirmed | `api.ts:17,22` |
| Refresh token discarded | Confirmed | `api.ts:66-71` — typed in the response, never stored. **Reproduced live:** the audit session died with `{"code":"AUTHENTICATION_FAILED","message":"Token has expired"}` after 15 minutes |
| JWT in SSE query string | Confirmed | `api.ts:217`. Backend accepts it by design — `services/stream-service/src/main.py:191,195`. **Needs approval to change** |
| Gateway CSP blocks Google Fonts | Confirmed | `services/api-gateway/src/main.py:121-127` is `default-src 'self'` with no `font-src` for `fonts.gstatic.com`; `index.html:8-11` loads three CDN resources |
| `nginx.conf` has no CSP | Confirmed | `nginx.conf:9-11` sets three headers, no CSP |
| Admin page not route-guarded | Confirmed | `Sidebar.tsx:39-41` hides nav only; `App.tsx:178` renders on state alone |

### 3.4 Code quality

| Claim | Status | Evidence |
|---|---|---|
| ~40 uses of `any` | **53 occurrences** across 11 files | 14 in `api.ts` alone |
| ESLint not installed | Confirmed | `package.json:10` defined the script; no `eslint` dependency, no config. `npm run lint` failed with `'eslint' is not recognized` |
| No tests | Confirmed | Zero test files; CI ran only `npm ci && npm run build` |
| Hand-drawn SVG charts | Confirmed | Inline `<svg>`/`<polyline>` in `LoadProfileScreen`, `SubMeterScreen`, `LiveTelemetryScreen`, `BatchAnalyticsPage` |
| `index.css` fights Tailwind | Confirmed | `index.css:11-13` sets system font and `#030712`; `tailwind.config.js:11` says `#0b141c`, `:51` says Inter |
| Unused brand palette | Confirmed | `tailwind.config.js:41-48` — `brand.*` referenced nowhere in `src/` |
| Two favicons | Confirmed | `index.html:5` (inline data URI) and `:12` (`/logo.svg`) |
| Navbar clock at 200 ms | Confirmed | `Navbar.tsx:20` — 5 re-renders/second, forever, on every page |
| Polling without backoff | Confirmed | `JobsPage.tsx:14` (3 s), `DataEngineScreen.tsx:16` (5 s) — no error backoff, no `visibilitychange` pause |

### 3.5 Copy

`App.tsx:67` `INITIALIZING GRIDPULSE TELEMETRY CONSOLE...`, `:96` `OPERATOR IDENTIFIER (EMAIL)`,
`:109` `ACCESS CIPHER (PASSWORD)`, `:124` `AUTHENTICATE CONSOLE SESSION`, `Sidebar.tsx:49`
`Operational Subsystems`.

---

## 4. Additional findings (not in the brief)

### F1 — `SubstationScreen` renders blank columns when the query *succeeds* (live-verified)

The API returns `voltage_band` and `reading_count`:

```json
{"voltage_band": "Low Voltage (<235V)", "avg_voltage": 233.57, "reading_count": 14}
```

The table reads `row.band` (`:294`) and `row.count` (`:295`) — fields that exist only on the
hardcoded fallback objects. So the screen has two states: **fabricated data** (query fails or
returns nothing), or **a table with two empty columns** (query succeeds). It has almost
certainly never displayed a correct row. The fallback is what made this invisible.

Lines `:286-288` compound it with `Number(row.avg_voltage || row.avgV || 240)` — three
fallbacks deep, ending in an invented constant.

### F2 — The Navbar renders five fabricated status readouts on every page

`Navbar.tsx:42` `GRID FREQ: 60.02 Hz`, `:47` `INGEST P99: 18ms`, `:52` `TRIPS: 0 CRIT`,
`:57` `CLUSTER: K8S // NODE-EAST-04 SYNCD`, `:65` `SCADA SYNC OK`. None is backed by anything.

**60.02 Hz is also physically wrong for this dataset** — the UCI data is a French household;
Europe runs at 50 Hz.

### F3 — `peakWindow` never updates (stale closure)

`LiveTelemetryScreen.tsx:83` reads `peakWindow` inside a callback created once in a
`useEffect(..., [])` at `:29`. It closes over the initial `5.14` forever.

### F4 — Tumbling and sliding averages are set to the identical value

`LiveTelemetryScreen.tsx:106-107` assigns `data.window.average_power` to **both**
`tumbling1MinAvg` and `sliding5MinAvg`. Two labelled metrics, one number.

**Good news:** the server already sends a genuine tumbling average. `simulator.py:183` emits a
`window` object, and `StreamWindow` now carries `tumbling_average_power` distinct from
`average_power`. Real 1-min and 5-min values are available today — no client-side imitation
and no backend request needed.

### F5 — Silent physical-value substitution in the stream handler

`LiveTelemetryScreen.tsx:75-77`: `reading.voltage || 238.0`,
`reading.global_reactive_power || 0.45`, and a current derived from `(p*1000)/v` when absent.
A missing field renders as a plausible invented measurement. Note `||` also swallows a
legitimate `0`.

### F6 — `LoadProfileScreen` contains a fully hardcoded data table

`:318-336` — four rows of voltage readings (238.4 V, 237.9 V, 240.1 V, 239.0 V); `:371-401`
four hardcoded period averages; `:447` `1,800 kW`. Ten literal metrics in one file.
`DataEngineScreen.tsx:146,148` adds `98.7%` data quality and `1.3% '?' QUARANTINED`.

### F7 — `docs/API.md` calls the error format RFC 7807, and it is not

`docs/API.md:16` is headed "Error Format (RFC 7807)" but the schema is a custom
`{"error": {code, message, request_id, details}}` envelope. RFC 7807 is
`application/problem+json` with `type`/`title`/`status`/`detail`/`instance`. The API layer will
normalise against the **actual** envelope, and the doc needs correcting. Also `docs/API.md:35`
documents the login body as `{"username": ...}`; the API takes `email` (verified live).

### F8 — `request_id` is null on some errors

The expired-token response returned `"request_id": null`, so correlation-ID tracing will be
best-effort.

### F9 — `BUG-HIGH-03` is documented as remediated but is half-done

`docs/BUG_AUDIT.md:46-49` claims the SCADA framing was replaced. The worst copy is gone, but
the file is still `SubstationScreen.tsx` and `Sidebar.tsx:28` still reads "Transformer
Substation" for a household dataset.

### F10 — No upload path in the API client

`api.ts` has `importLocalDataset` but no method for `POST /datasets/upload`, though the
endpoint exists and works (verified live: 28 KB multipart upload, SHA-256 returned). The UI
cannot upload a file at all.

### F11 — SSE `ping` heartbeat is ignored

`stream-service/src/main.py:230-233` emits a `ping` event every 0.5 s while idle. The client
subscribes only to `telemetry` and `onmessage` (`api.ts:230-231`), so the heartbeat is
discarded — a ready-made staleness signal going unused.

---

## 5. Information architecture

Ten routes:

| Route | Source today | Change |
|---|---|---|
| `/overview` | `OverviewPage.tsx` (dead) | Revive; add pipeline-stage status and gateway health |
| `/datasets` | `DatasetsPage.tsx` | Keep; **add file upload** (F10) |
| `/jobs` | `JobsPage.tsx` + `DataEngineScreen` | Merge |
| `/analysis` | `LoadProfileScreen` + `SubMeterScreen` | Merge as tabs |
| `/voltage` | `SubstationScreen` | Rename, fix F1, label the calculator as a calculator |
| `/query` | `QueryLabPage.tsx` | Keep |
| `/stream` | `LiveTelemetryScreen` + `StreamingPage` (dead) | Merge |
| `/platform` | `ProjectMetricsPage.tsx` | Keep |
| `/admin` | `AdminPage.tsx` | Keep, add `RequireRole` |
| `/demo` | `VivaDemoPage.tsx` | Keep; every step hits the real API |

**Deleted:** `BatchAnalyticsPage.tsx` (dead and superseded by `/jobs` and `/analysis`),
`frontend/stitch/` (10 HTML exports and 1 SVG).

**Adjustments to the brief's proposal:** `BatchAnalyticsPage` goes rather than being revived,
since it is both unreferenced and duplicated by two surviving routes; `StreamingPage` merges
into `/stream`; dataset selection lives in `?dataset=` on every data route.

---

## 6. Dependencies

| Package | Why | Status |
|---|---|---|
| `react-router-dom` v6 | Data router: URLs, guards, lazy routes, 404 | Phase 3 |
| `@tanstack/react-query` v5 | Server state, backoff, tab-visibility pause, invalidation | Phase 3 |
| `echarts` (+ wrapper) | Canvas time series at 10k+ points; dataZoom, LTTB sampling | Phase 4 |
| `react-hook-form` + `zod` + `@hookform/resolvers` | Validated login, upload, job, query forms | Phase 3 |
| `@radix-ui/react-{dialog,select,tabs,tooltip,toast}` | Accessible primitives | Phase 2 |
| `@fontsource/inter`, `@fontsource/jetbrains-mono` | Self-host fonts; removes the CSP violation | Phase 2 |
| `clsx` + `tailwind-merge` | Class composition in the UI kit | Phase 2 |
| `openapi-typescript` (dev) | Generate `src/types/generated/api.ts` from `/openapi.json` | Phase 3 |
| `eslint` + `typescript-eslint` + `eslint-plugin-{react-hooks,jsx-a11y,import}` + `eslint-import-resolver-typescript` + `prettier` (dev) | Quality gate | **Installed** |
| `vitest` + `@vitest/coverage-v8` + `@testing-library/{react,jest-dom,user-event}` + `jsdom` (dev) | Unit tests | **Installed** |
| `msw` (dev) | API mocking, tests only | **Installed** |
| `@playwright/test` + `@axe-core/playwright` (dev) | E2E smoke and a11y | **Installed** |
| `size-limit` + `@size-limit/file` (dev) | Enforce the budget | **Installed** |

**Runtime dependencies to be added: 11.** No component framework, no state library beyond
React Query, no date library (`Intl` covers it).

### Bundle budget

Budgets are **brotli**, which is what `size-limit` measures and what CDNs serve.

| Budget | Limit (brotli) | Today |
|---|---|---|
| Initial route js (incl. vendor) | 150 kB | 60.39 kB |
| Styles | 20 kB | 5.20 kB |
| Any lazy route chunk | 50 kB | n/a |
| ECharts chunk (lazy, chart routes only) | 100 kB | n/a |

Raw build today: 273.08 kB JS / 70.32 kB gzip, 31.52 kB CSS, single chunk, no splitting.
Initial load will grow as React Query, Router and Radix land, but ECharts and every
non-landing route become lazy, so time to first render should improve. Self-hosted fonts also
remove two render-blocking CDN round trips.

---

## 7. Phased plan

| Phase | Content | Size | Status |
|---|---|---|---|
| 1 | Tooling: ESLint flat config, Prettier, strict tsconfig, Vitest, Playwright, MSW, size-limit, CI job | ~12 files | **Done** |
| 2 | Tokens as CSS custom properties and Tailwind rewire; UI kit + tests | 18 files | **Done** |
| 3 | Router, guards, API layer, generated types, auth refresh, `useTelemetryStream` | 15 files | **Done** |
| 4 | Chart components on ECharts + accessible table fallback | 8 files | **Done** |
| 5 | Pages, one domain per commit: overview, datasets, jobs, analysis, voltage, query, stream, platform, admin, demo | 10 commits, the bulk | Next |
| 6 | Accessibility and performance pass: axe, keyboard, Lighthouse, bundle check | cross-cutting | |
| 7 | Docs: ADR-011, `frontend/README.md`, update ADR-010, `BUG_AUDIT` correction | 4 files | |

Each phase ends green on `typecheck && lint && test && build`.

---

## 8. Open questions

**Q1 — Deadline.** **Answered: one month.** The full plan above stands.

**Q2 — SSE token in the URL.** Fixing properly needs a backend change (short-lived stream
ticket, or cookie auth). Either (a) it goes in `FRONTEND_BACKEND_REQUESTS.md` and the
frontend stays as-is, or (b) the backend change is approved and implemented.
**Needed before Phase 3.**

**Q3 — Refresh token storage.** Doing this right wants an httpOnly cookie, again a backend
change. Without it, the honest frontend-only option is `localStorage`: better than dying at 15
minutes, still XSS-reachable. **Needed before Phase 3.**

**Q4 — Delete or archive `frontend/stitch/`?** Ten HTML exports and one SVG, referenced by
nothing. Preference: delete, they are in git history. **Needed before Phase 5.**

**Q5 — Browser access.** **Partly resolved** — the Chrome extension is connected and the
sign-in route has been inspected. Remaining routes need an authenticated session, which means
permission to submit the login form. Playwright also now captures axe results headlessly in
CI, which is the reproducible path regardless.

**Q6 — Branch base.** **Defaulted:** `feat/frontend-overhaul` is cut from
`fix/ci-green-and-codebase-audit`, because Phase 1 edits the same `ci.yaml` job those commits
touch. Say if it should be rebased onto `main` instead.

**Q7 — Keep the GRIDPULSE name?** It suits the instrument-panel feel, but paired with "SCADA",
"IEC 61850" and a transformer substation it oversells a household dataset.
**Needed before Phase 5.**

---

## 9. Phase 1 status — complete

Branch `feat/frontend-overhaul`, cut from `fix/ci-green-and-codebase-audit`.

**Gates, all green:** `typecheck`, `lint`, `format:check`, `test` (6 unit), `build`, `size`,
`test:e2e` (5, including an axe gate that fails on serious or critical violations).

### Deviations from the brief, deliberate

1. **Strict tsconfig went on globally, with no carve-out.** The four flags
   (`noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`) produced 51 errors: 40 unused imports and declarations, and
   11 real findings. Ten of the eleven were the same `list.length > 0 ? list[0].id : ...`
   shape, which does not narrow an index access for the compiler. All 51 are fixed, so the
   typecheck gate is real and repo-wide from day one.

2. **ESLint carries a legacy ignore list.** `strict-type-checked` against the pre-overhaul
   files yields roughly 200 findings in code Phase 5 rewrites or deletes. Those files are
   listed in `LEGACY_EXCLUDED` in `eslint.config.js` with type-aware rules disabled; new code
   gets the full rule set. **The list must reach empty by the end of Phase 5** — it is the
   debt ledger for this overhaul:

   | Path | Removed in |
   |---|---|
   | `src/components/Navbar.tsx` | Phase 2 |
   | `src/components/Sidebar.tsx` | Phase 2 |
   | `src/api.ts` | Phase 3 |
   | `src/App.tsx` | Phase 3 |
   | `src/pages/**` | Phase 5 |

3. **Two app fixes landed early.** The sign-in labels had no `htmlFor` and did not wrap their
   inputs, so the accessibility tree exposed both fields with **no accessible name** — a
   screen reader announced them by their value. That is a WCAG 2.1 AA 4.1.2 failure on the
   first screen of the app. Fixing it (`App.tsx:95,99,109,113`) is what lets the axe gate be a
   hard failure from Phase 1 rather than an aspiration. Separately, `main.tsx` traded a
   non-null assertion for a real error.

4. **Prettier was run across the frontend once** (+7,534/-1,401 lines, almost entirely long
   `className` strings re-wrapped at 100 columns). Done now so Phase 5 diffs show real changes
   instead of formatting churn.

### Enforcement worth knowing about

`no-restricted-properties` bans `Math.random` in production code, with a message pointing at
§3.2. The data-honesty requirement is now enforced by the toolchain rather than by review
attention. `no-console` allows only `warn` and `error`.

### E2E coverage today

Only the unauthenticated route exists, so `e2e/smoke.spec.ts` covers sign-in rendering,
accessible names, keyboard tab order, error surfacing, and axe. It grows a case per route
through Phase 5, ending at the full walkthrough the brief specifies (sign in, select dataset,
open each route, start and stop the stream).

### Visual finding from the connected browser

The sign-in card's spacing scale tops out at `1rem` (`tailwind.config.js:64-72`), so labels
sit flush against the content above them. Phase 2's token work should introduce a real type
and spacing scale rather than the five-step `space-*` ramp in use now.

---

## 10. Phase 2 status - complete

**Gates, all green:** `typecheck`, `lint`, `format:check`, `test` (40 unit, up from 6),
`build`, `size`, `test:e2e` (5 including axe). Verified visually in Chrome against the
production build.

### What landed

**Token layer.** `src/styles/tokens.css` holds every colour, space, radius, type step,
shadow, z-index and duration as a CSS custom property. `tailwind.config.js` reads those
rather than carrying a parallel palette. Colours are RGB channel triplets so Tailwind's
opacity modifiers still work.

Text contrast against `--color-surface`: body 15.8:1, muted 7.6:1, subtle 4.9:1 - all above
the 4.5:1 AA threshold. The status palette separates on blue-yellow as well as red-green, and
`StatusPill` always pairs colour with an icon and a screen-reader-only status word.

`prefers-reduced-motion` is handled once, in the token file, rather than per component.

**UI kit** in `src/components/ui/`: Button, Field + Input, Select, Panel + PanelHeader +
PanelBody, Badge, StatusPill, Metric, Skeleton, SkeletonText, EmptyState, ErrorState, Table,
Dialog, Tabs, Toast + useToast. Radix underpins Select, Dialog, Tabs and Toast, so focus
traps, roving tabindex, typeahead and the listbox/dialog roles come from the primitive.

Two components encode the data-honesty rule structurally rather than by convention:

- `Metric` takes `value: string | null` and renders "Not available" for null. There is no
  path that displays a zero or a placeholder in place of missing data.
- `PanelHeader` takes `source` and `asOf` and renders an `as of` `<time>`, so provenance is
  part of the container rather than something each page remembers.

**Navbar and Sidebar rewritten**, and both have left the legacy ledger. The Navbar's five
fabricated readouts (F2) are gone - including the 60.02 Hz that was wrong for a European
dataset - and its clock ticks once a second instead of five times. The Sidebar's fake
`IEC 61850` / `BUS A/B VOLT BALANCED` footer is gone, nav is grouped by pipeline stage, and
the active item carries `aria-current="page"` plus a left bar so it does not rely on colour.

**One icon system.** All 22 Material Symbols usages across the five legacy screens were
swapped for lucide equivalents, and the webfont is gone.

**No CDN requests.** All three font links are removed from `index.html`; Inter and JetBrains
Mono are bundled from `@fontsource` using latin-only subsets. The app now satisfies
`default-src 'self'` without a CSP exception. The duplicate favicon is gone too.

### Decisions worth recording

1. **Self-hosting Material Symbols was tried and reversed.** The `material-symbols` package
   ships a 4 MB variable font, which the build dutifully emitted. Rather than ship that or
   keep the CDN link, the 22 usages were converted to lucide - finishing the single-icon-set
   goal in Phase 2 instead of Phase 5.

2. **@fontsource's default imports pull every subset** (cyrillic, greek, vietnamese,
   latin-ext), which pushed CSS to 80 kB. Latin-only imports bring it to 38.8 kB raw /
   7.2 kB brotli.

3. **`tsconfig` target moved ES2020 to ES2022**, needed for `Array.prototype.at` and
   appropriate for a Vite app in 2026.

4. **The legacy palette survives as documented aliases.** Renaming every token would have
   left the pre-overhaul screens unstyled through Phases 3-4. `tailwind.config.js` carries a
   clearly marked compatibility block mapping the old Material-derived names and the old
   `space-*` ramp onto the new tokens. **It is deleted with `src/pages/**` in Phase 5.**

### Legacy ledger

| Path | Removed in | Status |
|---|---|---|
| `src/components/Navbar.tsx` | Phase 2 | **Cleared** |
| `src/components/Sidebar.tsx` | Phase 2 | **Cleared** |
| `src/api.ts` | Phase 3 | Outstanding |
| `src/App.tsx` | Phase 3 | Outstanding |
| `src/pages/**` | Phase 5 | Outstanding |
| Tailwind compatibility aliases | Phase 5 | Outstanding |

### Budget

| Budget | Limit (brotli) | Phase 1 | Phase 2 |
|---|---|---|---|
| Initial route js | 150 kB | 60.4 kB | 70.8 kB |
| Styles | 20 kB | 5.2 kB | 7.2 kB |

Radix and lucide account for the 10 kB of JS growth. Still less than half the budget, before
any route splitting exists to spend it.

---

## 11. Phase 3 status - complete

Gates green: typecheck, lint, format, 47 unit, 12 e2e, build, size.

- **Routing.** React Router with lazy route modules, `RequireAuth` (remembers and
  resumes the requested destination), `RequireRole` on `/admin`, a 404 route, and an
  error boundary around the outlet.
- **API layer.** `src/lib/api/` with types generated from the gateway's OpenAPI schema
  (`npm run gen:api`). Errors parse into an `ApiError` carrying the platform code and
  `X-Correlation-ID`.
- **Session.** Access token in memory, refresh token persisted, single-flight refresh
  with one replay on 401. Single-flight is load-bearing: the backend treats refresh
  reuse as compromise and revokes every session.
- **Sign-in.** React Hook Form + Zod; demo credentials only under `VITE_DEMO_MODE=true`.
- **`useTelemetryStream`.** Ticket auth, connection state, capped backoff, 600-reading
  ring buffer, animation-frame batching, server-supplied window aggregates.

Two bugs in the new code, both found by the new e2e coverage: `Button asChild` passed
two children into a Radix `Slot` and crashed the 404 page; and the sign-in redirect
fired before the post-submit navigate, discarding the requested destination.

`src/api.ts` remains as a documented adapter over the new client, because the legacy
pages are typed against the hand-written shapes in `src/types.ts` which differ from the
generated ones in optionality. It is deleted with those pages.

Routing carries 12 entries rather than the target 10: `/pipelines` and `/sub-meters`
stay separate until Phase 5 folds them into `/jobs` and `/analysis` as tabs.

---

## 12. Phase 4 status - complete

Gates green: typecheck, lint, format, 74 unit (up from 47), 12 e2e, build, size.

### What landed

- **`src/lib/format.ts`.** One module deciding precision per unit (kW to 3dp, kWh to
  2dp, V to 1dp), dataset instants rendered in **Europe/Paris and labelled CET/CEST**,
  durations, byte sizes and relative times. Missing values return "Not available"
  rather than a zero or a dash. 20 tests, including both sides of a daylight-saving
  boundary.
- **Chart components**: `TimeSeriesChart` (crosshair tooltip, LTTB sampling, optional
  dataZoom, optional threshold rule), `BarChart`, `StackedBarChart`, all on a
  tree-shaken `echarts/core` registration with the canvas renderer.
- **`ChartFrame`.** Every chart is a `<figure>` with a caption, a one-sentence text
  description, a legend when there are two or more series (none for one - the title
  names it), and a **table view holding the same numbers**. A tooltip enhances; the
  table is the guarantee. An empty result renders an empty state, not a bare axis.
  A refetch holds the previous render at reduced opacity instead of flashing a
  skeleton.

### Palette - computed, not chosen

The eight-hue categorical order was validated against this app's own chart surface
(`#111921`) with the dataviz skill's checker rather than eyeballed:

| Check | Result |
|---|---|
| Lightness band | PASS - all 8 within L 0.48-0.67 |
| Chroma floor | PASS - all 8 >= 0.10 |
| CVD separation | PASS - worst adjacent pair dE 8.4 under protanopia |
| Normal-vision floor | PASS - worst adjacent pair dE 19.3 |
| Contrast vs surface | PASS - all 8 >= 3:1 |

Slots are assigned in fixed order and never cycled; a ninth series folds into "Other"
rather than taking a generated hue. Bars in a nominal category all take slot 1, since
bar length already encodes the value.

### The budget was wrong, and the measurement says so

The ECharts chunk budget in §6 was **100 kB brotli, set before measuring**. A throwaway
probe build gives the real figure:

| Registration | Raw | Gzip |
|---|---|---|
| core + line + bar + grid + tooltip | 529.51 kB | 181.17 kB |
| the above + dataZoom + markLine | 583.95 kB | 198.88 kB |

So the chart layer costs roughly **170 kB brotli**, not 100. Trimming components saves
18 kB gzip and does not change the picture: `echarts/core` is the floor.

**This is worth a decision, not a silent budget edit.** ECharts was chosen in the brief
for large time series, and it is genuinely good at that - but the largest series here is
1,442 daily aggregates and a 600-reading live buffer, neither of which approaches the
scale that justifies the weight. uPlot is about 15 kB gzip and built for exactly this
shape of data, at the cost of hand-building bar and stacked-bar forms and the tooltip
chrome.

Kept ECharts for now: it is the brief's explicit choice, it is built and tested, the
chunk is lazy so `/overview` and sign-in never pay for it, and `vite.config.ts` now
splits it into a single shared `charts` chunk cached across every chart route. The
budget entry lands in `package.json` in Phase 5, when the chunk actually exists - adding
it now makes `npm run size` report a missing file on every run.

### Not yet verified

The chart components are unit-tested at the frame level - legend, table twin, empty
state, toggle semantics - but **no chart canvas has been rendered in a browser**,
because no page imports them yet. That happens in Phase 5, and the e2e suite gains
per-route chart assertions there.
