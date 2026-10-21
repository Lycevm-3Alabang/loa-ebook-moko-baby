# Evaluation results — the handover

**Date:** 2026-10-21
**Status:** 🟢 **the membership gate is closed** — nine commits landed on 2026-10-21 (the gate in
five steps, the drill-down's redesign, the ties). What is left is a **spec** (the export) and the
deferred cleanups.
**Part of:** `.opencode/skills/plan-fix/runs/20261021-1800-open-gaps.md` (slice 3 of 7).
**Durable records** — the **spec** carries the rules, the **TODO** carries the open items, the
**run file** carries the slice. This file is the entry point; it goes stale first.

> ⭐ **This is the only handover.** The cache, endpoint and membership-gate handovers were folded
> into this one (2026-10-21) — one per session, or none.

---

## 1. Where the results surfaces stand

| surface | the response set | the figure |
|---|---|---|
| `/admin/evaluations/results` · `/dean/evaluations/results` — a row per **department** | the **period** only (`listSubmittedEvaluatesForFaculty` → `.eq("evaluation_period_id", …)`) | the department's pooled rating, read **per department** and **cached 5 minutes** (`features/evaluation-results/figure-cache.ts`) |
| `/admin/evaluations/results/[departmentId]` · `/dean/…` — a **card per faculty** | the **period** only ✔ (the gate is **gone**) | the same pooling, over the shared set ✔ |
| `/admin/evaluations/results/[departmentId]/[facultySubjectId]` — a row per **response** | the **period** only (`listSubmittedByPeriodAndEvaluateeAndFS`) | the same ratings, per subject |
| `/faculty/evaluations/results/[facultySubjectId]` — a teacher's own | the **period** only | the same |
| both **export CSVs** | the department page's read ✔ (the gate is **gone**) | the same |

**No surface opens a direct connection.** The group-by that needed one cannot be expressed through
PostgREST (AGENTS.md **Lesson 7c**), so the rows cross the wire and the group-by happens in Node —
**per department** for the list and the exports, **per faculty** for the report, each cached five
minutes, and the read carries the **weights** (the per-category sum and count) so a department's
figure is the **pool** of its faculty's totals, not a mean of means. The drill-down stays **live,
on demand** (rule 3 of `specs/evaluation-results-cache.md`).

⚠️ `pg` and `DATABASE_URL=` stay in the repo — `scripts/apply-schema.mjs` (the owner's manual
schema runner) needs both. The **app** does not.

## 2. The membership gate — BUILT (2026-10-21)

**The rule (owner, 2026-10-21).** A response is in scope **iff its period is the selected
period** (`evaluations.evaluation_period_id`). The period's **parent semester**
(`evaluation_periods.semesterId`) scopes the **subject list** only. The assignment's
`faculty_subjects.semesterId` is the **teaching's** stamp and is **not** a response filter.

**The three columns** — this is the whole finding:

| column | lives on | what it is | a scope? |
|---|---|---|---|
| `evaluations.evaluation_period_id` | the response | the period it belongs to | **yes — the strict gate** |
| `evaluation_periods.semesterId` | the period | the period's **parent** term | **yes — the subject list's** |
| `faculty_subjects.semesterId` | the assignment | a **stamp applied at write time** | **no — never** |

### What landed (five steps, one commit each)

1. **One read decides the set** — `listDepartmentResponseSet` (the members, the period's submitted
   and enabled evaluations, the live-eval rule, the assignments they point at). The list's figure
   and the drill-down's rows read the **same** set, so §3.18's parity is structural, not
   coincidental. The members come from `listFacultyByDepartment` — the role **and** the
   department are both filters in the query, so the department's students never cross the wire.
2. **The service reads that set** — the subject list is the members' teaching this term **∪**
   the assignments the counted responses point at, so a counted response always has a row; the
   pooled rating is over the set, so it **equals** the list's figure.
3. **The dean's guards read the members** (the governable set widens) and **D9 is closed** — both
   `groups/[facultySubjectId]` routes check that the subject belongs to the department in the URL.
4. **The list page's `offSemester` banner is retired** — the coverage page keeps its own: its
   list **is** semester-scoped, so "outside the term" is a real condition there.
5. **The surfaces show the ratings, not the counts**, and **every department is a row**.

### The release note

- ⚠️ **The published department average and both export CSVs moved** — onto the results list's
  figure. That is the point of the slice; a number that has been quoted will change.
- ⭐ **The capture was never taken** (the code landed first), so the note says *"the drill-down
  now equals the results list"* rather than quantifying the movement.
- **The membership set widened** — a teacher homed in the department with no assignment this term
  is a member of it, so the dean's guards say so.
- **The drill-down stopped counting** a soft-deleted teacher's responses and the legacy
  `isDisabled` rows — the list never counted them (that is the parity closing).
- ⚠️ **The list was missing the departments with no responses** — a pre-existing bug, fixed in
  the same pass: the rows came from the period's *evaluations*, so a department nobody answered
  in had no row, while the export's `summary.csv` and the coverage page both carried it.

### The rule's reach

- **The dean's release gate was already safe**: it reads `subjects.some(s => s.totalRespondents > 0)`
  — the **results**, not the term's assignments
  (`app/api/dean/evaluation-results/departments/[departmentId]/route.ts:42`).
- ⭐ **The subject page complied with the rule already** (it reads the period) — it needed no read
  change, only the D9 guard.
- ⭐ **Still open from this item:** §7 **D8** (the legacy NULL `evaluation_period_id` rows) — a
  data condition, not a rule: every surface drops those rows identically, so no surface
  disagrees, but recovering them adds responses to **every** period's published figures.

## 3. The sentiment figure — half done (2026-10-21)

**Two kinds of sentiment.** The **comment's** is **stored**
(`evaluation_comments.sentimentLabel` / `sentimentScore`, written when the comment was analysed);
the **figure** is **calculated** — `computeSentimentScore(comments)` pools the stored scores into
one number per figure.

**Landed today** — the calculated figure is **no longer rendered in the UI**: the results list's
"Sentiment" column (and its sort key), the department card's "Overall Sentiment", the subject pages'
"Sentiment Score" card, the faculty list's row, `DepartmentSubjectView`'s column, and the per-response
**badges/chips** on the subject pages. The test that guarded the removed card became its inverse
(`lib/__tests__/department-summary-widget.test.tsx`).

**Still there, on purpose** — the export CSVs · the PDF (`lib/evaluation-pdf.ts`,
`DownloadEvalPdfButton`, `ReportModal`'s PDF block) · the payload fields · the calculation and the
comments read · the comment text · `SentimentAnalysisPage` · `EvaluationDashboard`.

⭐ **Why the removal is deferred:** the comments are read **only** for the sentiment
(`aggregatePooledResults` → `computeSentimentScore`) — so when the figure goes, the drill-down
**stops reading the comments**: one read fewer per page load. That is a separate slice, and it
touches the same files the membership gate does.

## 4. What is still open

| # | item | state |
|---|---|---|
| 1 | **`isDisabled`** — the list excludes a disabled evaluation, the drill-down and the faculty page counted it | **done 2026-10-21** — the two flag-only writers now also set `status = 'INVALID'`, so every surface's state filter excludes them |
| 2 | **the membership gate** | **done** — §2 above |
| 3 | the `""` bucket | **done** — the general rating leaves the error bucket out; the state cannot occur (the FKs cascade) |
| 4 | the `CATEGORY_NAMES` aliases | **done** — the map stays; the state cannot occur (a period has one rubric group) |
| 5 | **the ties** | **done** — every surface prints **every** tied criterion; the shape follows the container (a label and a value joins them on one line, a label and a list stacks them) |
| 6 | the report dashboard | **done** — it reads per faculty now; nothing opens a direct connection |
| 7 | three reads still on a cap | **done** — all chunked and paged |
| 8 | ⭐ **the sentiment calculation** — the figure is no longer displayed, but it is still **computed** and the comments are still read | **deferred** — §3 above |
| 9 | ⭐ **the `evaluation_period_id` legacy NULLs** | open — a data condition, not a rule. `evaluations.evaluation_period_id` is nullable (`supabase-schema.sql:1846`) and migration 30c's backfill skipped some semesters (`:1883`) and mis-pointed multi-period semesters (`:1884-1889`). **Every** surface drops those rows identically, so no surface disagrees — but recovering them adds responses to **every** period's published figures. Not this slice |
| 10 | ⭐ **the export's two views** — the flat rows and the per-faculty narrative | **open** — a spec to write (`specs/evaluation-results-export.md`); the per-faculty figures are already computed (`facultyAggregates`), the export route just does not destructure them |
| 11 | ⭐ **the PDF's per-faculty average is a mean of means** | **open, deferred** — `lib/evaluation-pdf.ts:352` computes the mean of a teacher's subject averages where the page shows the **pooled** figure; it wants its own spec |
| 12 | ⭐ **the dead code** — `listDepartmentAssignments`, `listSubmittedByPeriodAndEvaluatees`, `DepartmentAggregate.totalSubjects` / `uniqueFaculty` | **open, deferred** — ⚠️ the second one's tests are the **proof** of AGENTS.md Lesson 7, so the lessons need re-anchoring before it goes |

## 5. The files

| file | what it is |
|---|---|
| `specs/evaluation-results-attribution.md` | **the contract** — §1.10 the three reads · §3.21 the period is the strict gate · §4 S6.1 the slice · §6.1 the measurement · §7 D7/D8/D9 |
| `specs/evaluation-results-cache.md` | the cache contract (rule 3: a detail page stays live) |
| `docs/evaluation-surfaces-verification.md` | ⭐ the manual checks and the home-less-teachers SQL |
| `specs/evaluation-results-summary-card.md` | the Department Summary card's design (the headline, the read-out, the triage rule) |
| `features/evaluation-results/evaluation-results.service.ts` | `getDepartmentSubjectResults` (:186) — the drill-down's assembly · `getDepartmentMembers` (:150) — the membership set |
| `features/evaluation-results/evaluation-results.repository.ts` | `loadDepartmentResponseSet` — **the one place the set is decided** · `listDepartmentFigures` — the reference read · `listDepartmentTeachingAssignments` — the term's assignments |
| `features/users/users.repository.ts` | `listFacultyByDepartment` — the members, with the role **and** the department as query filters |
| `features/evaluations/components/DepartmentSubjectView.tsx` | the faculty cards — the members, their subjects, the name format, the sort, the expand-all |
| `lib/evaluation-utils.ts` | `findAttentionRubrics` (the triage rule) · `isSubjectInDepartment` (the D9 guard) · `formatFacultyName` (the name format) · `aggregateDepartmentResults` · `computeSentimentScore` |
| `.opencode/skills/plan-fix/runs/20261021-1800-open-gaps.md` | the run file — the scan, the decisions, the slice |

## 6. The gate (the owner's run — AGENTS.md **H1**)

```powershell
npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npx vitest run }; if ($?) { npm run build }
```
