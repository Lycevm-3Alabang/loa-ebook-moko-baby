---
skill: plan-fix
story: the coverage page's per-department drill-down (app/admin/evaluations/coverage, click a department) lists its "By Faculty" cards from the department's subjects - the teaching roster, everyone who teaches one of them - while the department row above it now prints the department's headcount (the faculty homed in it, contract §3.14). The page therefore shows two different populations side by side (e.g. "Faculties 2" with 5 cards). Decide what the cards mean: leave them roster-based and say so, scope them to the department's own faculty, or show both counts
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A"}
workflow: A
decision: Option B - a drill-down's "By Faculty" tab lists the department's OWN faculty (the accounts homed in it); the coverage drill-down and the results drill-down follow the same rule; the subjects, the students and the department aggregate are untouched
status: done
pending:
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-reuse | Use the last calibration (AAAAAA)? | A (use it) - the user said "reuse calibration"; 20261020-2230-faculty-count-one-number.md carries a full AAAAAA calibration for this repo |
| scan-options | What should the drill-down's "By Faculty" cards mean? | B (scope the cards to the department's own faculty) - the user's own words: "Only faculties who's department is the current drilldown should be listed, section doesn't weigh anything here ... it's the faculty's home department that we care only about; current setup is wrong, it has faculties that may not be a department member." A teacher teaching a section owned by another department is fine - their HOME department decides membership |
| approve | Approve this design? | Change of scope, not of design: "this also applies to drill down in evaluation/results/[departmentId]" - the same membership rule on the results department drill-down (admin + dean), which shares the service and the component pattern |
| plan-done | Is this plan done? | A (Done) - S1 the coverage drill-down, S2 the results drill-down, S3 the specs, as written |
| handoff | Run implement-fix with it? | A (Yes) - implement-fix on this same file, starting at S1 |
| who-implements | Who implements the slices? | B (Code it) - the agent writes each slice after "Apply this slice" |
| slice-1 | Apply S1 (the coverage drill-down's membership rule)? | A (Apply this slice) - applied: the coverage service skips a teacher whose home department is not the department in the per-faculty aggregate loop (the aggregate map is now the member list); the client renders the cards from that map and keeps every teacher for the "Unresolved" pseudo-row. The subject rows, the department row's headcount and the KPI are untouched |
| slice-2 | Apply S2 (the results drill-down's membership rule)? | A (Apply this slice) - applied: the results service keeps only the teachers whose users.departmentId is the department in facultyAggregates; DepartmentSubjectView renders the cards from that map; the service test's fixtures now say where the faculty are homed, plus a new case pinning the rule (a teacher homed elsewhere has no card, but their subject and results are the department's) |
| slice-3 | Apply S3 (the specs and the verification doc)? | A (Apply this slice) - applied: coverage-faculty-grouping.md contract 13 corrected and a new contract 14 (the membership rule); evaluation-results-attribution.md a new contract §3.15 and a new changes row S4.3; evaluation-surfaces-verification.md §3.4, the new §3.9, and §4.4 (which was stale - it said the cards and the rows list the same people) |

**Status: done.** Every slice of the approved plan is applied.

## Pending

- plan-done: the plan (S1 the coverage drill-down, S2 the results drill-down, S3 the specs)

## Decisions

**Option B — the drill-down's "By Faculty" tab lists the department's own faculty.** Membership is
the teacher's **home** department (`users.departmentId`); the section's department is irrelevant to
it. A teacher homed in A who teaches a section owned by B is a member of A, not of B — and B's
drill-down must not list them as one of its faculty. The user's own words: "Only faculties who's
department is the current drilldown should be listed, section doesn't weigh anything here ... it's
the faculty's home department that we care only about; current setup is wrong, it has faculties that
may not be a department member." **The results drill-down
(`app/admin/evaluations/results/[departmentId]`, and the dean's twin) follows the same rule** — the
user's scope note.

**The rule (the one sentence the specs will carry):**
> A drill-down's "By Faculty" tab lists the department's **own** faculty — the accounts homed in it
> (`users.departmentId`). A teacher who teaches a section owned by another department is not a member
> of that department and does not appear in its faculty list; their subject, its students and their
> responses stay in the department's **"By Subject & Section"** tab, because that coverage is real.

**Slices (in order):**

| # | Slice | Files |
|---|-------|-------|
| S1 | **The coverage drill-down's membership rule** — the service's per-faculty aggregates become the department's **members only** (the assignments stay teaching-driven; the *faculty list* is filtered by `subjectCtx.userDept`), and the client renders the cards from that map. The "Unresolved" pseudo-row keeps its roster cards (it is not a department, so it has no membership question). | `features/evaluations/evaluation-status.service.ts` + `features/evaluations/components/CoveragePage.tsx` |
| S2 | **The results drill-down's membership rule** — the same rule on `app/admin/evaluations/results/[departmentId]` (and the dean's twin, which share the service and the component): the service's `facultyAggregates` become the department's members only (the service already holds each faculty's home department), and the component's cards come from that map. The **department aggregate** (the pooled rating) and the subject rows are untouched — a non-member's evaluated subject is still the department's result. | `features/evaluation-results/evaluation-results.service.ts` + `features/evaluations/components/DepartmentSubjectView.tsx` |
| S3 | **The specs and the verification doc** — `specs/coverage-faculty-grouping.md` contract 13 (it says the cards are the teaching roster) → the membership rule; `specs/evaluation-results-attribution.md` (a contract for the results drill-down + the changes table); `docs/evaluation-surfaces-verification.md` §3.4 and §4.4 → "every card is a member; a card for a teacher homed elsewhere is wrong". | prose |

**Why S1 and S2 are one slice each (service + client together):** the service knows the members
(`subjectCtx.userDept` / the users' `departmentId`); the client cannot — the payload carries a
count, never a list. If the service filtered alone, the intermediate state would render cards with
no figures ("3 subjects · 0 students"); if the client filtered alone, it would not know whom to
keep.

**Invariants — how each `applies` one is preserved**
- *API routes stay thin* — app/api/ — **applies**: the change is in the services; the routes keep
  parsing, delegating and returning JSON (the two department routes already call the shared
  service). Paths: `app/api/admin/evaluation-status/route.ts`,
  `app/api/admin/evaluation-results/departments/[departmentId]/route.ts`,
  `app/api/dean/evaluation-results/departments/[departmentId]/route.ts`.
- *proxy.ts is the access-enforcement point* — proxy.ts — **n/a**: no route, page or role change;
  the dean pages render the same components and the same services.
- *All Supabase access goes through repositories wired by DI* — lib/repositories/factory.ts —
  **applies**: the home department is read through the existing repositories
  (`userRepository.listByIds` already returns `departmentId`; the coverage service already holds
  `ctx.userDept`); no direct `supabase` is added.
- *Double-click prevention via SubmitButton* — components/ui — **n/a**: read-only surfaces.
- *Role is pipe-delimited* — lib/utils/roles.ts — **n/a**: no role logic; the membership test is
  `users.departmentId`, not a role.

**Layering order** (from `repository.md`): Route Handler → Controller → Service → Repository → Supabase.
S1 and S2 change the **service** layer first (the member list) and then the **client** layer
(`app/`), because the client cannot compute the membership on its own.

**Gold paths to read before each slice:** `app/api/`, `features/`, `proxy.ts`, `lib/auth.ts`,
`lib/repositories/factory.ts` — for S1: `features/evaluations/evaluation-status.service.ts` and
`features/evaluations/components/CoveragePage.tsx`; for S2:
`features/evaluation-results/evaluation-results.service.ts` and
`features/evaluations/components/DepartmentSubjectView.tsx`.

**Proof command** (`repository.md` → Tests): `npm test` — the suites that matter:
`lib/__tests__/coverage-page-freshness.test.tsx`, `lib/__tests__/evaluation-status-aggregate.test.ts`,
`lib/__tests__/evaluation-results-service.test.ts`, `lib/__tests__/department-subject-view.test.tsx`.

**Out of scope** (noted, not planned): the "Unresolved" pseudo-row's own faculty count (the TODO's
first open item); the attribution rule itself (a subject's department is unchanged); the per-subject
visibility toggles; the export CSVs (they are per subject, so the membership filter does not touch
them).

## Scan

**Path**

```
app/admin/evaluations/coverage/page.tsx:4  → <CoveragePage statusBase="/api/admin/evaluation-status" />
app/dean/evaluations/coverage/page.tsx      → <CoveragePage ... departmentId={dept.id} />  (the same component)
  → features/evaluations/components/CoveragePage.tsx:443   selectedDept && (the drill-down)
    → :226 deptSubjects     ← statusData.subjects filtered by departmentId (and by the search q)
      → :238 facultyGroups   ← deptSubjects grouped by facultyId          ← the teaching roster
    → :248 facultyAggregates ← statusData.facultyAggregates[deptId][facultyId]  ← the service's per-faculty figures
    → :531 the cards
  ← the payload: app/api/admin/evaluation-status/route.ts:22 → features/evaluations/evaluation-status.service.ts
      (the department row's facultyCount is the headcount; the subject rows are the assignments)

app/admin/evaluations/results/[departmentId]/page.tsx:262  → <DepartmentSubjectView … />
app/dean/evaluations/results/[departmentId]/page.tsx:251    → the same component
  → features/evaluations/components/DepartmentSubjectView.tsx:108  facultyGroups ← filteredSubjects grouped by facultyId
    → :319 the cards, with agg = facultyAggregates[group.facultyId] (:320)
  ← app/api/admin/evaluation-results/departments/[departmentId]/route.ts:21
     app/api/dean/evaluation-results/departments/[departmentId]/route.ts:36
       → features/evaluation-results/evaluation-results.service.ts:190
           facultyAggregates = aggregateFacultyResults(validEvals, ratings, comments)
           (the service already holds each faculty's home department: userRepository.listByIds → USER_SELECT → "departmentId")
```

**Proof** — `lib/__tests__/coverage-page-freshness.test.tsx` ("shows the two groupings in the
department drill-down", "groups by faculty with the teacher's aggregate" — the two cases that
touch the cards); `lib/__tests__/evaluation-status-aggregate.test.ts` (the service's per-faculty
aggregates); `lib/__tests__/evaluation-results-service.test.ts` (the results service's aggregates,
including "keeps another department's assignment out, even for the same faculty");
`lib/__tests__/department-subject-view.test.tsx` (the card's figures). **Command** — `npm test`.

**Teach** — *why* the cards and the row above can disagree:
- the department row's **"Faculties"** is the **headcount** — the faculty accounts homed in the
  department (`users.departmentId`), one number for the school (contract §3.14);
- the **cards** are built from the department's *subjects* grouped by teacher, i.e. the **teaching
  roster** — everyone with an assignment attributed to this department. A teacher homed elsewhere
  who teaches a section here is still in it, so the cards can list more people than the headcount;
- the card's *figures* (subjects, students, completion) come from `facultyAggregates`, which the
  service computes over the same teaching-driven attribution — so a card is a **coverage** fact and
  must stay roster-based: a teacher homed elsewhere who teaches here still has coverage to report,
  and the students in that section are the department's students for this term;
- **the scan's finding that decides the options:** the client **cannot tell** which teachers are
  homed in the department. The payload carries the headcount as a *number* (`departments[].facultyCount`),
  never a list, and a subject row carries no home department. So any option that marks or scopes an
  individual card (B, C) needs the **service** to send the homing — the client alone cannot do it.

**Lens**
- API routes stay thin — app/api/ — **applies**: the change is in the services; the routes keep
  parsing, delegating and returning JSON (the two department routes already call the shared
  service). The membership fact belongs in the service's payload, never in route logic.
- proxy.ts is the access-enforcement point — proxy.ts — **n/a**: no route, page or role change; the
  dean pages render the same components and the same services.
- All Supabase access goes through repositories wired by DI — lib/repositories/factory.ts —
  **applies**: the home department is read through the existing repositories
  (`userRepository.listByIds` already returns `departmentId`; the coverage service already holds
  `ctx.userDept`); no direct `supabase` is added.
- Double-click prevention via SubmitButton — components/ui — **n/a**: read-only.
- Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT — lib/utils/roles.ts — **n/a**:
  no role logic; the membership test is `users.departmentId`, not a role.

## Plan

**S1 — the coverage drill-down's membership rule** *(service + client, one atomic change)*
1. `features/evaluations/evaluation-status.service.ts` — in the per-faculty aggregate loop, skip a
   faculty whose home department is not this department
   (`subjectCtx.userDept.get(m.faculty_id) !== d.id`). The aggregate map becomes the department's
   member list; the placeholder skip stays.
2. `features/evaluations/components/CoveragePage.tsx` — the cards are the groups that have an
   aggregate (the member list); the `facultyAggregates` lookup moves above the `facultyGroups` memo.
   The "Unresolved" pseudo-department keeps its roster cards (no membership question).

**S2 — the results drill-down's membership rule** *(service + client, one atomic change)*
1. `features/evaluation-results/evaluation-results.service.ts` — `facultyAggregates` keeps only the
   faculty whose `departmentId` is this department (the users are already loaded with their
   `departmentId`); the subject rows and the `departmentAggregate` are untouched.
2. `features/evaluations/components/DepartmentSubjectView.tsx` — the cards are the groups that have
   an aggregate; the tab's "{n} faculty" count follows.

**S3 — the specs and the verification doc** (prose only)
- `specs/coverage-faculty-grouping.md` — contract 13 → the membership rule.
- `specs/evaluation-results-attribution.md` — a contract for the results drill-down's faculty list
  + the changes table.
- `docs/evaluation-surfaces-verification.md` — §3.4 and §4.4 → the membership check.

**Proof** — `npm test`, then `npm run lint` and `npm run build` (the owner's runs, AGENTS.md H1).
