# Evaluation results — the cache handover

**Date:** 2026-10-21
**Status:** 🟢 **the list, the exports, the dean view and the coverage warnings run without a direct
database connection.** 🟡 **one surface still does:** the report dashboard (see §7).
**Supersedes:** `docs/evaluation-results-endpoint-handover.md` — that story's approach (a group-by
in Postgres over a direct connection) cannot be used in this environment, and the file is kept only
as the record of the measurement.

---

## 1. Why this exists

The results list was answered by a group-by in Postgres over a **direct** connection
(`lib/db/postgres.ts`, `pg` + `DATABASE_URL`). That connection cannot be opened here: the
connection string comes from the Supabase dashboard's **Connection** panel, and this environment has
no dashboard access. So the route answered **500** — `DATABASE_URL is required for the evaluation
aggregates` — on every request, while `SUPABASE_URL` + the service-role key (the REST API) kept
working for everything else.

The figures are now **read per department through the app's own repositories**, and **cached for
five minutes**. The contract is `specs/evaluation-results-cache.md`; this file is the handover of
what was built.

## 2. The shape now

```text
/admin/evaluations/results  (page)
  ├─ GET /api/admin/evaluation-results?evaluationPeriodId=…
  │     → getDepartmentResults()            → the 11 rows: name, code, faculty count, responses
  │     → the attribution warnings          → read from the period's evaluations
  │     (a light read: the period's evaluations, the assignments, the teachers' home departments)
  │
  └─ GET /api/admin/evaluation-results/figures?departmentId=…&evaluationPeriodId=…
        → getCachedDepartmentFigures()      → one department: avg rating, remark, highest/lowest, sentiment
        → listDepartmentFigures()           → that department's faculty → their evaluations →
                                              their assignments → their ratings + comments
        → cached 5 minutes (figure-cache.ts), `refresh=1` reads again
```

The page shows the table **immediately** (names, faculty counts, response counts) and each row's
rating columns fill in as that department's response lands — a skeleton per cell until then.

## 3. The rules that stayed

The app's own rules, unchanged by the move:

| Rule | Where it lives now |
|---|---|
| the period's submitted **and enabled** evaluations | `listPeriodFigures` / `listDepartmentFigures` |
| the **live-eval rule** (an evaluation whose assignment no longer belongs to its evaluatee does not count) | the same two methods, in TypeScript |
| the **teacher's home department** (contract §3.1) — a home-less teacher is a warning, not a row | the same two methods |
| the category arithmetic, the remark ladder, the highest/lowest selection | `lib/evaluation-utils.ts` — unchanged, and still the only home for the display rules |

## 4. What made it faster, and what did not

- **The rows are still read.** A full period is 7,471 evaluations × 27 rubric items = **201,717
  rating rows**. Without a database-side group-by, those rows cross the wire. The **cache** is what
  keeps that affordable: five minutes per department, per warm instance.
- **Each rating is now read once.** `lib/db/common.ts`'s `RATINGS_IN_CHUNK_SIZE` went **100 → 37**:
  37 × 27 = **999** rows, one page under PostgREST's 1,000-row cap, so a chunk comes back in a
  **single** request. With 100 the rows spilled into three `OFFSET` pages and the database re-scanned
  the chunk three times over.
- **The reads are per department**, so a row can be filled as soon as its numbers arrive.
- **The old number:** the list route was measured at **26,012 ms** of server time, ~263 reads and
  ~220,000 rows. The new path's cost is the same rows, read once, spread over the departments and
  then cached. The measurement for the new path has **not been taken yet** — see §8.

## 5. The page

`app/admin/evaluations/results/page.tsx`:

- the **banner**: *"Figures as of {when} · refreshes every 5 minutes"* + a **Refresh** button. The
  time is the **least fresh** figure on screen (`cachedAt` travels with the numbers).
- **Refresh** reads again with `refresh=1` → the server ignores the cache and reads the database.
  The rows keep their numbers while the new ones arrive; a row shows a skeleton only when it has no
  numbers yet.
- the automatic re-read every five minutes is served from the cache unless the window has passed.
- **sorting is paused while rows are loading** — the rows keep the order the departments came in,
  and the sort applies once every row has numbers (a table that re-sorts under the reader is worse
  than one that sorts a moment later).
- the **Export** button shows a loader while the download runs.

## 6. The export

`/api/admin/evaluation-results/export` and `/api/dean/evaluation-results/export`:

- the per-department CSVs are the **drill-down's** subject rows — live, on demand.
- the `summary.csv` row carries the **same read's** pooled figures, so the export cannot disagree
  with itself, and the export does not walk the ratings a second time.
- `maxDuration = 60` — the same budget the import routes use. The export is a download: it is slow
  by nature, and the button says so.

⚠️ The export's figures come from the drill-down's read, which does **not** filter `isDisabled` and
is scoped to the term's roster. So the export can differ from the results list in those two cases
(the open decisions in §7, items 1 and 2).

## 7. What is still open

| # | Item | State |
|---|---|---|
| 1 | **`isDisabled`** — the list excludes a disabled evaluation, the drill-down and the faculty page count it | open decision (which is the truth); the export follows the drill-down |
| 2 | **the membership gate** — the drill-down's term roster vs the faculty page's | open decision |
| 3 | **the `""` bucket** — a rating whose rubric item no longer resolves counts toward Avg. Rating and can never be named | open; the raw-row path **counts** it (the aggregate dropped it) |
| 4 | **the aliases** — two spellings of a category overwrite each other instead of averaging | open |
| 5 | **the ties** — the admin table prints the first tie, the faculty page prints them all | open |
| 6 | **the report dashboard** — still reads the aggregate | **the last consumer of the direct connection** |
| 7 | **three reads still on a cap** — `listSubmittedByPeriodAndFacultySubjectIds`, `listStatusByPeriodAndFacultySubjectIds` (unpaged) and `getStudentBreakdownsForFaculties`'s unchunked comments read | open; nobody has hit them yet |

### The last consumer (item 6)

`features/evaluations/evaluation-report.service.ts` reads the aggregate for its per-faculty and
per-department rows (8 call sites). The report dashboard therefore still answers **500** without a
direct connection. When it is migrated, these become deletable:

- `lib/db/postgres.ts`, `features/evaluation-results/evaluation-aggregates.ts`
- `lib/__tests__/evaluation-aggregates.test.ts` (11 tests that assert the SQL as text)
- `listLiveDeptAverages`, `listLiveFacultyResults` (the repository, the interface, their tests)
- `computeCategoryAveragesFromTotals`, `poolCategoryTotals`, `buildLiveDeptAveragesFromTotals`
- `pg` / `@types/pg` from `package.json`, and `DATABASE_URL=` from `.env`

The report's **per-faculty** figures cannot be re-derived from the per-department ones (the pooling
weights are lost), so the migration needs its own read.

## 8. How to verify

The gates (the owner's run — AGENTS.md **H1**):

```powershell
npx tsc --noEmit; if ($?) { npm run lint }
npx vitest run
npm run build
```

Then, in the browser:

1. `/admin/evaluations/results` — the table appears with the names and counts; the rating columns
   fill in; the banner shows the read time; **Refresh** re-reads; **Export** downloads.
2. **Parity (§3.18):** the Avg Rating on the list must equal the drill-down's department average
   for the same department, and the drill-down's per-subject figures must equal the faculty page's
   for the same subject.
3. The **time**: the same request that took **26,012 ms** — read it in the Network tab. The first
   load of a department pays the read; the next five minutes are a cache hit.

## 9. The files

| File | What it is |
|---|---|
| `features/evaluation-results/figure-cache.ts` | the five-minute cache, the in-flight dedupe, the read time |
| `features/evaluation-results/evaluation-results.repository.ts` | `listPeriodFigures` (the departments, the warnings), `listDepartmentFigures` (one department's figures) |
| `features/evaluation-results/evaluation-results.service.ts` | `getDepartmentResults` (the list rows), `getDepartmentSubjectResults` (the drill-down, live) |
| `app/api/admin/evaluation-results/route.ts` | the list (the spine) |
| `app/api/admin/evaluation-results/figures/route.ts` | one department's figures, with `cachedAt` |
| `app/admin/evaluations/results/page.tsx` | the banner, the refresh, the per-cell skeletons |
| `lib/db/common.ts` | `RATINGS_IN_CHUNK_SIZE = 37` — a chunk's ratings fit one page |
| `specs/evaluation-results-cache.md` | the contract (what is cached, what stays live, the refresh) |
| `.opencode/skills/plan-fix/runs/20261021-1300-session.md` | the dead-code cleanup (group A) |
| `docs/evaluation-results-endpoint-handover.md` | the superseded story (the measurement) |
