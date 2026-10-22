# Evaluation results — the export (the Excel workbook)

**Status:** Final (Part I) · **Part II (v5.0) Final**
**Version:** 5.0
**Last Updated:** 2026-10-22
**Scope:** exporting one evaluation result set as an **Excel workbook**, at the grain of one
(faculty × subject × section) — the drill-down's subject page
(`/admin/evaluations/results/[departmentId]/[facultySubjectId]`) and the faculty's own page
(`/faculty/evaluations/results/[facultySubjectId]`).
⭐ **v5.0 carries a second grain — Part II:** the **consolidated department-faculty workbook**,
served from the faculty cards
(`app/admin/evaluations/results/[departmentId]` and the dean twin). Part I is untouched.

> ⭐ **v4.0 (2026-10-22) — the workbook is GENERATED FROM SCRATCH.** v3 made the legacy a
> *style donor*; v4 does not read it at all. The template file and the cut script stay in the
> repo as the **reference** (what the legacy looks like) and **nothing reads them at runtime**.
> Three consequences: the workbook is built by `lib/xlsx/` (a style table, a writer, a form
> model, one renderer per sheet); the layout **follows the rubric**, so a rubric that gains a
> statement makes a longer form and there is nothing to drift; and the **Overall sheet's grain
> changed** — it is now **one row per student response**, not one row per faculty.
>
> **The mechanics live in this file** — §9 (Part I) and §22 (Part II); the work's tracking is
> `docs/evaluation-export-department-handover.md`. This file is the **contract**.
>
> ⭐ **v5.0 (2026-10-22) — a SECOND grain, not a change to the first.** The department drill-down
> gains an **Export Excel** button that serves one workbook covering **every member and every
> subject-section of the department** — the "Individual" sheet stacked one full form per
> subject-section, and an **Overall sheet that is a new SUMMARY model** (one row per
> subject-section under a per-faculty band), not the per-response sheet. **No Comments sheet at
> this grain.** The subject-grain workbook (§1–14) is untouched. Part II is **§15–26**.

---

## 1. Why it exists

The school produces its evaluation results as a **spreadsheet**: a per-faculty evaluation form
(the "Individual" sheet), a comments sheet, and a flat table (the "Overall" sheet). That
workbook — `docs/eval reports.xlsx` — is the artifact they circulate. The app produces the same
*numbers* on screen, but not the same *artifact*.

The legacy form's column I holds one value per rubric **statement** (34 of them). The app
aggregates per **criterion** (8). The statement-level numbers are not computed anywhere else —
and they are what the form prints.

---

## 2. The decisions

| # | Decision | Owner |
|---|---|---|
| D1 | ⭐ **SUPERSEDED (v4)** — the workbook is **generated from scratch**; the template is the reference, read by nothing at runtime | 2026-10-22 |
| D2 | The output is the **entire workbook** — all three sheets — with the **formulas replaced by their values** | 2026-10-22 |
| D3 | The **PDF is not touched.** It keeps its shape, its letterhead and its 30-comment truncation | 2026-10-22 |
| D4 | The letterhead is the repo's own `public/logo-blk.png` | 2026-10-22 |
| D5 | ⭐ **SUPERSEDED (v4)** — the **Overall sheet carries one row per student response** | 2026-10-22 |
| D6 | The pilot is the **subject page** — admin, dean **and** the faculty's own page | 2026-10-22 |
| D7 | The export is a **server route** that returns the workbook as a download | 2026-10-22 |
| D8 | ⭐ **SUPERSEDED (v4)** — the template is a style donor → **the template is not read at all** | 2026-10-22 |
| D9 | The **criterion names and the statement texts are the app's** — the rubric's wording, not the legacy's typed wording | 2026-10-22 |
| D10 | ⭐ The workbook is **three sheets** — Individual, Comments, Overall — in the **legacy's tab order** | 2026-10-22 |
| D11 | ⭐ The **Overall sheet's columns follow the live rubric**, and the value under a column is that response's **live** average for that criterion | 2026-10-22 |
| D12 | ⭐ The **respondents stay anonymous** — a row's identity is its **position** (`NO` 1..N); the evaluation id is never printed | 2026-10-22 |
| D13 | ⭐ The **print setup is authored** — portrait Letter for the two narrow sheets, **landscape** for the wide Overall sheet; fit one page wide, as many pages as it needs | 2026-10-22 |
| D14 | ⭐ The **letterhead is optional** — a missing logo must **not** fail the export | 2026-10-22 |
| D15 | ⭐ The **Comments sheet carries the text and nothing else** — one comment per row, **no date** | 2026-10-22 |

### 2.1 What v4 removes

- ⭐ **The position map.** There is no list of cell references to keep in step with anything —
  the rows are written where they belong.
- ⭐ **The formula-reading.** No `AVERAGE` cell is read for anything.
- ⭐ **The rubric-drift guard.** The layout follows the rubric; a rubric that gains a statement
  simply produces a longer form.
- ⭐ **The legacy's typos and its singular headings.** The form says what the students rated,
  and the headings say the rubric's own names (D9).
- ⭐ **The template at runtime.** Nothing reads `data/templates/eval-report.xlsx`.

---

## 3. The rules the export lives by

1. ⭐ **The workbook is generated, not edited.** The template file and `scripts/cut-eval-template.mjs`
   are the **reference** — they stay in the repo, and they are the reference tool.
2. ⭐ **The rubric is data, and it changes between periods.** The export reads the **live**
   rubric (`rubricRepository.getCategoriesWithItems(period.rubricGroupId)`, by `displayOrder`).
   ⭐ **Nothing may assume a criterion count.**
3. ⭐ **The form is a MODEL; the renderers are separate.** The model says what the form *is*;
   the renderer says how it is drawn. So the HTML preview (deferred) reads the same rows and
   cannot disagree with the export about the content.
4. ⭐ **The look is ours, in tokens.** A cell asks for a *token* (`criterion`, `statementRating`),
   never a style id; the ids are derived from the table's order, so a token cannot point at the
   wrong format.
5. ⭐ **The print setup is authored** (D13).
6. ⭐ **The letterhead is optional** (D14). The numbers are the artifact; the letterhead is
   decoration.
7. ⭐ **One read serves the page and the export** — §7.3.

---

## 4. The output's shape

### 4.1 Sheet 1 — "Individual" (the form)

The letterhead band, then the title, the period's two lines and the teacher's fields, then the
program, the section and the subject, then **one block per criterion of the live rubric**, then
the footer.

```
  [band]        the letterhead (public/logo-blk.png), 50 mm wide, centred, at its own aspect
  FACULTY PERFORMANCE EVALUATION — STUDENTS POST-EVALUATION
  Semester: …
  Evaluation Period: …
  Employee No  │ …        │ Rating   │ …
  Employee Name│ …        │ Remarks  │ …
  Program      │ …
  Section      │ …
  Subject      │ …
  I. <the rubric's criterion name>                          │ RATING
  1. <the rubric's statement>                               │ 4.40
  2. …                                                     │ 4.30
  AVERAGE                                                  │ 4.35
                        TOTAL RESPONDENTS │ 32
                        FINAL RATING        │ 4.20
```

- The criterion's **number is computed** (`roman()`), so a thirteenth criterion prints `XIII`.
- The **statement rows' heights follow the text**; a statement nobody rated is a **blank value**.
- **Portrait** Letter, print area `A:I`, the header block repeats on every page.

### 4.2 Sheet 2 — "Comments"

The **same header block**, then the `COMMENTS AND SUGGESTIONS` banner, then **one comment per
row**:

- ⭐ **the comment's TEXT is in the merge's anchor (`A`)** — the legacy's comment rows are merged
  `A:I`, so a cell outside the anchor is swallowed and the reader sees nothing;
- ⭐ **no date** (D15);
- the row's height follows the text (a floor of 40.5 pt).

### 4.3 Sheet 3 — "Overall"

⭐ **One row per student response** — "the actual evaluation scores FOR EACH student response"
(the owner).

- **The header block**: the result title (*Faculty Performance Evaluation Result
  (Post-evaluation)*), the **term**, the **faculty's name** and the **subject** — the constants
  that used to be columns.
- **The table's header**: `NO · DATE · <the rubric's criteria> · GENERAL RATING · REMARKS`.
- One row per response, **in the response set's order**; the date is `YYYY-MM-DD`.
- ⭐ **The criteria columns are derived from the live rubric** (D11), so a new rubric set changes
  them — and ⭐ **the value under a column is that response's live average for that criterion**,
  read from the per-response map the read already carries. A rubric with a ninth criterion gets a
  ninth column **with a value under it**, not an empty column under a name.
- ⭐ **The respondents stay anonymous** (D12): the row's identity is its position (`NO` 1..N).
  ⭐ The **evaluation id is never printed** — it ties a row to a student's response, and the
  sheet is circulated.
- ⭐ The **comments are not repeated here** — that is the Comments sheet's job.
- ⭐ **Landscape** (D13), the print area is its own columns, and its header rows repeat on every
  page.
- ⭐ **The department is not printed.** The legacy's Overall sheet carried it as column N; at
  this grain it would repeat on every row, and the handover's settled header block does not carry
  it. The program implies it.

---

## 5. The field contract

| Field | Source | Rule |
|---|---|---|
| **Employee No** | `users.employeeNo` | already in `USER_SELECT` (`lib/db/common.ts`), so `userRepository.findById` returns it. Empty is printed as an em dash, never as a fake value |
| **Employee Name** | `users.name` | |
| **Program** | `sections.program` | the row's own section |
| **Section** | `sections.name` | the row's own section |
| Subject Code / Name | `subjects.code` / `subjects.name` | the Individual sheet's `Subject` row and the Overall's header block |
| **Semester** | `semesters.title` | e.g. `SY 2026-2027 First Semester` |
| **Evaluation Period** | `evaluation_periods.name` | e.g. `SY 2026-2027 First Semester - Evaluation` |
| Rating | the general rating | §6 |
| Remarks | `getRemark(general)` | Outstanding / Very Satisfactory / Satisfactory / Unsatisfactory / Poor |
| TOTAL RESPONDENTS | the number of counted responses | the responses the figures are computed over |
| **the statement ratings** | each statement's mean over the counted responses | §7.1 |
| **the criterion averages** | each criterion's mean over the counted responses | §6 |
| **FINAL RATING** | the general rating | §6 |
| the criterion **names** | the rubric's category names | D9 |
| the statement **texts** | the rubric's statement texts | D9 |
| the Overall's per-response values | each response's **live** average per criterion | D11 |

**Program and Section are printed as two fields.** The app's display helper `sectionLabel` joins
them into `BSCS-A`; the workbook prints them separately, because they are different things.

---

## 6. The arithmetic

### 6.1 What the app does

`computeGeneralRating(catAverages)` (`lib/evaluation-utils.ts`) is the **unweighted mean of the
eight criterion averages**, and each criterion average is the mean over that criterion's **rating
rows** (`computeCategoryAverages`).

### 6.2 What the legacy workbook does

`I78 = AVERAGE(I15,I24,I31,I38,I45,I60,I66,I75)` — the mean of the eight criterion averages,
each of which is the mean of its statement cells.

### 6.3 They agree — exactly

A **submitted** evaluation has **every** statement rated: the submit button is disabled until
they are all answered. So every counted response contributes exactly one rating to each of the
34 statements, which makes a criterion's mean over its rating rows **equal** to the mean of its
statement means. The app and the legacy compute the same number.

⭐ **The export writes the app's own computed values.** The workbook is a **report**, not a
worksheet: the formulas are replaced by their values (D2), so the school can read it, print it
and mail it, but cannot retype a rating and watch the average recompute.

### 6.4 The question that is *not* blocking

The app weights each **criterion** at 1/8; a **pooled** mean over the rating rows would weight
each **statement** at 1/34, and because the criteria carry unequal statement counts
(3 · 6 · 4 · 4 · 4 · 4 · 3 · 6) the two differ.

*Worked example* — criterion II (6 statements) at 5.00, the other 28 at 4.00:

| | value |
|---|---|
| criterion-equal (the app, and the legacy) | `(5.00 + 4.00 × 7) / 8` = **4.125** |
| pooled over the rating rows | `(6 × 5.00 + 28 × 4.00) / 34` = **4.176** |

Which is right is a **product** question — *"are the eight criteria what we are rating, or the
34 statements?"* ⭐ The **legacy agrees with the app**, so reproducing the legacy is not blocked
by it. If the owner ever wants the pooled mean it is **one function** and it moves every surface
at once. It should be **its own slice, decided on its own** — and **not decided by an export**.

---

## 7. What the export reads

### 7.1 The statement ratings

The form's column I is **per statement** (34). The app aggregates **per criterion** (8). The
statement's identity used to be lost at the read boundary — the read selected `itemId` and then
dropped it. It now survives:

- `lib/db/common.ts` — `RatingWithCategory` carries `itemId`, the item's `text` and
  `displayOrder`, and the criterion's `displayOrder`.
- `lib/types/evaluation.ts` — `EvaluationRatingRow` follows.
- `lib/evaluation-utils.ts` — `computeItemAverages`, the statement grain, one below
  `computeCategoryAverages`. The mean is left raw; the caller rounds.

### 7.2 The rubric — the source of truth for the LAYOUT

The export reads the **rubric** (`rubricRepository.getCategoriesWithItems(groupId)`, the group
coming from the period's `rubric_group_id`) and the **ratings** (for the numbers).

⭐ That split is what makes the generated form work: the rubric says **what the form is** — how
many criteria, how many statements each, what they say — and the ratings say **what they
scored**. So a criterion nobody rated still gets its block, with its value blank; a rubric that
gains a statement simply makes a longer form.

⭐ **The live per-response map.** Each response's row carries `categoryAverages` — the rubric's
category names to that response's average. It is computed from the ratings the read already has,
so carrying it **costs nothing and adds no query** — and it is what lets the Overall sheet's
columns follow the rubric **with values under them** (D11).

### 7.3 One read for the page and the export

`getSubjectResultSet(facultySubjectId, evaluationPeriodId)` in
`features/evaluation-results/evaluation-results.service.ts` does the read **once** for the
export. The **guards stay with the routes** — they are per role, and the dean and the admin do
not see the same subjects.

⚠️ **Open:** the three **subject-page** read routes still read the repositories themselves
(`groups/[facultySubjectId]/route.ts`, and the faculty's twin), so the page and the export agree
**by convention, not by construction**. Moving them onto the shared read is a separate slice.

### 7.4 The order

The response set's order is a **total** order: the read orders by **(`createdAt`, `id`)**.
⭐ `"createdAt"` is NOT NULL and `id` is the primary key, so every row has a defined place —
whereas ordering by `"submittedAt"` (nullable) left the nulls unordered, and two exports of the
same data could print the responses in a different order. ⭐ **The order never changes a figure**:
the averages are computed over sets.

---

## 8. The routes

| Route | Guard |
|---|---|
| `app/api/admin/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/export/route.ts` | `requireAdmin` + `isSubjectInDepartment` (D9) |
| `app/api/dean/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/export/route.ts` | `hasRole(DEAN)` + the dean's own department + `assertPeriodIsActive` + `isSubjectInDepartment` |
| `app/api/faculty/evaluation-results/subjects/[facultySubjectId]/export/route.ts` | `auth` + `assertPeriodIsActive` + **the visibility map** + the assignment is the faculty's own |

⭐ **The export must never become a way around its read route's 403.** Each route keeps its own
guards; the faculty's export carries the **visibility map** (`getVisibilityMap`), so a period
whose results the dean has not enabled is not exportable.

Each route reads, builds the workbook and returns it as a download
(`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).

---

## 9. The mechanics — where the code is

| Piece | Where |
|---|---|
| the style table (semantic tokens → the derived cell formats) | `lib/xlsx/styles.ts` |
| the writer (the package: shell, rels, content types, styles, sheets, drawings, media) | `lib/xlsx/writer.ts` |
| the form model (the pure model: the kinds of row, the header block, the criterion blocks, the footer, the row heights) | `lib/xlsx/form-model.ts` |
| the Individual renderer | `lib/xlsx/individual.ts` |
| the Comments model + renderer | `lib/xlsx/comments.ts` (+ `lib/xlsx/rows.ts`) |
| the Overall model + renderer | `lib/xlsx/overall.ts` |
| the workbook (the glue: model → renderer → writer → bytes) | `lib/xlsx/workbook.ts` |
| the letterhead (the ONE server module — it reads `public/logo-blk.png`) | `lib/xlsx/letterhead.ts` |
| the zip reader + the cell/row rules the cut script shares | `lib/xlsx-template.ts` |
| the cut script (the **reference tool** — it re-cuts the legacy when it changes) | `scripts/cut-eval-template.mjs` |
| the legacy (the artifact the school circulates — the reference) | `docs/eval reports.xlsx` |
| the cut template (the reference) | `data/templates/eval-report.xlsx` |

⭐ **No new dependency.** The workbook is built by the repo's own code.

⭐ **The tracing.** The letterhead is read from the filesystem **by path**, and a file nothing
imports is invisible to Next's tracing — so `next.config.ts` keeps
`outputFileTracingIncludes: { "/api/**/*": ["./public/logo-blk.png"] }`. Without it the export
works locally and loses its logo in production. ⭐ The **template is no longer traced** — nothing
reads it at runtime.

---

## 10. The risks

| Risk | Severity | Handling |
|---|---|---|
| **The generated form is taller than the legacy's** — the header is bigger and the statement wording is longer | medium | the page count is a **proof** before the Excel ships; the type size and the row heights are the levers |
| **A statement's text is too long for its row** | medium | the statement rows' heights follow the text's length, as the legacy's own do |
| **A criterion's name does not fit the Overall's header row** | medium | the table's header row grows with the longest heading — the rubric is data, so a longer name is a taller row, never a clipped label |
| **The letterhead is absent in production** | medium | `outputFileTracingIncludes` (§9) |
| **A malformed part** — Excel refuses the file | high | read-back assertions in the tests, and ⭐ **the Excel proof** (§14) — Excel is the judge |
| **The rubric is edited between the read and the build** | very low | the rubric and the ratings are read together; a change between them is a stale form, not a wrong one |
| **The respondent count moves off the sheet** | low | the Overall's rows carry it (one row per response); the Individual's footer carries it too |

---

## 11. What this does **not** do

- **The PDF.** It is not reshaped, not re-letterheaded, and its 30-comment truncation stays (D3).
  Its four live defects are recorded in §12.
- **The period-level export** — every department, every faculty, every subject, in one download.
  The existing CSV export stays as it is.
- **The general rating's arithmetic** (§6.4) — one function, every surface, a product decision.
- ⭐ **The legend** ("Interpretation of Data"). The legacy's is a DrawingML **textbox**, and the
  cut had to correct its wording **by hand** because it disagreed with the app's `getRemark`. The
  new writer draws **pictures only**, so the legend becomes a **block of cells** — and to do it
  properly the rating ladder must stop being hard-coded inside `getRemark`
  (`lib/evaluation-utils.ts`) and become data that both the remark and the legend read.
- **The HTML preview page** — it comes off the same model, when it comes.
- **Deleting the template file** — the owner's: *"we may delete it but not just now"*.

---

## 12. What the PDF is carrying (for the slice that takes it)

| Defect | Where |
|---|---|
| The PDF prints `Semester: Semester` | `lib/evaluation-pdf.ts` — `semesterLabel` is passed by **no one**: not the admin page, not the dean page, not the faculty page |
| The PDF prints no Section | `PdfData` has no section field, though the pages and the routes carry `sectionProgram` / `sectionName` |
| The PDF truncates the comments at 30 | `lib/evaluation-pdf.ts` — "… and N more comments", a silent truncation in a document that is meant to be the record |
| The PDF's per-faculty average is a mean of means | `lib/evaluation-pdf.ts` — it averages a teacher's **subject** averages, while every app surface pools across subjects via the totals. The outlier among the surfaces |

---

## 13. The slices

| # | Slice | State |
|---|---|---|
| 1 | **The statement ratings** — the item identity through the read + `computeItemAverages` | **done** (`abcc919`) |
| 2 | **The routes** — the period/semester read, `employeeNo`, the section on the faculty route | **done** (`13ade13`) |
| 3 | **The cut** — the template, the letterhead, the tracing | **done** (`ef71931`, `bec0132`) — ⭐ **the template is now the reference only** |
| 4 | **The generator** — the style table, the writer, the form model, the Individual renderer, the workbook, the letterhead | **done** |
| 5 | **The Comments sheet** — the text in the merge's anchor | **done** |
| 6 | **The Overall sheet** — one row per response, the rubric's columns derived | **done** |
| 7 | **The workbook's three sheets together** | **done** |
| 8 | **The route flip** — the three routes build from the generator; the donor is deleted; the tracing keeps the letterhead | **done** |
| 9 | **The order** — the response set's order is total (`createdAt`, `id`) | **done** |
| 10 | ⭐ **The Excel proof** — open it in Excel and print it | **the owner's** — the hook: `ACES_SAMPLE_PATH=/tmp/eval-sample.xlsx npx vitest run lib/__tests__/xlsx-workbook.test.ts` |

**Gate (the owner's run):**

```
npx tsc --noEmit  →  npm run lint  →  npx vitest run  →  npm run build
```

---

## 14. The proofs — and what only the owner can do

1. **The gate** (§13).
2. ⭐ **The Excel proof — the one no test can do.** The hook writes the real workbook, built
   from the app's own rubric (8 criteria, 34 statements): **open it in Excel and print it.** A
   malformed part is invisible to every assertion; Excel is the judge. What to look for: the
   three tabs in order; the letterhead centred over the form; the **comments' text visible** (not
   just a date); the **Overall sheet landscape**, one row per response, the rubric's criteria as
   columns with values under them; the header rows repeating on every page.
3. ⭐ **The tracing proof** (after a build): `logo-blk.png` is in the bundle; `data/templates` is
   not.

**Open questions:**

- ⭐ **The page count** — the generated form's height against the legacy's two pages is a
  **proof**, not a decision. If it runs to three, the target is two and the type size moves.
- ⭐ **The statement ratings and the school** — the legacy's item cells are typed by hand; the
  app's are computed (D2, §6.3). Is there any expectation that the school *edits* the
  workbook's ratings before circulating it? That is the one thing the "formulas → values" trade
  costs.
- ⭐ **The subject-page routes onto the shared read** (§7.3) — so the page and the export agree
  by construction.

---

# Part II — the department-faculty grain (the consolidated workbook) ⭐ v5.0

## 15. Why a second grain

Part I exports **one subject-section** — the download for one drill-down page. The department
asks for the opposite: **one download that covers everything the faculty cards show** —
*"a summary of ALL evaluations (subject-section)"* (the owner, 2026-10-22) — department →
faculty → subject-section, in one file.

The parts are **reused, not re-invented**: the Individual sheet is stacked, one full form block
per subject-section, byte-for-byte the Part I form; the Overall sheet is a **new summarized
model** at this grain (per subject-section rows), not the per-response sheet. The subject-grain
export (§1–14) is untouched.

## 16. The decisions

| # | Decision | Owner |
|---|---|---|
| D20 | The download covers the **whole department** — one workbook, one button on the department page | 2026-10-22 |
| D21 | The Individual sheet **stacks the full form** — one block per subject-section, Part I's own rows (§4.1) | 2026-10-22 |
| D22 | **No Comments sheet** — the consolidated workbook is **Individual, Overall** (comments stay on the subject-grain export) | 2026-10-22 |
| D23 | The coverage **follows the department page**: every member (each a band, with or without results — §3.15), every subject-section the drill-down shows (teaching this term ∪ the assignments the counted responses point at — §3.16); an unevaluated section prints **"—"** and blank Highest/Lowest | 2026-10-22 |
| D24 | The routes are **admin + the dean twin**; the faculty role does not apply at this grain | 2026-10-22 |
| D25 | ⭐ The Overall sheet at this grain is a **new SUMMARY model** — one row per subject-section under a **per-faculty band** (name, email, pooled average + remark); it does **not** replace the per-response Overall | 2026-10-22 |
| D26 | Highest/Lowest print **every tie**, comma-joined (`"Professional Manner 3.60, Student Engagement 3.60"`) — the 2026-10-21 rule ("all, not just the first"). ⭐ The owner's example printed one per column because one tie happened to exist; veto this decision if the columns should carry the first tie only | 2026-10-22 |

## 17. The output's shape

### 17.1 Sheet 1 — "Individual" (stacked)

**One block per subject-section**, in the workbook's order (below). Each block is
`buildFormModel(form)` **exactly as Part I builds it** (§4.1): the letterhead band, the title,
the period's two lines, the teacher's fields (`Employee No │ Rating`, `Employee Name │ Remarks`),
the program, the section, the subject, **one block per criterion of the live rubric** (the
statement values per subject-section), the footer (`TOTAL RESPONDENTS`, `FINAL RATING`). A
subject-section nobody evaluated gets its block with **"—"** for every statement value and a
blank criterion average (§4.1's rule).

- ⭐ **The letterhead hangs per block** — every form block prints complete, as the legacy's
  single-subject form does. The media is **one image**, drawn once per block's band: the writer
  learns **multiple picture anchors per sheet** (`picture → pictures`), joining one
  `oneCellAnchor` per block into the drawing part (§22).
- ⭐ **A manual page break is authored before every block** — each form starts on its own page.
- ⭐ **No print titles on this sheet.** A sheet-top repeated header would print block 1's faculty
  over block 50's form — mislabeled pages. (Part I's sheet keeps its `printTitles`; the block is
  short enough that a block spanning two pages prints its overflow without a header — a
  **known trade-off** recorded in §23.)
- ⭐ **The workbook's order is stated and total**: members by **name ascending**
  (`localeCompare`, the account id as the tiebreak), their subject-sections by **subject code
  ascending**, then **section label ascending**. Two exports of the same data print the same
  rows (§7.4's rule at this grain). The blocks of the Other sheet follow the same order.

### 17.2 Sheet 2 — "Overall" (the summary)

The **summary of every subject-section, grouped by faculty** — the department page's
faculty cards, as rows:

```
  Faculty Performance Evaluation Result (Post-evaluation)
  Semester: …
  Evaluation Period: …
  Department: Computer Studies (CCS)
                                                          (per member:)
  Alamo, Nino Francisco
  nf.alamo@lyceumalabang.edu.ph
  Average: 3.67 — Very Satisfactory
  SUBJECТ            SECTION      AVG RATING   HIGHEST                LOWEST
  1815-ITELEC009 …   BSIT-31E1     3.38        Professional Manner 3.60   Assessment & Feedback 3.25
  1815-ITELEC009 …   BSIT-31E2     3.87        …                      …
  1815-ITELEC009 …   BSIT-31E3     4.02        …                      …
  (next member's band, then theirs)
```

- The **header block** carries the workbook's constants: the result title, the term, the
  evaluation period, and **the department** (`name (code)`) — at this grain the department is
  the scope, so it is printed here (Part I's Overall does not print it; §4.3's reason does not
  apply).
- **The per-faculty band is three rows**: the name, the email, and the pooled average + remark
  (`Average: 3.67 — Very Satisfactory`; a member with no counted responses prints `—` and no
  remark). A member with **no subject-sections at all** still prints their band — nothing after
  it (a member with nothing to show is still a member).
- **The table is five columns**: `SUBJECT │ SECTION │ AVG RATING │ HIGHEST │ LOWEST`.
  - **Subject** = `${code} ${name}`; **Section** = the joined display label
    (`sectionLabel(program, name)` — the summary table is a display artifact; the FORM keeps
    Part I §5's two fields).
  - **Avg Rating** = the subject-section's general rating (2 dp).
  - **Highest / Lowest** = `findHighestLowestRubrics` over that subject-section's criterion
    averages, **every tie**, comma-joined as `"Label score"`.
  - ⭐ **Respondents are not a column** — the card does not show one, and the Individual block's
    footer carries the count for its own subject-section.
- **Landscape** (the legacy's Overall sheet is wide; the Highest/Lowest cells are long), the
  print area is its own columns, fit one page wide.
- ⭐ **A section with no evaluations prints a row**, not nothing: `—` for the rating, blank
  Highest/Lowest (D23).

## 18. The field contract

The **Individual blocks' fields are §5's**, unchanged, once per subject-section. What this grain
adds:

| Field | Source | Rule |
|---|---|---|
| the band's **name / email** | the department's members (`listFacultyByDepartment`) | as the card shows them |
| the band's **employeeNo** (the Individual's `Employee No`) | the members read already carries it (`USER_SELECT_INNER` — no new read) | §5's rule (empty → em dash) |
| the band's **average + remark** | `facultyAggregates` — the pool of the member's subject totals (`aggregateFacultyResults`) | ⭐ **the card's figure, not a mean of the card's subject averages** — a mean cannot be un-meaned (§3.14/§3.18); the pooled figure over that member's counted responses |
| Overall's **Avg Rating** | the subject-section's general rating | §6.1's arithmetic on that subject-section's ratings |
| Overall's **Highest / Lowest** | `findHighestLowestRubrics` | the card's own values — §3.18 by construction |

## 19. The arithmetic — inherited

§6 applies **verbatim**, per subject-section and per member band:

- a **row's** Avg Rating = that subject-section's criterion averages, meaned criterion-equal
  (`computeGeneralRating`) — the same helpers the card uses;
- a **band's** average is the **pool of the member's subject totals** — the mean over the
  member's rating rows (`aggregateFacultyResults`), **not** the mean of the band's subject
  averages (the same pooling rule the card lives by);
- ⭐ the parity is **by construction**: the export's rows and bands are computed from the same
  response set by the same helpers as the cards — a row **must equal** the card's row for the
  same subject-section (§3.18).

## 20. What it reads — one read, extended

`getDepartmentSubjectResults(evaluationPeriodId, departmentId, { statementAverages: true })`
in `features/evaluation-results/evaluation-results.service.ts`:

- ⭐ **The response set stays `listDepartmentResponseSet`** (§3.21) — the read the page uses,
  with the `evaluateeId` lesson already carried. **No new report of the set exists.**
- ⭐ The extension adds **what the page ignores**: per subject-section — the statement averages
  (`computeItemAverages` over that subject-section's ratings — the ratings read already carries
  `itemId`, the item's text and the display order) and the **live** criterion averages keyed by
  the rubric's category name; and the member's `employeeNo`. The **flag defaults to false and
  the page's payload does not change** (no statement averages across an admin API payload the
  page never renders).
- The **rubric** is read the same way the subject route reads it:
  `rubricRepository.getCategoriesWithItems(period.rubricGroupId)` by `displayOrder` — the form's
  layout (§7.2). **Nothing may assume a criterion count** (§3.2).
- ⭐ **No new queries**: the ratings read is the drill-down's own (`fetchRatingsWithCategories`,
  chunked and paged — Lessons 7 / 7b), and the comments are not read **at this grain** (D22 —
  the comments read is one fewer than the page's).

## 21. The routes

| Route | Guard |
|---|---|
| `app/api/admin/evaluation-results/departments/[departmentId]/export/route.ts` | `requireAdmin` + the department exists |
| `app/api/dean/evaluation-results/departments/[departmentId]/export/route.ts` | `hasRole(DEAN)` + **the dean's own department** + `assertPeriodIsActive` |

- ⭐ **The export must never become a way around a read route's 403** (the same rule as §8):
  the dean's export answers for **their department only**; the admin needs nothing beyond
  `requireAdmin` at this grain (the department is the parameter itself).
- Both carry **`maxDuration = 60`** (the read is live — rule 3 of the cache contract: a
  department drill-down is opened for a reason) and return the workbook as a download with the
  same Content-Type as Part I.
- The **filename** is `${departmentCode}_evaluation.xlsx` (the subject grain's
  `${subjectCode}_${facultyName}_evaluation.xlsx` carries its scope the same way; no period in
  the name, matching Part I).

## 22. The mechanics — the additions

| Piece | Where |
|---|---|
| the writer's **multi-picture anchors** (`picture → pictures`, one `oneCellAnchor` per block, ONE media entry) and **row breaks** (`rowBreaks`) | `lib/xlsx/writer.ts` — **backward compatible**; Part I's sheet keeps a single picture (as a one-element list) and carries no breaks |
| the stacked Individual's **model + renderer** | `lib/xlsx/individual-stacked.ts` — new; consumes the same `buildFormModel` rows |
| the Overall **summary** model + renderer | `lib/xlsx/overall-summary.ts` — new, the same tokens |
| the workbook (Individual-stacked + Overall-summary, **no Comments**) | `lib/xlsx/workbook.ts` — a **second** build function; `buildEvaluationWorkbook` is untouched |
| the client download | `lib/eval-export.ts` — a second function beside the subject-grain one |
| the button | the department summary card's button cluster (next to `Download PDF`), `IosButton variant="tinted" size="sm"`, **loading** — on **both** the admin and the dean twin pages |

⭐ No new dependency. Same tracing rule as Part I (§9) — the letterhead is already traced.

## 23. The risks

| Risk | Severity | Handling |
|---|---|---|
| A whole-department Individual is **long** — a department with 15 faculty × 5 subjects is 75 form blocks, ~150 printed pages | medium | the page break per block (§17.1) keeps every form printable; the fit is one page **wide**, by design |
| A block longer than one page prints its **overflow without a header** | low | the known trade-off §17.1 guards for — Excel repeats sheet-top titles, not per-block headers; the Part I grain keeps its `printTitles` and is untouched |
| The **multi-anchor letterhead** lands wrong | medium | the anchor arithmetic is `letterheadPicture` per block with the block's start row offset; assertions in the writer's tests |
| The department read is **live and slow** (2–4 s for GENED) | medium | `maxDuration = 60`, a loading button — the same handling as the subject export (§8's download rule) |
| The file's **order differs from the card's row order** | low | the workbook states a total order (§17.1); §3.18 compares **figures**, not row order — if the card should sort the same way, it is a separate one-line change, not this export's |
| A **tie** renders long in Highest/Lowest | low | the header/row heights follow the text (§10's handling, the same rule) |
| The export **drifts from the page** | very low | both read `getDepartmentSubjectResults` — one response set, one computation (§20) |

## 24. The slices

| # | Slice | State |
|---|---|---|
| 1 | **The writer** — multi-picture anchors + row breaks, backward compatible | pending |
| 2 | **The read** — the `statementAverages` option (+ the member's `employeeNo`), the page's payload unchanged | pending |
| 3 | **The Overall summary** model + renderer | pending |
| 4 | **The stacked Individual** model + renderer | pending |
| 5 | **The workbook** — the two-sheet variant + the glue | pending |
| 6 | **The routes** — admin + dean, the guards, `maxDuration`, the filename | pending |
| 7 | **The button** — the client helper + the two pages wired | pending |
| 8 | ⭐ **The Excel proof** — the owner's | pending |

## 25. The proofs

1. **The gate** (the owner's run): `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`.
2. ⭐ **The Excel proof** — open a department workbook and **print it**. What to look for: **two
   tabs** (Individual, Overall — **no Comments**); the letterhead **once per form block**; **each
   form starting on its own page**; the Overall's **per-faculty band then its rows**, and a
   thumb-against-the-card check — the band equals the card's pooled figure, a row equals the
   card's row for the same subject-section (§3.18); an unevaluated section prints `—`; the
   header block repeats the department on the Overall's pages.
3. ⭐ **The scope proof** — the dean's route answers **404/403 for a department that is not
   theirs**; the faculty role has no route at this grain.

## 26. What Part II does **not** do

- **The period-level export** (every department in one download) — untouched; the existing CSVs
  stay as they are (§11).
- **The Comments at this grain** — deliberately absent (D22); the subject grain keeps its
  Comments sheet.
- **The PDF** — not touched (D3 carries; §12's four defects stay the PDF slice's).
- **The dean twin's duplicated summary card** — a separate CLEANUP (decide) item in `TODO.md`;
  this export adds a button to both pages, it does **not** extract the card.
- ⭐ **A change to the subject-grain workbook** — Part I's three sheets, its guards and its
  routes are untouched by everything above.
