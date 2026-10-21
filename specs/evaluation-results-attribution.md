# Evaluation Results — Department Attribution & Missing Faculty — Spec

**Version:** 1.7
**Status:** Final (approved 2026-10-20; D1–D6 resolved) — v1.1 recorded the `/admin/evaluations/coverage` page's exception; **v1.2 closes it**: the results surfaces now resolve through the same faculty-driven resolver, so one rule governs every surface; **v1.3 adds §3.18**: a result figure is computed over the **complete** rating set — every read behind a figure pages past PostgREST's 1,000-row cap; **v1.4 (2026-10-21) retires the aggregate**: no surface opens a direct connection, the scope rules live in the repository (§3.19) and the weights travel with the read (§3.20); **v1.5 (2026-10-21) records the scope divergence**: the three reads do not scope the same set (§1.10) — the `/admin/evaluations/results/[departmentId]` page derives its response set from the term's subject list, while the period is the strict gate (§3.21); **v1.6 (2026-10-21) resolves D7**: the period scopes the responses — a department's results are **the period's evaluations by the faculty homed in it**, and the term's assignments scope only the subject list (§3.21, S6.1); **v1.7 (2026-10-21) settles S6.1's scope**: the two ids the route already has are enough, the list page's `offSemester` banner is retired, the department page's "Faculty" becomes the headcount, and the subject page's department guard (D9) joins the slice; **v1.8 (2026-10-21) fixes the members read**: `listFacultyByDepartment` — the role *and* the department are both filters in the query, so the department's students never cross the wire (the line named `listByDepartment`, which transfers them) — the same population, so no number moves; **v1.9 (2026-10-21) makes the department page per-teacher**: the "By Subject & Section" table and the tab strip are gone, the faculty cards are the page (the rows move into the cards' expanded rows), the names are shown as "Surname, FirstName", the cards sort by surname, and several cards can be open at once — the **data is unchanged**; **v1.10 (2026-10-21) builds the dean's guards and D9**: the dean's visibility and student-breakdown guards read the **members** (the accounts homed in the department — the set widens) instead of the term's teaching, and both `groups/[facultySubjectId]` routes now check that the subject belongs to the department (the teacher's home) — **D9 RESOLVED**; **v1.13 (2026-10-21): every department is a row on the results list** — a department with no responses in the period is a row with no rating ("—"), not a missing row (the list's rows came from the period's evaluations, so a department nobody answered in did not appear) **v1.12 (2026-10-21) makes the results surfaces about the ratings**: the cards are the **members** (with or without results, so the card's "Faculty" tallies with the cards below and with the headcount everywhere else), the response counts are **gone** from the results surfaces (the coverage page owns them — a bare count invites a ratio the page cannot answer), and the weakest rubric is flagged only when it is **"Unsatisfactory" or worse** (a "Needs Attention Rubric" that appears only when it is critical) **v1.11 (2026-10-21) retires the results list's `offSemester` banner**: the results list is period-scoped, so a response on an earlier term's assignment is a response of this period — the banner warned over a number it now contradicts. The **results** payload carries the integrity warnings only (`IntegrityWarnings`); the **coverage** page keeps its own condition (its list *is* term-scoped) and the shared rule with it
**Last Updated:** 2026-10-21
**Scope:** `app/admin/evaluations/results` (+ its `[departmentId]` detail),
`app/dean/evaluations/results/[departmentId]`, the coverage surface, and the
shared attribution helpers in `lib/evaluation-utils.ts`.
**Page names:** the pages are named by their **URL** throughout this spec —
`/admin/evaluations/results` (the results list),
`/admin/evaluations/results/[departmentId]` (the department page),
`/admin/evaluations/results/[departmentId]/[facultySubjectId]` (the subject page),
`/admin/evaluations/coverage` (the coverage page),
`/faculty/evaluations/subjects/[facultySubjectId]` (the faculty page). The
dean's twins are the same paths under `/dean/`.

---

## 1. Problem

Symptom, reported on `/admin/evaluations/results/[departmentId]`: **"some users
are not reflected."** The page lists one row per *evaluated* faculty-subject, and a
person who is missing is missing for one of four reasons. Two of those
reasons are not data problems — they are **attribution** problems, and they
are the same bug wearing different clothes on three surfaces.

### 1.1 The app has three department-attribution rules

| Surface | Rule | Code |
|---|---|---|
| `/admin/evaluations/results` + `/admin/evaluations/results/[departmentId]` | `users.departmentId` → else teaching chain (`faculty_subjects` → `sections` → `department_courses`), scoped to the period's semester | `lib/evaluation-utils.ts:371-380` (`resolveFacultyDepartment`), used by `features/evaluation-results/evaluation-results.repository.ts:238-245` |
| `/dean/evaluations/results/[departmentId]` | `users.departmentId` only — no chain, no fallback | `app/api/dean/evaluation-results/departments/[departmentId]/route.ts:52-55` (`userRepository.listByDepartment`) |
| `/admin/evaluations/coverage` | `users.departmentId` only, applied to the **subject** (not the person) | `features/evaluations/evaluation-status.service.ts:147-151, 209, 234` |

The question "whose results are these?" therefore has three different
answers depending on which page the admin opens. The **results** surface
answers it at the **person** level; the **coverage** surface answers it at
the **subject** level. Both attribute a subject to the faculty's *home*
department — but only the results surface had a chain fallback, and only the
results surface was person-level. **2026-10-20: one rule, no chain** — the
home is the whole rule everywhere (contract §3.1), so the three answers are
one answer.

### 1.2 A subject belongs to the teacher's own department

The evaluated entity is the **faculty**: a `faculty_subjects` row is a
teacher's assignment to a subject in a section, so the department that owns
the assignment is the one the teacher belongs to. A faculty member homed in
**Math** who teaches a **CS** section has their CS subject filed under
**Math**:

- `/admin/evaluations/results` → counted in **Math's** row.
- `/admin/evaluations/results/[departmentId]` (Math) → the CS subject code appears in **Math's** table.
- `/admin/evaluations/results/[departmentId]` (CS) → **absent** (the person is not homed in CS).
- Dean of CS (`/dean/evaluations/results/[departmentId]`) → **absent** (the person is not homed in CS).
- Coverage → the CS subject is attributed to **Math**, and the row says whose
  section it is.

Every CS surface is blind to that evaluation, and Math's surfaces show a
subject it does not own — but the **teacher** is the one being evaluated, and
the `/admin/evaluations/coverage` page and the results pages now say the same thing about them.

**No chain (2026-10-20).** For a faculty with **no** `users.departmentId`
— the CSV-unmatched population — there is no department, so their subject is
**unattributed**: the `/admin/evaluations/coverage` page's "Unresolved" group and the results
list's integrity warning name them, and no department's row counts them. The
same goes for a placeholder bucket as a home: the bucket holds the teaching
of the faculty homed in it, and nobody else's. The home department answers
"whose teacher is this?"; the evaluated entity is the teacher, so the home is
the whole rule.

> **v1.2 — the `/admin/evaluations/coverage` page joins the same rule.** The `/admin/evaluations/coverage` page was
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
page (the chain fallback, then). The admin and the dean of the same section
are looking at different faculty. **2026-10-20: the chain is gone** — such
a faculty has no department, so their subject is unattributed on **both**
surfaces, and the integrity warning names them.

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

⇒ The dummy owns assignments, so **any list built from assignments must
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

If a real "Unassigned" department row exists, the `/admin/evaluations/results` page shows **two
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
there is no "0 responses" row, no count, no placeholder. The `/admin/evaluations/coverage` page
does have a subject list (`facultySubjectRepository.list({ semesterId })`,
`features/evaluations/evaluation-status.service.ts:130`) and shows those
subjects as "Not started" — but only for people **with an assignment in the
period's semester**. A person with no assignment (new hire, or an assignment
in a different semester) appears on no page in the app.

### 1.9 Counts that could not reconcile

Four surfaces counted "the faculty of a department" from four different
**populations**: the `/admin/evaluations/results` page counted the faculty with results **plus**
the no-response subjects (two sets that overlap when a person has one evaluated
and one unevaluated section), the `/admin/evaluations/coverage` page counted the teachers with an
assignment in the term and then **summed** those counts across departments (a
teacher teaching in three departments counted three times), the export CSVs
and the report page counted the faculty with results only, and the
Department Health report counted the users homed in the department. The same
department showed a different number on every surface, and a school with 9
faculty showed 22.

**Closed 2026-10-20** by the headcount rule (contract §3.14): a department's
faculty count is the number of faculty accounts homed in it, counted once,
and every surface reads it from one helper.

### 1.10 The three reads do not scope the same set

The **attribution** rule is one rule everywhere (contract §3.1) — but the
**scope** is not. Three reads answer "whose results are these?" and only one
of them filters the same way:

| Read | Scope filter | Membership |
|---|---|---|
| The results **list** and the dean view — `listDepartmentFigures` (`evaluation-results.repository.ts:449`), `listPeriodFigures` (`:570`) | the **period** only: `evaluation_period_id` ∧ `status='SUBMITTED'` ∧ `isDisabled=false` | the accounts **homed** in the department (`users.departmentId`) |
| The **`/faculty/evaluations/subjects/[facultySubjectId]` page** — `listSubmittedByPeriodAndEvaluateeAndFS` (`evaluations.repository.ts:526`) | the **period** only | the evaluatee is the teacher |
| The **`/admin/evaluations/results/[departmentId]` page** and **both exports** — `getDepartmentSubjectResults` (`evaluation-results.service.ts:174`) | the period **∧ the term's assignments**: `listDepartmentTeachingAssignments(deptId, period.semesterId)` (`:153`), then `memberIds.has(e.facultySubjectId)` (`:190`) | the members' assignments ∩ the home department |

So the `/admin/evaluations/results/[departmentId]` page **drops** a response whose assignment is outside the
period's semester, and the list **counts** it. Three consequences, none of
them visible in §6's verification table:

1. **The list's headline and the `/admin/evaluations/results/[departmentId]` page's headline already
   disagree** — same department, same period, one click apart. The list's Avg
   Rating comes from `listDepartmentFigures` (period-scoped); the department
   page's comes from `getDepartmentSubjectResults`'s `departmentAggregate`
   (term-scoped).
2. **The exports disagree with the screen.** Both exports read
   `getDepartmentSubjectResults`, so the CSV is on the term rule while the
   list is on the period rule — the exported record and the on-screen number
   can differ for the same department and period.
3. **The list already warns about the rows the `/admin/evaluations/results/[departmentId]` page drops.** The
   `offSemester` warning ("N evaluation(s) point at a subject from another
   semester", `app/admin/evaluations/results/page.tsx:299`) is computed from
   `loadPeriodFacts` (period-scoped) — so the list **counts those responses
   in its Avg Rating and flags them on the same screen**.

⚠️ The **size** of the divergence is not measured anywhere in the repo. The
measurement is in **§6.1**, the decision in **D7** (**resolved 2026-10-21** —
the period scopes the responses), the slice in **S6.1**.

---

## 2. Decision

**One attribution rule, applied at the level the data actually belongs to,
implemented once and shared by every surface.** The faculty's own department
owns the result (D1, resolved 2026-10-20 — and amended the same day: the
home is the **only** rule; the section's department is no longer a fallback).

- **S1 — Faculty-level attribution + one implementation.** A department's
  results are the **faculty-subjects whose teacher belongs to that
  department**; the admin and dean surfaces share one service; the dean's
  duplicated route implementation is retired (D2).
- **S2 — The pseudo-group stops being a department.** `__unknown__` leaves
  the results grouping (it cannot be produced under S1) and reappears, if
  ever, as an **integrity warning** on the `/admin/evaluations/results` page (§1.7). The
  "Unassigned" label is freed for the real department that owns it.
- **S3 — Zero-response faculty become visible.** Every department on the
  `/admin/evaluations/results` page carries a "no responses" count and an
  expandable list of the
  people who received nothing in the period — with the dummy excluded
  (§1.4).
- **S4 — Counts reconcile.** The list's `facultyCount` equals the number of
  distinct faculty the department's detail table shows.
- **S6 — The period scopes the responses.** The `/admin/evaluations/results/[departmentId]` page's response set
  stops being derived from its subject list (§1.10, §3.21). **Resolved 2026-10-21** —
  the period scopes the responses (D7); the slice is **S6.1**, the measurement is
  **§6.1**.

Slices are independent and shippable in order S1 → S2 → S3 → S4 (→ S6, open).

---

## 3. Pinned contracts

1. **One resolver, one rule.** `resolveSubjectDepartment(facultySubject, ctx)`
   lives beside `resolveFacultyDepartment` in `lib/evaluation-utils.ts` and is
   the only place a department is decided for a subject. It returns the
   faculty's `users.departmentId`, or `null` when the teacher has no home
   department. **Amended 2026-10-20** — the rule is the home, always: a
   department's teaching is the teaching of the faculty homed in it, so the
   section's department is no longer a fallback. The old gate ("the home must
   own at least one course") existed to stop the placeholder buckets
   ("Unassigned", "Admin") from accumulating everyone's subjects; the
   membership rule does that on its own — a bucket holds its own members'
   teaching. A teacher with **no home** has no department: their subject is
   **unattributed** (the `/admin/evaluations/coverage` page's "Unresolved" group, the results
   list's integrity warning), not filed under whoever owns the section.
2. **Section-level beats person-level.** Where a surface shows *subjects*
   (the subject pages: `/admin/evaluations/results/[departmentId]` and
   `/admin/evaluations/coverage`), the department comes from the subject. Where
   a surface shows *people* (the dean's aggregate), the person's own
   assignment set is what is aggregated — never the other way round.
3. **The chain stays scoped to the period's semester.** A `faculty_subjects`
   row from a different semester does not establish a department
   (`evaluation-results.repository.ts:77`) — and an evaluation pointing at
   one is an integrity condition (S2), not a department.
4. **The dummy is not a person.** Any list, count, or report built from
   assignments excludes `placeholder@lyceumalabang.edu.ph`
   (`lib/services/etlEvaluation.ts:20`). The dummy owns real assignments
   and would otherwise be reported as a teacher with zero responses.
5. **Zero responses is a fact, not a row — and not a results surface.**
   A person with no evaluation has no row in the results table. The count and
   the expandable list that used to be the surface are **gone** (2026-10-20):
   the `/admin/evaluations/results` page does not show them, the payload does not carry them, and
   `listDepartmentRosters` no longer exists. Who was expected to be
   evaluated, and who answered, is the **`/admin/evaluations/coverage` page's**
   question, and it
   answers it per subject. That list was the period's semester assignments
   — the same one `/admin/evaluations/coverage` uses — but its exclusion was per
   **assignment**, so a person with one evaluated and one unevaluated
   section was counted twice. That was the second of the two counting bugs.
6. **`__unknown__` is not a department id.** It leaves the results grouping
   key and the URL space. The `/admin/evaluations/results` page's dead-end link to
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
   from the subject list.** Today it is `anyVisible = facIds.some(...)` over the
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
    **unguarded** → TypeError → error boundary. The `/admin/evaluations/results/[departmentId]` page already
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
    different number: it lives on the `/admin/evaluations/coverage` page, per subject, and it is
    never added to a headcount. Every surface reads the headcount from one
    helper (`features/users/users.service.ts` →
    `getFacultyCountsByDepartment()`), so no two surfaces can drift. A
    `DEAN|FACULTY` account is faculty (it holds a FACULTY role row); a
    `DEAN`-only account is not. ⭐ **2026-10-21 (v1.13): every department is a
    row.** A department with **no** responses in the period is a row with **no
    rating** ("—"), not a missing row: the list's rows were built from the
    period's *evaluations*, so a department nobody answered in simply did not
    appear — while its headcount and the export's `summary.csv` both carry it.
    The list now walks the departments, and the figures fill in as they land. ⭐ **A dean IS a faculty member of their own
    department** (the domain fact; the app already treats DEAN as faculty in
    the availability list and in bookings), so a dean who carries both role
    rows is in the headcount and in the membership set (§3.17) like anyone
    else. ⚠️ **The seed disagrees** — `supabase-schema.sql:1560` gives the
    seeded dean (`Regie Ellana`) the `DEAN` role row **only**, so on a fresh
    install that dean is in neither the headcount nor the members set.
    **Deferred 2026-10-21 (owner): the seed is the owner's file and the change
    is a schema edit (AGENTS.md H4) — recorded in `TODO.md`, not made here.**
15. **The `/admin/evaluations/results/[departmentId]` page's faculty cards list the department's own
    faculty.** Membership is the teacher's **home** department
    (`users.departmentId`); the section's department is irrelevant to it. A
    teacher who teaches a section owned by another department is not a member
    of that department and gets **no card** there. This binds the coverage
    page's department view and the `/admin/evaluations/results/[departmentId]` page (the admin page
    and the dean's twin) to the same set as the headcount in §3.14.
    ⭐ **2026-10-21 (v1.12): a member with no results gets a card too.** The cards are the
    **members** — with or without results — so a teacher who taught nothing this term and
    has no responses is on the page (with nothing on their card). The card's "Faculty" number
    is the **members'** count, so it tallies with the cards below it AND with the headcount
    the list, the export and the coverage page print (§3.14). The cards' *figures* still
    come only from the responses: a member with none has no average and no rubric.
    ⭐ **2026-10-21 (v1.9): the page is the cards.** The "By Subject & Section" table and the tab
    strip are gone — the drill-down is per-teacher, and the cards are the only view. The **coverage**
    page keeps its own two tabs (its flat table is the *coverage* grain, not the results grain); its
    own spec is to be written.
16. **The `/admin/evaluations/results/[departmentId]` page's rows list the members'
    subjects — evaluated or not.** One row per (member, subject,
    section): a member who taught something nobody answered is still a row,
    with 0 responses and no rating. The rows are the members' teaching, not
    only what was evaluated, so a member never disappears from the page. ⭐ **2026-10-21 (v1.9): the
    rows are no longer a flat table** — they are the subjects inside each faculty card (and the
    rows the export CSVs and the PDF carry). The rows themselves are unchanged. The department's pooled
    rating and the "Responses" figure are computed from
    the **results**, not from the rows, so they do not move. The **export
    CSVs stay the results** (the rows with responses): a row with no
    responses has no rating, no rubric and no sentiment to report.
17. **The dean's guards read the same set.** The release gate, the visibility
    scope and the student-breakdown scope all read the department's **own**
    faculty, so the dean can never be
    refused a teacher their own page lists — nor allowed one that is not
    theirs. The release gate additionally requires `totalRespondents > 0`: a
    row with no responses is a subject, not a result, and cannot release the
    page. ⭐ **2026-10-21 (v1.10): the set is the MEMBERS** — the accounts
    homed in the department (`getDepartmentMembers`), not the faculty with an
    assignment this term. The set widens: a teacher homed in the department
    with no assignment this term is a member of it, and the dean's guards say
    so. `getDepartmentMemberTeaching` (the term's teaching) had no caller
    left and is gone.
18. **A result figure is computed over the complete rating set of its
    evaluation set.** PostgREST's `db-max-rows` (1,000) truncates an
    unbounded read with **HTTP 200** and no error, so a truncated read
    produces a **wrong** figure, not a missing one. Every read behind a
    result figure must page past that cap (AGENTS.md **Lesson 7b**), and
    the read that carries it is cached (AGENTS.md **Lesson 7c**). The
    `/admin/evaluations/results/[departmentId]` page's Avg Rating, Highest
    Rubric and Lowest Rubric for
    a subject must **equal** the `/faculty/evaluations/subjects/[facultySubjectId]` page's for the same subject — they
    are the same number computed over the same responses.
19. **The scope rules live in the repository; the display rules live in
    TypeScript.** `features/evaluation-results/evaluation-results.repository.ts`
    carries the period, the submitted and enabled evaluations, the
    **live-eval rule** (an evaluation whose assignment no longer belongs to
    its evaluatee does not count) and the **teacher's home department**. It
    applies **no display rule** — the category names come back raw and
    TypeScript maps them to their columns (`CATEGORY_NAMES`), and the
    remark, the labels and the highest/lowest selection stay in
    `lib/evaluation-utils.ts`. A rule that lives in a read is testable
    behaviourally: the repository's own suites assert the filters, the
    live-eval rule and the home-department rule case by case.
20. **No surface opens a direct connection.** The figures are read through
    the app's own repositories over the REST API (AGENTS.md **Lesson 7c**):
    one department at a time for the list, the exports and the dean view,
    one faculty at a time for the report — each cached for five minutes. A
    group-by that spans a to-many cannot be expressed through the REST API,
    so the rows cross the wire and the group-by happens in Node. The
    **weights** travel with the read (the per-category sum and count), so a
    department's figure is the **pool** of its faculty's figures — the mean
    over the rating rows, not a mean of the faculty's means. Nothing is
    created in the database: no function, no view, no migration, no
    `exec_sql`. ⭐ The app's `exec_sql` runs as the **invoking** role
    (`service_role`), which has no `CREATE` on `public` — so the app cannot
    create a function in the database, and neither can the admin **Reset
    Database** feature.
21. **The evaluation's period is the strict gate; the term's assignments scope the
    subject list, not the response set.** The rule, in the owner's words:

    > given a department is selected · when all faculties belonging to it are
    > fetched · then it should only take into account evaluations that are
    > accounted for the current evaluation period only

    An evaluation records its own
    period (`evaluations.evaluation_period_id`) — the strict gate — and
    `evaluations.semesterId` is that period's semester **copied onto the row
    at insert** (`features/evaluations/evaluations.repository.ts:288-297`); it
    is a **lookup**, not an independent fact. A **subject list** ("the
    members' subjects this term", §3.16) is a question about the *teaching*; a
    **response set** ("the responses in this period") is a question about the
    *responses* — and the period answers it. So the term's assignments may
    decide **which subjects are listed**, and must not decide **which
    responses count**.
    **RESOLVED 2026-10-21 (D7)** — the period scopes the responses.
22. **The results surfaces show the ratings; the coverage page owns the counts.**
    A response count on a results surface invites "out of how many students?", and the
    results surfaces do not carry the denominator — the **coverage** page does (Enrolled ·
    Participated · Disputed · Completion). So the results surfaces carry **no** response
    count: the department card's "Total Responses", the faculty card's "N responses" and
    the expanded table's "Resp." are **gone** (2026-10-21, owner). The one place a count
    stays is where it qualifies the average **right beside it** and no ratio is implied —
    a subject page's "Respondents" (the list of individual responses beneath it) and the
    **faculty's own** surfaces, which have no coverage page to point at. The data is
    untouched: the export carries every count (§ the export's own spec).
23. **The weakest rubric is flagged only when it is critically low.** A department's
    **"Needs Attention Rubric"** appears only when its lowest rubric is **"Unsatisfactory"
    or worse** on the app's own ladder (`getRemark`) — below 2.5. A weakest criterion that
    is still "Satisfactory" is not an alarm, and a "needs attention" badge on a
    satisfactory criterion is a contradiction. The rule is `findAttentionRubrics`
    (`lib/evaluation-utils.ts`) — one place, and the **department-level** surfaces only
    (the card, the results list): the subject page and the faculty's own page keep
    their "Lowest Rubric" cell, because there the lowest criterion is the *point* — it is
    what the teacher acts on.
    ⚠️ **The `/admin/evaluations/results/[departmentId]` page violates this until S6.1 ships** (§1.10): it derives its
    response set from its subject list, so a response on an assignment
    outside the term is dropped while the `/admin/evaluations/results` page counts it. The slice is
    **S6.1**; the size of the change is measured in **§6.1**.
    ⚠️ **And the strict gate is lossy on legacy rows.**
    `evaluations.evaluation_period_id` is **nullable**
    (`supabase-schema.sql:1846`, never set `NOT NULL`), and migration 30c's
    backfill skipped the semesters with no eval dates and not `isActive`
    (`supabase-schema.sql:1883`) and pointed every row of a **multi-period**
    semester at one period (`:1884-1889`). Those rows are dropped by **every**
    period-scoped read — **symmetrically**, so no parity check can see them.

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
| S3.1 | Repository returns, per department, the assignments in the period's semester (dummy excluded) minus those with a submitted evaluation | `features/evaluation-results/evaluation-results.repository.ts` — **done 2026-10-20**, then **removed 2026-10-20**: the results surfaces do not show a no-response subject list, so the method, its interface entry and its test block are gone (the `/admin/evaluations/coverage` page answers that question per subject) |
| S3.2 | Results list shows a "No responses" count per department + an expandable list of names | `app/admin/evaluations/results/page.tsx` + `app/api/admin/evaluation-results/route.ts` — **done 2026-10-20**, then **removed 2026-10-20**: the `/admin/evaluations/coverage` page owns that number, so the column, the payload field and the query are gone |
| S4.1 | `facultyCount` on the list = distinct faculty the detail table shows (evaluated ∪ no-response subjects) | **superseded 2026-10-20** — the list's `facultyCount` is the department's **headcount** (contract §3.14), the same number the `/admin/evaluations/coverage` page, the export CSVs, the report page and the Department Health report print. The list also counts a faculty whose evaluation carries no rating rows, and the department's total covers both sets → **the headcount covers every surface** |
| S4.2 | One shared headcount helper read by every surface | `features/users/users.service.ts` → `getFacultyCountsByDepartment()` — **done 2026-10-20**; readers: the admin results route, the dean results route, the coverage service, the admin results export, the dean results export, the report service, the Department Health report |
| S4.3 | The `/admin/evaluations/results/[departmentId]` pages' faculty cards list the department's **own** faculty (contract §3.15) | `features/evaluations/evaluation-status.service.ts` + `features/evaluations/components/CoveragePage.tsx` (the `/admin/evaluations/coverage` page's department view) and `features/evaluation-results/evaluation-results.service.ts` + `features/evaluations/components/DepartmentSubjectView.tsx` (the `/admin/evaluations/results/[departmentId]` page, admin + dean) — **done 2026-10-20**: the per-faculty aggregates are the members only, and the cards come from that map. The subject rows, the department's pooled rating, the visibility toggles and the export CSVs are untouched · **2026-10-21 (v1.9): the cards are the page** — the flat table and the tab strip are gone (owner, 2026-10-21) |
| S4.4 | The `/admin/evaluations/results/[departmentId]` page's rows list the **members' subjects, evaluated or not** (contract §3.16) | `features/evaluation-results/evaluation-results.service.ts` (the rows are built from the department's teaching assignments, with the results attached where they exist) + `features/evaluation-results/evaluation-results.repository.ts` (`listDepartmentTeachingAssignments`) — **done 2026-10-20** · **2026-10-21 (v1.9): the rows live inside the cards' expanded rows** (and in the export CSVs and the PDF), not in a flat table |
| S4.5 | The dean's guards read the same membership set (contract §3.17) | `features/evaluation-results/evaluation-results.service.ts` (`getDepartmentMemberTeaching`) + `app/api/dean/evaluation-results/departments/[departmentId]/route.ts` (the release gate) + `app/api/dean/evaluation-results/visibility/route.ts` + `app/api/dean/evaluation-results/details/route.ts` — **done 2026-10-20** |
| S4.6 | The export CSVs stay the results | `app/api/admin/evaluation-results/export/route.ts` + `app/api/dean/evaluation-results/export/route.ts` — **done 2026-10-20**: the per-department CSVs carry the rows with responses only |
| S4.7 | The attribution rule is the home, always (contract §3.1) | `lib/evaluation-utils.ts` (`resolveSubjectDepartment`) — **done 2026-10-20**: the section's department is no longer a fallback, and the "the home must own a course" gate is gone. The buckets hold their own members' teaching; a teacher with no home is unattributed |
| S5.1 | Every read behind a result figure pages past PostgREST's 1,000-row cap, and the read that carries it is cached (contracts §3.18–§3.20) | `lib/db/common.ts` (`fetchRatingsWithCategories` — the shared ratings read), `features/evaluations/evaluations.repository.ts` (`listSubmittedByPeriodAndEvaluatees`), `features/evaluation-results/evaluation-results.repository.ts` (`listSubmittedEvaluates`) — **done 2026-10-21**: each gains a `.order(<total order>).range(offset, offset+999)` page loop; the shared ratings read is ordered by `("evaluationId","itemId")` and the evaluation reads by `id`. **S5.2 (2026-10-21): the aggregate is retired** — the direct connection (`lib/db/postgres.ts`, `pg` + `DATABASE_URL`) could not be opened in this environment, so the figures are read through the app's own repositories, **per department** for the list and **per faculty** for the report, each **cached for five minutes** (`features/evaluation-results/figure-cache.ts`). The read carries the **weights** (the per-category sum and count), so a department's figure is the pool of its faculty's totals. **No surface opens a direct connection any more**; `lib/db/postgres.ts`, `features/evaluation-results/evaluation-aggregates.ts` and their tests are deleted. `pg` and `DATABASE_URL=` stay in the repo for `scripts/apply-schema.mjs` only. Tests: `lib/__tests__/evaluation-results-faculty-figures.test.ts` (new), `lib/__tests__/evaluation-results-figure-cache.test.ts` (new), `lib/__tests__/evaluation-report-service.test.ts` (new), `lib/__tests__/evaluation-results-department-faculty.test.ts`, `lib/__tests__/admin-evaluation-results-route.test.ts`, `lib/__tests__/dean-evaluation-results-route.test.ts` |
| S6.1 | The `/admin/evaluations/results/[departmentId]` page's response set stops being derived from the term's subject list (contract §3.21) — the period scopes the responses | **The inputs are the two the route already has — `evaluationPeriodId` + `departmentId`. Nothing new is plumbed** (no semester in the route, no term in the payload, no new parameter): the **term** comes from `evaluationPeriodRepository.findById(periodId).semesterId` (`service.ts:151` already reads it); the **members** come from `userRepository.listFacultyByDepartment(deptId)` — **one query, two filters**: the role *and* the department (`users.repository.ts` — `USER_SELECT_INNER` + `.eq("userrole.roleName","FACULTY")` + `.eq("departmentId", deptId)`), so **only that department's faculty cross the wire**. ⚠️ **Amended 2026-10-21 (v1.8)** — the line originally named `listByDepartment(deptId)`, which transfers **the department's students** (they carry a home department — `app/api/import/students/route.ts` stamps it) and filters the role in memory; and `listByRole("FACULTY")` + an in-memory department filter (what `listDepartmentFigures` used) transfers **every faculty in the school** on every department read. The new read returns the **same population** as the old one — so **no number moves** — with the smallest transfer of the three. `idx_users_department` (`supabase-schema.sql:369`) makes the department filter indexed.<br>**The rule as an algorithm** (`getDepartmentSubjectResults`, `features/evaluation-results/evaluation-results.service.ts:174`): **1.** `faculty` = the accounts homed in the department. **2.** `evals` = the period's `SUBMITTED` + enabled evaluations for those faculty (`listSubmittedEvaluatesForFaculty`, `repository.ts:388-417`) — **no** semester filter, **no** term filter. **3.** `liveEvals` = the evaluations whose assignment's faculty is the evaluatee (the live-eval rule, §3.19) — unchanged. **4.** The **subject list** = the members' assignments this term (`listDepartmentTeachingAssignments(deptId, period.semesterId)`, `repository.ts:625`) **∪** the assignments `liveEvals` point at — so a counted response always has a row (§3.16). **5.** The department's pooled rating is computed over `liveEvals`, so it **equals** the `/admin/evaluations/results` page's figure (`listDepartmentFigures`) and the exports'.<br>**Also in this slice (decided 2026-10-21):** ⚠️ the **list page's `offSemester` banner is retired** — **done 2026-10-21 (v1.11)** — it warns over a number that now **includes** those responses, so it contradicts the figure above it. ⭐ **The field leaves the RESULTS payload only:** the warning type splits (`IntegrityWarnings` for the results surfaces, `AttributionWarnings extends it` for the coverage page), and the results list's spine reports the integrity half. ⭐ **The coverage page has no own copy of the RULE** — it calls the same `listAttributionWarnings` — so the retirement is scoped to the results path: the shared rule (`classifyWarningAssignments`) and the coverage page's read **stay**, and only **two** of the plan's four test suites change (the other two assert the coverage path and the shared rule). ⭐ The **`/admin/evaluations/coverage` page's `offSemester` warning stays** — that page's list **is** term-scoped (`evaluation-status.service.ts:151`), so "outside the term" is still a real condition there, and it has its own copy. The two surfaces end with different warnings because they have **different scopes**. ⭐ The department page's **"Faculty"** becomes the **headcount** — **done 2026-10-21 (v1.12)**: the card counts the **members** (the accounts homed in the department — the same population `getFacultyCountsByDepartment` counts, so §3.14's "one headcount, one place" holds), and it tallies with the cards below, which are the members too, with or without results. The card also **lost** "Subjects" and "Total Responses" (contract §3.22) and its "Lowest Rubric" cell became the conditional **"Needs Attention Rubric"** (contract §3.23). ⭐ **D9 joins the slice**: both `groups/[facultySubjectId]` routes get the assignment-belongs-to-the-department check (`resolveSubjectDepartment`, `lib/evaluation-utils.ts:535`). ⚠️ **No off-term marker anywhere** — a subject on an earlier term's assignment simply appears in the tab like any other.<br>**Files:** `features/evaluation-results/evaluation-results.service.ts` + `features/evaluation-results/evaluation-results.repository.ts` + `app/api/admin/evaluation-results/departments/[departmentId]/route.ts` + `app/api/dean/evaluation-results/departments/[departmentId]/route.ts` + `app/api/dean/evaluation-results/details/route.ts` + `app/api/dean/evaluation-results/visibility/route.ts` (the **governable** set widens — contract §3.8) + both export routes + `app/api/admin/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/route.ts` + `app/api/dean/…/groups/[facultySubjectId]/route.ts` (**D9**) + `app/admin/evaluations/results/page.tsx` (the banner) + `lib/evaluation-utils.ts` + `lib/types/evaluation.ts` + `features/evaluations/evaluation-status.service.ts` (the `/admin/evaluations/coverage` page's subject list, so the two pages agree). No DDL.<br>⚠️ **Step 4 is the one that is easy to miss** — without it a counted response has no row (the shape of the `""` bucket). ⚠️ **Step 1 widens the membership set**: a faculty homed in the department with **no** assignment this term now counts, which moves the dean's **visibility scope** (§3.8) and the **release gate** (§3.9) — the dean's release gate already reads the **results**, not the term's assignments (`app/api/dean/evaluation-results/departments/[departmentId]/route.ts:42`), so it is D′-safe. ⭐ The **subject page already complies** with the rule: `/admin/evaluations/results/[departmentId]/[facultySubjectId]` reads `listSubmittedByPeriodAndEvaluateeAndFS` — the period rule — so it needs **no** read change. A new **test for the semester half** of the gate is required — today only the home-department half is asserted (`lib/__tests__/evaluation-results-service.test.ts:149-167`) |
| S2 | **Done 2026-10-20** — the "Unresolved" row is gone from the `/admin/evaluations/results` page and the dead-end link with it; the integrity condition is now a warning row naming the faculty. The write path (both visibility routes) now **requires** `evaluationPeriodId`: a `semesterId` body would have written a row keyed by a semester id, and made the dean's membership check resolve an empty set. |
| S3 | **Done 2026-10-20** — the dean's dashboard (`app/dean/page.tsx`) and the dean's evaluation landing page (`app/dean/evaluations/page.tsx`) now count the **teaching roster** (the faculty with an assignment whose section the department owns) instead of the people merely homed there, through the shared `getDepartmentTeachingFaculty`. The card is labelled "Teaching" and the roster "Teaching Roster — Faculty with a section in {dept} this term". The term is the active evaluation period's semester, falling back to the active semester. The consultation workload cards on the same dashboard are a different population and are unchanged. |
| S4 | **Done 2026-10-20** — the `semesterId` fallback is gone from both visibility routes; a body without `evaluationPeriodId` is a 400. The write path was already corrupting the `evaluation_results` row when given a semester id. |
| S5 | `resolveFacultyDepartment` / `resolveDepartmentFaculties` are now unused by app code (tests only). Marked superseded; delete in a cleanup. |
| — | Out of scope | The ZIP/CSV export payload format (contents follow the new rule; the folder set is `departmentRepository.listAll()` and is unchanged) · the `/admin/evaluations/coverage` page's visual design · the student-facing evaluation flow · the dummy account itself · schema |

---

## 5. Risks

- **Numbers move between departments.** This is the point of S1 — the
  current placement is wrong — but it is the loudest risk in this spec. The
  movement is exactly the off-diagonal of the home→section matrix: a
  faculty homed in A, teaching a section owned by B, moves from B to A.
  Mitigation: ship S1 alone first, compare one period's numbers by hand
  (§6), and keep the release note explicit.
- **The `/admin/evaluations/results/[departmentId]` page and the `/admin/evaluations/results` page already disagree (2026-10-21) — and S6.1 republishes the department's average.** The
  list's Avg Rating is period-scoped; the `/admin/evaluations/results/[departmentId]` page's is term-scoped
  (§1.10). Same department, same period, one click apart — and the exports
  follow the `/admin/evaluations/results/[departmentId]` page, so the **CSV disagrees with the screen**.
  ⚠️ **D7 is resolved (2026-10-21): the period scopes the responses**, so S6.1 **moves** the
  `/admin/evaluations/results/[departmentId]` page's **published** department average, and the export
  CSVs move with it. The figure it lands on is the one the `/admin/evaluations/results` page
  already shows — that is the point (§3.18) — but a number that has been **quoted** will change, so
  the release note must say so and §6.1 must say **how much**. Contracts §3.7 (admin and dean ship
  together) and §3.18 (the same number on every surface) are what stop the two from drifting apart
  again.
- **The membership set widens (2026-10-21).** "The members" becomes *the faculty homed in the
  department*, not *the faculty with an assignment this term* — so a faculty homed in the
  department with **no** assignment this term joins the set. That moves the dean's **visibility
  scope** (§3.8 — whose results a dean may show) and the **release gate** (§3.9). Those two guards
  must move in the **same slice**, or the dean can be refused a teacher their own page lists.
- **The list page's `offSemester` banner is retired, and the coverage page's stays (2026-10-21).**
  Under D′ the results surface no longer **scopes** by the term, so there is nothing for it to
  report falling outside — and the banner would warn over a number that now **includes** those
  responses. The `/admin/evaluations/coverage` page still **does** scope its list to the term
  (`evaluation-status.service.ts:151`), so "outside the term" is still a real condition there, and
  it keeps its own warning. The two surfaces end with **different warnings because they have
  different scopes** — that is the house pattern (§4 of the results handover), not a break from it.
- **The subject page's route does not scope the subject to the department (2026-10-21).** The
  listing is the only thing that scopes it — the URL is a way around it (**D9**, now in **S6.1**).
  D′ widens the membership set, and the subject page is the surface whose numbers must equal the
  faculty page's (§3.18), so the guard must not be left open behind it.
- **The strict gate loses legacy rows (2026-10-21).** A pre-migration
  response whose `evaluation_period_id` was never recorded is dropped by
  **every** period-scoped read — the list, the `/admin/evaluations/results/[departmentId]` page and the `/faculty/evaluations/subjects/[facultySubjectId]` page
  alike — so it is **symmetric** and no parity check can see it (contract
  §3.21). The `offSemester` warning does not see it either: it is computed
  from the period's own evaluations. Recovering it needs a semester floor
  plus an `IS NULL` arm, and the **misattributed** half needs the owner's
  read-only audit.
- **The buckets and the home-less (2026-10-20).** With the home as the only
  rule, a teacher homed in a **placeholder bucket** has their subjects counted
  under that bucket (not under the section's department), and a teacher with
  **no home** has their subjects **unattributed** — surfaced by the coverage
  page's "Unresolved" group and the `/admin/evaluations/results` page's integrity warning instead
  of sitting in a department's row. For faculty homed in a real department
  that owns courses, **nothing moves**. Check your data with
  `docs/evaluation-surfaces-verification.md` §7 before the release note.
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
  names (today the copy resolves names from the homed members, so they read
  "Unknown"), and the CSV-unmatched faculty appear at all.
- **The per-department faculty aggregate now pools only that department's
  subjects.** Before, a faculty's aggregate on a `/admin/evaluations/results/[departmentId]` page pooled every
  evaluation they had, including their subjects in other departments. The
  figure is now the department's own, which is what the page claims to show.
- **The dean's release gate now reads the results, not the subject list** (contract
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
  results pages and the `/admin/evaluations/coverage` page disagree.
- **Coverage numbers move too.** The `/admin/evaluations/coverage` page's department rows and
  its subject list are attributed by the same rule, so a Math-homed
  faculty's CS subject stops counting under Math. The `/admin/evaluations/coverage` page's
  synthetic "Unassigned" group empties out (a subject's department is
  always defined) — a real "Unassigned" **department**, if one exists, is
  unaffected and remains a normal department.
- **The "Unassigned" name is now unambiguous on the `/admin/evaluations/results` page** (the
  pseudo-group is gone), but a real "Unassigned" department may still hold a
  CSV default bucket whose faculty teach real sections — under S1 those
  subjects move to their section's department, and the "Unassigned"
  department's results row may empty out. Say so in the release note.
- **The faculty counts drop to the headcount (2026-10-20).** The results
  list's "Faculty", the `/admin/evaluations/coverage` page's "Faculties" and its KPI now print the
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

The manual checks and the **home-less teachers** check are in
`docs/evaluation-surfaces-verification.md` — that check is the only number
that says how much the attribution actually moved on real data.

Pick one period and one faculty member per scenario; check all four
surfaces agree:

| Scenario | `/admin/evaluations/results` | `/admin/evaluations/results/[departmentId]` | `/dean/evaluations/results/[departmentId]` | `/admin/evaluations/coverage` |
|---|---|---|---|---|
| Homed A, teaches a section owned by B | subject under **A** | **A** lists the subject | dean of **A** lists it | under **A** — both pages are faculty-driven (§1.2) |
| `departmentId = NULL` (CSV-unmatched) | **no row** — the `/admin/evaluations/results` page's integrity warning names the faculty | — | — | in the **"Unresolved"** group — they have no department |
| The dummy account | absent | absent | absent | absent — and never in a "no responses" count |
| Assignment outside the period's semester | the Avg Rating **counts** the response; the `offSemester` banner is **retired** in S6.1 | ⚠️ the `/admin/evaluations/results/[departmentId]` page **drops** it until S6.1 ships (§1.10) | — | — |
| Zero responses in the period | no subject list on this surface — the `/admin/evaluations/coverage` page's per-subject status answers it | n/a (no row) | n/a | subject shows "Not started" |

Then: the list's `facultyCount` is the department's **headcount** (contract
§3.14) — the same number the `/admin/evaluations/coverage` page's "Faculties" column and its KPI
print, and the same number the Admin dashboard's "Faculty" card prints for the
whole school; and no row in the list is a dead-end link.

### 6.1 Measuring the membership gate (sizing S6.1)

The size of the `/admin/evaluations/results/[departmentId]` page's divergence (§1.10) is not in the repo. **D7 is resolved** (2026-10-21 — the period scopes the responses), so this is no longer a decision input: it **sizes the change** and **writes the release note** — how far the published department average moves, and how many subjects the tab gains. It is **read-only** (AGENTS.md **H4**: the owner
runs it in the Supabase SQL Editor; nothing is created, changed or dropped).
Paste the period id, run it, and bring back the three numbers.

**1 — the responses the `/admin/evaluations/results/[departmentId]` page drops, and the assignments they sit on:**

```sql
select fs.id as assignment, fs."semesterId" as assignment_semester,
       ep."semesterId" as period_semester, count(*) as responses
from evaluations e
join faculty_subjects fs on fs.id = e."facultySubjectId"
join evaluation_periods ep on ep.id = e.evaluation_period_id
where e.evaluation_period_id = '<period-id>'
  and e.status = 'SUBMITTED'
  and e."isDisabled" = false
  and fs."semesterId" is distinct from ep."semesterId"
group by fs.id, fs."semesterId", ep."semesterId"
order by responses desc;
```

⚠️ **`is distinct from` is load-bearing.** With the ordinary `<>`, a row whose
`fs."semesterId"` is `NULL` compares to `NULL` → the comparison is `NULL`, not
`TRUE` → the row is filtered out → the query returns **zero rows** and you
conclude the gap does not exist. `IS DISTINCT FROM` treats `NULL` as a value
that *is* different ✓ — which is exactly the legacy case this looks for.

**2 — the responses with no period recorded** (the symmetric loss of §3.21):

```sql
select e.id, e."semesterId" as response_semester, e."evaluateeId", e."facultySubjectId"
from evaluations e
where e.status = 'SUBMITTED'
  and e."isDisabled" = false
  and e.evaluation_period_id is null
  and e."semesterId" = '<period-semester-id>'
order by e."semesterId";
```

⚠️ Query 2 is **not** reachable from query 1: query 1's inner join on
`evaluation_periods` drops the NULL-period rows before its `WHERE` runs. And
it counts only the **NULL** half — the **misattributed** rows (a semester with
several periods, `supabase-schema.sql:1884-1889`) are reachable by **no**
filter at all.

**The three numbers back:** (1) the **responses** on the assignments the
`/admin/evaluations/results/[departmentId]` page drops — how far the published
department average moves; (2) the **assignments** themselves —
how many subjects the `/admin/evaluations/results/[departmentId]` page's tab gains; (3) the **NULL-period**
responses — the symmetric loss, invisible to every parity check (**D8**, and it stays invisible
after S6.1 — D′ does not recover it).

⭐ **The SQL is optional for the build.** The count is a repository read over the
existing tables (S6.1), so the app can compute it itself; the queries above are only needed to
know the number **before** the code is written — which is what the release note needs.

---

## 7. Open decisions

| # | Question | Recommendation |
|---|---|---|
| D1 | **Precedence.** Section's department first, or the faculty's home department first? | **RESOLVED 2026-10-20 — the faculty's own department first** (when that department owns at least one course), the section's department as the fallback. The evaluated entity is the faculty, so the teacher's department groups the results; the chain answers "whose section is this?" and is the fallback for a teacher based somewhere that cannot own coverage (no home, or a home with no courses). Later the same day the `/admin/evaluations/coverage` page's rule was adopted for the results pages too, so the two surfaces share one resolver (`resolveSubjectDepartment`). Movement = the home→section matrix's off-diagonal. **Amended 2026-10-20 — the home, always:** the section's department is no longer a fallback, and the gate is gone. A department's teaching is the teaching of the faculty homed in it; a bucket holds its own members' subjects; a teacher with no home is unattributed (the `/admin/evaluations/coverage` page's "Unresolved" group, the `/admin/evaluations/results` page's warning). |
| D2 | **Dean surface.** Retire the dean's duplicated route implementation in favour of the shared service (S1.4)? | **RESOLVED 2026-10-20 — yes, and align all three dean membership rules in one unit** (page, ZIP, visibility). The page is home-only, the ZIP is chain-based, the visibility guard is home-only — the dean feature contradicts itself today. Caveats pinned as contracts §3.9–§3.11 and change S1.7. |
| D3 | **Coverage in scope.** S1.6 changes the `/admin/evaluations/coverage` page's attribution, which moves coverage numbers between departments. | **RESOLVED 2026-10-20 — in scope, same unit as S1.2/S1.3.** Leaving coverage on the old rule means the admin's results page and coverage page keep disagreeing about which department owns a subject — the original complaint, moved rather than closed. |
| D4 | **Integrity warning shape.** S2 replaces the "Unassigned" row with a warning when an evaluation points outside the period's semester. | **RESOLVED 2026-10-20 — one warning row in the `/admin/evaluations/results` page, naming the affected faculty.** Rare, actionable (fix the period binding), and it replaces a dead-end link with information instead of silence. |
| D5 | **Zero-response subject list source.** Assignments in the period's semester, or the department's homed faculty? | **RESOLVED 2026-10-20 — assignments in the period's semester** (contract §3.5), the same list `/admin/evaluations/coverage` uses, so the two surfaces cannot disagree about who was expected to be evaluated. The dummy is excluded (contract §3.4). **Superseded later the same day**: that list is no longer a results surface at all (contract §3.5, §3.14) — the `/admin/evaluations/coverage` page answers that question per subject, and the `/admin/evaluations/results` page prints the headcount. |
| D6 | **Should `/admin/evaluations/results/[departmentId]` also show 0-response faculty as rows?** | **RESOLVED 2026-10-20 — no.** The count and the expandable list on the `/admin/evaluations/results` page are the surface. A 0-response row in a *results* table reads as a data error, and a second surface means a second implementation to keep in sync. **Superseded later the same day**: the count and the list are gone too, so neither surface shows a 0-response figure. |
| D7 | **The `/admin/evaluations/results/[departmentId]` page's scope.** The `/admin/evaluations/results/[departmentId]` page derives its response set from the term's subject list, so it drops responses the `/admin/evaluations/results` page counts (§1.10). Surface the count (**A**) or let the period scope the responses (**D′**)? | **RESOLVED 2026-10-21 — D′: the period scopes the responses.** The owner's rule, verbatim: *given a department is selected · when all faculties belonging to it are fetched · then it should only take into account evaluations that are accounted for the current evaluation period only*. A response on an assignment outside the term **is** an evaluation of the current period, so it **counts**. ⭐ This was never a new rule: two of the three reads already implement it — the `/admin/evaluations/results` page (`listDepartmentFigures`) and the `/faculty/evaluations/subjects/[facultySubjectId]` page (`listSubmittedByPeriodAndEvaluateeAndFS`) — so D′ is *making the department page match the code that already exists twice*.     **Two consequences ride with it:** ⚠️ the **membership set widens** — "the members" becomes *the faculty homed in the department*, not *the faculty with an assignment this term* — which moves the dean's **visibility scope** (§3.8) and the **release gate** (§3.9); ⚠️ the **subject list must widen** (§3.16) — the members' assignments this term **∪** the assignments the responses point at — or a counted response would have no row. ⭐ The **inputs are the two the route already has** — `evaluationPeriodId` + `departmentId` — and everything else is derived from them (the term from the period, the members from the department); nothing new is plumbed. The **published department average moves** on the department page and both exports; §6.1 measures how much. Slice: **S6.1** · contract: **§3.21** |
| D8 | **The strict gate loses legacy rows.** `evaluations.evaluation_period_id` is nullable and only partially backfilled, so a pre-migration response with no period recorded is dropped by every period-scoped read — symmetrically, and invisibly (§3.21). | **Open 2026-10-21 — noted as a gap, not this slice.** Recovering the **NULL** half needs a semester floor plus an `IS NULL` arm (`evaluations.semesterId = period.semesterId AND (evaluation_period_id = periodId OR evaluation_period_id IS NULL)`), with a double-count caveat when a semester has several periods; the **misattributed** half (a multi-period semester, `supabase-schema.sql:1884-1889`) is unreachable by any filter and needs the owner's read-only audit (§6.1, query 2). No DDL either way. |
| D9 | **The subject page's route never checks that the assignment belongs to the department.** `/admin/evaluations/results/[departmentId]/[facultySubjectId]` reads `/api/admin/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]`, which loads the assignment by id and reads **its** faculty's responses — the `departmentId` in the URL is used **only** to echo the department's name (`route.ts:28`, `:40`). The dean's twin (`app/api/dean/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/route.ts`) checks the **URL's** department (`:37-39`) and asserts the period is active (`:46`) — but **also** never checks the **assignment's** department, so a dean can pass their own `departmentId` with any `facultySubjectId` and read that assignment's responses under their own department's name. | **Done 2026-10-21 (v1.10) — folded into S6.1 and BUILT.** Both `groups/[facultySubjectId]` routes now ask the service whether the subject belongs to the department (`isSubjectInDepartment`, `lib/evaluation-utils.ts` — the teacher's home department, through the one resolver): the admin's answers 404, the dean's 403, and neither reads the responses for a subject that is not the department's. The **listing** is the only thing scoping the subject today, so the URL is a way around it. It matters here because D′ **widens** the membership set (§3.17's guards move with it) and because the subject page is the surface whose numbers must equal the faculty page's (§3.18). The fix is a **repository/service** check — the assignment's department is already computed by `resolveSubjectDepartment` (`lib/evaluation-utils.ts:535`) — not a schema change. |
