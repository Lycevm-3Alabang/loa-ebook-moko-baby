---
skill: plan-fix
story: eval-results-accuracy (admin evaluations results report accuracy + proof tests)
repo: e-consultation (regie-worktree)
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: D
decision: Option A expanded + performance (extract pure aggregators + utils tests + invalidation/fallback/dept-chain/sentiment edge cases + perf smoke)
status: done
pending:
---

# Plan

## Pending
none

## Progress

| id | question | answer |
|----|----------|--------|
| who-implements | Who implements | B (Code it) |
| slice-1 | Apply slice 1 (utils tests) | Applied — lib/__tests__/evaluation-utils.test.ts created |
| slice-2a | Apply slice 2a (extract aggregators) | Applied — evaluation-utils.ts, repository, department route refactored |
| slice-2b | Apply slice 2b (aggregation tests) | Applied — lib/__tests__/evaluation-results-aggregation.test.ts created |
| slice-2c/2d | Apply slice 2c/2d (resolveFacultyDepartment extract + tests) | Applied — resolveFacultyDepartment added; repo refactored; 8 tests added |
| slice-2f | Apply slice 2f (perf smoke tests) | Applied — 2 perf tests added, both pass |
| slice-3 | Apply slice 3 (admin results route tests) | Applied — lib/__tests__/admin-evaluation-results-route.test.ts (7 tests) |

## Decisions

Option A expanded: extract + test pure aggregation + utils + invalidation/fallback edge cases (everything needed to harden and rectify incorrect report results). Invariants preserved: All Supabase access stays in repositories (lib/repositories/factory.ts) — extraction only moves pure grouping/math out, DB calls remain in evaluation-results.repository.ts. API routes stay thin — department route's inline aggregation moves into a pure aggregator, route becomes parse+call+return JSON. proxy.ts access enforcement unchanged (requireAdmin). Role priority unchanged. Layering order: evaluation-utils (pure) → evaluation-results.repository (DB) → route (HTTP). Gold paths: app/api/, features/, lib/repositories/factory.ts. Proof command: npm test. New tests: lib/__tests__/evaluation-utils.test.ts, lib/__tests__/evaluation-results-aggregation.test.ts (happy path + two-stage rounding + invalidation exclusion + department fallback chain + sentiment null handling + performance smoke budget). Out of scope: changing report numbers/rounding semantics, visibility flags, PDF export, dean/faculty/student result views, and the sentiment model itself (only its aggregation is pinned). Performance: query fan-out documented, pure aggregators get a time budget on a large fixture.

## Scan

Path: app/admin/evaluations/results/page.tsx → useApiGet("/api/admin/evaluation-results") → app/api/admin/evaluation-results/route.ts (GET) → evaluationResultRepository.listLiveDeptAverages (features/evaluation-results/evaluation-results.repository.ts:306) + evaluationRepository.listSubmittedWithSentiment + departmentRepository.listAll. Drill-down: results/[departmentId]/page.tsx → /api/admin/evaluation-results/departments/[departmentId]/route.ts (GET) → inline aggregation using lib/evaluation-utils.ts (computeCategoryAverages, computeGeneralRating, mapCategoryAveragesToColumns, findHighestLowestRubrics, computeSentimentScore, getRemark).
Proof: lib/__tests__/evaluation-report-dashboard.test.ts covers evaluation-report.service (dean/admin dashboard KPIs) only. No test for evaluation-results.repository.ts, the admin results routes, or lib/evaluation-utils.ts pure functions. Command: npm test.
Teach: The report's numbers come from listLiveDeptAverages (dept-level) and inline route aggregation (subject-level). The pure math (category averages, general rating, remark bands, highest/lowest rubrics, sentiment) lives in lib/evaluation-utils.ts and is deterministic; the DB-coupled aggregation is not currently testable without mocking the Supabase chain. Adding proof means either mocking that chain or extracting the aggregation into a pure function.
Lens:
- API routes stay thin (parse, call controller, return JSON) — app/api/ — applies; the department route currently aggregates inline (existing; proof task does not require moving it, but extraction is a candidate)
- All Supabase access goes through repositories wired by DI — lib/repositories/factory.ts — applies; routes use factory repositories
- Double-click prevention via SubmitButton — components/ui — n/a (read-only report page)
- proxy.ts is the access-enforcement point — proxy.ts — applies; routes gated by requireAdmin
- Role is pipe-delimited; priority ADMIN > DEAN > FACULTY > STUDENT — lib/utils/roles.ts — applies; admin-only via requireAdmin
Gold paths: app/api/, features/, lib/repositories/factory.ts

## Plan

- S1: Unit tests for lib/evaluation-utils.ts pure functions (computeCategoryAverages, computeGeneralRating, mapCategoryAveragesToColumns, findHighestLowestRubrics, getRemark, computeSentimentScore, CATEGORY_NAMES aliases). File: lib/__tests__/evaluation-utils.test.ts. No mocking.
- S2a: Extract pure aggregators into lib/evaluation-utils.ts: buildFacultySummary(ratings, comments) and buildLiveDeptAverages(facultyInputs). Refactor evaluation-results.repository.ts listLiveDeptAverages and app/api/admin/evaluation-results/departments/[departmentId]/route.ts to call them. DB access stays in repo.
- S2b: Aggregation tests (happy path) — exact dept avgRating, facultyCount, respondents, catAverages, rubrics, two-stage rounding. File: lib/__tests__/evaluation-results-aggregation.test.ts.
- S2c: Invalidation/disabled exclusion tests — exclude status!=SUBMITTED and isDisabled=true; zero-remaining faculty yields no dept row and does not blank the average.
- S2d: Department fallback chain tests — 4-step resolution (users -> faculty_subjects -> sections -> department_courses); semester mismatch -> "__unknown__" (Unassigned), still counted.
- S2e: Sentiment aggregation tests — per-faculty then per-dept mean; zero scored comments -> null (excluded), not 0.
- S2f: Performance check — document query fan-out; perf smoke test with time budget on large fixture (500 faculties x 8 categories); flag N+1 / unbounded .in().
- S3 (optional): Route tests for /api/admin/evaluation-results recompute trigger + shape and department route shape.
Proof command: npm test. Invariants: Supabase access in repositories only; department route parse->call pure aggregator->return JSON; requireAdmin/role/proxy unchanged. Out of scope: report numbers/rounding semantics, visibility flags, PDF export, dean/faculty/student views, sentiment model itself.
