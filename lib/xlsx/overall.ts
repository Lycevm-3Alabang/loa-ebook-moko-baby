import { getRemark, type CategoryAverages } from "@/lib/evaluation-utils"
import { orDash, ROW_ONE_LINE, type FormRow } from "./form-model"
import { cell, spread } from "./rows"
import { colName, type CellSpec, type ColumnSpec, type RowSpec, type SheetSpec } from "./writer"

/**
 * The Overall sheet — its model, and the sheet it is drawn as.
 *
 * ⭐ ONE ROW PER STUDENT RESPONSE — "the actual evaluation scores FOR EACH
 * student response" (the owner). The legacy's Overall sheet was a per-FACULTY
 * table: one row for the teacher, and three of its columns were CONSTANTS
 * (the name, the respondent count, the department). At this grain those
 * constants become the header block, and the table's body is the responses.
 *
 * ⭐ THE COLUMNS FOLLOW THE RUBRIC. The rubric is data and it changes between
 * periods, so the criteria columns are derived from the live rubric — and the
 * value under a column is that response's average FOR THAT CRITERION, taken
 * from the LIVE per-response map the read already carries. Nothing here may
 * assume a criterion count.
 *
 * ⭐ THE REMARK IS THE APP'S OWN. The REMARKS column reads `getRemark`, so
 * the sheet cannot print a ladder the app does not use — the drift the cut
 * already had to correct by hand, in the legacy's legend.
 */

/** The sheet's title — the legacy's own wording. */
export const OVERALL_TITLE = "Faculty Performance Evaluation Result (Post-evaluation)"

/** One column of the table. */
export type OverallColumn =
  | { kind: "no"; heading: string }
  | { kind: "subject"; heading: string }
  | { kind: "section"; heading: string }
  | { kind: "date"; heading: string }
  | { kind: "criterion"; heading: string; criterionIndex: number }
  | { kind: "rating"; heading: string }
  | { kind: "remarks"; heading: string }

/** One response, as the table's row. */
export interface OverallResponse {
  /** when the response was submitted */
  submittedAt: string | null
  /** the response's general rating */
  generalRating: number | null
  /**
   * ⭐ The LIVE per-response averages, keyed by the rubric's category name.
   *
   * This is the map the read carries for exactly this reason: the columns
   * follow the rubric, so the values under them have to be the rubric's own
   * averages and not the app's fixed eight.
   */
  categoryAverages: CategoryAverages
  /**
   * ⭐ The subject's label for THIS response — when the sheet spans a
   * faculty's subject-sections rather than one subject.
   */
  subject?: string
  /** ⭐ The section's label for THIS response — at the faculty grain. */
  section?: string
}

/** One response's row, as the model states it. */
export interface OverallDataRow {
  /** the response's number in the response set */
  no: number
  /** the response's subject — when the sheet spans subject-sections */
  subject: string
  /** the response's section — when the sheet spans subject-sections */
  section: string
  /** the response's date — YYYY-MM-DD */
  date: string
  /** the criteria's values, in the rubric's order */
  values: (number | null)[]
  /** the response's general rating */
  rating: number | null
  /** the response's remark — the app's own */
  remark: string
}

/** The Overall sheet's model. */
export interface OverallModel {
  /** the header block — the constants that used to be columns */
  header: FormRow[]
  /** the table's columns, in order */
  columns: OverallColumn[]
  /** the table's rows — one per response */
  rows: OverallDataRow[]
  /** the table's header row's height — the longest heading decides it */
  headerHeight: number
}

/** What the Overall sheet is built from. */
export interface OverallInput {
  /** the term — the semester's title */
  semesterTitle: string | null
  /** the teacher's name */
  facultyName: string | null
  /** the department — printed when the sheet spans a faculty */
  department?: { name: string; code: string } | null
  /** the subject */
  subject: { code: string; name: string } | null
  /** whether the table carries a SUBJECT column — the faculty grain */
  showSubjectColumn?: boolean
  /** whether the table carries a SECTION column — the faculty grain */
  showSectionColumn?: boolean
  /** the rubric's criteria, in the rubric's order — the table's columns */
  criteria: { name: string }[]
  /** the responses, in the response set's order */
  responses: OverallResponse[]
}

/** How many characters of a heading fit on a line. */
const HEADING_WRAP = 14
/** The table's header row never shrinks below this. */
const HEADER_ROW_FLOOR = 45
/** One line of a 9pt cell, in points. */
const LINE_HEIGHT = 12

/**
 * The table's header row's height — the longest heading decides it.
 *
 * The rubric is data, so a period can name a criterion nothing here has seen
 * before. A heading that does not fit is clipped, and a clipped criterion name
 * is a mislabelled column — so the row grows instead.
 */
function headerHeight(columns: OverallColumn[]): number {
  const lines = Math.max(
    1,
    ...columns.map((column) => Math.ceil(column.heading.length / HEADING_WRAP)),
  )
  return Math.max(HEADER_ROW_FLOOR, lines * LINE_HEIGHT + 6)
}

/** The subject's label — the code and the name, as the Individual sheet prints it. */
function subjectLabel(subject: OverallInput["subject"]): string {
  if (!subject) return ""
  return `${subject.code} ${subject.name}`.trim()
}

/** The department's label — the name and the code. */
function departmentLabel(department: { name: string; code: string }): string {
  return department.code ? `${department.name} (${department.code})` : department.name
}

/** The Overall sheet's model: the header block, the table's columns and its rows. */
export function buildOverallModel(input: OverallInput): OverallModel {
  const showSubject = input.showSubjectColumn === true
  const showSection = input.showSectionColumn === true

  const columns: OverallColumn[] = [
    { kind: "no", heading: "NO" },
    // ⭐ the faculty grain moves the subject from the header to a column, and
    // names each response's section — the rows span several subject-sections
    ...(showSubject ? [{ kind: "subject" as const, heading: "SUBJECT" }] : []),
    ...(showSection ? [{ kind: "section" as const, heading: "SECTION" }] : []),
    { kind: "date", heading: "DATE" },
    ...input.criteria.map((criterion, criterionIndex) => ({
      kind: "criterion" as const,
      heading: criterion.name,
      criterionIndex,
    })),
    { kind: "rating", heading: "GENERAL RATING" },
    { kind: "remarks", heading: "REMARKS" },
  ]

  const rows: OverallDataRow[] = input.responses.map((response, index) => ({
    no: index + 1,
    subject: orDash(response.subject),
    section: orDash(response.section),
    date: response.submittedAt ? response.submittedAt.slice(0, 10) : "—",
    // ⭐ the live average for THAT criterion — a criterion nobody rated is a
    // blank value, never a zero
    values: input.criteria.map((criterion) => response.categoryAverages[criterion.name] ?? null),
    rating: response.generalRating,
    remark: orDash(getRemark(response.generalRating)),
  }))

  return {
    header: [
      { kind: "title", text: OVERALL_TITLE },
      { kind: "subtitle", text: `Semester: ${orDash(input.semesterTitle)}` },
      { kind: "subtitle", text: `Faculty: ${orDash(input.facultyName)}` },
      ...(input.department
        ? [{ kind: "subtitle" as const, text: `Department: ${departmentLabel(input.department)}` }]
        : []),
      // ⭐ the subject is a COLUMN at the faculty grain — never both
      ...(showSubject
        ? []
        : [{ kind: "subtitle" as const, text: `Subject: ${orDash(subjectLabel(input.subject))}` }]),
      { kind: "spacer" },
    ],
    columns,
    rows,
    headerHeight: headerHeight(columns),
  }
}

/** The columns' widths — the fixed ones and the criteria's. */
const WIDTHS: Record<OverallColumn["kind"], number> = {
  no: 6,
  subject: 30,
  section: 14,
  date: 12,
  criterion: 16,
  rating: 15,
  remarks: 20,
}

/** The sheet's column widths — the columns that share one are written as one span. */
function columnSpecs(columns: OverallColumn[]): ColumnSpec[] {
  const specs: ColumnSpec[] = []
  columns.forEach((column, index) => {
    const width = WIDTHS[column.kind]
    const letter = colName(index)
    const previous = specs[specs.length - 1]
    if (previous && previous.width === width && previous.to === colName(index - 1)) {
      previous.to = letter
      return
    }
    specs.push({ from: letter, to: letter, width })
  })
  return specs
}

/**
 * A data row's height.
 *
 * ⭐ At the faculty grain the subject and the section are TEXT in their own
 * columns — a wrapped label in a one-line row would be clipped, so the row
 * grows with the label. The subject grain's rows keep their one-line height.
 */
function dataRowHeight(model: OverallModel, data: OverallDataRow): number {
  const lines = Math.max(
    1,
    ...model.columns.map((column) => {
      if (column.kind === "subject") return Math.ceil(data.subject.length / WIDTHS.subject)
      if (column.kind === "section") return Math.ceil(data.section.length / WIDTHS.section)
      return 1
    }),
  )
  return lines === 1 ? ROW_ONE_LINE : lines * LINE_HEIGHT + 4
}

/** The Overall sheet, drawn from its model. */
export function renderOverallSheet(model: OverallModel): SheetSpec {
  const letters = model.columns.map((_, index) => colName(index))
  const last = letters[letters.length - 1]
  const rows: RowSpec[] = []
  const merges: string[] = []

  // ── the header block ──────────────────────────────────────────────────────
  model.header.forEach((header, index) => {
    const row = index + 1
    switch (header.kind) {
      case "title":
        rows.push({ row, height: ROW_ONE_LINE, cells: spread(row, "title", header.text, letters) })
        merges.push(`A${row}:${last}${row}`)
        break

      case "subtitle":
        rows.push({ row, height: ROW_ONE_LINE, cells: spread(row, "subtitle", header.text, letters) })
        merges.push(`A${row}:${last}${row}`)
        break

      case "spacer":
        rows.push({ row, height: ROW_ONE_LINE, cells: spread(row, "spacer", null, letters) })
        break

      default:
        throw new Error(`the Overall sheet has no "${header.kind}" row`)
    }
  })

  // ── the table ─────────────────────────────────────────────────────────────
  const headerRow = model.header.length + 1
  rows.push({
    row: headerRow,
    height: model.headerHeight,
    cells: model.columns.map((column, index) =>
      cell(headerRow, letters[index], "tableHeader", column.heading),
    ),
  })

  model.rows.forEach((data, index) => {
    const row = headerRow + 1 + index
    const cells: CellSpec[] = []
    model.columns.forEach((column, columnIndex) => {
      const letter = letters[columnIndex]
      switch (column.kind) {
        case "no":
          cells.push(cell(row, letter, "tableCell", data.no))
          break
        case "subject":
          cells.push(cell(row, letter, "tableText", data.subject))
          break
        case "section":
          cells.push(cell(row, letter, "tableText", data.section))
          break
        case "date":
          cells.push(cell(row, letter, "tableCell", data.date))
          break
        case "criterion":
          cells.push(cell(row, letter, "tableNumber", data.values[column.criterionIndex]))
          break
        case "rating":
          cells.push(cell(row, letter, "tableNumber", data.rating))
          break
        case "remarks":
          cells.push(cell(row, letter, "tableCell", data.remark))
          break
      }
    })
    rows.push({ row, height: dataRowHeight(model, data), cells })
  })

  return {
    name: "Overall",
    columns: columnSpecs(model.columns),
    rows,
    merges,
    // ⭐ the sheet is wide — it is landscape
    orientation: "landscape",
    printArea: `$A:$${last}`,
    // the header block AND the table's header row repeat on every page
    printTitles: `$1:$${headerRow}`,
  }
}
