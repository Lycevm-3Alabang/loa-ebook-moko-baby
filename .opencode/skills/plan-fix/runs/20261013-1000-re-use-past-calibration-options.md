---
skill: plan-fix
story: admin evaluation-results shows 1 dept, misses 2nd faculty submitted after compute (stale-read)
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Phase A targeted self-heal on admin GET (Phase B write-through follow-up)"
status: ready-for-implement-fix
pending: verify
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1A 2A 3B 4D 5A 6C)? | A — Use it |
| story | What to plan? | Admin results stale-read |
| option | Which option (A/B/Other)? | Other — both (A now, B follow-up) |
| plan-done | Is this plan done? | A — Done |
| slice-a1-contract | Apply contract slice (lib/types/evaluation.ts)? | Applied — Step 1/3 |
| slice-a1-impl | Apply repository slice (evaluations.repository.ts)? | Applied — Step 2/3 |
| slice-a2-gate | Apply route gate slice (admin route.ts)? | Applied — Step 3/3 |
| verify | npm test + admin GET shows 2 departments? | Tests GREEN (user-reported); endpoint data check still open |

## Pending

- endpoint-check: admin GET shows 2 departments for 0c0a15fd...? (tests GREEN user-reported)

## Plan

Phase A (approved): targeted self-heal on admin GET.
- Slice A1: distinct-SUBMITTED-evaluatee finder behind evaluationRepository (Repository layer; lib/types/evaluation.ts interface + features/evaluations/evaluations.repository.ts + factory wiring as needed).
- Slice A2 (as built): route gate in app/api/admin/evaluation-results/route.ts — diff submitted vs result facultyIds, computeAll(period) on staleness, re-list. Zero extra writes when fresh. Per-faculty compute() loop rejected: compute()'s global stale-delete (evaluation-results.repository.ts:212-227) would delete other faculties' rows and flip-flop across GETs.
Phase B (follow-up, separate plan): write-through compute(period, evaluatee) on evaluation-submit path.

## Decisions

- Calibration reused from 20261010-1300-c3-s1 (1A 2A 3B 4D 5A 6C): compact card first, diagram for understanding, short explanation plus diagram, workflow D (SCAN → PLAN → I REVIEW → BUILD), step-wise implement, hybrid teach. Workflow D next: Discovery, then which option.
- Story from user text + session evidence: admin GET serves stale 1-row cache; 2nd SUBMITTED eval (655a9083, faculty 5dbf..., 01:26:01) arrived after computeAt 01:22:26 and never materialized. No issue fetch (tracker is user text only).
- Layering order for trace/slices: Route Handler → Service → Repository → Supabase (route currently calls repositories directly; fix pushes diff+compute behind service/repository to keep route thin). Gold paths read first: app/api/admin/evaluation-results/route.ts, features/evaluation-results/evaluation-results.repository.ts, features/evaluations/evaluations.repository.ts, lib/repositories/factory.ts.
- Proof command: npm test (no dedicated tests exist for this path — grep *.test.ts for evaluation-results/computeAll found none).
- Invariant preservation: API thin (applies — diff+compute go to service/repository, route stays parse/call/return); Supabase via repos+DI (applies — via factory, zero direct supabase in route); proxy.ts (n/a — requireAdmin untouched); SubmitButton (n/a — read-only GET); role priority (n/a — no role branching).
- Both approved: Phase A (this plan) = targeted self-heal on admin GET; Phase B (follow-up plan) = write-through on submit. Phase A slices follow layering Repository → Route: slice 1 distinct-SUBMITTED-evaluatee query behind evaluationRepository, slice 2 route gate using it + targeted compute. Gold paths to read before build: app/api/admin/evaluation-results/route.ts, features/evaluation-results/evaluation-results.repository.ts, features/evaluations/evaluations.repository.ts, lib/repositories/factory.ts. Proof: npm test.
- Who implements: Code it (each slice still needs explicit Apply this slice).
- As-built correction (Slice A2): staleness triggers full computeAll, not per-faculty compute — single-faculty compute() deletes all other faculties' rows via its unscoped stale-delete. Phase B prerequisite: scope that stale-delete (or bypass it) before any submit-path write-through.

## Decisions

- Repo refined: repository.md read (Layering Route Handler → Controller → Service → Repository → Supabase; Tests npm test; Issue tracker user text only).
- Newest run for same repo with full calibration: 20261010-1300-c3-s1-department-grouping.md (1A 2A 3B 4D 5A 6C). No story id/problem in request beyond re-using calibration, so no scan yet.

## Scan

Path: app/admin/evaluations/results/page.tsx:49-51 → app/api/admin/evaluation-results/route.ts:15-21 (hasCategoryData gate) → features/evaluation-results/evaluation-results.repository.ts:15-22 list / 38-228 compute / 230-232 computeAll + features/evaluations/evaluations.repository.ts:374-405 listSubmittedWithSentiment
Proof: none. Command: npm test
Teach: the gate `results.some(r => generalRating !== null)` is a cache-warm check that becomes a never-recompute trap — once faculty d000...0001 computed (3.44 at 01:22:26), later SUBMITTED evals (faculty 5dbf... at 01:26:01) never trigger compute, so dept-2 never appears. One alternative is write-through on submit instead of self-heal on GET.
Lens:
- API routes stay thin: applies — app/api/admin/evaluation-results/route.ts
- Supabase via repositories + DI: applies — lib/repositories/factory.ts, features/evaluation-results/, features/evaluations/
- proxy.ts access-enforcement: n/a + requireAdmin untouched, no new unauthenticated path
- SubmitButton double-click prevention: n/a + read-only GET, no forms
- Role pipe-delimited priority: n/a + no role branching touched

## Plan

- empty (status in-progress, pending calibration-pre)
