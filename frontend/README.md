# GridPulse frontend

React + TypeScript single-page application for the Big Data Energy Consumption
Analytics Platform. It is the operator-facing surface over the ingest, cleaning,
MapReduce, Hive and streaming services.

## Getting started

```bash
npm install
npm run dev            # http://localhost:3000, proxying /api to localhost:8000
```

The dev server proxies `/api` to `VITE_API_URL` or `http://localhost:8000`, so
run the backend first:

```bash
cd .. && python scripts/dev_server.py
```

Sign in with a seeded account (`admin@bda-energy.internal`). The credentials are
**not** shown in the UI unless you build with `VITE_DEMO_MODE=true`.

## Scripts

| Script                                          | What it does                                           |
| ----------------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                                   | Vite dev server with API proxy                         |
| `npm run build`                                 | `tsc` then a production build                          |
| `npm run preview`                               | Serve the production build                             |
| `npm run typecheck`                             | `tsc --noEmit`                                         |
| `npm run lint` / `lint:fix`                     | ESLint, `strict-type-checked`                          |
| `npm run format` / `format:check`               | Prettier                                               |
| `npm run test` / `test:watch` / `test:coverage` | Vitest                                                 |
| `npm run test:e2e`                              | Playwright against the production build                |
| `npm run size`                                  | Bundle budgets                                         |
| `npm run lighthouse`                            | Lighthouse against a running preview                   |
| `npm run gen:api`                               | Regenerate API types from the gateway's OpenAPI schema |

All of these run in CI. A change that breaks any of them fails the build.

## Architecture

```
src/
  app/          router, providers, guards, layout, error boundary
  components/
    ui/         the design-system primitives
    charts/     ECharts wrappers, each with a table-view twin
  features/
    <domain>/   one folder per route: page, queries, domain types
  lib/
    api/        typed client, token store, error types
    stream/     the telemetry EventSource hook
    format.ts   the single authority on how a value is written
  styles/       design tokens
  types/generated/  OpenAPI output; never edited by hand
```

**Routing.** React Router with lazy route modules, so each section is its own
chunk. `RequireAuth` remembers where a visitor was heading and resumes it after
sign-in. `RequireRole` gates `/admin` — a convenience, not a security control;
the API enforces authorisation on every request.

**Server state.** TanStack Query owns all fetching. Queries pause when the tab is
hidden, retry with backoff, and skip retrying 401/403 because those will not fix
themselves. Mutations invalidate the keys they affect.

**API client.** `src/lib/api/` is typed against `src/types/generated/api.ts`,
generated from the gateway's own OpenAPI schema. A backend contract change shows
up as a type error rather than a blank column. Errors parse into an `ApiError`
carrying the platform's code and the `X-Correlation-ID`, so a message shown to a
user can be found in the logs.

**Session.** The access token lives in memory only. The refresh token is
persisted, and a 401 triggers a single-flight refresh and one replay. Single
flight matters: the backend treats refresh-token reuse as compromise and revokes
every session, so parallel refreshes would sign the user out. The trade-off in
persisting the refresh token is argued in
[`docs/FRONTEND_BACKEND_REQUESTS.md`](../docs/FRONTEND_BACKEND_REQUESTS.md) (BR-2).

**Live telemetry.** `useTelemetryStream` owns the `EventSource`. It authenticates
with a short-lived stream ticket rather than the access token, reports connection
state, reconnects with capped backoff, keeps a bounded ring buffer, and batches
updates to animation frames so a high event rate costs one render per frame.

## Conventions

**Data honesty is the rule the rest hang off.** Every number on screen either came
from the API or is labelled as an input or a computed value.

- `Metric` takes `string | null` and renders "Not available" for null. There is no
  path that shows a zero in place of missing data.
- `PanelHeader` takes `source` and `asOf`, so provenance belongs to the container
  rather than to each page's memory.
- A missing field stays `null`. Never substitute a plausible constant.
- `Math.random` is banned in production code by lint rule, not by review habit.

**Formatting.** All values go through `src/lib/format.ts`. Precision is fixed per
unit. Dataset instants render in **Europe/Paris** and are labelled `CET/CEST` —
the dataset is a French household, and the viewer's clock is not the dataset's.

**Accessibility.** Every route is checked with axe on every CI run and a serious or
critical violation fails the build. Status is never carried by colour alone: a
`StatusPill` pairs colour with an icon and a screen-reader label. Use `Field`
rather than a bare `<label>` — it owns the id wiring, so a control cannot ship
without an accessible name.

**Charts.** One library, one palette. Series colours are assigned from a fixed
eight-slot order and never cycled; a ninth series folds into "Other". The palette
is validated for contrast and colour-vision deficiency, not chosen by eye. Every
chart carries a table view holding the same numbers.

**Types.** `strict`, plus `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. No `any` outside the generated schema. An optional
prop that a caller may forward as `undefined` must be typed `T | undefined`.

## Testing

Unit tests use Vitest with Testing Library and MSW. **Mocks live only in tests** —
`src/test/handlers.ts` and Playwright route interception. Never in production
code.

End-to-end tests run Playwright against the production build with the backend
stubbed, so they need no services:

- `smoke.spec.ts` — sign-in, routing, guards, 404
- `pages.spec.ts` — per-route behaviour against a known payload
- `accessibility.spec.ts` — axe on all ten routes, keyboard operation, data honesty
- `fixtures.ts` — shared stub payloads and the route list

## Bundle budgets

Enforced by `npm run size`, in brotli:

| Chunk            | Limit  | Current |
| ---------------- | ------ | ------- |
| Initial route JS | 150 kB | ~102 kB |
| Styles           | 20 kB  | ~5 kB   |
| Charts (lazy)    | 175 kB | ~164 kB |

The charts chunk is ECharts and is loaded only by routes that draw something.
Its weight is discussed in `docs/FRONTEND_AUDIT.md` §12.

## Deployment

`Dockerfile` builds and serves through nginx. `nginx.conf` sets a CSP matching the
gateway's `default-src 'self'` — possible only because fonts are bundled rather
than fetched from a CDN — and disables proxy buffering on `/api/` so Server-Sent
Events actually stream.

On Render the app is a static site on its own origin, with `VITE_API_URL` pointing
at the API host. That makes production cross-origin, which is why sessions do not
use cookies; see BR-2.
