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
| slice-1 | Slice 1 (pure grouping module + tests)? | Applied — plus D6's block-scoped `inserted` bug found + fixed (hoisted `let inserted = 0`, renamed destructure), 332 green reported. |
| slice-2 | Slice 2 (wiring)? | Applied — import + `studentDepartmentByEmail` useMemo (derived from previewRows, strict null) + payload sends the student's department (row's own value untouched for S2's panels). Zero UI change, no server change. Awaiting close-out gates per H1. |

## Pending

- gates: User runs the close-out gate and pastes green/red; then C3 S1 close-out (TODO/README) — which also formally retires D6's unpaid gate debt.

## Decisions

- (unchanged + lesson recorded: fields whose live value is set inside an `if` block must be hoisted — early-return and main return are different scopes)

## Scan

- (unchanged)

## Plan

Slice 1 — module + tests. STATUS: DONE (green reported).
Slice 2 — wiring. STATUS: APPLIED (awaiting gates).
