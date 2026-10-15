---
skill: plan-fix
story: Dept overall + per-rubric scores from pooled dept ratings per semester and evaluation period (collective strength/weakness)
repo: D:\loa\e-consultation-worktrees\regie-worktree
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option A pool raw ratings (deptPeriodAverages via submitted evals + computeCategoryAverages, shape kept)"
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1A 2A 3B 4D 5A 6C)? | A — Use it |
| option | Which option (A/B/Other)? | A — pool raw ratings |

## Pending

- plan-done: proposal shown; awaiting Done / STOP / revision

## Decisions

- repo refined: read repository.md (Layering Route Handler → Controller → Service → Repository → Supabase; tracker user text only)
- Calibration reused (1A 2A 3B 4D 5A 6C): compact card first, diagram for understanding, short explanation plus diagram, workflow D (SCAN → PLAN → I REVIEW → BUILD), step-wise implement, hybrid teach. Workflow D next: Discovery, then which option.
- Story from user text + discussion: dept General + 8 category scores switch source from mean-of-faculty-means to pooled mean of all submitted dept ratings per (semesterId, evaluationPeriodId); semester × period stays the comparison basis; people-grain views untouched; house rule carries over. No issue fetch (tracker is user text only).
- Layering order for trace/slices: Service → Repository → Supabase (single service file; no page/component changes). Gold paths read first: features/evaluations/evaluation-report.service.ts (deptPeriodAverages), lib/evaluation-utils.ts (computeCategoryAverages/computeGeneralRating/mapCategoryAveragesToColumns), app/api/dean/evaluation-results/departments/[departmentId]/route.ts:59-100 (reference pooling pattern), lib/repositories/factory.ts.
- Proof command: npm test + tsc --noEmit (none cover this path; user runs per H1).
- Option A approved: pool raw ratings. Single-slice plan (one service file): rewrite deptPeriodAverages body, keep output shape {general, cats, respondents, facultyIds}. Gold paths to re-read at build: features/evaluations/evaluation-report.service.ts (current body), lib/evaluation-utils.ts:56-92, app/api/dean/evaluation-results/departments/[departmentId]/route.ts:59-100. Proof: tsc --noEmit + npm test.

## Scan

Path: buildDeptDashboard → deptPeriodAverages(dept, period) [evaluation-report.service.ts] → evaluationResultRepository.list + userRepository.listByIds live-rescope → mean of faculty-row columns (faculty grain — the defect)
Reference: departments/[departmentId]/route.ts:59-100 listSubmittedByPeriodAndEvaluatees → listRatingsByEvaluationIds → computeCategoryAverages → computeGeneralRating → mapCategoryAveragesToColumns (pooled-ratings math to reuse)
Proof: none. Command: npm test + tsc --noEmit
Teach: computeCategoryAverages pools raw 1-5 ratings per category name, computeGeneralRating means the category means — pooling ALL dept evals through the same two functions is what makes dashboard and results page agree by construction. One alternative is averaging the route's per-subject group means, but that reintroduces grain weighting (multi-subject faculty count more).
Lens:
- API routes stay thin: applies — no handler changes, math reused from lib/evaluation-utils
- Supabase via repositories + DI: applies — evaluationRepository + userRepository via factory
- proxy.ts access-enforcement: n/a + no new routes
- SubmitButton double-click prevention: n/a + read-only
- Role pipe-delimited priority: n/a + scoping unchanged

## Plan

- empty
