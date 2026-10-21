---
skill: plan-fix
story: "The report dashboard is the last surface on the direct Postgres connection. `features/evaluations/evaluation-report.service.ts` reads the aggregate (8 call sites to `listLiveDeptAverages` / `listLiveFacultyResults`), so `/dean/evaluations/reports/detail` and `/faculty/evaluations/reports` answer 500 without `DATABASE_URL`. Migrate the report onto the app's own repositories — a per-faculty read, cached for five minutes — then delete the direct connection (`lib/db/postgres.ts`, the aggregate module, `@types/pg`). `pg` and `DATABASE_URL=` stay in the repo: `scripts/apply-schema.mjs` uses both (D3b)."
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {}
workflow: "A — SCAN → VISUAL → APPROVE → BUILD"
decision: "A — a per-faculty read (`listFacultyFigures`), cached per faculty for five minutes like the department figures; the department row is POOLED from the faculty rows, so the pooling weights travel with the read and no second walk over the ratings is needed. The results list's per-department cache stays as it is. B — the three functions with no live caller (`getAdminEvalReportData`, `getDeanDashboardData`, `getAdminDashboardData`) are deleted, not migrated; their pages keep their hardcoded preview data and lose the stale commented-out live hooks. Approved 2026-10-21 (\"Is this plan done?\" → Done)."
status: ready-for-implement-fix
pending: "the five slices are applied; the owner's gate run is the last step"
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration | — | **not run** — the user came with the migration from `docs/evaluation-results-cache-handover.md` §7 item 6, not through `/plan-fix`; the two decisions that shape the work were taken directly (below) |
| read-design | Which read replaces the aggregate? | **A — per-faculty read, cached per faculty.** The department row is pooled from the faculty rows. The list's per-department cache stays as it is. |
| dead-functions | What happens to `getAdminEvalReportData`, `getDeanDashboardData`, `getAdminDashboardData`? | **Delete them.** No live caller; their pages render hardcoded preview data with the live call commented out. |
| plan-done | Is this plan done? | **Done** — approved 2026-10-21; the plan below is the deliverable |
| who-implements | Who implements the slices? | **B (Code it)** — the agent writes each slice after "Apply this slice" |
| correction | `pg` / `DATABASE_URL` in S4? | **`scripts/apply-schema.mjs` imports `pg` and reads `DATABASE_URL`** — so `pg` and `DATABASE_URL=` **stay in the repo**; only `@types/pg` goes. Recorded as D3b. |

## Pending

- The owner's gate run (tsc → lint → vitest → build) is the last step.
- The build's font failure is an **upstream Next.js flake** (#99114), not this work — the owner
  chose to retry it, and to keep the durable `next/font/local` fix for later.

### Applied

### Applied

| slice | files | proof |
|-------|-------|-------|
| **S1 — the read** | `lib/evaluation-utils.ts` (+`computeCategoryTotals`) · `lib/types/evaluation.ts` (+`FacultyFigures`, +the interface line) · `features/evaluation-results/evaluation-results.repository.ts` (+`listFacultyFigures`, +2 imports) · `lib/__tests__/evaluation-results-faculty-figures.test.ts` (new, 6 cases) | **owner's gate pending** — the agent does not run the CLI (AGENTS.md H1) |
| **S2 — the cache** | `features/evaluation-results/figure-cache.ts` (the TTL + the in-flight dedupe become one `makeFiguresCache<T>`; +`getCachedFacultyFigures`, +`CachedFacultyFigures`; the public API of the department cache unchanged) · `lib/__tests__/evaluation-results-figure-cache.test.ts` (new, 4 cases) | **owner's gate pending** |
| **S3 — the report service** | `features/evaluations/evaluation-report.service.ts` (rewritten: `getDeanEvalReportData`, `getFacultyEvalReportData`; deleted: `getAdminEvalReportData`, `getDeanDashboardData`, `getAdminDashboardData` + 8 orphans; the raw `supabase.from("users")` gone) · `app/dean/evaluations/reports/detail/page.tsx` + `app/admin/evaluations/reports/page.tsx` (the stale "LIVE-DATA (swap back)" blocks) · `features/evaluations/components/dashboard/DashboardVisuals.tsx` (one stale pointer to the deleted functions) · `lib/__tests__/evaluation-report-service.test.ts` (new, 7 cases) · **`lib/__tests__/evaluation-report-dashboard.test.ts` deleted** (11 cases — it tested the three deleted functions; the plan put it in S4, but S3 deletes the functions, so the file goes with them or the gate fails) | **owner's gate pending** |
| **S4 — the direct connection dies** | **deleted**: `lib/db/postgres.ts`, `features/evaluation-results/evaluation-aggregates.ts`, `lib/__tests__/evaluation-aggregates.test.ts` (11 cases), `lib/__tests__/evaluation-results-live-faculty.test.ts` (4 cases) · `features/evaluation-results/evaluation-results.repository.ts` (−`listLiveDeptAverages`, −`listLiveFacultyResults`, −7 imports) · `lib/types/evaluation.ts` (−`LiveDeptAverage`, −`LiveFacultyResult`, −2 interface lines) · `lib/evaluation-utils.ts` (−`FacultyDeptTotals`, −`buildLiveDeptAveragesFromTotals`) · `lib/__tests__/evaluation-results-department-faculty.test.ts` (−3 cases, −the aggregates mock) · `lib/__tests__/evaluation-results-faculty-figures.test.ts` (−the aggregates mock) · `package.json`: `@types/pg` dropped **by the owner** (`npm uninstall @types/pg` already run — lockfile and node_modules synced) | **owner's gate pending** |
| **S5 — the docs** | `specs/evaluation-results-cache.md` (the status → complete; the new section "The report's figures — the faculty read" with F1–F3; "Still to do" → "Done") · `docs/evaluation-results-cache-handover.md` (status 🟢 everywhere; the report's shape in §2; the weights row in §3; §7 item 6 → done + "What the migration deleted"; §8 gains the report pages; §9's file table) · `TODO.md` (the "NEXT" item and the report item → `[x]`; the docs-cleanup item → all four closed; the "DATABASE_URL leaves .env" line corrected) · `AGENTS.md` **Lesson 7c** (the pattern is per-department **and** per-faculty reads, each cached; the direct connection has no consumer) · `specs/evaluation-results-attribution.md` (v1.4; §3.18–§3.20 rewritten; §4's S5.1 row) · `docs/evaluation-results-endpoint-handover.md` (a pointer that the aggregate is now deleted too) | **owner's gate pending** |

### After S4 — the direct connection is gone from the app

- The app has **no** path to Postgres directly: every figure comes from the app's own repositories over
  the REST API. `pg` and `DATABASE_URL=` **stay in the repo** — `scripts/apply-schema.mjs` needs both
  (D3b).
- `poolCategoryTotals`, `computeCategoryAveragesFromTotals` and `aggregatePooledAverages` stay in
  `lib/evaluation-utils.ts`: the report's department pooling uses the first two.

### Behaviour change in S3

The dean's faculty table now lists **every faculty homed in the department**, not only those with
responses in the period (the old table came from the aggregate's `facultyIds`). The card's headcount
already said 22 while the table listed 9; now the two agree.

## Decisions

### D1 — the read is per faculty, and it carries the pooling weights

The handover's worry is that "the report's **per-faculty** figures cannot be re-derived from the
per-department ones (the pooling weights are lost)". That is a property of *averages*, not of the
data. A read that returns, per rubric category, the **(sum, count)** instead of the mean can be
pooled exactly — `poolCategoryTotals` adds the pairs and `computeCategoryAveragesFromTotals` turns
them back into means (both already in `lib/evaluation-utils.ts`). One pass over a faculty's ratings
yields both grains: the faculty's own figures and the department's pool.

So the new read returns **both**: the faculty's derived figures *and* the per-category totals.

```
listFacultyFigures(facultyId, evaluationPeriodId)
  → the faculty's submitted + enabled evaluations in the period   (chunked at 100, paged at 1,000)
  → the assignments they point at                                 (chunked at 100)
  → the live-eval rule: the assignment's faculty must be the evaluatee
  → their ratings (37 per chunk → 999 rows → one page) and their comments (chunked at 100)
  → { totalRespondents, avgRating, remarks, catColumns, catTotals, highestRubrics, lowestRubrics, sentimentScore }
```

The rules are the app's own, unchanged from the aggregate's SQL and from `listDepartmentFigures`:
the period, `status = 'SUBMITTED'`, `isDisabled = false`, the live-eval rule, the teacher's home
department. **No display rule moves into the read** — the remark ladder, the columns and the
highest/lowest selection stay in `lib/evaluation-utils.ts`.

### D2 — the cache is per faculty, five minutes, same contract as the department one

`features/evaluation-results/figure-cache.ts` gains `getCachedFacultyFigures(facultyId,
evaluationPeriodId, force?)` next to `getCachedDepartmentFigures`: the same TTL, the same in-flight
dedupe, the same module-level (warm instance) home. Keyed `period:faculty`.

The **results list is untouched** — it keeps its per-department read and its per-department cache.
The same ratings are therefore read twice across the two surfaces (once by the list, once by the
report). That is the accepted cost of option A; unifying the two into one per-faculty cache is a
separate, larger change (it would move the list's "row fills as it lands" behaviour and the
export's `summary.csv`).

### D3 — the three dead functions are deleted

`getAdminEvalReportData` (:99), `getDeanDashboardData` (:402) and `getAdminDashboardData` (:417)
have **no caller**: the admin report page and the dean's dashboard block render hardcoded preview
data, with the live call commented out. They still read the aggregate, so they still 500 if called —
and they are what keeps `pg` and `DATABASE_URL` alive.

Deleting them also orphans: `buildDeptDashboard` (:339), `facultyGrainForDept` (:285),
`deptAveragesFrom` (:314), `deptExpectedCounts` (:328), `remarkOf` (:280), `liveDeptToReportRow`
(:76), `avg` (:70) and the service's own `CATEGORY_KEYS` (:44, exported at :263 with no importer).
They are also what keeps the app's last direct-connection importer alive — the repository's
`fetchDepartmentTotals` — which S4 removes.

**The types stay.** `DeanDashboardData`, `DeanDashboardKpis`, `AdminDashboardData` and `AdminDeptBar`
are the shape of the *preview* blocks the two pages still hold
(`app/dean/evaluations/reports/detail/page.tsx:37`, `app/admin/evaluations/reports/page.tsx:27`) —
deleting them breaks those pages' type-check. The two pages' stale commented-out live hooks go
with the functions.

### D3b — `pg` and `DATABASE_URL` stay in the repo (correction, 2026-10-21)

The first draft said S4 would drop `pg` from `package.json` and `DATABASE_URL=` from `.env`. The
import graph says otherwise: **`scripts/apply-schema.mjs` imports `pg` and reads
`process.env.DATABASE_URL`** — it is the owner's manual schema runner, and it is the *only*
remaining user of both.

So:
- `package.json`: drop **`@types/pg` only**. `pg` **stays** — the schema script needs it.
- `.env`: **`DATABASE_URL=` stays** (line 17) — the schema script needs it.
- The handover's and TODO's "DATABASE_URL leaves `.env` for good" is wrong: it leaves the **app**,
  not the repo. S5 corrects that line.

`lib/db/postgres.ts` itself is still deleted — the grep shows exactly one importer (the aggregates
module, which S4 deletes too) and its own test.

### D4 — the numbers move, in one known way
The raw-row path counts the `""` bucket (a rating whose rubric item no longer resolves) in the
average; the aggregate's SQL inner-joins `rubric_items` and dropped it. So a report figure can
differ from today's by that bucket — **and it now agrees with the results list**, which already
moved to the raw-row path (TODO item 6, `specs/evaluation-results-cache.md` §"The open decisions").
This is the accepted behaviour, not a regression.

Everything else is faithful: the aggregate's `respondent_count` (per assignment, pooled per
faculty) is the number of live evaluations; the live-eval rule, the period, `SUBMITTED` and
`isDisabled = false` are the same filters; the per-category pooling is the same weighted mean.

### D5 — how each `applies` invariant is preserved

- **API routes stay thin** — `app/api/` — **n/a**: no route changes. The report is a Server
  Component that calls the service directly, as it does today.
- **proxy.ts is the access-enforcement point** — `proxy.ts` — **n/a**: no route, page or role
  change; the two report pages keep their existing auth checks.
- **All Supabase access goes through repositories wired by DI** — `lib/repositories/factory.ts` —
  **applies**: the new read is a repository method behind `IEvaluationResultRepository`, and the
  report service stops touching `supabase` directly. `getFacultyEvalReportData` reads the user's
  name and department through `userRepository.listByIds` instead of a raw
  `supabase.from("users")` (:218-225) — the migration removes the violation, it does not add one.
- **Double-click prevention via SubmitButton** — `components/ui` — **n/a**: read-only surfaces.
- **Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT** — `lib/utils/roles.ts` —
  **n/a**: no role logic touched.

### D6 — layering order

Repository → the interface the DI factory implements (`lib/types/evaluation.ts`) → the pure
helpers (`lib/evaluation-utils.ts`) → the cache (`features/evaluation-results/figure-cache.ts`) →
the service (`features/evaluations/evaluation-report.service.ts`) → the two pages. Then the
cleanup, then the docs.

### D7 — gold paths read

`features/` (the results repository, the report service, the figure cache), `lib/evaluation-utils.ts`
(the pooling helpers), `lib/db/common.ts` (the ratings read), `lib/repositories/factory.ts` (the DI
wiring), `app/api/admin/evaluation-results/figures/route.ts` (the cache's only route consumer),
`app/dean/evaluations/reports/detail/page.tsx` and `app/faculty/evaluations/reports/page.tsx` (the
two live report surfaces).

### D8 — proof

`npm test` (the Tests line in `repository.md`). The repo's full gate, the owner's run:
`npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.

### D9 — out of scope

- The **results list's** per-department read and cache (unchanged by this migration).
- The **`isDisabled` gap** (TODO item 1) and the **membership gate** (item 2) — the decisions the
  drill-down still owes; this migration does not touch the drill-down.
- The **`""` bucket** (item 6) and the **aliases** (item 7) — the display rules stay where they
  are; the report inherits whatever the list already does.
- The **three reads still on a cap** (item 8) — a separate fix.
- The preview dashboards' **content** — they keep their hardcoded numbers; only their stale
  commented-out hooks go.
- `clearDepartmentFiguresCache` (`figure-cache.ts:66`) — it has **no caller** (the refresh button
  uses `refresh=1`). Flagged, not touched.

## Scan

```text
Path: the report pages → the report service → the aggregate → the direct connection
  app/dean/evaluations/reports/detail/page.tsx:29   getDeanEvalReportData(userId, periodId)
  app/faculty/evaluations/reports/page.tsx:13        getFacultyEvalReportData(userId)
    features/evaluations/evaluation-report.service.ts:103  listLiveFacultyResults(periodId)
    features/evaluations/evaluation-report.service.ts:138  listLiveDeptAverages(periodId)
    features/evaluations/evaluation-report.service.ts:170  listLiveDeptAverages(periodId)
    features/evaluations/evaluation-report.service.ts:174  listLiveFacultyResults(periodId)
    features/evaluations/evaluation-report.service.ts:215  listLiveFacultyResults(periodId)
    features/evaluations/evaluation-report.service.ts:287  listLiveFacultyResults(periodId)
    features/evaluations/evaluation-report.service.ts:344  listLiveDeptAverages(periodId)
    features/evaluations/evaluation-report.service.ts:422  listLiveDeptAverages(periodId)
      features/evaluation-results/evaluation-results.repository.ts:564  fetchDepartmentTotals(periodId)
      features/evaluation-results/evaluation-results.repository.ts:584  fetchDepartmentTotals(periodId)
        features/evaluation-results/evaluation-aggregates.ts:159  query(DEPARTMENT_TOTALS_SQL, [periodId])
          lib/db/postgres.ts:26   throw new Error("DATABASE_URL is required for the evaluation aggregates")
            → the page answers 500

Proof: npm test
  lib/__tests__/evaluation-aggregates.test.ts              11 cases — the SQL as text (goes with the module)
  lib/__tests__/evaluation-results-live-faculty.test.ts     4 cases — listLiveFacultyResults (goes with the method)
  lib/__tests__/evaluation-results-department-faculty.test.ts  3 cases (:147, :178, :198) — listLiveDeptAverages
  lib/__tests__/evaluation-report-dashboard.test.ts         11 cases — getDeanDashboardData + getAdminDashboardData
  the two live report functions have NO test today — the migration adds them
Command: npm test
Teach: the aggregate is a group-by that spans a to-many (ratings → items → categories), which
  PostgREST cannot express (AGENTS.md Lesson 7c) — so the app asked Postgres directly, and the
  direct connection is the only part of the stack that needs a dashboard credential. The replacement
  moves the group-by into Node: the rows cross the wire, but the cache keeps that affordable, and
  the *weights* (sum, count) let a department's figure be derived from its faculty's figures
  without walking the ratings twice.
Lens:
- API routes stay thin — n/a — no route changes; the report pages are Server Components that call
  the service directly, as they do today
- proxy.ts is the access-enforcement point — n/a — no route, page or role change
- All Supabase access goes through repositories wired by DI — applies + lib/repositories/factory.ts —
  the new read is a repository method; the service's one raw supabase.from("users") call (:218) goes
- Double-click prevention via SubmitButton — n/a — read-only surfaces
- Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT — n/a — no role logic touched
```

## Plan

Five slices. Each leaves the tree compiling and the suite green; the gate runs after every slice.

### S1 — the read

`lib/types/evaluation.ts`
- add `FacultyFigures` — the faculty's figures **and** the per-category totals:

  ```ts
  export interface FacultyFigures {
    facultyId: string
    totalRespondents: number
    avgRating: number | null
    remarks: string | null
    /** the eight columns, keyed by the column name */
    catColumns: Record<string, number | null>
    /** the weights: the raw category name -> its sum and its count */
    catTotals: Record<string, { sum: number; count: number }>
    highestRubrics: { key: string; label: string; score: number }[]
    lowestRubrics: { key: string; label: string; score: number }[]
    sentimentScore: number | null
  }
  ```
- add `listFacultyFigures(facultyId: string, evaluationPeriodId: string): Promise<FacultyFigures>`
  to `IEvaluationResultRepository`.

`features/evaluation-results/evaluation-results.repository.ts`
- implement `listFacultyFigures`: `listSubmittedEvaluatesForFaculty` (already there, :402) →
  `loadAssignmentRows` (:241) → the live-eval rule → `fetchRatingsWithCategories` +
  `listCommentScores` (:438) → the per-category (sum, count) alongside the averages →
  `computeGeneralRating` / `mapCategoryAveragesToColumns` / `findHighestLowestRubrics` / `getRemark`
  / `computeSentimentScore`.

`lib/__tests__/evaluation-results-faculty-figures.test.ts` — **new**: the period / `SUBMITTED` /
`isDisabled` filters, the live-eval rule, the per-category totals, and that the totals pool into
the department's figure (the weighting: one subject at 4.00 over one response and one at 3.00 over
three pool to 13/4 = 3.25, not 3.50).

### S2 — the cache

`features/evaluation-results/figure-cache.ts`
- add `getCachedFacultyFigures(facultyId, evaluationPeriodId, force?)` — the same TTL
  (`FIGURES_TTL_MS`), the same in-flight dedupe, keyed `period:faculty`.

`lib/__tests__/evaluation-results-faculty-figures.test.ts` (or a cache-focused file) — the cache
returns the same numbers twice and reads the database once; `force` reads again.

### S3 — the report service

`features/evaluations/evaluation-report.service.ts`
- `getFacultyEvalReportData` (:211) → one `getCachedFacultyFigures` call; the user comes from
  `userRepository.listByIds` (the raw `supabase.from("users")` at :218 goes); the department row
  keeps today's derivation (the faculty's own figures).
- `getDeanEvalReportData` (:160) → the dean's department → its homed faculty
  (`userRepository.listByRole("FACULTY")` + the home-department filter, the same rule
  `listDepartmentFigures` uses) → their cached figures in parallel → the faculty rows + the
  department row **pooled** from their totals (`poolCategoryTotals` → `computeCategoryAveragesFromTotals`
  → `aggregatePooledAverages`).
- **delete** `getAdminEvalReportData` (:99), `getDeanDashboardData` (:402), `getAdminDashboardData`
  (:417) and their orphans (`buildDeptDashboard`, `facultyGrainForDept`, `deptAveragesFrom`,
  `deptExpectedCounts`, `remarkOf`, `liveDeptToReportRow`, `avg`, the service's `CATEGORY_KEYS`).
  **Keep** the four dashboard *types* — the preview blocks use them.

`app/dean/evaluations/reports/detail/page.tsx` (:31-36) and `app/admin/evaluations/reports/page.tsx`
(:24-26) — drop the stale "LIVE-DATA (swap back)" comment blocks that point at the deleted functions.

`lib/__tests__/evaluation-report-service.test.ts` — **new**: the dean's report carries its
department's pooled row and one row per homed faculty (and a faculty homed elsewhere is not in it);
the faculty's report carries their own row.

### S4 — the direct connection dies

- delete `lib/db/postgres.ts`, `features/evaluation-results/evaluation-aggregates.ts`,
  `lib/__tests__/evaluation-aggregates.test.ts`
- delete `listLiveDeptAverages` (:563) and `listLiveFacultyResults` (:583) from the repository, their
  two interface lines (`lib/types/evaluation.ts:691-692`), and the now-unused `fetchDepartmentTotals`
  import
- delete `LiveDeptAverage` (:580) and `LiveFacultyResult` (:665) from `lib/types/evaluation.ts`
- delete `buildLiveDeptAveragesFromTotals` (:536) and `FacultyDeptTotals` (:523) from
  `lib/evaluation-utils.ts` — **keep** `computeCategoryAveragesFromTotals` (:94) and
  `poolCategoryTotals` (:107); the new pooling uses them
- delete `lib/__tests__/evaluation-results-live-faculty.test.ts` (4 cases) and the three
  `listLiveDeptAverages` cases from `lib/__tests__/evaluation-results-department-faculty.test.ts`
  (:147, :178, :198)
- delete `lib/__tests__/evaluation-report-dashboard.test.ts` (11 cases — the two deleted functions)
- `package.json`: drop `@types/pg`; **`pg` stays** — `scripts/apply-schema.mjs` imports it (D3b).
  `.env`: **`DATABASE_URL=` stays** — the same script reads it (D3b).

### S5 — the docs

- `specs/evaluation-results-cache.md` — the contract gains the per-faculty read and its cache; the
  "Still to do" section closes.
- `docs/evaluation-results-cache-handover.md` — status → 🟢 everywhere; §7 item 6 closed; §9's file
  table gains the new files and loses the dead ones.
- `TODO.md` — the "NEXT (do first)" item closes; the open item under it closes; the cleanup item's
  "still open" doc (`specs/evaluation-results-attribution.md` §3.18–§3.20) closes.
- `AGENTS.md` — **Lesson 7c**: the repo's pattern is now a per-faculty read (the report) *and* a
  per-department read (the list), each cached for five minutes; the direct connection is the option
  that needs dashboard access and is no longer used by any surface.
- `specs/evaluation-results-attribution.md` §3.18–§3.20 — the rows that still say the figures are
  "computed in Postgres over the direct connection" point at the raw-row path and the cache.

## Notes for the implementer

- The **first** dean's report render reads its department's ratings (≈ what the results list's
  per-department read costs) and then serves from the cache for five minutes. Neither report
  folder has a `loading.tsx`; adding one is optional and out of scope.
- The report's per-faculty reads run **in parallel** (one per faculty of the dean's department),
  each faculty's rating chunks in parallel — the same request count as one per-department read.
- The `""` bucket (D4) is the one known difference in the numbers. The report now agrees with the
  results list; it may differ from a pre-migration screenshot.
