import { cell, spread } from "./rows"
import { orDash, ROW_ONE_LINE } from "./form-model"
import { sectionLabel } from "../evaluation-utils"
import { buildWorkbook, type ColumnSpec, type RowSpec, type SheetSpec } from "./writer"
import type { StyleToken } from "./styles"

/**
 * The faculty's CONSOLIDATED FILE — the summary the faculty cards show.
 *
 * ⭐ One file per member, in the department ZIP: the header block (the term,
 * the period, the department), the member's band (the name, the email, the
 * unweighted mean of rated rows) and the table — one row per subject-section.
 *
 * ⭐ It is built from what the page already read (the department read's rows
 * and its summary aggregates), so it adds NO read of its own.
 */

/** The file's title — the school's wording. */
export const SUMMARY_TITLE = "FACULTY PERFORMANCE EVALUATION RESULT (POST-EVALUATION)"

/** One subject-section's row. */
export interface FacultySummaryRow {
  /** the subject */
  subject: { code: string; name: string } | null
  /** the section — the program and the name */
  section: { program: string | null; name: string | null }
  /** the counted responses for this Subject–Section row */
  totalRespondents: number
  /** the subject-section's general rating */
  avgRating: number | null
  /** the highest rubrics — every tie */
  highest: { label: string; score: number }[]
  /** the lowest rubrics — every tie */
  lowest: { label: string; score: number }[]
}

/** What the file is built from. */
export interface FacultySummaryInput {
  /** the term */
  semesterTitle: string | null
  /** the evaluation period */
  evaluationPeriodName: string | null
  /** the department — the scope, so it is printed */
  department: { name: string; code: string } | null
  /** the member */
  faculty: { name: string; email: string; avgRating: number | null; remarks: string | null }
  /** the member's subject-sections */
  rows: FacultySummaryRow[]
}

/** A line of the header block or the band. */
export interface SummaryLine {
  kind: "title" | "subtitle" | "label" | "text" | "spacer"
  text: string
}

/** The file's model. */
export interface FacultySummaryModel {
  /** the header block */
  header: SummaryLine[]
  /** the member's band */
  band: SummaryLine[]
  /** the table's headings */
  headings: string[]
  /** the table's rows */
  rows: { cells: (string | number | null)[]; height: number }[]
}

/** The table's columns — their widths decide the row heights. */
const COLUMN_WIDTHS = [34, 14, 11, 10, 26, 26]

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

/** The subject's label — the code and the name. */
function subjectLabel(subject: FacultySummaryRow["subject"]): string {
  if (!subject) return "—"
  return `${subject.code} ${subject.name}`.trim() || "—"
}

/** The rubrics' label — every tie, comma-joined. */
function rubricsLabel(rubrics: { label: string; score: number }[]): string {
  if (rubrics.length === 0) return ""
  return rubrics.map((rubric) => `${rubric.label} ${rubric.score.toFixed(2)}`).join(", ")
}

/** The band's average line — the unweighted mean and its remark. */
function averageLine(faculty: FacultySummaryInput["faculty"]): string {
  if (faculty.avgRating === null) return "Average: —"
  const remark = faculty.remarks ? ` — ${faculty.remarks}` : ""
  return `Average: ${faculty.avgRating.toFixed(2)}${remark}`
}

/** The department's label — the name and the code. */
function departmentLabel(department: FacultySummaryInput["department"]): string {
  if (!department) return "—"
  return department.code ? `${department.name} (${department.code})` : department.name
}

/** A row's height — the longest cell decides it. */
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
 * ⭐ The rows are sorted here — the subject code, then the section label — so
 * two exports of the same data print the same rows (the order is TOTAL, or a
 * page boundary can duplicate or skip a row).
 */
export function buildFacultySummaryModel(
  input: FacultySummaryInput,
): FacultySummaryModel {
  const header: SummaryLine[] = [
    { kind: "title", text: SUMMARY_TITLE },
    { kind: "subtitle", text: `Semester: ${orDash(input.semesterTitle)}` },
    { kind: "subtitle", text: `Evaluation Period: ${orDash(input.evaluationPeriodName)}` },
    { kind: "subtitle", text: `Department: ${departmentLabel(input.department)}` },
    { kind: "spacer", text: "" },
  ]

  const band: SummaryLine[] = [
    { kind: "label", text: orDash(input.faculty.name) },
    { kind: "text", text: orDash(input.faculty.email) },
    { kind: "text", text: averageLine(input.faculty) },
    { kind: "spacer", text: "" },
  ]

  const rows = [...input.rows]
    .sort((a, b) => {
      const bySubject = subjectLabel(a.subject).localeCompare(subjectLabel(b.subject))
      if (bySubject !== 0) return bySubject
      return sectionLabel(a.section.program, a.section.name).localeCompare(
        sectionLabel(b.section.program, b.section.name),
      )
    })
    .map((row) => {
      const cells: (string | number | null)[] = [
        subjectLabel(row.subject),
        sectionLabel(row.section.program, row.section.name),
        row.totalRespondents,
        row.avgRating === null ? "—" : row.avgRating,
        rubricsLabel(row.highest),
        rubricsLabel(row.lowest),
      ]
      return { cells, height: rowHeight(cells) }
    })

  return {
    header,
    band,
    headings: ["SUBJECT", "SECTION", "RESPONDENTS", "AVG RATING", "HIGHEST", "LOWEST"],
    rows,
  }
}

/**
 * The sheet, drawn from its model.
 *
 * ⭐ The tab's name is a parameter because the faculty grain's workbook calls
 * this sheet `Individual` — the same sheet, the same content, the name the
 * school's three-tab workbook gives it. The subject grain keeps the default.
 */
export function renderFacultySummarySheet(
  model: FacultySummaryModel,
  sheetName = "Faculty Summary",
): SheetSpec {
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

  for (const line of [...model.header, ...model.band]) {
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
  const headerRow = row
  rows.push({
    row,
    height: ROW_ONE_LINE,
    cells: model.headings.map((heading, index) =>
      cell(row, letters[index], "tableHeader", heading),
    ),
  })

  // the table's rows
  for (const data of model.rows) {
    row += 1
    rows.push({
      row,
      height: data.height,
      cells: data.cells.map((value, index) =>
        cell(row, letters[index],
          index === 2 ? "tableCell"
            : index === 3 ? "tableNumber"
            : "tableText",
          value),
      ),
    })
  }

  return {
    name: sheetName,
    columns: COLUMN_SPECS,
    rows,
    merges,
    // ⭐ the table is wide — it is landscape
    orientation: "landscape",
    printArea: `$A:$${last}`,
    // the header block, the band and the table's header row repeat on every page
    printTitles: `$1:$${headerRow}`,
  }
}

/** The file — one sheet, built by the existing writer. */
export function buildFacultySummaryWorkbook(
  input: FacultySummaryInput,
  sheetName = "Faculty Summary",
): Uint8Array {
  return buildWorkbook({
    sheets: [renderFacultySummarySheet(buildFacultySummaryModel(input), sheetName)],
  })
}
