# Evaluation coverage cards + department drill-down handover

Updated: 2026-10-26

## Status

Complete for this session. The owner gate (`npx tsc --noEmit` → `npm run lint` →
`npx vitest run`) has **not** been run since the 2026-10-26 card changes — run
it before committing. The 2026-10-24 drill-down work's gate was green
(863 passed, 1 skipped).

## What shipped — 2026-10-26 (coverage headline cards)

Replaced the eight KPI cards with a **4-tile strip** (Departments evaluated
`X/Y`, Faculty members, Students, Response rate) and a service-side pooled
union. Planned in
`C:\Users\ninal\.config\opencode\skills\plan-fix\runs\20261025-2030-29634.md`
(option C), three slices:

- `features/evaluations/components/CoveragePage.tsx` — strip with `title`
  tooltips carrying the grain definitions; the two population tiles hide when
  a stale v2 snapshot lacks `totals`; "—" at zero students.
- `features/evaluations/evaluation-status.service.ts` — additive `totals`
  `{ students, participated, disputed, inProgress, notParticipated }` pooled by
  `Set` merges from the existing `SubjectAgg` sets; scoped by `departmentId`
  only (dean parity free), independent of `q`.
- Tests: `evaluation-status-aggregate.test.ts` (pooled-totals describe) and
  `coverage-page-freshness.test.tsx` (strip + stale-snapshot describe).

**Grain contract (durable):** `classifyRoster` buckets are per subject; a
student may sit in different buckets across subjects. Department rows are
per-department people unions — **summing them double-counts students whose
subjects span departments** (sum says 4, pool says 3). School totals come only
from the service's pooled union, never from a UI-side sum.

## What shipped — 2026-10-24 (drill-down, prior session)

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

## Not to redo

- Do not reintroduce an id-only tally or a versionless coverage cache key;
  both caused the zero-row/stale-snapshot defect.
- The removed faculty-card strip was redundant with the subject table's
  columns. Do not restore it.
- Do not compute headline population tiles by summing `DepartmentRow` counts
  (UI-side `reduce` of dept unions) — that is the double-count this session
  removed. Only the service's pooled unions are school-true.
- Do not make the headline strip react to the search box; search scopes the
  table and drill-down only (named behavior change, owner-approved).
- No coverage-cache version bump was made for `totals` (tolerate-absent). Do
  not bump `v2` for additive fields.

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

## Required evaluation comments — 2026-10-24

Student evaluation submission now requires a non-blank comment. The feedback
step shows a warning while the comment is empty; the final submit button stays
disabled and explains how to proceed. The submit handler returns to feedback
if invoked without a comment, and `POST /api/evaluations/[id]/submit` enforces
the requirement server-side with HTTP 400. Focused route tests cover missing,
blank, and valid comments. VS Code diagnostics report no errors in changed
files; tests have not been run.
