# D2 — Same-origin BFF pass-through

**ID:** `EC-D2`
**Status:** Accepted (amended 2026-09-30 — response-forwarding rows corrected; see Consequences)
**Date:** 2026-09-30
**Spec:** `../cutover-headline.md` (`EC-CUTOVER-001`) CON-8, DEC-1, DEC-4; `../services/api-client.md` CON-2, CON-12; `../services/platform.md` CON-3; `../services/auth.md` CON-3

## Context

The browser has to reach `https://aces-api.lyceumalabang.edu.ph/api/v1/*` to do anything, but the refresh credential is an httpOnly cookie and the token is in memory. Two things follow if the browser calls that host directly:

1. **CORS.** The Laravel host would need an allowlist entry for the frontend origin, plus a preflight path for every non-simple request, forever.
2. **Cookie scope.** A cookie is not sent on a cross-site request unless it is `SameSite=None; Secure`. That widens the cookie's exposure to any origin the browser considers same-site with the API host, for the sake of a request pattern we chose.

The e-cert frontend already resolved this, and the mechanism is easy to misread. e-cert's `vercel.json` is `{}` and its `next.config.ts` has no `rewrites()` — which reads as "it calls the API host cross-origin". It does not. It forwards in app code: `src/app/api/v1/[...path]/route.ts` is a 175-line catch-all Route Handler that receives same-origin browser calls and re-issues them server-side to `CERT_API_URL` / `AUTH_API_URL`. The empty `vercel.json` is explained by the handler existing, not by cross-origin calls.

## Decision

The browser talks same-origin only. A catch-all Route Handler `app/api/v1/[...path]/route.ts` forwards browser traffic **server-side** to `CONSULT_API_URL` (the Consult API). `vercel.json` stays `{}` and `next.config.ts` gains no `rewrites()`. No CORS allowance is configured on the Consult host, and the refresh cookie crosses same-origin, so the attributes the Consult API sets are unchanged.

Target selection: **the Consult API is the only upstream.** `api-endpoints.md` v2.1 defines the Consult surface as the domain endpoints plus the SSO trio, and §2.2 assigns user and group writes to the Auth Platform — so nothing in the browser's traffic needs a second host. (e-cert's handler splits non-trio `auth/*` to the Auth host because cert's own surface requires it; consult's does not. See `../services/api-client.md` DEC-2a for the open question of whether the consult admin UI will need one.)

Forwarding contract, carried from the e-cert handler:

| Aspect | Rule |
|---|---|
| Method, path, query | Forwarded verbatim; target is the Consult API's base + `/api/v1/` + the path, plus the original query string |
| Body | Streamed for non-`GET`/`HEAD`; empty body sent as none |
| Headers | `authorization`, `content-type`, `accept`, `x-requested-with`, `x-forwarded-for`, `user-agent` |
| Cookies | Forwarded **only** on the refresh and logout paths (`auth-integration.md` v1.6 §3) |
| Response | Upstream `content-type`, `content-disposition`, and every `set-cookie` passed through; body streamed; `redirect: "manual"` |
| `content-length` | **Not forwarded.** `fetch` decompresses the upstream body, so the upstream length describes bytes the client never receives; letting the runtime frame the response avoids a length mismatch |
| Bodyless statuses | `204`/`205`/`304` return a null body, and `set-cookie` is **still** passed through — the Consult logout clears the refresh cookie with a `204` |
| Empty path | `400` |
| Upstream unreachable | `502` |

The header and cookie lists above describe what e-cert's handler happens to forward; consult adopts them as a deliberate choice, not as a contract, and is free to narrow them. The cookie-scoping rule is the one with a security reason and is kept.

**Amendment 2026-09-30.** Two rows in the original table were wrong, found by implementing D-1 and testing it:

- **`content-length` must not be forwarded.** The original row listed it with `content-type` and `content-disposition`. But `fetch` decompresses the upstream body, so the upstream length describes bytes the client never receives; forwarding it produces a length mismatch. This was a defect in the record, inherited from e-cert's handler, which does forward it.
- **Bodyless statuses need explicit handling.** The Consult logout answers `204` and clears the refresh cookie in the same response. A naive body passthrough constructs a `NextResponse` with a body on a `204`, which the runtime rejects — so the logout path would throw. `set-cookie` must survive on a `204`.

Both are now in the table above, and `../services/api-client.md` carries the matching acceptance. Neither changes the architecture; both correct the record to what the runtime and the Consult contract actually require.

The handler MUST NOT transform, validate, enrich, or inject auth. If a payload is wrong, that is a Consult API defect and is filed against the backend spec; the proxy is never the place to paper over it (`../cutover-headline.md` CON-9).

## Consequences

- No CORS configuration on the Consult host, and no relaxation of the cookie attributes the Consult API sets (`auth-integration.md` v1.6 §3).
- The Consult API hostname never reaches the browser bundle. That is the privacy property, and it is why the target is a server-only env var (`../services/platform.md` CON-2).
- The browser's Network tab shows one origin, which makes the T1 E2E cookie check (`EC-CUTOVER-001` ACC-2) observable rather than inferred.
- A 502 here means the Consult API is unreachable, not that the app is broken; the two must be told apart in any error surface built on top.
- The typed client talks to same-origin `/api/v1/*` and never learns the upstream host. If the BFF is ever replaced by a `vercel.json` rewrite, the client is unaffected — which is why the rewrite option remains a documented fallback.
- **Reference discipline:** this record adopts e-cert's *mechanism*, not its *contract*. Where cert's handler and the Consult specs disagree, the Consult specs win. One example already fixed: an earlier draft of `../services/api-client.md` asserted a non-trio `auth/*` → Auth-host route that the Consult API does not have.
