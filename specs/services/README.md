# Services

Infrastructure specs for this frontend. Mirrors the e-cert `specs/services/` trio on consult names, hosts, cookie, and tenant — adapted to the Consult API's 104+5 surface, its `aces-*` group vocabulary, and the `loa_connect_refresh` cookie.

| Spec | ID | Status | Answers |
|------|----|--------|---------|
| [api-client.md](api-client.md) | `EC-API-001` | Draft v0.1 | How does the app call the Consult API for every data operation, replacing Supabase and Server Components? |
| [auth.md](auth.md) | `EC-AUTH-001` | Draft v0.1 | How does the app authenticate via Auth SSO and hold a session without owning identity? |
| [platform.md](platform.md) | `EC-PLAT-001` | Draft v0.1 | How is the app configured, deployed, and where do data and security live? |

## Scope boundary

These three cover plumbing only — transport, identity holding, configuration. Feature behavior is owned elsewhere: area-level flows by the `EC-*-001` specs in `specs/` (e.g. `appointments-flow.md` / `EC-APPT-001`), and endpoint behavior by the Consult backend, cited by ID and never duplicated.

## Status

All three are **Draft v0.1** (written 2026-09-30 as `EC-CUTOVER-001` D-2). Per `AGENTS.md` Working-with-Specs, no code lands against a Draft. Their promotion is the gate for the BFF handler, which does not exist yet.

## Relationship to the headline spec

`../cutover-headline.md` (`EC-CUTOVER-001`) owns the cutover order and the headline claims. These three specify the steady state each phase lands in. Where they overlap, the headline spec governs the *order* and these govern the *shape*; a contradiction between them is a spec gap to file, not something to resolve in code.
