---
skill: plan-fix
story: "The admin evaluation results list (app/admin/evaluations/results) calls GET /api/admin/evaluation-results?evaluationPeriodId=… and the request takes ~26 seconds of server time (measured from the browser HAR: 26,012 ms of 'wait', a 4.8 KB response). The page therefore sits on a skeleton for half a minute, and the user reports seeing incorrect or lagging figures before the correct ones land. Measured: 7,471 evaluations in the period x 27 rubric items = 201,717 rating rows are pulled into the app process to produce 11 rows of department aggregates, across ~263 round trips to Supabase."
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A"}
workflow: A
decision: "A — the app creates the Postgres function ITSELF, once, through the exec_sql it already has, and then calls it with supabase.rpc(). The GROUP BY lives in the function body, in this app, as a template literal. Nothing is created by hand in Supabase; the grouping runs in Postgres; the API the app uses is the one it already has. The TypeScript side keeps every display rule where it is, and the API payload and the page stay exactly as they are today."
status: done
pending: handoff
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration | Reuse the last calibration? | AAAAAA — reused from `20261021-0820-eval-ratings-row-cap.md` (passed in this session for this repo) |
| scan-options | Which fix shape? | **A — the group-by into Postgres**, with the target result shape posted by the user: `{ department, avgRating, ratingDescription, highestRubric{name,rating}, lowestRubric{name,rating}, sentiment, faculty }` + `departmentId` as the key |
| shaping-decision | Where does the shaping happen? | **A'** — the SQL returns the raw facts and TypeScript applies the existing helpers; the API payload and the page stay exactly as they are today. The user's question was "which is faster?" — **the same**: both are one round trip; the difference is ~110 rows and where three display rules live. The database holds no display rules |
| mechanism | How does the app reach Postgres? | **A** — the user's correction: *"it should use the postgres in this app… the solution should not leave this app, not on supabase but on this app, but i am against querying it, then grouping because it means we are still querying the same number then grouping on the app layer; instead use postgres here"* → then *"not really SQL direct but use what we have here, the POSTGRES API"* → **the app creates a Postgres function itself, once, through the `exec_sql` it already has, and calls it with `supabase.rpc()`** |
| plan-done | Is this plan done? | A (Done) — S1 the function + the bootstrap, S2 the repository, S3 the list route, S4 the other surfaces, S5 the docs, as written |
| who-implements | Who implements the slices? | B (Code it) — the agent writes each slice after "Apply this slice" |
| slice-1 | Apply S1 (the function + the bootstrap)? | A (Apply this slice) — applied: **new** `features/evaluation-results/evaluation-aggregates.ts` — the two function bodies as template literals (`evaluation_department_totals` → one row per assignment with the category totals as JSONB; `evaluation_department_sentiment` → one row per (department, teacher)), the self-creating bootstrap (`rpc` → PGRST202 → `exec_sql` → `pg_notify('pgrst','reload schema')` → retry), the typed row shapes, and the two exported fetchers. Nothing else touched — the repository, the routes and the page are untouched |
| slice-2 | Apply S2 (the repository reads the aggregate)? | A (Apply this slice) — applied: `lib/evaluation-utils.ts` gains `computeCategoryAveragesFromTotals`, `poolCategoryTotals`, `aggregatePooledAverages` and `buildLiveDeptAveragesFromTotals` (the raw-row `aggregatePooledResults` now delegates to the new one, so there is one chain); `evaluation-results.repository.ts` — `listLiveDeptAverages` and `listLiveFacultyResults` read the aggregate (the now-dead `loadRatingsByEval` and `groupEvalsByAssignment` are gone), and a new `listDepartmentSentiment`; `IEvaluationResultRepository` gains that method. The **six callers are unchanged**. Tests: the two repository suites now mock the aggregates module (the fixtures carry totals, the assertions are the same), and a new `evaluation-aggregates.test.ts` guards the rules that moved into SQL (the live-eval rule, the home-department attribution, the period/status/isDisabled filters, the category join) and the bootstrap (create → cache refresh → retry) |
| slice-3 | Apply S3 (the list routes)? | A (**Apply, and also the warnings read**) — applied: a third aggregate function `evaluation_attribution_warnings` returns the assignments with an evaluation in the period, with the teacher's home department and the assignment's semester, so `classifyWarningAssignments` (the existing rule helper) still does the classifying; `listAttributionWarnings` reads it instead of the period's 7,471 evaluations. Both list routes: the truncated comments read (`listSubmittedWithSentiment`) is replaced by `listDepartmentSentiment`, and the phases run in one `Promise.all`. **The payload and the page are unchanged.** The route tests now assert the route passes the repository's figures through; the pooling/scoping rules that moved are guarded in `evaluation-aggregates.test.ts` and `listDepartmentSentiment`'s own test |
| slice-4 | Apply S4 (the drill-down)? | **A (Apply), then REVERTED at the user's instruction** — the drill-down was **outside the reported scope** (the list page), and the user was right that it should not have been carried in without saying so. The four files went back to their pre-S4 state: `evaluation-results.service.ts` reads the evaluations, the ratings and the comments again; the aggregate function lost its per-assignment sentiment columns; `lib/evaluation-utils.ts` lost `PooledTotals`/`poolPooledTotals`; the service test has its original fixtures. **The list page's fix (S1-S3) is untouched** |
| slice-5 | Apply S5 (the docs)? | A (Apply this slice) — applied: `AGENTS.md` gains **Lesson 7c** (PostgREST can aggregate, but the group must be the top-level table's; a group spanning a to-many needs a view or a function; the feature is off by default; the repo's pattern — the function lives in the app and creates itself through `exec_sql`) and Lesson 7b gains the corollary that a paging fix multiplies the requests (measure the rows, not the requests); `specs/evaluation-results-attribution.md` gains contract **§3.19** (the scope rules live in the aggregate, the display rules in TypeScript) and change row **S5.2**; `TODO.md`'s gaps section gains the 2026-10-21 note, the drill-down's own item, and the cleanup item for the three methods with no app caller |
| plan-done | Is this plan done? | A (Done) — S1-S3 + S5 as written; S4 was applied and then reverted at the user's instruction (the drill-down was outside the reported scope) |
| handover | A handover file? | A — `docs/evaluation-results-endpoint-handover.md` (new): the measurement, the endorsed approach, what was applied, the two behaviour changes, the four relevant sessions, how to prove it, and **what is still outstanding** — `DATABASE_URL` is not set and `npm install` has not run, so the endpoint still answers 500, and the suite was still red at the last run (5 failures + 1 lint warning, both since fixed and not re-run). `TODO.md` gains the item that points at it |

## Pending

- none — the run is closed. The owner's verification is in the run file below.

**S1 + S2 + S3 + S5 applied** (S4 applied then reverted) —
`features/evaluation-results/evaluation-aggregates.ts` (new),
`features/evaluation-results/evaluation-results.repository.ts`, `lib/evaluation-utils.ts`,
`lib/types/evaluation.ts`, `app/api/admin/evaluation-results/route.ts`,
`app/api/dean/evaluation-results/route.ts`, `AGENTS.md`,
`specs/evaluation-results-attribution.md`, `TODO.md`, and four test files (one new).

> ⭐ **The list endpoint's reads are now:** the three aggregate functions (3 calls, ~300 rows), the
> headcount (1 read, ~150 rows), the department names (1 read, ~11 rows) and the period's semester
> (1 read). **~263 reads / ~220,000 rows → ~7 reads / ~500 rows.**

> ⭐ **The drill-down is unchanged** — it still reads the department's evaluations, ratings and
> comments (~30-60 reads, 2-4s). That is the same defect, on a page outside this story's scope. ⭐
> It is **TODO item 3's** remaining half and a story of its own.

> ⭐ **The rules that moved into SQL lose their behavioural tests** — the live-eval rule (an
> evaluation whose assignment no longer belongs to its evaluatee) and the home-department
> attribution are now predicates in the function body, and vitest cannot execute SQL. The new
> `evaluation-aggregates.test.ts` **guards the function bodies as text** instead, so the rules stay
> pinned in the automated suite — in the only place they now live. It is a weaker guard than a
> behavioural test, and it is said so rather than passed over.

> ⭐ **Two repository methods now have no app caller** — `listSubmittedWithSentiment` (the one with
> the truncated evaluations read) and `listSubmittedEvaluateeIds` — plus `buildLiveDeptAverages` in
> `lib/evaluation-utils.ts` (the raw-row pooling helper the totals path replaced). Cleanup
> candidates, like `listDepartmentAssignments` in the TODO's existing cleanup list.

The proof command is `npm test` (`repository.md` → Tests); per AGENTS.md **H1** the agent does not
run it — the owner's run:

```powershell
npm test
npm run lint
npm run build
```

## Decisions

### Story (tracker is `user text only`)

The admin results list is unusable because its endpoint takes **26 seconds**. The page shows a
skeleton for that whole time, and the user reports seeing incorrect/lagging figures before the
correct ones land. The endpoint is the thing to fix; the page's honesty while it waits is
secondary.

### The measurement (from `~/Downloads/localhost.har`)

| | |
|---|---|
| `GET /api/admin/evaluation-results?evaluationPeriodId=…` | **26,012 ms**, of which `wait` = 26,010 ms, `send` 0.1 ms, `receive` 0.5 ms — **the server**, not the network |
| response body | 4,779 bytes, 11 department rows |
| the period | 7,471 submitted evaluations (the sum of `totalRespondents` across the 11 rows) |
| implied rating rows | 7,471 × 27 rubric items = **201,717** |
| the other requests | 2,156 ms (`/admin/evaluations/periods`, the RSC prefetch), 1,087 ms (`/api/evaluation-periods`), 924 ms (`/api/rubric-groups`), 364 ms (`/api/semesters`) — the endpoint is 10× the next slowest thing on the page |

**The output is 11 rows. The input is 201,717 rows.** That ratio is the whole problem.

### Why the row cap made this worse (and it was already bad)

The 2026-10-21 row-cap fix (`20261021-0820-eval-ratings-row-cap.md`) made this endpoint
**slower on purpose**: `fetchRatingsWithCategories` now pages, so a 100-evaluation chunk (2,700
rating rows) costs **3 requests** instead of 1, and `listSubmittedEvaluates` costs 8 requests
instead of 1. Before it was fast-and-wrong (truncated at 1,000 rows per chunk); now it is
right-and-slow. The fix is not to un-page — it is to stop shipping the rows.

### The request census for one page load

| Step | Reads | Rows |
|---|---|---|
| `listSubmittedWithSentiment` — the evaluations read (**unpaged → truncated at 1,000**) | 1 | ≤1,000 |
| `listSubmittedWithSentiment` — the comments read (chunked at 100) | ≤10 | ~1,000 |
| `listLiveDeptAverages` → `listSubmittedEvaluates` (paged) | 8 | 7,471 |
| `listLiveDeptAverages` → `loadAssignmentRows` (chunked at 100) | ~3 | ~250 |
| `listLiveDeptAverages` → `loadUserDepartments` + `loadSectionMaps` | ~4 | ~180 |
| **`listLiveDeptAverages` → `fetchRatingsWithCategories`** | **225** (75 chunks × 3 pages) | **201,717** |
| `listLiveDeptAverages` → `rubric_items` + `rubric_categories` | 2 | 35 |
| `listAttributionWarnings` → `listSubmittedEvaluates` **again, the same data** | 8 | 7,471 |
| `getFacultyCountsByDepartment` | 1 | ~150 |
| `departmentRepository.listAll()` | 1 | ~11 |
| **Total** | **~263** | **~220,000** |

And the route awaits its three heavy phases **sequentially** (`route.ts:20`, `:23`, `:29`).

### The lever

`computeCategoryAverages` (`lib/evaluation-utils.ts:65-77`) is a **group-by** — average the
ratings per rubric category. It runs in Node, so the app must download every rating row to do it.
**PostgREST cannot group.** The only way to stop shipping the rows is to move the group-by into
Postgres: `SUM(rating)` and `COUNT(*)` per (assignment, category) is 8 rows per assignment instead
of 27 rows per evaluation — **~2,000 rows in one request** instead of 201,717 in 225.

The arithmetic survives the move exactly: a category mean over raw rows and a category mean over
sums/counts are the same number, and the department's pooled figure is the same weighted mean
either way (`Σsum / Σcount`). `computeSentimentScore` (`lib/evaluation-utils.ts:119-123`) is a
plain mean, so it survives the same move.

### What a DB-side group-by does to the `""` bucket (a behaviour change to decide)

`lib/db/common.ts:99-110` maps a rating whose `itemId` cannot be resolved to the category name
`""`. That bucket **counts toward Avg. Rating** today (it is in `catAverages`, and
`computeGeneralRating` averages every name present) but can never be named as a Highest/Lowest
Rubric. An inner join in SQL **drops** those rows instead — so an RPC **changes the Avg. Rating
slightly** (it removes an unnamed bucket). That is TODO item 4, option (a), arriving for free.

### Invariants — how each `applies` one is preserved

- *API routes stay thin* — app/api/ — **applies**: the route keeps parsing, delegating and
  returning JSON. The aggregation moves **down** into the repository and the database, never into
  route logic. The payload shape is frozen.
- *proxy.ts is the access-enforcement point* — proxy.ts — **n/a**: no route, page or role change.
- *All Supabase access goes through repositories wired by DI* — lib/repositories/factory.ts —
  **applies**: the RPC is invoked from a repository method (`supabase.rpc(...)`), the same DI
  path the rest of the data layer uses. No direct `supabase` in app code.
- *Double-click prevention via SubmitButton* — components/ui — **n/a**: read-only surfaces.
- *Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT* — lib/utils/roles.ts —
  **n/a**: no role logic is touched.

### Layering order

Route Handler → Controller → Service → Repository → Supabase. The work is at the **Repository**
layer and the **database beneath it**. The route changes only in *how it sequences* the calls
(one shared read, `Promise.all`); the service and page shapes are frozen.

### Gold paths to read before each slice

`app/api/`, `features/`, `proxy.ts`, `lib/auth.ts`, `lib/repositories/factory.ts` — and for the
data shapes: `features/evaluation-results/evaluation-results.repository.ts` (`loadPeriodAssignments`,
`loadRatingsByEval`, `listLiveDeptAverages`), `lib/evaluation-utils.ts` (`buildLiveDeptAverages`,
`computeCategoryAverages`, `computeGeneralRating`), `lib/db/common.ts` (`fetchRatingsWithCategories`).

### Proof

`npm test` (`repository.md` → Tests). The suites that matter:
`lib/__tests__/admin-evaluation-results-route.test.ts`,
`lib/__tests__/evaluation-results-department-faculty.test.ts`,
`lib/__tests__/evaluation-results-live-faculty.test.ts`,
`lib/__tests__/evaluation-results-aggregation.test.ts`,
`lib/__tests__/evaluation-utils.test.ts`,
`lib/__tests__/db-common-ratings-paging.test.ts`.

Plus, on real data: the HAR measurement repeated — the same request, timed. The owner runs it
(AGENTS.md **H1** — the agent does not run npm/build/test and does not touch the database).

## Scan

```text
Path:
  app/admin/evaluations/results/page.tsx:54      useApiGet(`/api/admin/evaluation-results?evaluationPeriodId=…`)
    → app/api/admin/evaluation-results/route.ts:20   listSubmittedWithSentiment(period)     ← sequential
        → features/evaluations/evaluations.repository.ts:423-431  the evaluations read
          (UNPAGED → silently truncated at 1,000 → the SENTIMENT is computed over 1,000 of 7,471)
        → :434-441  the comments read, chunked at 100            (≤10 reads)
    → app/api/admin/evaluation-results/route.ts:23   listLiveDeptAverages(period)           ← sequential
        → features/evaluation-results/evaluation-results.repository.ts:296
            → :264  loadPeriodAssignments
                → :128  listSubmittedEvaluates(period)            (8 paged reads, 7,471 rows)   ← read #1
                → :248  loadAssignmentRows(fsIds)                 (~3 reads)
                → :249  buildSubjectContext → loadUserDepartments + loadSectionMaps  (~4 reads)
            → :298  loadRatingsByEval(7,471 ids)
                → lib/db/common.ts:69  fetchRatingsWithCategories
                  (75 chunks of 100 evaluations × 27 items = 2,700 rows each → 3 pages each
                   → 225 reads, 201,717 rows)                                            ← THE WHALE
                → lib/evaluation-utils.ts:65  computeCategoryAverages  ← the group-by, in Node
    → app/api/admin/evaluation-results/route.ts:29   Promise.all([listAttributionWarnings, getFacultyCountsByDepartment])
        → evaluation-results.repository.ts:482  listSubmittedEvaluates(period)  (8 reads, 7,471 rows) ← read #2, the same data
    → app/api/admin/evaluation-results/route.ts:35   departmentRepository.listAll()  (1 read)
```

**Proof** — `lib/__tests__/admin-evaluation-results-route.test.ts` (11 tests, the route's payload
and its live-vs-cache rule), `lib/__tests__/evaluation-results-department-faculty.test.ts` (15,
the department aggregates), `lib/__tests__/evaluation-results-live-faculty.test.ts` (5),
`lib/__tests__/evaluation-results-aggregation.test.ts` (25, the pooling arithmetic).
**Command** — `npm test`.

**Teach** — *why* a page that renders 11 rows needs 201,717:
- The page wants, per department, an **average rating per rubric category** and the max/min of
  those averages. That is a group-by over `evaluation_ratings` (201,717 rows) joined to
  `rubric_items` and `rubric_categories`.
- **PostgREST has no GROUP BY.** It is a REST layer over tables, so a "grouped" read has to be
  expressed as a Postgres **view** (still one row per rating — no saving) or a **function**
  (a real aggregate — the saving). That is why the group-by lives in Node today, and why the
  only two exits are an RPC or a precomputed table.
- The 2026-10-21 paging fix made the read **complete**, and completeness costs round trips: 75
  chunks that each held 2,700 rows now cost 3 requests each instead of 1. The row count is the
  bill either way — paging only changed how many requests carried it.
- **The corollary to Lesson 7b:** a paging fix **multiplies** the request count by
  `rows ÷ page size`. Measure the **rows**, not the requests: 201,717 rows is the defect, and
  225 requests is just how they are currently being carried.

**Lens**
- API routes stay thin — app/api/ — **applies**: the route keeps parsing, delegating and
  returning JSON; the aggregation moves down into the repository and the database. The payload
  shape is frozen.
- proxy.ts is the access-enforcement point — proxy.ts — **n/a**: no route, page or role change.
- All Supabase access goes through repositories wired by DI — lib/repositories/factory.ts —
  **applies**: the RPC is called from a repository method via `supabase.rpc(...)`; no direct
  `supabase` reaches app code.
- Double-click prevention via SubmitButton — components/ui — **n/a**: read-only.
- Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT — lib/utils/roles.ts — **n/a**:
  no role logic is touched.

## Plan

### S1 — The aggregate function + the app's self-creating bootstrap

`features/evaluation-results/evaluation-aggregates.ts` (new): the SQL as **exported template
literals** — the function body lives in this app, greppable and reviewable, next to the code that
shapes its output.

**Two functions, because the grains differ:**

```sql
-- one row per assignment, with the category totals as a JSONB object
create or replace function evaluation_department_totals(p_period_id text)
returns table (
  department_id     uuid,
  faculty_subject_id text,
  faculty_id        text,
  respondent_count  bigint,
  category_totals   jsonb          -- { "<raw category name>": { "sum": 12.5, "count": 4 } }
)
language sql stable as $$
  with scoped as (
    select e.id,
           e."facultySubjectId" as fs_id,
           fs.faculty_id,
           u."departmentId"    as department_id
    from evaluations e
    join faculty_subjects fs on fs.id = e."facultySubjectId"
    join users u            on u.id  = fs.faculty_id
    where e.evaluation_period_id = p_period_id
      and e.status = 'SUBMITTED'
      and e."isDisabled" = false
      and e."facultySubjectId" is not null
      and fs.faculty_id = e."evaluateeId"     -- the live-eval rule
  )
  select s.department_id, s.fs_id, s.faculty_id,
         count(*)::bigint as respondent_count,
         coalesce(jsonb_object_agg(t.category_name,
           jsonb_build_object('sum', t.rating_sum, 'count', t.rating_count)), '{}'::jsonb) as category_totals
  from scoped s
  left join (
    select sc.fs_id, rc.name as category_name,
           sum(r.rating)::double precision as rating_sum,
           count(*)::bigint as rating_count
    from scoped sc
    join evaluation_ratings r  on r."evaluationId" = sc.id
    join rubric_items ri       on ri.id = r."itemId"
    join rubric_categories rc  on rc.id = ri."categoryId"
    group by 1, 2
  ) t on t.fs_id = s.fs_id
  group by 1, 2, 3;
$$;

-- one row per (department, teacher): the comment sentiment totals
create or replace function evaluation_department_sentiment(p_period_id text)
returns table (
  department_id   uuid,
  faculty_id      text,
  sentiment_sum   double precision,
  sentiment_count bigint
)
language sql stable as $$ … $$;
```

**The rules the function carries — and only these:**
- the period, `status = 'SUBMITTED'`, `isDisabled = false`, a non-null `facultySubjectId`;
- the **live-eval** rule: the evaluation's `evaluateeId` equals the assignment's `faculty_id`
  (`evaluation-results.repository.ts:259-261`);
- the department = the **teacher's home** (`users."departmentId"` — `resolveSubjectDepartment`);
- the group-by is the **raw** category name — the app maps the names to its columns.

**No display rule in the function.** No label, no remark ladder, no max/min, no tie-break.

**The bootstrap (the "the app creates it itself" part)** — in the same module:

1. `supabase.rpc("evaluation_department_totals", { p_period_id })`;
2. if it fails with **PGRST202** (function not found), create both functions through the
   **`exec_sql` the app already has** (`features/admin-data/reset-db.service.ts:69` proves the
   service role can run DDL through it — the reset feature creates the whole schema that way), then
   `NOTIFY pgrst, 'reload schema'`, then **retry** (the reload is asynchronous, so the retry waits a
   beat);
3. ⭐ **once ever** — after the first creation the function exists, so the DDL never runs again.
   A fresh database heals itself on first use.

### S2 — The repository reads the aggregate

`features/evaluation-results/evaluation-results.repository.ts`:
- a method that calls the two functions **in parallel** and returns the per-department facts;
- `listLiveDeptAverages` and `listLiveFacultyResults` pool the (sum, count) pairs with the
  **existing, untouched** helpers — `CATEGORY_NAMES`, `computeGeneralRating`,
  `mapCategoryAveragesToColumns`, `findHighestLowestRubrics`, `getRemark`, `CATEGORY_LABELS`. A
  category mean over (sum, count) is the same number as the mean over the raw rows, and the pooled
  department figure is the same weighted mean either way.

**The six callers change not at all**: the admin list, the dean list, both exports, and the report
service (`features/evaluations/evaluation-report.service.ts`, 8 call sites).

**Test harness:** the repository suites mock `@/lib/db`, so their fake client gains
`rpc: vi.fn()`; the route suite mocks the repository and is unaffected.

### S3 — The list route (the admin one and the dean twin)

The heavy reads leave the Supabase client; the **payload and the page are unchanged** (A'). The
route's three phases become one `Promise.all`.

**Net for the measured request: ~263 reads / ~220,000 rows → 2 reads / ~250 rows.**

### S4 — The drill-down, the exports, the report service

`app/admin/evaluations/results/[departmentId]/` reads the department's ratings the same way
(~30-60 reads) — the same function serves it at the **assignment** grain. The **export** routes and
the **report service** read `listLiveDeptAverages` and are fixed with them. The **group-detail**
page (one subject) still reads its own ratings — a few dozen rows, no change needed.

### S5 — The docs

- `AGENTS.md` **Lesson 7b** gains the corollary this story taught:
  > A paging fix **multiplies** the request count by `rows ÷ page size`. Measure the **rows**, not
  > the requests: 201,717 rows was the defect, and 225 requests was just how they were being
  > carried. The cure is to move the group-by into Postgres, not to page harder.
- and a new lesson: **PostgREST can aggregate** (`?select=amount.sum(),order_date` groups in the
  database) — but the group can only be the **top-level table's** columns, so a group that spans a
  to-many needs a view or a function; and aggregates are **off by default** on Supabase
  (`db_aggregates_enabled`).
- `specs/evaluation-results-attribution.md` gains the contract: *a result figure is computed over
  the complete rating set of its evaluation set — by a database-side aggregate, not by shipping the
  rows.*
- `TODO.md` — this story closes **item 3** (the remaining capped reads) for the results path and
  settles the rating side of **items 4 and 5**.

### Verification *(the owner's run — AGENTS.md H1; the agent does not run npm/build/test and does
not touch the database)*

```powershell
npm test
npm run lint
npm run build
```

then: open `/admin/evaluations/results`, capture the request to `/api/admin/evaluation-results` in
the Network tab and read its time. **Before: 26,012 ms. After: two calls to Postgres.** (The very
first call after the deploy also creates the function — expect that one to be a second slower.)

then the visual check: the department table shows the **same numbers** as before
(`docs/evaluation-surfaces-verification.md` §4) and the faculty page for one subject still agrees
with the admin drill-down (check 4.8).

### The behaviour changes this brings (flagged, not silent)

1. **The `""` bucket leaves Avg. Rating.** A rating whose `itemId` no longer resolves is counted in
   the average today (as an unnamed category) and can never be named as a Highest/Lowest Rubric.
   The function's join **drops** it. That is TODO item 4, option (a) — the average becomes the
   average over the eight real criteria, and every surface moves together.
2. **The sentiment number changes.** `listSubmittedWithSentiment`'s evaluations read is **unpaged**
   (`evaluations.repository.ts:423-431`) → truncated at 1,000 → today's sentiment is the mean over
   ≤1,000 of 7,471 evaluations. The function fixes that, so the column's number moves.
3. **The aliased categories get a deterministic order** — same rule (`CATEGORY_NAMES`, last-wins),
   but "last" becomes the function's `ORDER BY` rather than the rating rows' order.

### Risks

- **The app runs DDL once, in the database** — `CREATE OR REPLACE FUNCTION` + a schema-cache
  reload, through the `exec_sql` the reset feature already uses. Idempotent, self-healing, and it
  never runs again once the function exists. ⭐ The alternative (a hand-pasted function in the
  Supabase editor) is what the user asked to avoid.
- **The schema reload is asynchronous** → the first call after a fresh deploy retries once it
  completes. A short backoff, once.
- **The function is a database object** — the app owns it, so a schema reset (the admin
  "Reset Database" button) drops it; the next call recreates it ✓.

### Out of scope (noted, not planned)

- The **membership gate** and the **`isDisabled`** inconsistency (TODO items 2 and 1).
- The `""` fallback and the aliases as *standalone* stories (TODO items 4 and 5) — the aggregate
  settles their rating side as a side effect.
- Any change to the **payload shape** or the **page** — A' keeps both exactly as they are.
- `getStudentBreakdownsForFaculties`'s unchunked comments read (a student-breakdown surface, a
  different cap).
- Enabling PostgREST's `db_aggregates_enabled` — the function makes it unnecessary.
- Moving the **other** small reads off the Supabase client — they are cheap and the HTTP client is
  the right tool for them.
