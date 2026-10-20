---
skill: plan-fix
story: the admin results main page (app/admin/evaluations/results/) resolves a subject's department with the section-first rule, so a teacher's results land in the department that owns the section instead of the teacher's own department - and the department names it prints can fall through to "Unknown". Both surfaces must use the ONE faculty-driven rule the coverage page already uses
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A"}
workflow: A
decision: Option A - one shared faculty-driven resolver; the results path (list, drill-down, "no responses" roster) and the coverage service both call it; the department names stop falling through to "Unknown"
status: done
pending:
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-reuse | Use the last calibration (AAAAAA)? | A (use it) - 20261020-0400-coverage-parity.md carried a full calibration for this repo |
| approach | Which surfaces move to the coverage rule? | "just the department fetch and display logic" |
| fetch-scope | Which of the page's two department fetches move? | A - both (the evaluated results AND the "no responses" roster) |
| disclosure | Should the drill-down rows say whose section it is? | "focus now on that small change of correcting the departments displayed ... do not overthink, over-engineer" - no new marker |
| plan-done | Is this plan done? | A (Done) |
| handoff | Run implement-fix with it? | A (Yes) |
| who-implements | Who implements | B (Code it) - the agent writes each slice after "Apply this slice" |
| slice-1 | S1 - the one resolver becomes faculty-driven (lib layer) | applied - `lib/evaluation-utils.ts`: `resolveSubjectDepartment` now returns the teacher's own department when it owns at least one course, else the section's department, else null; the gate is a private `homeDepartmentOwnsCourse`; `resolveFacultyDepartment`'s "by its section" wording corrected |
| slice-1b | S1b - the tests that pinned the old rule (test layer) | applied at the user's instruction ("instead of rewriting them remove them, then adjust any existing code"): `evaluation-results-aggregation.test.ts` - the 9-case `describe("resolveSubjectDepartment")` block REMOVED (4 of them pinned the ungated home fallback that no longer exists); the perf case stays, so the import stays. `evaluation-results-department-faculty.test.ts` - the case "falls back to the home department when the section cannot be resolved" REMOVED (it pinned the removed rule); the live-averages case and the roster case ADJUSTED to the new grouping (a Math-homed teacher teaching a CS section now files under Math); two titles that named the old precedence corrected. `dean-evaluation-status-route.test.ts` - one title corrected (the outcome is unchanged). The coverage service's own cases already assert the coverage rule and were unaffected - they became the guard for S2 |
| slice-2 | S2 - the coverage service delegates to the shared resolver (service layer) | applied - `features/evaluations/evaluation-status.service.ts`: the inline rule (the `departmentsWithCourses` set + the `homeOwnsCoverage` ternary) is deleted; the loop now calls `resolveSubjectDepartment(m, subjectCtx)` for `coverageDeptOf` and keeps `resolveSectionDepartment` for `sectionDeptOf`. The department fetch, `deptNameById`, `sectionById`, the department rows, the subject rows and the `sectionDepartment` field are untouched. Arithmetically identical: the helper computes the same `homeOwnsCoverage ? home : section`. The service's own five cases (`evaluation-status-aggregate.test.ts:203-298`) are the guard |
| slice-3 | S3 - the comments that still describe the old rule (comment-only) | applied - 12 comment blocks across 5 files, no logic touched: `evaluation-results.repository.ts` (the roster doc, `loadPeriodAssignments`, the `listLiveDeptAverages` grouping comment, `listDepartmentAssignments`, `listSemesterRoster`, the `UNKNOWN_DEPARTMENT` "section-first" wording), `evaluation-results.service.ts` (`getDepartmentTeachingFaculty`, `getDepartmentSubjectResults`), `lib/types/evaluation.ts` (the context doc, `EvaluationAssignment.departmentId`, `listDepartmentAssignments`), `app/api/dean/evaluation-results/departments/[departmentId]/route.ts`, `app/api/dean/evaluation-status/route.ts` (the guard now says the teacher's own department owns the subject). One extra comment in `evaluation-status-aggregate.test.ts` corrected |
| slice-4 | S4 - the specs record the one rule (docs layer) | applied - `specs/evaluation-results-attribution.md` (v1.2: §1.2 rewritten, the v1.1 exception closed, §2's decision + S1, contract §3.1, the §4 rows' amendment notes, §5's movement direction, §6's matrix row, §7 D1), `specs/coverage-faculty-grouping.md` (v1.3: §1.1, contracts §3.9/§3.10, the C5 row + a new C6 row, D5), `specs/coverage-parity.md` (an amendment note on §1 + the §5 risk), `specs/README.md` (three index rows), `docs/evaluation-surfaces-verification.md` (§4.5, §6, §7's "how to read it" + the closing paragraph). Prose only |
| slice-5 | S5 - the final proof | applied - the sweep for the old rule's wording comes back clean in `features/`, `lib/`, `app/`, `specs/` and `docs/evaluation-surfaces-verification.md`; the verification commands are the user's to run (H1) |

## Pending

- none - all five slices applied; the plan is complete.

## Outcome

**One rule, one implementation.** `resolveSubjectDepartment`
(`lib/evaluation-utils.ts`) is now the single place a department is decided
for an evaluated subject:

    the teacher's home department, WHEN it owns at least one course
      → else the section's department (section → department_course → department)
      → else null (an integrity condition, reported by the warning)

Every surface that resolves a department now goes through it:

| Surface | How it resolves |
|---|---|
| the admin results list, the drill-down, the export ZIP, the reports | `evaluationResultRepository` → `resolveSubjectDepartment` |
| the dean's results list and drill-down, the visibility toggle, `/details` | the same repository methods — they cannot drift from the page |
| the coverage page (admin + dean) | `evaluation-status.service.ts` → the same helper (its private copy of the rule is gone) |
| the dean's coverage detail guard | the same helper — it now asks the list's question, so a dean is no longer refused a subject their own page lists |

**The "Unknown" department names.** The rule can only return an id that is
provably a `departments.id` — a course's `departmentId` is FK-backed, and a
home department that owns a course exists by definition. The old rule's
ungated home branch could return a value the department lookup does not find,
which is what printed "Unknown" in `app/api/admin/evaluation-results/route.ts:44`.

**The numbers move.** A teacher homed in A teaching a section owned by B now
files under **A** on every surface. That is the off-diagonal of the home →
section matrix (`docs/evaluation-surfaces-verification.md` §7) — the one
number no test can give you, and the user's to run.

**Verification owed by the user (AGENTS.md H1):**

```powershell
npx vitest run; if ($?) { npm run lint }; if ($?) { npm run build }
```

The suites that matter: `evaluation-status-aggregate.test.ts` (the coverage
service's five rule cases), `evaluation-results-department-faculty.test.ts`
(the grouping), `dean-evaluation-status-route.test.ts` (the guard).

## Decisions

**Option A — one shared resolver, flipped to the faculty-driven rule.**

The user: "it should be both faculty-driven, they are grouped by departments - and departments will display each of
it's faculties, at least for the main page app/admin/evaluations/results/ it should resolve department same as
that of app/admin/evaluations/coverage/ (this is the correct was)" and "just focus now on that small change of
correcting the departments displayed, currently some or most of it shows 'Unknown' for some reason".

**Why the "Unknown" disappears.** The coverage rule can only return a department id that is *provably real*:
either a `department_courses."departmentId"` (FK-backed to `departments(id)`) or a home department that owns at
least one course - which means it exists in `departments`. The section-first rule's other branch,
`users."departmentId"`, is used **ungated**: it is a bare column whose FK (`fk_users_department`,
`ON DELETE SET NULL`) can hold a value that is not a department row the lookup finds, and any id the lookup does
not find prints as **"Unknown"** (`app/api/admin/evaluation-results/route.ts:44`). Gating the home branch on
"owns a course" is what makes the id real - and it is the rule the coverage page already runs.

**Slices (order):**
- **S1** `lib/evaluation-utils.ts` — `resolveSubjectDepartment` becomes the faculty-driven rule (home wins when
  it owns a course; the section's department is the fallback; null when neither resolves). The docstring and the
  9 unit cases are rewritten to the new precedence.
- **S2** `features/evaluations/evaluation-status.service.ts` — the service's inline copy of the rule
  (lines 196-208) is deleted; it calls the shared helper. One implementation, not two.
- **S3** the four call sites that already call the resolver pick the new rule up with no logic change:
  `evaluation-results.repository.ts:80` (the "no responses" roster + the dean's teaching roster), `:244` (the
  results list + the drill-down), `:485` (the integrity warning + the dean's warning scope),
  `app/api/dean/evaluation-status/route.ts:38` (the dean's coverage detail guard). Comments updated.
- **S4** the tests: the rewritten resolver cases, the two fixtures that flip, the coverage service's gate cases,
  and the dean's guard.
- **S5** the specs: `specs/evaluation-results-attribution.md` (D1, contract §3.1, the §6 matrix) and
  `specs/coverage-faculty-grouping.md` (contract §3.10) both pin the split - they are amended to record the one rule.

**Role coverage — verified (the user asked).** The change is role-agnostic: every surface reads the SAME
repository/service methods, so ADMIN and DEAN move together and no per-role slice is needed.
- ADMIN: `/admin/evaluations/results` (list), `/admin/evaluations/results/[departmentId]` (drill-down),
  `/admin/evaluations/coverage`, the results ZIP export.
- DEAN: `/dean/evaluations/results` (top-level), `/dean/evaluations/results/[departmentId]` (drill-down),
  `/dean/evaluations/coverage` (list + the detail guard — the guard is the live 403 fix).
- The dean's guards that scope by department — `app/api/dean/evaluation-results/visibility` (:37) and
  `/details` (:34) — both call `listDepartmentAssignments`, so they follow the new rule and cannot drift
  from the page (the attribution spec's contract §3.8).
- The group-detail pages (`/groups/[facultySubjectId]`, admin + dean) resolve no department — they only
  check the path's `departmentId` against the dean's own — so they need no change.
- The reports + the report dashboards read `listLiveDeptAverages`, so they follow.

**Invariants (from repository.md):**
- *API routes stay thin* — app/api/ — **applies**: the resolver is a pure helper; the routes keep parsing,
  delegating, returning JSON. No route gains logic.
- *proxy.ts is the access-enforcement point* — proxy.ts — **applies, untouched**: the dean routes keep their role,
  `findByDeanId` and department-match guards; the grouping change lives below the route.
- *All Supabase access goes through repositories wired by DI* — lib/repositories/factory.ts — **applies**: the
  resolver is pure; the context stays built by `evaluationResultRepository.buildSubjectContext` /
  `loadSectionMaps`. No new query, no direct `supabase`.
- *Double-click prevention via SubmitButton* — components/ui — **n/a**: read-only reporting surfaces.
- *Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT* — lib/utils/roles.ts — **applies**: the
  dean's scoping to their own department is unchanged; only the membership rule inside it moves.

**Layering order:** lib/evaluation-utils.ts (pure) → features/ (repository + service) → app/api/ (thin) →
app/ (render). No controller layer in this area (the routes call the service directly, as the 2026-10-20 coverage
work did).

**Gold paths read first:** `app/api/` (the admin + dean evaluation-results routes, the export route, the dean
evaluation-status route), `features/` (the evaluation-results repository/service, the coverage service),
`lib/repositories/factory.ts`, `lib/auth.ts`.

**Proof command:** `npm test` (the repository.md Tests line). The affected suites:
`lib/__tests__/evaluation-results-aggregation.test.ts` (the resolver), `lib/__tests__/evaluation-results-department-faculty.test.ts`
(the roster + the live averages + the warnings), `lib/__tests__/evaluation-status-aggregate.test.ts` (the coverage
service), `lib/__tests__/dean-evaluation-status-route.test.ts` (the guard).

**Out of scope:** the row-level "whose section is it" marker on the results drill-down (the user asked for the
small change) · `resolveFacultyDepartment` / `resolveDepartmentFaculties` (already superseded, tests only) · the
report service (it reads `listLiveDeptAverages`, so it follows) · the schema · the student-facing flow.

## Scan

**Path — the admin results main page**
`app/admin/evaluations/results/page.tsx:58` → `app/api/admin/evaluation-results/route.ts:22` →
`evaluationResultRepository.listLiveDeptAverages` (repo:286) → `loadPeriodAssignments` (repo:234) →
`resolveSubjectDepartment(row, ctx)` (repo:244) → `lib/evaluation-utils.ts:458` = **section-first**.

**Path — the coverage page (the rule to adopt)**
`app/admin/evaluations/coverage/page.tsx:4` → `CoveragePage` → `/api/admin/evaluation-status` →
`features/evaluations/evaluation-status.service.ts:200-208` = **home-first, gated on "the home department owns
at least one course"**, the section's department as the fallback.

**The gap is one gate.**
- `resolveSubjectDepartment` = `section ?? home` — the home branch is ungated.
- the coverage rule = `(home && homeOwnsCourses) ? home : section`.

`SubjectResolutionContext` (`lib/types/evaluation.ts:598`) already carries `departmentCourses`, so the set of
departments that own a course is derivable from the context the repository already builds — **no new query**.

**Who reads a resolved department**
| Consumer | Where | Reads it for |
|---|---|---|
| `loadPeriodAssignments` | repo:244 | the results list, the drill-down's subjects, the export's per-department CSVs, the report's department figures |
| `loadSemesterRoster` → `rosterByDepartment` | repo:63-100 | the "No responses" column, the dean's teaching roster |
| `listAttributionWarnings` | repo:485 | the integrity warning and the dean's warning scope |
| the dean's coverage detail guard | `app/api/dean/evaluation-status/route.ts:38` | 403 when the subject is not the dean's |

`listLiveFacultyResults` (repo:347) groups by `evaluateeId` and does not read the department — unchanged.

**The "Unknown"**
`app/api/admin/evaluation-results/route.ts:44` — `departmentName: dept?.name ?? "Unknown"`. The id comes from
the resolved department; the name comes from `departmentRepository.listAll()`. The coverage rule can only return
an id that is provably a `departments.id` (a course's FK, or a home department that owns a course), so the
fallback stops being reachable — the rows print a name or do not exist.

**Proof**
- `lib/__tests__/evaluation-results-aggregation.test.ts:225-281` — the 9 `resolveSubjectDepartment` cases pin the
  section-first precedence. **They are rewritten.**
- `lib/__tests__/evaluation-results-department-faculty.test.ts:59-73, 116-158, 318-321` — three cases pin the old
  precedence. **Two flip** (the live averages, the roster); the third holds for a different reason and is renamed.
- `lib/__tests__/evaluation-status-aggregate.test.ts` — the coverage service's rule; its fixture already has the
  home owning the course, so its behaviour is unchanged. New cases for the gate.
- `lib/__tests__/dean-evaluation-status-route.test.ts` — the guard.
- `lib/__tests__/admin-evaluation-results-route.test.ts` — mocks the repository; unchanged.
- Command: `npm test`

**Teach**
The two pages answer two different questions, and the code deliberately encoded that: the **coverage** page's
unit is the *faculty-subject* (a teacher's assignment), so a teacher's coverage belongs to **their own**
department; the **results** page's unit was the *evaluation event*, and the section hosting it owns the event.
`specs/coverage-faculty-grouping.md` D5 and `specs/evaluation-results-attribution.md` D1 pinned both rules, with
D5's contract §3.10 saying in as many words "the results pages are not changed by this". So the app speaks two
languages *on purpose*, and the two pages disagree about the same subject by design. This story collapses them
into one rule: the evaluated entity is the **faculty**, so the faculty's own department groups the results.
The cost is that a section owned by department B, taught by a teacher homed in A, files under **A** — so B's
surfaces lose that subject and A's gain it. The one free side-effect: the coverage rule's gate makes the
resolved id provably real, which is why the "Unknown" department names go away.
One alternative: keep two rules and label the pages — cheaper, but the two pages still answer "whose subject is
this?" differently, which is the complaint.

**Lens**
- API routes stay thin (parse, call controller, return JSON) — app/api/ — **applies**: the resolver is a pure
  helper + the repository; the routes keep parsing, delegating, returning JSON. No route gains logic.
- proxy.ts is the access-enforcement point (JWT + DB role + tokenVersion) — proxy.ts — **applies, untouched**:
  the dean routes keep their role + `findByDeanId` + department-match guards; the grouping change is inside the
  service/repository, so no path or grant changes.
- All Supabase access goes through repositories wired by DI — lib/repositories/factory.ts — **applies**: the
  resolver stays pure in `lib/evaluation-utils.ts`; the context stays built by
  `evaluationResultRepository.buildSubjectContext` / `loadSectionMaps`. No direct `supabase` anywhere.
- Double-click prevention via SubmitButton — components/ui — **n/a**: read-only reporting surfaces.
- Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT — lib/utils/roles.ts — **applies**: the
  dean's scoping to their own department is unchanged; only the membership rule inside it moves.

## Plan

**S1 — the one resolver, faculty-driven (lib layer)**
`lib/evaluation-utils.ts`:
- `resolveSubjectDepartment(subject, ctx)` becomes: the teacher's home department when it owns at least one
  course; else the section's department (`section → department_course → department`); else `null`.
- the set of departments that own a course is derived from `ctx.departmentCourses` (both tables are small — the
  existing `loadSectionMaps` comment says so).
- the docstring is rewritten: it currently states the section-first precedence, and both specs quote it.
- the returned id is always a real `departments.id` — the property that removes the "Unknown" fallback.

**S2 — the coverage service delegates to it (one implementation)**
`features/evaluations/evaluation-status.service.ts`: the inline `coverageDeptOf` block (lines 196-208) and the
`departmentsWithCourses` set it built are deleted; the service calls the shared helper. Same numbers, one rule.

**S3 — the four call sites pick it up (no logic change, comments only)**
`features/evaluation-results/evaluation-results.repository.ts` (:80, :244, :485) and
`app/api/dean/evaluation-status/route.ts` (:38). The dean's coverage guard is a **live fix**: it asks the
section's department while the dean's own coverage list is faculty-driven, so today a dean is refused (403) a
subject their own page lists.

**S4 — the tests** (revised by the user: remove the stale cases, do not rewrite them)
- `lib/__tests__/evaluation-results-aggregation.test.ts`: the `describe("resolveSubjectDepartment")` block is
  REMOVED — it pinned the rule that no longer exists. The perf case stays.
- `lib/__tests__/evaluation-results-department-faculty.test.ts`: the case that pinned the removed rule is
  REMOVED; the live-averages and roster cases are ADJUSTED to the new grouping; the titles that named the old
  precedence are corrected.
- `lib/__tests__/evaluation-status-aggregate.test.ts`: the coverage service's cases already assert the coverage
  rule (written by the 2026-10-20 coverage story) — they are the guard for S2, and stay as they are.
- `lib/__tests__/dean-evaluation-status-route.test.ts`: the guard's title corrected (the outcome is unchanged).

**S5 — the specs**
`specs/evaluation-results-attribution.md` (D1, contract §3.1, the §6 matrix row) and
`specs/coverage-faculty-grouping.md` (contract §3.10 "the results pages are not changed by this") — both pin the
split; they are amended to record the one faculty-driven rule.

**Proof — `npm test`** after each slice; final: `npm run lint` + `npm run build` (the owner's to run, H1).

**Risks.** The numbers move between departments — that is the point (the off-diagonal of the home → section
matrix in `docs/evaluation-surfaces-verification.md` §7). The dean's coverage list and guard change together.
The report's department figures move with the list (it reads `listLiveDeptAverages`).
