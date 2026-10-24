# Evaluation coverage department drill-down handover

Updated: 2026-10-24

## Status

Complete. No open work.

## What shipped

- Coverage cache/manual refresh, per
  [evaluation-coverage-faculty-cache.md](../specs/evaluation-coverage-faculty-cache.md)
  and
  [cached-data-refresh-banner.md](../specs/cached-data-refresh-banner.md).
- Department drill-down: faculty search, surname sorting, result counts,
  visible-card expand/collapse, no selection or visibility controls, and
  missing aggregates surfaced, per
  [evaluation-coverage-department-drilldown.md](../specs/evaluation-coverage-department-drilldown.md).
- Zero-row parity: the card and Details share
  `listRosterByFacultySubjectIds` and `classifyRoster`; the coverage cache key
  is `v2`; `evaluation-status-parity.test.ts` covers parity and
  duplicate/conflicting rows. Commit `6ab5fd7`.
- The four-tile faculty-card status strip (Participated / Not participated /
  In-progress / Disputed) was removed; the header (`N subjects`,
  `N students`, completion pill) and the subject table remain. Commits
  `53f1901` and `6c21500`.

## Gate

`npx tsc --noEmit`, `npm run lint`, and `npx vitest run` are green
(863 passed, 1 skipped).

## Not to redo

- Do not reintroduce an id-only tally or a versionless coverage cache key;
  both caused the zero-row/stale-snapshot defect.
- The removed strip was redundant with the subject table's columns. Do not
  restore it.

## Seeded admin disable safeguard — 2026-10-24

The seeded admin can now be disabled only when a different enabled,
non-deleted account has the ADMIN role. The admin users page disables the
action and explains the requirement when no backup admin exists; the
`PATCH /api/admin/users` route enforces the same rule server-side and returns
HTTP 409 if it is not met. Re-enabling remains allowed. Focused route tests
cover allowing/disallowing the transition, including a disabled backup admin.
VS Code diagnostics report no errors in changed files; tests have not been
run. Run
`npx vitest run lib/__tests__/admin-users-seeded-admin.test.ts` in the owner
validation workflow.
