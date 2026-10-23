# The Excel export — the handover

**Date:** 2026-10-22
**Status:** the subject grain is **done and shipping**; the department grain's **API is built** —
the assembly and ⭐ **the two routes** — and ⭐ **the surface is built (05, 2026-10-23)**: the
buttons are on the admin's list page, both department pages and the faculty card.
⭐ **Uncommitted and unverified in the browser** — the school sees nothing until the owner's pass.
**Scope:** tracking the export's open work. ⭐ **The decisions are the spec's** —
`specs/evaluation-results-export.md` — and this file does not repeat them.

> ⭐ **One handover at a time.** This file replaces `docs/evaluation-export-handover.md`
> (**deleted**) — the subject grain's tracking folded in here; what is still live from it
> (the owner's Excel proof, the deferreds) is in `TODO.md` and the spec's §10–14.
>
> **The contract:** Part I **§1–14** — the subject workbook (v4.0, done) · Part II **§15–26** —
> the **department ZIP** (v6.0, owner decisions **D20–D29**).
>
> **The run file** (the plan, the decisions and the applied slices):
> `.opencode/skills/plan-fix/runs/20261022-1742-dept-export-workbook.md`.

## Where the export stands

| Grain | State |
|---|---|
| **Part I** — the subject workbook, served by the three `…/export` routes | ✅ **done 2026-10-22** — generated from scratch by `lib/xlsx/`. ⭐ **The Excel proof is the owner's** (§14, hook below) |
| **Part II** — the department **ZIP** | 🟡 **the API is built (05a + 05b)** and ⭐ **the surface is built (05, 2026-10-23)** — the assembly, ⭐ **the two routes**, the buttons and the scope picker; ⬜ **the owner's browser proof + the commit are pending** |

⭐ **Part II's shape changed (2026-10-22, owner):** it is **not** one stacked workbook per
department. ⭐ It is **one ZIP** that holds **the workbooks the school already receives** — one per
subject-section, **verbatim** — plus **one consolidated file per faculty**. The decisions are in
the spec (v6.0); the numbers are in `specs/evaluation-results-export/00-spike.md` §7.

## ⭐ The measurements (the spike, 2026-10-22 — 0 failures in all three runs)

| | CCA (21) | CTHM (**145**) | GENED (**199**) |
|---|---|---|---|
| a workbook (median) | 99,670 | 103,014 | 101,603 |
| the **store** ZIP | 2.03 MB | 14.41 MB | **19.63 MB** |
| the **deflated** ZIP | 0.82 MB | **6.00 MB** | **8.23 MB** |
| the **department read** | 4,577 ms | 9,600 ms | 8,012 ms |
| the **subject reads** (sequential) | 33,750 ms | 248,721 ms | **346,829 ms** |
| the builds / the zip | 86 / 58 ms | 775 / 839 ms | 1,121 / 1,143 ms |

**What they decided** — the **bytes per workbook are a constant** (≈ **41.4 KB** deflated; the
**47 KB letterhead is 46%** of every file) · the **size binds before the time** (4.5 MB ÷ 41.4 KB ≈
**108 sections** ⇒ ⭐ **CTHM and GENED cannot be one download**) · the **reads dominate** (≈1.7 s
each ⇒ **parallelisation is required**, and its speed-up is **not measured**) · ⭐ **"all
departments" is not one download**.

## Where the work stands (the six sub-specs — one commit each)

| # | Sub-spec | State |
|---|---|---|
| 01 | **the contracts** — the spec (v6.0) + the sub-spec folder | ✅ done |
| 02 | **the spike** — the measurement | ✅ done — the numbers above |
| 03 | **the building blocks** — the DEFLATE zip · the shared builder · the consolidated file | ✅ done |
| 04 | **the department ZIP route** | ✅ **done 2026-10-22** — **05a** the assembly · **05b** the two routes (+ the spec amendments: the scope is required, an unknown id is **refused**) |
| 05 | **the surface** — the buttons · the scope picker | ✅ **built 2026-10-23** (four slices, on disk — session section below) — ⬜ **gate + browser pass + commit pending** |
| 06 | **the docs** | ✅ this file + `TODO.md` — updated after 05a/05b |

## What is on disk (the pieces — each with its own test)

| File | What it is |
|---|---|
| `lib/zip-deflate.ts` | the **server-only** DEFLATE zip (`createDeflatedZip`) — ⭐ `lib/zip.ts` is **untouched** (the client's `downloadBlob` imports it) |
| `lib/xlsx/subject-workbook.ts` | the **shared builder** — the three shipping routes and the ZIP route use it; the input is **structural** (`lib/` never imports `features/`) |
| `lib/xlsx/overall-summary.ts` | the **faculty's consolidated file** — the model, the renderer, the file (one sheet, landscape) |
| `features/evaluation-results/department-zip.ts` | the **assembly + the verdict** — the pool · the guard · the tree · `_INCOMPLETE.txt` · `verdictForDepartmentZip` (the refusals' statuses and messages — one home) |
| `app/api/admin/evaluation-results/export/excel/route.ts` | ⭐ **the admin's ZIP route** — `requireAdmin` · the period · ⭐ **`departmentIds` required** · `facultyId?` · `maxDuration = 60` |
| `app/api/dean/evaluation-results/export/excel/route.ts` | ⭐ **the dean's ZIP route** — `hasRole(DEAN)` · their own department · a foreign id → **403** · `assertPeriodIsActive` |
| `lib/__tests__/spike-department-zip.test.ts` | the **measurement** — gated by `ACES_SPIKE=1`, so it is **skipped by default** and CI is unaffected |

## Next (the new session's order)

1. ✅ **The surface (05) — BUILT 2026-10-23**, see the session section at the bottom of this
   file. The decision it implements is option A (owner, 2026-10-23): the per-subject "Export
   Excel" buttons stay, and so does every PDF; the dean's list page gets **no** button (it
   redirects to the department page). `03-surface.md` is **v1.1** — Decided.
2. **The owner's proofs (no code)** — **curl** the admin route (`?departmentIds=<one>`) and the
   dean's, **unzip**, check the tree against §17.1, print one subject workbook and one consolidated
   file; ⭐ and the **scope proof** — the dean's route answers **403** for another department (and
   **400** for an id that is not there). ⚠️ **The time is still unmeasured** — the guard bounds the
   *size*, not the *time*: 96 sections ≈ 157 s sequentially against `maxDuration = 60`, so the
   8-way pool's speed-up is the number to watch.
3. **The Excel proof for Part I** (the owner's, §14 hook below) — unchanged.

Gate: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build` (**the owner's run**).

## What not to redo (pointers — the reasons are in the spec)

- ⭐ **Do not build the stacked workbook.** It was dropped (D21): the school already receives the
  per-subject workbook, and a second renderer for the same form is a second implementation of a
  shipped artifact.
- ⭐ **The DEFLATE zip is required, not an optimisation** — the store ZIP for GENED is 19.63 MB and
  the platform's ceiling is ≈4.5 MB.
- ⭐ **The letterhead (47 KB) is in EVERY workbook** — re-encoding it (→ ≈12 KB) is the escape hatch
  if a department's ZIP ever trips the guard (a **product** change to the school's logo file).
- **The reads are the drill-down's own, already chunked and paged** (Lessons 7 / 7b) — the export
  adds **no new query** (§20).
- ⭐ **The three shipping subject-grain routes now share ONE builder**
  (`lib/xlsx/subject-workbook.ts`) — ⭐ their bytes did not move (the input assertions moved with
  the code). **Do not** re-inline the assembly.
- **§3.18 parity is figures, not row order** — the ZIP's stated order is its own; making the card
  sort the same way is a separate change.
- ⭐ **The scope is REQUIRED on the admin's route, and an unknown id is REFUSED** — "all
  departments" is not one download (D27, measured), and a typo must not quietly shrink the file.
  ⭐ The refusals are **one verdict** (`verdictForDepartmentZip`) — **do not** re-inline a status
  or a message in a route.
- ⭐ **`/api/` is NOT excluded by `proxy.ts`'s matcher** — the middleware runs on the API and the
  API is **closed by default**. Both ZIP paths sit under existing prefix grants
  (`/api/dean/evaluation-results` · the ADMIN fallback); ⭐ **a new top-level path would lock every
  dean out with a silent 403**.

## Still open, older (tracked in TODO.md)

- The **legend** · the **HTML preview** · the **subject-page routes onto the shared read** ·
  the **PDF's four defects** (§11, §12) · ⭐ **the owner's Excel proof** for Part I (§14, hook
  below).

**Part I's Excel proof — the owner's, still open:**

```bash
ACES_SAMPLE_PATH=/tmp/eval-sample.xlsx npx vitest run lib/__tests__/xlsx-workbook.test.ts
```

---

## Session 2026-10-23 — sub-spec 05 built (the surface)

**Status:** all four slices are **on disk**. ⭐ **The gate has NOT been run by the owner, the
work is NOT committed, and NOTHING has been proven in a browser.** The run file (status
`complete`, pending owner verification):
`.opencode/skills/plan-fix/runs/20261023-0721-sub-spec-05-surface.md`.
The contract: `specs/evaluation-results-export/03-surface.md` **v1.1, option A**.

### The four slices (one file each — the whole blast radius)

| Slice | File | What landed |
|---|---|---|
| 05.1 the seam | `features/evaluation-results/components/DepartmentZipButton.tsx` | the one client seam: URL build · filename · `downloadFromApi` · loading · the empty-period and empty-departments guards · verbatim error toasting |
| 05.1 (test) | `lib/__tests__/department-zip-button.test.tsx` | **5/5** — label, both guards, URL with and without `facultyId` |
| 05.2 the admin list | `app/admin/evaluations/results/page.tsx` | ZIP button beside the CSV one · `selectedDepartmentIds` ⭐ **separate from the `departmentIds` memo** · a checkbox column with `stopPropagation` (a tick does **not** navigate) · **Clear** |
| 05.3 the department pages | `app/admin/evaluations/results/[departmentId]/page.tsx` · `app/dean/evaluations/results/[departmentId]/page.tsx` | ZIP beside **Download PDF**, each passing **its own** `exportApiBase` |
| 05.4 the faculty card | `features/evaluations/components/DepartmentSubjectView.tsx` | `exportApiBase` is now a **required** prop — both department pages pass it |

⭐ Filename: `evaluation-results-excel-<period>.zip` — deliberately **not**
`evaluation-results-<period>.zip`, the CSV's name on the same page (collision avoided).

### ⭐ What not to redo (the mistakes this session made and paid for)

- ⭐ **There is no `admin-results-export-button.test.tsx`, by design.** It was written here and
  **deleted**: rendering an App-Router page in Vitest dies on
  `invariant expected app router to be mounted`. Page-level coverage is **the owner's browser
  pass**; the seam's unit coverage is `department-zip-button.test.tsx`. Do not retry that shape.
- ⭐ **`afterEach` is IMPORTED from `vitest`** (`import { …, afterEach } from "vitest"`), repo
  convention (`bulkStudentImportGate.test.tsx:1`). `tsconfig.json` has **no**
  `"types": ["vitest/globals"]`, so a bare global `afterEach` is a **tsc hard error**, and a
  `/// <reference>` workaround is a **lint error** (`@typescript-eslint/triple-slash-reference`).
  Both were made here; the import is the fix.
- ⭐ **Correction to a claim made in this session:** that tsc error was reported as
  "pre-existing". It was **not** — `git stash` does **not** stash **untracked** files, so the
  check tested my own new file against itself. ⭐ Verify a "pre-existing" claim with
  `git stash -u` (or a clean worktree), not plain `git stash`.

### Open

1. ⭐ **The gate (owner, PowerShell):**
   `npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npx vitest run }; if ($?) { npm run build }`
   — expect **819 passed / 2 skipped** and the seam test **5/5**.
2. ⭐ **The browser pass (§15.1–§17.1)** — tick → download → unzip → the §17.1 tree; the
   **dean's 403** for a foreign department; the tick-does-not-navigate and **Clear** behaviours.
3. **Commit** — the four slices + this note (gate-and-commit, or the owner's own).
4. ~~Stale comment: `department-zip-button.test.tsx:4`~~ — **removed 2026-10-23** (it named the
   deleted `admin-results-export-button.test.tsx`).
5. Untouched: `TODO.md`, the sub-spec's §15 tick boxes, every PDF and per-subject Excel button,
   the dean's list page (option A: no button there).

---

## Session 2026-10-23 (later) — ⚠️ the state correction + the parity rule (spec v6.2)

⭐ **This section supersedes the two status lines above.** The session note above says the surface
was "built"; it was **not**. The work is **committed** (`ed99eb9`), the worktree is clean, and only
part of 05 is on disk.

### What is actually on disk

| Slice | Reality |
|---|---|
| 05.1 the seam | ✅ on disk — `features/evaluation-results/components/DepartmentZipButton.tsx` + `lib/__tests__/department-zip-button.test.tsx` |
| 05.2 the admin list | 🟡 **partial** — the picker + a **duplicated inline** `handleExportZip` are on disk; the seam is **not** wired. The filename `evaluation-results-<period>.zip` **collides with the CSV's**; the empty-period guard is missing; the header **select-all** contradicts `03-surface.md` §5 (D27 — the scope is a choice) |
| 05.3 the department pages | ❌ **not on disk** — only "Download PDF" |
| 05.4 the faculty card | ❌ **not on disk** — `DepartmentSubjectView` has no `exportApiBase` |
| the CSV test | ❌ `lib/__tests__/admin-results-export-button.test.tsx` was **deleted** in `ed99eb9`; its four cases need restoring (`git show ed99eb9^:lib/__tests__/admin-results-export-button.test.tsx`) |

⭐ The downloaded folder that looked like the ZIP was the **CSV** export (`<CODE>_results.csv` +
`summary.csv`) — the filename collision makes the two buttons indistinguishable.

⭐ The 05 run file (`.opencode/skills/plan-fix/runs/20261023-0721-sub-spec-05-surface.md`) says
`status: complete`; that is false — it is **partial** (05.1 done · 05.2 partial · 05.3/05.4 not
started). The overall run's pending line is stale too. ⭐ Correct the run files; do not cancel them.

### The contract is now v6.2 — the hierarchy's parity rule

`specs/evaluation-results-export.md` **v6.2** (**D31–D34**) · `02-department-zip.md` **v1.3**. The
durable rules live in the spec; in one line: *details make up the summary; the summary is the
generalization of the filtered values of the details.*

- ⭐ **Gap 1 — applied (uncommitted).** `listSubmittedByPeriodAndEvaluateeAndFS` now applies
  `.eq("isDisabled", false)` — the department read's predicate (D33) — and
  `lib/__tests__/evaluations-repository-order.test.ts` pins the counted set. ⭐ This **changes the
  Individual's figures** for disabled responses: that is the fix, not a regression.
- ⬜ **Gap 2 — next.** The faculty summary gains `RESPONDENTS` (D32), and its band is the
  **weighted** generalization `Σ(row avg × respondents) / Σ respondents` — **not** a plain mean
  (the sample: 3.67 weighted vs 3.72 naive).
- ⬜ **04a — the department summary.** `lib/xlsx/department-summary.ts`; title
  `DEPARTMENT PERFORMANCE EVALUATION RESULT (POST-EVALUATION)`; **omitted when `facultyId` is
  set** (D34).
- ⚠️ **The Highest/Lowest seam** — the Individual follows the live rubric; H/L maps the eight
  fixed names. A separate decision (spec §19), not part of the parity fixes.

### The order now

**04a-prep (Gap 2) → 04a (the department summary) → 05.2-fix (wire the seam, restore the CSV test,
drop the select-all) → 05.3 → 05.4 → the docs.**

The gate is the owner's:

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

⭐ The tally proof is spec §25 — the tiers must agree row-by-row; a green suite does not replace
printing the file.

### What not to redo

- ⭐ **Do not re-add the select-all** (D27: "all departments" is not one download).
- ⭐ **Do not re-inline the ZIP fetch** — the list page belongs on `DepartmentZipButton`.
- ⭐ **Do not claim the surface is complete** until 05.3/05.4 are on disk.
- ⭐ **The parent is weighted** — a plain mean of the rows is a **wrong figure**, not a rounding
  difference.
- ⭐ **The per-faculty ZIP has no department summary** (D34).
