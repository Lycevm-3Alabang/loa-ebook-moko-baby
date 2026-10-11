# TODO — student CSV importer follow-ups

Tracked 2026-10-09 for the next session. All production incidents are closed
(504 timeout, 23505 duplicate key, silent cross-term loss); 329 tests / 26 files
green (echo + meta + enriched tests done 2026-10-10, +3). What remains is reporting polish and containment — nothing is on fire.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run`
(baseline 280/20) → `npm run build`.

Context: `specs/README.md` ("Next Session — Start Here" + status table),
`.opencode/skills/plan-fix/runs/20261009-1743-student-import-c1.md` (defect ledger).

## NEXT (do first)

- [x] **C3 S4 — `userMap` merge done 2026-10-10** (`specs/student-import-stepper.md` §8, first row).
  Last C3 item. Option A as planned: merge on the already-returned `created[]`, zero
  server change — pure `apply-created-users.ts` (normalize/dedupe/no-mutate) + 6 tests +
  guarded functional-merge in `runPanel` after the result commit. Gates green USER-REPORTED.
  Run file: `20261010-2300-session.md` (planned + implemented on the same file).

- [x] **Table-first UI done 2026-10-10** (`specs/student-import-stepper/table-first-ui.md`, new spec).
  Panels slimmed to an execution strip (`StepPanel` reused untouched, `invalid={[]}`, status
  dots via pure `panel-strip-status.ts` + 6 tests); the table is the work surface (dept filter
  + Errors-only shortcut + Remove-shown, all view-only — runs still send whole panels); row
  handlers re-keyed on source row (positional indexes lied under any filter); email editable
  with regroup + edit-flash. One component touched (`BulkStudentImport.tsx`) + 2 helpers +
  2 test files. Gates green USER-REPORTED; **browser green USER-REPORTED 2026-10-10**
  (strip dots, view-links + focus, email-edit regroup, run-after-filter whole-panel proof).

- [x] **Table-first follow-ups done 2026-10-10** (slices 5–7, 6, A–C, same run file).
  Slice 5: `View rows` lands on All, toggle is true blocked-only (`blockedOnly`
  rename, dead memo out) · slice 6: preview search (loaded rows only, composes in-view)
  + issue-type dropdown (`issue-filter.ts` + 4 tests) · slice 7: toolbar + tally moved
  above the preview table (pure JSX move, h4/chip stay on top) · A: blocked-rows CSV
  download (`blocked-row-export.ts` + 4 tests, ledger vocabulary) · B: view-rows focus
  (`tabIndex` + `focus({preventScroll:true})`, single lookup) · C: main ENROLLMENT TABLE
  collapsible (`EnrollmentsTab`, default open, Importer pattern verbatim).
  Gates + browser green USER-REPORTED.

- [x] **Badges + strip follow-ups done 2026-10-10** (slice 8 + amendments, same run file).
  Table badges collapsed to Ready / Needs Review / Duplicate (3-cap, display-only,
  reason titles); strip chips carry counts and are the auto-filters (dept-pinned
  via `resolvedDepartmentId`, + scroll); `has-issues`/`no-issues` metas + `dupOnly`
  dimension close the no-issues gap (invalid-value-only precision case tested);
  new-student exits the issue family (insert candidate; finder key stays); `View rows`
  lands on All, toggle is true blocked-only, Errors-only respects dept, chip splits
  open/clear (+ Issue twin); strip `View/Remote N blocked` pair names the deletable set;
  staleness banner + panel/table unpersisted downloads + Clear-filters ×5.
  Gates + browser green USER-REPORTED.

- [x] **Semester + message hardening done 2026-10-10** (slices 10, S-a, S-b).
  Nav pill with active title above Main Menu (reuses Sidebar's fetch, expanded only;
  per-table badges dropped as decoration) · closure failure now prints the per-status
  breakdown + assert text instead of reading like data loss · semester echo
  (`semesterId` required, route attaches title) + mid-run flip alarm with unanimity
  check + 2 echo tests. Already-persisted confirmed semester-keyed (no gap).
  Gates + browser green USER-REPORTED.

- [x] **Import dedicated page done 2026-10-10** (`specs/student-import-stepper/import-dedicated-page.md`).
  `StudentImportPage` (semester self-fetch + banner + back-link) + admin/dean wrappers
  (no `loading.tsx` — neither tree has one); `EnrollmentsTab` trimmed (collapsible out,
  role-aware link card in via pathname).
  Gates + browser green USER-REPORTED (both roles, round trip).

- [x] **Quick-Add modal done 2026-10-10** (slice Q, same run file).
  Collapsible replaced by a primary trigger button; form moved verbatim into a modal
  copying the file's own subjects-modal shell; `handleQuickAdd` untouched (close +
  refetch). Gates + browser green USER-REPORTED.

- [ ] **VERIFY (no code) — S2 + S3 browser pass.** Both slices are gate-green but have
  never been rendered. Cheapest to close while they are fresh:
  - **S2:** run one panel, confirm the **preview table survives its own run** (this is the
    deleted `setPreviewRows(null)` — invisible to tsc/lint/vitest/build), and that the
    ledger download covers exactly the panels that ran.
- **S3:** §3.4's Unassigned panel has **never rendered** — the 2026-1 file has zero
  unresolvable codes (its ten department counts sum to exactly 28,096). Author a CSV
  with one `department code` = `ZZZ`, one blank, and two blank emails; that exercises
  the roll-up, the unresolved footnote, and both remove verbs.

- [ ] **Run gate vs Needs Review (observed 2026-10-10, `/admin/data/student-import`).**
  Each panel's Run reads disabled whenever Needs Review ≠ 0. Two readings, different fixes:
  (a) correct behavior — every such panel also holds blocked rows, or no active semester
  is set (the gate is `!semesterId || blockedCount > 0`; amber-only panels are runnable
  by design, flagged rows importing with a note) → no code change, close with a comment;
  (b) gate overreach — amber-only panels are observed disabled → narrow `disabled` to
  blocked-only AND surface the reason inline (today it's a tooltip only, effectively
  invisible). First check on sighting: red "No active semester" note present? blocked
  rows in those panels, or amber only?

- [ ] **PROOF — F1 invalid-details modal (no new code).** Produce one Step 6 conflict
  (two faculties, one slot): modal table names subject, section, requested and holder;
  overlay-click + X dismiss; inline invalid lists unchanged; Step 2 volume table renders.
- [ ] **PROOF — drift alarm live fire (staging/scratch file only).** Flip the active
  semester mid-panel-run: expect the mid-run message naming both terms with the ledger
  still committed. No gate covers this path — only a live flip proves it.

## Queued (proposed order — reorder freely)

- [x] **C3 S3 — Unassigned panel polish done 2026-10-10** (`specs/student-import-stepper.md` §3.4, §8).
  Option C, all four parts: **the fixture first** — `studentImport.test.ts` now asserts
  §3.4 decision (b) directly (unresolvable department still enrolls, user created with
  `departmentId: null`) plus the `r.departmentId ?? departmentId ?? null` fallback
  direction; that decision had **zero** coverage and tightening the validation would
  have passed every gate while silently dropping enrollments · `DepartmentPanel` gains
  `unresolvedCount` + `blankDeptCount` (blank vs typo are different admin mistakes and
  the ledger already distinguishes them) · §8 roll-up above the grid, informational only
  · `removeBlockedRows(target)` serves both verbs — per-panel and a relabelled
  `Remove all N blocked` inside the roll-up. §3.4's ambiguous "lazily on first run" is
  now a **pinned contract** (`no Unassigned panel when every row resolves`), not a
  reading; no production behaviour changed for it. Gates green USER-REPORTED (304/22 after
  a TS2345 fix); **browser unconfirmed**. Run file:
  `.opencode/skills/plan-fix/runs/20261010-2155-c3-s3-unassigned-polish.md`.

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
  (`BulkSectionImport.tsx` keeps separate state — do not touch). NOTE (re-confirmed
  BLOCKED 2026-10-10 by sweep): the ledger's `DEPARTMENT_MISMATCH` flag consumes this
  dataset via `sectionDeptCode` — a tested path (`import-ledger.test.ts:186-190`), so
  trimming now would silently kill mismatch detection. Unblocks only via explicit
  product call (drop MISMATCH) or server-side ownership resolution.

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
