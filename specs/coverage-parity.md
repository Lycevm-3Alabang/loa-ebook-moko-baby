# Evaluation Coverage — Parity With The Results Surfaces — Spec

**Version:** 1.0
**Status:** Final (approved 2026-10-20; D1–D3 resolved) — built in 9 slices, `npm test` green (55 files, 625 passed, 1 skipped); owner to run `tsc`/`lint`/`build` and open the dean's page
**Last Updated:** 2026-10-20
**Scope:** `app/admin/evaluations/coverage`, `app/dean/evaluations/coverage`,
the coverage service, and the two `evaluation-status` routes.

---

## 1. Problem

The evaluation **results** surfaces were rebuilt around one rule — *the
department that owns the evaluated section owns the result* — with a warning
row for evaluations that cannot be attributed, a per-department "No
responses" count, and a dummy account excluded from every roster. The
**coverage** surfaces were not brought along, and one of them does not work
at all.

> **Amended 2026-10-20.** The results surfaces' rule was itself changed the
> same day: the department that owns the evaluated section no longer owns the
> result — the **teacher's own** department does (the evaluated entity is the
> faculty), with the section's department as the fallback for a teacher based
> somewhere that cannot own coverage. The coverage and the results surfaces
> now resolve through the same helper, `resolveSubjectDepartment`. The
> paragraph above records the rule as it stood when this spec was written.

### 1.1 The dean's coverage page is entirely non-functional

Two independent defects, both pre-existing — and **both were specified and
missed**, not invented later. The 20261017-1749 story's plan for this route
(`runs/20261017-1749-coverage-evaluated-not-evaluated.md:51`) reads:

> **S3: Dean route new thin `app/api/dean/evaluation-status/route.ts` — auth
> + hasRole(DEAN); resolve dean's department via
> `departmentRepository.findByDeanId`; verify the requested fs belongs to that
> department (403 otherwise); call same service method with dean scope.**

So the plan had **two** branches — the detail *and* the list with dean scope
("Privacy: server-side scoping (dean own dept, admin all)" in the same
story's Decisions). What slice 3 wrote was the **detail branch only**, a
mirror of the admin's detail route, and the service had no scope parameter to
give the list. The list was therefore never served and never scoped.

**The list is refused.** `app/api/dean/evaluation-status/route.ts:19-20`
requires a `facultySubjectId`:

```ts
const facultySubjectId = searchParams.get("facultySubjectId")
if (!facultySubjectId) return NextResponse.json({ error: "facultySubjectId is required" }, { status: 400 })
```

but the list fetch (`features/evaluations/components/CoveragePage.tsx:93`)
sends only the period → **400 → the page renders an error box**. The admin
route handles both cases (`app/api/admin/evaluation-status/route.ts:19-25`:
detail when `facultySubjectId` is present, otherwise the list). The dean's
route only has the detail branch.

**The detail is refused too** — the half that *was* specified, implemented
wrongly. `app/api/dean/evaluation-status/route.ts:27` guards on
`fs.faculty?.departmentId !== dept.id`, but
`facultySubjectRepository.findByIdWithEmbeds` selects only
`id, subject_id, sections!inner(...)` — **no faculty, no `faculty_id`, no
`section_id`** (`features/admin-data/faculty-subject.repository.ts:62-77`).
`fs.faculty` is therefore always `undefined`, so the guard is
`undefined !== dept.id` → **403 for every subject**. The dean's coverage
modal cannot open anything either.

### 1.2 The dean sees every department (latent)

`features/evaluations/evaluation-status.service.ts:230-280` returns a row for
every department and the page renders them all. The dean's *results* page is
scoped to their own department
(`app/api/dean/evaluation-results/departments/[departmentId]/route.ts:37-39`),
their *evaluation landing page* is scoped (F5), but their *coverage* page is
not: other departments' subject counts, faculty names, participation and
dispute numbers are all readable. This is latent today only because of
§1.1 — fixing the list without the scope opens it. The scope was specified
in 20261017 ("call same service method with dean scope") and never
implemented.

### 1.3 The detail guard asks the wrong question (ours)

Even once §1.1 is fixed, the guard would compare the **teacher's home
department** against the dean's, while the **list** attributes a subject by
its **section** (the results change). A CS section taught by a Math-homed
faculty appears in CS's coverage list, and the CS dean clicks it → **403**.

The 20261017 plan said "verify the requested fs belongs to that department";
which department *owns* a subject is exactly the question S1 answered — the
section's. The guard now asks the list's question, so the two halves of the
page cannot disagree.

The results side does not have this problem: the dean route there checks
the **path's** department — the dean's own
(`app/api/dean/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/route.ts:37-39`).

### 1.4 The dummy account is counted (ours)

`evaluation-status.service.ts:253` adds every assignment's `faculty_id` to
the department's faculty set, and the KPI sums it
(`CoveragePage.tsx:167`). The dummy account owns real assignments, so it is
counted as a faculty member — while the results list excludes it (contract
§3.4 of `evaluation-results-attribution.md`). **The same department reports
a different "Faculties" number on the two pages.**

**Closed 2026-10-20** — and by a bigger change than the dummy exclusion:
the coverage counts are now the department's **headcount** (the faculty
accounts homed in it, `evaluation-results-attribution.md` contract §3.14),
read from the same helper as every other surface. The dummy has no home
department, so it is in no headcount; the KPI sums headcounts, which cannot
double-count a teacher who teaches in several departments.

### 1.5 The cross-semester condition is invisible

The results list warns when an evaluation points at an assignment from
another semester than the period (S2). The coverage roster is the period's
semester assignments, so such an assignment is **outside the roster**: its
subject is missing from the coverage page and its responses are not counted,
with no trace. The "Unresolved" group covers the other half (an unresolvable
department) ✓, but not this one.

### 1.6 The "Unresolved" group reports zero faculty

`CoveragePage.tsx:119` hardcodes `facultyCount: 0`, while the results list's
warning names the people behind it.

## 2. Decision

Bring the coverage surfaces onto the same footing as the results surfaces —
one attribution rule, one scope rule, one roster rule — in four slices.

- **C1 — the dean's coverage list exists and is scoped.** The dean's route
  gains the list branch (mirroring the admin's) and the service gains a
  department filter, so a dean sees **only their department**.
- **C2 — the detail guard asks the same question as the list.** It resolves
  the subject's department with the same resolver the list and the results
  pages use, and it fetches the data it actually needs.
- **C3 — the dummy is excluded from the coverage counts**, matching the
  results list.
- **C4 — the coverage page carries the same integrity warning** as the
  results list, scoped to what the viewer may see.
- **C5 — the "Unresolved" group counts its faculty.**

Slices are independent and shippable in order C1 → C2 → C3 → C4 → C5.

## 3. Pinned contracts

1. **One attribution rule.** The coverage list, the coverage detail guard and
   the results pages all resolve a subject's department the same way:
   `section → department_course → department`, else the faculty's home
   department (`resolveSubjectDepartment`, `lib/evaluation-utils.ts`).
   The coverage **detail guard** uses the resolver, not the teacher's home
   department — the same reasoning that fixed the results pages.
2. **The dean's coverage scope is their department**, in the payload and in
   the UI. A dean sees their own department's coverage and nothing else: no
   other department's rows, no other department's subjects, no other
   department's faculty names — including inside the integrity warning.
3. **The admin's coverage scope is unchanged** (every department).
4. **The dummy is not a person** (contract §3.4 of the attribution spec):
   it is excluded from the coverage faculty counts and from the KPI, exactly
   as from the results roster.
5. **The coverage roster is the period's semester assignments** — unchanged,
   and the same roster the results "No responses" count uses.
6. **The integrity warning is the same warning** the results list shows,
   with the same reason codes, filtered by the viewer's scope.
7. **A missing or unreadable assignment must not read as "not yours".**
   The detail route distinguishes "not found" (404) from "not your
   department" (403).
8. **No schema change.**

## 4. Changes

| # | Change | Path |
|---|---|---|
| C1.1 | The dean's route serves the list when no `facultySubjectId` is given, mirroring the admin's route | `app/api/dean/evaluation-status/route.ts` — **done** |
| C1.2 | The coverage service takes a `departmentId` filter and returns only that department's rows and subjects | `features/evaluations/evaluation-status.service.ts` — **done** (`getEvaluationStatus(periodId, search?, departmentId?)`) |
| C1.3 | The dean's route passes the dean's department; the coverage page needs no change (it renders whatever it receives) | `app/api/dean/evaluation-status/route.ts` — **done** |
| C2.1 | The detail guard resolves the subject's department with `resolveSubjectDepartment` over a context built for that assignment | `app/api/dean/evaluation-status/route.ts` — **done** (over `evaluationResultRepository.buildSubjectContext`) |
| C2.2 | The guard's fetch returns the fields it needs (`faculty_id`, `section_id`) | the guard reads `facultySubjectRepository.findById` (it returns both); `findByIdWithEmbeds` keeps its select for the mappings route — **done** |
| C3.1 | The dummy is excluded from the coverage faculty counts and the KPI | `features/evaluations/evaluation-status.service.ts` — **done** (the KPI is derived from the department rows, so it follows) — **superseded 2026-10-20**: the coverage faculty count is the department's **headcount** (the faculty accounts homed in it, `evaluation-results-attribution.md` contract §3.14), read from the same helper as the results surfaces. The dummy has no home department, so it is in no headcount, and the KPI sums headcounts — a teacher who teaches in three departments is counted once |
| C4.1 | The service returns the integrity warning (the results list's `listAttributionWarnings`), filtered by the viewer's department | `features/evaluations/evaluation-status.service.ts` — **done**; the rule moved to a pure helper `classifyWarningAssignments` in `lib/evaluation-utils.ts` so the coverage service can classify the data it already holds, at no query cost |
| C4.2 | The coverage page renders the same warning block as the results list | `features/evaluations/components/CoveragePage.tsx` — **done** (a copy, not a shared component: extracting it would touch the results page, outside this plan) |
| C5.1 | The "Unresolved" group counts the distinct faculty in it | `features/evaluations/components/CoveragePage.tsx` — **done** |
| D3 | The dean always loads its own department, with no "Back to departments" | `app/dean/evaluations/coverage/page.tsx` + `features/evaluations/components/CoveragePage.tsx` — **done** (an optional `departmentId` prop; the shared component's `router.replace` now uses `usePathname()` instead of a hardcoded admin path) |
| — | Out of scope | The faculty-grain "No responses" count on the coverage page (D2) · the coverage page's visual design · the student-facing evaluation flow · schema |

## 5. Risks

- **Opening the dean's coverage page exposes a scope hole if C1.2 is missed.**
  C1.1 and C1.2 must land together — a working list without the filter is
  worse than the 400 it replaces.
- **The detail guard becomes stricter or looser depending on the resolver's
  fallback.** With the faculty-driven rule, a subject whose teacher is based
  somewhere that cannot own coverage falls back to the section's department,
  so the CS dean can still open a CS-section subject taught by a teacher who
  owns no coverage. That is the same fallback every surface uses, and it is
  deliberate.
- **The warning adds a query to the coverage page's load** (the warning
  loads the period's assignments). The coverage page already polls every 30
  seconds (`CoveragePage.tsx:99`), so the cost is on a path that is already
  live. If it shows up, the warning can be fetched on demand instead of with
  the list.
- **The dummy exclusion changes two published numbers** (the per-department
  "Faculties" and the KPI). Both were wrong before; the change makes them
  agree with the results page.
- **The dean's coverage page has never worked**, so nobody knows what it
  should look like. The first render may need a visual pass — that is a
  consequence of shipping a fix, not a reason to skip it.

## 6. Verification (owner runs — H1)

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

The full manual checklist (dean's page, admin's page, the results pages) is
in `docs/evaluation-surfaces-verification.md`.

Manual:

1. As a **dean**, `/dean/evaluations/coverage` loads and shows **only**
   their department — one row in the department table, and the subject list
   contains only their subjects.
2. As a dean, opening a subject's detail works (the participation
   breakdown) — it 403s today, for every subject.
3. As a dean, a subject that their list shows can always be opened, and a
   subject from another department cannot (try the URL directly → 403).
4. The admin's coverage page is unchanged, except that the "Faculties" count
   and the KPI **no longer include "Unassigned Faculty"** — and now match
   the results list's "Faculty" for the same department. **Both are now the
   department's headcount** (the faculty accounts homed in it), read from one
   helper, so they cannot drift again.
5. The coverage page shows the same integrity warning as the results list
   when a period has an unresolvable or cross-semester evaluation.
6. The "Unresolved" group reports the number of faculty in it, not 0.

## 7. Decisions

| # | Question | Decision |
|---|---|---|
| D1 | **Should the dean's coverage page show the "Unresolved" group and the global warning?** | **No (2026-10-20).** Their scope is their department: the unresolved subjects belong to no department, and the warning's cross-semester entries carry another department's names. Both are filtered out of the dean's view (contract §3.2, §3.6). |
| D2 | **Should the coverage page get a faculty-grain "No responses" count, like the results list?** | **Deferred (2026-10-20).** The page already carries the subject-grain equivalent (`subjectsEvaluated / subjectsTotal` and the "Not started" pill). A faculty-grain count is a second, similar number on the same screen — worth it only if a reviewer asks for it. |
| D3 | **Should the dean's coverage page open directly on their department** (like their results page redirects) instead of showing a one-row table? | **Yes (2026-10-20, by the user): "Dean always load it's department", with no back button.** Implemented as an optional `departmentId` prop on the shared page; the dean's page resolves its department server-side and passes it. |
