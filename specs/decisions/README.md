# Decisions

Architectural decision records for the e-consultation frontend. Short + normative. Mirrors the e-cert `specs/decisions/` set on consult names, hosts, and cookie.

| # | ID | Decision | Status | One-line |
|---|----|----------|--------|----------|
| D1 | `EC-D1` | [CSR SPA, no SSR auth](csr-spa.md) | Accepted | In-memory token, no session cookie, no server actions, no server gate |
| D2 | `EC-D2` | [Same-origin BFF pass-through](bff-passthrough.md) | Accepted | Path+query forwarded server-side, zero logic in the proxy |
| D3 | `EC-D3` | [JWT parse-for-display only](jwt-display-only.md) | Accepted | Consult API enforces, UI gates |

Supporting: `../cutover-headline.md` (`EC-CUTOVER-001`) is the headline contract these three serve; its CON-8 is the normative topology statement, DEC-5 is the env split.

## Why these three

`EC-CUTOVER-001` DEC-1 adopts the e-cert CSR + BFF + JWT-display pattern wholesale. These ADRs restate that adoption in this repo's own terms so the e-cert reference is not load-bearing for day-to-day work, and so a future e-cert change cannot silently alter consult behavior.

## Template

New decisions: copy `_template.md` (Context → Decision → Consequences), keep to one page. Register in the table above. A decision that changes behavior in an existing Final spec MUST bump that spec too — the ADRs never override a Final spec; they record why it reads as it does.
