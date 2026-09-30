# D3 — JWT parse-for-display only

**ID:** `EC-D3`
**Status:** Accepted
**Date:** 2026-09-30
**Spec:** `../cutover-headline.md` (`EC-CUTOVER-001`) CON-6, DEC-6; `../services/auth.md` CON-4; `../services/api-client.md` CON-5

## Context

The UI has to show a name, decide which tabs to render, and pick a label for a role. All of that is available in the token it already holds, so there is no reason to read a database — which also means there is no reason to trust a database read for access control, and no reason for the frontend to hold anything that could be mistaken for one.

The risk is that a display convenience quietly becomes a boundary: a client-side role check that looks authoritative but is trivially bypassed by editing a token.

The JWT is opaque to anyone without `JWT_SECRET`. This app MUST NOT have `JWT_SECRET` or `ENCRYPTION_KEY` in any environment (`../cutover-headline.md` CON-11), so it can decode claims but can never mint a valid one.

## Decision

The client parses JWT claims for **display and UI gating only**. What the claims are, what they contain, and how they are validated are defined by `auth-integration.md` v1.6 §4 and `api-endpoints.md` v2.1 §4.0; this decision adds nothing to them. Display labels are derived from the group and permission claims, and tenant display from the tenant claim. The Consult API is the only security boundary.

No client-side check may stand in for a server 403: when the API denies, the UI shows the locked state, and it does not fall back to a permissive local default.

## Consequences

- Forged, edited, expired, or wrong-tenant tokens fail closed at the API, which is where the check has to be to mean anything.
- No signing key in the frontend env, and nothing to leak if the bundle is inspected.
- Gating display can be slightly optimistic between token issuance and revocation — a revoked user's tabs may render until a call is denied. That is the accepted trade; the locked-state path (`EC-CUTOVER-001` CON-3) is what makes it safe, so it MUST survive the cutover rather than being optimized away.
- Levels for the UI come from the permissions claim, not from a locally configured matrix. The legacy access-config merge in `lib/access.ts` is display scaffolding retired at T3/T4, not a fallback to keep.
