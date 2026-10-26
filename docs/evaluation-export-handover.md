# Evaluation export — handover

Updated: 2026-10-26

## Status

**Part I (subject workbook) and Part II (department ZIP) are built.** Their gate
was green on 2026-10-24: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`
(863 passed, 1 skipped).

**Part III (consolidated faculty ZIP) is built** — plan slices 0–9 applied on
2026-10-26. ⭐ **Its owner gate and Excel proof are pending**: the agent never
ran the gate (H1), so Part III has no green result yet. The plan is
`.opencode/skills/plan-fix/runs/20261026-1446-consolidated-faculty-export.md`.

## Contract

- `specs/evaluation-results-export.md` — the export contract. Part I is the
  subject workbook; Part II is the department ZIP; **Part III is §27–37
  (D40–D47)**. The build's sub-spec is
  `specs/evaluation-results-export/05-consolidated-faculty.md`; the index row is
  in `specs/README.md`.
- `specs/evaluation-results-faculty-card-average.md` — the average rule. A
  faculty card is the **unweighted mean of its rated Subject–Section rows**; a
  department is the **unweighted mean of its rated faculty cards**. This
  supersedes the export spec's §17.3/§19 pooled-band wording — do not reopen it.
- `specs/evaluation-results-cache.md` — the five-minute figure cache shared by
  the list, the exports and the dean view; the detail page stays live.
- `docs/evaluation-coverage-department-drilldown-handover.md` — the coverage
  drill-down and zero-row parity (separate area).

## What is built

- **Subject workbook** (`lib/xlsx/subject-workbook.ts`): `Individual` form,
  `Comments`, `Overall`; one row per student response; the comments merge
  `A:I`.
- **Department ZIP** (`features/evaluation-results/department-zip.ts`), admin
  and dean. Unfiltered, it carries the department summary at
  `<DEPT>/<DEPT>_summary.xlsx`; every subject-section gets
  `<DEPT>/<Faculty>/<Subject>_<Section>_evaluation.xlsx`; every member gets
  `<DEPT>/<Faculty>/<Faculty>_summary.xlsx`; a failed subject is named in
  `_INCOMPLETE.txt`. The guard is `MAX_SUBJECT_SECTIONS` /
  `verdictForDepartmentZip`.
- **The five-minute figure cache** (`features/evaluation-results/figure-cache.ts`)
  is shared by the list, the exports and the dean view. The detail page's
  per-subject rows stay live.
- **Consolidated faculty ZIP** (`features/evaluation-results/consolidated-zip.ts`
  → `lib/xlsx/consolidated-workbook.ts`), admin and dean. One
  `<DEPT>/<Faculty>/<Faculty>_consolidated.xlsx` per member; three tabs
  `Individual`, `Comments`, `Overall`; no letterhead; the same guard as Part II;
  a failed member is skipped and named in `_INCOMPLETE.txt`; an empty member
  still gets a file.

## Part III — built 2026-10-26 (owner gate pending)

One workbook per faculty in a ZIP:

```
<DEPT-CODE>/<Faculty Name>/<Faculty Name>_consolidated.xlsx
```

| Sheet | Content |
|---|---|
| `Individual` | the shipping faculty summary model (`lib/xlsx/overall-summary.ts`; today's sheet `Faculty Summary`) reused with the tab name `Individual`; no letterhead. Average = `facultyAggregates[facultyId].avgRating` — the card's unweighted mean of rated Subject–Section rows. Rows: SUBJECT · SECTION · RESPONDENTS · AVG RATING · HIGHEST · LOWEST. |
| `Comments` | all comments across the faculty's subject-sections, grouped by subject-section with a banner row; the `A:I` merge is preserved; print titles stop before the first group. |
| `Overall` | `NO · SUBJECT · SECTION · DATE · <live rubric criteria> · GENERAL RATING · REMARKS`; continuous `NO`; no `Subject:` header line; rows ordered by subject, section, then the subject's response order. |

- Surface: a second top button on the **admin and dean** department pages,
  `Download Consolidated Excel (ZIP)`, same selected-faculty rule (disabled
  until ≥1 ticked; all ticked = the whole department). `DepartmentZipButton`
  gets optional `filenamePrefix?` and `confirmationDescription?`;
  `ExportConfirmationModal` gets `description?`. The existing filename stays
  `evaluation-results-excel-${evaluationPeriodId}.zip` and its copy does not
  change.
- A member with no subject-sections still gets a workbook with empty sheets and
  `—` (card parity).
- A failed faculty read skips that workbook and names the faculty in
  `_INCOMPLETE.txt`; the rest ship. Never silently ship a partial workbook.
- Reuse `MAX_SUBJECT_SECTIONS` / `verdictForDepartmentZip`; the consolidated ZIP
  is smaller than the existing ZIP for the same scope, so the guard is
  conservative.
- Additive: the existing department ZIP and its tests must not change.
- Routes:
  `app/api/admin/evaluation-results/export/consolidated/route.ts` and
  `app/api/dean/evaluation-results/export/consolidated/route.ts`; filename
  `evaluation-results-consolidated-<periodId>.zip`; the dean refuses a foreign
  department and an inactive period.

## The build (plan slices 0–9, applied 2026-10-26)

0. Contract: Part III + `05-consolidated-faculty.md` + `specs/README.md`.
1. `lib/xlsx/overall.ts` — optional `SUBJECT`/`SECTION` columns, optional
   `department`; the `Subject:` header line is omitted when the column is on.
2. `lib/xlsx/overall-summary.ts` — `sheetName?` (default `Faculty Summary`).
3. `lib/xlsx/form-model.ts` + `comments.ts` — the `group` row,
   `buildGroupedCommentsModel`, print titles stop before the first group.
4. `lib/xlsx/consolidated-workbook.ts` — the three-sheet composition, no media.
5. `features/evaluation-results/consolidated-zip.ts` — the assembly;
   `department-zip.ts` now exports `mapPool` / `entryName` (no behaviour change).
6. Admin route; 7. dean twin.
8. `DepartmentZipButton` `filenamePrefix` + `confirmationDescription`,
   `ExportConfirmationModal` `description`, a second button on both pages.
9. This note + `TODO.md` + the spec status.

Tests added: `xlsx-overall`, `xlsx-overall-summary`, `xlsx-comments`,
`xlsx-consolidated-workbook`, `consolidated-zip`,
`admin-consolidated-export-route`, `dean-consolidated-export-route`,
`department-page-export-button`, `department-zip-button`. ⭐ Part II's tests are
the guard and stay unchanged.

## Traps

- **The comments merge.** A `SUBJECT` column would be swallowed by the `A:I`
  merge. Group with a banner row; stop print titles before the first group.
- **Continuous `NO`.** It spans the whole faculty, not each subject.
- **No `Subject:` header** in `Overall`; the subject is a column.
- **The average is the card's**, not a pooled mean. Do not re-derive it.
- **The writer's content types.** `[Content_Types].xml` must declare `.rels` as
  `application/vnd.openxmlformats-package.relationships+xml` and `.xml` as
  `application/xml`; `xlsx-writer.test.ts` pins it. Excel repair screens were
  the original symptom.
- **Rounding** is to the nearest hundredth, half-up; `3.65` stays `3.65`.

## Proof

- Slice: `npx vitest run <focused test>`.
- Owner gate: `npx tsc --noEmit` → `npm run lint` → `npx vitest run` →
  `npm run build`.
- Excel sample:
  `ACES_SAMPLE_PATH=/tmp/consolidated-sample.xlsx npx vitest run lib/__tests__/xlsx-consolidated-workbook.test.ts`.
- Only the owner can verify: open the ZIP in Excel and check the tree, the three
  tabs, the `Individual` average against the faculty card, the comments
  grouping, the `Overall` order, and the dean page's selected scope.

## Open

- ⭐ **Part III's owner gate + Excel proof are pending.** Run
  `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`, then
  the Excel sample above. The code is applied; nothing has certified it.
- The old `docs/evaluation-results-cache-handover.md` is superseded by this note
  and should be deleted (owner — H1).
- Do not re-open: the card's average is the unweighted mean of rated
  Subject–Section rows (`specs/evaluation-results-faculty-card-average.md`), not
  a pooled mean; Part II's tree, files and tests are untouched.
