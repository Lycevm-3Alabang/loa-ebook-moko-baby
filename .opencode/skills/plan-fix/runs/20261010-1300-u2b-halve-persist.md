---
skill: plan-fix
story: U2b halve-once on 504 + persist-smaller + student fixed-stride follow-through per specs/chunked-import-failure-ux.md §4.3 (F3) — hook + BulkStudentImport only, faculty Step 7 out
repo: D:/loa/e-consultation-worktrees/regie-worktree
calibration: {1: "C", 2: "E", 3: "B", 4: "A", 5: "A", 6: "A"}
workflow: "A"
decision: "Option A — loop re-slices remainder by offset with meta recompute; student windows derive from meta, not the constant"
status: implementing
pending: gates
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
| slice-1 | Apply Slice 1 (hook loop re-slice + new run-loop test)? | Applied — `CHUNK_MIN_SIZE = 25` + offset/size-driven loop + `chunk-halve.test.ts` (4 tests). |
| slice-1-gates | Targeted halve tests + tsc? | RED 3/4 first run — agent's expectation arithmetic wrong (wrote 9 calls, loop correctly made 10). |
| slice-1-fix | Apply test-expectation correction (10 calls, 8 results)? | Applied — "halves again" now expects `[100, 50, 25×8]` + `results` length 8. Hook untouched. Awaiting user re-run per H1. |

## Pending

- gates: User re-runs targeted halve tests (+ tsc) and pastes green/red; then continue → Slice 2 (student windows) proposal.

## Decisions

- (unchanged: scope = hook loop + its test, then student windows; no U3/U4/faculty; Vercel flake parked; invariants all n/a; proof = npm test + local tsc/lint/vitest gates)

## Scan

- (unchanged: entry :347-352 halve-safe; loop rewritten offset/size-driven; consumers :354-371 fixed-stride → Slice 2)

## Plan

Slice 1 — hook loop + new test. STATUS: APPLIED + expectation corrected (awaiting green re-run).
Slice 2 — student windows (BulkStudentImport.tsx:354-371). STATUS: on continue (after Slice 1 green).
