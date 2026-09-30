# Decisions

Architectural decision records for the e-consultation frontend. Short + normative. Mirrors the e-cert `specs/decisions/` set on consult names, hosts, and cookie.

| # | ID | Decision | Status | One-line |
|---|----|----------|--------|----------|
| D1 | `EC-D1` | [CSR SPA, no SSR auth](csr-spa.md) | Accepted | In-memory token, no session cookie, no server actions, no server gate |
| D2 | `EC-D2` | [Same-origin BFF pass-through](bff-passthrough.md) | Accepted — **amended 2026-09-30** | Path+query forwarded server-side, zero logic in the proxy |
| D3 | `EC-D3` | [JWT parse-for-display only](jwt-display-only.md) | Accepted | Consult API enforces, UI gates |

Supporting: `../cutover-headline.md` (`EC-CUTOVER-001`) is the headline contract these three serve; its CON-8 is the normative topology statement, DEC-5 is the env split.

## Why these three

`EC-CUTOVER-001` DEC-1 adopts the e-cert CSR + BFF + JWT-display pattern wholesale. These ADRs restate that adoption in this repo's own terms so the e-cert reference is not load-bearing for day-to-day work, and so a future e-cert change cannot silently alter consult behavior.

## Amendments

- **D2, 2026-09-30** — two rows of the forwarding table were wrong and are corrected in place: `content-length` must **not** be forwarded (fetch decompresses the body, so the upstream length describes bytes the client never receives), and bodyless statuses need explicit handling (the Consult logout clears the refresh cookie on a `204`, and a body-carrying response there throws). Both were found by implementing D-1 and testing it. See the Consequences section of `bff-passthrough.md`; the matching acceptance is `EC-API-001` ACC-2 and ACC-4a.

An ADR is amended rather than superseded when the correction is to the record, not to the decision. A change that would alter the architecture — browser talking cross-origin, or the proxy acquiring logic — gets a new ADR instead.

## Template

New decisions: copy `_template.md` (Context → Decision → Consequences), keep to one page. Register in the table above. A decision that changes behavior in an existing Final spec MUST bump that spec too — the ADRs never override a Final spec; they record why it reads as it does.
