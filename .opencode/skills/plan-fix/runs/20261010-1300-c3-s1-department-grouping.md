---
skill: plan-fix
story: C3 S1 — department grouping resolved client-side at preview (first-instance-in-file-order per student, per-row department), stamped onto every row; zero UI change
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option A — pure grouping module + tests, then wiring via useMemo (derived, edit-proof); no server change in S1"
status: done
pending: none
---

# Plan — C3 S1 (department grouping)

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1A 2A 3B 4A 5A 6C)? | A — Use it |
| option | Which option (A/B/C/Other)? | A — Option A |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes |
| who-implements | Who implements C3 S1 Slice 1? | B — Code it |
| slice-1 | Slice 1 (pure grouping module + tests)? | Applied — also surfaced + fixed D6's block-scoped `inserted` (TS18004, 30 red tests). 332 green reported. |
| slice-2 | Slice 2 (wiring)? | Applied — useMemo + payload sends the student's department. |
| close-out | TODO.md + specs/README.md? | Applied — TODO NEXT → C3 S2 (with S1's data-layer note), C3 S1 checked, dangling queued lines cleaned; README C3 row S1 Done, counts 332/24, Next-slice → C3 S2. |

## Pending

- none

## Decisions

- (as recorded; lesson: a field whose live value is set inside an `if` must be hoisted — early-return and main return are different scopes)

## Scan

- (as recorded)

## Plan

Slice 1 — module + tests. STATUS: DONE.
Slice 2 — wiring. STATUS: DONE.
Next: C3 S2 (department grid + panels) → S3 (Unassigned polish) → S4 (`userMap` merge). Vercel font flake still parked.
