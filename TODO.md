# TODO — student CSV importer follow-ups

Tracked 2026-10-09 for the next session. All production incidents are closed
(504 timeout, 23505 duplicate key, silent cross-term loss); 298 tests / 22 files
green (C3 S2 done 2026-10-10, +10). What remains is reporting polish and containment — nothing is on fire.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run`
(baseline 280/20) → `npm run build`.

Context: `specs/README.md` ("Next Session — Start Here" + status table),
`.opencode/skills/plan-fix/runs/20261009-1743-student-import-c1.md` (defect ledger).

## NEXT (do first)

- [ ] **C3 S3 — Unassigned panel polish** (`specs/student-import-stepper.md` §3.4, §8).
  S2 shipped the grid; the Unassigned panel renders whenever rows carry a blank or
  unresolvable `department code`, but it is an ordinary panel today. §8's
  "Invalid-list volume" row is the concrete work: 10 panels × hundreds of blocked
  rows each need an **aggregate roll-up above the grid**, and the unresolved count
  per panel wants a footnote. Scope it with /plan-fix first — §3.4's lazy-creation
  timing and the roll-up placement are both still open. Then S4 (`userMap` merge
  across panels).

## Queued (proposed order — reorder freely)

- [x] **C3 S2 — department grid + panels done 2026-10-10** (`specs/student-import-stepper.md` §3, §5).
  Pure `department-panels.ts` (`buildDepartmentPanels` groups ROWS by §3.2
  `rowDept`, omits empty departments, code-ascending with Unassigned last) + 10
  tests · one `useChunkedImport` instance driven per panel — `activePanelId` IS
  the §3.1 global running guard, greying every Run button and dimming the preview
  table · `panelResults`/`panelLedgers`/`panelErrors` keyed by `panel.id`, so
  partial completion is a first-class state · **`assertLedgerClosure` is now
  PER PANEL** (whole-file would fire on every partial run) · ledger download is
  the union of panels that ran, merged on source row · `StepPanel` reused
  unchanged from `FacultyImportStepper`; `StepperTrace` deliberately unused.
  No server change. Gates green USER-REPORTED. Run file:
  `.opencode/skills/plan-fix/runs/20261010-2132-c3-s2-department-panels.md`.
  Side-effects to know: the one-click "Import N Rows" button is GONE (per-panel
  control was the point), a panel's blocked rows no longer disable sibling
  panels, and cross-department duplicates now read `ALREADY_PERSISTED` rather
  than `DUPLICATE_IN_FILE` because the server dedupes per request.

- [x] **U2–U4 family done** (`specs/chunked-import-failure-ux.md`). S1 (504→fail-fast)
  2026-10-10 · U2b (halve-once + persist + student exact boundaries) 2026-10-10 ·
  U3 (70s default) 2026-10-10 · U4 (invariant + `Reference: {fileId}`, 400 verbatim
  pure, cancel untouched) 2026-10-10. Greens user-reported (S1 waived, retro-covered).
- [x] **D3 — ledger done 2026-10-10** (`specs/student-import-stepper/ledger-reason-codes.md`).
  Shared 17-code vocabulary + `escapeCsvCell` + `reasonRemarks` in `lib/csv-utils.ts` ·
  server stamps `reasonCode` at all 9 reject sites + joins `alreadyPersisted` by the
  repo's own key + `DUPLICATE_IN_FILE` · pure builder `import-ledger.ts` (offset windows,
  dept flags UNRESOLVED + MISMATCH) + 25 ledger tests · component wired: one
  `student-import-ledger.csv` replaces three downloads, closure assert replaces the
  unaccounted arithmetic, removed rows carry their reason · legend + 4 blocking badges
  red · server's dead `successCsv`/`failureCsv` removed. Greens USER-REPORTED (agent
  never runs CLI per H1). Run file:
  `.opencode/skills/plan-fix/runs/20261010-1600-d3-ledger.md`.
- [x] **D6 — surface `inserted` done 2026-10-10** (`specs/student-import-stepper.md`).
  `StudentImportResult.inserted` returned (captured from `addEnrollments`, 0 on the
  early path) + client `ImportResult.inserted` summed with `?? 0` + tile relabel
  "Enrollments Resolved" (number unchanged) + summary line "resolved · newly
  written · skipped (already enrolled)" + 2 service tests (re-run enrolled 1 /
  inserted 0; fresh 1/1). Route untouched. Greens USER-REPORTED (gates for S1 rode
  unpaid — covered only if the close-out run is pasted). Run file:
  `.opencode/skills/plan-fix/runs/20261010-1115-d6-inserted.md`.
- [x] **C3 S1 — department grouping done 2026-10-10** (`specs/student-import-stepper.md` §3.3).
  Pure `department-grouping.ts` + 6 tests (first-instance-in-file-order wins,
  strict null → Unassigned, case-insensitive) · wiring via `useMemo` over
  `previewRows` (derived, edit-proof) · payload sends the STUDENT's department so
  the server's first-to-arrive map is degenerate by construction; the row's own
  code stays on `resolvedDepartmentId` for S2's panels. Data layer only — nothing
  renders it yet (that's S2). This slice also surfaced and fixed D6's latent
  block-scoped `inserted` bug (TS18004 + 30 red tests; hoisted `let inserted = 0`).
  Gates USER-REPORTED green. Run file:
  `.opencode/skills/plan-fix/runs/20261010-1300-c3-s1-department-grouping.md`.
- [ ] **Cleanup — deferred course payload**. Trim unconsumed `departmentCourses`
  from `/api/import/students/reference` in its own pass; confirm no other consumer
  (`BulkSectionImport.tsx` keeps separate state — do not touch). NOTE: the student
  ledger's `DEPARTMENT_MISMATCH` flag now consumes this dataset (D3, 2026-10-10) —
  do not trim until the ledger no longer reads it.

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
- [x] **U4 — invariant + `fileId` done 2026-10-10** (`specs/chunked-import-failure-ux.md` §4.1 + §4.5).
  Optional `fileId`/`saved` on mapper meta + in-loop `savedTotal` + suffix on
  mapper-authored branches (verbatim pure, Abort bare) + 6 message tests + 2 banner
  sentences aligned. Gates green USER-REPORTED (agent never runs CLI per H1).
  Run file: `.opencode/skills/plan-fix/runs/20261010-1500-u4-invariant-fileid.md`.
