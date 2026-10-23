# Evaluation results cache UX handover

Updated: 2026-10-24

## Status

The explicit-refresh behavior is specified but not implemented. Start with [the cache spec](../specs/evaluation-results-cache.md), under “Requested change — explicit refresh for the admin results list,” and the corresponding open item in [TODO.md](../TODO.md).

Scope: `app/admin/evaluations/results/page.tsx` department figures only. The figures must survive a same-tab browser reload from client-persistent cache; there must be no timed/background refresh; the existing Refresh action is the only bypass and must update cached values on success. The banner must make cached/stale status and the need to refresh manually prominent.

Acceptance criteria and failure behavior are in the spec. Do not change the live drill-down, report, department-list metadata, or attribution-warning cache contracts.
