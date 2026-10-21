# TODO — open follow-ups

Two threads: the **student CSV importer** (tracked 2026-10-09 — all production incidents are closed:
504 timeout, 23505 duplicate key, silent cross-term loss; 329 tests / 26 files green) and the
**evaluation results surfaces** (the results endpoint's performance, the attribution gaps). What
remains is reporting polish, containment and the evaluation gaps — nothing is on fire.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run`
(baseline 280/20) → `npm run build`.

Context: `specs/README.md` ("Next Session — Start Here" + status table),
`.opencode/skills/plan-fix/runs/20261009-1743-student-import-c1.md` (defect ledger),
`docs/evaluation-results-endpoint-handover.md` (the results endpoint's handover).

## NEXT (do first)

- [ ] **The evaluation results endpoint — the code is applied, the environment is not.**
  **Read `docs/evaluation-results-endpoint-handover.md` first** — it has the measurement, the
  approach, what was changed, and what is still outstanding. 🟡 **The endpoint answers 500 until
  two things are done on the environment, and both are missing right now:**
  1. **`DATABASE_URL` is not set** — the aggregate connects to Postgres directly, so without it the
     query throws `DATABASE_URL is required for the evaluation aggregates` and the route 500s.
     The Supabase dashboard's **Connection** panel — the transaction pooler (6543) or the session
     pooler (5432, then set `max: 1` in `lib/db/postgres.ts`). A placeholder is already in `.env`.
  2. **`npm install`** — `@types/pg` is not in the lock, so `import { Pool } from "pg"` does not
     typecheck until it is installed.
  Then `npm test` → `npm run lint` → `npm run build`, and the measurement: the same request,
  **26,012 ms before**, three queries after. ⭐ **The suite was still red at the last run** — 5
  failures in `lib/__tests__/evaluation-results-department-faculty.test.ts` and 1 lint warning in
  `lib/__tests__/evaluation-results-live-faculty.test.ts`, both from the same cause (the mock of
  the aggregates module was missing `fetchAttributionWarnings`). **Both are fixed and have not been
  re-run.** ⭐ The two flagged behaviour changes (the `""` bucket leaves Avg. Rating; the sentiment
  number moves off its 1,000-row truncation) will move two numbers — that is expected.

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

- [ ] **CLEANUP (decide) — `evaluationResultRepository.listDepartmentAssignments`
  has no app caller left.** It returned a department's **evaluated** assignments
  (the attribution set). The results service now uses
  `listDepartmentTeachingAssignments` (the term's assignments), and the dean's
  three guards read `getDepartmentMemberTeaching` — so nothing calls it. It
  still has its own five test cases in
  `lib/__tests__/evaluation-results-department-faculty.test.ts`. Either delete
  it (method + the `IEvaluationResultRepository` entry + those cases) or keep it
  as a public capability for a future surface.

## Open — evaluation results gaps (2026-10-21)

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
> What that changes below: **item 3** is half-closed (the list path only), **item 4**'s rating
> side and **item 5**'s rating side are settled by the aggregate, and the **drill-down** is
> untouched — it still reads its ratings (2-4s). The list's figures now come from the database's
> aggregate, so the `isDisabled` gap below still stands for the drill-down and the faculty page.

- [ ] **The `isDisabled` filter is missing on the results drill-down and on the faculty page.**
  Where: the results **list** filters it (`features/evaluation-results/evaluation-results.repository.ts:142`,
  `.eq("isDisabled", false)`), but the drill-down
  (`features/evaluation-results/evaluation-results.service.ts:128` →
  `features/evaluations/evaluations.repository.ts:510` `listSubmittedByPeriodAndEvaluatees`) and the
  faculty page (`app/api/faculty/evaluation-results/subjects/[facultySubjectId]/route.ts:63` →
  `evaluations.repository.ts:542` `listSubmittedByPeriodAndEvaluateeAndFS`) do **not**.
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

- [ ] **The admin drill-down's membership gate is stricter than the faculty page's.**
  Where: the admin keeps an evaluation only if its `facultySubjectId` is in the department's **term
  roster** (`features/evaluation-results/evaluation-results.service.ts:121,131,141-145`) — and that
  roster is **semester-scoped** (`features/evaluation-results/evaluation-results.repository.ts:66`,
  `.eq("semesterId", period.semesterId)`) and **home-department-scoped**
  (`evaluation-results.service.ts:109-111`). The faculty page filters only
  `evaluateeId + facultySubjectId + status` (`route.ts:63`).
  What it is: the two pages answer "which evaluations count?" differently. The home-department half
  is **intentional** (pinned as `specs/evaluation-results-attribution.md` contract §3.15/§3.16, and
  asserted by `lib/__tests__/evaluation-results-service.test.ts:149-167`). The **semester** half is
  not: `faculty_subjects.semesterId` is nullable (`supabase-schema.sql:1020-1023`) and legacy
  NULL-semester rows exist (`features/admin-data/faculty-subject.repository.ts:171-175`), so an
  evaluation against such an assignment is **counted by the faculty page and dropped by the admin
  page**.
  Why it is open: the two must agree, or the contract §3.18 parity check stays red. The
  spec already models the condition — `evaluation-results.repository.ts:454-492` classifies
  off-semester assignments as an **integrity warning** on the results list.
  Options: **(a)** the faculty page also scopes to the period's semester; **(b)** the admin page
  stops semester-scoping and relies on the integrity warning; **(c)** the admin page surfaces
  "N evaluations outside this term's roster" on the drill-down instead of dropping them silently.
  **(c) is the honest one** — the evaluations are real, they belong to a teacher, and the number is
  knowable.

- [ ] **Three reads are still on a cap.** Where: `listSubmittedByPeriodAndFacultySubjectIds`
  (`features/evaluations/evaluations.repository.ts:554`) and `listStatusByPeriodAndFacultySubjectIds`
  (`:566`) are chunked by facultySubjectIds (the **URL** budget) but their **row** count is
  unbounded — the same 1,000-row truncation AGENTS.md **Lesson 7b** describes, unfixed. And
  `getStudentBreakdownsForFaculties` reads the comments with one unchunked
  `.in("evaluationId", allEvalIds)` (`features/evaluation-results/evaluation-results.repository.ts:651-653`)
  where `allEvalIds` is every evaluation of the faculty — past ~200 ids that URL exceeds ~8KB and
  PostgREST answers **400** (AGENTS.md **Lesson 7**), which the route turns into a 500.
  What it is: the same class of defect as the one just fixed, on the paths that were left out of
  scope. The student-breakdown read is a *different surface* (the per-student table), not the
  Avg/Highest/Lowest figures.
  Why it is open: nobody has hit them yet, because the volumes have not reached the caps.
  Options: **(a)** page the two evaluation reads the way the ones just fixed are paged
  (`.order("id")` + `.range()`), and chunk the comments read at 100 ids; **(b)** leave them and
  record the caps. **(a) is three small edits and removes a latent 500.**

- [ ] **The drill-down reads the department's rating rows into the app to average them.**
  Where: `features/evaluation-results/evaluation-results.service.ts` — `getDepartmentSubjectResults`
  reads the department's evaluations, their ratings and their comments, and pools them in Node. A
  department with 2,184 responses (GENED) ships 58,968 rating rows across ~60 reads.
  What it is: the same defect the **list** just had, on the page one click away. The aggregate
  (`features/evaluation-results/evaluation-aggregates.ts`) already returns one row per assignment
  with its respondent count and its rating totals — the drill-down's per-subject rows are exactly
  that grain.
  Why it is open: it was **out of scope** for the list story and was reverted when that was pointed
  out — it deserves its own decision, not a fold-in. It also needs the per-assignment **comment
  sentiment** (the aggregate's sentiment is per teacher, the drill-down's is per subject), so the
  function would gain a per-assignment sentiment total.
  Options: **(a)** read the drill-down's rating rows from the aggregate and keep the comments read
  (~2 reads instead of ~60); **(b)** leave it (2-4s per drill-down).

- [ ] **The `""` fallback category dilutes Avg. Rating but can never be named.**
  Where: `lib/db/common.ts:99-110` (the fallback) and `:144-151` (the mapping), with the arithmetic
  in `lib/evaluation-utils.ts:65-83` (category averages → general) and `:85-101` (the fixed
  columns).
  What it is: a rating whose `itemId` cannot be resolved to a `rubric_items` row becomes the
  category name `""`. `computeGeneralRating` averages over **all** category names present, so the
  `""` bucket **counts toward Avg. Rating**; `mapCategoryAveragesToColumns` drops any name not in
  `CATEGORY_NAMES`, so the `""` bucket **can never be** a Highest or Lowest Rubric. A rating whose
  item was deleted therefore moves the average without being visible anywhere.
  Why it is open: a real number is being diluted by a bucket with no label, and the UI cannot show
  why. Options: **(a)** exclude unmapped names from `computeGeneralRating` as well (then Avg.
  Rating is over the 8 real criteria only — consistent with the columns, and with what the user
  sees); **(b)** keep them and surface the count ("N ratings could not be attributed to a
  criterion"); **(c)** treat an unresolvable `itemId` as a data error and log it.

- [ ] **The `CATEGORY_NAMES` aliases overwrite a column instead of averaging.**
  Where: `lib/evaluation-utils.ts:11-21` (the map) and `:96-99` (the assignment loop).
  What it is: `"Experiential Learning"` and `"Experiential Learning Provided to Students"` both map
  to the `experientialLearning` column, and so do `"Respect the Uniqueness of the Students"` and
  `"Respect for Uniqueness"`. The loop assigns, so if a period holds **both** spellings, the second
  one **overwrites** the first — the column is the last writer, not the average of the two. Which
  one wins depends on the order the category names first appear in the rating rows, i.e. on the
  database's row order — so the same subject can print different numbers on two screens.
  The seed only uses the long spellings (`supabase-schema.sql:1613-1614`), so this is latent.
  Why it is open: the aliases were written defensively, but the defensive path is the broken one.
  Options: **(a)** average the aliased categories into one column (the fix that matches the
  arithmetic); **(b)** drop the aliases and treat an unknown category name as unmapped (then the
  `""`-bucket rule above applies); **(c)** normalise the category names in the **database** (one
  spelling) and keep the map as the fallback.

- [ ] **The admin table renders only the first tie; the faculty page renders them all.**
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
  aggregates are plain queries over a direct connection instead of a function the app installs
  (AGENTS.md **Lesson 7c**). Options: **(a)** make `exec_sql` `SECURITY DEFINER` **and revoke
  EXECUTE from `anon` and `authenticated`** — it then runs as its owner (`postgres`) and the
  feature works; ⚠️ that is a privilege escalation on a SQL-execution primitive, so the grants
  have to be exactly right; **(b)** drop the feature; **(c)** leave it broken and documented.

- [ ] **CLEANUP (decide) — three methods now have no app caller.**
  `listSubmittedWithSentiment` (`features/evaluations/evaluations.repository.ts:423`) and
  `listSubmittedEvaluateeIds` (`:460`) in the evaluations repository, and `buildLiveDeptAverages`
  (`lib/evaluation-utils.ts`) — the raw-row pooling helper the totals path replaced. The list reads
  its sentiment from the aggregate now, so the comment read it used is unused. `listSubmittedWithSentiment`
  is also the read with the **unpaged** evaluations query (truncated at 1,000), so deleting it also
  deletes that truncation. Either delete them (method + the `IEvaluationRepository` entries + their
  test fixtures) or keep them as public capabilities for a future surface. Same shape as the
  existing "CLEANUP (decide) — `listDepartmentAssignments`" item above.

## Done this session (do not redo)

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
