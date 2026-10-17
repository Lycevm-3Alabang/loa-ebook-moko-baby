---
skill: plan-fix
story: Coalesced recompute follow-up — debounce burst submit/dispute/restore/import events into one computeAll per period (burst protection for deadline-hour storms)
repo: D:\loa\e-consultation-worktrees\regie-worktree
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: Option A — Freshness gate on computedAt (S1 repo read, S2 workflow gate, 90s window, fail open)
status: done
pending: none
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| reuse | Use last calibration (1A 2A 3B 4D 5A 6C)? | Use it |
| which-option | A / B / C / Other? | A — Freshness gate on computedAt |
| plan-done | Is this plan done? | Done |
| who-implements | Who implements? | B — Code it |
| slice-1 | Apply S1 repo read? | Applied |
| slice-2 | Apply S2 workflow gate? | Applied |
| followup-modes | Per-event modes (burst/immediate)? | Applied |

## Pending

## Decisions

- Thin routes preserved: no caller changes at all; gate lives inside the workflow step.
- proxy/auth untouched: no new surface.
- DI preserved: freshness read goes through evaluationResultRepository (new method), no direct supabase.from in workflow — matches Gold path factory pattern.
- SubmitButton n/a, roles n/a.
- Layering order for slices: Repository read method → workflow gate (S1 → S2).
- Gold paths to read before build: features/evaluation-results/evaluation-results.repository.ts:234-260 (updateData/computedAt shape + existing list pattern :33-40), lib/workflows/recompute-workflow.ts (S1 output), lib/types/evaluation.ts:583-584 (IEvaluationResultRepository interface — new method needs a type entry).
- Proof command: npm test (no dedicated tests; manual: burst → 1 compute via computedAt; quiet submit → computes).
- Fail-open rule: freshness-read failure → compute anyway (safe default; stale results are worse than a wasted compute).

## Scan

```text
Path: 5 floated callers (dispute/route.ts, submit/route.ts, disabled/restore/route.ts, import/faculties/route.ts x2) → lib/workflows/recompute-workflow.ts → evaluationResultRepository.computeAll(periodId) → evaluations + evaluation_ratings + users reads per period.
Proof: none. No throttle/debounce/redis/upstash in direct deps (package.json:12-27; redis exists only transitively in lockfile, no env/config); no server-side throttle infra (only client debouncedSearch in DataUsersPage.tsx:50).
Teach: compute() stamps computedAt per faculty row (evaluation-results.repository.ts:239) — that column is a free cross-instance freshness signal, so the workflow can skip when a recent compute already covered the burst. No new table, env, or dep needed.
Lens:
- API routes stay thin: applies + gate lives inside the workflow step, callers untouched
- proxy.ts access-enforcement: n/a + no new surface
- Supabase via repositories DI: applies + freshness read goes through evaluationResultRepository (extend it, no direct supabase.from in workflow)
- SubmitButton double-click: n/a
- Role pipe-delimited: n/a
```
pending: which-option

## Plan

### S1 — repository read (first)
- New `getLatestComputedAt(evaluationPeriodId): Promise<string | null>` on `evaluationResultRepository` (features/evaluation-results/evaluation-results.repository.ts): `select computedAt, eq evaluation_period_id, order computedAt desc, limit 1`, return ISO string or null. Null when no rows.
- Type entry in `lib/types/evaluation.ts` beside `compute`/`computeAll`.
- Verify: `npm test`.

### S2 — workflow gate
- `lib/workflows/recompute-workflow.ts`: step reads latest stamp first; skips `computeAll` when `Date.now() - latest < 90s` (one tunable constant). Read error → compute anyway (fail open). No-row (null) → compute.
- Callers untouched.
- Verify: rapid N submits → single computeAll (check computedAt); lone submit after quiet → immediate recompute.

### Semantics locked
- At-most-90s staleness post-burst; window tunable after observing deadline traffic.
- Out of scope: exact-once, lease table, in-memory throttle, GET-gate changes, auto-tuning.
