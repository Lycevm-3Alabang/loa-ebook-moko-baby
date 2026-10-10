# TODO — student CSV importer follow-ups

Tracked 2026-10-09 for the next session. All production incidents are closed
(504 timeout, 23505 duplicate key, silent cross-term loss); 288 tests / 21 files
green (U1 done 2026-10-10, +8). What remains is reporting polish and containment — nothing is on fire.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run`
(baseline 280/20) → `npm run build`.

Context: `specs/README.md` ("Next Session — Start Here" + status table),
`.opencode/skills/plan-fix/runs/20261009-1743-student-import-c1.md` (defect ledger).

## NEXT (do first)

- [ ] **U4 — invariant + `fileId` in every failure** (`specs/chunked-import-failure-ux.md` §4.1 + §4.5).
  Widen `getChunkFailureMessage` meta to carry `fileId` (+ `{saved}` source — recommend
  run-total from hook history/results); every 5xx gains "Nothing was lost — {saved} rows
  already saved. Press Import to resume." + `Reference: {fileId}`; align the student
  systematic-failure banner copy. U3 done 2026-10-10 (user-reported green).
  After: D3 (ledger) → D6 (`inserted`) → C3 S1–S4.

## Queued (proposed order — reorder freely)

- [ ] **U2–U4 remainder** (`specs/chunked-import-failure-ux.md`). S1 (504→fail-fast)
  done 2026-10-10 (retro-covered by greens below). U2b (halve-once + persist +
  student exact boundaries) done 2026-10-10 (user-reported green). U3 (70s default)
  done 2026-10-10 (user-reported green, 294/294).
  Remains: `fileId` reference + safety invariant in every failure (U4).
- [ ] **D3 — ledger** (`specs/student-import-stepper/ledger-reason-codes.md`).
  Single CSV, reason codes, `ALREADY_PERSISTED` attribution. Largest remaining
  design; its precondition (`skippedItems` per-row attribution) already landed.
  Give in-file duplicates (`duplicateRows`, currently folded into `skipped`) their
  own ledger code here.
- [ ] **D6 — surface `inserted`**. `addEnrollments` already returns it; needs an
  `ImportResult` field plus client rendering.
- [ ] **C3 S1–S4 — department stepper** (`specs/student-import-stepper.md` §3, §5).
  S1 department grouping, computed client-side at preview, stamped onto every row
  (zero UI risk; decides the front-end shape) → S2 grid + panels → S3 Unassigned
  panel → S4 `userMap` merge. Known: 176 students span >1 department;
  first-instance-wins is accepted (§3.3). Buys containment, not correctness.
- [ ] **Cleanup — deferred course payload**. Trim unconsumed `departmentCourses`
  from `/api/import/students/reference` in its own pass; confirm no other consumer
  (`BulkSectionImport.tsx` keeps separate state — do not touch).

## Done this session (do not redo)

C1, C2, D4 (legend + summary relabel), D9 (section preview), D11 (23505 dedupe,
both layers), 504 mitigation (`STUDENT_CHUNK_SIZE` 500 → 100), inactive-semester
mismatch surfacing (`termMismatch` banner), `specs/README.md` v1.7. Full ledger in
the run file above.

- [x] **U1 — failure messages done 2026-10-10** (`specs/chunked-import-failure-ux.md` U1).
  `getChunkFailureMessage` in `useChunkedImport` + both `postChunk` typed errors +
  `lib/__tests__/chunk-failure-message.test.ts` (8 tests). Gates green.
  Run file: `.opencode/skills/plan-fix/runs/20261010-1100-u1.md`.
- [x] **Faculty dead-code removal done 2026-10-10** (follow-up to the stepper).
  Deleted dead `handleCsvImport` + orphaned chunk wiring/overlay/result panel from
  `features/admin-data/components/FacultyLoadingTab.tsx` (~230 lines). Hook + student
  caller untouched. Gates green. Same run file.
- [x] **S1 — 504 out of blind retry done 2026-10-10** (`specs/chunked-import-failure-ux.md` §4.2 U2a).
  Early-return `504→false` in `isRetryableChunkError` + new 504/503 policy test (+1 test).
  Gates WAIVED by owner — tsc/lint/vitest unconfirmed, suite unverified.
  Run file: `.opencode/skills/plan-fix/runs/20261010-1200-u2a-504-retry-split.md`.
- [x] **Lint-fix done 2026-10-10** (completes the faculty dead-code removal).
  Removed write-only `removedRows` state + 3 orphaned setter sites from
  `features/admin-data/components/FacultyLoadingTab.tsx`. Re-lint unconfirmed (waived).
- [x] **U2b — halve-once + persist done 2026-10-10** (`specs/chunked-import-failure-ux.md` §4.3).
  Offset/size-driven run loop (`CHUNK_MIN_SIZE = 25`, halve-to-floor, meta recompute)
  + new `lib/__tests__/chunk-halve.test.ts` (4 tests) + student exact-boundary windows
  (`resultMetas`/`endOfChunk`, meta-based aggregation). Zero hook-interface change.
  Gates green USER-REPORTED (agent never runs CLI per H1) — full suite incl. S1's tests.
  Run file: `.opencode/skills/plan-fix/runs/20261010-1300-u2b-halve-persist.md`.
- [x] **U3 — 70s timeout alignment done 2026-10-10** (`specs/chunked-import-failure-ux.md` §4.4).
  `CHUNK_TIMEOUT_MS = 70000` exported + default uses it + one const assert in
  `chunk-error-policy.test.ts` (+1 test). `maxDuration = 60` untouched, no callers.
  Gates green USER-REPORTED (tsc → lint → 294/294 vitest, pasted).
  Run file: `.opencode/skills/plan-fix/runs/20261010-1400-u3-timeout-70s.md`.
