# LOA Connect Hub — Specs

**Version:** 2.0
**Status:** Mixed (per spec — see index)
**Last Updated:** 2026-09-30

---

# Purpose

Specifications for the e-consultation app. The cutover contract is `cutover-headline.md` (`EC-CUTOVER-001`); the service layer that contract sequences is `services/`; architectural decisions are `decisions/`. Endpoint behavior is owned by the Consult backend and cited by ID, never duplicated here. Specs must be Final before code is written (per `AGENTS.md` Working-with-Specs and the root `loa-apache-server-apps` convention).

---

# Spec Index

| Spec | ID | Status | Purpose |
|------|----|--------|---------|
| [cutover-headline.md](cutover-headline.md) | `EC-CUTOVER-001` | **Final v1.0** | Headline cutover: pure frontend consuming the Consult API + Auth SSO. Owns T0→T5 order, CON-1…CON-12, DEC-1…DEC-7, ACC gates |
| [appointments-flow.md](appointments-flow.md) | `EC-APPT-001` | **Final v1.0** | T2 first area: book / meetings / availability / admin-consultations |
| [services/api-client.md](services/api-client.md) | `EC-API-001` | Draft v0.1 | Typed client + BFF transport (same-origin, 401 ladder, 403-lock, pagination) |
| [services/auth.md](services/auth.md) | `EC-AUTH-001` | Draft v0.1 | SSO fragment flow, in-memory token, claim-based display, guard, refresh, logout |
| [services/platform.md](services/platform.md) | `EC-PLAT-001` | Draft v0.1 | Topology, env contract, cookie scope, trust boundaries, T4 removals |
| [decisions/](decisions/README.md) | `EC-D1`…`EC-D3` | Accepted | CSR SPA · same-origin BFF pass-through · JWT parse-for-display only |
| [auth-integration.md](auth-integration.md) | — | **Superseded by ID** | Legacy 2026-08-24 shape. SSO contract now `services/auth.md`; backend truth is `auth-integration.md` v1.6 in the Consult repo. Promote or archive per `EC-CUTOVER-001` D-2 |
| [endpoint-catalog.md](endpoint-catalog.md) | — | **Superseded by ID (drifted)** | 143 entries. **Not truth** — the Consult API's normative surface is 104+5 (`api-endpoints.md` v2.1). Correct or archive per `EC-CUTOVER-001` D-2 |
| [migration-checklist.md](migration-checklist.md) | — | **Superseded by ID** | Legacy 2026-08-24 cross-repo task list. Sequencing now owned by `EC-CUTOVER-001` DEC-2. Promote or archive per `EC-CUTOVER-001` D-2 |

---

# Cross-References

| This repo | Consult backend (`D:\loa\loa-apache-server-apps\assemblies\loa-consult-platform\`) |
|-----------|-------------------------------------------------------------|
| `cutover-headline.md` (`EC-CUTOVER-001`) | `frontend-transition.md` Final v1.1 (T0→T5 the backend owns) · `FRONTEND-INTEGRATION.md` v1.1 (handoff checklist) |
| `services/api-client.md` (`EC-API-001`) | `api-endpoints.md` v2.1 (104+5, bare shapes, levels, §2.2 exceptions) · `endpoints-*.md` per area |
| `services/auth.md` (`EC-AUTH-001`) | `auth-integration.md` v1.6 §3 (trio contracts, cookie) · §4 (JWT claims) · §9 (group matrices) |
| `services/platform.md` (`EC-PLAT-001`) | `FRONTEND-INTEGRATION.md` v1.1 env block · `docker-compose-spec.md` v1.1 (`:9002` / `:8080`) |
| `decisions/bff-passthrough.md` (`EC-D2`) | `auth-integration.md` v1.6 §2 (Option B = same-origin BFF passthrough) |

The backend repo has its own lifecycle. Discrepancies are filed as backend spec gaps there, never worked around here.

---

# Convention

- Each spec carries ID / Title / Status / Owner / Version / Scope / Non-goals, RFC 2119 terminology, Context, `CON-*`, `DEC-*`, `ACC-*` split objective/subjective, `D-*`, Glossary + References — per `AGENTS.md` Spec Authoring Guideline
- **Draft** = under discussion, code forbidden. **Final** = user-approved, code may be written to match it. **Accepted** (decisions) = architectural position, load-bearing for specs that cite it
- Changes to Final specs require a version bump and re-approval
- A decision that changes behavior in a Final spec MUST bump that spec too; ADRs never override a Final spec

