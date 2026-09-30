# Auth

## Service Specification

| Field | Value |
|-------|-------|
| ID | `EC-AUTH-001` |
| Title | Auth SSO session handling for the Consult API |
| Status | Draft v0.1 (written 2026-09-30 as `EC-CUTOVER-001` D-2; NOT Final — promotion gates auth code) |
| Owner | TBD (awaiting user confirmation) |
| Version | 0.1 Draft |
| Scope | SSO fragment handling, in-memory access token, claim-based role/tenant display, client route guard, silent and proactive refresh, logout |
| Non-goals | Token issuance or signing (Auth Platform) · payload decryption and cookie minting (Consult API) · login/register/password UI · user and role management (Auth Platform) · endpoint behavior (cited by ID) |
| Layer | `services` (identity plumbing — owns no identity) |

## RFC 2119 terminology

MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL are as described in RFC 2119.

## Context

What exists today in `D:\loa\e-consultation` (verified 2026-09-30):

- `lib/jwt-context.tsx` (196 lines, landed T1-a/T1-b) — a `"use client"` context providing `token`, `user`, `session`, `status`, `primaryGroup`, `hasGroup`, `login`, `logout`, `apiFetch`. It decodes the `groups` claim from the access token, maps Auth group names (`aces-admin`/`aces-dean`/`aces-faculty`/`aces-user`) to legacy display labels (`ADMIN`/`DEAN`/`FACULTY`/`STUDENT`), and derives a pipe-delimited `session.user.role` for rendering compatibility. It refreshes silently on load, rotates proactively 60s before expiry, and exports `ssoLoginUrl()`.
- `app/auth/callback/` — the fragment page that extracts `#payload=` and calls `login(payload)`.
- `lib/auth.ts` — NextAuth Credentials + `bcryptjs` against the Supabase `userRepository`. Still live; retired at T4 (`EC-CUTOVER-001` DEC-6).
- `proxy.ts` — still checks `getToken()` from next-auth. Pass-through since T1-b; the server gate is retired at T3.
- `app/api/auth/` — `[...nextauth]`, `activate`, `forgot-password`, `change-password`, `onboarding`, `users`, `me`, `access`. All retired at T4 except as noted below.

Two defects against `EC-CUTOVER-001`:

1. **Direct cross-origin auth calls.** `postAuth()` and `apiFetch()` build URLs from `process.env.NEXT_PUBLIC_CONSULT_API_URL` and call the Laravel host with `credentials: "include"`. CON-8 requires same-origin only. Until the BFF exists (`EC-API-001` D-1), these calls bypass it.
2. **Silent-refresh no-op when unconfigured.** On load, if `API_BASE` is empty the provider marks itself booted without attempting a refresh. Once the base is same-origin this branch becomes meaningless and MUST be removed rather than left as a bypass.

`login()` also defers `applySession` through `Promise.resolve().then(...)` to satisfy the React 19 `set-state-in-effect` lint rule (`AGENTS.md` Lessons Learned §4). That deferral is intentional and MUST be preserved, not "cleaned up".

Proven reference: e-cert `specs/services/auth.md` §3-§5 and `specs/services/auth.md:38-65` (fragment flow, memory token, `resolveRoleFromPermissions()` over `permissions` `<level>:<path>`, `specs/decisions/jwt-display-only.md`).

## Constraints

- **CON-1** — This app MUST NOT own identity. No token signing, no password handling, no `AUTH_SECRET`/`NEXTAUTH_SECRET` in any environment, no local role database, no role lookup from Supabase (`EC-CUTOVER-001` CON-5, `../decisions/csr-spa.md`).
- **CON-2** — The access token MUST live in JS memory only. `localStorage` and `sessionStorage` MUST NOT hold it or the refresh token. The refresh token is the `loa_connect_refresh` httpOnly cookie set by the Consult API, `Path=/api/v1/auth`, `SameSite=Lax`, riding same-origin through the BFF (`../decisions/bff-passthrough.md`).
- **CON-3** — Sign-in MUST go to `{NEXT_PUBLIC_AUTH_URL}/sso/login?redirect={origin}`. The app's own `/login` route MUST NOT host the SSO form; sign-in is a redirect, not a credentials form. Callback failure MUST clear partial state and MUST NOT produce a redirect loop to Auth.
- **CON-4** — The client MUST parse JWT claims for display and UI gating only. Group labels, the legacy `role` string, and tenant display derive from the `groups`/`permissions`/`tenant.slug` claims. The Consult API `jwt.auth`/`jwt.endpoint` is the only security boundary (`../decisions/jwt-display-only.md`). No client-side check may stand in for a server 403.
- **CON-5** — Logout MUST call the Consult API logout (204), clear the in-memory token, and land the user on a signed-out view. It MUST NOT leave a usable token in memory and MUST NOT depend on the legacy Supabase auth columns.
- **CON-6** — Silent refresh MUST be attempted on load, MUST be bounded to one in-flight attempt, and MUST NOT loop. A failed refresh MUST clear session state rather than retry indefinitely.
- **CON-7** — Group vocabulary is Auth-owned: `aces-admin`, `aces-dean`, `aces-faculty`, `aces-user`. Pipe-delimited `user.role` is legacy display vocabulary derived from claims; it MUST NOT be read from a database or used to decide access.
- **CON-8** — Retirement is phased per `EC-CUTOVER-001` DEC-6 and MUST NOT precede the phase that replaces it: `useSession()` consumers moved at T1 (done), the `proxy.ts` server gate at T3, NextAuth/`lib/auth.ts`/auth columns/`bcryptjs`/Supabase client at T4. The app MUST remain functional at every intermediate point (rollback is the point of the area sequencing).
- **CON-9** — Tenant is `loa-consultation` via `NEXT_PUBLIC_CONSULT_TENANT_SLUG`. The frontend MUST NOT hardcode a tenant id in a request body or query string.
- **CON-10** — Secrets MUST NOT ship to the client: Supabase service-role key, `AUTH_SECRET`, `NEXTAUTH_SECRET`, Gmail app password, `JWT_SECRET`, `ENCRYPTION_KEY` MUST all be absent from the deployed env and the bundle at T4 (`EC-CUTOVER-001` CON-11).

## Goal

### Decisions

- **DEC-1** — The flow is the Consult API trio, same-origin: fragment `#payload` → `history.replaceState` to clear it → `POST /api/v1/auth/callback {payload}` → access token into memory → httpOnly cookie already set by the API → route to the intended destination.
- **DEC-2** — `lib/jwt-context.tsx` remains the single session owner and the single source of the Bearer header for the client (`EC-API-001` DEC-7). It is not split into a separate token-store module; e-cert's split is a cert-side structure, not a requirement, and a second store is a second chance to persist a token.
- **DEC-3** — The `session` object with the pipe-delimited `role` is retained **only** as a display shim so un-migrated components keep rendering during T1→T3. It is derived from claims on every render, never stored, and is deleted when T3 lands the groups-claim gating.
- **DEC-4** — Proactive rotation stays: schedule a refresh 60s before `expires_at`. On load, attempt refresh before deciding `authenticated` vs `unauthenticated`.
- **DEC-5** — The `API_BASE` empty-string bypass is removed. The base is same-origin (`EC-API-001` DEC-1), so there is no configuration state in which auth is skipped.
- **DEC-6** — The client guard is: token present → allow; absent → one refresh attempt → allow or redirect to SSO. It runs client-side. There is no server-side JWT verify and no server-side role lookup, so `proxy.ts` loses both at T3.
- **DEC-7** — `NEXT_PUBLIC_AUTH_URL` supplies the SSO base; `ssoLoginUrl()` remains the single place a sign-in URL is built.
- **DEC-8** — Nothing in this spec adds a feature to the legacy auth surface. It is retirement-only work plus the SSO seam already landed.

### Acceptance — Objective (deterministic, machine-checkable)

- **ACC-1** — Fragment handling: given a URL with `#payload=<blob>`, the callback page calls `login(payload)` exactly once and clears the fragment via `history.replaceState`.
- **ACC-2** — Callback success: a `200` response yields a token in memory, `user` populated from `data.user`, and `status === "authenticated"`. The token is not written to any storage API.
- **ACC-3** — Callback failure: a `400`/`401`/`403` response leaves `token === null`, `status === "unauthenticated"`, and triggers no further callback attempts (no loop).
- **ACC-4** — Silent refresh on load: with no token but a valid cookie, one `POST /api/v1/auth/refresh` is issued and the session becomes authenticated. With neither, the session is unauthenticated and no further refresh is attempted.
- **ACC-5** — Proactive rotation: with a token expiring in under 60s, a refresh is scheduled; the interval equals `expires_at - now - 60_000`, floored at zero.
- **ACC-6** — Logout: one `POST /api/v1/auth/logout`; on success `token === null` and the user is routed away from protected pages. A logout network failure still clears local state.
- **ACC-7** — Group mapping: `["aces-admin"]` → `primaryGroup === "ADMIN"`; `["aces-user"]` → `"STUDENT"`; `["aces-faculty","aces-user"]` → `"FACULTY"` (priority order); an unknown group falls through without throwing.
- **ACC-8** — No secrets: no `JWT_SECRET`/`ENCRYPTION_KEY`/`AUTH_SECRET` in any client-reachable module, and no `localStorage`/`sessionStorage` write of a token.
- **ACC-9** — Same-origin: every auth call the client issues targets a relative `/api/v1/auth/*` path — no absolute host in the request URL.
- **ACC-10** — Full Vitest suite green (user-run: `npx vitest run`) with the existing 9 test files unaffected.

### Acceptance — Subjective (human-judged, observable reviewer actions)

- **ACC-S1** — Reviewer signs in as each of ADMIN, DEAN, FACULTY, and STUDENT and confirms the app lands on a usable dashboard with no error toast, on all four.
- **ACC-S2** — Reviewer confirms the browser Network tab shows no request to the Consult or Auth host origin, and that a page reload with a live cookie restores the session without a re-login.
- **ACC-S3** — Reviewer signs out and confirms the protected pages are no longer reachable and the in-memory token is gone (a protected API call does not succeed).

### Deliverables

- **D-1** — `lib/jwt-context.tsx` brought to this spec: same-origin auth calls (DEC-1, ACC-9), `API_BASE` bypass removed (DEC-5), single-flight refresh (CON-6, ACC-4/ACC-5), logout hardening (DEC-5/ACC-6), display shim marked transitional (DEC-3).
- **D-2** — `app/auth/callback/` verified against ACC-1–ACC-3; SSO entry point verified against CON-3 (`ssoLoginUrl()`), with the app's own `/login` reduced to a redirect and never a credentials form.
- **D-3** — Guard + group mapping: `primaryGroup`/`hasGroup` semantics per ACC-7; client guard per DEC-6; legacy `useSession()` consumers already migrated (T1 done) — no new consumers permitted.
- **D-4** — `lib/__tests__/`: auth context tests for ACC-1–ACC-7, secrets/storage test for ACC-8, same-origin URL assertion for ACC-9. One behavior per test, mocked `fetch`, `vi.resetAllMocks()` per `AGENTS.md` Lessons Learned §5.
- **D-5** — T3/T4 retirement checklist (not code in this step): `proxy.ts` server gate; `lib/auth.ts`; `[...nextauth]`; `activate`/`forgot-password`/`change-password`/`onboarding`; auth columns `passwordHash`/`tokenVersion`/`hasLoggedInBefore`; `bcryptjs`; `AUTH_SECRET`/`NEXTAUTH_SECRET`; Supabase client. Recorded here so T3/T4 are checkable, executed only in their own phases.

### Glossary

| Term | Meaning |
|------|---------|
| Fragment handler | Code that reads `#payload=…` from the URL, clears it, and posts it to the callback endpoint |
| Memory token | Access token held in a JS variable; never persisted |
| Display shim | Pipe-delimited `role` string derived from claims for un-migrated components; deleted at T3 |
| SSO redirect | Navigation to `{AUTH}/sso/login?redirect={origin}`; sign-in is never a local form |
| `aces-*` | Auth-owned group vocabulary; the only group source |
| `loa_connect_refresh` | httpOnly refresh cookie, `Path=/api/v1/auth`, `SameSite=Lax`, same-origin |
| `tenant` | `loa-consultation`; comes from `NEXT_PUBLIC_CONSULT_TENANT_SLUG` and the JWT claim |

### References

- `../cutover-headline.md` Final v1.0 (`EC-CUTOVER-001`) — CON-5/CON-6/CON-11, DEC-3/DEC-6, ACC-2
- `../decisions/{csr-spa,bff-passthrough,jwt-display-only}.md` (`EC-D1`/`EC-D2`/`EC-D3`)
- `../services/api-client.md` (`EC-API-001`) — transport and the 401 ladder this spec's refresh feeds
- Consult backend, cited by ID: `auth-integration.md` v1.6 §2 (topology), §3 (callback/refresh/logout contracts, cookie flags), §4 (JWT validation, claims), §9 (per-group matrices for ACC-S1) · `api-endpoints.md` v2.1 §4.0 (groups claim, no local roles)
- e-cert, reference only: `specs/services/auth.md` · `specs/decisions/jwt-display-only.md` · `src/lib/auth/token-store.ts` (localStorage drift — do not copy)
- Root `AGENTS.md` (Rule 0) + this repo's `AGENTS.md` (Working-with-Specs, Lessons Learned §4/§5)

## Document Control

- **Status:** Draft v0.1 — 2026-09-30. No code lands against this Draft.
- **Created:** 2026-09-30 as `EC-CUTOVER-001` D-2 (`specs/services/auth.md` e-cert mirror on consult names/hosts/cookie).
- **Note:** T1-a/T1-b already landed a working version of most of this. This spec records the target and the two defects the landed code carries (direct cross-origin calls; the `API_BASE` bypass), so the drift is visible rather than implicit.
- **Next:** user review → promote to Final, or revise Draft first. D-1 depends on `EC-API-001` D-1 (the BFF) landing first.
