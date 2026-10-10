---
skill: plan-fix
story: U4 safety invariant + Reference fileId in every failure per specs/chunked-import-failure-ux.md §4.1 (F5) + §4.5 (F6) — mapper widens, student banner aligns, 400 stays verbatim
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option A — optional fileId/saved on mapper meta + in-loop savedTotal + banner alignment; 400 verbatim stays pure; cancel untouched"
status: implementing
pending: gates
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
| slice-1 | Apply Slice 1 (mapper widen + suffix + savedTotal + fail-path passing)? | Applied — debt retired by Slice 2 green. |
| slice-2 | Apply Slice 2 (message-test extensions)? | Applied — GREEN user-reported (tsc clean, 14/14). |
| slice-3 | Apply Slice 3 (banner 2 sentences)? | Applied — multi-reason + unaccounted invariant; single-reason inherits; cancel untouched. |
| gates-chase | Close-out gate output (tsc → lint → full vitest)? | continue with no gate output pasted — Slice 3 + full-suite proof unconfirmed (banner copy is untested by any suite; tsc/lint would catch syntax, vitest catches regressions). Cannot mark Done without green or explicit waive. |

## Pending

- gates: User pastes close-out gate green/red (or explicitly waives); then close-out (TODO/README → D3 ledger, family retired).

## Decisions

- (unchanged)

## Scan

- (unchanged)

## Plan

Slice 1 — hook mapper + savedTotal. STATUS: DONE (user-reported green).
Slice 2 — message tests. STATUS: DONE (user-reported green).
Slice 3 — banner 2 sentences. STATUS: APPLIED (green unconfirmed — debt).
