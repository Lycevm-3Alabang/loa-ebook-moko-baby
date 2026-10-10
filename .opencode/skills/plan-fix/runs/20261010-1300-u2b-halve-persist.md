---
skill: plan-fix
story: U2b halve-once on 504 + persist-smaller + student fixed-stride follow-through per specs/chunked-import-failure-ux.md §4.3 (F3) — hook + BulkStudentImport only, faculty Step 7 out
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "C", 2: "E", 3: "B", 4: "A", 5: "A", 6: "A"}
workflow: "A"
decision: "Option A — loop re-slices remainder by offset with meta recompute; student windows derive from meta, not the constant"
status: done
pending: none
---

# Plan — U2b (S3/S4)

## Progress

| id | question | answer |
|----|----------|--------|
| calibration-pre | Use last calibration (1C 2E 3B 4A 5A 6A)? | A — Use it |
| visual | Approve the visual proposal (Option A: offset re-slice + meta recompute)? | A — Approve (Option A) |
| plan-done | Is this plan done? | A — Done |
| handoff | Run implement-fix with it? | A — Yes, load implement-fix on this file (no slice starts yet) |
| who-implements | Who implements U2b Slice 1 (hook loop re-slice)? | B — Code it (agent writes after Apply, one file per turn) |
| slice-1 | Apply Slice 1 (hook loop re-slice + new run-loop test)? | Applied — `CHUNK_MIN_SIZE = 25` + offset/size-driven loop + `chunk-halve.test.ts` (4 tests, expectation corrected to 10 calls/8 results after agent's arithmetic error). |
| slice-1-gates | Targeted halve tests + tsc? | RED 3/4 → corrected → re-run requested, user continued without pasting (debt). |
| slice-2 | Apply Slice 2 (student exact-boundary windows)? | Applied — `resultMetas` + `endOfChunk` + sorted `deadEntries` + meta-based aggregation. Zero hook touch. |
| gates-chase | Close-out gate output? | continue with no output — proof entirely unconfirmed. |
| gates-report | Gates green or waive? | B-reported-green: "green, i've tested" — full close-out gate (tsc → lint → vitest) USER-REPORTED green. Agent never runs CLI per H1. Retro-covers S1's tests too. |
| close-out | Mark U2b Done in TODO.md + specs/README.md? | Applied — TODO NEXT → U3 (70s), remainder + Done rows updated; README U2b row added, counts 293/22 user-reported green, Next-slice → U3. S1 debt retired by this green. |

## Pending

- none

## Decisions

- (scope/invariants/layering/proof as previously recorded; proof now user-reported green 2026-10-10 for the full gate incl. 4 halve + 1 S1 + 8 U1 tests)
- close-out honest: agent-verified nothing (H1); all greens are user-reported, recorded as such in TODO + README + here.

## Scan

- (as recorded)

## Plan

Slice 1 — hook loop + new test. STATUS: DONE (user-reported green).
Slice 2 — student windows via collected metas. STATUS: DONE (user-reported green).
Next: U3 (70s one-liner) → U4 (invariant + Reference: fileId). Vercel font flake still parked separately.
