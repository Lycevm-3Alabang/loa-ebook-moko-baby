# Services

Infrastructure specs for this frontend, patterned on the e-cert `specs/services/` trio. They adopt e-cert's **mechanism** (CSR, same-origin BFF passthrough, claims-for-display) and reference e-cert's **contract** — the Consult specs by ID, never restated. Hostnames, ports, cookie attributes, endpoint shapes, group names, and claim structure are cited, not copied; see the Reference discipline note in each spec.

| Spec | ID | Status | Answers |
|------|----|--------|---------|
| [api-client.md](api-client.md) | `EC-API-001` | **Final v1.0** | How does the app call the Consult API for every data operation, replacing Supabase and Server Components? |
| [auth.md](auth.md) | `EC-AUTH-001` | **Final v1.0** | How does the app authenticate via Auth SSO and hold a session without owning identity? |
| [platform.md](platform.md) | `EC-PLAT-001` | **Final v1.0** | How is the app configured, deployed, and where do data and security live? |

## Scope boundary

These three cover plumbing only — transport, identity holding, configuration. Feature behavior is owned elsewhere: area-level flows by the `EC-*-001` specs in `specs/` (e.g. `appointments-flow.md` / `EC-APPT-001`), and endpoint behavior by the Consult backend, cited by ID and never duplicated.

## Status

All three reached **Final v1.0** on 2026-09-30 (written that day as `EC-CUTOVER-001` D-2 Draft v0.1, promoted with no normative change beyond settling the recorded `EC-PLAT-001` DEC-6). The code gate is therefore open for `EC-API-001` D-1 — the BFF handler — which is the prerequisite for every T2 area.

## Relationship to the headline spec

`../cutover-headline.md` (`EC-CUTOVER-001`) owns the cutover order and the headline claims. These three specify the steady state each phase lands in. Where they overlap, the headline spec governs the *order* and these govern the *shape*; a contradiction between them is a spec gap to file, not something to resolve in code.
