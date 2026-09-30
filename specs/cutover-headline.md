# EC-CUTOVER-001 — Frontend Consumes loa-consult-platform Web API; Auth Delegated to loa-auth-platform

| Field | Value |
|-------|-------|
| ID | EC-CUTOVER-001 |
| Title | Frontend Consumes loa-consult-platform Web API; Auth Delegated to loa-auth-platform |
| Status | Final v1.2 (user-approved 2026-09-30; DEC-5 env contract — `NEXT_PUBLIC_CONSULT_API_URL` removed, browser base same-origin; CON-2/6/8 + DEC-4 reference discipline — backend contracts cited by ID, invented `AUTH_API_URL` target removed) |
| Owner | TBD (awaiting user confirmation) |
| Version | 1.2 |
| Scope | Headline cutover statement: e-consultation becomes a pure frontend following the proven `e-cert` CSR + BFF pattern; `loa-consult-platform` is the sole domain API (surface per `api-endpoints.md` v2.1, reports per `endpoints-reports.md` v1.0, Phase E last); `loa-auth-platform` is the sole auth issuer. Phased T0→T5 per `frontend-transition.md` Final v1.1 (`CONSULT-CUTOVER-001`). The endpoints that stay in this app are those `api-endpoints.md` v2.1 §2.2 assigns to it. |
| Non-goals | No code, migration, or dependency change lands on this Draft. No duplication of backend endpoint behavior. No rename of backend contracts. No big-bang Supabase delete. No visual redesign. No report-number changes (parity REQUIRED). |

## RFC 2119 terminology

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL in this document are to be interpreted as described in RFC 2119.

## Context

What exists today in `D:\loa\e-consultation` (verified):

- `proxy.ts` — `getToken()` from `next-auth/jwt` + `getUserAccess()` from `@/lib/access` (PUBLIC_PATHS/PREFIXES, semester-lock, longest-match, ADMIN fallback, closed-by-default API 403 JSON).
- `lib/auth.ts` — `NextAuthOptions` Credentials + `bcryptjs` `compare()` + `userRepository.findByEmail()` (`passwordHash` / `isDisabled` / `tokenVersion`, JWT session `{id, role, tokenVersion}`, `getServerSession()`).
- `lib/supabase.ts` — `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`; `lib/db.ts` re-exports + factory.
- `lib/repositories/factory.ts` — 21 Supabase repositories (users, departments, department-courses, appointments, availability, password-reset, audit, reports, semesters, evaluation-periods, subjects, sections, faculty-subjects, enrollments, rubrics, rubric-groups, evaluations, evaluation-results, bug-reports, group-access, user-permissions).
- `features/*/*.repository.ts` — 21 direct-Supabase files; Server Components call controllers directly (e.g. `HealthReportPage.tsx` → `auth()` → `getAdminReportData()`).
- `app/api/` — 112 internal `route.ts` files (20 areas, no `reports/`); `app/api/auth/[...nextauth]/route.ts` + `activate` / `forgot-password` / `change-password/*`.
- `package.json` — runtime `next-auth`, `bcryptjs`, `@supabase/supabase-js`; `.env.example` — `AUTH_SECRET` / `NEXTAUTH_SECRET` / `NEXTAUTH_URL`, `DB_PROVIDER=supabase`, `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, `SSO_FEATURE_FLAG=false`.
- `supabase-schema.sql` — dual-purpose DDL; `lib/types/repository.ts` interfaces.
- Existing Draft specs (old shape, not Final): `specs/auth-integration.md`, `specs/endpoint-catalog.md` (143 entries — drifted), `specs/migration-checklist.md`. This spec binds them to the Web-API cutover, not replaces them yet.

Proven pattern in `D:\loa\e-cert` (verified — MUST be followed):

- `AI-RULES.md:93-110` + `specs/decisions/csr-spa.md` (D1) — CSR SPA: no `src/proxy.ts`, no server actions, no session cookie, no server JWT verify, no users table/passwords.
- `specs/decisions/bff-passthrough.md` (D2) + `specs/services/api-client.md:50-53` + `specs/services/platform.md:36-41` — same-origin BFF passthrough via two Route Handlers (`src/app/api/v1/[...path]/route.ts` → `CERT_API_URL`, `auth/*` → `AUTH_API_URL`; legacy `src/app/api/events/[...path]/route.ts`), no `vercel.json`/`next.config.ts` rewrites; forwards method/query/body/auth headers, cookies only for refresh/logout, streams body (JSON/PDF Blob/empty), passes `set-cookie`, backend down → `502`.
- `src/lib/api/client.ts:68-190` — `BASE_URL=/api/v1`, Bearer inject, 401→refresh→retry once, redirect-manual guard, localhost `[API]` logging, PDF Blob (never base64 JSON), pagination `limit`/`offset` + `meta.has_more`; one typed module per resource, never raw `fetch()`.
- `specs/services/auth.md:38-65` — SSO `#payload` → `POST /api/v1/auth/callback` → memory token → client guard (token → refresh attempt → SSO redirect) → silent refresh → logout 204; role via `resolveRoleFromPermissions()` over `permissions` `<level>:<path>`; `specs/decisions/jwt-display-only.md` (D3) — client parse is display only, API `jwt.auth`/`jwt.endpoint` enforces; no `JWT_SECRET` in frontend.
- `specs/services/platform.md:55-69` — env `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_AUTH_BASE_URL` / `NEXT_PUBLIC_CERT_TENANT_SLUG` (+ legacy unread `NEXT_PUBLIC_CERT_API_URL`) + server-only `CERT_API_URL` / `AUTH_API_URL`; zero secrets (no Supabase/SMTP/`JWT_SECRET`/`ENCRYPTION_KEY`).
- Drift warning (MUST NOT copy): `AI-RULES.md:99` requires memory-only never `localStorage`, but `src/lib/auth/token-store.ts:1-32` stores both tokens in `localStorage`. e-consultation MUST follow the spec (memory access token + httpOnly refresh cookie), not the drift.

Backend Final truth in `D:\loa\loa-apache-server-apps\assemblies\loa-consult-platform` (cite by ID, never duplicate):

- `api-endpoints.md` v2.1 Final — the Consult surface: base + flat paths + level gates; §2.2 out-of-scope: self-hosted auth deleted, access-config/user-permissions replaced by the Auth catalog/grants (no Consult equivalent), reports deferred to Phase E, and the endpoints that stay in this app. Referenced, not summarized further here.
- `FRONTEND-INTEGRATION.md` v1.2 Final — handoff: fragment handler, memory store, refresh, logout, guard, groups-claim gating, 403-lock preserved; topology DECIDED Option B (same-origin BFF passthrough, no CORS); env block — `NEXT_PUBLIC_AUTH_URL` + tenant slug public, `CONSULT_API_URL` server-only.
- `frontend-transition.md` Final v1.1 (`CONSULT-CUTOVER-001`) — T0 topology → T1 auth → T2 data areas (reports last vs `endpoints-reports.md` v1.0) → T3 gate → T4 decommission → T5 E2E+rollback; DECIDED 2026-09-26 Option B, **same-origin BFF passthrough, no rewrites and no CORS** (mechanism corrected 2026-09-30), Vercel host (not Netlify), cookie attributes per `auth-integration.md` v1.6 §3 verified at T1 E2E; CON-4 area-sequenced revertible, CON-3 403-lock UX survives, CON-5 secrets leave client.

Why this spec exists: bind the headline (pure frontend; platform API; auth issuer) to the e-cert-proven transport plus the backend Final contracts, resolving the topology wording before any Final promotion.

## Constraints

- `CON-1` — Backend canonical name MUST be `loa-consult-platform`. Spellings `loa-consultation-platform` / `loa-consultation-app` MUST NOT appear in normative text.
- `CON-2` — Endpoint behavior MUST be cited by backend spec ID only, never duplicated: `api-endpoints.md` v2.1 (surface, shapes, levels), `endpoints-reports.md` v1.0 (Phase E), `frontend-transition.md` Final v1.1 (`CONSULT-CUTOVER-001`, T0→T5 order this repo executes), `FRONTEND-INTEGRATION.md` v1.2 (handoff checklist). The authoritative route count lives in `api-endpoints.md` v2.1 — read it there; `specs/endpoint-catalog.md` 143 is recorded drift and MUST NOT be cited as truth.
- `CON-3` — On this Draft, code MUST NOT change. Promotion to Final REQUIRES explicit user yes with no normative change, or a revised Draft first.
- `CON-4` — Direct Supabase calls (`lib/supabase.ts`, `lib/db.ts`, `lib/repositories/factory.ts`, `features/*/*.repository.ts`, `supabase-schema.sql`) MUST NOT gain new call sites. Existing sites are deprecated, removed only in T0→T5 order. e-cert anti-pattern applies: direct Supabase/PostgREST is forbidden in new code.
- `CON-5` — Internal auth (`next-auth`, Credentials, `bcryptjs`, `passwordHash` / `tokenVersion` / `hasLoggedInBefore`, `[...nextauth]`, `activate` / `forgot-password` / `change-password` routes, `useSession()`, `getToken` in `proxy.ts`) MUST NOT gain features. Signing JWTs in the frontend is forbidden (Auth owns issuance). Removal follows T1/T3/T4.
- `CON-6` — Auth model MUST be Auth-issued JWT in-memory only (never `localStorage`/`sessionStorage` — e-cert drift MUST NOT be copied) + the httpOnly refresh cookie the Consult API mints. Tenant, group names, claim structure, cookie attributes, and token lifetimes are defined by `auth-integration.md` v1.6 and `api-endpoints.md` v2.1 §4.0 and are cited, not restated here. Groups come only from the JWT `groups` claim; the `permissions` claim is for display gating only — never local roles, never a DB role lookup. Pipe-delimited `user.role` is legacy display vocabulary only.
- `CON-7` — API shapes MUST be bare `{data}` / `{error}`, flat, camelCase aggregates, no envelope, per `api-endpoints.md` v2.1. PDFs MUST ride binary Blob streams, never base64 JSON. Bulk ops stay synchronous (`{success, failed, errors}`), no polling.
- `CON-8` — Topology MUST follow the e-cert D2 mechanism under the `CONSULT-CUTOVER-001` DEC-2 decision (Option B, Vercel host): browser talks same-origin only (`/api/v1/*` BFF Route Handler, no `vercel.json`/`next.config.ts` rewrites); the handler forwards server-side to `CONSULT_API_URL` with method/query/body/auth-header forwarding and refresh/logout cookie scoping. Direct browser cross-origin calls are forbidden. Cookie flags are the Consult API's per `auth-integration.md` v1.6 §3 and MUST be verified at T1 E2E; if the refresh cookie does not ride same-origin, that is a backend spec gap, never a frontend workaround, and never grounds for relaxing the cookie. **No `AUTH_API_URL` target** — see `specs/services/api-client.md` DEC-2a.
- `CON-9` — The backend MUST NOT adapt to this frontend. Discrepancies MUST be filed as spec gaps upstream, never worked around here. Unexpected data is an upstream issue, never the proxy (BFF MUST NOT transform/validate/enrich/inject auth).
- `CON-10` — Cutover MUST be area-sequenced T1→T4 with each area independently revertible; no flag-day rewrite. Semester-lock (exactly 1 active) MUST be preserved or explicitly re-decided before its area ships. `CON-3` 403-lock UX MUST survive: backend JSON 403s surface as locked UI (`setLockedEndpoint`, `LockedTab`, `POST /api/audit/forbidden` telemetry), never redirects or blank pages.
- `CON-11` — Secrets MUST NOT ship to the client at Final: Supabase service-role KEY, `AUTH_SECRET` / `NEXTAUTH_SECRET`, Gmail app password, `JWT_SECRET` / `ENCRYPTION_KEY` MUST leave the deployed frontend env at T4. `NEXT_PUBLIC_*` MUST carry only public URLs/slug. New code MUST use the typed client, never raw `fetch()` (except a named legacy exception migrated when touched).
- `CON-12` — `organization_id` / tenant resolution MUST follow the e-cert target: resolve from JWT `tenant.slug` server-side; the client MUST NOT add new hardcoded org sends.

## Goal

### Decisions

- `DEC-1` (headline) — e-consultation IS a pure CSR frontend following e-cert D1–D3. `loa-consult-platform` IS the sole domain API. `loa-auth-platform` IS the sole auth issuer. Supabase direct access and internal NextAuth password handling are deprecated. Exceptions per `api-endpoints.md` §2.2 stay local: bug-reports, `POST /api/audit/forbidden` telemetry. Reports stay on Server-Component computation until Phase E (`endpoints-reports.md` v1.0, T2-reports last).
- `DEC-2` — Cutover order IS `CONSULT-CUTOVER-001` T0→T5: T0 topology record → T1 auth swap → T2 data-path swap by area (appointments/availability → academic/semesters → evaluations/periods/rubrics/results → admin-import link-reads → reports last) → T3 gate swap → T4 decommission → T5 E2E + rollback drill. No phase skipping, no big-bang delete.
- `DEC-3` — T1 auth swap IS the e-cert flow on consult hosts: SSO fragment handler (`#payload` → `history.replaceState` clear → `POST /api/v1/auth/callback`), in-memory token store, silent refresh on load/expiry (`POST /api/v1/auth/refresh`, cookie auto-sent), logout (`POST /api/v1/auth/logout` 204 + store clear + SSO redirect), client guard (token → refresh attempt → SSO redirect). Replaces `lib/auth.ts` authorize/JWT/session callbacks, `[...nextauth]`, `/login` Credentials form, `useSession()` → JWT context, `getToken` in `proxy.ts`. Callback failure clears partial state, never redirect-loops. Sign-in is `{AUTH}/sso/login` (never `/login` except admin-only), register `{AUTH}/sso/register`.
- `DEC-4` — T2 data-path swap IS Server-Component direct-controller imports → typed `src/lib/api/`-style modules over same-origin `/api/v1` → BFF → `CONSULT_API_URL` with `Authorization: Bearer <in-memory token>`, 401→refresh→retry once → else SSO, 403 = genuine lack (show locked UI, no retry), pagination per each endpoint's spec. Internal `route.ts` files stay live until their area parity gate passes, then thin out (proxy or delete per area note). Levels come from the JWT `permissions` claim; the backend's `jwt.auth` / `jwt.endpoint` enforces.
- `DEC-5` — Env contract IS the e-cert split on consult names: public `NEXT_PUBLIC_AUTH_URL` + `NEXT_PUBLIC_CONSULT_TENANT_SLUG=loa-consultation` + server-only `CONSULT_API_URL` / `AUTH_API_URL` (local `:9002`/`:8080`, Vercel fallbacks in code). Nothing reads Supabase/SMTP/`JWT_SECRET`/`ENCRYPTION_KEY` after T4. **`NEXT_PUBLIC_CONSULT_API_URL` REMOVED 2026-09-30** — it was a public variable holding the Consult API host, which CON-8 forbids the browser from knowing; the browser base is a same-origin constant (`EC-API-001` DEC-1/DEC-7). Owning specs updated in the same decision: `EC-PLAT-001` DEC-6 and the Consult `FRONTEND-INTEGRATION.md` env block.
- `DEC-6` — T3 gate swap IS deletion of the server gate (e-cert D1: no `proxy.ts` server JWT verify) replaced by client JWT-display gating + backend enforcement, preserving T3 semantics: longest-match + ADMIN-fallback + closed-by-default + semester-lock decision + 403-lock UX. `getUserAccess` (`group_access` + `DEFAULT_CONFIG`) and custom RBAC tables (`group_access`, `user_permissions`, `role`, `userrole`, `password_reset_tokens`) are deleted at T4 with auth columns (`passwordHash`, `tokenVersion`, `hasLoggedInBefore`) and deps (`next-auth`, `bcryptjs`).
- `DEC-7` — T5 E2E + rollback IS per-group matrices (ADMIN/DEAN/FACULTY/STUDENT per backend `auth-integration.md` §9) + report parity sampling + 403-lock drill; rollback = revert area to internal route + direct path (kept until T5 passes).

### Acceptance — Objective (deterministic, machine-checkable)

- `ACC-1` — T0 recorded: Option B under D2 mechanism (same-origin BFF, no rewrites); cookie flags verified at T1 E2E before any area ships.
- `ACC-2` — T1: login → `#payload` → callback 200 → in-memory token → refresh on expiry → logout 204, all via consult/auth hosts (no `[...nextauth]`, no Supabase auth call in Network tab).
- `ACC-3` — T2 per area: legacy page vs cutover page return identical aggregates on 2 sampled inputs (dept + date range); area `route.ts` thinned only after pasted gate. T2-reports: all 7 Laravel report payloads match legacy Server Component numbers on the sampled department + range.
- `ACC-4` — T3: ADMIN/DEAN/FACULTY/STUDENT matrices pass (allowed pages load, revoked APIs return JSON 403, locked tab shows, telemetry POST fires).
- `ACC-5` — T4: `bcryptjs`, `next-auth`, Supabase service-role key absent from production bundle/env; `AUTH_SECRET` / `NEXTAUTH_SECRET` unset; no `JWT_SECRET` / `ENCRYPTION_KEY` readable by frontend; `NEXT_PUBLIC_*` holds only URLs/slug.
- `ACC-6` — T5: rollback drill pasted (area reverted + re-cut in staging without data loss). Protected call without token → SSO; forged JWT → backend 401/403.
- `ACC-7` — Static: `rg` for `from "@supabase/supabase-js"`, `from "next-auth`, `from "bcryptjs"`, `SUPABASE_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, `localStorage.*token` in `app/` + `features/` + `lib/` + `components/` + `proxy.ts` returns zero hits (excluding archived notes) after Final.

### Acceptance — Subjective (human-judged, observable reviewer actions)

- `ACC-S1` — Reviewer confirms the headline reads unambiguously on the spec index and the authoritative route count is cited from `api-endpoints.md`, never from the local 143-entry catalog.
- `ACC-S2` — Reviewer confirms login-to-logout completes end-to-end with no error toast on all four roles, and a locked endpoint surfaces the locked tab (not blank/redirect) with a telemetry entry.
- `ACC-S3` — Reviewer confirms parity sampling (including reports) shows identical numbers on sampled inputs before each area's old path is thinned.

## Deliverables

- `D-1` — This file (`specs/cutover-headline.md`, ID `EC-CUTOVER-001`, Draft v0.2). No other file changes in this step (one-change rule).
- `D-2` (gated: only after this spec is Final) — Promote or supersede by ID: `specs/auth-integration.md`, `specs/endpoint-catalog.md` (whose 143 entries are drift against `api-endpoints.md` v2.1 — correct or archive), `specs/migration-checklist.md` into the normative shape + Final; add `specs/services/api-client.md`, `specs/services/auth.md`, `specs/services/platform.md` patterned on the e-cert trio.
  - **Status 2026-09-30:** the three service specs are **Final v1.0** (`EC-API-001` / `EC-AUTH-001` / `EC-PLAT-001` in `specs/services/`), plus `specs/decisions/{csr-spa,bff-passthrough,jwt-display-only}.md` (`EC-D1`/`EC-D2`/`EC-D3`) and `specs/decisions/{README,_template}.md`. `specs/README.md` index updated and the three legacy specs marked Superseded-by-ID. Both service-layer and headline specs then re-audited for reference discipline (v1.2 below) — the trio cites backend contracts by ID and no longer restates them. The BFF handler (D-3) remains the first code step.
- `D-3` (gated: only after `D-2`) — Per-phase implementation per `CONSULT-CUTOVER-001` D-1…D-6: T0 record, T1 auth (fragment handler, memory store, refresh, logout, guard, `useSession()` → JWT context), T2 area swaps (typed modules + BFF handlers + parity pastes, reports last), T3 gate (delete server gate, groups-claim matrices, semester-lock decision), T4 decommission (file/env/column/dep removal + bundle verify), T5 E2E + rollback drill.
  - **Sequencing correction 2026-09-30:** the BFF handler (`app/api/v1/[...path]/route.ts`) is not a T2 item — it is a prerequisite for every T2 area, and T1-a/T1-b landed a *direct* cross-origin client that CON-8 forbids. It therefore needs `EC-API-001` and `EC-AUTH-001` promoted to Final first, plus the `EC-PLAT-001` DEC-6 env decision. `specs/services/` Draft v0.1 written; promotion is the gate.
- `D-4` (gated: with `D-3`) — Vitest in `lib/__tests__/` (mocked adapters, one behavior per test: groups→role, `{data}`/`{error}` adapters, 401-refresh-retry-once, 403-lock, guard mapping 401/403/404/422, closed-by-default, pagination) + BFF routing tests (consult vs auth targets, header/cookie forwarding, 502, 400) + manual browser checks (SSO, role matrices, cookie flags at T1, parity sampling) that tests cannot prove.

## Glossary + References

- **e-consultation** — this repo; after cutover, a pure CSR frontend (e-cert D1 pattern).
- **loa-consult-platform** — Laravel 12 domain API (own repo/lifecycle); sole domain truth except §2.2 locals.
- **loa-auth-platform** — central auth issuer; sole identity truth.
- **BFF passthrough** — same-origin Route Handlers forwarding server-side with no transform (e-cert D2); unexpected data is upstream, never the proxy.
- **JWT-display-only** — client parses `permissions` / `tenant.slug` for gating display; API verifies signature/exp/tenant/level (e-cert D3).
- **T0→T5** — order owned by `CONSULT-CUTOVER-001`; this repo executes, never reorders.
- **Bare shapes** — `{data}` / `{error}`, flat, camelCase aggregates, no envelope, per `api-endpoints.md` v2.1.
- **Closed-by-default** — unknown `method+path` → 403 unless public allowlist.
- **Parity gate** — same-input legacy-vs-cutover match, pasted by USER before thinning.
- **Thin out** — area `route.ts` proxied or deleted after its gate.
- References (by ID, never pasted): `api-endpoints.md` v2.1, `endpoints-reports.md` v1.0, `frontend-transition.md` Final v1.1 (`CONSULT-CUTOVER-001`), `FRONTEND-INTEGRATION.md` v1.2, backend `auth-integration.md` v1.6 + `consult-readiness.md` v1.6, e-cert `AI-RULES.md` + `specs/services/api-client.md` + `specs/services/auth.md` + `specs/services/platform.md` + `specs/decisions/{csr-spa,bff-passthrough,jwt-display-only}.md` + `src/lib/api/client.ts` + `src/lib/auth/token-store.ts` (drift warning), local `specs/services/{api-client,auth,platform}.md` (`EC-API-001`/`EC-AUTH-001`/`EC-PLAT-001`) + `specs/decisions/{csr-spa,bff-passthrough,jwt-display-only}.md` (`EC-D1`/`EC-D2`/`EC-D3`) + superseded `specs/auth-integration.md` + `specs/endpoint-catalog.md` + `specs/migration-checklist.md` + `specs/README.md`, `AGENTS.md`.

## Document Control

- **Status:** Final v1.2 — user-approved 2026-09-30.
- **Created:** 2026-09-26 as Draft v0.1 → v0.2 → **Final v1.0** (surface-mapped from the e-consultation reads, no normative change). **v1.1: DEC-5 env contract — `NEXT_PUBLIC_CONSULT_API_URL` removed.** **v1.2: reference discipline — CON-2/CON-6/CON-8 and DEC-4 now cite backend contracts by ID instead of restating them, and the invented `AUTH_API_URL` BFF target is removed.**
- **Why v1.1:** that variable was public and held the Consult API host, which this spec's own CON-8 forbids the browser from knowing. Removing it changes a Final spec, so the two owning specs were corrected in the same decision: `EC-PLAT-001` DEC-6 → Final v1.0, and the Consult `FRONTEND-INTEGRATION.md` → v1.2.
- **Why v1.2:** this spec set itself the rule (CON-2, cite by ID, never duplicate) and then broke it — it restated the cookie name and flags, the group names, the level vocabulary, and a pagination scheme, and asserted an `AUTH_API_URL` BFF target copied from e-cert. The Consult API has no non-trio `auth/*` route, so that target pointed at nothing. The restatements are now citations; the target is gone, replaced by an open question recorded in `specs/services/api-client.md` DEC-2a. **No other clause changed** — T0→T5 order, the remaining CON/DEC/ACC text, and every deliverable scope are untouched.
- **Template note:** this file previously had no `Document Control` section and no `Layer` field, contrary to the `AGENTS.md` Spec Authoring Guideline. Both added; `appointments-flow.md` still needs the same treatment.
- **Next:** D-1–D-2 complete. D-3 implementation is gated on `EC-API-001` + `EC-AUTH-001` reaching Final and the BFF handler landing — it is a prerequisite for every T2 area, not a T2 item.
