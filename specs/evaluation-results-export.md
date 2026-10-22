# Evaluation results — the export (the Excel workbook)

**Status:** Draft
**Version:** 3.0
**Last Updated:** 2026-10-22
**Scope:** exporting one evaluation result set as an **Excel workbook**, at the grain of one
(faculty × subject × section) — the drill-down's subject page
(`/admin/evaluations/results/[departmentId]/[facultySubjectId]`) and the faculty's own page
(`/faculty/evaluations/results/[facultySubjectId]`).

> **v3.0 (2026-10-22) — the design changed: the template is a STYLE DONOR, not the piece to
> fill in.** v2 filled the legacy's own cells. v3 copies the template's **header rows and its
> styling** and **generates the criterion blocks from the data**. Two consequences:
> the **position map, the formula-reading and the rubric-drift guard are all gone** — the layout
> now follows the rubric instead of being matched against a fixed template — and the
> **statement texts and the criterion names are the app's**, not the legacy's typed wording.
> The **PDF is out of scope** (it is not reshaped, and it keeps its 30-comment truncation).

---

## 1. Why it exists

The school produces its evaluation results as a **spreadsheet**: a per-faculty evaluation form
(the "Individual" sheet), a comments sheet, and a flat per-faculty table (the "Overall" sheet).
That workbook — `docs/eval reports.xlsx` — is the artifact they circulate. The app produces the
same *numbers* on screen, but not the same *artifact*.

The legacy form's column I holds one value per rubric **statement** (34 of them). The app
aggregates per **criterion** (8). The statement-level numbers are not computed anywhere today
— and they are what the form prints.

---

## 2. The decisions

| # | Decision | Owner |
|---|---|---|
| D1 | The Excel is produced by **filling the legacy workbook as a template** | 2026-10-22 |
| D2 | The output is the **entire workbook** — all three sheets — with the **formulas replaced by their values** | 2026-10-22 |
| D3 | The **PDF is not touched.** It keeps its shape, its letterhead and its 30-comment truncation | 2026-10-22 |
| D4 | The letterhead is the repo's own `public/logo-blk.png` | 2026-10-22 |
| D5 | The **Overall sheet carries one row** — the exported faculty × subject × section | 2026-10-22 |
| D6 | The pilot is the **subject page** — admin, dean **and** the faculty's own page | 2026-10-22 |
| D7 | The export is a **server route** that returns the workbook as a download | 2026-10-22 |
| D8 | ⭐ **The template is a STYLE DONOR, not the piece to fill in.** Its **header rows** and its **styling for each rubric** are copied; the criterion blocks are **generated from the data** | 2026-10-22 |
| D9 | ⭐ **The criterion names and the statement texts are the app's** — the rubric's wording, not the legacy's typed wording | 2026-10-22 |

### 2.1 Why D8 (and what it removes)

The legacy's form is a **fixed set of cells**: criterion I's three statements are at `I12`,
`I13`, `I14`, and so on. Filling it in place means the layout is a constant in the code, and
the rubric can outgrow it.

Copying the template's **styling** and **generating the rows** instead means:

- ⭐ **The position map is gone.** There is no list of cell references to keep in step with the
  template — the rows are written where they belong.
- ⭐ **The formula-reading is gone.** The template's `AVERAGE` cells are not read for anything.
- ⭐ **The rubric-drift guard is gone.** The layout follows the rubric, so a rubric that gains a
  statement simply produces a longer form. There is nothing to drift.
- ⭐ **The legacy's typos and its singular headings go with it.** The form says what the
  students rated, and the headings say the rubric's own names (D9).

The template still supplies everything that is *design*: the column widths, the fonts, the
borders, the number formats, the row heights, the `A:H` merges, the letterhead and its
position.

---

## 3. The output's shape

This is the legacy's layout, as the template carries it. The **rows in bold are generated**;
the rest is copied.

**Sheet 1 — "Individual"** (the form)

| Row | | Where it comes from |
|---|---|---|
| 1 | the letterhead band (the image) | **copied** — the template's drawing |
| 2 | blank | copied |
| 3 | `FACULTY PERFORMANCE EVALUATION — STUDENTS POST-EVALUATION` | copied (the value is written) |
| 4 | `Semester: …` | copied (the value is written) |
| 5 | `Evaluation Period: …` | copied (the value is written) |
| 6 | *(hidden)* | copied |
| 7 | `Employee No` │ … │ `Rating` │ … | copied (the values are written) |
| 8 | `Employee Name` │ … │ `Remarks` │ … | copied (the values are written) |
| 9 | `Program` │ … | copied (the value is written) |
| 10 | `Section` │ … | copied (the value is written) |
| **11+** | **the criterion blocks** | **generated** |
| **77** | `TOTAL RESPONDENTS` │ … | **generated** |
| **78** | `FINAL RATING` │ … │ … | **generated** |

**A criterion block**, per criterion of the rubric:

```
  [criterion header]   I. <the rubric's name>            │ RATING
  [statement]          1. <the rubric's statement>        │ 4.40
  [statement]          2. …                              │ 4.30
  [AVERAGE]            AVERAGE                            │ 4.35
  [spacer]                                              (blank)
```

**Sheet 2 — "Comments"** — the same header block (rows 1–10), then the `COMMENTS AND
SUGGESTIONS` banner, then **one comment per row**, each on a row 40.5 pt tall.

**Sheet 3 — "Overall"** — the header row (`NO · NAME · <8 criteria> · GENERAL RATING ·
REMARKS · NO OF RES. · DEPARTMENT`), then **one row**.

> The legacy's page-2 header repeat (rows 46–49) is **hidden** — it never printed, so the
> generated form has no page-2 header either. That is the legacy's own behaviour.

---

## 4. The template

### 4.1 Where it lives

**`data/templates/eval-report.xlsx`** — committed, and cut from `docs/eval reports.xlsx` by
**`scripts/cut-eval-template.mjs`**. The script is idempotent (it always starts from the
legacy), deterministic (two runs are byte-identical), and it **never edits the legacy**.

**Deployment.** The route reads the file from the filesystem, so it must be traced into the
serverless bundle. `next.config.ts` gets:

```ts
outputFileTracingIncludes: { "/api/**/*": ["./data/templates/**/*"] }
```

Without it the file is absent in production and the export 500s there while working locally.

### 4.2 The cut

The cut makes the legacy's header rows carry the fields the app has and the fields the school
reads, and it puts our letterhead in place of the legacy's banner:

| Where | Change |
|---|---|
| `r1` | the banner image is **replaced** by `public/logo-blk.png`, centred, at its own aspect |
| `r3` | the title — was hidden, now visible (the banner image used to carry it) |
| `r4` | `Semester: <semester>` — was hidden, now visible |
| `r5` | `Evaluation Period: <evaluation period>` — a new row, was hidden |
| `r9` | `Program` + its value cell |
| `r10` | `Section` + its value cell |
| sheet 2 | the same header block |
| the legend | the two bands that disagreed with `getRemark` corrected |

⭐ **The legacy's criterion blocks (rows 11+) are left in the template as the STYLE DONOR.**
The export reads their styles and their row heights, then replaces them with the generated
blocks — so the template keeps one of each kind of row, and the output has none of the legacy's.

### 4.3 The script's discipline

- ⭐ **It asserts the legacy's shape before cutting** — the cells' *text*, the hidden rows, the
  merges, the picture — and **refuses to run** if the legacy moved. The assertions are
  **semantic**, not style ids: a spreadsheet app renumbers the styles whenever it re-saves (the
  legacy's `A1` went from style `67` to `3`), and a semantic guard survives that.
- ⭐ **It reads back what it wrote** and checks every cell the export fills, the anchor's
  validity (a negative offset, or one wider than its own column, is how a drawing silently
  lands in the wrong place) and that the legend's textbox is still there.
- ⭐ **The cut script and the export share the cell rules** — Node 24 imports a `.ts` from a
  `.mjs` directly, so `scripts/cut-eval-template.mjs` imports `lib/xlsx-template.ts` and a cut
  and a fill cannot disagree about how a cell is edited.

---

## 5. The field contract

| Field | Source | Rule |
|---|---|---|
| **Employee No** | `users.employeeNo` | already in `USER_SELECT` (`lib/db/common.ts:16`), so `userRepository.findById` returns it. Empty is printed as an em dash, never as a fake value |
| **Employee Name** | `users.name` | |
| **Program** | `sections.program` | the row's own section |
| **Section** | `sections.name` | the row's own section |
| Subject Code / Name | `subjects.code` / `subjects.name` | |
| Department | `departments.name` (+ code) | the **teacher's home** department (contract §3.1) |
| **Semester** | `semesters.title` | e.g. `SY 2026-2027 First Semester` |
| **Evaluation Period** | `evaluation_periods.name` | e.g. `SY 2026-2027 First Semester - Evaluation` |
| Rating | the general rating | §6 |
| Remarks | `getRemark(general)` | Outstanding / Very Satisfactory / Satisfactory / Unsatisfactory / Poor |
| TOTAL RESPONDENTS | the number of counted responses | the responses the figures are computed over |
| **34 statement ratings** | each statement's mean over the counted responses | §7.1 |
| **8 criterion averages** | each criterion's mean over the counted responses | §6 |
| **FINAL RATING** | the general rating | §6 |
| the criterion **names** | the rubric's category names | D9 |
| the statement **texts** | the rubric's statement texts | D9 |

**Program and Section are printed as two fields.** The app's display helper `sectionLabel`
(`lib/evaluation-utils.ts:214-217`) joins them into `BSCS-A`; the workbook prints them
separately, because they are different things.

---

## 6. The arithmetic — current, and what needs to be done

### 6.1 What the app does today

`computeGeneralRating(catAverages)` (`lib/evaluation-utils.ts:148-156`) is the **unweighted
mean of the eight criterion averages**, and each criterion average is the mean over that
criterion's **rating rows** (`computeCategoryAverages`, `:84-96`).

### 6.2 What the legacy workbook does

`I78 = AVERAGE(I15,I24,I31,I38,I45,I60,I66,I75)` — the mean of the eight criterion averages,
each of which is the mean of its statement cells.

### 6.3 They agree — exactly

A **submitted** evaluation has **every** statement rated: the submit button is
`disabled={submitting || !allAnswered || !pledgeAgreed}`
(`app/(eval)/evaluate/[id]/page.tsx:760`). So every counted response contributes exactly one
rating to each of the 34 statements, which makes a criterion's mean over its rating rows
**equal** to the mean of its statement means. The app and the legacy compute the same number.

### 6.4 What needs to be done: **nothing, for this export**

The export writes the app's own computed values. The workbook is a **report**, not a
worksheet: the formulas are replaced by their values (D2), so the school can read it, print it
and mail it, but cannot retype a rating and watch the average recompute.

### 6.5 The question that is *not* blocking

The app weights each **criterion** at 1/8; a **pooled** mean over the rating rows would
weight each **statement** at 1/34, and because the criteria carry unequal statement counts
(3 · 6 · 4 · 4 · 4 · 4 · 3 · 6) the two differ.

*Worked example* — criterion II (6 statements) at 5.00, the other 28 at 4.00:

| | value |
|---|---|
| criterion-equal (the app, and the legacy) | `(5.00 + 4.00 × 7) / 8` = **4.125** |
| pooled over the rating rows | `(6 × 5.00 + 28 × 4.00) / 34` = **4.176** |

Which is right is a **product** question — *"are the eight criteria what we are rating, or the
34 statements?"* The **legacy agrees with the app**, so reproducing the legacy is not blocked by
it. If the owner ever wants the pooled mean it is **one function** and it moves every surface
at once. It should be **its own slice, decided on its own** — and **not decided by an export**.

> ⚠️ A related imprecision, recorded not fixed: the comment at
> `features/evaluations/evaluation-report.service.ts:134-135` ("this is the mean over the
> rating rows") is true of the eight criterion columns and **not** of the general rating.

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

**Purely additive** — the four existing consumers of `fetchRatingsWithCategories` read
`categoryId` and `name`, both unchanged.

### 7.2 The rubric — the source of truth for the LAYOUT

The export reads the **rubric** (`rubricRepository.getCategoriesWithItems(groupId)`, the group
coming from the period's `rubric_group_id`) and the **ratings** (for the numbers).

⭐ That split is what makes D8 work: the rubric says **what the form is** — how many criteria,
how many statements each, what they say — and the ratings say **what they scored**. So a
criterion nobody rated still gets its block, with its value blank; a rubric that gains a
statement simply makes a longer form.

### 7.3 One read for the page and the export

`getSubjectResultSet(facultySubjectId, evaluationPeriodId)` in
`features/evaluation-results/evaluation-results.service.ts` does the read **once**. The subject
page renders it and the export fills the workbook with it, so **the page and the export can
never show different numbers** — the same parity rule the surfaces live by (contract §3.18).

The **guards stay with the routes** — they are per role, and the dean and the admin do not see
the same subjects.

---

## 8. The routes

| Route | Guard |
|---|---|
| `app/api/admin/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/export/route.ts` | `requireAdmin` + `isSubjectInDepartment` (D9) |
| `app/api/dean/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/export/route.ts` | `hasRole(DEAN)` + the dean's own department + `assertPeriodIsActive` + `isSubjectInDepartment` |
| `app/api/faculty/evaluation-results/subjects/[facultySubjectId]/export/route.ts` | `auth` + `assertPeriodIsActive` + **the visibility map** + the assignment is the faculty's own |

⭐ **The faculty's export must carry the same guards as the faculty's read**, including the
**visibility map** (`getVisibilityMap`) — a period whose results the dean has not enabled must
not be exportable, or the export route becomes a way around the read route's 403.

Each route reads, builds the workbook and returns it as a download
(`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).

---

## 9. The mechanics

- **The template is copied**, parts and all: `xl/styles.xml` (the fonts, the borders, the
  number formats), `xl/media/` (the letterhead), `xl/drawings/` (its anchor), the theme.
- **The three sheets' rows are replaced** with the generated ones.
- **The zip**: the template is deflated; the app's *output* is store-only (`lib/zip.ts`'s
  writer), and the reader handles both methods. `lib/xlsx-template.ts` holds the reader, the
  cell and row rules (in **both** dialects — Excel writes `hidden="1"`, the other app writes
  `hidden="true"`), and the shared-string helpers.
- **No new dependency.** ⭐ The template supplies the styling, so a writer library would have
  to re-state all of it in code.

---

## 10. Risks

| Risk | Severity | Handling |
|---|---|---|
| **The generated form is taller than the legacy's** — the header is bigger, and the statement wording is longer | medium | the page count is a **proof** before the Excel ships; the type size and the row heights are the levers |
| **A statement's text is too long for its row** | medium | the statement rows' heights follow the text's length, as the legacy's own do (13.5 pt, 30 pt for a long one) |
| **The template is absent in production** | medium | `outputFileTracingIncludes` (§4.1); smoke-test in production, not only locally |
| **The re-save cost the workbook its print setup** | low | the exported form falls back to the reader's default page setup |
| **The letterhead is stretched** if the new image is dropped into the old slot | low | the cut re-anchors it at the logo's own aspect, centred (§4.2) |
| **The rubric is edited between the read and the fill** | very low | the rubric and the ratings are read together; a change between them is a stale form, not a wrong one |

---

## 11. What this slice does **not** do

- **The PDF.** It is not reshaped, not re-letterheaded, and its 30-comment truncation stays (D3).
  Its four live defects are recorded in §12.
- **The period-level export** — every department, every faculty, every subject, in one
  download. The existing CSV export stays as it is.
- **The general rating's arithmetic** (§6.5) — one function, every surface, a product decision.
- **`RATINGS_IN_CHUNK_SIZE`** — the chunk was sized for 27 statements and the rubric has 34, so
  every chunk spills into a second page and its first 1,000 rows are read twice. Correctness is
  fine; performance is not. The fix is `37 → 29` — but only after the live rubric is confirmed
  to be 34 statements, which is a read-only check for the owner.
- **`downloadDeptPdf` (`lib/evaluation-pdf.ts:279`)** — no callers. A cleanup, not this slice.

---

## 12. What the PDF is carrying (for the slice that takes it)

| Defect | Where |
|---|---|
| The PDF prints `Semester: Semester` | `lib/evaluation-pdf.ts:149` and `:306` — `semesterLabel` is passed by **no one**: not the admin page, not the dean page, not the faculty page |
| The PDF prints no Section | `PdfData` has no section field, though the pages and the routes carry `sectionProgram` / `sectionName` |
| The PDF truncates the comments at 30 | `lib/evaluation-pdf.ts:211-227` — "… and N more comments", a silent truncation in a document that is meant to be the record |
| The PDF's per-faculty average is a mean of means | `lib/evaluation-pdf.ts:352` — it averages a teacher's **subject** averages, while every app surface pools across subjects via the totals. The outlier among the surfaces |

---

## 13. The slices

| # | Slice | Files | State |
|---|---|---|---|
| 1 | **The statement ratings** — the item identity through the read + `computeItemAverages` | `lib/db/common.ts`, `lib/types/evaluation.ts`, `lib/evaluation-utils.ts` | **done** (`abcc919`) |
| 2 | **The routes** — the period/semester read, `employeeNo`, the section on the faculty route | 3 route files | **done** (`13ade13`) |
| 3 | **The template** — cut, letterhead, tracing | `data/templates/eval-report.xlsx`, `scripts/cut-eval-template.mjs`, `next.config.ts` | **done** (`ef71931`, `bec0132`) |
| 4 | **The workbook builder** — the generated blocks, wearing the template's styles | `lib/xlsx-template.ts`, `lib/evaluation-form-xlsx.ts` | **to rewrite** (v3) |
| 5 | **The shared read** — `getSubjectResultSet`, and the three read routes onto it | `features/evaluation-results/evaluation-results.service.ts`, 3 route files | to do |
| 6 | **The export routes** — the three routes, the download | 3 new route files | to do |
| 7 | **The buttons** — the export affordance on the three pages | 3 page files | to do |

Slice 4 is a **rewrite** of the v2 builder: the position map, the formula-reading and the
rubric-drift guard are replaced by the generator, and the statement texts and the criterion
names become the app's (D9).

**Gate (the owner's run):**

```powershell
npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npx vitest run }; if ($?) { npm run build }
```

---

## 14. The open questions

1. **The filename** — `<subjectCode>_<facultyName>_evaluation.xlsx` is a proposal.
2. **The page count** — the generated form's height against the legacy's two pages is a
   **proof**, not a decision. If it runs to three, the target is two and the type size moves.
3. ⭐ **The statement ratings and the school** — the legacy's item cells are typed by hand; the
   app's are computed (D2, §6.4). Is there any expectation that the school *edits* the
   workbook's ratings before circulating it? That is the one thing the "formulas → values" trade
   costs.
