---
skill: plan-fix
story: U4 safety invariant + Reference fileId in every failure per specs/chunked-import-failure-ux.md §4.1 (F5) + §4.5 (F6) — mapper widens, student banner aligns, 400 stays verbatim
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "A", 2: "A", 3: "B", 4: "D", 5: "A", 6: "C"}
workflow: "D"
decision: "Option A — optional fileId/saved on mapper meta + in-loop savedTotal + banner alignment; 400 verbatim stays pure; cancel untouched"
status: done
pending: none
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
| slice-3 | Apply Slice 3 (banner 2 sentences)? | Applied — multi-reason + unaccounted invariant. |
| gates | Close-out gate (tsc → lint → full vitest)? | continue with no output → asked gates-or-waive → B-reported-green ("B -> green"): full gate USER-REPORTED green. Wording proof remains owner review (no suite asserts banner strings — stated at chase). |
| close-out | Mark U4 Done in TODO.md + specs/README.md? | Applied — TODO NEXT → D3 ledger, family checked, U4 Done row; README U4 row added, counts 300/22 green, Next-slice → D3. Family chunked-import-failure-ux.md COMPLETE (U1→U4). |

## Pending

- none

## Decisions

- (as recorded; proof now user-reported green 2026-10-10, 300/300; agent-verified nothing per H1; banner wording on owner review as stated)

## Scan

- (as recorded)

## Plan

Slice 1 — hook mapper + savedTotal. STATUS: DONE (user-reported green).
Slice 2 — message tests (6 new + 8 legacy). STATUS: DONE (user-reported green).
Slice 3 — banner 2 sentences. STATUS: DONE (user-reported green).
Next: D3 ledger (largest remaining design, unblocked) → D6 → C3. Vercel font flake still parked separately.
