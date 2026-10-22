# The Excel export — the handover

**Date:** 2026-10-22
**Status:** the subject grain is **done and shipping**; the department grain is **spec'd, not built**.
**Scope:** tracking the export's open work. ⭐ **The decisions are the spec's** —
`specs/evaluation-results-export.md` — and this file does not repeat them.

> ⭐ **One handover at a time.** This file replaces `docs/evaluation-export-handover.md`
> (**deleted**) — the subject grain's tracking folded in here; what is still live from it
> (the owner's Excel proof, the deferreds) is in `TODO.md` and the spec's §10–14.
>
> **The contract:** Part I **§1–14** — the subject workbook (v4.0, done) · Part II **§15–26** —
> the consolidated department workbook (v5.0, spec'd 2026-10-22, owner decisions **D20–D26**).

## Where the export stands

| Grain | State |
|---|---|
| **Part I** — the subject workbook, served by the three `…/export` routes | ✅ **done 2026-10-22** — generated from scratch by `lib/xlsx/`. ⭐ **The Excel proof is the owner's** (§14, hook below) |
| **Part II** — the consolidated workbook, one download off the faculty cards | 📐 **spec'd 2026-10-22, nothing built** — start at **§15**; the slices are **§24** |

**Part I's Excel proof — the owner's, still open:**

```bash
ACES_SAMPLE_PATH=/tmp/eval-sample.xlsx npx vitest run lib/__tests__/xlsx-workbook.test.ts
```

## Next (the work, in the spec's slice order — §24)

1. **Slice 1** — the writer: multi-anchor letterheads + row breaks (`lib/xlsx/writer.ts`,
   **additive** — the subject workbook's bytes must not move)
2. **Slice 2** — the read: `getDepartmentSubjectResults(…, { statementAverages: true })`, the
   page's payload unchanged
3. **Slices 3–5** — the Overall summary renderer → the stacked Individual renderer → the
   two-sheet workbook variant
4. **Slice 6** — the routes (admin + dean, `maxDuration = 60`, the filename)
5. **Slice 7** — the button + the client helper, on **both** department pages
6. ⭐ **The Excel proof** (§25 — the owner's: open a department workbook and print it).

Gate: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.

## What not to redo (pointers — the reasons are in the spec)

- **Part I is untouched** — the subject pages' `ExportXlsxButton`, its three routes and
  `buildEvaluationWorkbook` stay as they are; the one shared file is `lib/xlsx/writer.ts`, and
  its change is compatible-only (§22, §26).
- The reads are the drill-down's own, **already chunked and paged** (Lessons 7 / 7b) — the
  export adds **no read** (§20).
- **The print rules of §17.1** (no print titles on the stacked sheet; a page break per block)
  are decided — revisit only with the owner.
- **§3.18 parity is figures, not row order** — the workbook's stated order is its own (§17.1);
  making the card sort the same way is a separate change (§23's last row).

## Still open, older (tracked in TODO.md)

- The **legend** · the **HTML preview** · the **subject-page routes onto the shared read** ·
  the **PDF's four defects** (§11, §12).
