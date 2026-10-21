# Evaluation Coverage — "By Subject & Section" / "By Faculty" Groupings — Spec

**Version:** 1.3
**Status:** Final (approved 2026-10-20; D1–D3 resolved) — v1.1 added D4 (the home department as display context) and was **withdrawn** by the user; v1.2 replaced it with D5 (the coverage page is faculty-driven, with the faculty-subject's department as the fallback); v1.3 records that the **results surfaces adopted the same rule**, so one resolver governs every surface; v1.4 records the **home as the only rule** (no fallback) and the membership contract — a department's teaching is the teaching of the faculty homed in it, and a teacher with no home is unattributed
**Last Updated:** 2026-10-20
**Scope:** `app/admin/evaluations/coverage` (and the dean page that shares
the component), the coverage service, and the coverage page's component.

---

## 1. Problem

The evaluation **results** page offers two ways to read a department:
`DepartmentSubjectView` (`features/evaluations/components/DepartmentSubjectView.tsx:146-152`)
switches between **"By Subject & Section"** (a flat table) and **"By
Faculty"** (one card per teacher, expandable to their subjects).

The evaluation **coverage** page — the participation report for the same
data — has only the flat table, inside the department drill-down
(`features/evaluations/components/CoveragePage.tsx:414-463`). A reviewer
asking *"how is this teacher doing across everything they teach?"* has to
read the table row by row and aggregate the counts by eye, and the flat table
carries no section at all, so two rows for the same teacher and subject in
different sections are indistinguishable.

The two pages sit side by side in the admin's navigation and answer the same
question in two different shapes.

### 1.1 The coverage page is faculty-driven, not subject-driven

The coverage page's unit is the **faculty-subject** (a teacher's assignment to
a subject in a section) — and the department that owns a *teacher's* coverage
is **their own department**.

So a teacher homed in MATH who teaches a CCS section has **their coverage
counted under MATH**, and MATH's coverage page legitimately shows a subject
that belongs to another department. That is not a filter leak; it is the page
answering "how is my faculty doing?" rather than "whose sections are these?".

The **results** surfaces answer the same question now — they are
**faculty-driven too**, through the same resolver
(`resolveSubjectDepartment` in `lib/evaluation-utils.ts`). A teacher's results
are filed under their own department exactly as their coverage is, so the two
pages cannot disagree about a teacher.

**No fallback (2026-10-20).** The home is the whole rule: a department's
teaching is the teaching of the faculty homed in it. Two cases used to fall
elsewhere — the teacher has **no home department** (the dummy account, a CSV
row with no department), or their home department **has no courses of its
own** (the placeholder buckets "Unassigned" and "Admin"). Both now stay
where they are:

- a teacher homed in a **bucket** owns their subjects in that bucket, and the
  bucket holds its own members' teaching — not everyone's;
- a teacher with **no home** owns no department, so their subject is
  **unattributed**: the coverage page's "Unresolved" group, and the results
  list's integrity warning, name them.

**What the reviewer sees.** A section that belongs to another department can
appear in a drill-down (the teacher's home), so the row says whose section
it is — the disclosure now belongs on the **row**, not on the card: the
card is the teacher, and the teacher's home department is the page you are
already on.

## 2. Decision

The coverage page's **department drill-down** gains the results page's two
groupings, as a switch above the table:

```
┌ Coverage ─ [period ▾] [search…] [⤓ Export] ───────────────────────────┐
│ Depts reporting 1/1 · Faculties 3 · Students 120 · Participated 90 …    │
│ ┌ department table (unchanged) ────────────────────────────────────────┐ │
│ │ CCS  1/2 subjects · 3/4 faculty · 12/16 students · 75%              │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ ── CCS ──────────────────────────────  ← the drill-down                 │
│   [ By Subject & Section ]  [ By Faculty ]        ← the new switch       │
│   ┌ tab 1 ─────────────────────────────────────────────────────────────┐  │
│   │ Subject    Section   Faculty   Enrolled Part. Disp. Compl.  ⋯     │  │
│   │ BS101 Intro BSCS-1A   Ana Cruz     34     30    1   88%  ⋯         │  │
│   └───────────────────────────────────────────────────────────────────┘  │
│   ┌ tab 2 (one card per faculty) ────────────────────────────────────┐  │
│   │ ▸ Ana Cruz  ana@x           3 subjects · 42 students · 81%       │  │
│   │     BS101 Intro (BSCS-1A) 30/34 participated · 88%      [Details]  │  │
│   │ ▸ Ben Santos  ben@x         1 subject  · 12 students · 50%       │  │
│   └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Tab 1 "By Subject & Section"** — the current table, plus a **Section**
  column. This is the results page's tab name, copied verbatim so the two
  pages read the same.
- **Tab 2 "By Faculty"** — one card per teacher: name + email, their
  coverage aggregate (subjects · students · % participated), expandable to
  their subjects (each with its section, the participation counts, the
  completion pill and the existing **Details** action).
- **A row whose section belongs to another department says so**, so a
  subject from another department is never mistaken for a mis-attributed
  one (§1.1).
- The **department table at the top is unchanged**, and the KPIs stay
  department-level.

## 3. Pinned contracts

1. **The switch lives in the department drill-down only.** The top level
   stays a per-department table. For a dean — who lands straight on their
   department — the switch is the first thing they see.
2. **The tab labels are the results page's** — "By Subject & Section" and
   "By Faculty" (`CoveragePage.tsx:93-96` — the labels moved here when the
   **results** page dropped its flat table and its tab strip on 2026-10-21;
   its drill-down is now the faculty cards alone), so the two pages use
   the same words for the same groupings.
3. **The faculty card carries coverage only.** No consolidated-PDF button
   and no show/hide-results toggle: neither is a coverage concept, and the
   toggle would mean carrying the visibility map and a write on a read-only
   report.
4. **The faculty aggregate uses the distinct student set**, exactly like the
   department figures (`evaluation-status.service.ts` unions the per-subject
   student id sets). A teacher with three sections and 34 students each
   counts 34 students, not 102 — a summed `enrolled` would double-count
   every shared student and make the faculty figures disagree with the
   department's.
5. **The rows carry what the grouping needs**: `facultyId` (a stable key),
   `facultyEmail` (the card shows it, like the results page's card), and
   the section (program + name, so the table can render the same
   `sectionLabel` the results page uses).
6. **The aggregates are per department** — `departmentId → facultyId →
   aggregate` — because the drill-down is per department and a teacher can
   teach in more than one. The dean's scoped payload therefore holds one
   department's worth.
7. **The dummy account stays excluded** from the faculty counts
   (the attribution spec's contract §3.4) — and it is excluded from the
   faculty aggregates too, so the card does not show a placeholder teacher.
   **2026-10-20:** the department's "Faculties" count is the **headcount**
   (contract 13), and the dummy is in no headcount because it has no home
   department — the exclusion is now a property of the population, not a
   filter.
8. **The search filters both groupings** — it filters the subject rows, and
   a teacher with no matching subject disappears from tab 2.
9. **Every surface attributes to the teacher's home department** (§1.1) —
    the home, **always**: a department's teaching is the teaching of the
    faculty homed in it. **Amended 2026-10-20** — the section's department is
    no longer a fallback, and the old gate ("the home must own a course") is
    gone: the membership rule already stops the placeholder buckets from
    accumulating everyone's subjects. A teacher with **no home** has no
    department: their subject is unattributed and lands in the "Unresolved"
    group. The coverage and the results surfaces resolve through the **same**
    helper (`resolveSubjectDepartment`), so they cannot disagree about a
    teacher.
10. **The results pages use the same rule** (the attribution spec, §3.1) —
    one resolver, one rule, every surface.
11. **Tab 1 keeps its pagination; tab 2 does not** — the results page's
    "By Faculty" renders every card, and the number of teachers in a
    department is small.
12. **No schema change.** Everything the grouping needs is already in
    `faculty_subjects`, `sections`, `department_courses`, `student_enrollments`
    and `evaluations`.
13. **The department's "Faculties" count is its headcount** (the attribution
    spec, contract §3.14): the number of faculty accounts homed in the
    department, soft-deleted excluded, counted once — the same number the
    results list, the export CSVs, the report page and the Department
    Health report print. The KPI above the table sums the headcounts, which
    cannot double-count a teacher who teaches in several departments.
14. **The drill-down's "By Faculty" tab lists the department's own faculty**
    (the attribution spec, contract §3.15): the accounts homed in the
    department, the same set as the headcount above it. A teacher homed
    elsewhere gets **no card** in this department, and — with the home as the
    only rule (contract 9) — their subject is not in this department's rows
    either: the coverage of a department is its own faculty's teaching. A
    teacher with **no home** has no department, so their subject is
    unattributed and lands in the "Unresolved" group, which is not a
    department and therefore has no membership question.

## 4. Changes

| # | Change | Path |
|---|---|---|
| C1 | The subject rows carry `facultyId`, `facultyEmail` and the section (`sectionProgram` / `sectionName`); the service resolves the sections it already has the mappings for | `features/evaluations/evaluation-status.service.ts` — **done** (one `sectionRepository.list()` read, mapped in memory like the results service) |
| C2 | The service returns the per-department faculty aggregates (subjects · distinct students · participated · disputed · in-progress · not-participated · completion), the same union the department rows already do | `features/evaluations/evaluation-status.service.ts` — **done** (`facultyAggregates: departmentId → facultyId → aggregate`) |
| C3 | The drill-down gains the two-way switch, the **Section** column on tab 1, and the faculty cards on tab 2 | `features/evaluations/components/CoveragePage.tsx` — **done**. The switch is the shared `components/ui/Tabs.tsx`, which the results page now uses too, so the two pages read identically and the switch is no longer hand-rolled button markup |
| C4 | The tests: the rows carry the new fields, the aggregates are distinct-student based and per department, the switch renders and the card aggregates | `lib/__tests__/evaluation-status-aggregate.test.ts` (+4 cases), `lib/__tests__/coverage-page-freshness.test.tsx` (+3 cases) — **done** |
| C5 | The coverage service attributes each subject to the **teacher's own department**; the rows carry the section's department so a row from another department can say so | `features/evaluations/evaluation-status.service.ts` + `features/evaluations/components/CoveragePage.tsx` — **done 2026-10-20** (a new pure helper `resolveSectionDepartment` separates the section's department from the home; the tests that pinned the old rule were rewritten, and the new fallback cases added). **Amended 2026-10-20** — the rule moved into the shared resolver `resolveSubjectDepartment` (`lib/evaluation-utils.ts`) and the results surfaces adopted it, so there is one implementation. **Amended again the same day** — the section's department is no longer a fallback: the teacher's home is the whole rule, and a teacher with no home department is unattributed (the "Unresolved" group) |
| C6 | The **results** surfaces resolve a department through the same helper, so the two pages cannot disagree about a teacher | `lib/evaluation-utils.ts`, `features/evaluation-results/evaluation-results.repository.ts` — **done 2026-10-20** |
| — | Out of scope | The top-level department table · the coverage CSV export's columns (the export stays per subject) · a cross-department faculty view · the results page's own groupings · schema |

## 5. Risks

- **The payload grows** for the admin (the aggregates for every department's
  faculty). The size is bounded by the faculty count, not the subject
  count, and the coverage page already carries every subject row.
- **A teacher in two departments** appears in both departments' aggregates,
  each counting only their own subjects' students — the same rule the
  department figures already use.
- **Distinct students vs summed enrolment** is the easy thing to get wrong
  (contract §3.4): a teacher with three sections of the same class would
  otherwise report three times the students.
- **The tab switch changes the drill-down's layout** — the table's
  pagination and the card list do not coexist, so the paginator must move
  inside tab 1 only.

## 6. Verification (owner runs — H1)

```bash
npx tsc --noEmit && npm run lint && npm test
```

The manual checks (dean and admin, both pages, both groupings) and the
**home → section matrix** are in
`docs/evaluation-surfaces-verification.md` — the matrix is the only number
that says how much the new attribution actually moved on real data.

Manual, on the admin's `/admin/evaluations/coverage`:

1. Open a department → the switch shows, "By Subject & Section" is the
   default, and the table now has a **Section** column.
2. Switch to "By Faculty" → one card per teacher, with their subjects
   listed on expansion and **Details** still opening the participation
   breakdown.
3. A teacher's card shows **distinct** students: cross-check against the
   department's "Students" tile for a teacher who teaches several sections
   of the same class.
4. A teacher who teaches in two departments appears in each department's
   drill-down, with only their own subjects.
5. Type in the search box → both groupings narrow; a teacher with no
   matching subject disappears.
6. The **"By Faculty" card and the tab-1 row** show the teacher's home
   department when it differs from the department being viewed — a small
   "homed in MATH" marker beside the name.
7. As a dean, the same marker appears for a teacher homed elsewhere who
   teaches in their department.

## 7. Decisions

| # | Question | Decision |
|---|---|---|
| D1 | **Should the faculty card be expandable, like the results page's?** | **Yes (2026-10-20).** The results page's card expands to its subjects (`DepartmentSubjectView.tsx:342-347`); the coverage card reads the same way, with the participation numbers instead of ratings. |
| D2 | **Should the card's headline be the participation percentage, or the counts?** | **Both, on one line (2026-10-20)** — "3 subjects · 42 students · 81%" — the results page's card shows "N subjects / M responses" plus its average, so the coverage card shows its counts plus its percentage. |
| D3 | **Should the "Not started" case be called out on the card** — a teacher whose every subject has 0 responses? | **Yes (2026-10-20), as the existing pill.** The completion pill already distinguishes "Not started" (0%) from "Lagging"; a teacher's aggregate gets the same pill, so a silent teacher is visible at a glance. |
| D4 | **A teacher who is homed elsewhere appears in the list without explanation** — the attribution (the section's department) is right, but the card gives no hint. | **WITHDRAWN (2026-10-20).** The user: "since it is Faculty-Subject then it's faculty driven." The card is the teacher, and the teacher's home department is the page you are already on — there is nothing to disclose. Replaced by D5. |
| D5 | **Should the coverage page be faculty-driven (the teacher's own department) rather than section-first?** | **Yes (2026-10-20).** The coverage page's unit is the faculty-subject, and a teacher's coverage belongs to their department: a MATH-homed teacher teaching a CCS section is counted under MATH, and MATH's page may show a subject that belongs to CS. The **faculty-subject's** department takes priority only when the teacher is based somewhere that cannot own coverage — no home department, or a home with no courses of its own (the "Unassigned"/"Admin" placeholder buckets). The disclosure moves to the **row** (C5): a subject from another department says whose section it is. **Confirmed by the user (2026-10-20): "since the evaluated entity is the faculty it only makes sense that coverage uses the faculty's own department to show it as part of its own department list."** **Extended the same day (2026-10-20, C6):** the **results** surfaces adopted the same rule and resolve through the same helper, so the difference between the two pages is closed — a dean who owns a section taught by a teacher homed elsewhere sees that section on their **coverage** page, and their results sit with the teacher's own department on both pages. |
