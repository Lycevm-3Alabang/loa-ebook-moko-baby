---
skill: plan-fix
story: Visual-only dashboard (cards/graphs, zero tables) for Admin (all depts) + Dean (own dept) per agreed 6-block layout
repo: D:\loa\e-consultation-worktrees\regie-worktree
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option A service + visual components + both pages (fill 5 data stubs, build no-table blocks, wire Dean + new Admin mirror)"
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1A 2A 3B 4D 5A 6C)? | A — Use it |
| option | Which option (A/B/Other)? | A — service + components + both pages |
| plan-done | Is this plan done? | Done |
| house-rule | Extra constraint? | Must not break any existing implementation — recorded in Decisions, enforced per slice |
| handoff | Run implement-fix with it? | Yes |
| who-implements | Who implements? | B — Code it |
| slice-1 | Slice 1 service fill + admin twin — apply? | Applied |
| slice-2 | Slice 2 single-file visuals — apply? | Applied |
| slice-3a | Slice 3a Dean rewire — apply? | Applied |
| slice-3b | Slice 3b Admin page — apply? | Applied |
| verify | tsc + vitest? | Green (user-reported) |

## Pending

- none: closed out, verify green (user-reported)

## Decisions

- repo refined: read repository.md (Layering Route Handler → Controller → Service → Repository → Supabase; tracker user text only)
- Calibration reused (1A 2A 3B 4D 5A 6C): compact card first, diagram for understanding, short explanation plus diagram, workflow D (SCAN → PLAN → I REVIEW → BUILD), step-wise implement, hybrid teach. Workflow D next: Discovery, then which option.
- Story from user text + layout discussion: visual-only dashboard (cards/graphs, zero <table>) per agreed 6-block layout — KPIs, trend line, remark stacked bar, category h-bars + Δ, response gauge + dot strip, attention/recognition cards; Admin (all depts + dept bars) mirrors Dean (own dept, fixed); every visual links into results/* tabular layer. No issue fetch (tracker is user text only).
- Layering order for trace/slices: Page (Server Component) → Service → Repository → Supabase. Gold paths read first: app/dean/evaluations/reports/detail/page.tsx, features/evaluations/evaluation-report.service.ts, features/evaluations/components/EvaluationReportContent.tsx, app/admin/evaluations/results/[departmentId]/, lib/repositories/factory.ts.
- Proof command: npm test (none cover dashboard/report-service path).
- Option A approved: service + visual components + both pages. Layering order for slices: Service → Component → Page. Gold paths to re-read at build: features/evaluations/evaluation-report.service.ts, features/evaluations/components/EvaluationReportContent.tsx (patterns to reuse: remarkColor, CategoryBar), app/dean/evaluations/reports/detail/page.tsx, lib/repositories/factory.ts. Proof: npm test.
- Invariant preservation: API thin (applies — no new endpoints; pages read via services); Supabase via repos+DI (applies — stub-filling reads go via factory repos); proxy.ts (applies — ADMIN gate on new admin page, DEAN gate kept); SubmitButton (n/a — GET form + links only, no mutations); role pipe priority (applies — hasRole gates + departments.deanId scoping; admin path skips dept filter).
- House rule (user): must not break any existing implementation. Enforced per slice — Slice 1 additive only (fill stub fields, add getAdminDashboardData; existing getDeanEvalReportData/getAdminEvalReportData/getFacultyEvalReportData signatures and return shapes untouched); Slice 2 new files only (no edits to EvaluationReportContent or existing components); Slice 3 keeps Dean page contract (GET selectors, EvaluationReportContent anchor with same props) and results/* byte-identical; new admin page wired into proxy PAGE_ACCESS + group_access or it ships unreachable — flagged inside Slice 3. Proof extended: npm test + tsc --noEmit, both green before close-out.

## Scan

Path: app/dean/evaluations/reports/detail/page.tsx:9-31 auth + hasRole DEAN + searchParams → getDeanDashboardData + getDeanEvalReportData → :56-100 inline KPI cards (real) + trend/remarks/categories/response/attention as plain divs/p (stubs: trend single-entry, delta/responsePct/expected/rubricGroupName null) + :100 EvaluationReportContent table beneath
Branch: app/admin/evaluations/results/[departmentId]/ exists (tabular, no dashboard); app/admin has no reports/detail mirror; app/faculty/evaluations/reports/page.tsx own-scope table only
Proof: none. Command: npm test
Teach: the dean page already proves the data path works — what is missing is (a) real data behind 5 stubbed viz fields and (b) real visual components instead of text rows; the admin mirror reuses both once they exist, which is why service-first ordering matters. One alternative is building admin visuals off the per-subject departments/[id] route payload, but that forks the averaging path and the two roles' numbers would drift.
Lens:
- API routes stay thin: applies — app/api/dean/evaluation-results/departments/[departmentId]/route.ts (reference only, untouched)
- Supabase via repositories + DI: applies — lib/repositories/factory.ts, features/evaluations/evaluation-report.service.ts
- proxy.ts access-enforcement: applies — new admin dashboard keeps ADMIN gate
- SubmitButton double-click prevention: n/a + GET form + links only
- Role pipe-delimited priority: applies — lib/utils/roles hasRole + departments.deanId scoping

## Plan

Slice 1 — Service (features/evaluations/evaluation-report.service.ts): fill trend (last 4 sems + rubricChanged on group switch), delta per category vs previous period, expected/responsePct via enrollments, rubricGroupName via period→group lookup; add getAdminDashboardData (same DeanDashboardData shape, deptId param or all-depts aggregate + dept-bars data). Keep weighted avg, n<5 → —, remark 4.5/3.5/2.5/1.5.
Slice 2 — Components (new features/evaluations/components/dashboard/*): KpiCards, TrendLine, RemarkStack, CategoryBars, ResponseStrip (gauge + dots), AttentionCards; zero <table>; dark: tokens; skeleton + empty states; every visual links to results/*.
Slice 3 — Pages: app/dean/evaluations/reports/detail/page.tsx swaps inline blocks for Slice 2 components (GET selectors kept); new admin dashboard page under app/admin/evaluations/ with dept selector + dept-bars row, ADMIN gate via hasRole + proxy PAGE_ACCESS; EvaluationReportContent stays as details anchor; results/* untouched.
Proof: npm test (no dedicated tests cover this path).
