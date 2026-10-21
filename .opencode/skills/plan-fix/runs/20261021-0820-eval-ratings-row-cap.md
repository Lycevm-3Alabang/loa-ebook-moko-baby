---
skill: plan-fix
story: "Admin department results (app/admin/evaluations/results/[departmentId]) shows an inaccurate Avg. Rating, Highest Rubric and Lowest Rubric. The correct value should be derived the way app/faculty/evaluations/results/[facultySubjectId] derives it. Scope agreed with the user: fix the shared ratings read (the PostgREST 1000-row cap truncation). The evaluations fan-out is the same cap on the row set above it and is raised as a second slice for the user to accept or decline."
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A"}
workflow: A
decision: "S1 + S2 approved: page the shared ratings read (lib/db/common.ts) and the two evaluations fan-outs that feed the admin results surfaces (evaluations.repository.ts:505, evaluation-results.repository.ts:123). S3 the tests, S4 the docs, S5 the owner's verification. The admin membership gate, isDisabled and the remaining capped reads stay out of scope."
status: done
pending:
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-reuse | `Use the last calibration (AAAAAA)?` | A (use it) |
| scope | How should the fix be scoped? | "Shared ratings paging only (Recommended)" — then plan-fix was chosen over direct implementation |
| scan-options | Which slice set? | A (S1 + S2) — page the shared ratings read **and** the two evaluations fan-outs, because S1 alone leaves the admin page averaging a subset whenever a department exceeds 1,000 submitted evaluations in a period |
| approve | Approve this design? | A (Approve S1 + S2) |
| plan-done | Is this plan done? | A (Done) — S1 the ratings read, S2 the evaluations reads, S3 the tests, S4 the docs, S5 the owner's verification, as written |
| handoff | Run implement-fix with it? | A (Yes) — implement-fix on this same file, starting at S1 |
| who-implements | Who implements the slices? | B (Code it) — the agent writes each slice after "Apply this slice" |
| slice-1 | Apply S1 (page the ratings read)? | A (Apply this slice) — applied: `lib/db/common.ts` gains `RATINGS_PAGE_SIZE = 1000` and a `fetchRatingsForChunk` page loop (`.order("evaluationId").order("itemId")` + `.range(offset, offset+999)`), called once per 100-id chunk; the unbounded read and the `ratingResults` error loop are gone. The item/category lookups, the `""` fallback and the mapping are unchanged |
| slice-2 | Apply S2 (page the evaluations reads)? | A (Apply this slice) — applied: `features/evaluations/evaluations.repository.ts` gains `PAGE_SIZE = 1000` and `listSubmittedByPeriodAndEvaluatees` now pages each faculty-id chunk (`.order("id")` + `.range()`); `features/evaluation-results/evaluation-results.repository.ts` gains `PAGE_SIZE = 1000` and `listSubmittedEvaluates` now pages the period's submitted evaluations the same way. **The suite is red until S3** — `evaluations-repository-chunking.test.ts`'s `makeChain` mock has no `.order()`/`.range()` |
| slice-3 | Apply S3 (the tests)? | A (Apply this slice) — applied: `evaluations-repository-chunking.test.ts` grows `Captured` with `ranges`, `makeChain` with `.order()`/`.range()`, a new `makePagedChain`, and a `listSubmittedByPeriodAndEvaluatees — PostgREST row cap` block (4 cases); NEW `lib/__tests__/db-common-ratings-paging.test.ts` with 7 cases (full page → another page, pages merge in order, short page stops, a page error throws, an empty id list makes no query, the order pair is `(evaluationId, itemId)`, the ids are still chunked for the URL budget) |
| slice-4 | Apply S4 (the docs)? | A (Apply this slice) — applied: `AGENTS.md` gains **Lesson 7b** (the row cap: the symptom, the 200-with-no-error mechanism, paging with a total order, the chunk-vs-page corollary, the 27-row multiplier, the five places the repo pages, and "a truncated read is a wrong figure, not a missing one"); `specs/evaluation-results-attribution.md` gains contract **§3.18** and change row **S5.1** (and the header moves to v1.3); `docs/evaluation-surfaces-verification.md` gains check **4.8** |
| slice-5 | Apply S5 (the owner's verification)? | A (Mark the run done) — the code slices are applied; the verification (`npm test` / `lint` / `build`, the `curl.exe` diagnostic, the visual check 4.8) is the owner's run per AGENTS.md H1. **Status: done.** |

## Pending

- none — the run is closed. The owner's verification is in the run file below.

**S1 + S2 + S3 + S4 applied** — `lib/db/common.ts`,
`features/evaluations/evaluations.repository.ts`,
`features/evaluation-results/evaluation-results.repository.ts`,
`lib/__tests__/db-common-ratings-paging.test.ts` (new),
`lib/__tests__/evaluations-repository-chunking.test.ts`, `AGENTS.md`,
`specs/evaluation-results-attribution.md`, `docs/evaluation-surfaces-verification.md`.

**Status: done.** The proof command is `npm test` (`repository.md` → Tests); per AGENTS.md **H1**
the agent does not run it — the owner's run:

```powershell
npm test
npm run lint
npm run build
```

**The diagnostic** (how big the cap was on the live data):

```powershell
$env:SUPABASE_URL = "<your url>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<your service key>"
$period = "<evaluationPeriodId>"

# The period's submitted evaluations — the fan-out's 1,000-row cap
curl.exe -s -I "$env:SUPABASE_URL/rest/v1/evaluations?select=id&evaluation_period_id=$period&status=eq.SUBMITTED" -H "apikey: $env:SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $env:SUPABASE_SERVICE_ROLE_KEY" -H "Prefer: count=exact"
# Content-Range: 0-999/2450  ->  2,450 evaluations exist; before the fix only 1,000 ever reached the app

# The multiplier on the ratings read: rubric items per evaluation
(Invoke-RestMethod -Uri "$env:SUPABASE_URL/rest/v1/rubric_items?select=id" -Headers @{ apikey = $env:SUPABASE_SERVICE_ROLE_KEY; Authorization = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY" }).Count
# 27  ->  100 evaluations = 2,700 rating rows vs the 1,000-row cap
```

**The visual check** — verification doc check **4.8**: the admin department results page and the
faculty's own page for the **same** subject must now show the same Avg Rating and the same
Highest / Lowest Rubric labels.

**Residual differences are not this bug.** The admin drill-down's membership gate (the
semester-scoped roster + the teacher's home department) and the `isDisabled` filter are still not
aligned with the faculty page — out of scope, a separate story.

## Decisions

### Story (tracker is `user text only`)

The admin department results page (`app/admin/evaluations/results/[departmentId]`) renders an
inaccurate **Avg. Rating**, **Highest Rubric** and **Lowest Rubric**. The reference is the faculty's
own per-faculty-subject results page (`app/faculty/evaluations/results/[facultySubjectId]`).

### What the scan established (the whole story in three facts)

1. **The math is identical on both pages.** Admin:
   `features/evaluation-results/evaluation-results.service.ts:176-183`. Faculty:
   `app/api/faculty/evaluation-results/subjects/[facultySubjectId]/route.ts:79-83`. Both run
   `computeCategoryAverages → computeGeneralRating → mapCategoryAveragesToColumns →
   findHighestLowestRubrics` (`lib/evaluation-utils.ts:65-117`). There is no weighted/unweighted
   difference, no rounding difference, no self-evaluation-filter difference, no `weight`-column
   difference. **The divergence is the input row set, not the formula.**

2. **PostgREST's 1000-row cap (`db-max-rows`) truncates the reads silently — HTTP 200, no error.**
   `lib/db/common.ts:78-89` chunks evaluation ids at 100 (a **URL**-budget fix) but never pages.
   One chunk of 100 evaluations really holds 100 × 27 = **2,700** rating rows (27 rubric items,
   `supabase-schema.sql:1619-1662`), and PostgREST returns only the first **1,000**. ≈63% of the
   ratings vanish per chunk, and which ones survive is arbitrary (no `ORDER BY`).
   The same hole sits one level up: `features/evaluations/evaluations.repository.ts:505-523` chunks
   by **faculty id** (100 per query), so each query returns *every* evaluation of up to 100 faculty
   for the period — unbounded, then capped at 1,000 rows per query.

3. **The faculty page escapes the *evaluations* cap but not the *ratings* cap.**
   `listSubmittedByPeriodAndEvaluateeAndFS` (`evaluations.repository.ts:524-535`) reads one
   evaluatee + one facultySubject → tens of rows, never capped. But its ratings read still crosses
   1,000 rows once that subject has more than ~37 respondents (1,000 ÷ 27). So the faculty page is
   the *reference* for the evaluation set and the *victim* of the ratings cap.

### Scope (the user's call: "Shared ratings paging only")

**S1 — page the ratings read**, in the shared helper `lib/db/common.ts`. This is the only change
that reaches **all eight** result surfaces, because every one of them reads through
`fetchRatingsWithCategories`:

| Caller | Surface |
|--------|---------|
| `evaluation-results.service.ts:150` | admin + dean department drill-down |
| `evaluation-results.repository.ts:271` (`loadRatingsByEval`) | the drill-down's per-group / per-faculty readers |
| `evaluation-results.repository.ts:629` | the admin results **list** page (`listLiveDeptAverages`) |
| `evaluations.repository.ts:610` (`listRatingsByEvaluationIds`) | faculty list + faculty detail, admin/dean group + faculty detail (8 route handlers) |

**S2 — page the evaluations reads** (`features/evaluations/evaluations.repository.ts:505` for the
department drill-down, `features/evaluation-results/evaluation-results.repository.ts:~612` for the
results list). Raised separately because the user scoped S1 only, and because S2 is what makes the
admin page *agree* with the faculty page.

> **Why S2 cannot be waved away (the concern the user must weigh):** S1 makes every *surviving*
> evaluation's ratings complete. It does **not** bring back the evaluations that the fan-out's own
> 1,000-row cap dropped. If the department has more than 1,000 submitted evaluations in the period,
> the admin page still averages a subset of them — and the faculty page, which reads one
> facultySubject at a time and is therefore uncapped, still sees all of that subject's responses.
> The two pages then still disagree on that subject's Avg Rating / Highest / Lowest, and a subject
> whose responses all fell outside the surviving 1,000 still prints "—".
> S1 alone is sufficient **only** when the department's period has ≤ 1,000 submitted evaluations.

### Slice order (layering: Route Handler → Controller → Service → Repository → Supabase)

Both slices are **Repository**-layer. S1 is `lib/db/common.ts` (the shared query helper, one level
below the repositories). S2 is `features/evaluations/evaluations.repository.ts` +
`features/evaluation-results/evaluation-results.repository.ts`. No route, service, page or component
changes: the payload shapes stay frozen, so nothing in `app/` or `features/*/components/` moves.

### Invariants — how each `applies` one is preserved

- *API routes stay thin* — app/api/ — **applies**: the change is entirely in the query layer; the
  eight route handlers keep parsing, delegating and returning JSON, with **no** change to their
  payload shapes.
- *proxy.ts is the access-enforcement point* — proxy.ts — **n/a**: no route, page or role change.
- *All Supabase access goes through repositories wired by DI* — lib/repositories/factory.ts —
  **applies**: `lib/db/common.ts` already receives the Supabase client as a parameter and is only
  reached from repository code; the paging stays there. **No direct `supabase` is added anywhere.**
- *Double-click prevention via SubmitButton* — components/ui — **n/a**: read-only surfaces.
- *Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT* — lib/utils/roles.ts —
  **n/a**: no role logic is touched.

### Gold paths to read before each slice

`app/api/`, `features/`, `proxy.ts`, `lib/auth.ts`, `lib/repositories/factory.ts` — and, for the
paging pattern itself, the repo's own precedents:
- `features/evaluations/evaluations.repository.ts:574-607` (`countSubmittedByFacultySubjectIdsPaged`
  — chunked `.in()` + `.range()` pages, the closest existing model),
- `features/admin-data/student-enrollment.repository.ts:218-245`
  (`countByFacultySubjectIdsPaged` — the same shape),
- `features/users/users.repository.ts:218-238` (`listAll` — `.range()` paging).

### Proof

`npm test` (`repository.md` → Tests). The suites that matter:
- `lib/__tests__/evaluations-repository-chunking.test.ts` — the existing chunking contract for the
  repository S2 touches (its `makeChain` mock has no `.order()`/`.range()`, so **the mock must grow
  those two methods** or the chain breaks).
- `lib/__tests__/evaluation-results-service.test.ts` — the results service.
- `lib/__tests__/evaluation-results-aggregation.test.ts` — the pooled-average contract.
- `lib/__tests__/evaluation-utils.test.ts` — the shared math.
- **New:** `lib/__tests__/db-common-ratings-paging.test.ts` — a mocked Supabase client proving the
  page loop (a full page triggers another page; pages concatenate in order; a page error throws; a
  short page stops the loop; an empty id list makes no query).
- **Manual (the owner's run, AGENTS.md H1):** the diagnostic below, then a visual check of the
  admin department page against the faculty's own page for one subject.

### Out of scope (noted, not planned)

- The **admin membership gate** (semester-scoped roster + home department) vs. the faculty page's
  `evaluateeId + facultySubjectId` filter — a separate alignment story.
- The **`isDisabled`** inconsistency (the results list filters it; the drill-downs do not).
- `listSubmittedByPeriodAndFacultySubjectIds` (`:536`) and `listStatusByPeriodAndFacultySubjectIds`
  (`:548`) — the same cap, on the per-faculty-subject and status-report reads; a follow-up.
- The `""` fallback category (unresolvable `itemId`) diluting Avg Rating while being unnammable.
- The `CATEGORY_NAMES` aliases ("Experiential Learning" / "Experiential Learning Provided to
  Students") overwriting one column instead of averaging.

## Scan

```text
Path:
  ADMIN dept drill-down
    app/admin/evaluations/results/[departmentId]/page.tsx:58-60      (client: one GET)
      → app/api/admin/evaluation-results/departments/[departmentId]/route.ts:21
        → features/evaluation-results/evaluation-results.service.ts:115-219
          :128  evaluationRepository.listSubmittedByPeriodAndEvaluatees(period, facIds)
                 → features/evaluations/evaluations.repository.ts:505-523
                   ← UNBOUNDED: chunked by faculty id (100), no .range() → 1,000-row cap
          :141-145  filter: facultySubjectId ∈ the department's term roster AND
                     assignment.faculty_id === ev.evaluateeId
          :150  evaluationRepository.listRatingsByEvaluationIds(evaluationIds)
                 → features/evaluations/evaluations.repository.ts:608-611
                   → lib/db/common.ts:69-89  fetchRatingsWithCategories
                     ← UNBOUNDED: chunked by 100 eval ids, no .range() → 1,000-row cap
                       (100 evals × 27 rubric items = 2,700 rows → 1,000 returned)
          :176-183  computeCategoryAverages → computeGeneralRating
                    → mapCategoryAveragesToColumns → findHighestLowestRubrics
          :196-207  avgRating / highestRubrics / lowestRubrics  ← the page's three numbers
          :216-217  aggregateFacultyResults + aggregateDepartmentResults

  FACULTY reference page (the correct value)
    app/faculty/evaluations/results/[facultySubjectId]/page.tsx:50-54
      → app/api/faculty/evaluation-results/subjects/[facultySubjectId]/route.ts:63
          listSubmittedByPeriodAndEvaluateeAndFS(period, userId, facultySubjectId)
          → features/evaluations/evaluations.repository.ts:524-535  ← ONE facultySubject
            (tens of rows → the evaluations read is NOT capped)
          :69  listRatingsByEvaluationIds  → lib/db/common.ts:69-89  ← SAME capped ratings read
          :79-83  the SAME four helpers, in the same order  ← the math is identical
```

**Proof** — `lib/__tests__/evaluation-results-service.test.ts` ("returns a pooled faculty
aggregate, not a mean of per-subject means", "excludes stale evals where evaluateeId !==
facultySubject.faculty_id"), `lib/__tests__/evaluation-results-aggregation.test.ts` ("pools the
department's rating rows instead of averaging per-faculty means"),
`lib/__tests__/evaluations-repository-chunking.test.ts` (the chunking contract).
**Command** — `npm test`.

**Teach** — *why* a number can be wrong while every query returns HTTP 200:
- PostgREST applies `db-max-rows` (Supabase's default **1,000**) by adding `LIMIT 1000` to the SQL
  it generates. A request for 2,700 rows comes back with **1,000 rows and no error** — the client
  cannot tell the difference between "there are 1,000 ratings" and "there are 2,700 and you kept
  the first 1,000".
- The repo already knows about the *URL* cap (AGENTS.md **Lesson 7** — a long `.in()` list answers
  **400**). The *row* cap is the other half of the same story and behaves **oppositely**: it
  answers **200** and silently lies. `lib/db/common.ts` fixes the URL half and not the row half.
- Which rows survive is arbitrary when the query has no `ORDER BY` — so the surviving subset is
  biased toward whatever Postgres returns first, and the bias differs between two pages that query
  the same table with different id lists. That is why the same subject can show a different
  **Highest Rubric** on two screens: the label is the max over a smaller, differently-biased
  sample.

**Lens**
- API routes stay thin — app/api/ — **applies**: the change is in the query layer; the eight route
  handlers keep parsing, delegating and returning JSON, with frozen payload shapes.
- proxy.ts is the access-enforcement point — proxy.ts — **n/a**: no route, page or role change.
- All Supabase access goes through repositories wired by DI — lib/repositories/factory.ts —
  **applies**: `lib/db/common.ts` takes the client as a parameter and is reached only from
  repository code; the paging stays there, and no new direct `supabase` appears.
- Double-click prevention via SubmitButton — components/ui — **n/a**: read-only.
- Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT — lib/utils/roles.ts — **n/a**:
  no role logic is touched.

## Plan

**S1 — Page the ratings read** *(the shared helper — one file)*
`lib/db/common.ts:69-89` `fetchRatingsWithCategories`.
- Add `const RATINGS_PAGE_SIZE = 1000` beside `RATINGS_IN_CHUNK_SIZE = 100` (`:59`).
- Inside each evaluation-id chunk, replace the single unbounded query with a **page loop**:
  `.order("evaluationId", { ascending: true }).order("itemId", { ascending: true })` +
  `.range(offset, offset + RATINGS_PAGE_SIZE - 1)`; `offset += RATINGS_PAGE_SIZE` while the page
  came back full; throw on any page's `error`.
- **Why the two-column order:** `evaluation_ratings` carries `UNIQUE("evaluationId", "itemId")`
  (`supabase-schema.sql:760`), so `evaluationId` then `itemId` is a **total** order — offset paging
  cannot duplicate or skip a row. A single-column order is not total (many rows share an
  `evaluationId`) and could straddle a page boundary.
- `RATINGS_IN_CHUNK_SIZE` **stays 100** — that is the *URL* budget, a different cap. Paging, not a
  smaller chunk, is the fix for the *row* cap, so the request count grows only by the page count.
- Untouched: the `rubric_items` (`:111-119`) and `rubric_categories` (`:128-139`) follow-ups (each
  chunk ≤ 100 ids → ≤ 100 rows, far under the cap), the `""` fallback (`:99-110`), the mapping
  (`:144-151`).
- **Blast radius (the reason this is S1):** every result surface reads through this helper —
  `evaluation-results.service.ts:150`, `evaluation-results.repository.ts:271` and `:629`, and
  `evaluations.repository.ts:610` (which serves the faculty list + detail, the admin/dean group +
  faculty detail). **Eight route handlers, one fix.**

**S2 — Page the evaluations reads** *(the row set above the ratings — two files)*
- **S2a** `features/evaluations/evaluations.repository.ts:505-523`
  (`listSubmittedByPeriodAndEvaluatees`): keep the faculty-id chunking (the URL budget), add the
  page loop per chunk with `.order("id", { ascending: true })` (`evaluations.id` is the PK → a total
  order) and `.range(offset, offset + PAGE - 1)`, `PAGE = 1000`. The model is **already in this
  file**: `countSubmittedByFacultySubjectIdsPaged` (`:574-607`).
- **S2b** `features/evaluation-results/evaluation-results.repository.ts:123-133`
  (`listSubmittedEvaluates`): the period's submitted evaluations across **all** departments,
  currently one unbounded read → the same page loop with `.order("id")`.
- Both are **repository**-layer. No service, route, page or component changes; no payload shape
  changes.

**S3 — The tests** *(two files)*
- **New** `lib/__tests__/db-common-ratings-paging.test.ts` — a mocked Supabase client proving:
  (1) a full page (exactly 1,000 rows) triggers a second page; (2) the pages concatenate in order
  and no row is lost; (3) a page error throws; (4) a short page stops the loop (no extra request);
  (5) an empty id list makes no query at all; (6) the order pair is `evaluationId` then `itemId`.
- **Extend** `lib/__tests__/evaluations-repository-chunking.test.ts` for S2a/S2b — and note that its
  `makeChain` mock (`:12-23`) has **neither `.order()` nor `.range()`**, so the chain breaks the
  moment the repository pages. The mock must grow both first. New cases: a full page triggers
  another page; the pages merge; a page error throws; a short page stops.

**S4 — The docs** *(prose only)*
- `AGENTS.md` **Lesson 7** — it documents the *URL* cap only (a long `.in()` answers **400**). Add
  the *row* cap half: PostgREST's `db-max-rows` (1,000) answers **200** and truncates silently, and
  the two halves need **different** fixes — chunk vs. page. Name the four places the repo already
  pages correctly (`evaluations.repository.ts:574-607`, `student-enrollment.repository.ts:218-245`,
  `users.repository.ts:218-238`, `admin-data.service.ts:93`) and the one that did not
  (`lib/db/common.ts`).
- `specs/evaluation-results-attribution.md` + `docs/evaluation-surfaces-verification.md` — the
  contract: *a result figure is computed over the **complete** rating set of its evaluation set; a
  read that silently truncates is a wrong figure, not a missing figure* — and *the department
  drill-down's Avg Rating / Highest / Lowest for a subject equal the faculty page's for the same
  subject.*

**S5 — The verification** *(the owner's run — AGENTS.md H1; the agent does not run these)*
```powershell
npm test
npm run lint
npm run build
```
plus the diagnostic that sizes the cap on the live data:
```powershell
$env:SUPABASE_URL = "<your url>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<your service key>"
$period = "<evaluationPeriodId>"

# The period's submitted evaluations — the fan-out's 1,000-row cap
curl.exe -s -I "$env:SUPABASE_URL/rest/v1/evaluations?select=id&evaluation_period_id=$period&status=eq.SUBMITTED" -H "apikey: $env:SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $env:SUPABASE_SERVICE_ROLE_KEY" -H "Prefer: count=exact"
# Content-Range: 0-999/2450  ->  2,450 evaluations exist; only 1,000 ever reach the app

# The multiplier on the ratings read: rubric items per evaluation
(Invoke-RestMethod -Uri "$env:SUPABASE_URL/rest/v1/rubric_items?select=id" -Headers @{ apikey = $env:SUPABASE_SERVICE_ROLE_KEY; Authorization = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY" }).Count
# 27  ->  100 evaluations = 2,700 rating rows vs the 1,000-row cap
```
and the visual check: open the admin department results page and the faculty's own page for one
subject — the **Avg Rating** and the **Highest / Lowest** labels must now agree.

**Out of scope** — the admin membership gate (semester-scoped roster + home department) vs. the
faculty page's `evaluateeId + facultySubjectId` filter; the `isDisabled` inconsistency between the
results list and the drill-downs; `listSubmittedByPeriodAndFacultySubjectIds` (`:536`) and
`listStatusByPeriodAndFacultySubjectIds` (`:548`); the `""` fallback category diluting Avg Rating
while being unnammable; the `CATEGORY_NAMES` aliases overwriting one column instead of averaging;
`getStudentBreakdownsForFaculties`'s unchunked comments read (`:630-633`) — a **student
breakdown** surface, a different cap, and a follow-up story; the admin table rendering only the
first rubric tie where the faculty page renders them all; the bulk-invalidate's `reason` never
reaching the row.

> **All of the above are now tracked** as seven items in `TODO.md` → *"Open — evaluation results gaps
> (2026-10-21)"*, each with its where / what / why / options.
