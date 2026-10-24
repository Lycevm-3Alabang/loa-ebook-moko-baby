import { cell, spread } from "./rows"
import { orDash, ROW_ONE_LINE } from "./form-model"
import { buildWorkbook, type ColumnSpec, type RowSpec, type SheetSpec } from "./writer"
import type { StyleToken } from "./styles"
import type { SummaryLine } from "./overall-summary"

/**
 * The DEPARTMENT's CONSOLIDATED FILE — one row, at the department folder's
 * root in the ZIP (D30).
 *
 * ⭐ The row is the department card's figure: the `summary.csv` columns, built
 * from the department read's `members` and `departmentAggregate` — no new read.
 * ⭐ The faculty count is the `members` (the §3.14 headcount), NOT
 * `departmentAggregate.uniqueFaculty`; the average is the aggregate's
 * unweighted mean of rated Subject–Section scores, not a mean of faculty
 * averages.
 */

/** The file's title — the school's wording (D34). */
export const DEPARTMENT_SUMMARY_TITLE =
  "DEPARTMENT PERFORMANCE EVALUATION RESULT (POST-EVALUATION)"

/** What the file is built from. */
export interface DepartmentSummaryInput {
  /** the term */
  semesterTitle: string | null
  /** the evaluation period */
  evaluationPeriodName: string | null
  /** the scope's own department — the row */
  department: { name: string; code: string }
  /** ⭐ the members' count — `members.length`, the card's headcount */
  facultyCount: number
  /** ⭐ the aggregate's `totalResponses` — 0 when the aggregate is null */
  totalRespondents: number
  /** the aggregate's Subject–Section-row average — null prints a dash */
  avgRating: number | null
  /** the aggregate's remark — null prints a dash */
  remarks: string | null
}

/** The file's model. */
export interface DepartmentSummaryModel {
  /** the header block — the title, the term, the period */
  header: SummaryLine[]
  /** the table's headings */
  headings: string[]
  /** the table's rows — one: the department */
  rows: { cells: (string | number | null)[]; height: number }[]
}

/** The table's columns — their widths decide the row height. */
const COLUMN_WIDTHS = [24, 8, 14, 13, 11, 20]

/** The columns' specs. */
const COLUMN_SPECS: ColumnSpec[] = [
  { from: "A", to: "A", width: COLUMN_WIDTHS[0] },
  { from: "B", to: "B", width: COLUMN_WIDTHS[1] },
  { from: "C", to: "C", width: COLUMN_WIDTHS[2] },
  { from: "D", to: "D", width: COLUMN_WIDTHS[3] },
  { from: "E", to: "E", width: COLUMN_WIDTHS[4] },
  { from: "F", to: "F", width: COLUMN_WIDTHS[5] },
]

/** One line of a 9pt cell, in points. */
const LINE_HEIGHT = 12

/** A row's height — the longest cell decides it, so a long name never clips. */
function rowHeight(cells: (string | number | null)[]): number {
  const lines = Math.max(
    1,
    ...cells.map((value, index) =>
      Math.ceil(String(value ?? "").length / COLUMN_WIDTHS[index]),
    ),
  )
  return lines * LINE_HEIGHT + 4
}

/**
 * The file's model.
 *
 * ⭐ One row: the department. ⭐ A null aggregate prints `0` respondents and a
 * dash for the rating and the remark — a missing file would read as a missing
 * department.
 */
export function buildDepartmentSummaryModel(
  input: DepartmentSummaryInput,
): DepartmentSummaryModel {
  const header: SummaryLine[] = [
    { kind: "title", text: DEPARTMENT_SUMMARY_TITLE },
    { kind: "subtitle", text: `Semester: ${orDash(input.semesterTitle)}` },
    { kind: "subtitle", text: `Evaluation Period: ${orDash(input.evaluationPeriodName)}` },
    { kind: "spacer", text: "" },
  ]

  const cells: (string | number | null)[] = [
    orDash(input.department.name),
    orDash(input.department.code),
    input.facultyCount,
    input.totalRespondents,
    input.avgRating === null ? "—" : input.avgRating,
    orDash(input.remarks),
  ]

  return {
    header,
    headings: ["DEPARTMENT", "CODE", "FACULTY COUNT", "RESPONDENTS", "AVG RATING", "REMARK"],
    rows: [{ cells, height: rowHeight(cells) }],
  }
}

/** The sheet, drawn from its model. */
export function renderDepartmentSummarySheet(model: DepartmentSummaryModel): SheetSpec {
  const letters = ["A", "B", "C", "D", "E", "F"]
  const last = letters[letters.length - 1]
  const rows: RowSpec[] = []
  const merges: string[] = []
  let row = 0

  const lineStyle = (kind: SummaryLine["kind"]): StyleToken =>
    kind === "title"
      ? "title"
      : kind === "subtitle"
        ? "subtitle"
        : kind === "label"
          ? "fieldLabel"
          : "fieldValue"

  for (const line of model.header) {
    row += 1
    if (line.kind === "spacer") {
      rows.push({ row, height: ROW_ONE_LINE, cells: spread(row, "spacer", null, letters) })
      continue
    }
    rows.push({
      row,
      height: ROW_ONE_LINE,
      cells: spread(row, lineStyle(line.kind), line.text, letters),
    })
    merges.push(`A${row}:${last}${row}`)
  }

  // the table's header row
  row += 1
  rows.push({
    row,
    height: ROW_ONE_LINE,
    cells: model.headings.map((heading, index) =>
      cell(row, letters[index], "tableHeader", heading),
    ),
  })

  // the table's one row — ⭐ the counts print in general format (`0`, not
  // `0.00`), the average in the rating's two decimals
  for (const data of model.rows) {
    row += 1
    rows.push({
      row,
      height: data.height,
      cells: data.cells.map((value, index) =>
        cell(row, letters[index],
          index === 2 || index === 3 ? "tableCell"
            : index === 4 ? "tableNumber"
            : "tableText",
          value),
      ),
    })
  }

  return {
    name: "Department Summary",
    columns: COLUMN_SPECS,
    rows,
    merges,
    // ⭐ six short columns — it is portrait, one page wide
    orientation: "portrait",
    printArea: `$A:$${last}`,
  }
}

/** The file — one sheet, built by the existing writer. */
export function buildDepartmentSummaryWorkbook(
  input: DepartmentSummaryInput,
): Uint8Array {
  return buildWorkbook({
    sheets: [renderDepartmentSummarySheet(buildDepartmentSummaryModel(input))],
  })
}
