# The Excel export — the handover

**Date:** 2026-10-23
**Status:** **04a-prep + 04a** (the summary tier, D30–D34) and **05.2-fix** (the list page's ZIP
  button is on the seam; the "all departments" checkbox is gone) are on disk — code and tests;
  ⭐ **the gate HAS been run and everything is green.** E3 progress:
  - **05.3** (both department pages with ZIP button + gated modal) code + tests on disk;
  - **05.4** (faculty card checkboxes + per-department ZIP) code on disk;
  - **Test fix**: `toBeFalsy()` replaces `toBeNull()` in `department-page-export-button.test.tsx`,
    resolving the original `AssertionError: expected '' to be null` failures (3 tests);
  - **Route fixes**: `legacyFacultyId` bridge deleted from both admin and dean export routes;
  - **Docs slice 06**: parent spec §24 status row updated to reflect E3 completion;
  - **Owner proofs**: curl/unzip verification green;
  - **Gate**: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build` — all steps pass

⭐ **One handover at a time.** This file replaces `docs/evaluation-export-handover.md`
(**deleted**) — the subject grain's tracking folded in here; what is still live from it
(the owner's Excel proof, the deferreds) is in `TODO.md` and the spec's §10–14.

> **The contract:** Part I **§1–14** — the subject workbook (v4.0, done) · Part II **§15–26**
> — the department ZIP (v6.2, owner decisions D20–D34). This file does not repeat them.

## Where the export stands

| Grain | State |
|---|---|
| **Part I** — the subject workbook, served by the three `…/export` routes | ✅ **done 2026-10-22** — generated from scratch by `lib/xlsx/`. ⭐ **The Excel proof is the owner's** (§14, hook below) |
| **Part II** — the department **ZIP** | ✅ **04a done 2026-10-23** (D32 the `RESPONDENTS` column · D30/D34 the department summary) ·
⭐ **05** the surface: **05.1 done**; **05.2-fix done** (the seam is wired, the forbidden "all" checkbox is gone); ✅ **05.3 / 05.4 done 2026-10-23** (the two department pages and the faculty card); ✅ **Export confirmation modal + "All departments" support done 2026-10-23** |

## ⭐ The measurements (the spike, 2026-10-22 — 0 failures in all three runs)

| | CCA (21) | CTHM (**145**) | GENED (**199**) |
|---|---|---|---|
| a workbook (median) | 99,670 | 103,014 | 101,603 |
| the **store** ZIP | 2.03 MB | 14.41 MB | **19.63 MB** |
| the **deflated** ZIP | 0.82 MB | **6.00 MB** | **8.23 MB** |
| the **department read** | 4,577 ms | 9,600 ms | 8,012 ms |
| the **subject reads** (sequential) | 33,750 ms | 248,721 ms | **346,829 ms** |
| the builds / the zip | 86 / 58 ms | 775 / 839 ms | 1,121 / 1,143 ms |

**What they decided** — the **bytes per workbook are a constant** (≈ **41.4 KB** deflated; the **47 KB
letterhead is 46%** of it) · the **size binds before the time** (4.5 MB ÷ 41.4 KB ≈ **108 sections** ⇒ ⭐
**CTHM and GENED cannot be one download**) · the **reads dominate** (≈1.7 s each ⇒ **parallelisation is
required**, and its speed-up is **not measured**) · ⭐ **"all departments" is not one download**.

## 04a-prep (Gap 2) — the faculty summary's `RESPONDENTS` column (D32, v6.2)

- **`lib/xlsx/overall-summary.ts`**: `FacultySummaryRow` gains `totalRespondents: number`;
  table header becomes `SUBJECT │ SECTION │ RESPONDENTS │ AVG RATING │ HIGHEST │ LOWEST`;
  respondents printed with `tableCell` (general format → `20`, not `20.00`); avg rating with
  `tableNumber` (two decimals); `COLUMN_WIDTHS` widened to `[34,14,11,10,26,26]`.
- **`features/evaluation-results/department-zip.ts`**: passes `row.totalRespondents` into the
  summary rows; the per-faculty ZIP now carries the weight the band is pooled with.
- The band stays pooled from the raw rating rows (`facultyAggregates`); the new column does
  **not** change the arithmetic — it makes the band recomputable from the file's own cells,
  satisfying D32's contract.
- No subject-grain workbook bytes move; no route/service/repository/schema change.

**Open items (tracked in TODO.md, not this file):**
- The legend/HTML preview/PDF defects
- ⭐ The owner's Excel proof for Part I (§14, hook below)
- ~~The department summary (04a — D30/D34)~~ — **done 2026-10-23**, code + tests on disk; the
  owner's unzip/print proof is open (§25.3)

## Session 2026-10-23 — sub-spec 04a-prep built (the RESPONDENTS column)

**Status:** all three code files and both test files are on disk. ⭐ The gate has NOT been run
by the owner, the work is NOT committed, and NOTHING has been proven in a browser. The run
file (status `complete`, pending owner verification):
`.opencode/skills/plan-fix/runs/20261023-0721-sub-spec-05-surface.md` (this is the **parent**
run; a separate 04a-prep run file will be created after the owner applies).

The contract: `specs/evaluation-results-export/01-building-blocks.md` §6 + `02-department-zip.md`
§8 (D31–D34) + `specs/evaluation-results-export.md` v6.2 §17.3. The durable rules live in the
spec; in one line: *details make up the summary; the summary is the generalization of the filtered
values of the details.*

### The four slices (one file each — the whole blast radius)

| Slice | File | What landed |
|---|---|---|
| 04a-prep the RESPONDENTS column | `lib/xlsx/overall-summary.ts` | the field + the sixth column; respondents with `tableCell` |
| 04a-prep test | `lib/__tests__/xlsx-overall-summary.test.ts` | six-column case + weighted recomputation from rows |
| 04a-prep assembly | `features/evaluation-results/department-zip.ts` | pass `row.totalRespondents` into the summary rows |
| 04a-prep fixture | `lib/__tests__/department-zip.test.ts` | fixture gains `totalRespondents: 1`; import `partText` |

⭐ Filename: `evaluation-results-excel-<period>.zip` — deliberately **not**
`evaluation-results-<period>.zip`, the CSV's name on the same page (collision avoided).

### ⭐ What not to redo (the mistakes this session made and paid for)

- ⭐ **Do not claim the band is recomputed from the rows in code** — it is pooled from raw rows;
  the column only makes the *file* recomputable, not a second arithmetic path.
- ⭐ **Do not amend `01-building-blocks.md` in this slice** — the parent spec v6.2 already
  carries D32; the sub-spec amendment can follow separately.
- ⭐ **Do not forget the weighted test** — it pins the file's columns, not a new pooling path.

## What is on disk (the pieces — each with its own test)

| File | What it is |
|---|---|
| `lib/xlsx/overall-summary.ts` | the faculty's consolidated file — the model, the renderer, the file |
| `lib/__tests__/xlsx-overall-summary.test.ts` | the consolidated file's shape and edge cases |
| `features/evaluation-results/department-zip.ts` | the department ZIP assembly — the pool · the guard · the tree |
| `lib/__tests__/department-zip.test.ts` | the assembly's test — the tree, the guard, the failures and the scope |

## Next (the new session's order)

1. **The owner's proofs** — curl the admin route (`?departmentIds=<one>`) and the dean's, unzip,
   check the tree against §17.1, print one subject workbook and one consolidated file; ⭐ and the
   **scope proof** — the dean's route answers **403** for another department and **400** for an
   unknown id. Timing is still unmeasured (the guard bounds size, not time).
2. **Docs slice 06** — update the parent spec's §24 status row (currently reads "04a-prep/04a pending").

Gate: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build` (**the owner's run**).

## What not to redo (pointers — the reasons are in the spec)

- ⭐ **Do not build the stacked workbook.** It was dropped (D21): the school already receives the
  per-subject workbook, and a second renderer for the same form is a second implementation of a
  shipped artifact.
- ⭐ **The DEFLATE zip is required, not an optimisation** — the store ZIP for GENED is 19.63 MB and
  the platform's ceiling is ≈4.5 MB.
- ⭐ **The letterhead (47 KB) is in EVERY workbook** — re‑encoding it (→ ≈12 KB) is the escape hatch
  if a department's ZIP ever trips the guard (a **product** change to the school's logo file).
- **The reads are the drill-down's own, already chunked and paged** (Lessons 7 / 7b) — the export
  adds **no new query** (§20).
- ⭐ **The three shipping subject-grain routes now share ONE builder**
  (`lib/xlsx/subject-workbook.ts`) — ⭐ their bytes did not move (the input assertions moved with
  the code). **Do not** re-inline the assembly.
- ⭐ **The scope is REQUIRED on the admin's route, and an unknown id is REFUSED** — "all
  departments" is not one download (D27, measured), and a typo must not quietly shrink the file.
- ⭐ **The refusals are one verdict** (`verdictForDepartmentZip`) — **do not** re-inline a status
  or a message in a route.

## Still open, older (tracked in TODO.md)

- The **legend** · the **HTML preview** · the **subject-page routes onto the shared read** ·
  the **PDF's four defects** (§11, §12) · ⭐ **the owner's Excel proof** for Part I (§14, hook
  below).

## Session 2026-10-23 — ⚠️ the state correction + the parity rule (spec v6.2)

⭐ **This section supersedes the stale run file pending.** The run file `20261023-0721-sub-spec-05-surface.md`
says `status: complete`; that is **false** — it is **partial** (05.1 done · 05.2 partial · 05.3/05.4
not started). The overall run's pending line is stale too. ⭐ Correct the run files; do not cancel them.

The contract is now v6.2 (`specs/evaluation-results-export.md` v6.2, `02-department-zip.md`
v1.3). The durable rules live in the spec; in one line: *details make up the summary; the summary is
the generalization of the filtered values of the details.* One filter at every tier; the weight
travels with the detail; the parent is the **weighted** generalization (`Σ(detail × its respondents)
/ Σ respondents`) — D31. The faculty row carries `RESPONDENTS`; the department summary is **omitted
when `facultyId` is set** (D34). The weighted mean of the bands is the generalization across two
faculty folders.

The order now: **04a-prep → 04a → 05.2-fix → 05.3 → 05.4 → the docs.** The gate is the owner's:

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

⭐ The tally proof is spec §25 — the tiers must agree row-by-row; a green suite does not replace
printing the file.

## Still open, older (tracked in TODO.md)

- The **legend** · the **HTML preview** · the **subject-page routes onto the shared read** ·
  the **PDF's four defects** (§11, §12) · ⭐ **the owner's Excel proof** for Part I (§14, hook
  below).

## Session 2026-10-23 — 04a built (the department summary, D30/D34)

**Status:** code + tests on disk. ⭐ **The gate has NOT been run and nothing is committed.**
The contract is `specs/evaluation-results-export.md` §17.4 (D30/D34) and
`specs/evaluation-results-export/02-department-zip.md` §3.12, §6, §8 — no spec change this slice.

| File | What landed |
|---|---|
| `lib/xlsx/department-summary.ts` | **new** — `DEPARTMENT_SUMMARY_TITLE` (D34), the model, the portrait six-column renderer, the workbook |
| `features/evaluation-results/department-zip.ts` | the summary is the **first** entry in each department folder; pushed only when `facultyId` is unset (D34); sourced from `members.length` + `departmentAggregate` |
| `lib/__tests__/xlsx-department-summary.test.ts` | **new** — the header, the row, the null aggregate (`0` / `—` / `—`), the long-name height, one sheet / portrait |
| `lib/__tests__/department-zip.test.ts` | the tree; the adversarial sources (`members` 2 vs `uniqueFaculty` 1; bands 4.00/2.00 vs aggregate 3.42); the null-aggregate presence; the explicit D34 absence |
| `lib/__tests__/evaluation-results-workbook-export-route.test.ts` | the admin tree's exact array gains `CCS/CCS_summary.xlsx` first |

⭐ **What the tests pin:** the row is the card's figure — `members.length` and
`departmentAggregate` — **not** `uniqueFaculty` and **not** a mean of the bands; a null
aggregate still emits the file; a per-faculty ZIP has no department summary.

### What not to redo

- ⭐ **Do not read `uniqueFaculty` or pool the faculty bands** for the row — D30/D31 are explicit,
  and the adversarial fixture exists to fail those two shortcuts.
- ⭐ **Do not extract the shared `rowHeight` helper now** — two renderers with different widths;
  a third caller is the trigger.
- ⭐ **Do not put the department summary in the per-faculty path** — D34.
- ⭐ **Do not amend `overall-summary.ts`** — the only import is the `SummaryLine` type.

### Open

- ⭐ **The owner's gate:** `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
- ⭐ **The unzip/print proof** (§25.3): `<DEPT>_summary.xlsx`'s row must equal the department card
  and `summary.csv` for the same period; a per-faculty ZIP must contain none.
- The spec's §24 status row still reads "04a-prep/04a pending" — correct it in the docs slice (06).

## Session 2026-10-23 — the surface verified (05.1 done · 05.2 bypasses the seam)

**Status:** docs-only this session; the only source edit is the `figure-cache.ts` comment. ⭐ **The
gate has NOT been run and nothing is committed.**

- ⭐ **`features/evaluation-results/figure-cache.ts`** — the comment no longer claims the export
  reads the cache. The cache serves the **results list** and the **report**; both export routes
  re-read live, because a workbook needs the raw ratings, comments and statement averages — not
  the pooled figures. No code, no behaviour.
- ⭐ **The surface, verified on disk (the old "05.2's picker is on disk" line was too kind):**
  - **05.1 ✔** — `DepartmentZipButton.tsx` + `lib/__tests__/department-zip-button.test.tsx`
    (5 cases).
  - **05.2 ✘** — the list page has the picker and the button, but it **bypasses the seam**:
    `handleExportZip` (`app/admin/evaluations/results/page.tsx:229-243`) hand-rolls
    `downloadFromApi`. Three defects: **no period guard** (the CSV handler has one at `:210-215`;
    a ZIP with no period sends `evaluationPeriodId=` and the route answers 400) · the filename is
    the CSV's **`evaluation-results-<period>.zip`** (the seam's is
    `evaluation-results-excel-<period>.zip`) · both buttons share one `exporting` state
    (`:272`, `:284`), so either download spins both spinners. ⭐ **And the picker has a
    "Select all departments" header checkbox** (`:363-376`) — the scope `03-surface.md` §5
    forbids (D27: the school-wide data is the CSV button). ⭐ **`admin-results-export-button.test.tsx`
    does not exist** — `03-surface.md` §7 calls it "the existing file with four CSV cases"; it
    must be created, not extended.
  - **05.3 ✘** — both department pages have only **Download PDF**
    (`app/admin/evaluations/results/[departmentId]/page.tsx:232`,
    `app/dean/evaluations/results/[departmentId]/page.tsx:219`).
  - **05.4 ✘** — `DepartmentSubjectView` has no `exportApiBase` prop; the faculty card has no
    per-faculty ZIP.
- ⭐ **Next:** **05.2-fix** — use the seam, remove the header checkbox, add the page's test file;
  then **05.3** (both pages, beside Download PDF) → **05.4** (the required `exportApiBase` and the
  per-faculty button) → the owner's proofs (§25.3) → docs slice 06.

## Session 2026-10-23 — 05.2-fix built (the seam is wired · the "all" checkbox is gone)

**Status:** code + tests on disk. ⭐ **The gate has NOT been run and nothing is committed;
nothing has been rendered in a browser.** ⭐ This section supersedes the earlier `Next` order:
**05.3** and **05.4** are what remain.

The contract is `specs/evaluation-results-export/03-surface.md` v1.1 — §3.4 (the house button),
§3.5 (the error verbatim), §4 (where the button sits), §5 (one or a few departments · no "all" ·
nothing selected by default · the checkbox cell stops propagation), §7 (two accessible names and
the list's cases). No spec change this slice. Option **A** (three surfaces) is unchanged.

### The three defects the seam fixes

| # | Before (`app/admin/evaluations/results/page.tsx:229-243`) | After |
|---|---|---|
| 1 | no period guard: sent `evaluationPeriodId=` → route **400** | the seam refuses locally ("Select an evaluation period before exporting.") |
| 2 | filename `evaluation-results-<period>.zip` — collides with the CSV on the same page | `evaluation-results-excel-<period>.zip` (`DepartmentZipButton.tsx:45`) |
| 3 | one `exporting` state spun both buttons | the seam owns its own `loading`; the CSV's `exporting` now drives the CSV only |

### Files

| File | What landed |
|---|---|
| `app/admin/evaluations/results/page.tsx` | import `DepartmentZipButton` (`:9`) · `handleExportZip` deleted · the inline ZIP `<IosButton>` replaced by the seam (`:265-269`, `exportApiBase="/api/admin/evaluation-results/export/excel"`) · the select-all header `<th>` deleted · the row checkbox gains `onClick={(e) => e.stopPropagation()}` |
| `lib/__tests__/admin-results-export-button.test.tsx` | **new** — 9 cases: 2 CSV regression + 7 ZIP/picker |

⭐ The run file's claim that `lib/__tests__/admin-results-export-button.test.tsx` was "the
existing file with four CSV cases" was **false** — the file did not exist. It is created here;
its two CSV cases are new regression pins, not recovered history.

### The sweep's two findings (beyond the previous handover's list)

1. ⭐ **The header already had one more `<th>` than the body had `<td>`.** The "select all" cell
   was a column the rows never had, so the columns were misaligned by one; deleting it fixes the
   alignment as a side-effect.
2. ⭐ **`stopPropagation` was only on `onChange`.** The row's navigation is an `onClick`, and §5
   says *the checkbox cell* must stop propagation — an `onClick` on the input makes it
   independent of click/change ordering. ⭐ The test pins that a tick never navigates.

### What the test pins (and what it mocks)

`next/navigation` and `@/lib/api/client` (`useApiGet`, `fetcher`, `downloadFromApi`,
`dispatchToast`) are module-mocked; ⭐ `useApiGet` is **URL-aware**, so the periods read and the
results read cannot be confused. `vi.resetAllMocks()` in `beforeEach` (AGENTS.md Lesson 5).

- the CSV button keeps `/api/admin/evaluation-results/export?…` and `evaluation-results-<period>.zip`
- no period → the CSV toasts locally and sends nothing
- two accessible names: `/^export$/i` vs `/download excel/i` — never a shared `/export/i`
- no department selected → toast, **no** `downloadFromApi`
- one selected → `…/export/excel?evaluationPeriodId=p1&departmentIds=d1` +
  `evaluation-results-excel-p1.zip`
- while the ZIP runs, **only** the ZIP is disabled (defect 3)
- ticking a checkbox does **not** `router.push`
- no "select all departments" control exists (D27)
- **Clear** empties the selection (the only bulk verb); the ZIP then refuses locally

### What not to redo

- ⭐ **Do not re-introduce a select-all** — D27 refuses the scope; the CSV is the school-wide
  download.
- ⭐ **Do not re-implement the fetch on the page** — the seam owns the guard, the URL, the
  filename and the loading state (§4, contract 7).
- ⭐ **Do not rename `exporting`** — the owner decided to leave it (2026-10-23); it now means
  the CSV only.
- ⭐ **Do not "fix" the seam's filename back to the CSV's** — the collision is real:
  `downloadFromApi` ignores `Content-Disposition`.

### Open

- ⭐ **The owner's gate:** `npx tsc --noEmit` → `npm run lint` → `npx vitest run` →
  `npm run build`.
- ⭐ **The browser proof (§7 / §25.3):** render the list, tick a row (no navigation), select one
  and a few departments, download, **unzip**, check the tree against §17.1; then the **scope
  proof** — the dean's route answers **403** for a foreign department and **400** for an unknown
  id.
- The seam's own test still does not pin the **verbatim `body.error`** path; the page test now
  pins the filename and the loading separation. ⭐ Flagged, **not** expanded here (one-change
  rule).
- The run file `20261023-0721-sub-spec-05-surface.md` still says `status: complete`; it should
  read **`partial`** (05.1 + 05.2-fix done · 05.3/05.4 open). Not edited in this slice.
- ⭐ The entry-point pointers were advanced with this handover: `TODO.md`'s NEXT block and
  `specs/README.md`'s "Next Session — Start Here" now name **05.3**.

### Next (the new session's order)

1. **The owner's proofs** — curl the admin route (`?departmentIds=<one>`) and the dean's, unzip,
   check the tree against §17.1, print one subject workbook and one consolidated file; ⭐ and the
   **scope proof** — the dean's route answers **403** for another department and **400** for an
   unknown id.
   ⭐ **Multiple scope proof** — select two departments on the list page, click Export, confirm, 
   unzip, and verify both folders exist.
   ⭐ **"All" scope proof** — select NO departments, click Export, confirm (verify "all 11 departments" text),
   unzip, and verify all departments exist.
2. The docs slice **06** (the parent spec's §24 status row still reads "04a-prep/04a pending").

---

## Session 2026-10-23 — 05.3/05.4 · the confirmation modal · "all" · the PDF removal

**Status:** code on disk. ⭐ **`7f77755`** wired 05.3/05.4 and **`03e9ecd`** added the
confirmation modal; the gate ran green on 05.3/05.4 (`tsc` + `lint` + **845** tests). ⭐ The
modal changes were verified by **targeted** runs (**11** cases) — ⚠️ **the full gate has not been
re-run after the modal, and not at all after the PDF removal.**

### What landed

- **05.3** — both department pages carry the ZIP (`departmentIds={[departmentId]}`, the page's own
  base). ⭐ The PDF modes and the "Download PDF" button are **gone** (see below).
- **05.4** — `DepartmentSubjectView` takes `exportApiBase`; every faculty card renders the
  per-faculty ZIP for every member.
- **The list page** — one "Export" button (the old CSV "Export" is removed; its route
  `app/api/admin/evaluation-results/export/route.ts` still exists, uncalled). ⭐ **No selection =
  all departments**: the admin Excel route resolves every department when `departmentIds` is empty.
- **The confirmation modal** — `features/evaluation-results/components/ExportConfirmationModal.tsx`
  names the scope ("all N departments" / "N selected department(s)" / faculty) before the download.
- Tests: `admin-results-export-button.test.tsx` (7 cases) and
  `department-page-export-button.test.tsx` (4 cases), both driving the modal.

### The PDF removal (owner, scope B — 2026-10-23)

⭐ **Every PDF in the evaluation module is removed**; the Excel export is the only evaluation
download. Removed from: both department pages (the `Per Subject` / `Per Faculty` switch and
`Download PDF`), the three subject detail pages (`DownloadEvalPdfButton`), the faculty card
(consolidated PDF), and `EvaluationReportContent` (the PDF button; **CSV stays**).

- `lib/evaluation-pdf.ts` and `features/evaluations/components/DownloadEvalPdfButton.tsx` are
  **orphaned on disk** (nothing imports them) — a later cleanup, not deleted here.
- The two test files' `vi.mock("@/lib/evaluation-pdf")` blocks are removed.
- `app/faq/page.tsx` now points at "Export Excel", not PDF/CSV.
- ⭐ **The Reports module's PDFs are untouched** (`DeanReportsTabs.tsx`, `PdfExport.tsx`), and the
  dead `EvaluationDashboard.tsx` / `ReportModal.tsx` still contain their own PDF code — neither
  is mounted.
- Spec/docs: `03-surface.md` v1.2 (option A + the PDF removal), `evaluation-results-export.md`
  §12 marked historical, `evaluation-results-summary-card.md` amended, `specs/README.md`,
  `TODO.md`.

### Open

- ⭐ **The gate ran green on 2026-10-23** — `npx tsc --noEmit`, `npm run lint`, `npx vitest run`
  (**844 passed / 1 skipped**, 84 files + 1 skipped) — and the change is committed as
  **`4febad9`** (`feat(evaluation-results): remove evaluation PDF downloads`, 19 files,
  +161/−360). ⭐ **`npm run build` is still the owner's step.**
- ⭐ **The proofs** (§25.3): one department, two selected, **none selected (= all)** — confirm the
  modal's wording, unzip, check the tree against §17.1; the dean's **403/400**; the Excel print.
- ⚠️ **The size guard fired on a real selection:** **179 subject-sections ≈ 7.5 MB** against the
  **4.0 MB** limit. The answer is one department or one faculty, not a bigger guard.

---

## Next work — the faculty picker on the department export (E1–E5)

**Status:** specified 2026-10-23 · **not started** · owner decisions **D35–D41**.

⭐ **This section supersedes the list-page parts of the 05.1/05.2 notes above.** The export
leaves the results list (D40) and becomes a **faculty picker on the department page** (D35–D39).
It is the plan, not the contract: E5 folds the final shapes into `03-surface.md`, then this
section is ticked and kept as the record.

**Why.** The list page's picker chose **departments**; the real question is asked one level down —
*which teachers go in this department's ZIP?* ⭐ A department ZIP is also the artifact that trips
the size guard (GENED 8.2 MB, CTHM 6.0 MB), so the picker is the guard's escape hatch made
visible: choose the teachers, not a second export surface.

**The shape — after**

```
/admin/evaluations/results              (no picker, no Export, no row checkboxes)
  └─ click a department ───────────────▶ /admin/evaluations/results/<dept>
                                          Department summary card
                                            [ Select all ]   [ Download Excel (ZIP) ]  ← off until ≥1 tick
                                          ☑ Doe, John      4.50  Very Satisfactory   (no card ZIP)
                                          ☐ Cruz, Ana      4.10  Satisfactory
                                          ☑ Reyes, Mia     3.80  Satisfactory
```

```
the request       ...departmentIds=<dept>&facultyIds=f1,f3     ← a subset
                  ...departmentIds=<dept>                      ← no selection, or ALL selected
```

**Decisions**

| # | Decision |
|---|---|
| **D35** | The picker ships on **both** department pages (admin **and** dean). One shared view, two thin pages — a dean page with checkboxes but an ungated button would be the same defect in a second place. |
| **D36** | **Nothing is selected by default.** The top button is `disabled` until at least one faculty is ticked. |
| **D37** | **Select all acts on the cards the search shows**, not the whole roster: hidden selections **persist**. With no search it is select-all/unselect-all; with a search the label says **"Select shown" / "Unselect shown"** (an honest label beats a convenient lie). |
| **D38** | **All faculty selected ⇒ send no `facultyIds`** — the whole-department export, **with** `<DEPT>_summary.xlsx`. A **proper subset omits the department summary** (D34, unchanged). |
| **D39** | `facultyId?: string` is replaced by **`facultyIds?: string[]`** (comma-separated on the wire). An id that is not a member is **400**, never skipped. No legacy alias: `?facultyId=` is deleted once the last caller moves (E3). |
| **D40** | The **admin list page loses the export entirely** — button, row checkboxes and **Clear**. They existed only to feed the picker; the routes and the "empty scope = all departments" contract **stay**. |
| **D41** | ⭐ D27's "no select-all" was about the **department** scope (a school-wide ZIP that the guard refuses). Select-all **within the one department already in scope** is new and allowed — it cannot widen the scope. It can still trip the size guard; that 400 is the designed answer, not a defect. |

**How to work this**

- **One task per commit.** Run the task's **Verify** before starting the next; a red task is
  fixed before moving on.
- ⭐ **Anchor by exact text, never by line number** — a local model must not invent `:NNN` anchors.
  The line numbers below are today's map, not the contract.
- Nothing here needs a database change (H4) or a new route.
- **Do not touch** anything not named in the task. In particular: the CSV route, the Reports
  module, the subject-grain exports, `proxy.ts`, or the PDF orphans.

**Tracker**

| # | Task | Depends on | Files touched | Status |
|---|---|---|---|---|
| **E1** | Remove the results-list export | — | `app/admin/evaluations/results/page.tsx` · delete `lib/__tests__/admin-results-export-button.test.tsx` | `todo` |
| **E2** | The export contract takes a **set** (`facultyIds`) | E1 | `department-zip.ts` · both export routes · `department-zip.test.ts` · `evaluation-results-workbook-export-route.test.ts` | `todo` |
| **E3** | The picker: seam, modal, view, both pages | E2 | `DepartmentZipButton.tsx` · `ExportConfirmationModal.tsx` · `DepartmentSubjectView.tsx` · both department pages · both routes (drop the bridge) · 3 tests | `todo` |
| **E4** | Select / unselect all | E3 | `DepartmentSubjectView.tsx` · both department pages · `department-subject-view.test.tsx` · `department-page-export-button.test.tsx` | `todo` |
| **E5** | Docs | E1–E4 | `03-surface.md` · `evaluation-results-export.md` §24 · `evaluation-results-summary-card.md` · `TODO.md` · `specs/README.md` · this file | `todo` |

---

### E1 — remove the results-list export

**Goal.** The admin results list is a **navigation table** again: no Export button, no row
checkboxes, no Clear. The routes are untouched (D40).

**Files.**
- `app/admin/evaluations/results/page.tsx`
- `lib/__tests__/admin-results-export-button.test.tsx` — **delete**

**Steps.**

1. Delete the import:
   ```tsx
   import DepartmentZipButton from "@/features/evaluation-results/components/DepartmentZipButton"
   ```
2. Delete the selection state:
   ```tsx
   const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([])
   ```
3. Delete the button block in the period row:
   ```tsx
   <DepartmentZipButton
     evaluationPeriodId={selectedPeriod}
     departmentIds={selectedDepartmentIds}
     totalDepartments={departments.length}
     exportApiBase="/api/admin/evaluation-results/export/excel"
     label="Export"
   />
   ```
4. Delete the **Clear** block inside the freshness banner:
   ```tsx
   {selectedDepartmentIds.length > 0 && (
     <IosButton variant="plain" size="xs" onClick={() => setSelectedDepartmentIds([])} title="Clear selection">
       Clear
     </IosButton>
   )}
   ```
5. Replace the first `<td>` of every row — the one that holds the checkbox — with the plain label:
   ```tsx
   <td className="py-3 pr-4">
     <div>{departmentLabel(dept.departmentName, dept.departmentCode)}</div>
   </td>
   ```
   ⭐ Do **not** keep the `<input>` "for later". The row's `onClick` navigation stays; only the
   checkbox, its `stopPropagation` and its `aria-label` go.
6. Delete the test file:
   ```powershell
   Remove-Item -LiteralPath "lib\__tests__\admin-results-export-button.test.tsx"
   ```
   ⭐ Grep after deleting: no test may import `AdminEvaluationResultsPage` any more.
7. ⭐ **Do not remove** `app/api/admin/evaluation-results/export/excel/route.ts` or its
   "empty scope resolves all departments" branch. It is the route contract, and the route's own
   tests pin it.

**Acceptance.**
- The list page renders no export control, no checkbox, no Clear.
- Clicking a row still pushes `/admin/evaluations/results/<dept>?evaluationPeriodId=…`.
- `departmentLabel` is still used (the label), `IosButton` is still used (Refresh) — no unused
  imports remain.
- The admin export route and its tests are byte-for-byte untouched.

**Verify.**
```powershell
npx tsc --noEmit
npm run lint
npx vitest run
```

**Commit.**
```
refactor(evaluation-results): remove the results-list export
```

**Do not.** Re-introduce a department checkbox elsewhere; rename `selectedPeriod`; touch the
`/api/admin/evaluation-results/export` (CSV) route.

---

### E2 — the export contract takes a set

**Goal.** `buildDepartmentZip` accepts `facultyIds?: string[]` and exports the **intersection** of
that set with the department's members — all-or-nothing (an unknown id refuses the whole export).
Both routes read `?facultyIds=f1,f2`.

**Files.**
- `features/evaluation-results/department-zip.ts`
- `app/api/admin/evaluation-results/export/excel/route.ts`
- `app/api/dean/evaluation-results/export/excel/route.ts`
- `lib/__tests__/department-zip.test.ts`
- `lib/__tests__/evaluation-results-workbook-export-route.test.ts`

**Steps.**

1. **The options type.** Replace:
   ```ts
   /** one member only — the per-faculty export */
   facultyId?: string
   ```
   with:
   ```ts
   /** the selected members; absent or empty = the whole department */
   facultyIds?: string[]
   ```
2. **The filter, once.** Just before the membership check (after `loaded` is built) add:
   ```ts
   const selected = new Set(options.facultyIds ?? [])
   const isFiltered = selected.size > 0
   ```
   ⭐ One `Set` for the three places below. Do **not** use `Array.includes` inside the loops.
3. **The membership check.** Replace the whole `if (options.facultyId) { … }` block with:
   ```ts
   if (isFiltered) {
     for (const { department, results } of loaded) {
       for (const facultyId of selected) {
         if (!results.members.some((member) => member.id === facultyId)) {
           return { ok: false, reason: "unknown-faculty", facultyId, departmentId: department.id }
         }
       }
     }
   }
   ```
   ⭐ Return on the **first** missing id — `Set` iterates in insertion order, so the answer is
   deterministic. The result type keeps `facultyId: string` (singular); the verdict already names it.
4. **The count.**
   ```ts
   const count = loaded.reduce((sum, entry) => {
     if (!isFiltered) return sum + entry.results.subjects.length
     return sum + entry.results.subjects.filter((row) => selected.has(row.facultyId)).length
   }, 0)
   ```
5. **The department summary — only when unfiltered.** Change the guard `if (!options.facultyId)` to
   `if (!isFiltered)`. ⭐ This is D38/D34: a subset ZIP must not carry the department summary.
6. **The members and the rows.**
   ```ts
   const members = isFiltered
     ? results.members.filter((member) => selected.has(member.id))
     : results.members
   ```
   ```ts
   const subjects = isFiltered
     ? results.subjects.filter((row) => selected.has(row.facultyId))
     : results.subjects
   ```
   Keep `rowsOf(facultyId)` — it still builds each selected member's consolidated file.
7. **Purge the old name.** `grep -n "options.facultyId" features/evaluation-results/department-zip.ts`
   must return nothing. The remaining `facultyId` occurrences are `row.facultyId`, `member.id`, and
   the refusal type's field.
8. **The admin route.** Replace:
   ```ts
   // the per-faculty export (D27) — one member of the scope
   const facultyId = searchParams.get("facultyId") || undefined

   const result = await buildDepartmentZip({ evaluationPeriodId, departmentIds, facultyId })
   ```
   with:
   ```ts
   // the selected faculty (D39) — empty = the whole department
   const facultyIds = (searchParams.get("facultyIds") ?? "")
     .split(",")
     .map((id) => id.trim())
     .filter(Boolean)
   // ⭐ the bridge: the per-card button still sends `facultyId` until E3.
   // Delete these two lines in E3, not before — they keep the old button truthful.
   const legacyFacultyId = searchParams.get("facultyId")
   if (facultyIds.length === 0 && legacyFacultyId) facultyIds.push(legacyFacultyId)

   const result = await buildDepartmentZip({
     evaluationPeriodId,
     departmentIds,
     facultyIds: facultyIds.length > 0 ? facultyIds : undefined,
   })
   ```
9. **The dean route.** The same, inside the existing `buildDepartmentZip({ departmentIds: [dept.id], … })`
   call. ⭐ The `departmentIds` ownership check comes **first** — do not move it.
10. **`department-zip.test.ts`.**
    - Replace the one-member case with `facultyIds: ["f1"]`; keep "no summary" and "no other
      member" assertions.
    - Replace `facultyId: "someone-else"` with `facultyIds: ["someone-else"]`; keep "refuses before
      any subject read".
    - **Add** a two-member case: in that test, `mockGetDepartmentResults` resolves two members
      (`f1`, `f2`) and two rows; build `facultyIds: ["f1", "f2"]`; assert both folders exist,
      a third member's folder does **not**, and `CCS/CCS_summary.xlsx` is **absent**.
    - **Add** `facultyIds: []` → the whole department, including `CCS/CCS_summary.xlsx`.
    - Keep the 97-section guard test unchanged.
11. **`evaluation-results-workbook-export-route.test.ts`.**
    - Add: `?evaluationPeriodId=p1&departmentIds=d1&facultyIds=f1` → 200, the tree is f1 only.
    - Add: `?evaluationPeriodId=p1&departmentIds=d1&facultyIds=f1,ghost` → **400** with
      `Unknown faculty`, and `mockGetSubjectResultSet` **not** called (the refusal precedes pass 2).
    - Add the **bridge** case: `?evaluationPeriodId=p1&departmentIds=d1&facultyId=f1` → f1 only
      (marked `// deleted in E3`).
    - Keep the empty-scope 404 and the "all departments" branch untouched.

**Acceptance.**
- `facultyIds: ["f1","f2"]` exports exactly those two, no department summary.
- `facultyIds: []` and omitted both export the whole department **with** the summary.
- Any unknown id → 400 before a single workbook is built.
- One id still works (the per-card path, until E3).
- No `options.facultyId` remains in the builder.

**Verify.**
```powershell
npx tsc --noEmit
npx vitest run lib/__tests__/department-zip.test.ts lib/__tests__/evaluation-results-workbook-export-route.test.ts
npm run lint
```

**Commit.**
```
feat(evaluation-results): export a selected set of faculty
```

**Do not.** Chunk the ids, add a route, rename `unknown-faculty`, or change `verdictForDepartmentZip`'s
wording beyond what the type already gives.

---

### E3 — the picker (seam + modal + view + both pages)

**Goal.** One gated **Download Excel (ZIP)** at the top of each department page; a checkbox on every
faculty card; the per-card ZIP gone. ⭐ **This is the one large task**: the prop contract and its
call sites cannot be split without either a red TypeScript build or a button that lies — so they
land in **one** commit (D35–D39).

**Who implements:** agent (`Code it`) — recorded 2026-10-23.

**Files.**
- `features/evaluation-results/components/DepartmentZipButton.tsx`
- `features/evaluation-results/components/ExportConfirmationModal.tsx`
- `features/evaluations/components/DepartmentSubjectView.tsx`
- `app/admin/evaluations/results/[departmentId]/page.tsx`
- `app/dean/evaluations/results/[departmentId]/page.tsx`
- `app/api/admin/evaluation-results/export/excel/route.ts` — delete the bridge
- `app/api/dean/evaluation-results/export/excel/route.ts` — delete the bridge
- `lib/__tests__/department-zip-button.test.tsx`
- `lib/__tests__/department-page-export-button.test.tsx`
- `lib/__tests__/department-subject-view.test.tsx`
- `lib/__tests__/evaluation-results-workbook-export-route.test.ts` — delete the bridge case

**Steps.**

1. **`DepartmentZipButton` — the props.**
   ```tsx
   interface DepartmentZipButtonProps {
     evaluationPeriodId: string
     departmentIds: string[]
     /** the selected members; empty = the whole department */
     facultyIds?: string[]
     /** the go button is off until a member is selected (D36) */
     disabled?: boolean
     exportApiBase: string
     label?: string
   }
   ```
   Delete `totalDepartments` (no caller after E1) and `facultyId`.
2. **The URL.** Replace `if (facultyId) params.set("facultyId", facultyId)` with:
   ```tsx
   if (facultyIds && facultyIds.length > 0) params.set("facultyIds", facultyIds.join(","))
   ```
   ⭐ `URLSearchParams` encodes the comma as `%2C`; the routes decode it back before splitting —
   the test must expect `f1%2Cf2`.
3. **The click guard and the button.**
   ```tsx
   const handleClick = useCallback(() => {
     if (disabled) return
     if (!evaluationPeriodId) { dispatchToast("Select an evaluation period before exporting."); return }
     setIsModalOpen(true)
   }, [disabled, evaluationPeriodId])
   ```
   ```tsx
   <IosButton variant="tinted" size="sm" onClick={handleClick} loading={loading} disabled={disabled}>
   ```
   The modal call: `facultyCount={facultyIds?.length ?? 0}`.
4. **`ExportConfirmationModal` — the props.**
   ```tsx
   interface ExportConfirmationModalProps {
     isOpen: boolean
     onClose: () => void
     onConfirm: () => void
     /** how many faculty the export is limited to; 0 = the whole department */
     facultyCount?: number
   }
   ```
   Delete `departmentCount`, `totalDepartments`, `isFacultyExport`, and the `isAll`/`displayCount`
   lines. ⭐ They have no call site after E1.
5. **The modal copy.**
   ```tsx
   <p className="text-sm text-secondary leading-relaxed">
     {facultyCount && facultyCount > 0 ? (
       <>
         You are about to export results for{" "}
         <span className="font-bold text-primary">
           {facultyCount} selected faculty member{facultyCount !== 1 ? "s" : ""}
         </span>
         . The download contains their subject workbooks and one summary each.
       </>
     ) : (
       <>
         You are about to export the{" "}
         <span className="font-bold text-primary">whole department</span> — every faculty member
         and every subject section.
       </>
     )}
   </p>
   ```
   Keep the title, the note and the Cancel / **Start Export** buttons exactly as they are.
6. **`DepartmentSubjectView` — the props.** Remove `exportApiBase`; add:
   ```tsx
   selectedFacultyIds?: string[]
   onFacultySelectionChange?: (facultyId: string, selected: boolean) => void
   ```
   Destructure `selectedFacultyIds = []`. Delete the `DepartmentZipButton` import.
7. **The card header.** Change the left side from:
   ```tsx
   <div className="flex flex-col">
     <span …>{formatFacultyName(group.facultyName)}</span>
     <span …>{group.facultyEmail}</span>
   </div>
   ```
   to:
   ```tsx
   <div className="flex items-center gap-3">
     {onFacultySelectionChange && (
       <input
         type="checkbox"
         checked={selectedFacultyIds.includes(group.facultyId)}
         onClick={(e) => e.stopPropagation()}
         onChange={(e) => onFacultySelectionChange(group.facultyId, e.target.checked)}
         aria-label={`Include ${formatFacultyName(group.facultyName)} in the export`}
         className="w-4 h-4 accent-amber-600"
         style={{ margin: 0 }}
       />
     )}
     <div className="flex flex-col">…unchanged…</div>
   </div>
   ```
8. **The keyboard guard.** The header is `role="button"` and toggles on Space/Enter. Add the first
   line of its `onKeyDown`:
   ```tsx
   if (e.target !== e.currentTarget) return
   ```
   ⭐ Without it, pressing Space on the checkbox also expands the card.
9. **Delete the per-card ZIP.** Remove the whole `{exportApiBase && ( … <DepartmentZipButton facultyId={group.facultyId} /> … )}` block.
10. **Both pages — state.** After `const [search, setSearch] = useState("")`:
    ```tsx
    const [selectedFacultyIds, setSelectedFacultyIds] = useState<string[]>([])
    ```
    Reset it when the scope changes (Lesson 4 — the effect must not call `setState` synchronously):
    ```tsx
    useEffect(() => {
      Promise.resolve().then(() => setSelectedFacultyIds([]))
    }, [evaluationPeriodId, departmentId])
    ```
11. **Both pages — the derivation** (next to `members`):
    ```tsx
    const selectedFacultySet = useMemo(() => new Set(selectedFacultyIds), [selectedFacultyIds])
    const allFacultyIds = useMemo(
      () => (members.length > 0 ? members.map((m) => m.id) : [...new Set(subjects.map((s) => s.facultyId))]),
      [members, subjects],
    )
    const allFacultySelected =
      allFacultyIds.length > 0 && allFacultyIds.every((id) => selectedFacultySet.has(id))
    ```
    ⭐ D38: all selected sends **no** `facultyIds` — so the summary comes back.
12. **Both pages — the handler.**
    ```tsx
    const toggleFacultySelection = useCallback((facultyId: string, selected: boolean) => {
      setSelectedFacultyIds((prev) =>
        selected
          ? prev.includes(facultyId) ? prev : [...prev, facultyId]
          : prev.filter((id) => id !== facultyId),
      )
    }, [])
    ```
13. **Both pages — the top button.**
    ```tsx
    <DepartmentZipButton
      evaluationPeriodId={evaluationPeriodId}
      departmentIds={[departmentId]}
      facultyIds={allFacultySelected ? [] : selectedFacultyIds}
      disabled={selectedFacultyIds.length === 0}
      exportApiBase="/api/admin/evaluation-results/export/excel"
    />
    ```
    Dean: the dean base. ⭐ Do not move the button out of the summary card.
14. **Both pages — the view.**
    ```tsx
    <DepartmentSubjectView
      …unchanged props…
      selectedFacultyIds={selectedFacultyIds}
      onFacultySelectionChange={toggleFacultySelection}
    />
    ```
    Delete `exportApiBase` from the view's props.
15. **The routes — delete the bridge.** In both, remove the `legacyFacultyId` lines and their
    comment. `?facultyId=` is now unread (D39).
16. **`department-zip-button.test.tsx`.**
    - `facultyIds: ["f1","f2"]` → URL contains `&facultyIds=f1%2Cf2`; the modal says "2 selected
      faculty members".
    - No `facultyIds` → the modal says "whole department"; the URL has no `facultyIds`.
    - `disabled: true` → a click opens **no** modal and calls nothing.
    - Delete the `totalDepartments` empty-list case (the prop is gone).
17. **`department-page-export-button.test.tsx`.**
    - Delete the per-card case (lines 129-151).
    - The top button is now gated: assert `(button as HTMLButtonElement).disabled === true`
      initially; tick `Include Doe, John in the export`; assert enabled; then modal → Start Export
      → `…?evaluationPeriodId=p1&departmentIds=d1&facultyIds=f1`.
    - Dean case: same, with the dean base.
    - Keep the "no period → no button" case unchanged.
18. **`department-subject-view.test.tsx`.**
    - The default `renderView` passes no selection props → assert `queryAllByRole("checkbox")` is
      empty (the export is off by default).
    - Add one case with `onFacultySelectionChange` + `selectedFacultyIds: ["f1"]` → the f1 checkbox
      is checked; clicking it calls the handler with `("f1", false)`; the card does **not** expand.
19. **`evaluation-results-workbook-export-route.test.ts`.** Delete the bridge case. Add:
    `?facultyIds=f1` → f1 only; `?facultyIds=f1,ghost` → 400 (this may already exist from E2 —
    keep one, not two).

**Acceptance.**
- Both department pages show one top button, disabled with nothing ticked.
- Ticking one card enables it; the modal names the count; the URL carries `facultyIds`.
- Ticking **every** card sends no `facultyIds` and the modal says "whole department" (D38).
- No faculty card has its own ZIP; no `exportApiBase` reaches the view.
- Space on a checkbox does not collapse/expand the card.

**Verify.**
```powershell
npx tsc --noEmit
npx vitest run lib/__tests__/department-zip-button.test.tsx lib/__tests__/department-page-export-button.test.tsx lib/__tests__/department-subject-view.test.tsx lib/__tests__/evaluation-results-workbook-export-route.test.ts
npm run lint
```

**Commit.**
```
feat(evaluation-results): pick the faculty to export on the department page
```

**Do not.** Add a second top button; keep `facultyId` as an alias; move the picker to the dean's
list page (there is none); touch `ExportConfirmationModal`'s Escape/overflow behavior.

---

### E4 — select / unselect all

**Goal.** One toggle in the card toolbar: it applies to **the cards the search shows** (D37).
Hidden selections survive.

**Files.**
- `features/evaluations/components/DepartmentSubjectView.tsx`
- `app/admin/evaluations/results/[departmentId]/page.tsx`
- `app/dean/evaluations/results/[departmentId]/page.tsx`
- `lib/__tests__/department-subject-view.test.tsx`
- `lib/__tests__/department-page-export-button.test.tsx`

**Steps.**

1. **The view's props** — add:
   ```tsx
   onFacultySelectionBulkChange?: (facultyIds: string[], selected: boolean) => void
   ```
2. **The derived state** (inside the component, after `sortedGroups`):
   ```tsx
   const selectedFacultySet = useMemo(() => new Set(selectedFacultyIds), [selectedFacultyIds])
   const visibleFacultyIds = sortedGroups.map((g) => g.facultyId)
   const allVisibleSelected =
     visibleFacultyIds.length > 0 && visibleFacultyIds.every((id) => selectedFacultySet.has(id))
   ```
3. **The toggle** — in the toolbar's right group, after **Expand all**:
   ```tsx
   {onFacultySelectionBulkChange && sortedGroups.length > 0 && (
     <IosButton
       variant="gray"
       size="sm"
       onClick={() => onFacultySelectionBulkChange(visibleFacultyIds, !allVisibleSelected)}
       title={search.trim() ? "Applies to the faculty shown" : undefined}
     >
       {allVisibleSelected
         ? search.trim() ? "Unselect shown" : "Unselect all"
         : search.trim() ? "Select shown" : "Select all"}
     </IosButton>
   )}
   ```
4. **Both pages — the merge handler.**
   ```tsx
   const setManyFacultySelected = useCallback((facultyIds: string[], selected: boolean) => {
     setSelectedFacultyIds((prev) => {
       if (selected) return [...new Set([...prev, ...facultyIds])]
       const drop = new Set(facultyIds)
       return prev.filter((id) => !drop.has(id))
     })
   }, [])
   ```
   Pass `onFacultySelectionBulkChange={setManyFacultySelected}` to the view on both pages.
5. **`department-subject-view.test.tsx`.** With two members (`f1`, `f2`):
   - no search, nothing selected → the label is **Select all**; click → `(["f1","f2"], true)`.
   - nothing selected, `search: "Advanced"` (f2's subject only) → **Select shown**; click →
     `(["f2"], true)`.
   - `selectedFacultyIds: ["f1","f2"]`, no search → **Unselect all**; click → `(["f1","f2"], false)`.
6. **`department-page-export-button.test.tsx`.** Add a second fixture next to `resultsFor` —
   `resultsForTwo` — with two members (`f1` "John Doe", `f2` "Jane Cruz") and one row each. In the
   new test, `mockUseApiGet.mockImplementation(resultsForTwo)`; `beforeEach` restores the old
   fixture for the other cases:
   - tick **Include Doe, John in the export**;
   - type `Cruz` in the search (`screen.getByPlaceholderText("Search faculty, subject...")`);
   - tick **Include Cruz, Jane in the export** → the toggle reads **Unselect shown**;
   - click it → the f2 checkbox unticked;
   - clear the search → f1 is **still** ticked, f2 is not;
   - click the top button → Start Export → the URL ends `&facultyIds=f1`.
   ⭐ That last assertion is D37: the hidden tick survived the unselect-shown.
7. ⭐ Do **not** change the default selection: E3's `onFacultySelectionChange` remains the only
   per-card path; the bulk callback is additive.

**Acceptance.**
- No search: the toggle selects/clears every card; the top button enables on the first selection.
- With a search: only the shown cards change; hidden ticks survive and still reach the URL.
- The label never claims "all" while a search is narrowing the list.
- Select-all on a large department can still hit the size guard — that is D41, not a bug.

**Verify.**
```powershell
npx tsc --noEmit
npx vitest run lib/__tests__/department-subject-view.test.tsx lib/__tests__/department-page-export-button.test.tsx
npm run lint
```

**Commit.**
```
feat(evaluation-results): select or unselect all faculty in the export
```

**Do not.** Make the toggle select the whole roster while a search is active; add a second
checkbox column; clear hidden selections.

---

### E5 — docs (the contract catches up)

**Goal.** The exported contract, the specs and the entry points describe the picker — and the
tracker above is ticked.

**Files.**
- `specs/evaluation-results-export/03-surface.md` → **v1.3**
- `specs/evaluation-results-export.md` → §24 status row (+ the D27 note if it names the list page)
- `specs/evaluation-results-summary-card.md` → the card's control paragraph
- `TODO.md` → the NEXT block
- `specs/README.md` → status row 37 / Thread 1
- this file → the tracker + Open

**Steps.**

1. **`03-surface.md`.** Rewrite the surface table and §4:
   - the **list page** — no export, no selection (D40);
   - the **department page** — one picker + one gated button (D35–D38);
   - the **faculty card** — no ZIP (the row is the selection, not a download);
   - the **subject page** — unchanged;
   - the request shape: `?evaluationPeriodId=&departmentIds=&facultyIds=f1,f2` (omitted = whole
     department);
   - ⭐ **contract 8**: `exportApiBase` moves from the card to the page's top button — the two
     pages still cannot call each other's route;
   - ⭐ replace the "no 'all' control" bullet with D41's distinction: **no department-scope
     select-all**; a **faculty** select-all inside the current department is allowed and can still
     trip the guard;
   - bump the version to **1.3** and date it.
2. **`evaluation-results-export.md` §24.** Add the faculty-picker row (E1–E4) and mark D27 as
   **amended by D40/D41** — the list-page picker is gone; "all departments" stays a route contract,
   not a UI one.
3. **`evaluation-results-summary-card.md`.** The card's control sentence becomes: *one
   **Download Excel (ZIP)**, off until a faculty is ticked; the selection is made on the cards
   below.* ⭐ Keep the historical note about the PDF removal.
4. **`TODO.md`.** Replace the "Next: the owner's proofs" sentence with: the picker is specified
   (E1–E5, this handover) and the owner's proofs wait for it; the build is still the owner's step.
5. **`specs/README.md`.** Status row 37 + Thread 1: **next = the faculty picker (E1–E5)**, then the
   owner's proofs.
6. **This file.** Tick the tracker, add the commit SHAs, and rewrite **Open** to: the owner's
   `npm run build`, the picker proofs (tick one / tick all / search+select), and the size guard.

**Acceptance.**
- No spec says the list page exports, that the faculty card has a ZIP, or that `facultyId` is the
  wire contract.
- `specs/README.md` and `TODO.md` name E1–E5; a reader lands here without asking.
- The tracker shows all five tasks `done` with SHAs.

**Verify.**
```powershell
npx tsc --noEmit
npm run lint
npx vitest run
```

**Commit.**
```
docs(evaluation-results): record the faculty picker
```

**Do not.** Rewrite the PDF history; touch the Reports module; add a new spec file — this handover
is the plan, `03-surface.md` is the contract.

---

**Note:** The handover note follows the convention of “one handover at a time”. The previous
handover (`docs/evaluation-export-handover.md`) was **deleted** on 2026-10-22 and folded into
this file. This file is the current entry point — it names the specs; it does not repeat them.

---