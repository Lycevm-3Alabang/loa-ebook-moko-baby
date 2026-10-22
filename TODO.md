# TODO — open follow-ups

Two threads: the **student CSV importer** (tracked 2026-10-09 — all production incidents are closed:
504 timeout, 23505 duplicate key, silent cross-term loss) and the **evaluation results surfaces**
(the results endpoint's performance, the attribution gaps). What remains is reporting polish,
containment and the evaluation gaps — nothing is on fire.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run`
(baseline 65 test files, 2026-10-22 — the case count is the owner's run) → `npm run build`.

Context: `specs/README.md` ("Next Session — Start Here" + status table),
`.opencode/skills/plan-fix/runs/20261009-1743-student-import-c1.md` (defect ledger),
`docs/evaluation-export-handover.md` (the Excel export's handover — **current**; one per
session, or none),
`specs/evaluation-results-cache.md` (the cache contract),
`specs/evaluation-results-attribution.md` (the attribution contract — §1.10, §3.21, S6.1, D7–D9),
`specs/evaluation-results-export.md` (the export contract — the Excel workbook, 2026-10-22).

## NEXT (do first)

- [x] **The Excel export — the workbook is GENERATED from scratch, and the routes serve it. Done
  2026-10-22 (the Excel proof is the owner's).**
  Contract: **`specs/evaluation-results-export.md` (v4.0)** — the three sheets' shapes, the field
  contract, the arithmetic, the routes and the proofs. Entry point:
  **`docs/evaluation-export-handover.md`** — where the work stands, what changed for the school,
  what is deferred and what not to redo.
  ⭐ **What shipped:** the workbook is **generated** — `lib/xlsx/` (the style table, the writer, the
  form model and one renderer per sheet) — and the three export routes (admin, dean, the faculty's
  own) build from it. The donor (`lib/evaluation-form-xlsx.ts`) is **deleted**, `lib/xlsx-template.ts`
  is pruned to the cut script's users, and the template is the **reference only**: nothing reads it
  at runtime, and only the **letterhead** is traced.
  ⭐ **The defects it fixed:** the Comments sheet shows the **text** (the donor wrote it into a cell
  the `A:I` merge swallowed — the *"it only shows the date"*), and the Overall sheet is **one row
  per student response**, with the **live rubric's** columns and the live values under them.
  ⭐ **The response order is total** — the read orders by (`createdAt`, `id`), so two exports of
  the same data print the same rows in the same order.
  ⭐ **The rubric is data**: the form's layout, the numbering and the Overall's columns all follow
  it, so a rubric that gains a statement simply makes a longer form — there is nothing to drift.
  ⭐ **Still open (not this export):** the **Excel proof** (the owner's: open the workbook and print
  it) · the **legend** (the rating ladder must become data in `lib/evaluation-utils.ts` — it is
  duplicated in three places) · the **HTML preview** · the **PDF**'s four defects · the
  subject-page routes onto the shared read (so the page and the export agree by construction).

- [x] **The evaluation results endpoint — the direct connection is gone; the figures are read per
  department and per faculty, and cached. Done 2026-10-21.**
  **Read `specs/evaluation-results-cache.md` and `specs/evaluation-results-attribution.md` first** —
  they have the shape, the rules, the cache and what is still open. **The endpoint no longer needs `DATABASE_URL`:** the aggregate
  (a group-by in Postgres over a direct connection) could never run here — the connection string
  comes from the Supabase dashboard, which this environment cannot reach, so the route answered
  **500**. The figures are now read **per department** through the app's own repositories
  (`listDepartmentFigures`), **cached for five minutes** (`figure-cache.ts`), and the page fills a
  row as its numbers arrive (skeletons per cell) instead of waiting for one big answer.
  ⭐ The export is a **download**: it carries `maxDuration = 60` and the button shows a loader; the
  drill-down stays **live, on demand** (rule 3 of `specs/evaluation-results-cache.md`).
  ⭐ **The report dashboard migrated the same day (2026-10-21)** — it reads **per faculty**
  (`listFacultyFigures`, cached five minutes), and the department's row is the **pool** of its
  faculty's figures, so the two grains come from one read over the rows. **No surface in the app
  opens a direct connection any more**: `lib/db/postgres.ts`, the aggregate module and their tests
  are deleted. `pg` and `DATABASE_URL=` stay in the repo for `scripts/apply-schema.mjs` only.

- [x] **The report dashboard is no longer on the direct connection. Done 2026-10-21.**
  Where: `features/evaluations/evaluation-report.service.ts` — the 8 call sites to
  `listLiveFacultyResults` / `listLiveDeptAverages` are gone. The service now reads the faculty's
  figures from the cache and pools the department's row from their totals
  (`poolCategoryTotals` → `computeCategoryAveragesFromTotals`), which is why the read carries the
  per-category **(sum, count)**: a mean cannot be un-meaned.
  ⭐ The three functions with **no live caller** (`getAdminEvalReportData`, `getDeanDashboardData`,
  `getAdminDashboardData` — the admin report page and the dean/admin dashboard blocks render
  hardcoded preview data) were **deleted**, not migrated; their pages keep their preview and lose
  the stale "LIVE-DATA (swap back)" hooks.
  Deleted with them: `lib/db/postgres.ts`, `features/evaluation-results/evaluation-aggregates.ts`,
  `lib/__tests__/evaluation-aggregates.test.ts` (11 cases), `lib/__tests__/evaluation-results-live-faculty.test.ts`
  (4 cases), `listLiveDeptAverages`, `listLiveFacultyResults` (+ `LiveDeptAverage` / `LiveFacultyResult`),
  `buildLiveDeptAveragesFromTotals` (+ `FacultyDeptTotals`), `@types/pg` from `package.json`.
  ⚠️ `pg` and `DATABASE_URL=` **stay**: `scripts/apply-schema.mjs` (the manual schema runner) needs both.

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

- [ ] **CLEANUP (decide) — the "Department Summary" card is written twice.** Where: the
  department drill-down's header card is inlined in **both** pages —
  `app/admin/evaluations/results/[departmentId]/page.tsx` and the dean's twin
  `app/dean/evaluations/results/[departmentId]/page.tsx` (the same markup, the same numbers).
  Why it is open: the card's **redesign** (`specs/evaluation-results-summary-card.md`) touches
  the markup twice, and a change to one without the other shows a difference on the dean's
  page. Options: **(a)** extract it to a shared component (e.g.
  `features/evaluations/components/DepartmentSummaryCard.tsx`) — one markup, one test, both
  pages; **(b)** leave it inlined. ⭐ **Not part of the redesign** (AGENTS.md: no adjacent
  refactoring) — recorded here, to be decided on its own.

## Open — three items to revisit (2026-10-20)

Tracked 2026-10-20 after the faculty-count unification
(`.opencode/skills/plan-fix/runs/20261020-2230-faculty-count-one-number.md`;
the rule is `specs/evaluation-results-attribution.md` contract §3.14 — a
department's faculty count is the number of faculty accounts homed in it,
counted once, read by every surface from one helper) and the attribution
change (contract §3.1 — a subject counts under the **teacher's home**
department; the section's department is no longer a fallback). All three are
**decisions or checks, not defects**, and no decision is taken yet.

- [ ] **The "Unresolved" pseudo-row's "Faculties" cell.**
  Where: `features/evaluations/components/CoveragePage.tsx:154-172` — the row is
  built client-side, and the cell is line 165
  (`facultyCount: new Set(unassigned.map((x) => x.facultyName)).size`).
  What it is: the subjects whose department resolves to **nothing** are
  collected into a synthetic row named "Unresolved" (`__unknown__`) and shown
  next to the real departments, so that coverage is not silently dropped.
  **What it means now (2026-10-20):** the home is the only rule, so this group
  is exactly the **home-less teachers' subjects** — the people with no
  `users.departmentId` (the CSV-unmatched population). Their coverage is
  reported here and in the results list's integrity warning, and in no
  department's row.
  Why it is open: the column now means "the faculty homed in this department"
  everywhere else (contract §3.14). A pseudo-department has nobody homed in it,
  so its headcount is **0** by definition — but the cell prints a
  teaching-roster number, and it counts distinct teacher **names**, so two
  different teachers with the same name collapse into one.
  Options: **(a)** `0` / "—" (honest: no headcount for a group that is not a
  department); **(b)** count distinct `facultyId` instead of names (one-word
  fix, keeps the roster meaning, still not a headcount); **(c)** leave it.
  Known: the row is already excluded from the KPI (`:207`); the "Unresolved"
  label is free (a real "Unassigned" department is a normal department) — the
  results list dropped its `__unknown__` row on 2026-10-20. The row's
  **drill-down** keeps every teacher of its subjects (it is not a department,
  so it has no membership question).

- [ ] **VERIFY (no code) — the home-less teachers on our data.** The one
  number the attribution change moved: a faculty with **no** `users.departmentId`
  is now unattributed (the coverage page's "Unresolved" group + the results
  list's integrity warning) instead of sitting in the section's department. If
  every one of our faculty carries a home department, **nothing moved** and the
  change was a no-op on our data. The SQL is in
  `docs/evaluation-surfaces-verification.md` §7 ("The home-less teachers") —
  run it once per period we care about, and read the "(no home dept)" row. The
  same check covers the placeholder buckets: a bucket now holds the teaching of
  the faculty homed in it, and nobody else's.

- [ ] **CLEANUP (decide) — the seeded dean carries only the `DEAN` role, and a dean is
  always a faculty.** Where: `supabase-schema.sql:1560` — the seeded dean (`Regie Ellana`)
  gets the `DEAN` role row **only** (and is homed in CCS at `:1568`). What it is: the
  domain fact is that **a dean is a faculty member of their own department** — the app
  already treats DEAN as faculty in the availability list
  (`app/faculty/availability/page.tsx:61`) and in bookings
  (`app/api/appointments/route.ts:59`), and the attribution contract says so
  (`specs/evaluation-results-attribution.md` §3.14: *"A `DEAN|FACULTY` account is faculty
  (it holds a FACULTY role row); a `DEAN`-only account is not"*). Why it matters now: the
  membership set is the **members** — the accounts homed in the department carrying the
  FACULTY role (`listFacultyByDepartment`) — and so is the headcount. A dean who carries
  both roles is in both; the **seeded** dean carries one, so on a fresh install that dean
  is in neither, and the dean's own guards refuse their own id (the student-breakdown
  route answers 403 for the dean's own id). Options: **(a)** give the seeded dean a
  `FACULTY` role row too (one extra insert; the owner's manual schema runner applies it);
  **(b)** leave it — the real data already carries both roles, and the seeded dean is a
  dean who does not teach. ⭐ **Deferred 2026-10-21 (owner)** — it is a **schema** edit
  (AGENTS.md H4), so it is the owner's call, and the contract is already right.

- [ ] **CLEANUP (decide) — four now-dead reads and fields. DEFERRED 2026-10-21 (owner).** The
  list grew as the gate closed:
  1. **`evaluationResultRepository.listDepartmentAssignments`** — returned a department's
     **evaluated** assignments (the attribution set). The results service now uses
     `listDepartmentTeachingAssignments` (the term's assignments) and the dean's guards read the
     **members** — so nothing calls it. It still has its own five test cases in
     `lib/__tests__/evaluation-results-department-faculty.test.ts`. Either delete it (method + the
     `IEvaluationResultRepository` entry + those cases) or keep it as a public capability for a
     future surface.
  2. ⭐ **`evaluationRepository.listSubmittedByPeriodAndEvaluatees`** — no app caller since the
     service layer moved to the shared set (2026-10-21). ⚠️ **Its tests are the proof of AGENTS.md
     Lesson 7** (the URL cap and the row cap) — deleting the read deletes the proof with it, so
     the lessons need re-anchoring on a read that stays.
  3. ⭐ **`DepartmentAggregate.totalSubjects`** — the Department Summary card was its last reader
     (the card dropped the subject count on 2026-10-21).
  4. ⭐ **`DepartmentAggregate.uniqueFaculty`** — the same card (it now prints the members'
     count through the payload, not the aggregate). ⚠️ `totalResponses` **stays** — the export's
     `summary.csv` uses it.

## Open — evaluation results gaps (2026-10-21)

- [ ] **The legend ("Interpretation of Data") — the rating ladder must become data.** (Left by the
  Excel export, 2026-10-22.) The legacy's legend is a DrawingML **textbox**, and the cut had to
  correct its wording **by hand** because it disagreed with the app's `getRemark` ("Fair" /
  "Needs improvement" against the app's "Unsatisfactory" / "Poor"). The new writer draws
  **pictures only**, so the legend becomes a **block of cells** — and to do it properly the
  ladder must stop being hard-coded inside `getRemark` (`lib/evaluation-utils.ts:57-64`) and
  become data that **both** the remark and the legend read. ⭐ The ladder is duplicated in
  **three** places (`lib/evaluation-utils.ts`, `features/evaluations/components/EvaluationDashboard.tsx`,
  `app/api/faculty/evaluation-results/route.ts`) — the legend is the chance to converge them.
  Contract: `specs/evaluation-results-export.md` §11 · the handover's §3.

Tracked 2026-10-21 after the row-cap fix
(`.opencode/skills/plan-fix/runs/20261021-0820-eval-ratings-row-cap.md`;
the rule is `specs/evaluation-results-attribution.md` contract §3.18 — a result figure is computed
over the **complete** rating set of its evaluation set, and the department drill-down's Avg Rating /
Highest Rubric / Lowest Rubric for a subject must equal the faculty page's for the same subject).

The cap was the **first** reason the two pages disagreed. These are the rest. All seven are
**decisions or fixes, not blockers** — none of them is on fire, and the suite is green.

> ⭐ **2026-10-21, later the same day — the results LIST is fixed.** The list's rating and
> sentiment aggregates are computed **in Postgres** by three plain parameterised queries
> (`features/evaluation-results/evaluation-aggregates.ts`, over the direct connection
> `lib/db/postgres.ts`), so the list route went from **~263 reads / ~220,000 rows** to
> **~7 reads / ~500 rows** (26,012 ms → three queries).
> Run file: `.opencode/skills/plan-fix/runs/20261021-0928-admin-results-endpoint-slow.md`.
> **Nothing is created in the database** — the group-by spans a to-many, which the REST API
> cannot express, so the app asks Postgres directly (AGENTS.md **Lesson 7c**). It needs
> `DATABASE_URL` (the dashboard's connection string) and the `pg` dependency.
> ⚠️ **This approach was abandoned the same day** — the connection could never be opened here, and
> the aggregate module and `lib/db/postgres.ts` are now **deleted** (see the note below).
>
> ⭐ **2026-10-21, later still — the aggregate path is GONE from the list.** The environment has no
> Supabase dashboard access, so the direct connection could never be opened and the list answered
> **500**. The list's figures are now read **per department** through the app's own repositories
> and **cached for five minutes** (`features/evaluation-results/figure-cache.ts`); the page fills a
> row as its numbers arrive. Handover: `docs/evaluation-results-handover.md` (deleted 2026-10-22 —
> folded into `docs/evaluation-export-handover.md`); contract:
> `specs/evaluation-results-cache.md`. ⭐ **The aggregate is gone from the app entirely** (the
> report was its last consumer) — see "NEXT" above. What that does to the items below: the list and the drill-down now use
> the **raw-row** path, so the `""` bucket **counts** toward Avg. Rating (the aggregate dropped it)
> — item 6 — and the list's `isDisabled` filter now lives in
> `listPeriodFigures` / `listDepartmentFigures` (item 1).

- [x] **The `isDisabled` filter was missing on the results drill-down and on the faculty page —
  DONE 2026-10-21 (option b).**
  Where: the results **list** filters it — `features/evaluation-results/evaluation-results.repository.ts:154`
  (the period's spine) and `:417` (a department's figures), both `.eq("isDisabled", false)` — but the
  drill-down (`features/evaluation-results/evaluation-results.service.ts` →
  `features/evaluations/evaluations.repository.ts:462` `listSubmittedByPeriodAndEvaluatees`) and the
  faculty page (`app/api/faculty/evaluation-results/subjects/[facultySubjectId]/route.ts:63` →
  `evaluations.repository.ts` `listSubmittedByPeriodAndEvaluateeAndFS`) do **not**.
  What it is: `isDisabled` is the soft-invalidation flag on an evaluation — "this response does not
  count". Four paths set it. **Two of them also set `status = 'INVALID'`**
  (`invalidateById` `:407`, `invalidateByEvaluatorAndPeriod` `:414`, `invalidateByFacultySubject`
  `:471`, `invalidateByFacultySubjectAndEvaluator` `:399`) — those are excluded everywhere, because
  every surface filters `status = 'SUBMITTED'`. **Two set only the flag and leave
  `status = 'SUBMITTED'`**: `bulkDisableByPeriod` (`:351`, the admin's "Invalidate Result" button)
  and the stale-mapping path in `findPending` (`:165`, `:203` — a subject reassigned to another
  teacher, detected when a student opens their evaluation list; no admin action needed). Those two
  are still averaged into the drill-down's and the faculty page's figures while the list's card for
  the same department says something else.
  Why it is open: it needs a decision on **which is the truth** — a disabled evaluation excluded
  from every figure (the list's rule) or counted everywhere (the drill-down's rule). The list is
  right on intent: "Invalidate Result" is an admin saying *this must not count*.
  Options: **(a)** add `.eq("isDisabled", false)` to every result read (one filter per method;
  the faculty page and the drill-down follow the list); **(b)** make the two flag-only paths also
  set `status = 'INVALID'` — one write each, and the flag then means "was invalidated" rather than
  "does not count"; **(c)** leave it and document the difference. **(b) is one line per path and
  fixes every surface at once — but it changes what the *Invalidated* page lists** (it currently
  lists the flag-only rows, and `listDisabled` reads `isDisabled = true`, so they stay listed either
  way). Note: the coverage page already treats a disabled submission as **Disputed**
  (`features/evaluations/evaluation-status.service.ts:115-116`), so today a response can be
  *disputed* on one page and *counted* on another.
  ⭐ **What landed (option b):** the two flag-only writers — `bulkDisableByPeriod` (the admin's
  "Invalidate Result") and the stale-mapping path in `findPending` — now write
  `{ isDisabled: true, status: "INVALID" }` too, so every surface's existing
  `status = 'SUBMITTED'` filter excludes them. `restoreByIds` came with it: it cleared only the
  flag, so an invalidated row stayed out of every figure even after the admin restored it (a
  pre-existing half-bug for the four `invalidate*` paths, which this would have extended to the
  bulk path) — it now restores `SUBMITTED` for a row with a `submittedAt` and `DRAFT` for one
  without (it was never a response). The "Invalidated" page still lists them (`listDisabled` reads
  `isDisabled = true`) ✔. Tests: `lib/__tests__/evaluations-repository-writes.test.ts` (new — the
  write methods had none) and the coverage page's disputed bucket ✔.

- [x] **The admin drill-down's membership gate was stricter than the faculty page's — DECIDED
  2026-10-21 (D′), BUILT 2026-10-21.**
  Where: the department page keeps an evaluation only if its `facultySubjectId` is in the
  department's **term assignments** (`features/evaluation-results/evaluation-results.service.ts:190`
  — `memberIds.has(e.facultySubjectId)`) — and that list is **semester-scoped**
  (`features/evaluation-results/evaluation-results.repository.ts:625` →
  `loadSemesterAssignments` → `.eq("semesterId", period.semesterId)`) and **home-department-scoped**
  (`evaluation-results.service.ts:168-170`). The faculty page filters only
  `evaluateeId + facultySubjectId + status` (`route.ts:63`).
  ⭐ **The decision (owner, 2026-10-21):** *given a department is selected · when all faculties
  belonging to it are fetched · then it should only take into account evaluations that are accounted
  for the current evaluation period only.* So **the period scopes the responses** — and the rule is
  **not** a second scope: `evaluations.evaluation_period_id` is the strict gate, the period's **parent
  semester** (`evaluation_periods.semesterId`, free — `service.ts:151` loads it in the same call)
  scopes the **subject list** only, and the assignment's `faculty_subjects.semesterId` is the
  **teaching's** stamp and is **not** a response filter. The defect is that the department page used
  the **subject list's** scope as a **response** filter — so it, and **both export CSVs** (they share
  its read), under-report against the results list, one click apart and in the file you send.
  The **contract** is `specs/evaluation-results-attribution.md` §3.21 (**D7 RESOLVED**), the slice is
  §4 **S6.1**, and the open items are §7 **D8** (the legacy NULL `evaluation_period_id` rows) and
  **D9** (the subject page's missing department guard).
  ⭐ **Capture before the slice** — the department page's figure is *computed*, so the "before" is
  gone once it changes: department `b0000000-…0001` / period `5a01886e-…bb59`, the department
  route's `departmentAggregate.avgRating` + `totalResponses` (**before**) against the figures
  route's `avgRating` + `totalRespondents` (**after**, already on screen). If the two averages are
  equal, the gap is zero there and the slice is insurance rather than a fix.
  The working note was `docs/evaluation-results-handover.md` §2 (deleted 2026-10-22 — folded into
  `docs/evaluation-export-handover.md`); the run file is
  `.opencode/skills/plan-fix/runs/20261021-1800-open-gaps.md`.
  ⭐ **What landed (five steps, one commit each):** **(1)** the response set is decided in **one**
  read — `listDepartmentResponseSet` (the members, the period's submitted and enabled evaluations,
  the live-eval rule) — and the members come from `listFacultyByDepartment` (the role *and* the
  department are both filters in the query, so the department's students never cross the wire);
  **(2)** the service reads that set, and the subject list is the members' teaching this term
  **∪** the assignments the counted responses point at; **(3)** the dean's guards read the
  **members** (the governable set widens) and **D9 is closed** — both `groups/[facultySubjectId]`
  routes check the department; **(4)** the results list's `offSemester` banner is retired (the
  coverage page keeps its own); **(5)** the surfaces show the ratings, not the counts, and every
  department is a row. The contract is **v1.14**.
  ⚠️ **The number moved:** the department page's average and **both export CSVs** now sit on the
  results list's figure — that is the point of the slice. The **capture was never taken** (the code
  landed first), so the release note says *"the drill-down now equals the results list"* rather
  than quantifying the movement. ⭐ **Still open from this item:** §7 **D8** (the legacy NULL
  `evaluation_period_id` rows) — a data condition, not a rule.

- [x] **The drill-down's rating read — decided 2026-10-21: it stays LIVE, on demand.**
  `getDepartmentSubjectResults` (`features/evaluation-results/evaluation-results.service.ts`) reads
  the department's evaluations, their ratings and their comments and pools them in Node; a
  department with 2,184 responses (GENED) ships 58,968 rating rows across ~60 reads, so a
  drill-down takes 2-4 s. The aggregate that could have replaced that read **is going away** (no
  dashboard access), so the choice is between a live read and a cached one. **Decided: live** — a
  detail page is opened for a reason and its numbers are read on demand, every time. Rule 3 of
  `specs/evaluation-results-cache.md`; the handover
  (`docs/evaluation-results-handover.md` §2 — deleted 2026-10-22, folded into
  `docs/evaluation-export-handover.md`) records the consequence: the drill-down does not
  filter `isDisabled` and is scoped to the term's assignments, so it — and the export's `summary.csv`,
  which shares its read — can differ from the results list in exactly those two cases (items 1 and
  2 below).

- [x] **The reads that were still on a cap — done 2026-10-21.** There were **four**, not three:
  the two the item named, plus the student-breakdown's **evaluations** read, which had the same
  row-cap defect as its comments read, in the same function.
  - `listSubmittedByPeriodAndFacultySubjectIds` (`features/evaluations/evaluations.repository.ts`)
    was **unchunked and unpaged** → now chunked at 100 ids and paged at 1,000, ordered by
    **`(submittedAt, id)`** — a total order (so a page boundary cannot skip or duplicate a row)
    that keeps the visible order the routes already render.
  - `listStatusByPeriodAndFacultySubjectIds` was chunked but **unpaged** — the coverage page reads
    a whole term's responses → now paged at 1,000, ordered by `id`.
  - The student-breakdown's **evaluations** read was **unpaged** → now paged at 1,000, ordered by
    `id`; its **comments** read was one unchunked `.in("evaluationId", allEvalIds)` (past ~200 ids
    the URL exceeds ~8KB → PostgREST **400** → the route's 500) → now chunked at 100 ids, the same
    size `listCommentScores` uses, so the row cap cannot bite either.
  - The **ratings** read was already safe (`fetchRatingsWithCategories` chunks at 37 evaluations =
    999 rating rows = one page).
    ⚠️ **Correction 2026-10-22:** the chunk was sized for **27** statements and the rubric has
    **34** — the read stayed correct, but every chunk spilled into a second page. Now **29**
    evaluations (29 × 34 = 986), derived from `RUBRIC_STATEMENT_COUNT`. See "Done this session".
  - Tests: `lib/__tests__/evaluations-repository-chunking.test.ts` gained the row-cap cases for
    both evaluations reads (the paging model was already in that file), and
    `lib/__tests__/evaluation-results-student-breakdown.test.ts` is new — the student-breakdown
    reads had no test at all.
  - Run file: `.opencode/skills/plan-fix/runs/20261021-1700-reads-on-a-cap.md`.

- [x] **The `""` fallback category — narrowed 2026-10-21, and the state it targeted cannot occur.**
  Where: `lib/db/common.ts` (the fallback, now named by `UNMAPPED_CATEGORY_NAME`) and
  `lib/evaluation-utils.ts` (`computeGeneralRating`).
  What it was: a rating whose `itemId` cannot be resolved to a `rubric_items` row becomes the
  category name `""`. `computeGeneralRating` averaged over **all** category names present, so the
  `""` bucket **counted toward Avg. Rating**; `mapCategoryAveragesToColumns` drops any name not in
  `CATEGORY_NAMES`, so it could **never** be a Highest or Lowest Rubric.
  ⭐ **The scan (2026-10-21) found the state is unreachable:** the foreign keys cascade all the way
  down — `rubric_groups → rubric_categories ON DELETE CASCADE` (`supabase-schema.sql:673`) →
  `rubric_items` (`:683`) → `evaluation_ratings` (`:758`) — so a rating cannot outlive its rubric
  item. The fallback is a safety net, not a state the schema allows.
  ⭐ **What landed:** the general rating now leaves the **error bucket** out (a rating that belongs
  to no criterion must not move the average of the criteria the report names), and the fallback and
  the rule name the same constant. **The reachable numbers do not change** — the bucket cannot
  exist. It closes the door if the FKs ever change.
  ⭐ **The reachable question the old item never asked:** a criterion the app has **no column for**
  (a school adds a category like "Course Coverage" to the rubric) **is a real criterion** — it
  counts toward the general rating today, and no column shows it. That behaviour is **kept**
  deliberately: dropping it would change the published average for a rubric that has one. If the
  owner wants the average to cover only the eight named criteria, that is a product decision, not a
  defect fix.

- [x] **The `CATEGORY_NAMES` aliases overwrite a column instead of averaging — the state cannot occur
  (2026-10-21), so the map stays.**
  Where: `lib/evaluation-utils.ts:11-21` (the map) and the assignment loop in
  `mapCategoryAveragesToColumns`.
  What it was: `"Experiential Learning"` and `"Experiential Learning Provided to Students"` both map
  to the `experientialLearning` column, and so do `"Respect the Uniqueness of the Students"` and
  `"Respect for Uniqueness"`. The loop assigns, so if a period held **both** spellings, the second
  one **overwrote** the first — and which one won depended on the order the category names first
  appear in the rating rows, i.e. the database's row order.
  ⭐ **The scan found the state cannot occur:** a rating stores the rubric **item** id, and the
  category **name** is resolved at read time from the live `rubric_categories`; a period has **one**
  rubric group (`evaluation_periods.rubric_group_id`, `supabase-schema.sql:1814`). So a rename
  changes every row of that period at once — the two spellings never coexist in one period's
  figures, and the overwrite has nothing to choose between. (The only way to get both is a rubric
  group with two categories whose names differ only by the alias — a misconfiguration, not a
  rename.)
  ⭐ **What landed:** nothing in the arithmetic. The alias map stays as the defensive lookup it was
  written to be, and the finding is recorded here. Option **(a)** (average the aliases) would need
  the per-category **counts** to pool them exactly, which the column mapping does not have — a
  ripple through every caller to fix a state the schema forbids.

- [x] **A tie is shown as a tie, everywhere — DONE 2026-10-21 (owner: "all not just the first").**
  Where: `features/evaluations/components/DepartmentSubjectView.tsx:261` and `:268` (the subject
  table) and `:426`/`:429` (the per-faculty table) print `highestRubrics[0]` / `lowestRubrics[0]`;
  the faculty page (`app/faculty/evaluations/results/[facultySubjectId]/page.tsx:121-133`) and the
  admin department widget (`app/admin/evaluations/results/[departmentId]/page.tsx:239-251`) `.map()`
  over the whole array. `findHighestLowestRubrics` (`lib/evaluation-utils.ts:103-117`) returns
  **every** category tied at the max/min.
  What it is: a tie is **shown** on the faculty page and **hidden** on the admin table. With eight
  criteria on a 1–5 scale, ties are common at the rounded values.
  Why it is open: the contract §3.18 parity check compares the two pages, and they can print
  different things for the same subject.
  Options: **(a)** the admin table renders every tie, like the other two surfaces (one component
  change, 4 call sites); **(b)** the other two surfaces render only the first, like the table;
  **(c)** leave it and make the parity check compare the *first* tie only.
  ⭐ **What landed (option a, everywhere):** the flat admin table is **gone** (the drill-down is
  per-teacher now), so the three surfaces that still printed only the first were the results
  list's "Top Rubric" and "Needs Attention" columns, the expanded table inside each faculty card,
  and the faculty's own list. All of them now print **every** tie, and the **shape follows the
  container**: a label and a value joins them on one line ("Professional Manner 4.60, Student
  Engagement 4.60"), a label and a list stacks them (the subject pages' two cells). The numbers
  are the same either way — that is what §3.18 compares. The contract is **v1.14**; the manual
  verification gains 4.4d.

- [ ] **The bulk-invalidate's reason is not stored on the row.**
  Where: `app/api/admin/evaluation-results/invalidate/route.ts:24-26` — the `reason` goes to the
  audit log only; `bulkDisableByPeriod` (`evaluations.repository.ts:351-364`) writes
  `isDisabled: true` and nothing else. The stale-mapping path (`:165`, `:203`) writes no remarks
  either. The `invalidate*` paths **do** write a `remarks` string (`:399-422`, `:471-477`).
  What it is: the *why* is missing on the row for exactly the two paths that leak into the
  averages (the item above). On the **Invalidated** page
  (`features/evaluations/components/InvalidatedEvaluationsPage.tsx`) those rows show a blank reason.
  Why it is open: an admin reading "why is this response not counted?" (or why it *is* counted, per
  the first item) has no answer on the row itself.
  Options: **(a)** write `remarks` on both paths (one field each; the bulk path already receives a
  `reason` from the modal, the stale path can write a fixed string); **(b)** leave the remarks to
  the audit log and read them from there.

- [ ] **CLEANUP (decide) — the admin Reset Database feature cannot create tables.**
  `features/admin-data/reset-db.service.ts` runs the whole schema through `exec_sql`, but
  `exec_sql` is **not** `SECURITY DEFINER` (`supabase-schema.sql:2074`), so it runs as the
  invoking role — `service_role`, which has no `CREATE` on `public`. The first `CREATE TABLE`
  answers **"permission denied for schema public"**. ⭐ The same wall is why the evaluation
  aggregates could not be a function the app installs (AGENTS.md **Lesson 7c**). Options: **(a)** make
  `exec_sql` `SECURITY DEFINER` **and revoke
  EXECUTE from `anon` and `authenticated`** — it then runs as its owner (`postgres`) and the
  feature works; ⚠️ that is a privilege escalation on a SQL-execution primitive, so the grants
  have to be exactly right; **(b)** drop the feature; **(c)** leave it broken and documented.

- [x] **CLEANUP — three methods with no app caller. Done 2026-10-21.**
  `listSubmittedWithSentiment` and `listSubmittedEvaluateeIds` (the evaluations repository) and
  `buildLiveDeptAverages` (`lib/evaluation-utils.ts` — the raw-row pooling helper the totals path
  replaced) were deleted with their interface entries and their 14 test cases; `listSubmittedWithSentiment`
  was the read with the **unpaged** evaluations query (truncated at 1,000), so deleting it deleted
  that truncation with it. `buildFacultySummary` and `FacultyDeptInput` went with them (the first was
  the second's only caller). Run file:
  `.opencode/skills/plan-fix/runs/20261021-1300-session.md`.

- [x] **CLEANUP (decided) — two helpers with no app caller: they are KEPT.**
  `resolveFacultyDepartment` (`lib/evaluation-utils.ts`) and `resolveDepartmentFaculties` (the same
  file) are only called by their own tests — the results surfaces use `resolveSubjectDepartment`
  (the home-department rule). Either delete them (functions + `DeptResolutionContext` + ~11 test
  cases) or keep them as public capabilities. The adjacent sweep found them; the cleanup of
  2026-10-21 deliberately left them.
  ⭐ **Decided 2026-10-21 (owner): they are KEPT** — their own doc comment makes them the answer
  to a *different* question ("a person's department", not a subject's), and they are a public
  capability of the module. The `DeptResolutionContext` and their ~11 test cases stay with them.

- [x] **CLEANUP (decide) — the docs still describe the pattern the app no longer uses.**
  Four places, all written for the direct-connection story. **All four are done (2026-10-21):**
  1. ~~`AGENTS.md` **Lesson 7c**~~ — **done**: it now presents the direct connection as the *option*
     that needs dashboard access, and the pattern as per-department **and** per-faculty reads, each
     cached for five minutes. Lesson 7b gained the chunk-sizing corollary (37 evaluations = 999 rows
     = one page).
     ⚠️ **Corrected 2026-10-22:** the corollary's numbers were themselves stale (27 statements, not
     34) — the corollary now says 29 × 34 = 986, and carries the new "a stale multiplier is a
     silent perf regression" corollary.
  2. ~~`docs/evaluation-results-endpoint-handover.md`~~ — **done**: marked superseded, with a
     pointer to the current handover; the file stays as the record of the measurement.
     ⭐ **2026-10-21 — the three handovers are folded into one** and the files are **gone**:
     `docs/evaluation-results-cache-handover.md`,
     `docs/evaluation-results-endpoint-handover.md` and
     `docs/evaluation-results-membership-gate-handover.md` → **`docs/evaluation-results-handover.md`**
     (one per session, or none). The durable content they carried lives in
     `specs/evaluation-results-cache.md` and `specs/evaluation-results-attribution.md`.
  3. ~~`specs/evaluation-results-attribution.md` §3.18–§3.20~~ — **done**: the contract rows now
     point at the raw-row path and the cache; §3.19's scope rules live in the **repository** and
     §3.20 says no surface opens a direct connection.
  4. ~~`TODO.md`~~ — **done**: this file's own state (the "NEXT" item, the 2026-10-21 note).
  ⚠️ One correction the migration forced: "**`DATABASE_URL` leaves `.env` for good**" was wrong —
  `scripts/apply-schema.mjs` (the manual schema runner) needs both `pg` and `DATABASE_URL`. The
  **app** no longer needs them; the repo still does.

- [x] **The calculated sentiment figure is no longer displayed — done 2026-10-21.**
  Where: the results list's "Sentiment" column and its sort key
  (`app/admin/evaluations/results/page.tsx`), the department card's "Overall Sentiment"
  (admin + dean), the subject pages' "Sentiment Score" card (admin + dean + faculty), the faculty
  list's row sentiment, `DepartmentSubjectView`'s column + sort key + the per-faculty card, and the
  **per-response badges/chips** on the subject pages. The test that guarded the removed card became
  its inverse (`lib/__tests__/department-summary-widget.test.tsx`).
  ⚠️ **Two kinds of sentiment** — the **comment's** is **stored**
  (`evaluation_comments.sentimentLabel` / `sentimentScore`, written when the comment was analysed);
  the **figure** is **calculated** — `computeSentimentScore(comments)` pools the stored scores into
  one number per figure. Only the figure stopped being displayed.
  **Still there, on purpose:** the export CSVs · the PDF (`lib/evaluation-pdf.ts`,
  `DownloadEvalPdfButton`, `ReportModal`'s PDF block) · the payload fields · the calculation and the
  comments read · the comment text · `SentimentAnalysisPage` · `EvaluationDashboard`.

- [ ] **The sentiment calculation and the payload's sentiment fields — deferred 2026-10-21.**
  The figure is no longer displayed, but it is still **computed** and the comments are still read
  for it. The comments are read **only** for the sentiment
  (`aggregatePooledResults` → `computeSentimentScore` — `lib/evaluation-utils.ts:288-293`), so
  removing it means the drill-down **stops reading the comments**: one read fewer per page load.
  Scope, when it is taken: the `sentimentScore` on every aggregate and per-row payload
  (`lib/types/evaluation.ts`), the service and the repository that carry it, the export CSVs' column,
  the PDF's sentiment score and its "Sentiment Analysis" block, and the calculation itself.
  ⚠️ It touches **the same files** the membership gate does, so it should be its own slice **after**
  that one, not folded into it. What **stays**: the comment text, the per-comment stored label and
  its badge, the sentiment engine (`lib/services/sentiment*.ts`), `SentimentAnalysisPage`, and
  `SentimentBadge` on the student's own comment.

- [ ] **The legacy `evaluation_period_id` NULL rows — a data condition, not a rule (2026-10-21).**
  `evaluations.evaluation_period_id` is **nullable** (`supabase-schema.sql:1846`, never set
  `NOT NULL`), and migration 30c's backfill skipped the semesters with no eval dates and not
  `isActive` (`:1883`) and pointed every row of a **multi-period** semester at one period
  (`:1884-1889`). Those rows are dropped by **every** period-scoped read — the list, the department
  page and the faculty page alike — so the loss is **symmetric** and no parity check (§3.18) can
  see it. Recovering the **NULL** half needs a semester floor plus an `IS NULL` arm
  (`evaluations.semesterId = period.semesterId AND (evaluation_period_id = periodId OR
  evaluation_period_id IS NULL)`), with a double-count caveat when a semester has several periods;
  the **misattributed** half is unreachable by any filter and needs the owner's read-only audit.
  ⭐ It **adds** responses to **every** period's published figures — a bigger semantic change than
  the membership gate — so it is not that slice's job. No DDL either way.

- [x] **SPEC — the export's two views: the flat rows and the per-faculty narrative. The spec is
  WRITTEN (2026-10-22) — `specs/evaluation-results-export.md` (v2.0) — and the first slice
  landed.** The open questions below are **answered by the spec**, so this item moves to "NEXT".
  Where: the export route (`app/api/admin/evaluation-results/export/route.ts`) and the dean's twin.
  What it is: the ZIP today carries a per-department `<code>_results.csv` (the flat subject rows)
  and a `summary.csv` (one row per department). The owner's ask (2026-10-21): the export should
  offer a **flat** view — *the same rows as when all the faculty cards are expanded* — **and** a
  **high-level per-individual / faculty narrative**. ⭐ The answers: the artifact is the **legacy
  workbook as a template** (all three sheets, formulas → values), the narrative's form is the
  workbook's own **Individual** sheet (the form, with the 34 statements), the flat view is the
  workbook's **Overall** sheet (**one row** at the subject grain — a faculty's whole period is a
  different export), and the per-response grain is **not** offered (the comments are on the
  workbook's **Comments** sheet — one per row, uncapped). The per-faculty figures were already
  computed — the service returns `facultyAggregates`; the export route simply did not destructure
  it. ⚠️ **The period-level export (every department, every faculty, every subject, in one
  download) is NOT in this spec** — the existing CSV export stays as it is, and the Overall sheet's
  column set for that scope is a separate decision.

- [ ] **SPEC — the PDF's per-faculty average is a MEAN OF MEANS.** Where:
  `lib/evaluation-pdf.ts:352` — the "Per Faculty" PDF computes each teacher's average as the
  **mean of their subject averages**, while the page's card shows the **pooled** average (the
  server's `facultyAggregates`, the weights carried through the read). For a teacher with more than
  one subject the two **disagree** — the same arithmetic the app stopped doing everywhere else.
  ⭐ **The PDF carries three more live defects** (recorded 2026-10-22 in
  `specs/evaluation-results-export.md` §11, so they are not lost with the export's scope change —
  the PDF is out of scope for the Excel slice):
  1. **It prints `Semester: Semester`** — `lib/evaluation-pdf.ts:149` and `:306`; `semesterLabel`
     is passed by **no one**: not the admin page, not the dean page, not the faculty page.
  2. **It prints no Section** — `PdfData` has no section field, though the pages and the routes
     both carry `sectionProgram` / `sectionName`.
  3. **It truncates the comments at 30** — `:211-227`, "… and N more comments": a silent
     truncation in a document that is meant to be the record.
  What it is: the PDF builds its own aggregate from the subject rows instead of taking the
  server's per-faculty figure. Options: **(a)** the PDF takes the pooled figure (the service
  already returns it) — one source of truth; **(b)** leave it and document the difference.
  ⭐ **Deferred 2026-10-21 (owner)** — it is a document, not the results page, and it wants its
  own spec (with the export's, or beside it).

## Done this session (do not redo)

- [x] **The export's workbook is generated from scratch — the generator is built (2026-10-22).**
  The decision (owner): **B** — the workbook is built, not patched; the template file stays as the
  **reference** and the cut script as the reference tool. Six slices, one commit each:
  `lib/xlsx/styles.ts` (20 semantic tokens → the derived cell formats; the theme references
  resolved to plain RGB, so the workbook carries no theme part) · `lib/xlsx/writer.ts` (the
  package builder — it **authors the print setup**: portrait Letter, fit 1 page wide, the print
  area, the repeating header rows) · `lib/xlsx/form-model.ts` (the pure model — what the form
  **is**) · `lib/xlsx/individual.ts` + `lib/xlsx/png.ts` (the model drawn as the sheet; the
  letterhead sized from the **image's own** aspect) · `lib/xlsx/workbook.ts` (the glue) ·
  `lib/xlsx/letterhead.ts` (the one server module — the logo is read from disk and **traced**
  into the bundle). ⭐ **Nothing the school receives has changed yet**: the donor
  (`lib/evaluation-form-xlsx.ts`) is still the live path, and the **route flip** is the last step
  (the Comments and the Overall sheets first). ⭐ **The Excel proof** — open it in Excel and print
  it — is the one thing no test can do, and it comes with the flip.
- [x] **The handover moved — one per session (2026-10-22).**
  `docs/evaluation-results-handover.md` → **`docs/evaluation-export-handover.md`** (the export's
  handover: where the generator stands, the two remaining sheets' specs, the live-rubric rule, the
  route flip, the proofs). The old file is **deleted**; its durable content was already in the
  specs. The TODO's live references are repointed at the specs.

- [x] **The ratings chunk was sized for a rubric that no longer exists — fixed 2026-10-22.**
  Where: `lib/db/common.ts` — `RATINGS_IN_CHUNK_SIZE` was **37**, sized for "37 × 27 = 999 rating
  rows, one page under the cap". ⭐ **The rubric has 34 statements, not 27** (8 criteria:
  3 · 6 · 4 · 4 · 4 · 4 · 3 · 6): migrations 28/29 took it from 24 to 34, and the "27" was the
  *seed's* count, carried in the code, in `supabase-schema.sql:1603` (the rubric group's
  description) and in `:1618` (the seed's comment). **Correctness was never affected** — the page
  loop pages until a page comes back short, so a chunk that spills into two pages is still read
  whole. **Performance was**: every chunk spilled into a second page, and `OFFSET` paging re-scans
  the chunk's rows, so each chunk's first 1,000 rows were read **twice**. ⭐ **No test failed, no
  number moved and nothing errored** — only a count of the live rubric caught it.
  **What landed:** the chunk is now **derived** — `Math.floor(RATINGS_PAGE_SIZE /
  RUBRIC_STATEMENT_COUNT)` = **29** evaluations (29 × 34 = **986** rows, one page) — with
  `RUBRIC_STATEMENT_COUNT` exported and the paging test asserting the invariant, so the
  relationship is stated once. AGENTS.md **Lesson 7b** gained the corollary ("a stale multiplier
  is a silent perf regression, not a wrong number") and its numbers were corrected.
  ⚠️ **The schema's two "27"s were left alone** — `supabase-schema.sql` is the owner's file
  (AGENTS.md **H4**), and the rubric group's *description* is seeded DATA, so changing it would
  change what the owner's manual runner inserts. Re-cut it when the owner asks by name.

- [x] **The export's contract is written, and its first slice landed — 2026-10-22.**
  `specs/evaluation-results-export.md` (v2.0) + the specs index row; and the statement ratings
  (`abcc919`): the read now carries the rubric item's identity, and `computeItemAverages` is the
  statement grain. See "NEXT" for the whole thread.

- [x] **The export's routes carry the identity block — 2026-10-22** (`13ade13`). The three routes
  the export reads now deliver the employee number, the program, the section, the semester and
  the evaluation period. See "NEXT".

- [x] **The export's template is cut — 2026-10-22** (`ef71931`, `bec0132`).
  `scripts/cut-eval-template.mjs` writes `data/templates/eval-report.xlsx` from the legacy
  workbook: idempotent, deterministic, self-verifying, and it refuses to run if the legacy has
  moved. The legacy is now the owner's re-saved file, and the guard is semantic rather than
  style-based. See "NEXT".

- [x] **The drill-down's "By Faculty" cards — decided and implemented 2026-10-20**
  (`.opencode/skills/plan-fix/runs/20261020-2300-drill-down-faculty-cards.md`).
  Option **(b)**: a drill-down's "By Faculty" tab lists the department's **own**
  faculty — the accounts homed in it (`users.departmentId`). The section's
  department is irrelevant to membership: a teacher homed in A who teaches a
  section owned by B is a member of **A**, and B's drill-down gives them **no
  card**.
  Shipped on both drill-downs — the coverage one
  (`features/evaluations/evaluation-status.service.ts` +
  `features/evaluations/components/CoveragePage.tsx`) and the results one
  (`features/evaluation-results/evaluation-results.service.ts` +
  `features/evaluations/components/DepartmentSubjectView.tsx`, admin + dean) —
  each as one atomic service+client change: the service's per-faculty
  aggregates are the member list, and the cards come from that map.
  The rule is now pinned as `specs/evaluation-results-attribution.md` contract
  §3.15 and `specs/coverage-faculty-grouping.md` contract 14, and checked in
  `docs/evaluation-surfaces-verification.md` §3.9 and §4.4.
  **Superseded the same day by the resolver change below**: a non-member's
  subject is no longer in any department's subject tab either (the home is the
  only rule), and the coverage page's "Unresolved" group is now the home-less
  teachers' subjects.

- [x] **One headcount, one membership, one attribution rule — implemented
  2026-10-20** (`.opencode/skills/plan-fix/runs/20261020-2230-faculty-count-one-number.md`).
  The problem: four surfaces counted "the faculty of a department" from four
  different populations, so a school with 9 faculty showed 22. The fix, in
  three places:
  - **the headcount** — `features/users/users.service.ts` →
    `getFacultyCountsByDepartment()`: the faculty accounts homed in a
    department, counted once. Read by the results list, the coverage page
    (column + KPI), both export `summary.csv`s, the report page and the
    Department Health report. The coverage KPI went **22 → 9**.
  - **the membership** — `features/evaluation-results/evaluation-results.service.ts`
    → `getDepartmentMemberTeaching()`: a department's teaching is the
    assignments of the faculty homed in it. The drill-downs' faculty lists and
    the dean's three guards read it.
  - **the attribution** — `lib/evaluation-utils.ts` → `resolveSubjectDepartment`:
    a subject counts under the **teacher's home** department, or is
    unattributed. The "the home must own a course" gate and the section
    fallback are gone: a bucket holds its own members' teaching, and a
    home-less teacher has no department (the coverage page's "Unresolved"
    group, the results list's integrity warning).
  Also: the results list lost its **"No responses"** and **"Responses"**
  columns (the coverage page owns those numbers), the no-response roster is
  gone from the results API and the repository, the results drill-down's
  "By Subject & Section" tab is now the members' subjects **evaluated or
  not**, and the export CSVs stay the results (rows with responses only).
  Pinned as contracts §3.14–§3.17 and §3.1 in
  `specs/evaluation-results-attribution.md`, `specs/coverage-faculty-grouping.md`
  contract 9 + 14, `specs/coverage-parity.md`, and
  `docs/evaluation-surfaces-verification.md` (§7 is now "the home-less
  teachers" — the old home→section matrix measured a movement that no longer
  exists).


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
