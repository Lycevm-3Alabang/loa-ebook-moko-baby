# Evaluation Results — Endpoint Performance Handover

**Date:** 2026-10-21
**Status:** 🟡 **the code is applied; the endpoint does not run yet** — two things are missing on the
environment (below). Nothing is left to design.
**Owner:** the next session picks this up and finishes the verification.

---

## 1. The task, and why this approach

**Reported:** `GET /api/admin/evaluation-results` took **26,012 ms** of server time (measured from
the browser HAR: `wait` 26,010 ms, `send` 0.1 ms, `receive` 0.5 ms — the *server*, not the network),
for a **4,779-byte** response. The page sat on a skeleton for half a minute, and the user reported
seeing stale or lagging figures before the correct ones landed.

**Measured:** the period holds **7,471 evaluations**. The endpoint answered it with **~263 round
trips** and **~220,000 rows** — because it pulled every `evaluation_ratings` row (7,471 × 27 rubric
items = **201,717**) into the app process to average them in Node, and because PostgREST's
`db-max-rows` (1,000) silently truncated every read it made along the way. **11 rows of output,
220,000 rows of input.**

**The approach, endorsed:** the group-by moves **into Postgres**. A group-by that spans a to-many
(ratings → items → categories) cannot be expressed through the REST API, so the app asks Postgres
directly — `lib/db/postgres.ts` (`pg` + `DATABASE_URL`) — and sends **plain parameterised
queries** (`$1` = the period id). **Nothing is created in the database**: no function, no view, no
migration, no `exec_sql`. The rows come back already grouped.

**Result: ~263 reads / ~220,000 rows → ~7 reads / ~500 rows.**

**Why the payload was never the problem:** the response was already 4.8 KB. Shrinking it changes
nothing; the cost was the rows read *server-side*. That is why "load on demand" alone was not the
answer — it would have left the drill-down at 2-4 s and dropped the list's headline numbers.

---

## 2. What is applied

| File | Change |
|---|---|
| `lib/db/postgres.ts` | **new** — a lazy `pg` Pool + `query<T>(text, params)`. Opens on first query, so the module imports without the env var and the error names the missing variable |
| `features/evaluation-results/evaluation-aggregates.ts` | **new** — three plain parameterised queries: the rating totals per assignment, the sentiment totals per (department, teacher), and the assignments with an evaluation (for the warnings) |
| `features/evaluation-results/evaluation-results.repository.ts` | `listLiveDeptAverages`, `listLiveFacultyResults` and `listAttributionWarnings` read the aggregate; a new `listDepartmentSentiment` |
| `lib/evaluation-utils.ts` | `computeCategoryAveragesFromTotals`, `poolCategoryTotals`, `aggregatePooledAverages`, `buildLiveDeptAveragesFromTotals`; the raw-row `aggregatePooledResults` delegates to the new one, so there is one chain |
| `lib/types/evaluation.ts` | `IEvaluationResultRepository` gains `listDepartmentSentiment` |
| `app/api/admin/evaluation-results/route.ts`, `app/api/dean/evaluation-results/route.ts` | the truncated comments read is replaced by `listDepartmentSentiment`; the phases run in one `Promise.all` |
| `package.json` | `pg` declared (it was only a transitive dep of `natural`); `@types/pg` added |
| `AGENTS.md` | **Lesson 7b** (the row cap, and that a paging fix multiplies the requests) and **Lesson 7c** (a group-by that spans a to-many needs a direct connection) |
| `specs/evaluation-results-attribution.md` | contracts **§3.18–§3.20** and change row **S5.2** |
| `TODO.md` | the "Open — evaluation results gaps" section, updated with what this settles |

**The payload and the page are unchanged** — same fields, same components, nothing to relearn.

---

## 3. ⭐ Still to do — the endpoint does not run yet

> **Both items below are environment, not code.** Until they are done, `GET
> /api/admin/evaluation-results` answers **500**.

1. **`DATABASE_URL` is not set.** The aggregate opens a direct Postgres connection, and without
   the variable the query throws `DATABASE_URL is required for the evaluation aggregates` — which
   the route turns into a **500**. ⭐ The error text has changed: the old one was `permission
   denied for schema public` (the app's `exec_sql` cannot create a function — `service_role` has no
   `CREATE` on `public`; the direct connection can).
   **Where:** the Supabase dashboard's **Connection** panel — the **transaction pooler** (port 6543)
   or the **session pooler** (port 5432). ⭐ With the session pooler, set `max: 1` in
   `lib/db/postgres.ts` (the comment there says so). A placeholder is already in `.env`.
2. **`npm install`** — `@types/pg` is not in the lock, so `import { Pool } from "pg"` does not
   typecheck until it is installed. ⭐ Without it the **build** fails.

**Then:**

```powershell
npm test
npm run lint
npm run build
```

**The tests were still red at the last run** (5 failures in
`lib/__tests__/evaluation-results-department-faculty.test.ts` + 1 lint warning in
`lib/__tests__/evaluation-results-live-faculty.test.ts`) — both from the same cause: the mock of
the aggregates module was missing `fetchAttributionWarnings`, and those five tests still used the
old database fixtures. ⭐ Both are fixed; **they have not been re-run.**

---

## 4. The behaviour changes (flagged, not silent)

1. **The `""` bucket leaves Avg. Rating.** A rating whose `itemId` no longer resolves to a
   `rubric_items` row was counted in the average (as an unnamed category) and could never be
   named as a Highest/Lowest Rubric. The aggregate's join **drops** it. The average is now the
   average over the eight real criteria — the same rule as TODO item 4, option (a).
2. **The sentiment number moves.** `listSubmittedWithSentiment`'s evaluations read was **unpaged** →
   truncated at 1,000 → the sentiment was the mean over ≤1,000 of 7,471 evaluations. It is now the
   mean over all of them. A correctness fix, and the column's number changes.
3. **The aliased categories get a defined order** — the same rule (`CATEGORY_NAMES`, last-wins), but
   "last" is now the query's order rather than the rating rows' order.

**And a coverage trade to know about:** the **live-eval rule** (an evaluation whose assignment no
longer belongs to its evaluatee) and the **home-department attribution** are now predicates in the
query, and Vitest cannot execute SQL. They are guarded by asserting the query body as text
(`lib/__tests__/evaluation-aggregates.test.ts`) — a weaker guard than a behavioural test, and both
the spec and the TODO say so.

---

## 5. The relevant sessions

| Run file | What it settled |
|---|---|
| `.opencode/skills/plan-fix/runs/20261015-1059-avg-rating-blank.md` | The "Avg. Rating shows —" report: a rating-less row, and the cached-null problem behind it |
| `.opencode/skills/plan-fix/runs/20261017-1646-eval-results-accuracy.md` | The results accuracy round: the live-vs-cached rule, the invalidation exclusion, the pooled department figures |
| `.opencode/skills/plan-fix/runs/20261021-0820-eval-ratings-row-cap.md` | **The row cap.** PostgREST's `db-max-rows` (1,000) truncates silently; every read behind a result figure now pages past it |
| `.opencode/skills/plan-fix/runs/20261021-0928-admin-results-endpoint-slow.md` | **This task.** The 26-second measurement, the read census, the group-by in Postgres, and the decision to keep the payload and the page unchanged |

---

## 6. How to prove it

1. **The commands** above — the suite, the lint, the build.
2. **The measurement:** open `/admin/evaluations/results`, capture
   `/api/admin/evaluation-results` in the Network tab, read its time. **Before: 26,012 ms.**
3. **The visual check** — `docs/evaluation-surfaces-verification.md` **§4** (the department table's
   numbers are unchanged) and **4.8** (the admin drill-down and the faculty page agree for a
   subject).
4. **The two behaviour changes above** will move two numbers — that is expected, not a regression.

---

## 7. Not in this task

- **The drill-down** (`app/admin/evaluations/results/[departmentId]/`) still reads its ratings
  (~30-60 reads, 2-4 s). It is the same defect, one click away, and a story of its own — it needs
  the aggregate's **per-assignment** grain, which the current queries do not yet carry.
- **The `isDisabled` gap** (TODO item 1) — the results list filters it; the drill-down and the
  faculty page do not.
- **The membership gate** (TODO item 2) — the drill-down's term roster vs. the faculty page's.
- **The admin Reset Database feature** is broken by the same wall as the app's `exec_sql` — a
  cleanup item in the TODO.
