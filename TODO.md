# TODO — open work

Forward-looking only: **next**, **in progress**, **pending**, and the **handovers** to start from.
Completed work and dated decisions live in the specs under `specs/` and in the handovers — this
file does not repeat them.

Gate for every item: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
The owner runs it; the agent never executes CLI (H1).

## Next

- [ ] **The faculty picker on the department export — E1–E5.**
  Plan of record, one task per commit, each with goal, anchors, acceptance, proof commands and
  commit message: `docs/evaluation-export-department-handover.md` → *"Next work — the faculty
  picker on the department export (E1–E5)"*.
  Outcome: the results list loses its export; each department page keeps **one** gated
  "Download Excel (ZIP)", a checkbox per faculty card, and select/unselect-all over the searched
  set. All selected ⇒ whole department **with** `<DEPT>_summary.xlsx`; a proper subset ⇒ no
  summary.
  Contract: `specs/evaluation-results-export.md` Part II (v6.2) · surface
  `specs/evaluation-results-export/03-surface.md` v1.2 (folded to v1.3 in E5).

## In progress

None. The E1–E5 plan is approved; implementation starts at E1.

## Pending

### Export

- [ ] **Owner proofs — export (§25.3).** One / several / none-selected exports; unzip each; the
  dean's 403 (other department) and 400 (unknown faculty); open the generated workbook in Excel
  and print it. The print is the one thing no test covers.
- [ ] **Legend ("Interpretation of Data") — the rating ladder becomes data.** The legacy legend was
  a DrawingML textbox; the new writer draws pictures only, so the legend becomes a block of cells.
  The ladder must stop being hard-coded inside `getRemark` (`lib/evaluation-utils.ts:57-64`) and
  become data that both the remark and the legend read. It is duplicated in **three** places —
  `lib/evaluation-utils.ts`, `features/evaluations/components/EvaluationDashboard.tsx`,
  `app/api/faculty/evaluation-results/route.ts` — the legend is the chance to converge them.
  Contract: `specs/evaluation-results-export.md` §11 · handover §3.
- [ ] **HTML preview.** Still open from the workbook work (not part of the Excel export).
- [ ] **Subject-page routes onto the shared read.** So the page and the export agree by
  construction, rather than by parallel reads.
- [ ] **CLEANUP (decide) — orphaned PDF files.** `lib/evaluation-pdf.ts` and
  `features/evaluations/components/DownloadEvalPdfButton.tsx` are unreferenced after the
  evaluation PDFs were removed (scope B). Delete them, or keep as reference. The PDF defects and
  the mean-of-means item are moot while the PDF is out of the app.

### Student CSV importer

- [ ] **VERIFY (no code) — S2 + S3 browser pass.** Both slices are gate-green but have never been
  rendered.
  - **S2:** run one panel; confirm the preview table survives its own run (the deleted
    `setPreviewRows(null)` — invisible to tsc/lint/vitest/build), and that the ledger download
    covers exactly the panels that ran.
  - **S3:** the Unassigned panel has never rendered — the 2026-1 file has zero unresolvable codes
    (its ten department counts sum to exactly 28,096). Author a CSV with one `department code` =
    `ZZZ`, one blank, and two blank emails; that exercises the roll-up, the unresolved footnote,
    and both remove verbs.
- [ ] **Run gate vs Needs Review (observed, `/admin/data/student-import`).** Each panel's Run reads
  disabled whenever Needs Review ≠ 0. Two readings, different fixes:
  **(a)** correct behavior — every such panel also holds blocked rows, or no active semester is set
  (the gate is `!semesterId || blockedCount > 0`; amber-only panels are runnable by design) → no
  code change, close with a comment;
  **(b)** gate overreach — amber-only panels are observed disabled → narrow `disabled` to
  blocked-only AND surface the reason inline (today it is a tooltip only).
  First check on sighting: red "No active semester" note present? blocked rows in those panels, or
  amber only?
- [ ] **PROOF — F1 invalid-details modal (no new code).** Produce one Step 6 conflict (two
  faculties, one slot): the modal table names subject, section, requested and holder; overlay-click
  + X dismiss; inline invalid lists unchanged; Step 2 volume table renders.
- [ ] **PROOF — drift alarm live fire (staging/scratch file only).** Flip the active semester
  mid-panel-run: expect the mid-run message naming both terms with the ledger still committed. No
  gate covers this path.
- [ ] **CLEANUP — deferred course payload. BLOCKED.** Trim the unconsumed `departmentCourses` from
  `/api/import/students/reference` in its own pass; confirm no other consumer
  (`BulkSectionImport.tsx` keeps separate state — do not touch). It is blocked because the ledger's
  `DEPARTMENT_MISMATCH` flag consumes the dataset via `sectionDeptCode` (tested in
  `import-ledger.test.ts:186-190`), so trimming now silently kills mismatch detection. Unblocks
  only via an explicit product call (drop MISMATCH) or server-side ownership resolution.

### Evaluation results — data gaps

- [ ] **The sentiment calculation and the payload's sentiment fields — deferred.** The figure is no
  longer displayed, but it is still computed and the comments are still read for it
  (`aggregatePooledResults` → `computeSentimentScore`, `lib/evaluation-utils.ts:288-293`). Removing
  it stops the drill-down reading the comments — one read fewer per page load.
  Scope: `sentimentScore` on every aggregate and per-row payload (`lib/types/evaluation.ts`), the
  service and repository that carry it, the export CSVs' column, the PDF's sentiment score/block
  (if the PDF returns), and the calculation itself.
  **Stays:** the comment text, the per-comment stored label and its badge, the sentiment engine
  (`lib/services/sentiment*.ts`), `SentimentAnalysisPage`, and `SentimentBadge` on the student's own
  comment.
- [ ] **The legacy `evaluation_period_id` NULL rows — a data condition, not a rule.**
  `evaluations.evaluation_period_id` is nullable (`supabase-schema.sql:1846`), and migration 30c's
  backfill skipped semesters with no eval dates and not `isActive` (`:1883`) and pointed every row
  of a multi-period semester at one period (`:1884-1889`). Those rows are dropped by every
  period-scoped read — the list, department page and faculty page alike — so the loss is symmetric
  and no parity check can see it. Recovering the **NULL** half needs a semester floor plus an
  `IS NULL` arm (`evaluations.semesterId = period.semesterId AND (evaluation_period_id = periodId OR
  evaluation_period_id IS NULL)`), with a double-count caveat when a semester has several periods;
  the **misattributed** half needs the owner's read-only audit. It adds responses to every period's
  published figures — a bigger semantic change than the membership gate. No DDL either way.
- [ ] **The bulk-invalidate's reason is not stored on the row.**
  `app/api/admin/evaluation-results/invalidate/route.ts:24-26` — the `reason` goes to the audit log
  only; `bulkDisableByPeriod` (`evaluations.repository.ts:351-364`) writes `isDisabled: true` and
  nothing else; the stale-mapping path (`:165`, `:203`) writes no remarks either. The
  `invalidate*` paths do write `remarks` (`:399-422`, `:471-477`). On the Invalidated page
  (`features/evaluations/components/InvalidatedEvaluationsPage.tsx`) those rows show a blank
  reason. Options: **(a)** write `remarks` on both paths (the bulk path already receives a `reason`
  from the modal; the stale path can write a fixed string); **(b)** leave the remarks to the audit
  log and read them from there.

### Evaluation results — attribution and coverage decisions

- [ ] **The "Unresolved" pseudo-row's "Faculties" cell.**
  `features/evaluations/components/CoveragePage.tsx:154-172`; the cell is line 165
  (`facultyCount: new Set(unassigned.map((x) => x.facultyName)).size`). The subjects whose
  department resolves to nothing are collected into a synthetic row named "Unresolved"
  (`__unknown__`) so coverage is not silently dropped. Under the home-only rule this group is
  exactly the **home-less teachers' subjects** — people with no `users.departmentId` (the
  CSV-unmatched population). The column now means "faculty homed in this department" everywhere
  else (contract §3.14); a pseudo-department has nobody homed in it, so its headcount is 0 by
  definition — but the cell prints a teaching-roster number, and counts distinct teacher **names**,
  so two teachers with the same name collapse into one.
  Options: **(a)** `0` / "—" (honest: no headcount for a group that is not a department);
  **(b)** count distinct `facultyId` instead of names (keeps the roster meaning, still not a
  headcount); **(c)** leave it.
  Known: the row is excluded from the KPI (`:207`); the results list dropped its `__unknown__` row;
  the row's drill-down keeps every teacher of its subjects.
- [ ] **VERIFY (no code) — the home-less teachers on our data.** A faculty with no
  `users.departmentId` is now unattributed (the coverage page's "Unresolved" group + the results
  list's integrity warning) instead of sitting in the section's department. If every faculty
  carries a home department, nothing moved. Run the SQL in
  `docs/evaluation-surfaces-verification.md` §7 ("The home-less teachers") once per period and read
  the "(no home dept)" row. The same check covers the placeholder buckets.
- [ ] **CLEANUP (decide) — the seeded dean carries only the `DEAN` role, and a dean is always a
  faculty.** `supabase-schema.sql:1560` — the seeded dean (`Regie Ellana`) gets the `DEAN` role row
  only (homed in CCS at `:1568`). The app already treats DEAN as faculty in availability
  (`app/faculty/availability/page.tsx:61`) and bookings (`app/api/appointments/route.ts:59`), and
  the attribution contract says so (`specs/evaluation-results-attribution.md` §3.14: a `DEAN|FACULTY`
  account is faculty; a `DEAN`-only account is not). The membership set and headcount are the
  accounts homed in the department carrying the FACULTY role, so on a fresh install the seeded dean
  is in neither and the dean's own guards refuse their own id (the student-breakdown route answers
  403). Options: **(a)** give the seeded dean a `FACULTY` role row too (owner's manual schema runner
  applies it); **(b)** leave it — real data already carries both roles, and the seeded dean is a
  dean who does not teach. **Owner's call (H4).**
- [ ] **CLEANUP (decide) — four now-dead reads and fields.** Deferred.
  1. **`evaluationResultRepository.listDepartmentAssignments`** — returned a department's evaluated
     assignments; the service now uses `listDepartmentTeachingAssignments` and the dean's guards
     read the members, so nothing calls it. It still has five test cases in
     `lib/__tests__/evaluation-results-department-faculty.test.ts`. Delete it (method + interface
     entry + cases) or keep as a public capability.
  2. **`evaluationRepository.listSubmittedByPeriodAndEvaluatees`** — no app caller. Its tests are
     the proof of AGENTS.md Lesson 7 (URL cap and row cap); deleting the read deletes the proof, so
     the lessons need re-anchoring on a read that stays.
  3. **`DepartmentAggregate.totalSubjects`** — the Department Summary card was its last reader.
  4. **`DepartmentAggregate.uniqueFaculty`** — the same card (it now prints the members' count from
     the payload). `totalResponses` **stays** — the export's `summary.csv` uses it.
- [ ] **CLEANUP (decide) — the "Department Summary" card is written twice.** The department
  drill-down's header card is inlined in both `app/admin/evaluations/results/[departmentId]/page.tsx`
  and the dean's twin (same markup, same numbers). A change to one without the other shows a
  difference on the dean's page, and the card's redesign touches the markup twice.
  Options: **(a)** extract to a shared component (e.g.
  `features/evaluations/components/DepartmentSummaryCard.tsx`) — one markup, one test, both pages;
  **(b)** leave it inlined. Not part of the redesign — decide on its own.
- [ ] **CLEANUP (decide) — the admin Reset Database feature cannot create tables.**
  `features/admin-data/reset-db.service.ts` runs the whole schema through `exec_sql`, but `exec_sql`
  is not `SECURITY DEFINER` (`supabase-schema.sql:2074`), so it runs as `service_role`, which has no
  `CREATE` on `public` — the first `CREATE TABLE` answers "permission denied for schema public".
  Options: **(a)** make `exec_sql` `SECURITY DEFINER` and revoke EXECUTE from `anon` and
  `authenticated` — it then runs as its owner (`postgres`); that is a privilege escalation on a
  SQL-execution primitive, so the grants must be exactly right; **(b)** drop the feature;
  **(c)** leave it broken and documented. **Owner's call (H4).**

## Handovers

- `docs/evaluation-export-department-handover.md` — the current handover: where the Excel export
  stands, the E1–E5 plan of record, the proofs. One handover per session, or none.
- `specs/README.md` — status table and "Next Session — Start Here".
- `specs/` — the dated historical trail. Contracts in play:
  `evaluation-results-export.md` (v6.2, Part II), `evaluation-results-export/03-surface.md` (v1.2),
  `evaluation-results-cache.md`, `evaluation-results-attribution.md`,
  `evaluation-results-summary-card.md`, `student-import-stepper.md`,
  `chunked-import-failure-ux.md`.
- `.opencode/skills/plan-fix/runs/` — per-session run files (history; not a to-do list).
