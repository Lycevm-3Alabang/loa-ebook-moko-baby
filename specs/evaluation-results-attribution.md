# Evaluation Results — Department Attribution & Missing Faculty — Spec

**Version:** 1.2
**Status:** Final (approved 2026-10-20; D1–D6 resolved) — v1.1 recorded the coverage page's exception; **v1.2 closes it**: the results surfaces now resolve through the same faculty-driven resolver, so one rule governs every surface
**Last Updated:** 2026-10-20
**Scope:** `app/admin/evaluations/results` (+ its `[departmentId]` detail),
`app/dean/evaluations/results/[departmentId]`, the coverage surface, and the
shared attribution helpers in `lib/evaluation-utils.ts`.

---

## 1. Problem

Symptom, reported on the admin department page: **"some users are not
reflected."** The page lists one row per *evaluated* faculty-subject, and a
person who is missing is missing for one of four reasons. Two of those
reasons are not data problems — they are **attribution** problems, and they
are the same bug wearing different clothes on three surfaces.

### 1.1 The app has three department-attribution rules

| Surface | Rule | Code |
|---|---|---|
| Admin results **list** + **detail** | `users.departmentId` → else teaching chain (`faculty_subjects` → `sections` → `department_courses`), scoped to the period's semester | `lib/evaluation-utils.ts:371-380` (`resolveFacultyDepartment`), used by `features/evaluation-results/evaluation-results.repository.ts:238-245` |
| Dean results **detail** | `users.departmentId` only — no chain, no fallback | `app/api/dean/evaluation-results/departments/[departmentId]/route.ts:52-55` (`userRepository.listByDepartment`) |
| Evaluation **coverage** | `users.departmentId` only, applied to the **subject** (not the person) | `features/evaluations/evaluation-status.service.ts:147-151, 209, 234` |

The question "whose results are these?" therefore has three different
answers depending on which page the admin opens. The **results** surface
answers it at the **person** level; the **coverage** surface answers it at
the **subject** level. Both attribute a subject to the faculty's *home*
department — but only the results surface has a chain fallback, and only the
results surface is person-level.

### 1.2 A subject belongs to the teacher's own department

The evaluated entity is the **faculty**: a `faculty_subjects` row is a
teacher's assignment to a subject in a section, so the department that owns
the assignment is the one the teacher belongs to. A faculty member homed in
**Math** who teaches a **CS** section has their CS subject filed under
**Math**:

- Admin results list → counted in **Math's** row.
- Admin results detail, Math → the CS subject code appears in **Math's** table.
- Admin results detail, CS → **absent** (the person is not homed in CS).
- Dean of CS → **absent** (the person is not homed in CS).
- Coverage → the CS subject is attributed to **Math**, and the row says whose
  section it is.

Every CS surface is blind to that evaluation, and Math's surfaces show a
subject it does not own — but the **teacher** is the one being evaluated, and
the coverage and the results pages now say the same thing about them.

**The chain is the fallback.** For a faculty with **no** `users.departmentId`
— the CSV-unmatched population — or one whose home department owns no course
of its own (the placeholder buckets), the rule falls through to the chain and
files them under the section's department. The chain answers "whose section is
this?"; the home department answers "whose teacher is this?"; the evaluated
entity is the teacher, so the home department comes first.

> **v1.2 — the coverage page joins the same rule.** The coverage page was
> already **faculty-driven** (the user: "since it is Faculty-Subject then
> it's faculty driven"); the results pages now resolve through the same
> resolver, so the two pages cannot disagree about a teacher. The rule is
> specified in `coverage-faculty-grouping.md` §1.1 (D5) and implemented in C5
> there.

### 1.3 The dean page omits the dept-agnostic faculty

`listByDepartment` matches `users.departmentId` only, so a faculty with
`departmentId = NULL` — created dept-agnostic by the faculty CSV import when
the department code is unknown (`lib/services/etlEvaluation.ts:318-336`) —
is **invisible on the dean's page** while being **visible on the admin's**
page (chain fallback). The admin and the dean of the same section are
looking at different faculty.

### 1.4 What "Unassigned" actually is: the dummy account

The CSV's default landing place for a faculty row with a blank faculty email
is a **real `users` account** — the dummy — not a department and not a
group:

| Property | Value | Code |
|---|---|---|
| email | `placeholder@lyceumalabang.edu.ph` | `lib/services/etlEvaluation.ts:20` |
| display name | "Unassigned Faculty" | `lib/services/etlEvaluation.ts:679` |
| department | **none** (dept-agnostic) | `lib/services/etlEvaluation.ts:275-282` |
| owns | **real `faculty_subjects` rows** | `lib/services/etlEvaluation.ts:677-681` |
| evaluatable | **never** | `features/evaluations/evaluations.repository.ts:101` |

⇒ The dummy owns assignments, so **any roster built from assignments must
exclude it**, or the admin sees a teacher named "Unassigned Faculty" with 0
responses. Its email constant is the only reliable marker (no department,
no role distinction).

**The dummy is never an evaluated entity for a student.** The list of
assignments a student may evaluate already drops it
(`features/evaluations/evaluations.repository.ts:150,188` — "Unassigned loads
(shared dummy) are never evaluatable"). That invariant now also sits on the
**write** path, where it belongs: creating an evaluation against a dummy
assignment is refused (`app/api/evaluations/route.ts`), opening one is
refused (`app/api/evaluations/[id]/route.ts` — the student never sees
"Professor: Unassigned Faculty"), and submitting one is refused
(`app/api/evaluations/[id]/submit/route.ts`). The check is
`evaluationRepository.isDummyAssignment` (the assignment's faculty is the
dummy account) — the same fact the load path uses. Covered by
`lib/__tests__/evaluations-dummy-guard.test.ts`.

### 1.5 The "Unassigned" label is overloaded

Three different things can wear that name:

1. The `__unknown__` **pseudo-group** — a sentinel, not a department id.
   Rendered as the literal string "Unassigned" by
   `app/api/admin/evaluation-results/route.ts:31` and
   `features/evaluations/evaluation-report.service.ts:138`; `CoveragePage.tsx:66`
   carries its own copy of the sentinel.
2. A **real `departments` row** named "Unassigned" (a legitimate CSV bucket).
3. The **dummy account** (§1.4).

If a real "Unassigned" department row exists, the results list shows **two
rows both labelled "Unassigned"** — and the pseudo one is a dead end
(§1.6). The label cannot distinguish "a department that has no results" from
"a bucket of people we could not place".

### 1.6 The "Unassigned" row is a dead end

Clicking the pseudo-group row pushes
`/admin/evaluations/results/__unknown__`
(`app/admin/evaluations/results/page.tsx:178`); the API then calls
`departmentRepository.findById("__unknown__")`
(`app/api/admin/evaluation-results/departments/[departmentId]/route.ts:23`),
gets `null`, and the page renders "Department" + "No evaluation data found for
this department." The admin sees that responses exist somewhere and cannot
find out whose.

### 1.7 The `__unknown__` bucket is a data-integrity signal, not a population

Under the admin rule, a faculty lands in `__unknown__` only if they have
**no** home department **and** the evaluation's assignment is not in the
period's semester — because the chain resolves everything else. So the
bucket is empty in a healthy dataset, and non-empty means an evaluation
points at an assignment outside its own period. That is an integrity
condition, and it deserves a warning, not a department row.

### 1.8 Nobody with zero responses is visible on the results surfaces

The candidate population is derived from evaluations
(`features/evaluation-results/evaluation-results.repository.ts:28-38`:
`status='SUBMITTED' ∧ isDisabled=false ∧ facultySubjectId IS NOT NULL`), so
a person with **no** evaluation in the period is not a candidate at all —
there is no "0 responses" row, no count, no placeholder. The coverage page
does have a roster (`facultySubjectRepository.list({ semesterId })`,
`features/evaluations/evaluation-status.service.ts:130`) and shows those
subjects as "Not started" — but only for people **with an assignment in the
period's semester**. A person with no assignment (new hire, or an assignment
in a different semester) appears on no page in the app.

### 1.9 Counts that could not reconcile

Four surfaces counted "the faculty of a department" from four different
**populations**: the results list counted the faculty with results **plus**
the no-response roster (two sets that overlap when a person has one evaluated
and one unevaluated section), the coverage page counted the teachers with an
assignment in the term and then **summed** those counts across departments (a
teacher teaching in three departments counted three times), the export CSVs
and the report page counted the faculty with results only, and the
Department Health report counted the users homed in the department. The same
department showed a different number on every surface, and a school with 9
faculty showed 22.

**Closed 2026-10-20** by the headcount rule (contract §3.14): a department's
faculty count is the number of faculty accounts homed in it, counted once,
and every surface reads it from one helper.

---

## 2. Decision

**One attribution rule, applied at the level the data actually belongs to,
implemented once and shared by every surface.** The faculty's own department
owns the result (D1, resolved 2026-10-20); the section's department is a
**fallback** for a teacher based somewhere that cannot own coverage.

- **S1 — Faculty-level attribution + one implementation.** A department's
  results are the **faculty-subjects whose teacher belongs to that
  department**; the admin and dean surfaces share one service; the dean's
  duplicated route implementation is retired (D2).
- **S2 — The pseudo-group stops being a department.** `__unknown__` leaves
  the results grouping (it cannot be produced under S1) and reappears, if
  ever, as an **integrity warning** on the results list (§1.7). The
  "Unassigned" label is freed for the real department that owns it.
- **S3 — Zero-response faculty become visible.** Every department on the
  results list carries a "no responses" count and an expandable list of the
  people who received nothing in the period — with the dummy excluded
  (§1.4).
- **S4 — Counts reconcile.** The list's `facultyCount` equals the number of
  distinct faculty the department's detail table shows.

Slices are independent and shippable in order S1 → S2 → S3 → S4.

---

## 3. Pinned contracts

1. **One resolver, one rule.** `resolveSubjectDepartment(facultySubject, ctx)`
   lives beside `resolveFacultyDepartment` in `lib/evaluation-utils.ts` and is
   the only place a department is decided for a subject. Precedence: the
   faculty's `users.departmentId` **when that department owns at least one
   course**, else `section → department_course → department`, else `null`. The
   gate keeps the placeholder buckets ("Unassigned", "Admin") from
   accumulating everyone's results, and it makes every returned id a real
   `departments.id`.
2. **Section-level beats person-level.** Where a surface shows *subjects*
   (results detail, coverage), the department comes from the subject. Where
   a surface shows *people* (the dean's aggregate), the person's own
   assignment set is what is aggregated — never the other way round.
3. **The chain stays scoped to the period's semester.** A `faculty_subjects`
   row from a different semester does not establish a department
   (`evaluation-results.repository.ts:77`) — and an evaluation pointing at
   one is an integrity condition (S2), not a department.
4. **The dummy is not a person.** Any roster, count, or list built from
   assignments excludes `placeholder@lyceumalabang.edu.ph`
   (`lib/services/etlEvaluation.ts:20`). The dummy owns real assignments
   and would otherwise be reported as a teacher with zero responses.
5. **Zero responses is a fact, not a row — and not a results surface.**
   A person with no evaluation has no row in the results table. The count and
   the expandable list that used to be the surface are **gone** (2026-10-20):
   the results list does not show them, the payload does not carry them, and
   `listDepartmentRosters` no longer exists. Who was expected to be
   evaluated, and who answered, is the **coverage page's** question, and it
   answers it per subject. The roster was the period's semester assignments
   — the same roster coverage uses — but its exclusion was per
   **assignment**, so a person with one evaluated and one unevaluated
   section was counted twice. That was the second of the two counting bugs.
6. **`__unknown__` is not a department id.** It leaves the results grouping
   key and the URL space. The results list's dead-end link to
   `/admin/evaluations/results/__unknown__` is removed by construction.
7. **Admin and dean ship together** (mirror parity, per
   `specs/student-import-stepper/import-dedicated-page.md` §3.7). The dean
   page and the admin page must never disagree about a person's results.
8. **The dean's visibility guard moves with the dean's membership set.**
   `app/api/dean/evaluation-results/visibility/route.ts:35-39` scopes the
   show/hide toggle to `listByDepartment`. If the dean's membership rule
   changes, this guard must change in the same slice — otherwise the toggle
   answers "You can only manage visibility for faculty in your own
   department" for exactly the faculty S1 adds.
9. **The dean's results-released gate is computed from the results, not
   from the roster.** Today it is `anyVisible = facIds.some(...)` over the
   homed faculty (`departments/[departmentId]/route.ts:57-61`). Under a
   section-based membership set that gate can answer 403 for a dean who
   *does* have visible results. It must gate on the returned subjects —
   otherwise the dean's page says "not released" while the dean's own ZIP
   contains the data.
10. **The dean's payload keeps the dean's own `department`.** The shared
    service's lookup can be null; the dean route returns its own `dept`
    (never null), because the dean page reads `department?.name`.
11. **A missing `users` row renders, it does not crash.** The group routes
    return `faculty: null` when the user row is missing
    (`departments/[departmentId]/groups/[facultySubjectId]/route.ts:90`,
    admin twin likewise), and both group-detail pages read `data.faculty.name`
    **unguarded** → TypeError → error boundary. The department page already
    renders that person as "Unknown"
    (`evaluation-results.service.ts:120`). The group pages must do the same.
12. **No schema change.** Every fact needed is already in `users`,
    `faculty_subjects`, `sections`, `department_courses`, `evaluations`.
13. **PostgREST caps.** Every new `.in()` call is chunked at 100
    (AGENTS.md Lesson 7), and an empty id list returns early — never
    `.in.()` with zero values.
14. **One headcount, one place.** A department's faculty count is the number
    of faculty accounts homed in that department (`users.departmentId`),
    soft-deleted accounts excluded, counted once. A teacher who teaches a
    section owned by another department is counted in their own department.
    The **teaching roster** (who was assigned to teach this term) is a
    different number: it lives on the coverage page, per subject, and it is
    never added to a headcount. Every surface reads the headcount from one
    helper (`features/users/users.service.ts` →
    `getFacultyCountsByDepartment()`), so no two surfaces can drift. A
    `DEAN|FACULTY` account is faculty (it holds a FACULTY role row); a
    `DEAN`-only account is not.
15. **A drill-down's "By Faculty" tab lists the department's own faculty.**
    Membership is the teacher's **home** department (`users.departmentId`);
    the section's department is irrelevant to it. A teacher who teaches a
    section owned by another department is not a member of that department
    and gets **no card** there — their subject, its students and its
    responses stay in the department's **"By Subject & Section"** tab,
    because that coverage is the department's, and the department's pooled
    rating is computed over the subjects, not over the faculty list. This
    binds the coverage drill-down and the results drill-down (the admin
    page and the dean's twin) to the same set as the headcount in §3.14.

---

## 4. Changes

| # | Change | Path |
|---|---|---|
| S1.1 | New `resolveSubjectDepartment(facultySubject, ctx)` + a context that can resolve a section's department | `lib/evaluation-utils.ts` — **done 2026-10-20** (pure function + 9 unit tests, no behaviour change; `lib/__tests__/evaluation-results-aggregation.test.ts`); **amended 2026-10-20** — the resolver is now the faculty-driven rule (contract §3.1), its unit cases were removed, and the coverage service's own cases are the guard |
| S1.2 | Results service selects the department's **faculty-subjects** (not the faculty homed there) and attributes each row by S1.1 | `features/evaluation-results/evaluation-results.service.ts` — **done 2026-10-20**; the rule it attributes by was amended 2026-10-20 (faculty-driven) |
| S1.3 | `listLiveDeptAverages` groups by the subject's department; `listDepartmentFacultyIds` → `listDepartmentAssignments` | `features/evaluation-results/evaluation-results.repository.ts` — **done 2026-10-20** (pooling moved from per-faculty to per-assignment); the grouping rule was amended 2026-10-20 (faculty-driven) |
| S1.4 | Dean route delegates to the shared service — delete the duplicated ~120-line aggregation, **keep the five dean guards** (role · `findByDeanId` · department match · `assertPeriodIsActive` · results-released, now gated on the returned subjects per contract §3.9); return the dean's own `dept` | `app/api/dean/evaluation-results/departments/[departmentId]/route.ts` — **done 2026-10-20** |
| S1.5 | Dean's visibility guard uses the same membership set as S1.4 (contract §3.8) | `app/api/dean/evaluation-results/visibility/route.ts` — **done 2026-10-20** |
| S1.6 | Coverage attributes a subject to its teacher's own department, falling back to the section's department | `features/evaluations/evaluation-status.service.ts` — **done 2026-10-20**; the pseudo-group is labelled "Unresolved" in `features/evaluations/components/CoveragePage.tsx` (not removed: it is the integrity case's only surface). **Amended 2026-10-20** — the service now calls the shared resolver instead of carrying its own copy of the rule |
| S1.7 | Group-detail pages render a missing user as "Unknown" instead of crashing on `data.faculty.name` (contract §3.11) | `app/admin/evaluations/results/[departmentId]/[facultySubjectId]/page.tsx`, `app/dean/evaluations/results/[departmentId]/[facultySubjectId]/page.tsx` — **done 2026-10-20** |
| S2.1 | Repository returns the integrity condition: evaluations whose assignment is outside the period's semester (count + faculty names) | `features/evaluation-results/evaluation-results.repository.ts` — **done 2026-10-20** (`listAttributionWarnings`: also covers an assignment whose department cannot be resolved) |
| S2.2 | Results list renders **one warning row** naming the affected faculty ("N evaluations could not be attributed to a department"); the pseudo-group row and its dead-end link are gone | `app/api/admin/evaluation-results/route.ts` + `app/admin/evaluations/results/page.tsx` — **done 2026-10-20** |
| S3.1 | Repository returns, per department, the roster of assignments in the period's semester (dummy excluded) minus those with a submitted evaluation | `features/evaluation-results/evaluation-results.repository.ts` — **done 2026-10-20**, then **removed 2026-10-20**: the results surfaces do not show a no-response roster, so the method, its interface entry and its test block are gone (the coverage page answers that question per subject) |
| S3.2 | Results list shows a "No responses" count per department + an expandable list of names | `app/admin/evaluations/results/page.tsx` + `app/api/admin/evaluation-results/route.ts` — **done 2026-10-20**, then **removed 2026-10-20**: the coverage page owns that number, so the column, the payload field and the query are gone |
| S4.1 | `facultyCount` on the list = distinct faculty the detail table shows (evaluated ∪ no-response roster) | **superseded 2026-10-20** — the list's `facultyCount` is the department's **headcount** (contract §3.14), the same number the coverage page, the export CSVs, the report page and the Department Health report print. The list also counts a faculty whose evaluation carries no rating rows, and the department's total covers both sets → **the headcount covers every surface** |
| S4.2 | One shared headcount helper read by every surface | `features/users/users.service.ts` → `getFacultyCountsByDepartment()` — **done 2026-10-20**; readers: the admin results route, the dean results route, the coverage service, the admin results export, the dean results export, the report service, the Department Health report |
| S4.3 | The drill-downs' "By Faculty" tab lists the department's **own** faculty (contract §3.15) | `features/evaluations/evaluation-status.service.ts` + `features/evaluations/components/CoveragePage.tsx` (the coverage drill-down) and `features/evaluation-results/evaluation-results.service.ts` + `features/evaluations/components/DepartmentSubjectView.tsx` (the results drill-down, admin + dean) — **done 2026-10-20**: the per-faculty aggregates are the members only, and the cards come from that map. The subject rows, the department's pooled rating, the visibility toggles and the export CSVs are untouched |
| S2 | **Done 2026-10-20** — the "Unresolved" row is gone from the results list and the dead-end link with it; the integrity condition is now a warning row naming the faculty. The write path (both visibility routes) now **requires** `evaluationPeriodId`: a `semesterId` body would have written a row keyed by a semester id, and made the dean's membership check resolve an empty set. |
| S3 | **Done 2026-10-20** — the dean's dashboard (`app/dean/page.tsx`) and the dean's evaluation landing page (`app/dean/evaluations/page.tsx`) now count the **teaching roster** (the faculty with an assignment whose section the department owns) instead of the people merely homed there, through the shared `getDepartmentTeachingFaculty`. The card is labelled "Teaching" and the roster "Teaching Roster — Faculty with a section in {dept} this term". The term is the active evaluation period's semester, falling back to the active semester. The consultation workload cards on the same dashboard are a different population and are unchanged. |
| S4 | **Done 2026-10-20** — the `semesterId` fallback is gone from both visibility routes; a body without `evaluationPeriodId` is a 400. The write path was already corrupting the `evaluation_results` row when given a semester id. |
| S5 | `resolveFacultyDepartment` / `resolveDepartmentFaculties` are now unused by app code (tests only). Marked superseded; delete in a cleanup. |
| — | Out of scope | The ZIP/CSV export payload format (contents follow the new rule; the folder set is `departmentRepository.listAll()` and is unchanged) · the coverage page's visual design · the student-facing evaluation flow · the dummy account itself · schema |

---

## 5. Risks

- **Numbers move between departments.** This is the point of S1 — the
  current placement is wrong — but it is the loudest risk in this spec. The
  movement is exactly the off-diagonal of the home→section matrix: a
  faculty homed in A, teaching a section owned by B, moves from B to A.
  Mitigation: ship S1 alone first, compare one period's numbers by hand
  (§6), and keep the release note explicit.
- **The dean's page changes shape.** S1.4 replaces home-department
  membership with section ownership, so a dean may see faculty they did not
  see before, and lose faculty they did. The dean's release gate
  ("ADMIN hasn't released results yet") must be preserved exactly, and
  re-expressed against the returned subjects (contract §3.9) so it cannot
  disagree with the dean's own ZIP.
- **The dean's page and ZIP already disagree today** — the page uses
  home-only membership, the ZIP uses the chain
  (`export/route.ts:41`). Retiring the copy resolves a live inconsistency
  inside the dean's own feature; it is a fix, not a style change.
- **The dean's page output changes twice over**: non-homed faculty gain real
  names (today the copy resolves names from the homed roster, so they read
  "Unknown"), and the CSV-unmatched faculty appear at all.
- **The per-department faculty aggregate now pools only that department's
  subjects.** Before, a faculty's aggregate on a department page pooled every
  evaluation they had, including their subjects in other departments. The
  figure is now the department's own, which is what the page claims to show.
- **The dean's release gate now reads the results, not the roster** (contract
  §3.9). A homed faculty who is released but has no result in this period no
  longer opens the page: it answers 403 instead of an empty table. Intended,
  but a visible change.
- **The dean's route now aggregates before it checks the release.** The old
  code answered 403 without touching the evaluations; the new code runs the
  shared aggregation first. The data still never leaves the server — it is a
  cost, not a leak.
- **Extra queries.** S1 needs section → department_course for every
  candidate faculty-subject. `sections` is small; `department_courses` is
  fetched once and mapped in memory (the existing pattern at
  `evaluation-results.service.ts:68-70`).
- **The dummy leaks into a count.** Contract §3.4 exists because the dummy
  owns real assignments; the exclusion is by email constant, so a renamed
  dummy would slip through. Cheap to re-check; state it in the review.
- **Three surfaces, one rule.** If S1.6 (coverage) ships separately from
  S1.2 (results), the two surfaces disagree during the gap. S1.6 ships in
  the **same unit** as S1.2/S1.3 (D3) — there is no interval in which the
  results pages and the coverage page disagree.
- **Coverage numbers move too.** The coverage page's department rows and
  its subject list are attributed by the same rule, so a Math-homed
  faculty's CS subject stops counting under Math. The coverage page's
  synthetic "Unassigned" group empties out (a subject's department is
  always defined) — a real "Unassigned" **department**, if one exists, is
  unaffected and remains a normal department.
- **The "Unassigned" name is now unambiguous on the results list** (the
  pseudo-group is gone), but a real "Unassigned" department may still hold a
  CSV default bucket whose faculty teach real sections — under S1 those
  subjects move to their section's department, and the "Unassigned"
  department's results row may empty out. Say so in the release note.
- **The faculty counts drop to the headcount (2026-10-20).** The results
  list's "Faculty", the coverage page's "Faculties" and its KPI now print the
  school's headcount instead of a teaching roster. For a school whose
  teachers teach across departments, every one of those numbers **drops** —
  the coverage KPI most of all (22 → 9 in the school this was found on). The
  numbers that do not move: the subjects, the students, the responses, the
  ratings, the sentiment, the consultation figures.

---

## 6. Verification (owner runs — H1)

```powershell
npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npx vitest run }; if ($?) { npm run build }
```

The manual checks and the **home → section matrix** are in
`docs/evaluation-surfaces-verification.md` — the matrix is the only number
that says how much the new attribution actually moved on real data.

Pick one period and one faculty member per scenario; check all four
surfaces agree:

| Scenario | Admin results list | Admin dept detail | Dean dept page | Coverage |
|---|---|---|---|---|
| Homed A, teaches a section owned by B | subject under **A** | **A** lists the subject | dean of **A** lists it | under **A** — both pages are faculty-driven (§1.2) |
| `departmentId = NULL` (CSV-unmatched), teaches a section owned by B | subject under **B** | **B** lists it | dean of **B** lists it | under **B** — the home cannot own coverage, so the section's department takes over |
| The dummy account | absent | absent | absent | absent — and never in a "no responses" count |
| Assignment outside the period's semester | integrity warning names the faculty | — | — | — |
| Zero responses in the period | no roster on this surface — the coverage page's per-subject status answers it | n/a (no row) | n/a | subject shows "Not started" |

Then: the list's `facultyCount` is the department's **headcount** (contract
§3.14) — the same number the coverage page's "Faculties" column and its KPI
print, and the same number the Admin dashboard's "Faculty" card prints for
the whole school; and no row in the list is a dead-end link.

---

## 7. Open decisions

| # | Question | Recommendation |
|---|---|---|
| D1 | **Precedence.** Section's department first, or the faculty's home department first? | **RESOLVED 2026-10-20 — the faculty's own department first** (when that department owns at least one course), the section's department as the fallback. The evaluated entity is the faculty, so the teacher's department groups the results; the chain answers "whose section is this?" and is the fallback for a teacher based somewhere that cannot own coverage (no home, or a home with no courses). Later the same day the coverage page's rule was adopted for the results pages too, so the two surfaces share one resolver (`resolveSubjectDepartment`). Movement = the home→section matrix's off-diagonal. |
| D2 | **Dean surface.** Retire the dean's duplicated route implementation in favour of the shared service (S1.4)? | **RESOLVED 2026-10-20 — yes, and align all three dean membership rules in one unit** (page, ZIP, visibility). The page is home-only, the ZIP is chain-based, the visibility guard is home-only — the dean feature contradicts itself today. Caveats pinned as contracts §3.9–§3.11 and change S1.7. |
| D3 | **Coverage in scope.** S1.6 changes the coverage page's attribution, which moves coverage numbers between departments. | **RESOLVED 2026-10-20 — in scope, same unit as S1.2/S1.3.** Leaving coverage on the old rule means the admin's results page and coverage page keep disagreeing about which department owns a subject — the original complaint, moved rather than closed. |
| D4 | **Integrity warning shape.** S2 replaces the "Unassigned" row with a warning when an evaluation points outside the period's semester. | **RESOLVED 2026-10-20 — one warning row in the results list, naming the affected faculty.** Rare, actionable (fix the period binding), and it replaces a dead-end link with information instead of silence. |
| D5 | **Zero-response roster source.** Assignments in the period's semester, or the department's homed faculty? | **RESOLVED 2026-10-20 — assignments in the period's semester** (contract §3.5), the same roster coverage uses, so the two surfaces cannot disagree about who was expected to be evaluated. The dummy is excluded (contract §3.4). **Superseded later the same day**: the roster is no longer a results surface at all (contract §3.5, §3.14) — the coverage page answers that question per subject, and the results list prints the headcount. |
| D6 | **Should the results detail page also show 0-response faculty as rows?** | **RESOLVED 2026-10-20 — no.** The count and the expandable list on the results list are the surface. A 0-response row in a *results* table reads as a data error, and a second surface means a second implementation to keep in sync. **Superseded later the same day**: the count and the list are gone too, so neither surface shows a 0-response figure. |
