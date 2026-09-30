# Services

Infrastructure specs for this frontend, patterned on the e-cert `specs/services/` trio. They adopt e-cert's **mechanism** (CSR, same-origin BFF passthrough, claims-for-display) and reference e-cert's **contract** — the Consult specs by ID, never restated. Hostnames, ports, cookie attributes, endpoint shapes, group names, and claim structure are cited, not copied; see the Reference discipline note in each spec.

| Spec | ID | Status | Answers |
|------|----|--------|---------|
| [api-client.md](api-client.md) | `EC-API-001` | **Final v1.1** | How does the app call the Consult API for every data operation, replacing Supabase and Server Components? |
| [auth.md](auth.md) | `EC-AUTH-001` | **Final v1.1** | How does the app authenticate via Auth SSO and hold a session without owning identity? |
| [platform.md](platform.md) | `EC-PLAT-001` | **Final v1.0** | How is the app configured, deployed, and where do data and security live? |

## Scope boundary

These three cover plumbing only — transport, identity holding, configuration. Feature behavior is owned elsewhere: area-level flows by the `EC-*-001` specs in `specs/` (e.g. `appointments-flow.md` / `EC-APPT-001`), and endpoint behavior by the Consult backend, cited by ID and never duplicated.

## Status

All three reached **Final** on 2026-09-30 (written that day as `EC-CUTOVER-001` D-2 Draft v0.1; v1.0 with no normative change, then v1.1 after implementing D-1 exposed four behaviors that had no constraint — see each spec's Document Control).

**D-1 (the BFF handler, `app/api/v1/[...path]/route.ts`) is built and awaiting the user's gates** — `npm run lint`, `npx tsc --noEmit`, `npx vitest run lib/__tests__/bff-proxy-route.test.ts lib/__tests__/middleware.test.ts`. D-2 (typed `apiFetch`, retire the `window.fetch` patch), D-3 (area re-points) and D-4 (the `EC-AUTH-001` half of the tests) follow.

## Relationship to the headline spec

`../cutover-headline.md` (`EC-CUTOVER-001`) owns the cutover order and the headline claims. These three specify the steady state each phase lands in. Where they overlap, the headline spec governs the *order* and these govern the *shape*; a contradiction between them is a spec gap to file, not something to resolve in code.
