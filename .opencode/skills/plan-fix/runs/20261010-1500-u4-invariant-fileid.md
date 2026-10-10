---
skill: plan-fix
story: U4 safety invariant + Reference fileId in every failure per specs/chunked-import-failure-ux.md §4.1 (F5) + §4.5 (F6) — mapper widens, student banner aligns, 400 stays verbatim
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option A — optional fileId/saved on mapper meta + in-loop savedTotal + banner alignment; 400 verbatim stays pure; cancel untouched"
status: implementing
pending: slice-2
---

# Plan — U4 (invariant + fileId)

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1C 2E 3B 4A 5A 6A)? | B — Re-ask from 1 |
| calibration-1 | Output shape? | A — Compact card |
| calibration-2 | When understanding something? | A — Diagram |
| calibration-3 | Agent explanations? | B — Short explanation plus diagram |
| calibration-4 | Workflow? | D — SCAN → PLAN → I REVIEW → BUILD |
| calibration-5 | During implementation? | A — Step n/N, then wait |
| calibration-6 | Teach or orient? | C — Hybrid (teach only when load-bearing/new/risky) |
| option | Which option (A/B/C/Other)? | A — Option A (optional fields + accumulator + banner) |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes, load implement-fix on this file (no slice starts yet) |
| who-implements | Who implements U4 Slice 1 (hook mapper + savedTotal)? | B — Code it (agent writes after Apply, one file per turn) |
| slice-1 | Apply Slice 1 (mapper widen + suffix + savedTotal + fail-path passing)? | Applied — whole mapper replaced (inline optional fields, suffix rule, verbatim/Abort preserved) + `savedTotal` accumulator + spread passing. Awaiting user gates per H1. |

## Pending

- slice-2: Propose Slice 2 (message-test extensions) — starts only when user says continue (Slice 1 tsc + message-suite green welcome alongside).

## Decisions

- (unchanged)

## Scan

- (unchanged)

## Plan

Slice 1 — hook mapper + savedTotal + fail-path passing. STATUS: APPLIED (awaiting gates).
Slice 2 — message-test extensions (invariant/Reference/400-pure/no-body; 8 U1 untouched). STATUS: on continue.
Slice 3 — banner 2 sentences (:417 multi, :422 unaccounted). STATUS: on continue.
