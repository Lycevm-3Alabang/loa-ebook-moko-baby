# EC-CUTOVER-001 — Frontend Consumes loa-consult-platform Web API; Auth Delegated to loa-auth-platform

| Field | Value |
|-------|-------|
| ID | EC-CUTOVER-001 |
| Title | Frontend Consumes loa-consult-platform Web API; Auth Delegated to loa-auth-platform |
| Status | Final v1.0 |
| Owner | TBD (awaiting user confirmation) |
| Version | 1.0 |
| Scope | Headline cutover statement: e-consultation becomes a pure frontend following the proven `e-cert` CSR + BFF pattern; `loa-consult-platform` is the sole domain API (104+5 per `api-endpoints.md` v2.1, reports per `endpoints-reports.md` v1.0 Phase E last); `loa-auth-platform` is the sole auth issuer. Phased T0→T5 per `frontend-transition.md` Final v1.0 (`CONSULT-CUTOVER-001`). Exceptions stay local per backend §2.2: bug-reports, forbidden telemetry. |
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

- `api-endpoints.md` v2.1 Final — flat 104+5 ground truth (route.ts scan 112 files / ~142 combos / 118 migrating); base `https://aces-api.lyceumalabang.edu.ph/api/v1`; level-gated `read`/`write`/`admin`; §2.2 out-of-scope: self-hosted auth deleted, access-config/user-permissions replaced by Auth catalog/grants (no Laravel equivalent), reports deferred Phase E (no REST routes — Server Components compute directly until then), bug-reports + `POST /api/audit/forbidden` stay in Next.js.
- `FRONTEND-INTEGRATION.md` v1.0 Final — handoff: fragment handler, memory store, refresh, logout, guard, `groups`-claim gating, 403-lock (`setLockedEndpoint` + `LockedTab` + telemetry) preserved; topology OPEN (A rewrite recommended, B direct+CORS fallback); env `NEXT_PUBLIC_CONSULT_API_URL` / `NEXT_PUBLIC_AUTH_URL` / `NEXT_PUBLIC_CONSULT_TENANT_SLUG=loa-consultation`.
- `frontend-transition.md` Final v1.0 (`CONSULT-CUTOVER-001`) — T0 topology → T1 auth → T2 data areas (reports last vs `endpoints-reports.md` v1.0) → T3 gate → T4 decommission → T5 E2E+rollback; DECIDED 2026-09-26 Option B direct+CORS (cert-actual), Vercel host (not Netlify), cookie flags (`Secure`/`SameSite`, path `/api/v1/auth`) verified at T1 E2E; CON-4 area-sequenced revertible, CON-3 403-lock UX survives, CON-5 secrets leave client.

Why this spec exists: bind the headline (pure frontend; platform API; auth issuer) to the e-cert-proven transport plus the backend Final contracts, resolving the topology wording before any Final promotion.

## Constraints

- `CON-1` — Backend canonical name MUST be `loa-consult-platform`. Spellings `loa-consultation-platform` / `loa-consultation-app` MUST NOT appear in normative text.
- `CON-2` — Endpoint behavior MUST be cited by backend spec ID only, never duplicated: `api-endpoints.md` v2.1 (flat 104+5, bare shapes, levels), `endpoints-reports.md` v1.0 (7 report families, Phase E last), `frontend-transition.md` Final v1.0 (`CONSULT-CUTOVER-001`, T0→T5 order this repo executes), `FRONTEND-INTEGRATION.md` v1.0 (handoff checklist). Ground truth counts are 104+5; `specs/endpoint-catalog.md` 143 is recorded drift and MUST NOT be cited as truth.
- `CON-3` — On this Draft, code MUST NOT change. Promotion to Final REQUIRES explicit user yes with no normative change, or a revised Draft first.
- `CON-4` — Direct Supabase calls (`lib/supabase.ts`, `lib/db.ts`, `lib/repositories/factory.ts`, `features/*/*.repository.ts`, `supabase-schema.sql`) MUST NOT gain new call sites. Existing sites are deprecated, removed only in T0→T5 order. e-cert anti-pattern applies: direct Supabase/PostgREST is forbidden in new code.
- `CON-5` — Internal auth (`next-auth`, Credentials, `bcryptjs`, `passwordHash` / `tokenVersion` / `hasLoggedInBefore`, `[...nextauth]`, `activate` / `forgot-password` / `change-password` routes, `useSession()`, `getToken` in `proxy.ts`) MUST NOT gain features. Signing JWTs in the frontend is forbidden (Auth owns issuance). Removal follows T1/T3/T4.
- `CON-6` — Auth model MUST be Auth-issued JWT in-memory only (never `localStorage`/`sessionStorage` — e-cert drift MUST NOT be copied) + httpOnly refresh cookie (`loa_connect_refresh`, path `/api/v1/auth`); tenant `loa-consultation`; groups from JWT `groups` claim (`aces-admin` / `aces-dean` / `aces-faculty` / `aces-user`) + `permissions` `<level>:<path>` for display gating only — never local roles, never DB role lookup. Pipe-delimited `user.role` is legacy display vocabulary only.
- `CON-7` — API shapes MUST be bare `{data}` / `{error}`, flat, camelCase aggregates, no envelope, per `api-endpoints.md` v2.1. PDFs MUST ride binary Blob streams, never base64 JSON. Bulk ops stay synchronous (`{success, failed, errors}`), no polling.
- `CON-8` — Topology MUST follow the e-cert D2 mechanism under the `CONSULT-CUTOVER-001` DEC-2 decision (Option B decided 2026-09-26, Vercel host): browser talks same-origin only (`/api/v1/*` BFF Route Handlers, no `vercel.json`/`next.config.ts` rewrites); handlers forward server-side to `CONSULT_API_URL` / `AUTH_API_URL` with method/query/body/auth-header forwarding and refresh/logout cookie scoping. Direct browser cross-origin calls are forbidden (CORS + cookie scope). Cookie flags MUST be verified at T1 E2E; if the refresh cookie does not ride, revisit SameSite=None or fall back to Option A rewrite — as a backend spec gap, never a frontend workaround.
- `CON-9` — The backend MUST NOT adapt to this frontend. Discrepancies MUST be filed as spec gaps upstream, never worked around here. Unexpected data is an upstream issue, never the proxy (BFF MUST NOT transform/validate/enrich/inject auth).
- `CON-10` — Cutover MUST be area-sequenced T1→T4 with each area independently revertible; no flag-day rewrite. Semester-lock (exactly 1 active) MUST be preserved or explicitly re-decided before its area ships. `CON-3` 403-lock UX MUST survive: backend JSON 403s surface as locked UI (`setLockedEndpoint`, `LockedTab`, `POST /api/audit/forbidden` telemetry), never redirects or blank pages.
- `CON-11` — Secrets MUST NOT ship to the client at Final: Supabase service-role KEY, `AUTH_SECRET` / `NEXTAUTH_SECRET`, Gmail app password, `JWT_SECRET` / `ENCRYPTION_KEY` MUST leave the deployed frontend env at T4. `NEXT_PUBLIC_*` MUST carry only public URLs/slug. New code MUST use the typed client, never raw `fetch()` (except a named legacy exception migrated when touched).
- `CON-12` — `organization_id` / tenant resolution MUST follow the e-cert target: resolve from JWT `tenant.slug` server-side; the client MUST NOT add new hardcoded org sends.

## Goal

### Decisions

- `DEC-1` (headline) — e-consultation IS a pure CSR frontend following e-cert D1–D3. `loa-consult-platform` IS the sole domain API. `loa-auth-platform` IS the sole auth issuer. Supabase direct access and internal NextAuth password handling are deprecated. Exceptions per `api-endpoints.md` §2.2 stay local: bug-reports, `POST /api/audit/forbidden` telemetry. Reports stay on Server-Component computation until Phase E (`endpoints-reports.md` v1.0, T2-reports last).
- `DEC-2` — Cutover order IS `CONSULT-CUTOVER-001` T0→T5: T0 topology record → T1 auth swap → T2 data-path swap by area (appointments/availability → academic/semesters → evaluations/periods/rubrics/results → admin-import link-reads → reports last) → T3 gate swap → T4 decommission → T5 E2E + rollback drill. No phase skipping, no big-bang delete.
- `DEC-3` — T1 auth swap IS the e-cert flow on consult hosts: SSO fragment handler (`#payload` → `history.replaceState` clear → `POST /api/v1/auth/callback`), in-memory token store, silent refresh on load/expiry (`POST /api/v1/auth/refresh`, cookie auto-sent), logout (`POST /api/v1/auth/logout` 204 + store clear + SSO redirect), client guard (token → refresh attempt → SSO redirect). Replaces `lib/auth.ts` authorize/JWT/session callbacks, `[...nextauth]`, `/login` Credentials form, `useSession()` → JWT context, `getToken` in `proxy.ts`. Callback failure clears partial state, never redirect-loops. Sign-in is `{AUTH}/sso/login` (never `/login` except admin-only), register `{AUTH}/sso/register`.
- `DEC-4` — T2 data-path swap IS Server-Component direct-controller imports → typed `src/lib/api/`-style modules over same-origin `/api/v1` → BFF → `CONSULT_API_URL` with `Authorization: Bearer <in-memory token>`, 401→refresh→retry once → else SSO, 403 = genuine lack (show locked UI, no retry), pagination `limit`/`offset` + `meta.has_more`. Internal `route.ts` files stay live until their area parity gate passes, then thin out (proxy or delete per area note). Levels are `read` / `write` / `admin` from the JWT `permissions` claim; backend `jwt.auth` / `jwt.endpoint` enforces.
- `DEC-5` — Env contract IS the e-cert split on consult names: public `NEXT_PUBLIC_CONSULT_API_URL` / `NEXT_PUBLIC_AUTH_URL` / `NEXT_PUBLIC_CONSULT_TENANT_SLUG=loa-consultation` + server-only `CONSULT_API_URL` / `AUTH_API_URL` (local `:9002`/`:8080`, Vercel fallbacks in code). Nothing reads Supabase/SMTP/`JWT_SECRET`/`ENCRYPTION_KEY` after T4.
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

- `ACC-S1` — Reviewer confirms the headline reads unambiguously on the spec index and the 104+5 (not 143) count is cited everywhere.
- `ACC-S2` — Reviewer confirms login-to-logout completes end-to-end with no error toast on all four roles, and a locked endpoint surfaces the locked tab (not blank/redirect) with a telemetry entry.
- `ACC-S3` — Reviewer confirms parity sampling (including reports) shows identical numbers on sampled inputs before each area's old path is thinned.

## Deliverables

- `D-1` — This file (`specs/cutover-headline.md`, ID `EC-CUTOVER-001`, Draft v0.2). No other file changes in this step (one-change rule).
- `D-2` (gated: only after this spec is Final) — Promote or supersede by ID: `specs/auth-integration.md`, `specs/endpoint-catalog.md` (correct 143 → 104+5 or archive), `specs/migration-checklist.md` into the normative shape + Final; add `specs/services/api-client.md`, `specs/services/auth.md`, `specs/services/platform.md` mirrors of the e-cert trio on consult names/hosts/cookie.
- `D-3` (gated: only after `D-2`) — Per-phase implementation per `CONSULT-CUTOVER-001` D-1…D-6: T0 record, T1 auth (fragment handler, memory store, refresh, logout, guard, `useSession()` → JWT context), T2 area swaps (typed modules + BFF handlers + parity pastes, reports last), T3 gate (delete server gate, groups-claim matrices, semester-lock decision), T4 decommission (file/env/column/dep removal + bundle verify), T5 E2E + rollback drill.
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
- References (by ID, never pasted): `api-endpoints.md` v2.1, `endpoints-reports.md` v1.0, `frontend-transition.md` Final v1.0 (`CONSULT-CUTOVER-001`), `FRONTEND-INTEGRATION.md` v1.0, backend `auth-integration.md` v1.5 + `consult-readiness.md`, e-cert `AI-RULES.md` + `specs/services/api-client.md` + `specs/services/auth.md` + `specs/services/platform.md` + `specs/decisions/{csr-spa,bff-passthrough,jwt-display-only}.md` + `src/lib/api/client.ts` + `src/lib/auth/token-store.ts` (drift warning), local `specs/auth-integration.md` + `specs/endpoint-catalog.md` + `specs/migration-checklist.md` + `specs/README.md`, `AGENTS.md`.
