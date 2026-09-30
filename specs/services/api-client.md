# API Client

## Service Specification

| Field | Value |
|-------|-------|
| ID | `EC-API-001` |
| Title | Typed API client and BFF transport for the Consult API |
| Status | Final v1.0 (user-approved 2026-09-30; surfaces, no normative change from Draft v0.1) |
| Owner | TBD (awaiting user confirmation) |
| Version | 1.0 Final |
| Scope | Transport for every data operation: same-origin BFF Route Handler, typed per-resource modules, auth header injection, error normalization, 403-lock telemetry, pagination |
| Non-goals | Endpoint behavior (owned by the Consult API, cited by ID) · token lifecycle (`EC-AUTH-001`) · env/deploy topology (`EC-PLAT-001`) · feature flows (`EC-APPT-001` and siblings) · report computation (Phase E) · CSV/PDF export bytes |
| Layer | `services` (data plumbing) |

## RFC 2119 terminology

MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL are as described in RFC 2119.

## Context

What exists today in `D:\loa\e-consultation` (verified 2026-09-30):

- `lib/api/client.ts` (118 lines) — a `window.fetch` **monkey-patch** that attaches a Bearer header to string-URL calls when a module-level `authToken` is set, and on any `403` dispatches an `app:toast` event, POSTs to `/api/audit/forbidden`, and dedupes toasts per `method:url` on a 3s `Set`. It also exports SWR hooks (`useApiGet`, `useApiMutate`, `invalidate`) whose `fetcher`/`mutator` call the same patched `fetch`.
- `lib/api/appointments.ts`, `lib/api/availability.ts` — typed wrappers written for `EC-APPT-001` D-2, deliberately wrapping the **legacy same-origin `/api/*`** handlers with `V1` constants staged for the switch.
- `lib/jwt-context.tsx` — holds the token and exposes `apiFetch`, but builds URLs from `process.env.NEXT_PUBLIC_CONSULT_API_URL` and calls the Laravel host **directly** with `credentials: "include"`.
- 112 `app/api/**/route.ts` files across 20 areas, all hitting Supabase through `lib/repositories/factory.ts`. There is no `app/api/v1/` directory.

The gap: `../cutover-headline.md` CON-8 requires same-origin browser traffic and **forbids** direct cross-origin calls. T1-a/T1-b landed a direct-client Bearer seam with no BFF in front of it, so the current code sits on the path its own spec forbids. This spec defines the transport that closes that gap; the BFF handler is the first deliverable.

Proven reference: e-cert `src/app/api/v1/[...path]/route.ts` and `src/lib/api/client.ts:68-190` (`BASE_URL=/api/v1`, Bearer inject, 401→refresh→retry once, redirect-manual guard, localhost `[API]` logging, PDF Blob, `limit`/`offset` + `meta.has_more`, one typed module per resource, never raw `fetch()`).

## Constraints

- **CON-1** — All browser data calls MUST go to same-origin `/api/v1/*`. Direct cross-origin calls to the Consult or Auth host from browser code are forbidden (`EC-CUTOVER-001` CON-8). The upstream hostnames MUST NOT appear in the client bundle.
- **CON-2** — The BFF Route Handler MUST forward without transforming, validating, enriching, or injecting auth. Method, path, query, body, and the header/cookie rules in `../decisions/bff-passthrough.md` are normative. Unexpected data is an upstream defect to file against the backend spec (`EC-CUTOVER-001` CON-9).
- **CON-3** — Every non-public request MUST carry `Authorization: Bearer <in-memory token>`. The token MUST NOT be read from or written to `localStorage`/`sessionStorage`. Note: e-cert's `src/lib/auth/token-store.ts` uses `localStorage` against its own rule — that drift MUST NOT be copied (`../decisions/jwt-display-only.md`, `EC-CUTOVER-001` CON-6).
- **CON-4** — Error handling MUST distinguish: `401` → attempt one silent refresh, retry **once**, then surface an unauthenticated state; `403` → genuine lack of permission, show the locked state, **no retry**; `404` → not-found; `422` → validation; `502` → upstream unreachable. A `403` MUST NOT be retried, and MUST NOT fall back to a permissive local default.
- **CON-5** — The 403-lock UX MUST survive: a `403` surfaces `setLockedEndpoint` + `LockedTab` and fires `POST /api/audit/forbidden` telemetry, never a redirect and never a blank page (`EC-CUTOVER-001` CON-3). Telemetry POSTs MUST be failure-tolerant.
- **CON-6** — Response shapes MUST be consumed as the Consult API produces them, with no envelope assumption and no reshaping to match legacy Supabase query output. The shape of every response, and the level each endpoint requires, are defined by `api-endpoints.md` v2.1 and the per-area module specs — cited, never restated here.
- **CON-7** — One typed module per resource. New code MUST use the typed client, never raw `fetch()`. Any existing raw-`fetch` call site is a named legacy exception to be migrated when touched, not a precedent.
- **CON-8** — Pagination MUST use whatever parameters `api-endpoints.md` v2.1 and the per-area module specs define for the endpoint, and MUST honor the pagination metadata those specs describe. This spec defines no pagination scheme of its own. Areas still on legacy `/api/*` handlers keep their current call shapes until that area's parity gate passes.
- **CON-9** — Internal `app/api/**/route.ts` handlers MUST stay live until their own area's parity gate passes, then be thinned per `EC-CUTOVER-001` DEC-4. T2 area order: appointments/availability → academic/semesters → evaluations/periods/rubrics/results → admin-import link-reads → reports last. The two §2.2 exceptions (`app/api/bug-reports/**` and `POST /api/audit/forbidden`) stay local permanently.
- **CON-10** — The global `window.fetch` patch MUST be removed as each area moves to the typed client. While it remains, it MUST NOT attach a Bearer header to a same-origin legacy `/api/*` call that the Consult API does not serve, and MUST NOT swallow response bodies.
- **CON-11** — Backend discrepancies MUST be filed as backend spec gaps, never worked around in this client. The Consult API never adapts to this frontend.

## Goal

### Decisions

- **DEC-1** — Base URL is same-origin `/api/v1`. It is a constant, not an env var: the browser's own origin is the base, so there is no public API-URL variable to get wrong.
- **DEC-2** — BFF target is the **Consult API only**. `api-endpoints.md` v2.1 defines the Consult API's entire surface as the domain endpoints plus the SSO trio (`auth/callback`, `auth/refresh`, `auth/logout`), and `api-endpoints.md` §2.2 assigns user/group/member writes to the Auth Platform. The Consult API itself is therefore the only upstream the browser's domain traffic needs, and the handler carries one target, `CONSULT_API_URL`, with a production-host fallback in code for Vercel where the env var is unset.
- **DEC-2a** — **No `AUTH_API_URL` target is specified, because the backend has not decided whether the consult frontend needs one.** e-cert's handler routes non-trio `auth/*` to the Auth host because cert's own surface requires it — cert's `service/users|groups|members` auth-proxy routes and its per-user access check. Consult has no equivalent: `api-endpoints.md` v2.1 §5.3 states user writes are Auth-owned and consult exposes link reads only. **This app's legacy `app/api/auth/{users,access,onboarding,me}` handlers prove a need exists but do not say where it should be met** — in the Auth Platform's own admin UI or through an Auth API target on this BFF. That is a question for `api-endpoints.md` §2.2, not one this spec may answer. **Filed as an open backend spec gap; until it is answered, `AUTH_API_URL` is not implemented** and the handler forwards everything to the Consult API. Inventing a target here would be copying e-cert's mechanism into a topology that has not been shown to need it.
- **DEC-3** — `lib/api/client.ts` becomes a real typed client: an explicit `apiFetch(path, init)` that injects the token, plus the 401-refresh-retry-once ladder. The `window.fetch` patch is retained only as a temporary bridge for un-migrated areas and is deleted when the last area ships (CON-10).
- **DEC-4** — `app/api/v1/[...path]/route.ts` exports the standard verb set (`GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS`) over one `proxyRequest` helper, as in the e-cert handler. `OPTIONS` is exported so a preflight is answerable if one is ever sent, though CON-1 means it should not be needed.
- **DEC-5** — `401` retry is single-shot and guarded against loops: one refresh, one replay, then throw. A `502` is never retried automatically.
- **DEC-6** — Resource modules mirror the Consult API's own surface areas rather than the legacy `features/*` folders, so the module list tracks `api-endpoints.md` v2.1 §5 and the two documents stay checkable against each other. The first modules are `appointments` and `availability` (already written, re-pointed), then the remaining §5 areas in T2 order, then reports.
- **DEC-7** — `lib/jwt-context.tsx`'s `apiFetch` is the single bearer of the Authorization header; `client.ts` reads the token from the context rather than holding a second module-level copy. The duplicate `authToken` module variable is removed (CON-3, CON-10).
- **DEC-8** — `POST /api/audit/forbidden` remains a local Next.js route, not a Consult API call — it is one of the two `api-endpoints.md` §2.2 exceptions. Telemetry must never block or alter the user-visible outcome of a 403.

### Acceptance — Objective (deterministic, machine-checkable)

- **ACC-1** — BFF routing: every `/api/v1/*` path the Consult API defines forwards to the Consult host — asserted per area against a mocked `fetch` by target URL, including the SSO trio (`auth/callback`, `auth/refresh`, `auth/logout`) and at least one path per `api-endpoints.md` §5 area. No other target is asserted, because none is specified (DEC-2a).
- **ACC-2** — BFF forwarding: `Authorization` and `content-type` reach the upstream call; query string is preserved verbatim; a non-`GET` body is forwarded; `content-type`/`content-disposition`/`content-length`/`set-cookie` from upstream are present on the response.
- **ACC-3** — BFF cookie scoping: cookies are forwarded for the SSO refresh and logout paths and **not** forwarded for ordinary domain calls or for the callback.
- **ACC-4** — BFF failure modes: empty path array → `400` with a JSON error; upstream `fetch` throwing → `502` with a JSON error; upstream `3xx` is not followed (`redirect: "manual"`).
- **ACC-5** — Client auth ladder: a `401` triggers exactly one refresh and one replay of the original request; a second `401` surfaces unauthenticated without a third call; a `403` triggers neither refresh nor replay.
- **ACC-6** — Token storage: no reference to `localStorage`/`sessionStorage` in the auth path; the token is absent from the module's serialized state.
- **ACC-7** — Shape pass-through: a response is returned to the caller with its keys and casing exactly as the Consult API produced them — no renaming, no flattening, no envelope added or removed.
- **ACC-8** — 403 telemetry: one `POST /api/audit/forbidden` per 403, suppressed for a repeat of the same `method:url` inside the dedupe window, and a telemetry failure changes nothing user-visible.
- **ACC-9** — No client bundle reference to the Consult host: the BFF target hostname is read from server-only env and the constant does not appear in any module reachable from a client component.
- **ACC-10** — Full Vitest suite green (user-run: `npx vitest run`) with no regression in the existing 9 test files.

### Acceptance — Subjective (human-judged, observable reviewer actions)

- **ACC-S1** — Reviewer opens the browser Network tab, signs in, and confirms every request is same-origin `/api/v1/*` with no cross-origin request from the app origin.
- **ACC-S2** — Reviewer triggers a locked endpoint as a non-admin and confirms the locked tab appears with a telemetry entry in the audit log, not a redirect or blank page.
- **ACC-S3** — Reviewer confirms the dev console stays clean of unexpected errors across a sign-in, a refresh, and a sign-out.

### Deliverables

- **D-1** — `app/api/v1/[...path]/route.ts`: the BFF Route Handler per CON-2, DEC-2, DEC-4 (all seven verbs over one `proxyRequest`; single Consult target, no Auth target — DEC-2a).
- **D-2** — `lib/api/client.ts`: typed `apiFetch` with Bearer injection and the 401-refresh-retry-once ladder (DEC-3, DEC-5, DEC-7); token sourced from the JWT context; `window.fetch` patch reduced to the legacy bridge and eventually deleted (CON-10).
- **D-3** — Resource modules re-pointed to `/api/v1`: `appointments.ts` and `availability.ts` first (both exist and wrap legacy `/api/*` today), then the remaining `api-endpoints.md` §5 areas in the T2 order; reports last and blocked on the Consult Phase E endpoints existing.
- **D-4** — `lib/__tests__/`: BFF routing tests (ACC-1–ACC-4), client ladder tests (ACC-5), token-storage test (ACC-6), shape pass-through (ACC-7), 403 telemetry (ACC-8) — one behavior per test, `fetch` mocked, `vi.resetAllMocks()` per `AGENTS.md` Lessons Learned §5.
- **D-5** — User-run manual checks: ACC-S1–ACC-S3, recorded in this repo's `TODO.md` when complete.

### Glossary

| Term | Meaning |
|------|---------|
| BFF pass-through | Same-origin Route Handler forwarding server-side with no transform (`../decisions/bff-passthrough.md`) |
| Typed module | One module per resource area, the only sanctioned way to call the API (CON-7) |
| Locked UI | `setLockedEndpoint` + `LockedTab` + `POST /api/audit/forbidden` on a 403; never a redirect |
| Thin out | An area's internal `route.ts` removed or replaced by the BFF after its parity gate passes |
| Parity gate | Same-input legacy-vs-cutover match, pasted by the USER before thinning |
| §2.2 exceptions | Endpoints `api-endpoints.md` v2.1 §2.2 leaves to this app — cited there, listed only as they affect transport (CON-9) |
| Area | One `api-endpoints.md` v2.1 §5 section — the unit the typed modules and the T2 order are built from |

### Reference discipline

Backend behavior is **cited by ID, never restated** — the same rule `EC-CUTOVER-001` CON-2 sets and that this repo's `cutover-headline.md` follows. Concretely: this spec names *what it calls* (paths, base, transport behavior) and *which backend spec owns the rest*. It does not restate endpoint shapes, levels, group vocabulary, claim structure, or cookie flags; those live in `api-endpoints.md`, the per-area module specs, `auth-integration.md`, and `consult-readiness.md`, and a change there governs without a change here.

The failure this prevents is concrete and already happened once: an earlier draft of this spec asserted that a non-trio `auth/*` path routes to the Auth host, because e-cert's handler does that. The Consult API has no such route — `api-endpoints.md` v2.1 defines the SSO trio and the domain surface, and §2.2 assigns user writes to the Auth Platform. Copying e-cert's routing rule would have encoded a path that does not exist. See DEC-2a.

### References

- `../cutover-headline.md` Final v1.1 (`EC-CUTOVER-001`) — CON-1…CON-12, DEC-1/DEC-4, ACC-2/ACC-3
- `../decisions/{csr-spa,bff-passthrough,jwt-display-only}.md` (`EC-D1`/`EC-D2`/`EC-D3`)
- `appointments-flow.md` Final v1.0 (`EC-APPT-001`) — the first T2 area
- Consult backend, cited by ID: `api-endpoints.md` v2.1 (surface + §5 areas + §2.2 exceptions + levels) · `endpoints-appointments.md` v1.0 · `endpoints-academic.md` v1.1 · `endpoints-evaluations.md` v1.1 · `endpoints-reports.md` v1.0 (Phase E, not yet implemented) · `auth-integration.md` v1.6 §3 (SSO trio) · `url-flattening.md` v1.1 (flat paths)
- e-cert, **reference only — the mechanism, not the contract**: `src/app/api/v1/[...path]/route.ts` (handler structure) · `src/lib/api/client.ts:68-190` (ladder) · `specs/services/api-client.md` · `src/lib/auth/token-store.ts` (localStorage drift — do not copy). Nothing in e-cert's spec text is normative here; where this repo's needs differ, this spec wins.
- Root `AGENTS.md` (Rule 0, no autopilot) + this repo's `AGENTS.md` (advisory mode, one-change rule, Working-with-Specs, Lessons Learned §4/§5)

## Document Control

- **Status:** Final v1.0 — user-approved 2026-09-30. No normative change from Draft v0.1.
- **Created:** 2026-09-30 as Draft v0.1, `EC-CUTOVER-001` D-2 (`specs/services/api-client.md` e-cert mirror on consult names/hosts/cookie).
- **Supersedes:** nothing. Complements `EC-APPT-001` (area flow), `EC-AUTH-001` (session), `EC-PLAT-001` (env/deploy), and `EC-CUTOVER-001` (order).
- **Known current drift (recorded, not yet fixed — both are D-2 work):** `lib/api/client.ts` still holds a module-level `authToken` duplicating the JWT context (DEC-7), and its `window.fetch` patch still attaches Bearer to same-origin legacy `/api/*` calls (CON-10). `lib/api/appointments.ts` + `availability.ts` still wrap legacy `/api/*` (D-3).
- **Next:** D-1 (the BFF handler) is unblocked and is the first code step. D-2, D-3, D-4 follow in order.
