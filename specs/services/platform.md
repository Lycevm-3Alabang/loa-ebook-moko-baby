# Platform (env, deploy, data flow)

## Service Specification

| Field | Value |
|-------|-------|
| ID | `EC-PLAT-001` |
| Title | Runtime topology, env contract, and trust boundaries |
| Status | Final v1.0 (user-approved 2026-09-30; DEC-6 settled — `NEXT_PUBLIC_CONSULT_API_URL` removed) |
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
- **CON-2** — The Consult API host MUST be **server-only**. It MUST NOT appear in any client-reachable module, in a `NEXT_PUBLIC_*` variable, or in the production bundle. The Auth Platform host is likewise not a browser target (and is not a BFF target at all yet — see `../services/api-client.md` DEC-2a).
- **CON-3** — There MUST NOT be a `vercel.json` rewrite or a `next.config.ts` `rewrites()` for `/api/v1/*`. All proxying lives in the BFF Route Handler. (A rewrite remains a documented fallback if the BFF is ever rejected; adding one while the handler exists would create two proxy paths.)
- **CON-4** — Secrets MUST NOT be shipped to the client. After T4 the deployed env MUST contain no `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, `GMAIL_APP_PASSWORD`, `JWT_SECRET`, or `ENCRYPTION_KEY` (`EC-CUTOVER-001` CON-11, ACC-5). `NEXT_PUBLIC_*` MUST carry public URLs and the tenant slug only.
- **CON-5** — The refresh cookie MUST stay same-origin and MUST be passed through the BFF's `set-cookie` untouched so it lands on this app's own domain. Its attributes are the Consult API's, per `auth-integration.md` v1.6 §3; this spec adds no `SameSite` relaxation and no CORS allowance on the Consult host.
- **CON-6** — BFF targets MUST resolve from server-only env, with production-host fallbacks in code for Vercel where those variables are unset (mirrors e-cert handler lines 3-6).
- **CON-7** — The backend MUST NOT adapt to this app's environment. Any discrepancy MUST be filed as a backend spec gap, never absorbed by an env workaround here.
- **CON-8** — Storage map is fixed: access token in memory; refresh credential in the Consult API's httpOnly cookie, forwarded same-origin; identity, groups, permissions, and tenant in the JWT claims that `auth-integration.md` v1.6 §4 defines; all domain data on the Consult platform. This app MUST NOT store passwords, DB credentials, SMTP credentials, or signing keys at any phase.
- **CON-9** — The endpoints `api-endpoints.md` v2.1 §2.2 leaves to this app — the bug-report routes and the forbidden-endpoint telemetry POST — remain local and are not proxied to the Consult API. Which paths those are is defined there, not here.
- **CON-10** — Trust boundary: the client is never trusted. Tampering (edited JWT, swapped tenant, replayed callback, forged level) MUST be defeated server-side by the Consult API's middleware, per `auth-integration.md` v1.6 §4. No client check may substitute for a server 403 (`../decisions/jwt-display-only.md`).

## Goal

### Decisions

- **DEC-1** — Topology is `Browser → this app (Vercel) → /api/v1/[...path] Route Handler (serverless) → Consult API / Auth API`, with the SSO redirect to `{NEXT_PUBLIC_AUTH_URL}/sso/login`. This is the only sanctioned data path.
- **DEC-2** — The refresh cookie is set by the Consult API and passed through the BFF `set-cookie` untouched, and therefore lands on this app's own domain. No session cookie of our own, no access-token cookie. Attributes per `auth-integration.md` v1.6 §3.
- **DEC-3** — Env contract after the BFF lands, split public vs server-only:

  ```env
  # Public — URLs and tenant slug only
  NEXT_PUBLIC_AUTH_URL=<Auth Platform base URL>
  NEXT_PUBLIC_CONSULT_TENANT_SLUG=<tenant slug per auth-integration.md v1.6>

  # Server-only — never shipped to the browser (local .env; unset on Vercel → code fallbacks)
  CONSULT_API_URL=<Consult API base URL>
  ```

  The port values and production hostnames are those the Consult `docker-compose-spec.md` v1.1 / `LOCAL-DEV-RUNBOOK.md` assign to the Consult and Auth containers; they are not chosen here. `AUTH_API_URL` is deliberately absent — `../services/api-client.md` DEC-2a records that the backend has not decided whether this app needs an Auth API target.
- **DEC-4** — `NEXT_PUBLIC_CONSULT_API_URL` is removed from client code and unset in the deployed env. Rationale: keeping a public variable whose only correct value is the app's own origin is a trap, and its current value (the Laravel host) is the one the BFF exists to prevent.
- **DEC-5** — `.env.example` is restored as a committed, secret-free template (placeholders only) by narrowing the `.gitignore` `.env*` rule to exclude it, and the real `.env` stays ignored. The Gmail app password and Supabase service-role key currently sitting in `.env.example` MUST be treated as exposed and rotated — a file that is both git-ignored and secret-bearing is the worst of both states: untracked for developers, unprotected for whoever's credentials those are.
- **DEC-6** — **`NEXT_PUBLIC_CONSULT_API_URL` is removed. DECIDED 2026-09-30 (user: `proceed`), option (a) — e-cert-mirroring.** `EC-CUTOVER-001` DEC-5 previously listed it as a public variable and this spec's Context recorded the conflict: its only architecturally legal value is this app's own origin, which makes it a trap, and its current value (the Laravel host) is exactly what the BFF exists to prevent. Removing it is a normative change to a Final spec, so the owning specs were updated in the same decision: `EC-CUTOVER-001` → **Final v1.1** (DEC-5 env contract restated) and the Consult `FRONTEND-INTEGRATION.md` → **v1.2** (env block no longer publishes the API host). The browser base is a same-origin constant per `EC-API-001` DEC-1/DEC-7; there is no configuration in which the browser can be pointed at a different API host. Rejected alternative (b) — keeping the name redefined as own-origin — was rejected because a variable whose only correct value is the app's own origin invites re-pointing it at the API host during a debugging session, which is the failure this decision removes.
- **DEC-7** — The public base for browser calls is a same-origin relative path constant, not an env var. There is no configuration in which the browser can be pointed at a different API host.
- **DEC-8** — `502` from the BFF means the upstream platform is unreachable and MUST be distinguishable in any error surface from an application error. The handler never masks a backend defect as a transport failure.

### Acceptance — Objective (deterministic, machine-checkable)

- **ACC-1** — Every browser data/auth request targets a relative `/api/v1/*` path; no request URL contains an upstream hostname.
- **ACC-2** — `CONSULT_API_URL` resolves correctly when set (the local port the Consult `docker-compose-spec.md` v1.1 assigns) and falls back to the production host when unset (Vercel), asserted with a mocked `fetch` per target.
- **ACC-3** — No `vercel.json` rewrite and no `next.config.ts` `rewrites()` entry for `/api/v1/*` exists; `vercel.json` remains `{}` or absent.
- **ACC-4** — The refresh cookie observed in the browser is scoped to this app's domain with the attributes `auth-integration.md` v1.6 §3 specifies (user-run browser check).
- **ACC-5** — Deployed env contains none of the secret variable names this repo still used before T4 (see `../cutover-headline.md` DEC-6 and `EC-AUTH-001` D-5 for the list); and no `NEXT_PUBLIC_*` value contains a secret (user-run env listing + a bundle grep).
- **ACC-6** — `.env.example` is tracked in git and contains no real credential; `.env` remains untracked and ignored.
- **ACC-7** — A `502` from the BFF is surfaced as an upstream-unreachable condition, distinct from a `4xx` application error, in the error path.
- **ACC-8** — The §2.2 local endpoints are NOT proxied to the Consult API; they keep working on the local Supabase path.
- **ACC-9** — The production bundle contains no Consult API hostname outside the BFF handler's server-only code path. (No Auth-host assertion: there is no Auth target — `../services/api-client.md` DEC-2a.)

### Acceptance — Subjective (human-judged, observable reviewer actions)

- **ACC-S1** — Reviewer opens the deployed app's Network tab, signs in, and confirms all API traffic is same-origin with the refresh cookie riding it.
- **ACC-S2** — Reviewer stops the Consult API and confirms the app reports an upstream-unreachable condition rather than a blank page or a silent hang.
- **ACC-10** — Full Vitest suite green (user-run: `npx vitest run`).

### Deliverables

- **D-1** — `.env.example` rewritten as a committed, secret-free template; `.gitignore` narrowed so `.env.example` is tracked while `.env` stays ignored (DEC-5, ACC-6). Independent of the BFF and can land first. **Requires rotating the Gmail app password and Supabase service-role key that currently appear in that file.**
- **D-2** — BFF target resolution wired to `CONSULT_API_URL` with a production fallback (DEC-3, ACC-2) — same deliverable as `EC-API-001` D-1, tracked here for the env half. No Auth target (DEC-2a).
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
| §2.2 exceptions | Endpoints `api-endpoints.md` v2.1 §2.2 assigns to this app — local, not proxied (CON-9) |
| 502 | Upstream unreachable — a transport failure, distinct from an application error |
| Rotation | Replacing a credential that has appeared in a file; `DEC-5` requires it for the two credentials that were in `.env.example` |

### Reference discipline

Backend behavior is cited by ID, never restated — `EC-CUTOVER-001` CON-2. This spec owns the *frontend's* configuration: which variables are public, which are server-only, what leaves the env at T4, and what the trust boundary is. It does not restate the Consult API's hostnames, ports, cookie attributes, or endpoint inventory — those come from the Consult `docker-compose-spec.md` v1.1, `auth-integration.md` v1.6, and `api-endpoints.md` v2.1, and it carries placeholders where a value belongs to them.

### References

- `../cutover-headline.md` Final v1.1 (`EC-CUTOVER-001`) — CON-8/CON-11, DEC-2/DEC-5, ACC-5
- `../decisions/{csr-spa,bff-passthrough,jwt-display-only}.md` (`EC-D1`/`EC-D2`/`EC-D3`)
- `../services/{api-client,auth}.md` (`EC-API-001`, `EC-AUTH-001`)
- Consult backend, cited by ID: `docker-compose-spec.md` v1.1 (container ports, host assignment) · `FRONTEND-INTEGRATION.md` v1.2 (env block — source of the DEC-6 conflict) · `auth-integration.md` v1.6 §2 (topology), §3 (cookie attributes), §4 (server-side validation) · `api-endpoints.md` v2.1 §2.2 (local exceptions)
- e-cert, **reference only — the mechanism, not the contract**: `specs/services/platform.md` · `src/app/api/v1/[...path]/route.ts` (env-fallback pattern) · `src/lib/api/client.ts` (its unread legacy API-URL variable is a precedent for the mistake DEC-6 removed). Nothing in e-cert's spec text is normative here.
- This repo's `AGENTS.md` (Working-with-Specs, one-change rule) + root `AGENTS.md` (Rule 0)

## Document Control

- **Status:** Final v1.0 — user-approved 2026-09-30. DEC-6 settled as option (a); `NEXT_PUBLIC_CONSULT_API_URL` removed from this app, from `EC-CUTOVER-001` (→ v1.1), and from the Consult `FRONTEND-INTEGRATION.md` (→ v1.2) in the same decision.
- **Created:** 2026-09-30 as Draft v0.1, `EC-CUTOVER-001` D-2 (`specs/services/platform.md` e-cert mirror on consult names/hosts/cookie). Promoted to Final v1.0 the same day with no normative change beyond settling the recorded DEC-6.
- **Supersedes:** nothing. Complements `EC-API-001` (transport) and `EC-AUTH-001` (session).
- **Landed at D-1 already:** `.env.example` rewritten as a committed placeholder-only template and `.gitignore` narrowed so the template is tracked while `.env` stays ignored. **The two credentials that were in that file still need rotating by the user** — Gmail app password and Supabase service-role key. The file no longer contains them; the live credentials did not change.
- **Next:** D-2 (BFF target resolution, shared with `EC-API-001` D-1) → D-3 (`NEXT_PUBLIC_CONSULT_API_URL` removal from `lib/jwt-context.tsx` once the BFF lands) → D-4 (env/bundle/cookie verification).
