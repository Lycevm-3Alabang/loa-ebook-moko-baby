---
skill: plan-fix
story: C3 S1 — department grouping resolved client-side at preview (first-instance-in-file-order per student, per-row department), stamped onto every row; zero UI change
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option A — pure grouping module + tests, then wiring via useMemo (derived, edit-proof); no server change in S1"
status: implementing
pending: gates
---

# Plan — C3 S1 (department grouping)

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1A 2A 3B 4D 5A 6C)? | A — Use it |
| option | Which option (A/B/C/Other)? | A — Option A |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes |
| who-implements | Who implements C3 S1 Slice 1? | B — Code it |
| slice-1 | Apply Slice 1 (pure grouping module + tests)? | Applied — department-grouping.ts + 6 tests. The run surfaced D6's latent bug: `inserted` was destructured INSIDE the `if (toEnroll.length > 0)` block (block-scoped) while the return sits outside it → TS18004 + 30 red tests + the unused-var lint warning. Fixed by hoisting `let inserted = 0` before the block and renaming the destructure to `inserted: wroteRows`. D6's own gate (which I flagged as unpaid debt) would have caught it; it surfaced here instead — recorded honestly. |

## Pending

- gates: User re-runs the gate and pastes green/red; then Slice 2 (wiring) or stop.

## Decisions

- (unchanged + lesson recorded: a "returns 0 on the early path" field whose live value is set inside an `if` block must be hoisted — the early-return and the main return are in different scopes)

## Scan

- (unchanged)

## Plan

Slice 1 — pure module + tests. STATUS: APPLIED (+ D6 scope-bug fixed, debt paid).
Slice 2 — component wiring via useMemo + payload. STATUS: pending gates.
