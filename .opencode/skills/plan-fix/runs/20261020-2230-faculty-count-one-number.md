---
skill: plan-fix
story: the evaluation surfaces count "faculties belonging to a department" four different ways - the results page counted the faculty with results PLUS the no-response roster (a person with one evaluated and one unevaluated section counted twice), the coverage page counted the teachers with an assignment in the term and its KPI summed those counts across departments (a teacher teaching in three departments counted three times, so a school with 9 faculty showed 22), the export CSVs and the report page counted only the faculty with results, and the Department Health report counts the department's users by home department. The same department shows a different number on every surface
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A"}
workflow: A
decision: Option A - one number, everywhere: a single shared headcount helper read by every evaluation surface; the results API drops the no-response roster no page reads; the Department Health report reads the same helper; the specs/docs state the one rule
status: done
pending:
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-reuse | Use the last calibration (AAAAAA)? | A (use it) - the user said "reuse calibration"; 20261020-0500-results-faculty-driven.md and 20261020-0400-coverage-parity.md both carry a full AAAAAA calibration for this repo |
| scan-options | How far should the plan go? | A - one number, everywhere (the shared headcount on every surface, the roster dropped from the results API, Department Health on the same helper, the specs/docs amended) |
| plan-done | Is this plan done? | A (Done) - S3 deletes listDepartmentRosters (method + interface entry + its test cases); S4 switches Department Health to the shared helper |
| handoff | Run implement-fix with it? | A (Yes) - implement-fix on this same file, starting at S3 |
| who-implements | Who implements the slices? | B (Code it) - the agent writes each slice after "Apply this slice" |
| slice-3.1 | Apply the route layer of S3? | A (Apply this slice) - applied: both results routes stop calling listDepartmentRosters and stop returning noResponses; the admin route test's roster case is re-pinned; the dead mock setup is gone from both route tests |
| slice-3.2 | Apply the data layer of S3? | A (Apply this slice) - applied: listDepartmentRosters deleted from the repository and from IEvaluationResultRepository; its describe block deleted from the roster test; the last mock entry deleted from the admin route test. loadSemesterRoster, listSubmittedEvaluates and UNASSIGNED_FACULTY_EMAIL all still have a reader |
| slice-4 | Apply S4 (Department Health)? | A (Apply this slice) - applied: the controller fetches the headcount once for the page and passes it into getDepartmentSummary; the service prints it and re-bases inactiveFaculty onto the same population (the Active card stays a fraction); the reports test gained the listByRole mock and two headcount assertions |
| slice-5 | Apply S5 (the specs and the verification doc)? | A (Apply this slice) - applied: the headcount rule written into evaluation-results-attribution.md (§1.9 rewritten, contract §3.5 rewritten, new contract §3.14, the S3.1/S3.2/S4.1 rows marked removed/superseded, a new S4.2 row, a risk, the verification table, D5/D6 superseded), coverage-parity.md (§1.4, C3.1, §6 item 4), coverage-faculty-grouping.md (contract 7 amended, new contract 13), evaluation-surfaces-verification.md (§3.1/§3.5 corrected, a new §3.8, §4.2/§4.6/§4.7, §6's headcount check) |

**Status: done.** Every slice of the approved plan is applied.

## Pending

- the open question: which option (see Scan) - the scope of the remaining work

## Decisions

**Option A — one number, everywhere.** A department's faculty is the faculty users homed in it
(`users.departmentId`), counted once, and every surface reads it from one place.

**The rule (the one sentence the specs will carry):**
> A department's faculty count is the number of faculty accounts homed in that department
> (`users.departmentId`), soft-deleted accounts excluded. A teacher who teaches a section owned by
> another department is counted in their own department. The teaching roster (who was assigned to
> teach this term) is a different number and lives on the coverage page.

**Slices (in order):**

| # | Slice | State |
|---|-------|-------|
| S1 | The shared headcount helper `getFacultyCountsByDepartment()` (`features/users/users.service.ts`) and its six readers: the admin results route, the dean results route, the coverage service, the admin results export, the dean results export, the report service | **applied** in the working tree |
| S2 | The results page drops its "No responses" and "Responses" columns (the coverage page owns those numbers); the dead roster state and the `totalRespondents` sort key go with them | **applied** in the working tree |
| S3 | The results API drops the no-response roster: `listDepartmentRosters` leaves both results routes and the payload, and the method + its interface entry + its test cases go with it (its per-assignment semantics were the second bug) | to do |
| S4 | The Department Health report reads the same helper, so its per-department "Faculty" is the same number (a DEAN-only account homed in the department stops counting as faculty there) | to do |
| S5 | The specs and the verification doc carry the one rule: `specs/evaluation-results-attribution.md` (§1.9, S3/S4.1, the roster contract, the matrix), `specs/coverage-parity.md` (§1.4, C3.1, §6 item 4), `specs/coverage-faculty-grouping.md` (the "Faculties" column contract), `docs/evaluation-surfaces-verification.md` (§4.5, §6, §7) | to do |

**Invariants — how each `applies` one is preserved**
- *API routes stay thin* — the headcount is a **service** call (`features/users/users.service.ts`),
  never logic in a route; S3 only **removes** work from the routes. Paths:
  `app/api/admin/evaluation-results/route.ts`, `app/api/dean/evaluation-results/route.ts`,
  `app/api/admin/evaluation-results/export/route.ts`, `app/api/dean/evaluation-results/export/route.ts`.
- *proxy.ts is the access-enforcement point* — n/a: no route, page or role changes; the same surfaces
  answer the same roles.
- *All Supabase access goes through repositories wired by DI* — the headcount reads through
  `userRepository.listByRole` from `lib/repositories/factory.ts`; no direct `supabase` in the new code.
  The report service's pre-existing direct reads are untouched.
- *Double-click prevention via SubmitButton* — n/a: read-only reporting surfaces.
- *Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT* — the headcount reads the FACULTY
  row in `userrole`, the same source as the dashboard's `countByRole`; a DEAN-only account is not
  faculty (S4 makes Department Health agree).

**Layering order** (from `repository.md`): Route Handler → Controller → Service → Repository → Supabase.
The new helper sits in the **service** layer (`features/users/users.service.ts`) and reads the
**repository** layer (`userRepository.listByRole`); the routes call the service and return JSON.

**Gold paths to read before each slice:** `app/api/` (the four evaluation routes),
`features/users/users.service.ts`, `features/evaluations/evaluation-status.service.ts`,
`features/evaluation-results/evaluation-results.repository.ts`, `features/reports/admin-reports.service.ts`,
`lib/repositories/factory.ts`, `proxy.ts`, `lib/auth.ts`.

**Proof command** (`repository.md` → Tests): `npm test` — the suites that matter:
`lib/__tests__/evaluation-status-aggregate.test.ts`, `lib/__tests__/admin-evaluation-results-route.test.ts`,
`lib/__tests__/dean-evaluation-results-route.test.ts`, `lib/__tests__/evaluation-results-department-faculty.test.ts`
(the roster cases are removed with the method), `lib/__tests__/admin-evaluation-results-export-route.test.ts`,
`lib/__tests__/dean-evaluation-results-export-route.test.ts`, `lib/__tests__/evaluation-report-dashboard.test.ts`,
`lib/__tests__/reports.test.ts`.

**Out of scope** (noted, not planned): the coverage "Unresolved" pseudo-row's name-based count
(`CoveragePage.tsx:165`); the "By Faculty" drill-down listing everyone who teaches the department's
subjects (it answers a coverage question, not a headcount one); the admin dashboard's
`countByRole("FACULTY")` counting soft-deleted accounts (the dashboard is looser than the new headcount
by exactly those accounts).

## Scan

**Path — the one headcount (applied in the working tree)**

```
app/admin/evaluations/results/page.tsx:55  (Faculty column)
  → app/api/admin/evaluation-results/route.ts:32  getFacultyCountsByDepartment()
    → features/users/users.service.ts:37  userRepository.listByRole("FACULTY")
      → features/users/users.repository.ts:155  USER_SELECT_INNER, deletedAt IS NULL
        → group by users.departmentId
app/admin/evaluations/coverage/page.tsx:4 → CoveragePage
  → app/api/admin/evaluation-status/route.ts:22 → features/evaluations/evaluation-status.service.ts:174
    → the same helper
app/api/dean/evaluation-results/route.ts:29 → the same helper
app/api/admin/evaluation-results/export/route.ts:81 → the same helper
app/api/dean/evaluation-results/export/route.ts:45 → the same helper
features/evaluations/evaluation-report.service.ts:140,206 → the same helper
```

**Path — the surfaces still on a different number**

```
features/reports/admin-reports.service.ts:25-26,91
  → userRepository.listByDepartment(deptId) filtered to FACULTY|DEAN
  → the Department Health report's per-department "Faculty"
features/evaluation-results/evaluation-results.repository.ts:409  listDepartmentRosters
  → the no-response roster, built per ASSIGNMENT (evaluated.has(r.id) → skip)
  → served by both results routes; no page reads it any more
```

**Proof** — `lib/__tests__/evaluation-status-aggregate.test.ts` (the coverage service's headcount cases),
`lib/__tests__/admin-evaluation-results-route.test.ts`, `lib/__tests__/dean-evaluation-results-route.test.ts`,
`lib/__tests__/admin-evaluation-results-export-route.test.ts`, `lib/__tests__/dean-evaluation-results-export-route.test.ts`,
`lib/__tests__/evaluation-report-dashboard.test.ts`.
**Command** — `npm test`

**Teach** — *why* the numbers diverged: each surface counted a different **population**, not a different
formula for the same one.
- the results page counted *evaluations* (a faculty with results) plus a *roster* (assignments with no
  response) — two sets that overlap when a person has one of each;
- the coverage page counted *assignments* (teachers with a load this term) and then **summed** the
  per-department counts, so a teacher homed in A who taught sections in B and C was counted three times;
- the exports and the report counted *evaluated faculty* only, so a department with quiet teachers read
  smaller than it is;
- the dashboard and Department Health counted *users by home department* - the only population that is a
  department's own people.
The one rule that survives all of them: **a department's faculty = the faculty users homed in it**
(`users.departmentId`), counted once. A teacher who teaches in another department is counted in their own.
The alternative — "everyone the department is responsible for this term" — is a real and useful number, but
it is a *teaching roster*, not a headcount, and it cannot be compared across departments.

**Lens**
- API routes stay thin (parse, call controller, return JSON) — app/api/ — **applies**: the headcount is a
  service call (`features/users/users.service.ts`), not logic in a route; the routes keep parsing, delegating
  and returning JSON. The roster removal deletes work from the routes, it does not add any.
- proxy.ts is the access-enforcement point (JWT + DB role + tokenVersion) — proxy.ts — **n/a**: no route,
  role or page changes; the same surfaces answer the same roles.
- All Supabase access goes through repositories wired by DI — lib/repositories/factory.ts — **applies**: the
  headcount reads through `userRepository.listByRole`; no direct `supabase` in the new code. The report
  service's existing direct `supabase` reads are pre-existing and untouched.
- Double-click prevention via SubmitButton — components/ui — **n/a**: read-only reporting surfaces, no
  submit.
- Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT — lib/utils/roles.ts — **applies**: the
  headcount reads the FACULTY role row from `userrole`, the same source as the dashboard's `countByRole`.

## Plan

**The rule every surface will show:** a department's faculty count is the number of faculty accounts
homed in that department (`users.departmentId`), soft-deleted excluded, counted once. A teacher who
teaches a section owned by another department counts in their own department. The teaching roster
(assigned to teach this term) is a different number and lives on the coverage page.

**Already applied in the working tree — verify, do not redo:**
- S1: `features/users/users.service.ts` → `getFacultyCountsByDepartment()`; readers in
  `app/api/admin/evaluation-results/route.ts`, `app/api/dean/evaluation-results/route.ts`,
  `features/evaluations/evaluation-status.service.ts`,
  `app/api/admin/evaluation-results/export/route.ts`,
  `app/api/dean/evaluation-results/export/route.ts`,
  `features/evaluations/evaluation-report.service.ts`.
- S2: `app/admin/evaluations/results/page.tsx` — the "No responses" and "Responses" columns, the
  expandable roster and the `totalRespondents` sort key are gone.

**S3 — the results API drops the no-response roster** *(the route layer first, then the data layer — the order
is reversed from the table above so the tree compiles and the tests pass at EVERY slice boundary: the
method cannot be deleted before its callers stop using it)*
1. `app/api/admin/evaluation-results/route.ts` + `app/api/dean/evaluation-results/route.ts` — drop
   `listDepartmentRosters` from the `Promise.all` and `noResponses` from the payload.
2. `lib/__tests__/admin-evaluation-results-route.test.ts` +
   `lib/__tests__/dean-evaluation-results-route.test.ts` — the case that asserts the roster in the
   payload is re-pinned to the headcount rule and to the roster's absence.
3. `features/evaluation-results/evaluation-results.repository.ts` — delete `listDepartmentRosters`;
   keep `loadSemesterRoster` (the dean's teaching roster still uses it).
4. `lib/types/evaluation.ts` — delete the `listDepartmentRosters` entry from
   `IEvaluationResultRepository`.
5. `lib/__tests__/evaluation-results-department-faculty.test.ts` — delete the
   `describe("evaluationResultRepository.listDepartmentRosters")` block.
No other reader exists (`app/dean/evaluations/results/page.tsx` never rendered the column).

**S4 — Department Health reads the same headcount**
- `features/reports/admin-reports.service.ts` — `getDepartmentSummary` takes the count from
  `getFacultyCountsByDepartment()`; `facultyUsers` stays for the appointment queries and
  `inactiveFaculty`.
- `lib/__tests__/reports.test.ts` — the per-department faculty expectation follows the new number.

**S5 — the specs and the verification doc carry the one rule** (prose only, no code)
- `specs/evaluation-results-attribution.md` — §1.9 (the counts that could not reconcile), the S3/S4
  slices, the roster contract, the matrix row, and a new section for the headcount rule.
- `specs/coverage-parity.md` — §1.4, C3.1, §6 item 4.
- `specs/coverage-faculty-grouping.md` — the "Faculties" column contract.
- `docs/evaluation-surfaces-verification.md` — §4.5, §6, §7.
Each records: the rule, that the roster is gone from the results surfaces, and that the results and
coverage pages now print the same number for a department.

**Proof** — `npm test` (the suites named in Decisions), then `npm run lint` and `npm run build`
(the owner's runs, AGENTS.md H1).

**Out of scope** — the coverage "Unresolved" pseudo-row's name-based count; the "By Faculty"
drill-down's list of everyone who teaches the department's subjects; the admin dashboard counting
soft-deleted accounts.
