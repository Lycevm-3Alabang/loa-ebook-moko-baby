---
skill: plan-fix
story: the evaluation coverage pages (app/admin/evaluations/coverage, app/dean/evaluations/coverage) carry the gaps that were addressed on the evaluation results pages — spec'd in specs/coverage-parity.md: the dean's coverage page is non-functional (400 on the list fetch, 403 on every subject detail), the dean's coverage scope is unscoped, the detail guard asks the teacher's home department while the list asks the section's, the dummy account inflates the coverage faculty counts, and the cross-semester condition is invisible
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A"}
workflow: A
decision: Option A - fix the dean's coverage surface (the list branch + the service scope) and align the rest with the results surfaces: the detail guard on the same resolver, the dummy out of the coverage counts, the same integrity warning, the Unresolved group's faculty count
status: done
pending:
---
# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-reuse | Use the last calibration (AAAAAA)? | A (use it) — 20261020-0330-session.md carried a full calibration for this repo |
| calibration | Output shape / explain / agent-explain / workflow / progress / teach | AAAAAA (reused) |
| plan-done | Is this plan done? | A (Done) |
| handoff | Run implement-fix with it? | A (Yes) |
| who-implements | Who implements | B (Code it) |
| slice-1 | C1a — the coverage service takes a department scope (Service layer) | applied — `getEvaluationStatus(periodId, search?, departmentId?)`; the subject rows and the department rows are both filtered; `npm test` green (55 files, 611 passed, 1 skipped) |
| slice-2 | C1b — the dean's route gains the list branch and passes its department (Route Handler layer) | applied — the period is now the required parameter, `facultySubjectId` selects the detail, the list is scoped to `dept.id`; the test that pinned the 400 became "returns 400 when the period is missing" + a new scoped-list case; `npm test` green (55 files, 612 passed, 1 skipped) |
| slice-3 | C2 — the detail guard resolves the subject's department with the list's resolver (Route Handler layer) | applied — the guard uses `findById` + `resolveSubjectDepartment` over `buildSubjectContext`; 404 for a missing assignment, 403 for another department's; the tests now mock a shape the repository can return, plus a section-vs-home-department case; `npm test` green (55 files, 614 passed, 1 skipped) |
| slice-4 | C3 — the dummy account is excluded from the coverage faculty counts (Service layer) | applied — the service identifies the placeholder by email from the faculty it already loads (no new query); its subjects stay in the coverage, its id is not counted as a teacher; the KPI is derived from the department rows so it corrects itself; `npm test` green (55 files, 615 passed, 1 skipped) |
| slice-5 | C4a — the attribution warning takes a department scope (Repository layer) | applied — `listAttributionWarnings(periodId, departmentId?)`; the scope filters the assignments before the counts and names are computed, and the department-less assignments fall outside every scope; unscoped behaviour unchanged; 2 tests added; `npm test` green (55 files, 617 passed, 1 skipped) |
| slice-6 | C4b-i — the integrity rule moves to a pure helper (lib + Repository layer) | applied — `classifyWarningAssignments(assignments, departmentOf, periodSemesterId, scope?)` in `lib/evaluation-utils.ts`; the repository adopts it with identical behaviour (its five existing warning cases are the proof); 3 unit tests added; `npm test` green (55 files, 620 passed, 1 skipped) |
| slice-7 | C4b-ii — the coverage service returns the warning, scoped (Service layer) | applied — the service calls `evaluationResultRepository.listAttributionWarnings(periodId, scope)` and returns it in its payload; the routes pass it through; a test asserts the scope reaches the repository; `npm test` green (55 files, 621 passed, 1 skipped) |
| slice-8 | C4c + C5 — the coverage page renders the warning and the Unresolved group counts its faculty (Client layer) | applied — `CoveragePage.tsx`: the payload type gains `warnings?`; the amber warning block (same wording as the results list) names the affected faculty; the Unresolved group's `facultyCount` is the distinct faculty in it instead of 0; 2 rendering tests added; `npm test` green (55 files, 623 passed, 1 skipped) |
| slice-9 | D3 (resolved by the user) — the dean always loads its own department, with no back link | applied — `CoveragePage` takes an optional `departmentId`: when set, the page renders that department's coverage and hides the department list and the "Back to departments" button; the dean's page resolves its department server-side and passes it; the shared component's `router.replace` now uses `usePathname()` instead of a hardcoded `/admin/evaluations/coverage` (which would have navigated the dean into the admin's page on a period change); 2 rendering tests added; `npm test` green (55 files, 625 passed, 1 skipped) |

## Pending

- none — all eight slices applied; the plan is complete.

## Decisions

**Option A** — fix the dean's coverage surface and align the rest with the results surfaces.
Approved 2026-10-20.

**Slices (order):**
- **C1** the dean's coverage list exists and is scoped — the list branch in
  `app/api/dean/evaluation-status/route.ts` (mirroring
  `app/api/admin/evaluation-status/route.ts:21-24`) and a department scope on
  `getEvaluationStatus` (`features/evaluations/evaluation-status.service.ts`).
  The scope lives in the **service**, so the route stays thin.
- **C2** the detail guard resolves the subject's department with
  `resolveSubjectDepartment` over a context from
  `evaluationResultRepository.buildSubjectContext` — the same resolver the list
  and the results pages use. The read it guards on must return `faculty_id` and
  `section_id` (today's `findByIdWithEmbeds` selects neither). "Not found" (404)
  and "not your department" (403) must be distinguishable.
- **C3** the dummy account is excluded from the coverage department faculty set
  and from the KPI — matching the results list's contract §3.4.
- **C4** the coverage service returns the results list's integrity warning
  (`listAttributionWarnings`), filtered by the viewer's scope.
- **C5** the "Unresolved" group reports the distinct faculty in it, not 0.

**Invariants (from repository.md):**
- *API routes stay thin* — app/api/ — **applies**: the department scope is a service parameter; the routes parse, delegate, return JSON.
- *proxy.ts is the access-enforcement point* — proxy.ts — **applies, untouched**: `/api/dean/evaluation-status` is already DEAN-granted (`lib/access.ts:13`); the proxy gates the path, the service scopes the department.
- *Supabase access through repositories wired by DI* — lib/repositories/factory.ts — **applies**: the new reads come from `evaluationResultRepository` / `facultySubjectRepository`; no direct `supabase` in a route or the service.
- *Double-click prevention via SubmitButton* — components/ui — **n/a**: no new action button.
- *Role is pipe-delimited, ADMIN > DEAN > FACULTY > STUDENT* — lib/utils/roles.ts — **applies**: the route's role check and its department scope.

**Layering order:** Route Handler → Service → Repository → Supabase. (This area has no separate
controller layer: the routes call the service directly, as the 20261017 coverage work did.)

**Gold paths read first:** `app/api/` (both `evaluation-status` routes + the `evaluation-results` routes
for the parity comparison), `features/` (the coverage service + component, the evaluation-results
repository/service), `lib/auth.ts` (the session's role), `lib/repositories/factory.ts` (the DI wiring).

**Proof command:** `npm test` (the repository.md Tests line). The affected suites:
`lib/__tests__/dean-evaluation-status-route.test.ts` (the 400-pinning test changes deliberately; the
"another department" test must mock a shape the repository can now return),
`lib/__tests__/evaluation-status-aggregate.test.ts` (the scope, the dummy, the warning), plus a parity
assertion that the coverage faculty count equals the results list's for the same department.

**Out of scope:** the faculty-grain "No responses" count on the coverage page (D2) · the coverage page's
visual design · the results surfaces · the student-facing evaluation flow · schema.

**Open (decided after the first render, D3):** whether the dean's coverage page opens directly on their
department, as their results page does.

## Scan

**Path — the dean's coverage list (broken)**
`app/dean/evaluations/coverage/page.tsx:4` → `features/evaluations/components/CoveragePage.tsx:93`
(`useApiGet(`${statusBase}?evaluationPeriodId=`)`, no `facultySubjectId`) →
`app/api/dean/evaluation-status/route.ts:19-20` → **400 "facultySubjectId is required"**.

**Path — the dean's coverage detail (broken)**
`CoveragePage.tsx:217` (raw fetch with `facultySubjectId`) →
`app/api/dean/evaluation-status/route.ts:26-29` →
`facultySubjectRepository.findByIdWithEmbeds` (`features/admin-data/faculty-subject.repository.ts:62-77` —
the select carries `id, subject_id, sections!inner(...)` and **no faculty, no `faculty_id`, no `section_id`**) →
`fs.faculty?.departmentId` is `undefined` → `undefined !== dept.id` → **403 for every subject**.

**Path — the list scope**
`app/api/admin/evaluation-status/route.ts:21-24` →
`features/evaluations/evaluation-status.service.ts:230-280` (a row per department) + `:206-227` (the
subject rows) → **every department reaches the dean**.

**Path — the attribution rule (already correct)**
`evaluation-status.service.ts:155-156` (`deptOf` → `resolveSubjectDepartment`) →
`lib/evaluation-utils.ts:397` → `features/evaluation-results/evaluation-results.repository.ts:102`
(`buildSubjectContext`).

**Path — the dummy in the counts**
`evaluation-status.service.ts:253` (`deptFacultyIds.add(m.faculty_id)`) → `CoveragePage.tsx:167` (the KPI sum)
→ the results list excludes it (`listDepartmentRosters`).

**Path — the integrity warning**
the results list: `app/api/admin/evaluation-results/route.ts` → `listAttributionWarnings`; the coverage
page: **absent**.

**Proof**
- `lib/__tests__/dean-evaluation-status-route.test.ts:42-47` — **pins the 400** ("returns 400 when params missing").
- `lib/__tests__/dean-evaluation-status-route.test.ts:49-57` — mocks `findByIdWithEmbeds` as
  `{ id: "fs1", faculty: { departmentId: "dept-2" } }`; the repository's select never returns a `faculty`,
  so the suite verifies a shape that cannot exist and the real route 403s everything.
- `lib/__tests__/evaluation-status-aggregate.test.ts` — the service aggregate + the 3 attribution cases.
- `lib/__tests__/admin-evaluation-results-route.test.ts` — the results list's warning rows.
- **none** for the dean's scope, the dummy count on the coverage side, or the coverage warning.
- Command: `npm test`

**Teach**
The dean's coverage route was authored in the 20261017-1749 story as a thin delegating route with
**server-side scoping** — "dean page renders the same component scoped to his department", "Privacy:
server-side scoping (dean own dept)" (repeated in 20261017-1846). Only the detail branch was ever
written, so the list branch and the scope never landed: a route implemented to a narrower spec than it
was given.
The detail guard compares the wrong identity because the *list* was re-attributed to the section's
department (S1.6) while the guard still asks the teacher's home department — the two halves of one page
now disagree.
The suite is green over a broken route because the route's test mocks a repository shape the repository
cannot produce.
One alternative: retire the dean's coverage page (the admin's page covers the audit need) — cheaper, but it
leaves a sidebar entry that 400s.

**Lens**
- API routes stay thin (parse, call controller, return JSON) — app/api/ — **applies**: the department
  scope belongs in the service, not in the route; the route keeps parsing, delegating, returning JSON.
- proxy.ts is the access-enforcement point (JWT + DB role + tokenVersion) — proxy.ts — **applies**:
  `/api/dean/evaluation-status` is already granted to DEAN in `lib/access.ts:13`; the proxy gates the path,
  the department scope is the route/service's job (per the 20261017 story). proxy.ts is untouched.
- All Supabase access goes through repositories wired by DI — lib/repositories/factory.ts — **applies**: the
  new reads (the assignment's section, the warning) come from `evaluationResultRepository` /
  `facultySubjectRepository` through the factory; no direct `supabase` in the route or the service.
- Double-click prevention via SubmitButton — components/ui — **n/a**: no new action button; the dean's page
  renders the shared coverage component and its buttons are pre-existing.
- Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT — lib/utils/roles.ts — **applies**:
  the dean's route's role check and its department scope.
- Gold paths read first: `app/api/` (both evaluation-status routes + the results routes for the parity
  comparison), `features/` (the coverage service + component, the evaluation-results repository/service),
  `lib/auth.ts` (the session's role), `lib/repositories/factory.ts` (the DI wiring).

## Plan

**Goal.** The coverage surfaces carry the same fixes the results surfaces got: one attribution rule, one
scope rule, one roster rule. The dean's coverage page works and is scoped to its department.

**C1 — the dean's coverage list exists and is scoped**
- `app/api/dean/evaluation-status/route.ts`: add the list branch, mirroring
  `app/api/admin/evaluation-status/route.ts:21-24`. The period is required; `facultySubjectId` selects
  the detail, its absence the list. The dean's department scopes the list.
- `features/evaluations/evaluation-status.service.ts`: `getEvaluationStatus` takes an optional department
  scope and filters the department rows and the subject rows by it. The admin passes nothing — its
  behaviour is unchanged.
- The scope is a **service** parameter; the route stays thin (parse → delegate → JSON).

**C2 — the detail guard asks the same question as the list**
- `app/api/dean/evaluation-status/route.ts`: resolve the subject's department with
  `resolveSubjectDepartment` over a context from `evaluationResultRepository.buildSubjectContext` — the
  same resolver the list and the results pages use.
- `features/admin-data/faculty-subject.repository.ts`: the read the guard uses must return `faculty_id`
  and `section_id`; `findByIdWithEmbeds` selects neither today. Widen that select rather than add a
  method.
- "Not found" (404) and "not your department" (403) become distinguishable.

**C3 — the dummy is not a person**
- `features/evaluations/evaluation-status.service.ts`: exclude the dummy account from the department
  faculty set (today `deptFacultyIds.add(m.faculty_id)` counts it) and from the KPI, matching the
  results list's contract §3.4. The same department then reports the same "Faculties" number on both
  pages.

**C4 — the same integrity warning**
- The coverage service returns the results list's warning (`listAttributionWarnings`), filtered by the
  viewer's scope: the admin sees all, the dean sees only their department's entries — another
  department's faculty names must not reach a dean's warning.

**C5 — the "Unresolved" group counts its faculty**
- `features/evaluations/components/CoveragePage.tsx`: the group reports the distinct faculty in it
  rather than the hardcoded 0.

**Proof — `npm test`**
- `lib/__tests__/dean-evaluation-status-route.test.ts`: the test that pins the 400 becomes "returns the
  dean's department coverage"; the "another department" test must mock a shape the repository can now
  return; a new case for the section-based scope (a CS section taught by a Math-homed faculty is the CS
  dean's).
- `lib/__tests__/evaluation-status-aggregate.test.ts`: the scope filter, the dummy exclusion, the warning.
- A parity assertion: the coverage faculty count equals the results list's for the same department.

**Risks.** The 400-pinning test changes deliberately — that is the point. The dean's page has never
rendered, so D3 (open directly on their department, as their results page does?) waits for the first
render. The warning adds a query to a page that already polls every 30 seconds.

**Out of scope.** The faculty-grain "No responses" count on the coverage page (D2) · the coverage page's
visual design · the results surfaces · the student-facing evaluation flow · schema.

**Open (D3 — RESOLVED 2026-10-20).** The dean always loads their own department, with no "Back to departments" link —
answered by the user after the slices landed; implemented as slice 9.
