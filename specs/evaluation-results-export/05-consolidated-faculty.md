# The consolidated faculty workbook

**Version:** 1.0
**Status:** Final (built) — owner-approved and built 2026-10-26. ⭐ The owner
gate + Excel proof are pending (H1: the agent does not run them).
**Parent:** [evaluation-results-export.md](../evaluation-results-export.md) (Part III, v7.0)

The third grain: **one workbook per faculty**, in a ZIP, holding **all of that faculty's
subject-sections**. ⭐ **An add-on** — it replaces nothing; Part II's department ZIP does not
move.

---

## 1. Problem

The department ZIP hands the school every subject-section as its own workbook. The faculty
grain asks the opposite: **one teacher's whole term in one file** — every Subject–Section row
the card shows, every comment across those sections, and every response in one table.

The artifact must be the **same three sheets** the school already receives (Individual,
Comments, Overall), not a new form. The faculty grain changes the **scope of a sheet**, never
its kind.

## 2. Pinned contracts

| # | Contract |
|---|---|
| C1 | ⭐ **One workbook per faculty**: `<DEPT-CODE>/<Faculty Name>/<Faculty Name>_consolidated.xlsx`. The department folder is the code, the faculty folder is the name, both through `entryName` |
| C2 | ⭐ **Three sheets, in this order** — `Individual`, `Comments`, `Overall`. No letterhead, no media |
| C3 | ⭐ **Individual** = the shipping faculty summary (`lib/xlsx/overall-summary.ts`), tab renamed. Its average is the Faculty Card's (`facultyAggregates[facultyId].avgRating`), never a pooled mean |
| C4 | ⭐ **Comments** = the shipping comments model, with a `group` row (the `banner` style) per subject-section that has comments. All comments across the faculty; text only; no date; the `A:I` merge survives; print titles stop before the first group |
| C5 | ⭐ **Overall** = the shipping overall model with `SUBJECT` and `SECTION` columns. `NO · SUBJECT · SECTION · DATE · <live criteria> · GENERAL RATING · REMARKS`; no `Subject:` header line; `NO` continuous; order = subject, section, then the subject's response order |
| C6 | ⭐ **An empty member gets a file**: no subject-sections → three sheets with headers and no data rows; values print `—`. Not a failure |
| C7 | ⭐ **A failed faculty read skips the whole workbook** and is named in `_INCOMPLETE.txt`; the rest ship. A partial workbook is never silently shipped |
| C8 | ⭐ **The surface**: a second button on the admin and dean department pages, `Download Consolidated Excel (ZIP)`, disabled until ≥1 faculty is ticked; all ticked = the whole department. The confirmation names the consolidated workbook |
| C9 | ⭐ **The guard** is Part II's: `MAX_SUBJECT_SECTIONS` / `verdictForDepartmentZip`, the same count and estimate |
| C10 | ⭐ **An add-on** — it replaces nothing: the existing department ZIP, its tree, its button, its routes and its tests do not change |

## 3. The ZIP

```
evaluation-results-consolidated-<periodId>.zip
├── <DEPT-CODE>/
│   ├── <Faculty Name>/
│   │   └── <Faculty Name>_consolidated.xlsx
│   └── …
└── <DEPT-CODE>/ …
```

- The archive is **DEFLATE** (`createDeflatedZip`), like Part II.
- The file names keep the name's commas and spaces (the existing sanitiser's own rule).
- Only consolidated files: no subject workbooks, no department summary.

## 4. The workbook

### 4.1 `Individual`

The shipping summary, tab renamed:

- Header: `FACULTY PERFORMANCE EVALUATION RESULT (POST-EVALUATION)`, `Semester:`,
  `Evaluation Period:`, `Department: Name (CODE)`.
- Band: the name, the email, `Average: X.XX — <remark>` (or `Average: —`).
- Table: **SUBJECT · SECTION · RESPONDENTS · AVG RATING · HIGHEST · LOWEST**, one row per
  subject-section, sorted by subject then section.
- ⭐ The average is the card's (`faculty-card-average.md` §2.2); the rows' `AVG RATING` is each
  row's own displayed rating.

### 4.2 `Comments`

- Identity block (title, semester, period, employee no / rating, employee name / remarks) and
  the banner `COMMENTS AND SUGGESTIONS`.
- ⭐ Per subject-section **with at least one comment**, a `group` row:
  `<subject code> <subject name> — <section label>` (the `banner` style, merged `A:I`).
- Then that subject's comments, one per row, text only, the text in the merge's anchor
  (`A:I`), the height following the text.
- ⭐ No date (D15). A subject-section with no comments has no group.
- The subject workbook's Comments sheet does not change.

### 4.3 `Overall`

- Header: the title, `Semester:`, `Faculty:`, `Department:` — ⭐ **no `Subject:` line**.
- Table: **NO · SUBJECT · SECTION · DATE · <criteria> · GENERAL RATING · REMARKS**.
- One row per response across the faculty's subject-sections; `NO` 1..N across the whole
  faculty; sorted by subject, section, then the subject's response order.
- The criteria columns are the **live rubric**; each value is that response's own average for
  the criterion (blank when it did not rate it).
- Landscape; the print area is the table's width; the header block and the table header repeat
  on every page.

## 5. The data contract

| The workbook needs | From |
|---|---|
| the members, their rows, the card's average | `getDepartmentSubjectResults(periodId, departmentId)` |
| each row's comments and per-response values | `getSubjectResultSet(facultySubjectId, periodId)` |
| the live criteria | `rubricRepository.getCategoriesWithItems(period.rubricGroupId)` |
| the period's titles | the period read |
| the faculty's employee number | the first successful subject read (`resultSet.faculty.employeeNo`); `—` when there is none |

⭐ No new repository method, no schema change, no direct Supabase call (H4). The subject reads
run in the existing bounded pool; a failure is collected.

## 6. The routes

| Role | Route | Rule |
|---|---|---|
| admin | `app/api/admin/evaluation-results/export/consolidated/route.ts` | `requireAdmin`; the period; the scope (`departmentIds`, `facultyIds`); the verdict; the ZIP |
| dean | `app/api/dean/evaluation-results/export/consolidated/route.ts` | `hasRole(DEAN)`; the dean's own department; a foreign id **403**; `assertPeriodIsActive`; the verdict |

- `Content-Disposition: attachment; filename="evaluation-results-consolidated-<periodId>.zip"`.
- `maxDuration = 60`; the refusals verbatim; the 500 carries `Failed to export: …`.
- ⭐ The route is thin — it never assembles.

## 7. The surface

On both department pages, beside the existing button:

- `label="Download Consolidated Excel (ZIP)"`.
- `departmentIds={[departmentId]}`; `facultyIds={allFacultySelected ? [] : selectedFacultyIds}`;
  `disabled={selectedFacultyIds.length === 0}`.
- `exportApiBase` = the role's consolidated route.
- `filenamePrefix="evaluation-results-consolidated"` — the existing default stays
  `evaluation-results-excel-<periodId>.zip`.
- ⭐ The confirmation copy names the consolidated workbook (no subject workbooks); the existing
  button's copy does not change.
- The existing button, its props and its call sites do not change.

## 8. The guard and the failure

- **Guard** — the selected faculty's subject-section count × `BYTES_PER_WORKBOOK` against
  `ZIP_LIMIT_BYTES`, through `verdictForDepartmentZip`.
- **Failure** — skip the faculty's workbook, name it in `_INCOMPLETE.txt`:
  `- <Faculty Name> — <subject code> <section label>: <error>`. The rest ship.
- **Empty member** — a workbook, not a failure (C6).

## 9. Acceptance checks

1. One ZIP; one folder per selected faculty; one `<Faculty Name>_consolidated.xlsx` each; no
   subject workbooks.
2. Each file has exactly the three tabs, in the order `Individual`, `Comments`, `Overall`; no
   letterhead/media.
3. The Individual's `Average` equals the Faculty Card's for the same faculty; the rows equal the
   card's rows; a row with no responses prints `0` respondents and `—`.
4. The Comments sheet carries every comment of every subject-section, grouped in the Individual's
   order; a comment never prints a date; a section with no comments has no group; the `A:I`
   merge is intact.
5. The Overall sheet carries every response of the faculty; `NO` is continuous; `SUBJECT` and
   `SECTION` are the row's own; the criteria are the live rubric's; the general rating and remark
   are the response's own; the `Subject:` header line is absent.
6. A member with no subject-sections gets a file with empty sheets and `—` — not a 404, not a
   missing folder.
7. A failed faculty read skips that file and names it in `_INCOMPLETE.txt`; no partial workbook
   ships; the other files ship.
8. The guard refuses over the bound (400, naming the count and the way out) and names an unknown
   department/faculty (400); an unknown period is 404.
9. The dean's route refuses a foreign department (403) and an inactive period (its own error).
10. Part II's department ZIP — its bytes' shape, tree, tests — does not move.

## 10. Out of scope

- The existing department ZIP.
- The subject-grain workbook and its routes.
- The faculty's own page and the list page's export.
- The PDFs, the CSV, the Reports module.
- The database/schema and any new repository method.
- The general-rating arithmetic and the Highest/Lowest live-rubric seam.
- A letterhead on the consolidated workbook.
