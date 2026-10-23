# The Excel export — the handover

**Date:** 2026-10-23
**Status:** **04a-prep** (D32) and **04a** (the department summary, D30/D34) are on disk —
  code and tests; ⭐ **the gate has NOT been run and nothing is committed.** Next: the
  surface's remaining slices (**05.2-fix → 05.3 → 05.4**). Gap 1 (`.eq("isDisabled", false)`
  on `listSubmittedByPeriodAndEvaluateeAndFS`) was applied uncommitted in a prior session.

⭐ **One handover at a time.** This file replaces `docs/evaluation-export-handover.md`
(**deleted**) — the subject grain's tracking folded in here; what is still live from it
(the owner's Excel proof, the deferreds) is in `TODO.md` and the spec's §10–14.

> **The contract:** Part I **§1–14** — the subject workbook (v4.0, done) · Part II **§15–26**
> — the department ZIP (v6.2, owner decisions D20–D29). This file does not repeat them.

## Where the export stands

| Grain | State |
|---|---|
| **Part I** — the subject workbook, served by the three `…/export` routes | ✅ **done 2026-10-22** — generated from scratch by `lib/xlsx/`. ⭐ **The Excel proof is the owner's** (§14, hook below) |
| **Part II** — the department **ZIP** | 🟡 **04a-prep + 04a done 2026-10-23** (D32 the `RESPONDENTS` column · D30/D34 the department summary — code + tests on disk, gate not yet run) ·
⭐ **05** the surface (buttons + scope picker): 05.1 on disk, **05.2-fix / 05.3 / 05.4 pending** |

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
3. **05.2-fix — wire the seam** (surface's remaining slices: 05.2-fix, 05.3, 05.4) — the
   scope picker, the department pages, the faculty card.
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

---

**Note:** The handover note follows the convention of “one handover at a time”. The previous
handover (`docs/evaluation-export-handover.md`) was **deleted** on 2026-10-22 and folded into
this file. This file is the current entry point — it names the specs; it does not repeat them.

---