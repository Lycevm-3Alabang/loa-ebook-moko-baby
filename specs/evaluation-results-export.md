# Evaluation results — the export (the Excel workbook)

**Status:** Draft
**Version:** 2.0
**Last Updated:** 2026-10-22
**Scope:** exporting one evaluation result set as an **Excel workbook**, at the grain of one
(faculty × subject × section) — the drill-down's subject page
(`/admin/evaluations/results/[departmentId]/[facultySubjectId]`) and the faculty's own page
(`/faculty/evaluations/results/[facultySubjectId]`).

> **v2.0 (2026-10-22):** the scope narrowed. The **PDF is out of scope** — it is not reshaped,
> not re-letterheaded, and its comment truncation stays. The letterhead is the repo's own
> `public/logo-blk.png` (which the PDF already uses). The Overall sheet carries **one row**.
> The faculty's page is included. The PDF work returns as its own spec when it is taken up.

---

## Why it exists

The school produces its evaluation results as a **spreadsheet**: a per-faculty evaluation form
(the "Individual" sheet), a comments sheet, and a flat per-faculty table (the "Overall" sheet).
That workbook — `docs/eval reports.xlsx` — is the artifact the results are read from and
handed around. The app produces the same *numbers* on screen, but not the same *artifact*.

This spec makes the app produce that artifact: the **whole workbook**, filled from the app's
own figures.

Two things the legacy workbook has and the app does not:

- **the per-statement view.** The form's column I holds one value per rubric **statement**
  (34 of them). The app aggregates per **criterion** (8). The statement-level numbers are not
  computed anywhere today.
- **the identity block.** `Employee No`, `Program`, `Section`, `Semester`, `Evaluation Period`.
  The app has every one of them (§5); the workbook does not print them.

---

## 1. The decisions this spec records

| # | Decision | Owner |
|---|---|---|
| D1 | The Excel is produced by **filling the legacy workbook as a template** — not by a library, not by hand-writing OOXML | 2026-10-22 |
| D2 | The output is the **entire workbook** — all three sheets — with the **formulas replaced by values** | 2026-10-22 |
| D3 | The **PDF is not touched.** It keeps its current shape, its current letterhead and its 30-comment truncation | 2026-10-22 |
| D4 | The **letterhead is the repo's own** `public/logo-blk.png` — the same asset the PDF already places. The workbook's embedded colour lockup is **replaced** | 2026-10-22 |
| D5 | The **Overall sheet carries one row** — the exported faculty × subject × section. A faculty's whole period is a different export | 2026-10-22 |
| D6 | The pilot is the **subject page** — admin, dean **and** the faculty's own page | 2026-10-22 |
| D7 | The export is a **server route** that returns the workbook as a download | 2026-10-22 |

**Why D1 (the template) over a writer library.** A writer library (`exceljs`) would have to
re-create the workbook's 65 merged cells, its styles, its letterhead and its print setup by
hand, and the result would only *approximate* the legacy file. Filling the template produces
the legacy file **exactly** — the same layout, the same pagination — with the numbers in it.
The workbook is already in the repo (`docs/eval reports.xlsx`); it becomes a curated asset.
The proof is in §8.

**Why D3 (the PDF waits).** The PDF is a separate document with its own two live defects
(§11) and its own pagination risk. Mixing it into the same slice doubles the review surface
for no gain in the Excel. The Excel is the artifact the school actually circulates; the PDF
is a reading copy. **The PDF's defects are recorded in §11 and are not fixed by this slice.**

---

## 2. What the export produces

One `.xlsx` download, containing the legacy workbook filled for the chosen scope:

| Sheet | Content |
|---|---|
| **Individual** | the form — the identity block, then the 8 criteria with their statements and ratings, the criterion averages, TOTAL RESPONDENTS and FINAL RATING |
| **Comments** | the same identity block, then **every** comment the responses left, one per row |
| **Overall** | the flat view: **one row** — `NO · NAME · <8 criteria> · GENERAL RATING · REMARKS · NO OF RES. · DEPARTMENT` — for the exported faculty × subject × section |

The download's filename follows the shape `<subjectCode>_<facultyName>_evaluation.xlsx`.

---

## 3. The template

### 3.1 It is a repo asset, and we own it

The template lives at **`data/templates/eval-report.xlsx`** (committed). It is the legacy
workbook, **edited once** to carry the fields the legacy lacks (§3.2) and the repo's own
letterhead (§3.3). The export never generates a layout — it only writes values into a layout
that already exists.

> The `data/` directory already exists at the repo root (`data/sentiment/`), so the template
> has a home that is neither `app/` nor `features/`.

**Deployment.** The route reads the file from the filesystem, so it must be traced into the
serverless bundle. `next.config.ts` gets:

```ts
outputFileTracingIncludes: { "/api/**/*": ["./data/templates/**/*"] }
```

Without it the file is absent in production and the export 500s there while working locally.
This is the one config change in the slice.

### 3.2 The template's edits (one-time, by hand, in Excel)

The legacy workbook's header block:

| Row | A (label) | B:F (value) | G (label) | H:I (value) |
|---|---|---|---|---|
| 7 | `Employee No` | — | `Rating` | — |
| 8 | `Employee Name` | — | `Remarks` | — |
| 9 | — | — | — | — |
| 10 | — | — | — | — |

and its title block: `r1` (the letterhead image), `r3` = `Faculty Performance Evaluation`,
`r4` = the term, `r5`/`r6` blank and unmerged.

| Where | Change | Why |
|---|---|---|
| `A9:F9` | `Program` label + value cell | the app's `section.program`; the legacy has no program |
| `A10:F10` | `Section` label + value cell | the app's `section.name` |
| `r4` | `Semester: <semesters.title>` | the legacy's term line, now the semester |
| `r5` (new, merged `A5:I5`) | `Evaluation Period: <evaluation_periods.name>` | the legacy has no period line |
| `r3` | `Faculty Performance Evaluation` — keep | the legacy's own title |
| `r1` | the letterhead — see §3.3 | |

The legacy's `r2` is blank and unmerged; `r5`/`r6` are blank and unmerged. Both are free.

### 3.3 The letterhead (D4)

The legacy workbook embeds `xl/media/image1.png` — a 1563 × 278 colour lockup, and the lockup
appears **twice** in it (left and right, with a rule along the bottom).

**The template's image is replaced with the repo's own** `public/logo-blk.png` (340 × 156, a
black lockup on a transparent background) — the same asset the PDF already places in its
header (`lib/evaluation-pdf.ts:78`).

⚠️ **The image must be re-anchored, not swapped in place.** The legacy's image occupies a
6.14 : 1 banner slot; `logo-blk.png` is 2.18 : 1. Dropping the new bytes into the old
`xl/media/` slot would **stretch** the logo. The template edit is: delete the banner image and
insert `logo-blk.png` **centred at the top, at its own aspect ratio**.

### 3.4 What the export writes, and where

The template's cell positions are **fixed**. The export writes **by position**, and the
position map comes from the template's own layout, not from the rubric (§3.5).

**Sheet 1 — "Individual"** (the form)

| Cells | Written |
|---|---|
| `B7` | Employee No (`users.employeeNo`) |
| `B8` | Employee Name |
| `B9` | Program |
| `B10` | Section |
| `H7` | the general rating |
| `H8` | the remark |
| `r4` | `Semester: …` |
| `r5` | `Evaluation Period: …` |
| `I12`…`I74` | the **34 statement ratings** — one per rubric statement |
| `I15`, `I24`, `I31`, `I38`, `I45`, `I60`, `I66`, `I75` | the **8 criterion averages** |
| `H77` | TOTAL RESPONDENTS |
| `I78` | FINAL RATING |

The legacy's `I15` … `I78` carry `<f>AVERAGE(…)</f>` formulas. **Every formula is replaced by
its value** (D2) — the cell keeps its style and its number, and loses the `<f>` element. A
filled workbook is a *report*, not a *worksheet*: the school can read it, print it and mail it,
but it cannot retype a rating and watch the average recompute. That is the intended trade.

**Sheet 2 — "Comments"**

The legacy's sheet 2 is the same header block plus a `COMMENTS AND SUGGESTIONS` banner at
`r10` and blank writing space from `r11`. The export writes the identity block (as sheet 1)
and then **one comment per row from `r11` down**: the response's date, then the comment text.
No cap.

**Sheet 3 — "Overall"** (D5)

The legacy's sheet 3 is a per-faculty table: `NO | NAME | <8 criteria> | GENERAL RATING |
REMARKS | NO OF RES. | DEPARTMENT`, header at `r6`, data from `r7`. The export writes **one
row** — the exported faculty × subject × section — carrying the same eight criterion figures
the Individual sheet's AVERAGE rows carry. The legacy's 10,609 empty rows are dropped; the
template keeps the header and its styling.

> The Overall sheet has **no Subject/Section column**, so the row's identity lives on the
> Individual sheet. A period-level export (every faculty, every subject) is a different export
> and would need its own column set — out of scope (§10).

### 3.5 The rubric-drift guard (a hard rule)

The template's statement positions encode a rubric of **34 statements in a fixed order**
(3 · 6 · 4 · 4 · 4 · 4 · 3 · 6). If the owner edits the rubric in the app — adds, removes or
reorders a statement — the positions no longer line up, and the export would write **the wrong
number against the wrong statement, silently**. A wrong form is worse than no form.

**The export verifies the live rubric against the template before it writes anything.** The
expected shape is a constant next to the template:

```
EXPECTED_ITEMS_PER_CATEGORY = [3, 6, 4, 4, 4, 4, 3, 6]   // 34 statements
```

If the live rubric's categories, item counts or item order do not match, the export **fails
with a clear message** ("the rubric changed — the Excel template needs to be re-cut") and
writes nothing. It does not degrade, and it does not guess.

---

## 4. The three pages

| Page | Route | Guard |
|---|---|---|
| admin | `app/api/admin/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/route.ts` | `requireAdmin` + `isSubjectInDepartment` (D9) |
| dean | `app/api/dean/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/route.ts` | `hasRole(DEAN)` + the dean's own department + `assertPeriodIsActive` + `isSubjectInDepartment` |
| faculty | `app/api/faculty/evaluation-results/subjects/[facultySubjectId]/route.ts` | `auth` + `assertPeriodIsActive` + **the visibility map** + `fsMatch.faculty_id === userId` |

⭐ **The faculty's export must carry the same guards as the faculty's read** — including the
**visibility map** (`getVisibilityMap`). A period whose results the dean has not enabled must
not be exportable by a faculty member, or the export route becomes a way around the read
route's 403.

---

## 5. The field contract

Every field the workbook prints, and where it comes from. **No field is typed by hand** — the
legacy's term line was ("2nd Semester, School Year 2025-2026" in the banner, "2023-2024" in
the sub-header, in the same file), which is exactly what this contract removes.

| Field | Source | Rule |
|---|---|---|
| **Employee No** | `users.employeeNo` | already in `USER_SELECT` (`lib/db/common.ts:16`) → `userRepository.findById` returns it. The column exists (`supabase-schema.sql:806`). Empty is printed as an em dash, never as a fake value |
| **Employee Name** | `users.name` | the faculty's name |
| **Program** | `sections.program` | the row's own section, not the faculty's course |
| **Section** | `sections.name` | the row's own section |
| Subject Code / Name | `subjects.code` / `subjects.name` | |
| Department | `departments.name` (+ code) | the **teacher's home** department (contract §3.1) |
| **Semester** | `semesters.title` (via `evaluation_periods.semesterId`) | e.g. `SY 2026-2027 First Semester` |
| **Evaluation Period** | `evaluation_periods.name` | e.g. `SY 2026-2027 First Semester - Evaluation` |
| Rating | the general rating | §6 |
| Remarks | `getRemark(general)` | Outstanding / Very Satisfactory / Satisfactory / Unsatisfactory / Poor |
| TOTAL RESPONDENTS | the number of counted responses | the responses the figures are computed over |
| **34 statement ratings** | the statement's mean over the counted responses | §7.1 |
| **8 criterion averages** | the criterion's mean over the counted responses | §6 |
| **FINAL RATING** | the general rating | §6 |

### 5.1 Program and Section are printed as two fields

The app's display helper `sectionLabel(program, name)` (`lib/evaluation-utils.ts:214-217`)
joins them into `BSCS-A`. The workbook prints them **separately** — `Program: BSCS` and
`Section: A` — because the two are different things and the school's own records treat them
that way. The combined label stays where it already is (the drill-down's header card).

---

## 6. The arithmetic — current, and what needs to be done

### 6.1 What the app does today

`computeGeneralRating(catAverages)` (`lib/evaluation-utils.ts:148-156`) is the **unweighted
mean of the eight criterion averages**:

```ts
const keys = Object.keys(catAverages).filter((k) => k !== UNMAPPED_CATEGORY_NAME)
return Math.round(keys.reduce((sum, k) => catAverages[k], 0) / keys.length * 100) / 100
```

and each criterion average is the mean over that criterion's **rating rows**
(`computeCategoryAverages`, `:84-96`).

### 6.2 What the legacy workbook does

`I78 = AVERAGE(I15,I24,I31,I38,I45,I60,I66,I75)` — the mean of the eight criterion averages,
each of which is the mean of its statement cells.

### 6.3 They agree — exactly, not approximately

A **submitted** evaluation has **every** statement rated: the submit button is
`disabled={submitting || !allAnswered || !pledgeAgreed}`
(`app/(eval)/evaluate/[id]/page.tsx:760`). So every counted response contributes exactly one
rating to each of the 34 statements, which makes

> the mean over a criterion's rating rows **==** the mean of that criterion's statement means

for every criterion, and therefore the two whole formulas are the same number. The app and
the legacy workbook do not merely use the same rule — **they compute the same value**, and
the workbook reproduces the legacy's numbers exactly.

### 6.4 What needs to be done: **nothing, for this export**

The export writes the app's `computeGeneralRating` value into `I78`. Because the formulas are
replaced by their values (D2), the workbook shows exactly what the app computed. **No decision
is needed to ship this.**

### 6.5 The question that is *not* blocking

The app weights each **criterion** at 1/8. A **pooled** mean over the rating rows would weight
each **statement** at 1/34, and because the criteria carry unequal statement counts
(3 · 6 · 4 · 4 · 4 · 4 · 3 · 6), the two differ.

*Worked example* — criterion II (6 statements) at 5.00, the other 28 statements at 4.00:

| | value |
|---|---|
| criterion-equal (the app, and the legacy) | `(5.00 + 4.00 × 7) / 8` = **4.125** |
| pooled over the rating rows | `(6 × 5.00 + 28 × 4.00) / 34` = **4.176** |

Which is right is a **product** question — *"are the eight criteria what we are rating, or are
the 34 statements?"* — and the **legacy agrees with the app**, so reproducing the legacy is
not blocked by it.

If the owner ever wants the pooled mean, it is **one function** (`computeGeneralRating`) and
it touches every surface at once: the results list, the drill-down, the report, the export
CSVs, the PDF and this workbook. It should be **its own slice, decided on its own** — and
not decided by an export.

> ⚠️ A related imprecision to record, not to fix here: the comment at
> `features/evaluations/evaluation-report.service.ts:134-135` ("this is the mean over the
> rating rows") is true of the eight criterion columns and **not** of the general rating.

---

## 7. What has to be built

### 7.1 The statement ratings (the one new capability)

The form's column I is **per statement** (34). The app aggregates **per criterion** (8). The
statement's identity is lost at the read boundary:

```
lib/db/common.ts:100   .select("evaluationId, rating, itemId")   ← selected
lib/db/common.ts:183   return ratingRows.map((r) => ({            ← then dropped
                       evaluationId, rating,
                       rubric_items: { categoryId, rubric_categories: { name } } }))
```

So:

1. `lib/db/common.ts` — `RatingWithCategory` (`:54-58`) gains `itemId`, `itemText`,
   `itemDisplayOrder`, `categoryDisplayOrder`; the `rubric_items` select (`:152`) becomes
   `id, categoryId, text, displayOrder`; the `rubric_categories` select (`:172`) becomes
   `id, name, displayOrder`; the mapping (`:183-190`) carries them.
2. `lib/types/evaluation.ts:526` — `EvaluationRatingRow` gains the same fields (the cast at
   `features/evaluations/evaluations.repository.ts:639` would otherwise be a lie).
3. `lib/evaluation-utils.ts` — a new pure `computeItemAverages(ratings)` → the statements,
   grouped by criterion and ordered by `displayOrder`, each with its mean and its count.

**Ripple:** `fetchRatingsWithCategories` has four call sites
(`features/evaluation-results/evaluation-results.repository.ts:542,601,916` and
`features/evaluations/evaluations.repository.ts:639`). The change is **purely additive** — every
existing consumer reads `categoryId` / `name`, both unchanged.

**Caps:** adding columns adds no rows. The `rubric_items` read (`:150-154`) chunks at 37 ids
→ 34 items is one chunk, 34 rows ≪ 1,000. The ratings read is untouched.

### 7.2 The routes

Each of the three routes (§4) gains:

- **the period and the semester** — one read, `evaluationPeriodRepository.findById`, which
  already joins `semesters!inner(title)`
  (`features/admin-data/evaluation-period.repository.ts:31`), so one read gives both labels;
- **`employeeNo`** on the faculty object;
- **the program and the section** — the admin and dean routes already return
  `sectionProgram` / `sectionName`; ⭐ **the faculty route does not** — it resolves the
  subject but never the section, so it gains a `sectionRepository` lookup.

### 7.3 The Excel writer

The export is a **server route** that returns the workbook:

```
GET /api/admin/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/export?format=xlsx
```

and the dean's and the faculty's twins. The route re-reads (as the existing export route does)
and writes the template.

**The mechanics.** A workbook is a ZIP of XML parts. The repo has a **store-only** ZIP writer
(`lib/zip.ts:16`, `createZip`) and no reader. The route needs:

- a **reader** — parse the central directory and inflate the parts. Node's built-in
  `zlib.inflateRawSync` does the inflate, so this is ~60 lines and **no dependency**;
- the **writer** — `createZip` already exists and is legal for a workbook (ZIP's *stored*
  method is method 0, and workbook readers accept it). `[Content_Types].xml` is written first.

**Proof (run 2026-10-22, `/tmp`, nothing in the repo):** the template was exploded, patched
(cells written, `<f>` formulas stripped), and re-zipped store-only. The result: a **valid
zip**, 24 parts, the letterhead image intact (50,912 bytes), **65 merged cells** on sheet 1
intact, `styles.xml` intact, **3/3** `printerSettings` intact, **no formulas remaining** in
the patched cells, and the Overall sheet's 10,615 rows reduced to the header plus one data
row. The approach works.

**Why not `exceljs`.** It would have to rebuild the 65 merges, the styles, the letterhead and
the print setup by hand, and the output would only *approximate* the legacy file. D1 chooses
the template. The consequence is accepted: the workbook's layout is a **snapshot**, and §3.5's
guard is what keeps that honest.

### 7.4 The template cut

A one-time, manual step by the owner: open `docs/eval reports.xlsx`, make §3.2's edits, swap
the letterhead (§3.3), and save it as `data/templates/eval-report.xlsx`. The export never
edits the template — it only reads it.

### 7.5 The button

Each of the three pages gets the export affordance, using `components/ui/IosButton` — ⚠️
**not** the hand-rolled `<button>` that `DownloadEvalPdfButton` uses today
(`DownloadEvalPdfButton.tsx:69-77`), which drifts from the design system.

> The existing PDF button's markup is **not** fixed in this slice. It is a separate, one-line
> cleanup, and mixing it in would make this slice's diff hard to review.

---

## 8. Risks

| Risk | Severity | Handling |
|---|---|---|
| **The rubric changes and the template no longer matches** | high — a *wrong* form, silently | §3.5's guard: verify the live rubric's shape, fail loudly, write nothing |
| **The zip writer produces a workbook a reader rejects** | medium | proven in §7.3's PoC; a spreadsheet-app smoke test is part of the slice's verification |
| **The template is absent in production** | medium | `outputFileTracingIncludes` (§3.1); the export must be smoke-tested **in production**, not only locally |
| **The letterhead is stretched** if the new image is dropped into the old slot | low | §3.3 — re-anchor at the logo's own aspect, centred |
| **The Overall sheet is one row at this grain** | low | D5; the period-level export is out of scope (§10) |
| **The dean's route has no visibility map** while the faculty's does | low | the export mirrors each route's own guard exactly (§4) — the dean's is the dean's |

---

## 9. The slices

| # | Slice | Files | State |
|---|---|---|---|
| 1 | **The statement ratings** — the item identity through the read + `computeItemAverages` | `lib/db/common.ts`, `lib/types/evaluation.ts`, `lib/evaluation-utils.ts`, + tests | **done 2026-10-22** (`abcc919`) |
| 2 | **The routes** — the period/semester read, `employeeNo`, the section on the faculty route | 3 route files + tests | **done 2026-10-22** (`13ade13`) |
| 3 | **The template** — cut `data/templates/eval-report.xlsx` (§3.2, §3.3); the ZIP reader | `data/templates/eval-report.xlsx` (owner-cut), `lib/xlsx-template.ts` (new), `next.config.ts` | next |
| 4 | **The export route** — the fill, the rubric guard, the three routes | 3 new route files, `lib/evaluation-form-xlsx.ts` (new) | |
| 5 | **The buttons** — the export affordance on the three pages | 3 page files | |

⭐ **Slices 1 and 2 are data-only** — they change no output, so each can land on its own. Slice 1
made the statement-level numbers exist; slice 2 made the header's fields **deliverable**.

⭐ **What slice 2 settled that the plan had not:** the **faculty** route never resolved its
section — the admin and dean routes have carried the program and the section name all along —
so it gained a `sectionRepository.findById` for the row's OWN section, read **after** the
ownership guard. The `employeeNo` came free: `USER_SELECT` already carried it, so
`userRepository.findById` was returning it and the routes were dropping it. And the period is
**optional**: a period that cannot be read leaves the figures intact and the header's labels
null — the figures are the point, the labels are the header.

**Gate (the owner's run):**

```powershell
npx tsc --noEmit; if ($?) { npm run lint }; if ($?) { npx vitest run }; if ($?) { npm run build }
```

Baseline: 62 files · 687 tests (2026-10-21).

---

## 10. What this slice does **not** do

- **The PDF.** It is not reshaped, not re-letterheaded, and its comment truncation stays (D3).
  See §11 for what it is carrying.
- **The period-level export** — every department, every faculty, every subject, in one
  download. The existing CSV export (`app/api/admin/evaluation-results/export/route.ts`)
  stays as it is. The Overall sheet's column set for that scope is a separate decision.
- **The general rating's arithmetic** (§6.5) — one function, every surface, a product
  decision. **Not decided by an export.**
- **The `RATINGS_IN_CHUNK_SIZE` staleness — FIXED 2026-10-22.** `lib/db/common.ts` sized a chunk
  of 37 evaluations at 37 × **27** = 999 rows, but the rubric has **34** statements (migrations
  28/29 took it from 24 to 34; the "27" was the *seed's* count), so every chunk spilled into two
  pages and its first 1,000 rows were read twice. Correctness was never affected — the page loop
  pages until a page comes back short. The chunk is now **derived**
  (`Math.floor(RATINGS_PAGE_SIZE / RUBRIC_STATEMENT_COUNT)` = 29), with the count exported and the
  invariant asserted by the paging test. AGENTS.md **Lesson 7b** carries the corollary. ⭐ The
  schema's two "27"s were left alone — `supabase-schema.sql` is the owner's file (H4) and the
  rubric group's description is seeded data.
- **`downloadDeptPdf` (`lib/evaluation-pdf.ts:279`)** — no callers. A cleanup, not this slice.

---

## 11. What the PDF is carrying (for the slice that takes it)

Recorded so it is not lost, not fixed here:

| Defect | Where |
|---|---|
| The PDF prints `Semester: Semester` | `lib/evaluation-pdf.ts:149` and `:306` — `semesterLabel` is passed by **no one**: not the admin page, not the dean page, not the faculty page |
| The PDF prints no Section | `PdfData` has no section field, though the pages and the routes carry `sectionProgram` / `sectionName` |
| The PDF truncates the comments at 30 | `lib/evaluation-pdf.ts:211-227` — "… and N more comments", a silent truncation in a document that is meant to be the record |
| The PDF's per-faculty average is a mean of means | `lib/evaluation-pdf.ts:352` — it averages a teacher's **subject** averages, while every app surface pools across subjects via the totals. The outlier among the surfaces |

---

## 12. The open questions

1. **The statement ratings and the school** — the legacy's item cells are typed by hand. The
   app's are computed. The export writes the app's (§6.3 proves they agree). ⭐ Is there any
   expectation that the school *edits* the workbook's ratings before circulating it? If so,
   that is the one thing the "formulas → values" trade (D2) costs.
2. **The filename** — `<subjectCode>_<facultyName>_evaluation.xlsx` is a proposal.
