---
skill: plan-fix
story: Visual polish pass on the six dashboard blocks (cards/graphs) for Admin + Dean
repo: D:\loa\e-consultation-worktrees\regie-worktree
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option A placeholder-first polish (badged fixtures + TSDoc source map, live service untouched)"
status: implementing
pending: slice-1
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1A 2A 3B 4D 5A 6C)? | A — Use it |
| option | Which option (A/B/Other)? | A — full polish |
| plan-revision | Placeholder-only revision? | Yes — visuals render clearly-badged placeholder fixtures; each component documents its live source field in TSDoc; live service untouched; one-line swap back later |
| plan-done | Is revised plan done? | Done |
| handoff | Run implement-fix with it? | Yes |
| who-implements | Who implements? | B — Code it |
| slice-1 | Slice 1 visuals polish + badge + TSDoc — apply? | Applied |
| slice-2 | Slice 2 Dean fixture wiring — apply? | Applied |
| slice-3 | Slice 3 Admin fixture wiring — apply? | Applied |

## Pending

- verify: Slices 1-3 applied; proof tsc + npm test left to user per H1

## Decisions

- repo refined: read repository.md (Layering Route Handler → Controller → Service → Repository → Supabase; tracker user text only)
- Calibration reused (1A 2A 3B 4D 5A 6C): compact card first, diagram for understanding, short explanation plus diagram, workflow D (SCAN → PLAN → I REVIEW → BUILD), step-wise implement, hybrid teach. Workflow D next: Discovery, then which option.
- Story from user text: finish the cards/graphs styling pass on the six dashboard blocks; visual-only + house rules carry over. Pills keep the explicit palette matching EvaluationReportContent (shared getRemarkColor uses different theme tokens — switching would restyle, so local stays). No issue fetch (tracker is user text only).
- Layering order: Component → Page (service/data shapes frozen; visuals + loading shells only). Gold paths read first: features/evaluations/components/dashboard/DashboardVisuals.tsx, lib/evaluation-utils.ts:27/116 (CATEGORY_LABELS identical — safe dedupe target), components/ui/Skeleton.tsx (SkeletonMetricGrid/SkeletonCard), app route loading convention (no loading.tsx exists under either reports route).
- Proof command: tsc --noEmit + npm test (user runs per H1; plus DashboardVisuals unit tests if written).
- Option A approved: full polish. Slices (one file per build turn): Slice 1 DashboardVisuals.tsx internals (import shared CATEGORY_LABELS + delete duplicate, SVG gauge arc with 60% marker in ResponseStrip, gridlines + axis labels in TrendLine; props/shapes frozen); Slice 2 new app/dean/evaluations/reports/detail/loading.tsx (SkeletonMetricGrid + SkeletonCard); Slice 3 new app/admin/evaluations/reports/loading.tsx (same shells). Gold paths to re-read at build: DashboardVisuals.tsx, components/ui/Skeleton.tsx, lib/evaluation-utils.ts:27. Proof: tsc --noEmit + npm test.
- Placeholder revision (user): pages render clearly-badged placeholder fixtures instead of live service data until numbers are verified; every visual documents its live source field in TSDoc (e.g. TrendLine ← DeanDashboardData.trend ← per-period dept averages); service + tests untouched; revert = swapping the fixture for the live call (one localized edit per page, flagged in code). Revised slices: Slice 1 visuals polish + placeholder badge affordance + TSDoc source map; Slice 2 dean page placeholder wiring; Slice 3 admin page placeholder wiring; loading shells fold into Slice 1 (DashboardEmpty already covers empty state).
- Invariant preservation: API thin (n/a — no endpoints); Supabase via repos+DI (n/a — no data reads); proxy.ts (n/a — no new routes); SubmitButton (n/a — no forms); role pipe priority (n/a — no gates touched).

## Scan

Path: DashboardVisuals.tsx (new, Slice 2) → local CATEGORY_LABELS duplicates lib/evaluation-utils.ts:27 verbatim (drift risk) → local remarkPill intentionally diverges from lib getRemarkColor:116 (theme tokens vs explicit palette matching the table below) → ResponseStrip renders pct as text (no gauge) → TrendLine svg has no gridlines/axis labels → both report routes lack loading.tsx (blank screen on server fetch)
Proof: none new (dashboard service tests green). Command: tsc --noEmit + npm test
Teach: the only zero-risk dedupe is CATEGORY_LABELS (identical strings, import and delete); everything else in this run is strictly additive visuals or new loading shells, which is why pages and services stay untouched. One alternative is folding polish into the pooled-grain run, but that mixes visual churn with number changes and muddies verification.
Lens:
- API routes stay thin: n/a + no endpoints
- Supabase via repositories + DI: n/a + no data reads
- proxy.ts access-enforcement: n/a + no new routes
- SubmitButton double-click prevention: n/a + no forms
- Role pipe-delimited priority: n/a + no gates touched

## Plan

Slice 1 — DashboardVisuals.tsx internals: import shared CATEGORY_LABELS + delete duplicate; SVG gauge arc with 60% marker in ResponseStrip; gridlines + axis labels in TrendLine; add placeholder badge affordance + TSDoc live-source map per component; props/shapes frozen.
Slice 2 — Dean page: render badged placeholder fixture instead of live service data (service untouched); LIVE-DATA swap comment at the call site.
Slice 3 — Admin page: same fixture wiring + DeptBars placeholder set.
Proof: tsc --noEmit + npm test (user runs per H1).
