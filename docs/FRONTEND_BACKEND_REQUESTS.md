# Frontend requests against the backend

Things the frontend needs from backend services, with the contract proposed or
implemented. Raised from `docs/FRONTEND_AUDIT.md`.

| # | Request | Status |
|---|---|---|
| BR-1 | Short-lived ticket for SSE authentication | **Implemented** |
| BR-2 | httpOnly refresh-token cookie | **Declined** — wrong fit for this deployment |
| BR-3 | Always populate `request_id` on error responses | Open |
| BR-4 | Correct the "RFC 7807" claim in `docs/API.md` | Open |

---

## BR-1 — Stream ticket (implemented)

**Problem.** `EventSource` cannot set an `Authorization` header, so the client put
its access token in the query string: `GET /api/v1/stream/live?token=<JWT>`. URLs
reach access logs, proxy logs, browser history and `Referer` headers. What leaked
there was a full 15-minute token with the user's whole role attached.

**Contract.**

```
POST /api/v1/stream/ticket
Authorization: Bearer <access token>
→ 200 { "ticket": "<jwt>", "expires_in": 30 }

GET /api/v1/stream/live?ticket=<ticket>
```

The ticket is a JWT with `token_type: "stream"` and a 30-second lifetime.
`decode_token` already enforces `token_type`, so a ticket cannot be replayed
against any other endpoint, and an access or refresh token cannot be used as a
ticket. The `Authorization` header still works for non-browser clients.

**Why a ticket rather than a cookie.** The SSE endpoint is cross-origin in
production (see BR-2), so a cookie would have to be `SameSite=None`, which is
exactly the pattern browsers are removing. A ticket depends on nothing but the URL.

**Changed:** `shared/security.py` (`create_stream_ticket`,
`STREAM_TICKET_EXPIRE_SECONDS`), `services/stream-service/src/main.py`
(`POST /stream/ticket`; `/stream/live` takes `?ticket=`).
**Removed:** the `?token=` parameter. `tests/security/test_stream_ticket.py`
(8 tests) covers the lifetime bound, both directions of type confusion, the
endpoint's auth requirement, and a guard against the old parameter returning.

**Residual risk.** A ticket is still a bearer credential in a URL for 30 seconds.
Eliminating that entirely needs same-origin cookies, which needs BR-2's deployment
change.

---

## BR-2 — httpOnly refresh cookie (declined, with reasoning)

**What was asked for.** Store the refresh token in an httpOnly, Secure,
SameSite cookie so it is unreachable from JavaScript, instead of in
`localStorage`.

**Why not, here.** `render.yaml` deploys the frontend as a **static site on its
own domain** and injects `VITE_API_URL` pointing at the separate
`bda-backend-api` host. Production is therefore cross-origin, and a cross-site
cookie must be `SameSite=None; Secure`. That:

1. is the exact category of cookie browsers are phasing out, so the login flow
   would degrade unpredictably across browsers and Safari's ITP already restricts it;
2. gives up the CSRF protection `SameSite` exists to provide, so it would have to
   be replaced with CSRF tokens — more moving parts than the risk it removes;
3. would still not be reachable from the SSE endpoint, which is the case that
   prompted the question.

An httpOnly cookie is the right answer when the API and the app share an origin.
Here it would be a worse and less reliable design than the alternative.

**What was done instead**, entirely in the frontend:

- The **access token lives in memory only**. Today it sits in `localStorage`; a
  page refresh will now cost a silent refresh rather than leaving a long-lived
  credential on disk.
- The **refresh token is persisted in `localStorage`**, so a session survives a
  reload and stops dying at 15 minutes.
- Refresh is **single-flight** and retries a 401 once.

The refresh token is XSS-reachable. That is a real, accepted trade, and it is
mitigated by three things already true: the backend **rotates** refresh tokens,
**detects reuse** and revokes every session for that user when it sees one
(`services/auth-service/src/main.py:276-300`); the app ships **no third-party
scripts**; and the CSP is `default-src 'self'` with no CDN exceptions since the
fonts were self-hosted.

**The path to doing this properly** is not a cookie flag, it is making the app
same-origin: serve the SPA through the gateway (as `frontend/nginx.conf` already
does for Docker), or add a proxy rewrite from the Render static site to the API.
`SameSite=Strict` cookies then work with no CSRF machinery. That is a deployment
change, out of scope here, and worth doing if this ever handles real accounts.

---

## BR-3 — Populate `request_id` on every error (open)

`request_id` came back `null` on an expired-token response during the audit, so
the correlation id the UI shows a user cannot always be traced in the logs. The
gateway generates one per request (`services/api-gateway/src/main.py:82`);
services should propagate it into every error envelope, including those raised
before a handler runs.

**Impact:** the `ErrorState` component surfaces a reference for support, and it
will sometimes be blank.

---

## BR-4 — `docs/API.md` calls its error format RFC 7807 (open)

`docs/API.md:16` is headed "Error Format (RFC 7807)" but the schema is a custom
`{"error": {code, message, request_id, details}}` envelope. RFC 7807 is
`application/problem+json` with `type` / `title` / `status` / `detail` /
`instance`.

The envelope itself is fine and the frontend parses it. Only the claim is wrong.
Either retitle the section, or adopt real RFC 7807 — a breaking change not worth
making now. `docs/API.md:35` also documents the login body as `{"username": ...}`
when the API takes `email`.
