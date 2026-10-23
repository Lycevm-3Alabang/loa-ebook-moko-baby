# The Excel export — the handover

**Date:** 2026-10-23
**Status:** **04a-prep + 04a** (the summary tier, D30–D34) and **05.2-fix** (the list page's ZIP
  button is on the seam; the "all departments" checkbox is gone) are on disk — code and tests;
  ⭐ **the gate has NOT been run and nothing is committed.** Next: **05.3** (both department
  pages) → **05.4** (the faculty card) → the owner's curl/unzip proofs → docs slice 06. Gap 1
  (`.eq("isDisabled", false)` on `listSubmittedByPeriodAndEvaluateeAndFS`) was applied
  uncommitted in a prior session.

⭐ **One handover at a time.** This file replaces `docs/evaluation-export-handover.md`
(**deleted**) — the subject grain's tracking folded in here; what is still live from it
(the owner's Excel proof, the deferreds) is in `TODO.md` and the spec's §10–14.

> **The contract:** Part I **§1–14** — the subject workbook (v4.0, done) · Part II **§15–26**
> — the department ZIP (v6.2, owner decisions D20–D34). This file does not repeat them.

## Where the export stands

| Grain | State |
|---|---|
| **Part I** — the subject workbook, served by the three `…/export` routes | ✅ **done 2026-10-22** — generated from scratch by `lib/xlsx/`. ⭐ **The Excel proof is the owner's** (§14, hook below) |
| **Part II** — the department **ZIP** | 🟡 **04a-prep + 04a done 2026-10-23** (D32 the `RESPONDENTS` column · D30/D34 the department summary — code + tests on disk, gate not yet run) ·
⭐ **05** the surface: **05.1 on disk**; **05.2-fix on disk** (the seam is wired, the forbidden "all" checkbox is gone, the page test exists); **05.3 / 05.4 pending** |

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

1. ✅ **04a-prep — the RESPONDENTS column** (D32) — done 2026-10-23, code on disk.
2. ✅ **04a — the department summary** (D30/D34) — done 2026-10-23, code + tests on disk;
   the gate is the owner's.
3. **05.2-fix — wire the seam** (surface's remaining slices: 05.2-fix, 05.3, 05.4) — the list
   page uses `DepartmentZipButton`, the **"all departments" header checkbox comes off** (§5),
   and `admin-results-export-button.test.tsx` is created; then the department pages and the
   faculty card.
4. **The owner's proofs** — curl the admin route (`?departmentIds=<one>`) and the dean's, unzip,
   check the tree against §17.1, print one subject workbook and one consolidated file; ⭐ and the
   **scope proof** — the dean's route answers **403** for another department and **400** for an
   unknown id. Timing is still unmeasured (the guard bounds size, not time).

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

1. **05.3 — the two department pages** (`app/admin/evaluations/results/[departmentId]/page.tsx`
   and the dean's twin): the button beside **Download PDF**, `departmentIds={[departmentId]}`,
   the page's own base; new `lib/__tests__/department-page-export-button.test.tsx`.
2. **05.4 — the faculty card** (`features/evaluations/components/DepartmentSubjectView.tsx`):
   the **required** `exportApiBase` prop and the per-faculty ZIP for **every member**, next to
   the consolidated PDF.
3. The owner's proofs, then the docs slice **06** (the parent spec's §24 status row still reads
   "04a-prep/04a pending").

---

**Note:** The handover note follows the convention of “one handover at a time”. The previous
handover (`docs/evaluation-export-handover.md`) was **deleted** on 2026-10-22 and folded into
this file. This file is the current entry point — it names the specs; it does not repeat them.

---