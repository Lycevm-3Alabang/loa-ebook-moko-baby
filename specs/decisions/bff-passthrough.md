# D2 — Same-origin BFF pass-through

**ID:** `EC-D2`
**Status:** Accepted
**Date:** 2026-09-30
**Spec:** `../cutover-headline.md` (`EC-CUTOVER-001`) CON-8, DEC-1, DEC-4; `../services/api-client.md` CON-2; `../services/platform.md` CON-3; `../services/auth.md` CON-3

## Context

The browser has to reach `https://aces-api.lyceumalabang.edu.ph/api/v1/*` to do anything, but the refresh credential is an httpOnly cookie and the token is in memory. Two things follow if the browser calls that host directly:

1. **CORS.** The Laravel host would need an allowlist entry for the frontend origin, plus a preflight path for every non-simple request, forever.
2. **Cookie scope.** A cookie is not sent on a cross-site request unless it is `SameSite=None; Secure`. That widens the cookie's exposure to any origin the browser considers same-site with the API host, for the sake of a request pattern we chose.

The e-cert frontend already resolved this, and the mechanism is easy to misread. e-cert's `vercel.json` is `{}` and its `next.config.ts` has no `rewrites()` — which reads as "it calls the API host cross-origin". It does not. It forwards in app code: `src/app/api/v1/[...path]/route.ts` is a 175-line catch-all Route Handler that receives same-origin browser calls and re-issues them server-side to `CERT_API_URL` / `AUTH_API_URL`. The empty `vercel.json` is explained by the handler existing, not by cross-origin calls.

## Decision

The browser talks same-origin only. A catch-all Route Handler `app/api/v1/[...path]/route.ts` forwards browser traffic **server-side** to `CONSULT_API_URL` (the Consult API) or `AUTH_API_URL` (the Auth API), choosing the target from the path. `vercel.json` stays `{}` and `next.config.ts` gains no `rewrites()`. No CORS allowance is configured on the Laravel host, and the refresh cookie is same-origin with `Path=/api/v1/auth`, `SameSite=Lax`.

Target selection mirrors the reference implementation: `auth/callback`, `auth/refresh`, and `auth/logout` go to the Consult API (they are Consult endpoints that proxy onward themselves); any other `auth/*` goes to the Auth API; everything else goes to the Consult API.

Forwarding contract, carried from the e-cert handler:

| Aspect | Rule |
|---|---|
| Method, path, query | Forwarded verbatim; target is `{BASE}/api/v1/{path}` plus the original query string |
| Body | Streamed for non-`GET`/`HEAD`; empty body sent as none |
| Headers | `authorization`, `content-type`, `accept`, `x-requested-with`, `x-forwarded-for`, `user-agent` |
| Cookies | Forwarded **only** for `auth/refresh` and `auth/logout` |
| Response | Upstream `content-type`, `content-disposition`, `content-length`, and every `set-cookie` passed through; body streamed; `redirect: "manual"` |
| Empty path | `400` |
| Upstream unreachable | `502` |

The handler MUST NOT transform, validate, enrich, or inject auth. If a payload is wrong, that is a Consult API defect and is filed against the backend spec; the proxy is never the place to paper over it (`../cutover-headline.md` CON-9).

## Consequences

- No CORS configuration on the Laravel host, and no `SameSite=None` cookie.
- The Consult and Auth API hostnames never reach the browser bundle. That is the privacy property, and it is why the targets are server-only env vars (`../services/platform.md` CON-4).
- The browser's Network tab shows one origin, which makes the T1 E2E cookie check (`EC-CUTOVER-001` ACC-2) observable rather than inferred.
- A 502 here means the upstream platform is unreachable, not that the app is broken; the two must be told apart in any error surface built on top.
- The typed client talks to same-origin `/api/v1/*` and never learns the upstream host. If the BFF is ever replaced by a `vercel.json` rewrite, the client is unaffected — which is precisely why the rewrite option remains a documented fallback.
