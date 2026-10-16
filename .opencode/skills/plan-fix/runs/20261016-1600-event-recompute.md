---
skill: plan-fix
story: Event-driven recompute of evaluation_results via Vercel Workflows (dispute / submit / restore / stale-disable / ETL gaps)
repo: D:\loa\e-consultation-worktrees\regie-worktree
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: Option A — App-event → recompute workflow (S1 workflow, S2 dispute+submit, S3 restore, S4 ETL batch; findPending excluded)
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| reuse | Use last calibration (1A 2A 3B 4D 5A 6C)? | Use it |
| which-option | A / B / C / Other? | A — App-event → recompute workflow |
| plan-done | Is this plan done? | Done |
| who-implements | Who implements? | B — Code it |
| slice-1 | Apply S1 recompute workflow? | Stop — not applied |
| slice-1-retry | Apply S1 recompute workflow (retry)? | Applied |
| slice-2a | Apply S2a dispute wiring? | Applied |
| slice-2b | Apply S2b submit wiring? | Applied |
| slice-3 | Apply S3 restore wiring? | Applied |
| slice-4 | Apply S4 ETL wiring? | Applied |

## Pending

## Decisions

- Thin routes preserved: each caller only resolves periodId(s) + fire-and-forget workflow call with .catch; compute lives in workflow step → repository, per Layering Route→Service→Repository→Supabase.
- proxy/auth untouched: dispute (student auth), submit (owner guard), restore (requireAdmin) keep existing gates; workflow adds no new surface.
- DI preserved: workflow calls evaluationResultRepository via lib/repositories/factory.ts; no direct supabase.from in routes/workflow (matches Gold paths app/api/, features/, factory).
- SubmitButton n/a: no form changes.
- Roles n/a: no role change.
- Layering order for slices: workflow file → student write paths (dispute, submit) → admin restore → import batch (single call, not per row); findPending read path explicitly excluded (see proposal).
- Gold paths to read before build: app/api/auth/activate/route.ts:33 (fire-and-forget pattern), lib/workflows/email-workflows.ts:59-73 (workflow shape), features/evaluation-results/evaluation-results.repository.ts:56-281 (compute semantics + stale-delete), app/api/admin/faculty-subjects/reassign/route.ts:42-46 (existing computeAll-per-period pattern to mirror).
- Proof command: npm test (no dedicated tests exist; manual: dispute→results drop, submit→totals increment, restore→reappear).

## Scan

```text
Path P1 (dispute): app/api/evaluations/dispute/route.ts:50-55 → evaluationRepository.invalidateById / invalidateByEvaluatorAndPeriod → evaluations (isDisabled=true, INVALID). No compute call.
Path P2 (submit): app/api/evaluations/[id]/submit/route.ts:17 → evaluations.service submit → evaluations (SUBMITTED). No compute call.
Path P3 (restore): app/api/admin/evaluations/disabled/restore/route.ts:15 → evaluationRepository.restoreByIds → evaluations (isDisabled=false). No compute call. Delete path disabled/route.ts:25-27 likewise.
Path P4 (stale-disable): features/evaluations/evaluations.repository.ts findPending:128-138,164-176 → supabase evaluations update isDisabled=true when evaluateeId != fs.faculty_id. No compute call.
Path P5 (ETL): lib/services/etlEvaluation.ts:516,534,899 → facultySubjectRepository.update({faculty_id}) dummy→real. No invalidate, no compute.
Gold (already good): faculty-subjects/reassign/route.ts:30→40→42-46, evaluation-results/invalidate/route.ts:24→26, evaluations/[evaluationId]/invalidate/route.ts:18→20, student-enrollments/[id]/route.ts:21→28-31 — all invalidate + computeAll.
Proof: none. Grep *.test.ts for computeAll/dispute-recompute found none. Command: npm test
Teach: compute() (evaluation-results.repository.ts:56-281) pools SUBMITTED+enabled by evaluateeId, upserts per-faculty + deletes zero-eval rows; GET gate (admin/evaluation-results/route.ts:15-29) only recomputes when empty or new-faculty-missing, so reductions and extra votes for listed faculty never heal.
Lens:
- API routes stay thin: applies + all five gaps are thin routes/services missing one repository call
- proxy.ts access-enforcement: n/a + all paths already gated (requireAdmin/auth), fix adds no new surface
- Supabase via repositories DI: applies + fix must call evaluationResultRepository via factory (lib/repositories/factory.ts), no direct supabase.from in route/workflow
- SubmitButton double-click: n/a + admin/dispute paths are not double-click forms
- Role pipe-delimited: n/a + no role change
```
pending: which-option

## Plan

### S1 — recompute workflow (new file, first)
- Create `lib/workflows/recompute-workflow.ts`: `"use workflow"` fn `recomputeResultsWorkflow(periodId: string)` + inner `"use step"` calling `evaluationResultRepository.computeAll(periodId)` via `lib/repositories/factory.ts`.
- Arg is serializable string only. Fire-and-forget safe, durable retries. Read Gold paths first: `lib/workflows/email-workflows.ts:59-73`, `app/api/auth/activate/route.ts:33`, `features/evaluation-results/evaluation-results.repository.ts:56-281`.
- Verify: `npm test`.

### S2 — student write paths (dispute + submit)
- `app/api/evaluations/dispute/route.ts`: after invalidate/audit, call workflow with `activePeriod.id` (no await, `.catch`, response stays `{success:true}`).
- `app/api/evaluations/[id]/submit/route.ts`: period from already-fetched owned evaluation, same fire-and-forget call.
- Verify: dispute→old faculty totals drop on next Results read; submit→totals increment.

### S3 — admin restore
- `app/api/admin/evaluations/disabled/restore/route.ts`: resolve distinct periodIds for given ids (lookup, no UI change), then one workflow call per period after `restoreByIds`.
- Delete-disabled excluded (already-disabled rows never contributed to compute).
- Verify: restored votes reappear in Results.

### S4 — ETL batch (once per import, never per row)
- After mappings batch completes, resolve semester periods via `evaluationPeriodRepository.findBySemester(semesterId)`, one workflow call per period.
- Verify: mid-period dummy→real load reflects in Results without manual refresh hack.

### Excluded by design
- `findPending` stale-disable fires nothing (read path; layering + fan-out). Healing via S2 resubmit + existing GET `hasMissing` gate; residual lag accepted.
- Out of scope: webhook path, GET-gate tightening, burst coalescing, transfer-vs-invalidate semantics.
