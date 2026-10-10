# TODO — student CSV importer follow-ups

Tracked 2026-10-09 for the next session. All production incidents are closed
(504 timeout, 23505 duplicate key, silent cross-term loss); 288 tests / 21 files
green (U1 done 2026-10-10, +8). What remains is reporting polish and containment — nothing is on fire.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run`
(baseline 280/20) → `npm run build`.

Context: `specs/README.md` ("Next Session — Start Here" + status table),
`.opencode/skills/plan-fix/runs/20261009-1743-student-import-c1.md` (defect ledger).

## NEXT (do first)

- [ ] **U2–U4** (`specs/chunked-import-failure-ux.md`). Natural continuation of U1
  (same hook + spec): retry split, 70s alignment, invariant + `fileId`.

## Queued (proposed order — reorder freely)

- [ ] **U2–U4** (`specs/chunked-import-failure-ux.md`). Retry split (504 halves the
  chunk instead of blind retry), client timeout 120s → 70s, `fileId` reference in
  every failure. Same hook and spec as U1 — natural continuation.
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
