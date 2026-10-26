---
skill: plan-fix
story: "Add a NEW export (does not replace the existing per-department ZIP): department → faculty, one workbook per faculty consolidating all of that faculty's subject-sections. INDIVIDUAL sheet = the overall score average; COMMENTS = ALL comments across all subjects; OVERALL = all scores with an additional SUBJECT column. Owner asked to see the output first."
repo: /home/nino-compyl/loa/loa-ebook-moko-baby
calibration: {1: "A", 2: "A", 3: "A", 4: "A", 5: "A", 6: "A"}
workflow: "A — SCAN → VISUAL → APPROVE → BUILD"
decision: "APPROVED (owner, 2026-10-26) — additive, not a replacement. One workbook per faculty in a ZIP; Individual = the shipping faculty summary (tab renamed Individual, no letterhead); Comments = all comments grouped by subject-section with a banner row; Overall = one row per response with NO · SUBJECT · SECTION · DATE · live criteria · GENERAL RATING · REMARKS. The faculty average is the Faculty Card's unweighted mean of rated Subject–Section rows. A second top button on the admin and dean department pages, same selected-faculty rule. Members with no subject-sections get a file with empty sheets and —. The handover replaces the existing results handover; TODO.md is updated."
status: built — owner gate + Excel proof pending
pending: "the owner's gate (`npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`) + the Excel sample"
---

# Plan

## Progress

| id | question | answer |
|----|----------|--------|
| 1 | Use the last calibration (AAAAAA)? | A — yes |
| 2 | Approve the visual shape? | A — approve; additive; create handover |
| 3 | Does the data-only view match? | A — done; update TODO.md; create handover, replace |
| 4 | Run implement-fix with the plan? | A — yes |
| 5 | Hand off to implement-fix with this file? | A — yes (implement-fix invoked with this run) |
| 6 | Update TODO.md and create the handover (replace) | done — docs only; code slices not started |
| 7 | Who implements it? | B — the agent (each slice still waits for `Apply this slice`) |
| 8 | Slice 0 applied? | yes — 2026-10-26: the contract (Part III + sub-spec + README row); no code, review-only |
| 9 | Slices 1–2 applied? | yes — `overall.ts` optional SUBJECT/SECTION columns; `overall-summary.ts` `sheetName?` |
| 10 | Slices 3–4 applied? | yes — `group` row + `buildGroupedCommentsModel`; `consolidated-workbook.ts` |
| 11 | Slice 5 applied? | yes — `consolidated-zip.ts`; `mapPool`/`entryName` exported (no behaviour change) |
| 12 | Slices 6–7 applied? | yes — admin and dean consolidated routes |
| 13 | Slice 8 applied? | yes — `filenamePrefix`/`description`; second button on both pages |
| 14 | Slice 9 applied? | yes — handover, TODO, spec status + §24 row + README row |
| 15 | Gate run? | ⏳ no — the owner's (H1); Part III has no green result yet |

## Docs done early — 2026-10-26

On the owner's request, `TODO.md` and `docs/evaluation-export-handover.md` were
written before the code slices. The handover now states Part III is **built**
with the owner gate pending. The old `docs/evaluation-results-cache-handover.md`
is superseded and is to be deleted by the owner (H1 — the agent does not run
`rm`).

## Pending

- ⭐ the owner's gate (`npx tsc --noEmit` → `npm run lint` → `npx vitest run` →
  `npm run build`) + the Excel sample. Slices 0–9 are applied; nothing has
  certified Part III yet.

## Decisions

- ⭐ **Additive** — the existing department ZIP (route, tree, files, button, tests) is untouched. The new artifact is a second route, a second button, a new assembly and a new workbook.
- **Shape:** one workbook per faculty inside a ZIP; the department folder keeps its code, the faculty folder keeps its name; the file is `<Faculty Name>_consolidated.xlsx`.
- **Individual:** the shipping faculty summary model/renderer (`lib/xlsx/overall-summary.ts`), tab renamed `Individual`, no letterhead. The band's average is `facultyAggregates[facultyId].avgRating` — the Faculty Card's unweighted mean of rated Subject–Section rows (`specs/evaluation-results-faculty-card-average.md` §2.2) — not a pooled criterion mean.
- **Comments:** the shipping comments model, with a `group` row (a banner variant) per subject-section so each comment is attributable without breaking the `A:I` merge. The existing subject Comments sheet is unchanged.
- **Overall:** the shipping overall model extended with optional `subject`/`section` columns; the `Subject:` header line is omitted when the column is on; `NO` is continuous across the faculty; rows are ordered by subject, section, then the subject's response order.
- **Surface:** a second top button on the admin and dean department pages, same rule as the existing one (disabled until at least one faculty is ticked; all ticked = the whole department). Label `Download Consolidated Excel (ZIP)`.
- **Guard:** reuse the existing subject-section count and `verdictForDepartmentZip`; the consolidated ZIP is smaller than the existing ZIP for the same scope, so the existing bound is a conservative upper bound.
- **Failure:** a faculty whose subject read fails is skipped and named in `_INCOMPLETE.txt`; the rest ship. A partial workbook is never silently shipped.
- **Handover (owner, 2026-10-26 — "replace"):** create `docs/evaluation-export-handover.md` and **replace** the existing results handover `docs/evaluation-results-cache-handover.md` (one handover at a time; the old note's durable content is in `specs/evaluation-results-faculty-card-average.md`). Update `TODO.md`'s Handovers list to the new note and add the open owner proof to `Next`.
- **Layering:** Route Handler → feature assembly (`features/evaluation-results/consolidated-zip.ts`) → service reads (`getDepartmentSubjectResults`, `getSubjectResultSet`) → repositories. The workbook lives in `lib/xlsx/`. The route stays thin.
- **Invariants preserved:** API routes thin (the new route parses + calls the builder + returns); `proxy.ts` access (the admin falls through the ADMIN fallback, the dean's path is under the existing `/api/dean/evaluation-results` prefix — no config change); Supabase only through repositories (no new client call); `SubmitButton` n/a (download control on the `IosButton` seam); role rule (the dean twin carries `hasRole(DEAN)` + the dean's own department).
- **Gold paths read:** `features/evaluation-results/department-zip.ts` · `lib/xlsx/overall.ts` · `lib/xlsx/overall-summary.ts` · `lib/xlsx/comments.ts` · `lib/xlsx/workbook.ts` · `features/evaluation-results/components/DepartmentZipButton.tsx` · `app/api/admin/evaluation-results/export/excel/route.ts` · `app/api/dean/evaluation-results/export/excel/route.ts` · the two department pages.
- **Proof:** `npm test` (repository.md) / `npx vitest run` for the slices; the owner's gate `npx tsc --noEmit → npm run lint → npx vitest run → npm run build`; the Excel proof (open the generated sample).

## Scan

Path:
- entry: `app/admin/evaluations/results/[departmentId]/page.tsx:205` (dean twin `app/dean/evaluations/results/[departmentId]/page.tsx:190`) → `features/evaluation-results/components/DepartmentZipButton.tsx:37` (`downloadFromApi`) → `app/api/admin/evaluation-results/export/excel/route.ts:55` → `buildDepartmentZip` (`features/evaluation-results/department-zip.ts:95`) → `getDepartmentSubjectResults` (`:111`) + `getSubjectResultSet` per subject (`:189`) → `features/evaluation-results/evaluation-results.service.ts:369-466`.
- workbook: `lib/xlsx/workbook.ts:37` (three sheets) · `lib/xlsx/overall-summary.ts:128`/`:246` (faculty summary file) · `lib/xlsx/comments.ts:33` (text-only, A:I merge) · `lib/xlsx/overall.ts:122` (one row per response; subject in the header) · `lib/xlsx/writer.ts:264` (package builder).
- the card's average: `lib/evaluation-utils.ts:567` (`aggregateFacultyResults`) → `averageDisplayedRatings` (`:472`); the owner's rule is `specs/evaluation-results-faculty-card-average.md` §2.2.

Proof:
- `lib/__tests__/department-zip.test.ts` (assembly: tree, guard, failures, scope) · `lib/__tests__/xlsx-overall-summary.test.ts` (faculty summary) · `lib/__tests__/xlsx-overall.test.ts` (per-response table) · `lib/__tests__/xlsx-workbook.test.ts` (three sheets) · `lib/__tests__/department-page-export-button.test.tsx` (the page's button). Command: `npm test` (repository.md).

Teach:
- One workbook = one form = one subject-section today; the Overall model's subject is a header constant, and the Comments sheet's subject is implicit in that header.
- The new artifact is a composition of three shipping models, not a fourth form renderer — that is what keeps the school's artifact from drifting.
- The one real model change: the Overall's subject moves from the header to a column; the criteria stay the live rubric, and each response's values are its own `categoryAverages`.
- The average is the card's, not the pool's: the owner's 2026-10-24 spec makes the faculty figure the unweighted mean of rated Subject–Section rows.
- Alternative considered: one workbook per department with faculty rows — it would need a faculty column on every sheet and would be a second shape, not a consolidation.

Lens:
- API routes stay thin — applies: the new route parses and calls a feature builder, no assembly in the route.
- proxy.ts is the access-enforcement point — applies: the new path sits under the existing `/api/{admin,dean}/evaluation-results` grants; no new top-level prefix.
- All Supabase access goes through repositories — applies: the builder reuses the services; no client call outside a repository.
- Double-click prevention via SubmitButton — n/a: this is a download control (IosButton seam), not a form submit.
- Role is pipe-delimited — applies: the dean twin carries `hasRole(DEAN)` and the dean's own department.

## Plan

Approved 2026-10-26 (owner): the data-only view matches. Additive. Update `TODO.md`; create the handover, replacing the existing results handover.

### Slice 0 — the contract

- `specs/evaluation-results-export.md` — add **Part III — the consolidated faculty grain** (D40–D47, the output's shape, the field contract, the arithmetic, the reads, the routes, the risks, the proofs) and a §24 row.
- `specs/evaluation-results-export/05-consolidated-faculty.md` — the sub-spec: the tree, the three sheets (the data-only rows approved 2026-10-26), the surface, the acceptance checks, the out of scope.
- `specs/README.md` — the row.
- No code. Proof: review.

### Slice 1 — the Overall's optional identity columns

- `lib/xlsx/overall.ts` — `OverallColumn` gains `subject`/`section`; `OverallResponse` gains optional labels; `OverallInput` gains optional `department`, `showSubjectColumn`, `showSectionColumn`; the `Subject:` header line is omitted when the column is on; the widths and the renderer cases.
- `lib/__tests__/xlsx-overall.test.ts` — the existing cases unchanged; new cases for the columns, the header, the per-response values, the print area.
- Proof: `npx vitest run lib/__tests__/xlsx-overall.test.ts`.

### Slice 2 — the Individual tab name

- `lib/xlsx/overall-summary.ts` — `sheetName?` on `renderFacultySummarySheet` / `buildFacultySummaryWorkbook` (default `Faculty Summary`).
- `lib/__tests__/xlsx-overall-summary.test.ts` — the default unchanged; the override `Individual`.
- Proof: `npx vitest run lib/__tests__/xlsx-overall-summary.test.ts`.

### Slice 3 — the grouped Comments

- `lib/xlsx/form-model.ts` — the `group` row kind.
- `lib/xlsx/comments.ts` — `buildGroupedCommentsModel`; the renderer's `group` case (the banner style); the print titles stop before the first group.
- `lib/__tests__/xlsx-comments.test.ts` — the existing cases unchanged; the group cases.
- Proof: `npx vitest run lib/__tests__/xlsx-comments.test.ts`.

### Slice 4 — the consolidated workbook

- `lib/xlsx/consolidated-workbook.ts` — new: `buildConsolidatedFacultyWorkbook({ individual, comments, overall })`, the three sheets in order, no media.
- `lib/__tests__/xlsx-consolidated-workbook.test.ts` — new: the tab order/names, the three sheets' content, the subject/section columns, the grouped comments, the read-back, the `ACES_SAMPLE_PATH` hook.
- Proof: `npx vitest run lib/__tests__/xlsx-consolidated-workbook.test.ts`.

### Slice 5 — the consolidated ZIP assembly

- `features/evaluation-results/consolidated-zip.ts` — new: `buildConsolidatedFacultyZip(options)`; the period/department reads, the scope check, the guard, the pool, the failures, the empty member, the tree, `_INCOMPLETE.txt`.
- `features/evaluation-results/department-zip.ts` — export `mapPool` / `entryName` only; no behaviour change.
- `lib/__tests__/consolidated-zip.test.ts` — new: the tree, one file per member, the empty member, the guard, the unknown department/faculty, the failure skip, the workbook builder mocked.
- Proof: `npx vitest run lib/__tests__/consolidated-zip.test.ts lib/__tests__/department-zip.test.ts`.

### Slice 6 — the admin route

- `app/api/admin/evaluation-results/export/consolidated/route.ts` — new: thin, `requireAdmin`, the period, the scope, the verdict, the ZIP, the filename, `maxDuration = 60`, the Lesson 8 error.
- `lib/__tests__/admin-consolidated-export-route.test.ts` — new: auth, period, content type/disposition, 404, the refusal.
- Proof: `npx vitest run lib/__tests__/admin-consolidated-export-route.test.ts`.

### Slice 7 — the dean twin

- `app/api/dean/evaluation-results/export/consolidated/route.ts` — new: `hasRole(DEAN)`, the dean's own department, a foreign id 403, `assertPeriodIsActive`, the verdict.
- `lib/__tests__/dean-consolidated-export-route.test.ts` — new.
- Proof: `npx vitest run lib/__tests__/dean-consolidated-export-route.test.ts`.

### Slice 8 — the surface

- `features/evaluation-results/components/DepartmentZipButton.tsx` — `filenamePrefix?` (default the existing filename).
- `app/admin/evaluations/results/[departmentId]/page.tsx` — the second button.
- `app/dean/evaluations/results/[departmentId]/page.tsx` — the second button.
- `lib/__tests__/department-page-export-button.test.tsx` — the second button on both pages, the URL, the label, the disabled rule.
- `lib/__tests__/department-zip-button.test.tsx` — the filename prefix.
- Proof: `npx vitest run lib/__tests__/department-page-export-button.test.tsx lib/__tests__/department-zip-button.test.tsx`.

### Slice 9 — the handover and TODO.md

- `docs/evaluation-export-handover.md` — new: the entry point for the export area (Part I, Part II, Part III), naming `specs/evaluation-results-export.md` (Part III), `specs/evaluation-results-export/05-consolidated-faculty.md`, and `specs/evaluation-results-faculty-card-average.md`; what not to redo; the traps; the owner's proof.
- **Replace** `docs/evaluation-results-cache-handover.md` — one handover at a time; the old note's durable content is in `specs/evaluation-results-faculty-card-average.md`.
- `TODO.md` — replace the cache handover row in **Handovers** with the new note; add the owner's gate + Excel proof to **Next** until confirmed.
- `specs/evaluation-results-export.md` — the status/§24 row (or slice 0).
- No code. Proof: review + the owner's gate.

### The owner's proofs

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
ACES_SAMPLE_PATH=/tmp/consolidated-sample.xlsx npx vitest run lib/__tests__/xlsx-consolidated-workbook.test.ts
```

Open the sample: the three tabs in order; the Individual's `Average` equals the Faculty Card's; the Comments grouped by subject-section; the Overall's `SUBJECT`/`SECTION` columns, continuous `NO`, the header repeating on every printed page.

### Blast radius

- `lib/xlsx/overall.ts`, `overall-summary.ts`, `comments.ts`, `form-model.ts` — the optional model extensions; the existing subject workbook and the existing ZIP must not move (the existing tests are the guard).
- `features/evaluation-results/department-zip.ts` — exports only.
- `DepartmentZipButton.tsx` — the optional filename; the existing call sites unchanged.
- The two department pages — a second button; the existing button unchanged.
- `proxy.ts` / `lib/access.ts` — no change.
- The specs, the handover, TODO.md, the tests.

### Out of scope

The existing department ZIP; the subject-grain workbook and its routes; the faculty's own page; the list page's export; the PDFs; the CSV; the Reports module; the database/schema; the general-rating arithmetic; the Highest/Lowest live-rubric seam.
