# Platform (env, deploy, data flow)

## Service Specification

| Field | Value |
|-------|-------|
| ID | `EC-PLAT-001` |
| Title | Runtime topology, env contract, and trust boundaries |
| Status | Draft v0.1 (written 2026-09-30 as `EC-CUTOVER-001` D-2; NOT Final — promotion gates deploy/env changes) |
| Owner | TBD (awaiting user confirmation) |
| Version | 0.1 Draft |
| Scope | Browser-to-backend topology, BFF target resolution, env contract, cookie scope, storage map, trust boundaries, what leaves this app at T4 |
| Non-goals | Consult DB schema · Auth internals · feature behavior · endpoint behavior (cited by ID) · CI/CD specifics beyond the env contract |
| Layer | `services` (runtime topology) |

## RFC 2119 terminology

MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL are as described in RFC 2119.

## Context

What exists today in `D:\loa\e-consultation` (verified 2026-09-30):

- **Topology.** Next.js on Vercel. `vercel.json` is `{}`; `next.config.ts` has no `rewrites()` (2 redirects only); `netlify.toml` exists but the deploy target is Vercel (`EC-CUTOVER-001` DEC-2). Browser → this app → 112 internal `app/api/**/route.ts` handlers → `features/*/*.repository.ts` → Supabase.
- **Env.** `.env.example` currently carries `AUTH_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_URL`, `DB_PROVIDER`, `SSO_FEATURE_FLAG`, `EMAIL_FEATURE_FLAG`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. `.env.example` and `.env` are both matched by the `.env*` rule in `.gitignore`, so neither is tracked — which means the file doubles as a real secret store rather than a template, and the repo has no committed template for a new developer to copy.
- **No BFF.** `app/api/v1/` does not exist. The Consult API host is currently reachable from browser code via `NEXT_PUBLIC_CONSULT_API_URL` (`lib/jwt-context.tsx`), which `../decisions/bff-passthrough.md` forbids.
- **Secrets in browser-reachable modules today:** `lib/supabase.ts` uses the service-role key; `lib/services/email.ts` uses the Gmail password; `lib/auth.ts` uses the NextAuth secret. All three are on the T4 removal list.

Two things this spec must settle, one of which is **not mine to settle**:

1. The env contract after the BFF lands — which variables are public, which are server-only, and what happens to the existing Supabase/SMTP/auth entries.
2. **OPEN — the fate of `NEXT_PUBLIC_CONSULT_API_URL`.** `EC-CUTOVER-001` DEC-5 keeps it public, and the Consult `FRONTEND-INTEGRATION.md` env block sets it to the Laravel host. But under the BFF (DEC-1/CON-8, `../decisions/bff-passthrough.md`) the browser MUST NOT know that host, so its current value is exactly what the architecture forbids. e-cert's resolution is to point the public base URL at the app's own origin and to mark the old API-URL variable as legacy/unread. That change contradicts a Final spec, so it needs a user decision — see DEC-6 and ACC-9.

Proven reference: e-cert `specs/services/platform.md` §3-§5, `specs/decisions/bff-passthrough.md`, `specs/services/vercel-deploy.md`.

## Constraints

- **CON-1** — The browser MUST talk to one origin: this app. No browser request may target the Consult or Auth host directly (`../decisions/bff-passthrough.md`, `EC-CUTOVER-001` CON-8).
- **CON-2** — The Consult API host and the Auth API host MUST be **server-only**. They MUST NOT appear in any client-reachable module, in `NEXT_PUBLIC_*` variables, or in the production bundle.
- **CON-3** — There MUST NOT be a `vercel.json` rewrite or a `next.config.ts` `rewrites()` for `/api/v1/*`. All proxying lives in the BFF Route Handler. (A rewrite remains a documented fallback if the BFF is ever rejected; adding one while the handler exists would create two proxy paths.)
- **CON-4** — Secrets MUST NOT be shipped to the client. After T4 the deployed env MUST contain no `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, `GMAIL_APP_PASSWORD`, `JWT_SECRET`, or `ENCRYPTION_KEY` (`EC-CUTOVER-001` CON-11, ACC-5). `NEXT_PUBLIC_*` MUST carry public URLs and the tenant slug only.
- **CON-5** — The refresh cookie MUST stay same-origin, `Path=/api/v1/auth`, `SameSite=Lax`, passed through the BFF's `set-cookie` untouched so it lands on this app's own domain. No `SameSite=None` relaxation and no CORS allowance on the Laravel host.
- **CON-6** — BFF targets MUST resolve from server-only env, with production-host fallbacks in code for Vercel where those variables are unset (mirrors e-cert handler lines 3-6).
- **CON-7** — The backend MUST NOT adapt to this app's environment. Any discrepancy MUST be filed as a backend spec gap, never absorbed by an env workaround here.
- **CON-8** — Storage map is fixed: access token in memory (15 min) · refresh in the `loa_connect_refresh` httpOnly cookie (7 days) · identity/groups/permissions/tenant in JWT claims · all domain data on the Consult platform (MySQL `loa_consult`). This app MUST NOT store passwords, DB credentials, SMTP credentials, or signing keys at any phase.
- **CON-9** — The two `api-endpoints.md` §2.2 exceptions — `app/api/bug-reports/**` and `POST /api/audit/forbidden` — remain local routes backed by this app's own Supabase access until T4, and are not proxied to the Consult API.
- **CON-10** — Trust boundary: the client is never trusted. Tampering (edited JWT, swapped tenant, replayed callback, forged level) MUST be defeated server-side by the Consult API's `jwt.auth`/`jwt.endpoint`. No client check may substitute for a server 403 (`../decisions/jwt-display-only.md`).

## Goal

### Decisions

- **DEC-1** — Topology is `Browser → this app (Vercel) → /api/v1/[...path] Route Handler (serverless) → Consult API / Auth API`, with the SSO redirect to `{NEXT_PUBLIC_AUTH_URL}/sso/login`. This is the only sanctioned data path.
- **DEC-2** — Cookie `loa_connect_refresh` is set by the Consult API, passed through the BFF `set-cookie` untouched, and therefore lands on this app's own domain. No session cookie of our own, no access-token cookie.
- **DEC-3** — Env contract after the BFF lands, split public vs server-only:

  ```env
  # Public — URLs and slug only
  NEXT_PUBLIC_AUTH_URL=https://auth.lyceumalabang.edu.ph
  NEXT_PUBLIC_CONSULT_TENANT_SLUG=loa-consultation

  # Server-only — never shipped to the browser (local .env; unset on Vercel → code fallbacks)
  CONSULT_API_URL=http://localhost:9002
  AUTH_API_URL=http://localhost:8080
  ```

  `localhost:9002` is the Consult API's root-stack port per the Consult `LOCAL-DEV-RUNBOOK.md` / `docker-compose-spec.md`; `localhost:8080` is the Auth API's. Neither is required in Vercel: the handler falls back to `https://aces-api.lyceumalabang.edu.ph` and `https://auth.lyceumalabang.edu.ph`.
- **DEC-4** — `NEXT_PUBLIC_CONSULT_API_URL` is removed from client code and unset in the deployed env. Rationale: keeping a public variable whose only correct value is the app's own origin is a trap, and its current value (the Laravel host) is the one the BFF exists to prevent.
- **DEC-5** — `.env.example` is restored as a committed, secret-free template (placeholders only) by narrowing the `.gitignore` `.env*` rule to exclude it, and the real `.env` stays ignored. The Gmail app password and Supabase service-role key currently sitting in `.env.example` MUST be treated as exposed and rotated — a file that is both git-ignored and secret-bearing is the worst of both states: untracked for developers, unprotected for whoever's credentials those are.
- **DEC-6** — **OPEN — requires a user decision before this spec can be promoted to Final.** `EC-CUTOVER-001` DEC-5 and the Consult `FRONTEND-INTEGRATION.md` both list `NEXT_PUBLIC_CONSULT_API_URL` as a public variable pointing at the Laravel host. DEC-4 would remove it, which is a normative change to a Final spec. Options: (a) remove it and update `EC-CUTOVER-001` DEC-5 + `FRONTEND-INTEGRATION.md` (e-cert-mirroring, recommended); (b) keep the name, redefine it as this app's own origin, update the backend doc's env block; (c) keep it as the Laravel host, which CON-1/CON-2 forbid. Until resolved, ACC-9 asserts only the invariant — no upstream host in the bundle — not a variable name.
- **DEC-7** — The public base for browser calls is a same-origin relative path constant, not an env var. There is no configuration in which the browser can be pointed at a different API host.
- **DEC-8** — `502` from the BFF means the upstream platform is unreachable and MUST be distinguishable in any error surface from an application error. The handler never masks a backend defect as a transport failure.

### Acceptance — Objective (deterministic, machine-checkable)

- **ACC-1** — Every browser data/auth request targets a relative `/api/v1/*` path; no request URL contains an upstream hostname.
- **ACC-2** — `CONSULT_API_URL`/`AUTH_API_URL` resolve correctly when set (local `:9002`/`:8080`) and fall back to the production hosts when unset (Vercel), asserted with a mocked `fetch` per target.
- **ACC-3** — No `vercel.json` rewrite and no `next.config.ts` `rewrites()` entry for `/api/v1/*` exists; `vercel.json` remains `{}` or absent.
- **ACC-4** — The refresh cookie observed in the browser is scoped to this app's domain with `Path=/api/v1/auth` and `SameSite=Lax` (user-run browser check; `SameSite=None` is a failure).
- **ACC-5** — Deployed env contains none of `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, `GMAIL_APP_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`; and no `NEXT_PUBLIC_*` value contains a secret (user-run env listing + a bundle grep for each name).
- **ACC-6** — `.env.example` is tracked in git and contains no real credential; `.env` remains untracked and ignored.
- **ACC-7** — A `502` from the BFF is surfaced as an upstream-unreachable condition, distinct from a `4xx` application error, in the error path.
- **ACC-8** — `app/api/bug-reports/**` and `POST /api/audit/forbidden` are NOT proxied to the Consult API; they keep working on the local Supabase path.
- **ACC-9** — The production bundle contains no `aces-api.lyceumalabang.edu.ph` and no `auth.lyceumalabang.edu.ph` string outside the BFF handler's server-only code path. (Name-specific assertions wait on DEC-6.)
- **ACC-10** — Full Vitest suite green (user-run: `npx vitest run`).

### Acceptance — Subjective (human-judged, observable reviewer actions)

- **ACC-S1** — Reviewer opens the deployed app's Network tab, signs in, and confirms all API traffic is same-origin with the refresh cookie riding it.
- **ACC-S2** — Reviewer stops the upstream API and confirms the app reports an upstream-unreachable condition rather than a blank page or a silent hang.

### Deliverables

- **D-1** — `.env.example` rewritten as a committed, secret-free template; `.gitignore` narrowed so `.env.example` is tracked while `.env` stays ignored (DEC-5, ACC-6). Independent of the BFF and can land first. **Requires rotating the Gmail app password and Supabase service-role key that currently appear in that file.**
- **D-2** — BFF target resolution wired to `CONSULT_API_URL`/`AUTH_API_URL` with production fallbacks (DEC-3, ACC-2) — same deliverable as `EC-API-001` D-1, tracked here for the env half.
- **D-3** — `NEXT_PUBLIC_CONSULT_API_URL` removed from `lib/jwt-context.tsx` and from the deployed env once DEC-6 is decided and `EC-API-001` D-1/D-2 land (DEC-4).
- **D-4** — Verification pass: env listing, bundle grep, cookie inspection (ACC-4, ACC-5, ACC-9), recorded in this repo's `TODO.md`; ACC-S1/ACC-S2 as user-run manual checks.
- **D-5** — DEC-6 decision filed and applied to the owning specs (`EC-CUTOVER-001` DEC-5 and, if needed, the Consult `FRONTEND-INTEGRATION.md` env block) before this spec is promoted to Final.

### Glossary

| Term | Meaning |
|------|---------|
| Same-origin | The browser addresses only this app; upstream hosts are contacted server-side |
| Server-only env | Variables readable in Route Handlers / server code and never shipped to the browser |
| Code fallback | A production host hardcoded in server code, used when the env var is unset (Vercel) |
| Trust boundary | The Consult API; the client is never trusted (CON-10) |
| §2.2 exceptions | `bug-reports` + `POST /api/audit/forbidden` — local to this app, not proxied |
| 502 | Upstream unreachable — a transport failure, distinct from an application error |
| Rotation | Replacing a credential that has appeared in a file; `DEC-5` requires it for the two credentials now in `.env.example` |

### References

- `../cutover-headline.md` Final v1.0 (`EC-CUTOVER-001`) — CON-8/CON-11, DEC-2/DEC-5, ACC-5
- `../decisions/{csr-spa,bff-passthrough,jwt-display-only}.md` (`EC-D1`/`EC-D2`/`EC-D3`)
- `../services/{api-client,auth}.md` (`EC-API-001`, `EC-AUTH-001`)
- Consult backend, cited by ID: `FRONTEND-INTEGRATION.md` v1.1 (env block — source of the DEC-6 conflict) · `auth-integration.md` v1.6 §2 (topology) and §3 (cookie flags) · `api-endpoints.md` v2.1 §2.2 (exceptions) · `docker-compose-spec.md` v1.1 (`:9002` Consult, `:8080` Auth)
- e-cert, reference only: `specs/services/platform.md` · `specs/decisions/bff-passthrough.md` · `src/app/api/v1/[...path]/route.ts:3-6` (env fallback) · `src/lib/api/client.ts` (unread legacy `NEXT_PUBLIC_CERT_API_URL`)
- This repo's `AGENTS.md` (Working-with-Specs, one-change rule) + root `AGENTS.md` (Rule 0)

## Document Control

- **Status:** Draft v0.1 — 2026-09-30. **Cannot be promoted to Final until DEC-6 is decided** (it would otherwise change a Final spec's env contract without approval).
- **Created:** 2026-09-30 as `EC-CUTOVER-001` D-2 (`specs/services/platform.md` e-cert mirror on consult names/hosts/cookie).
- **Note:** D-1 is independent of the cutover and unblocked by DEC-6 — the credential-hygiene problem exists today and is not created by the migration.
- **Next:** decide DEC-6 → apply D-1 (rotate credentials, committed template) → promote to Final → D-2 onward with `EC-API-001`.
