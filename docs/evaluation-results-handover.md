# Evaluation results — the handover

**Date:** 2026-10-21
**Status:** 🟡 **one slice is planned and waiting on a number; one change landed today.**
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
| `/admin/evaluations/results/[departmentId]` · `/dean/…` — a row per **subject** | the period **∧ the term's assignments** ← **the gate, being fixed** | the same pooling, over the gated set |
| `/admin/evaluations/results/[departmentId]/[facultySubjectId]` — a row per **response** | the **period** only (`listSubmittedByPeriodAndEvaluateeAndFS`) | the same ratings, per subject |
| `/faculty/evaluations/results/[facultySubjectId]` — a teacher's own | the **period** only | the same |
| both **export CSVs** | the department page's read ← **the gate, being fixed** | the same |

**No surface opens a direct connection.** The group-by that needed one cannot be expressed through
PostgREST (AGENTS.md **Lesson 7c**), so the rows cross the wire and the group-by happens in Node —
**per department** for the list and the exports, **per faculty** for the report, each cached five
minutes, and the read carries the **weights** (the per-category sum and count) so a department's
figure is the **pool** of its faculty's totals, not a mean of means. The drill-down stays **live,
on demand** (rule 3 of `specs/evaluation-results-cache.md`).

⚠️ `pg` and `DATABASE_URL=` stay in the repo — `scripts/apply-schema.mjs` (the owner's manual
schema runner) needs both. The **app** does not.

## 2. The membership gate — decided, not built (the next slice)

**The rule (owner, 2026-10-21).** A response is in scope **iff its period is the selected
period** (`evaluations.evaluation_period_id`). The period's **parent semester**
(`evaluation_periods.semesterId` — free, `service.ts:151` loads it in the same call) scopes the
**subject list** only. The assignment's `faculty_subjects.semesterId` is the **teaching's** stamp and
is **not** a response filter.

**The three columns** — this is the whole finding:

| column | lives on | what it is | a scope? |
|---|---|---|---|
| `evaluations.evaluation_period_id` | the response | the period it belongs to | **yes — the strict gate** |
| `evaluation_periods.semesterId` | the period | the period's **parent** term | **yes — the subject list's** |
| `faculty_subjects.semesterId` | the assignment | a **stamp applied at write time** | **no — never** |

**The defect, exactly.** The department page used the **subject list's** scope as a **response**
filter: `deptEvals = evals.filter((e) => memberIds.has(e.facultySubjectId))`
(`features/evaluation-results/evaluation-results.service.ts:190`). So it — and both export CSVs —
**under-report** against the results list, one click apart and in the file you send.

**The six changes** (`specs/evaluation-results-attribution.md` §4 **S6.1** — the file list, the
algorithm and the proof are there):

1. the response set — the members = the accounts homed in the department; the evaluations = the
   period's, and the stamp filter is **deleted**;
2. the subject list — the members' assignments this term **∪** the assignments the responses point
   at, so a counted response always has a row;
3. the pooled rating — over the response set, so it **equals** the list's figure;
4. "Faculty" → the headcount, so both pages count the same population;
5. the list page's `offSemester` banner **retired** (the coverage page keeps its own — its list
   **is** semester-scoped);
6. **D9** — the subject page's routes check that the assignment belongs to the department.

⭐ **The inputs are the two the route already has** — `evaluationPeriodId` + `departmentId`.
Nothing new is plumbed.

### ⭐ Capture before anything else

The department page's figure is **computed**, so the "before" is gone once the change lands.

```
/api/admin/evaluation-results/departments/b0000000-0000-0000-0000-000000000001?evaluationPeriodId=5a01886e-4eb9-4cf9-84d1-c314f610bb59
  → departmentAggregate.avgRating + totalResponses      ← the BEFORE
/api/admin/evaluation-results/figures?evaluationPeriodId=5a01886e-4eb9-4cf9-84d1-c314f610bb59&departmentId=b0000000-0000-0000-0000-000000000001
  → avgRating + totalRespondents                        ← the AFTER (already on screen)
```

If the two averages are **equal**, the gap is zero for that department and the slice is
**insurance** rather than a fix — the plan stands either way, but the release note changes.

### The rule's reach

- **The published department average and both export CSVs move** — onto the results list's figure.
  That is the point (§3.18), and a number that has been quoted will change.
- **The membership set widens** — "the members" becomes *the faculty homed in the department*, not
  *the faculty with an assignment this term* — which moves the dean's **visibility scope** (§3.8)
  and the **release gate** (§3.9). Those two guards move in the same slice.
- ⭐ **The dean's release gate is already safe**: it reads `subjects.some(s => s.totalRespondents > 0)`
  — the **results**, not the term's assignments
  (`app/api/dean/evaluation-results/departments/[departmentId]/route.ts:42`).
- ⭐ **The subject page already complies** with the rule (it reads the period) — it needs no read
  change, only the D9 guard.

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
| 2 | **the membership gate** | **decided (D′), not built** — §2 above |
| 3 | the `""` bucket | **done** — the general rating leaves the error bucket out; the state cannot occur (the FKs cascade) |
| 4 | the `CATEGORY_NAMES` aliases | **done** — the map stays; the state cannot occur (a period has one rubric group) |
| 5 | **the ties** — the admin table prints the first, the faculty page prints them all | open |
| 6 | the report dashboard | **done** — it reads per faculty now; nothing opens a direct connection |
| 7 | three reads still on a cap | **done** — all chunked and paged |
| 8 | ⭐ **the sentiment calculation** — the figure is no longer displayed, but it is still **computed** and the comments are still read | **deferred** — §3 above |
| 9 | ⭐ **the `evaluation_period_id` legacy NULLs** | open — a data condition, not a rule. `evaluations.evaluation_period_id` is nullable (`supabase-schema.sql:1846`) and migration 30c's backfill skipped some semesters (`:1883`) and mis-pointed multi-period semesters (`:1884-1889`). **Every** surface drops those rows identically, so no surface disagrees — but recovering them adds responses to **every** period's published figures. Not this slice |

## 5. The files

| file | what it is |
|---|---|
| `specs/evaluation-results-attribution.md` | **the contract** — §1.10 the three reads · §3.21 the period is the strict gate · §4 S6.1 the slice · §6.1 the measurement · §7 D7/D8/D9 |
| `specs/evaluation-results-cache.md` | the cache contract (rule 3: a detail page stays live) |
| `docs/evaluation-surfaces-verification.md` | ⭐ the manual checks and the home-less-teachers SQL |
| `features/evaluation-results/evaluation-results.service.ts` | `getDepartmentSubjectResults` (:174) and `getDepartmentMemberTeaching` (:147) — where the gate is applied |
| `features/evaluation-results/evaluation-results.repository.ts` | `listDepartmentFigures` (:449) — the reference read · `listDepartmentTeachingAssignments` (:625) — the term's assignments |
| `features/evaluations/evaluations.repository.ts` | `listSubmittedByPeriodAndEvaluatees` (:494) — the period-scoped read the department page uses |
| `lib/evaluation-utils.ts` | `classifyWarningAssignments` (:486) · `aggregateDepartmentResults` (:341) · `computeSentimentScore` |
| `.opencode/skills/plan-fix/runs/20261021-1800-open-gaps.md` | the run file — the scan, the decisions, the slice |

## 6. The gate (the owner's run — AGENTS.md **H1**)

```powershell
npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npx vitest run }; if ($?) { npm run build }
```
