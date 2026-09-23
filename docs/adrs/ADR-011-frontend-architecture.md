# ADR-011: Frontend Architecture for the Operations Console

## Status

Accepted. Supersedes [ADR-010](ADR-010-react-spa-architecture.md).

## Context

ADR-010 described a nine-view React SPA with Lucide icons and `EventSource`
telemetry. By the time of the audit in `docs/FRONTEND_AUDIT.md` the application
had drifted from that decision in ways that mattered:

- It shipped eleven views, not the nine described, and three page components were
  unreferenced dead code.
- Navigation was `useState`, not routing, so no view had a URL. Nothing was
  shareable, refresh-safe, or reachable with the back button.
- Two icon systems were in use, one of them a CDN webfont that the gateway's own
  Content-Security-Policy would block.
- A significant amount of what the UI displayed was **not measured**. Initial
  telemetry values, a random-number "Spark latency", client-side moving averages
  presented as server window aggregates, hardcoded voltage-band counts, and five
  invented status readouts in the header. One screen read field names the API has
  never sent, so it showed fabricated numbers on failure and blank columns on
  success.
- Sessions ended after fifteen minutes because the refresh token was discarded,
  and the access token sat in `localStorage` alongside a JWT passed in an SSE
  query string.
- There was no linter installed, no tests of any kind, and 53 uses of `any`.

The platform is assessed by demonstration. A console that displays numbers it did
not measure cannot survive scrutiny, and that is a correctness problem before it
is an aesthetic one.

## Decision

### 1. Data honesty is a structural property, not a convention

Every number on screen comes from the API or is labelled as a user input or a
computed value. This is enforced by the types and the toolchain rather than by
review attention:

- `Metric` accepts `string | null` and renders "Not available" for null. No code
  path can display a zero in place of missing data.
- `PanelHeader` accepts `source` and `asOf`, so provenance is a property of the
  container rather than something each page must remember.
- A field absent from a payload stays `null`. Substituting a plausible constant
  is prohibited.
- `Math.random` is banned in production code by an ESLint rule.
- Every chart carries a table view holding the same values.

### 2. Real routing, with guards

React Router with lazy route modules. Ten routes, each its own chunk. Dataset
selection lives in `?dataset=`, so a view is shareable and survives a reload.
`RequireAuth` resumes the requested destination after sign-in; `RequireRole`
gates `/admin` and is documented as a convenience over the API's enforcement,
never a substitute for it.

### 3. Types generated from the contract, not written by hand

`src/types/generated/api.ts` is produced from the gateway's OpenAPI schema by
`npm run gen:api`. A backend contract change surfaces as a type error. During the
rewrite this caught four field names that had been guessed wrong and would have
rendered as blank columns — the same failure the audit found in the shipped code.

### 4. Sessions use the refresh token, without cookies

The access token lives in memory; the refresh token is persisted; a 401 triggers a
single-flight refresh and one replay. Single flight is load-bearing: the backend
treats refresh-token reuse as compromise and revokes every session for that user,
so concurrent refreshes would sign the user out.

Cookies were considered and rejected for this deployment: Render serves the
frontend as a static site on its own origin, making production cross-origin, so a
cookie would need `SameSite=None` — the category browsers are withdrawing — and
would forfeit the CSRF protection `SameSite` exists to give. The reasoning and the
migration path are recorded as BR-2 in `docs/FRONTEND_BACKEND_REQUESTS.md`.

### 5. Streaming authenticates with a short-lived ticket

`EventSource` cannot set an `Authorization` header, so the credential must travel
in the URL. Rather than put a fifteen-minute access token there, the client
exchanges it for a thirty-second, stream-only ticket
(`POST /api/v1/stream/ticket`). `decode_token` enforces the token type, so a
leaked ticket unlocks nothing else.

Window aggregates come from the stream service's own payload. The client does not
compute a substitute, and says so on the page.

### 6. One of everything

One icon set (lucide), one chart library (ECharts, tree-shaken, lazy), one
data-fetching pattern (TanStack Query), one formatting module, one token file
that Tailwind reads rather than duplicating.

Dataset instants render in **Europe/Paris**, labelled `CET/CEST`. The dataset is a
French household; the viewer's clock is not the dataset's.

### 7. Quality gates in CI

`typecheck`, `lint`, `format:check`, unit tests, a bundle budget, and Playwright
end-to-end tests with axe on all ten routes. A serious or critical accessibility
violation fails the build.

## Consequences

**Positive.**

- Every view has a URL that survives refresh, back/forward and sharing.
- Nothing on screen is invented; the audit's fabricated-data findings are closed,
  and three of them are now impossible to reintroduce rather than merely fixed.
- Sessions no longer expire mid-demonstration.
- The app satisfies `default-src 'self'` with no CSP exception, because fonts are
  bundled rather than fetched from a CDN.
- Accessibility is measured every run rather than asserted: axe on all ten routes,
  Lighthouse 100 on the route reachable without a backend.
- A backend contract change breaks the build instead of the display.

**Negative, and accepted.**

- ECharts costs roughly 170 kB brotli. It is lazy and shared across chart routes,
  so the landing route never pays it, but it is heavier than this dataset strictly
  needs. `docs/FRONTEND_AUDIT.md` §12 records the measurement and the lighter
  alternative.
- The refresh token is reachable from JavaScript. Mitigated by backend rotation
  and reuse detection, no third-party scripts, and a strict CSP — but it is a real
  trade, taken deliberately, and it closes if the app is ever served same-origin.
- Eleven runtime dependencies were added. Each is justified in the audit document.

## Notes

ADR-010's core technology choices — React 18, TypeScript, Vite, Tailwind, SSE over
WebSockets — were sound and are retained. What this ADR changes is everything that
had drifted away from them, and the addition of the constraint ADR-010 never
stated: that the console must not display what it has not measured.
