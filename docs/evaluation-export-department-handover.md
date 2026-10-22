# The Excel export — the handover

**Date:** 2026-10-22
**Status:** the subject grain is **done and shipping**; the department grain is **spec'd, measured
and half-built** — the contract and the pieces are on disk; ⭐ **no route serves it and no button
exists**, so nothing the school sees has changed.
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
| **Part II** — the department **ZIP** | 📐 **spec'd + measured + the pieces built; not wired** — no route, no button |

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
| 04 | **the department ZIP route** | 🟡 **05a done** (the assembly) · ⭐ **05b next** (the two routes) |
| 05 | **the surface** — the buttons · the scope picker | ⬜ not started |
| 06 | **the docs** | ✅ this file + `TODO.md` (2026-10-22) |

## What is on disk (the pieces — each with its own test)

| File | What it is |
|---|---|
| `lib/zip-deflate.ts` | the **server-only** DEFLATE zip (`createDeflatedZip`) — ⭐ `lib/zip.ts` is **untouched** (the client's `downloadBlob` imports it) |
| `lib/xlsx/subject-workbook.ts` | the **shared builder** — the three shipping routes and the ZIP route use it; the input is **structural** (`lib/` never imports `features/`) |
| `lib/xlsx/overall-summary.ts` | the **faculty's consolidated file** — the model, the renderer, the file (one sheet, landscape) |
| `features/evaluation-results/department-zip.ts` | the **assembly** — the pool · the guard · the tree · `_INCOMPLETE.txt` |
| `lib/__tests__/spike-department-zip.test.ts` | the **measurement** — gated by `ACES_SPIKE=1`, so it is **skipped by default** and CI is unaffected |

## Next (the new session's order)

1. **05b — the two routes.** The admin's (`departmentIds` **required**) + the dean's (their own
   department; a foreign id → **403**) · `maxDuration = 60` · the filename
   `evaluation-results-<periodId>.zip` · the **refusal's message** (the count + the estimate) · the
   route cases · ⭐ **the two spec amendments** (the scope is required; an unknown department id is
   **refused**, not skipped — a typo must not quietly shrink the download).
2. **The surface (05)** — the results list page's button + the **scope picker** · the department
   page's button · the **dean's twin** · ⭐ **the faculty card's button = the per-faculty ZIP** (the
   measured answer to *"remove the export on faculty card levels?"* — **no**: it becomes the export
   that gets CTHM and GENED to the school).
3. **The Excel proof (the owner's)** — unzip a department ZIP, print one subject workbook and one
   consolidated file; ⭐ and the **scope proof** — the dean's route answers 403 for another
   department.

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

## Still open, older (tracked in TODO.md)

- The **legend** · the **HTML preview** · the **subject-page routes onto the shared read** ·
  the **PDF's four defects** (§11, §12) · ⭐ **the owner's Excel proof** for Part I (§14, hook
  below).

**Part I's Excel proof — the owner's, still open:**

```bash
ACES_SAMPLE_PATH=/tmp/eval-sample.xlsx npx vitest run lib/__tests__/xlsx-workbook.test.ts
```
