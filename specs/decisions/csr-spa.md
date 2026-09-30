# D1 — CSR SPA, no SSR auth

**ID:** `EC-D1`
**Status:** Accepted
**Date:** 2026-09-30
**Spec:** `../cutover-headline.md` (`EC-CUTOVER-001`) DEC-1; `../services/api-client.md` CON-1; `../services/auth.md` CON-1

## Context

This app began as a server-rendered Next.js application with self-hosted identity: `lib/auth.ts` (NextAuth Credentials + `bcryptjs` against a Supabase `userRepository`), a `proxy.ts` gate doing `getToken()` + a `page-api-map` lookup, Server Components importing `features/**` controllers directly against Supabase, 112 internal `app/api/**/route.ts` handlers, and 21 Supabase repositories behind `lib/repositories/factory.ts`.

Identity and data now belong to two other platforms. `loa-consult-platform` (Laravel 12; surface per `api-endpoints.md` v2.1) is the sole domain API; `loa-auth-platform` is the sole auth issuer and mints the httpOnly refresh cookie the browser cannot read.

Keeping SSR auth would mean the frontend holding a second identity source, a second session mechanism, and a server-side JWT verification path — three things that exist only because the app used to own identity. And every page that reads data would keep a Supabase path alongside an API path, so each data area would carry two code paths through the entire cutover.

## Decision

This app is a client-side SPA. In-memory access token; no httpOnly session cookie of our own; no server-side JWT verification; no server actions; `proxy.ts` performs no JWT verify and no role lookup (its server gate is retired at T3, its page-access map at T3/T4 — see `../cutover-headline.md` DEC-6).

The access token lives in JS memory only. The refresh credential is the httpOnly cookie the Consult API mints, riding same-origin through the BFF (`auth-integration.md` v1.6 §3 owns its attributes). Identity, groups, and permissions are JWT claims, never a database read.

The one per-area exception to "client-side" is the T0→T5 sequence itself: Server Components and internal `route.ts` handlers stay live area by area until that area's parity gate passes, then thin out. This is a migration schedule, not an architectural allowance — no area may re-introduce a Supabase call site (CON-4 of `EC-CUTOVER-001`).

## Consequences

- Four public env vars, zero secrets. The frontend never sees a password, a signing key, or a service-role key.
- The refresh cookie stays same-origin, so the attributes the Consult API sets remain valid — no relaxation needed.
- One test layer can cover the API surface with a mocked transport; no need for a second Supabase-mocking layer.
- Data fetching moves into client components. The `react-hooks/set-state-in-effect` rule in `AGENTS.md` Lessons Learned §4 applies to every new fetch effect, and the `Promise.resolve().then(...)` deferral is the established workaround.
- Revisiting this would mean re-introducing server-side identity, which `EC-CUTOVER-001` CON-5 forbids ("Signing JWTs in the frontend is forbidden"; internal auth MUST NOT gain features).
