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
| slice-1 | Apply Slice 1 (hook loop re-slice + new run-loop test)? | Applied — `CHUNK_MIN_SIZE = 25` + offset/size-driven loop + `chunk-halve.test.ts` (4 tests, expectation corrected to 10 calls/8 results). |
| slice-1-gates | Targeted halve tests + tsc? | RED 3/4 → expectation corrected; re-run requested but user continued without pasting. Still unconfirmed — debt carried to close-out. |
| slice-2 | Apply Slice 2 (student exact-boundary windows)? | Applied — `resultMetas` via existing `onChunkResult` + `endOfChunk` boundary merge + sorted `deadEntries` + meta-based aggregation index (old math kept as fallback). Zero hook touch. Grep confirms `STUDENT_CHUNK_SIZE` remains only as const, initial `chunkSize`, and two defensive fallbacks. Awaiting user close-out gates per H1. |

## Pending

- gates: User runs close-out gate (tsc → lint → full vitest) and pastes green/red; then close-out (TODO/README) or next (U3 70s).

## Decisions

- (unchanged: student-only slice via existing hook API; no interface/route/DB/auth change; history rejected as stale, FailedChunk widening rejected as shared-interface churn; Vercel flake parked)
- Proof: npm test; local close-out gate npx tsc --noEmit → npm run lint → npx vitest run (Vercel build parked).

## Scan

- (unchanged)

## Plan

Slice 1 — hook loop + new test. STATUS: APPLIED (green unconfirmed — debt).
Slice 2 — student windows via collected metas. STATUS: APPLIED (awaiting close-out gates).
