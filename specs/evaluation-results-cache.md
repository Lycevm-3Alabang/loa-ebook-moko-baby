# Evaluation results — the figures cache

**Status:** complete (2026-10-21)
**Why it exists:** the results list used to be answered by a group-by in Postgres over a
direct connection (`DATABASE_URL`). The environment has no Supabase dashboard access, so that
connection cannot be opened and the endpoint answered **500**. The figures are now read through
the app's own repositories — one department at a time, and one faculty at a time for the report —
and the read is expensive enough to be worth keeping.

## Current contract — before the requested change

Rules below describe the currently implemented behavior. The requested change later in this
document supersedes the admin results-list behavior for the department figures once implemented.

1. **The figures are read per department.**
   `listDepartmentFigures(departmentId, evaluationPeriodId)` reads the department's own faculty
   (the accounts homed in it), their submitted and enabled evaluations in the period, the
   assignments those evaluations point at, their ratings and their comments — and pools them with
   the existing pure helpers (`computeCategoryAverages` → `computeGeneralRating` →
   `mapCategoryAveragesToColumns` → `findHighestLowestRubrics` → `getRemark`).

   The rules are the app's own: the period, `status = 'SUBMITTED'`, `isDisabled = false`, the
   **live-eval rule** (an evaluation whose assignment no longer belongs to its evaluatee does not
   count) and the **teacher's home department**. A teacher with no home department is an
   integrity warning, not a row.

2. **The figures are cached for five minutes.**
   `features/evaluation-results/figure-cache.ts` keeps a department's figures for
   `TTL_MS = 5 * 60 * 1000`, keyed by period + department, and keeps the reads in flight so two
   callers never read the same department twice. The cache lives in the module, so it belongs to
   the **warm instance** — a cold instance reads once and then serves from its own copy. The five
   minutes are a freshness window, not a promise of sharing.

3. **The drill-down stays live.**
   `getDepartmentSubjectResults` (the per-subject rows of
   `/admin/evaluations/results/[departmentId]`) is **not** cached. A detail page is opened for a
   reason, and its numbers are read on demand, every time. The cache covers the department's
   pooled figures only.

4. **The manual refresh.**
   `GET /api/admin/evaluation-results/figures?...&refresh=1` reads the department again, ignoring
   the cache. The list page's **Refresh** button asks for every department with `refresh=1`.
   The rows keep the numbers they have while the new ones are read — a row shows a skeleton only
   when it has no numbers yet, so a refresh never blanks the table.

5. **The automatic re-read.**
   The list page asks for the figures again every five minutes. The request is served from the
   cache when the window has not passed, so it is cheap; when it has, the read happens again and
   the rows fill in with the new numbers.

6. **The page says how fresh the numbers are.**
   The figures response carries `cachedAt` — the moment the numbers were read. The page's banner
   shows the **least fresh** of the figures on screen, says that they refresh every five minutes,
   and offers the manual **Refresh** button. While any row is still loading, the banner says so
   and warns that **sorting by a column header is paused** — the rows keep the order they came in
   until every row has numbers, because a table that re-sorts under the reader is worse than one
   that sorts a moment later.

7. **The export reads the drill-down, live.**
   The export's `summary.csv` carries the same pooled figures as its per-department CSVs, because
   both come from the one read the export already does (`getDepartmentSubjectResults`). The export
   therefore does **not** walk the ratings a second time, and the drill-down stays live (rule 3).
   The headcount in the summary is the one the results page shows.

8. **The export is a download, not a page.**
   It is slow by nature, so the button shows a loader while it runs, and the route carries
   `maxDuration = 60` — the same budget the import routes use.

## Requested change — explicit refresh for the admin results list

**Status:** Implemented 2026-10-24.

This section supersedes rules 2, 4, 5 and the freshness/reminder portion of rule 6 for the admin
results list shown on `app/admin/evaluations/results/page.tsx`. It does not change the drill-down
or report contracts below.

### Behavior

1. **A page reload is not a refresh.** The department list, integrity warnings and each
   department's figures are cached on the client in storage that survives a browser reload in the
   same tab. Cache entries are keyed by evaluation period. The current five-minute server cache
   alone is insufficient: it is process-local and may be absent on a cold server instance.
2. When a period is selected, render its cached results immediately when available. Request the
   department list only when its period cache is missing, and fetch figures only for figure-cache
   misses. Re-rendering, navigating away and back in the same tab, or reloading the page must not
   re-fetch cached results.
3. **There is no timed or background refresh.** Remove the five-minute interval and any other
   automatic re-fetch trigger for results. The evaluation-period list retains its existing
   behavior.
4. **The Refresh button is the only way to refresh cached results.** Clicking it clears the
   selected period's local-storage results and figures entries, requests the department list
   again, then explicitly requests every department's figures with the cache-bypass behavior
   (`refresh=1`). Store successful results. A failed figures refresh must keep the last successful
   figures visible, restore their cache, report the error through the existing error-notification
   pattern, and allow retry.
5. The cache is scoped by period. Changing the selected period displays that period's cached
   values, if any, and fetches only missing entries; it must not show figures from another period.
   An explicit refresh updates only the selected period.
6. **The stale-data reminder is prominent.** Do not say that figures refresh automatically or
   imply that the timestamp means they are current. The banner must clearly state that displayed
   figures are cached and may be stale, tell the user to click **Refresh** for current figures,
   show the last successful button-refresh time (not the browser-load time), and visually emphasize
   the Refresh action. Preserve the loading/sorting-paused notice while uncached rows are loading.

### Acceptance checks

- After results have loaded, reloading the same page in the same tab displays the cached department
  list, warnings and figures without a request to
  `/api/admin/evaluation-results?evaluationPeriodId=...` or the figures endpoint.
- Switching periods never displays another period's figures; returning to a cached period does
  not request its cached departments again.
- Waiting longer than five minutes does not trigger a figures request or alter displayed figures.
- Clicking **Refresh** does request fresh figures for all departments in the selected period; the
  displayed values and timestamp update when successful.
- A failed manual refresh leaves the prior figures visible and surfaces the error.
- The banner communicates that figures can be stale and that the user must click **Refresh**;
  no automatic refresh interval is displayed or implied.

## The report's figures — the faculty read

The report (`/dean/evaluations/reports/detail`, `/faculty/evaluations/reports`) needs a
department's figures **and** its faculty's figures, and the two must agree.

F1. **The faculty's figures are read per faculty.**
    `listFacultyFigures(facultyId, evaluationPeriodId)` reads one faculty's submitted and enabled
    evaluations in the period, the assignments those evaluations point at, their ratings and their
    comments — the same rules as the department read (the period, `status = 'SUBMITTED'`,
    `isDisabled = false`, the **live-eval rule**).

F2. **The read carries the weights.**
    A faculty's figures come back with the per-category **(sum, count)** as well as the averages,
    because a mean cannot be un-meaned: a department's figure is the **pool** of its faculty's
    totals (`poolCategoryTotals` → `computeCategoryAveragesFromTotals` →
    `aggregatePooledAverages`) — the mean over the rating rows, not a mean of the faculty's means.

F3. **The faculty's figures are cached for five minutes**, keyed by period + faculty, in the same
    cache as the department's. The two kinds of figures have separate keys, so a department's entry
    and a faculty's entry can never answer for each other.

## What is NOT cached

| Surface | Why |
|---|---|
| the drill-down's subject rows | live, on demand (rule 3) |
| the attribution warnings | cheap to read (the period's evaluations) and part of the integrity signal |
| the department list (names, headcount, response counts) | cheap |
| the report's department row | derived from the cached faculty figures (F2) — it is not a read of its own |

## The reads that are still on the ground

The ratings still cross the wire — 201,717 rows for a full period. They are the data, and
without a database-side group-by there is no way around reading them. What changed:

- the ratings of a chunk of evaluations come back in **one** request (`RATINGS_IN_CHUNK_SIZE = 37`
  → 37 × 27 = 999 rows, under PostgREST's 1,000-row cap), so the database reads each rating
  **once** instead of three times over (`OFFSET` paging re-scans the chunk).
- the reads are **per department** (the list, the exports, the dean view) and **per faculty** (the
  report), so a row can be filled as soon as its numbers arrive.

## Done

- The **list**, the **exports**, the **dean view** and the **coverage warnings** read per
  department (rules 1–2).
- The **report** reads per faculty (F1–F3). It was the last consumer of the direct connection.
- The direct connection is **gone from the app**: `lib/db/postgres.ts`, the aggregate module and
  their tests are deleted. `pg` and `DATABASE_URL` remain in the repo for
  `scripts/apply-schema.mjs` — the owner's manual schema runner — and nothing else uses them.

## The open decisions this does NOT settle

- The **`isDisabled` gap** (TODO item 1): the list excludes disabled evaluations; the drill-down
  does not. The drill-down stays live, so the two can still disagree until that decision is made.
- The **membership gate** (TODO item 2): the drill-down's term roster vs the faculty page's.
- The **`""` bucket** (TODO item 6): a rating whose rubric item no longer resolves is counted in
  the average by the raw-row path, and cannot be named. The aggregate dropped it. The raw-row
  path is what runs now, so it counts.
