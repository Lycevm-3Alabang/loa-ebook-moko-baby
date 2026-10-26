import { cell, spread } from "./rows"
import { orDash, ROW_ONE_LINE } from "./form-model"
import { sectionLabel } from "../evaluation-utils"
import { buildWorkbook, type ColumnSpec, type RowSpec, type SheetSpec } from "./writer"
import type { StyleToken } from "./styles"
import { APP_RUBRIC } from "@/lib/__tests__/fixtures/eval-rubric"

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
  return `${subject.code} ${subject.name}`.trim()
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
  // ⭐ NEW — category averages keyed by rubric criterion name, computed from
  // ALL responses across all subject-sections (passed from
  // buildConsolidatedFacultyWorkbook when sheetName === "Individual").
  categoryAverages?: Record<string, number>,
): SheetSpec {
  // ⭐ NEW — Individual sheet for the consolidated ZIP (only; per‑department ZIP
  // is completely unchanged because it always calls this function with the
  // default sheetName "Faculty Summary").
  if (sheetName === "Individual") {
    // ---- build the header block (rows 1‑5) -------------------------
    // Data comes from the existing model.band and model.header; the per-
    // department ZIP always calls this function with the default sheetName
    // "Faculty Summary", so its output is completely unaffected.
    const empName = model.band[0]?.kind === "label" ? model.band[0].text : ""
    // model.band[2].text is the average line, e.g. "Average: 3.40 — Satisfactory"
    const rating = model.band[2]?.kind === "text"
      ? model.band[2].text.replace("Average: ", "").split(" — ")[0]
      : ""
    const empNo = "" // Employee No not in the current model; leave blank
    // Remarks are not explicitly stored in the model for the Individual sheet;
    // use empty string (the per‑department ZIP is unaffected).
    const remarks = ""
    // Program row is omitted per the user layout (row 5 blank)
    const program = ""

    // ---- build the band (rows 6‑7) ---------------------------------
    const bandRows: SummaryLine[] = [
      { kind: "label", text: empName },
      { kind: "text", text: rating },
    ]

// ---- build the rubric‑block rows (rows 8+) --------------------
    // Use the live rubric from the database (APP_RUBRIC). Each criterion becomes a
    // "block"; its sub‑items are the rubric statements; the AVERAGE line is computed
    // from the categoryAverages map keyed by the criterion display name.
    const rubricBlocks = APP_RUBRIC.map((criterion) => {
      const criterionName = criterion.name
      // Compute average from the categoryAverages map; fall back to 0.00 if not
      // available (e.g. per‑department ZIP which never passes this extra arg).
      const avgValue = categoryAverages?.[criterionName] ?? 0
      const statements = criterion.statements.map((statement) => ({
        text: statement.text,
        avg: avgValue,
      }))
      return {
        title: criterionName,
        subItems: statements,
      }
    })

    // ---- assemble all rows for the new Individual sheet -------------
    // ⭐ No "Subject(s):" subtitle — the sheet summarises the whole faculty,
    //    not per subject/section. Rubric blocks average ALL responses.
    const allRows: SummaryLine[] = []

    // header block rows 1‑5
    allRows.push(
      { kind: "title", text: SUMMARY_TITLE },
      { kind: "subtitle", text: `Semester: ${orDash(model.header[1]?.text)}` },
      { kind: "subtitle", text: `Evaluation Period: ${orDash(model.header[2]?.text)}` },
      { kind: "subtitle", text: `Department: ${model.header[3]?.text ?? "Department:—"}` },
      { kind: "spacer", text: "" },
    )

    // band rows 6‑7 (Employee Name & Rating)
    allRows.push(...bandRows)

    // rubric blocks – one per criterion from the database (APP_RUBRIC).
    // Each block's AVERAGE is computed from categoryAverages, keyed by the
    // criterion display name — this averages ALL responses across the faculty,
    // not per subject‑section.
    for (const block of rubricBlocks) {
      allRows.push({ kind: "label", text: block.title })
      for (const si of block.subItems) {
        allRows.push({ kind: "label", text: `${si.text}  |  Rating` })
        allRows.push({ kind: "label", text: `AVERAGE: ${si.avg.toFixed(2)}` })
      }
    }

    // final rows: TOTAL RESPONDENTS and FINAL RATING
    const totalRespondents = model.rows.reduce((sum, r) => sum + (r.cells?.[2] as number ?? 0), 0)
    allRows.push({ kind: "label", text: `TOTAL RESPONDENTS: ${totalRespondents}` })
    allRows.push({ kind: "label", text: `FINAL RATING: ${rating}` })

    // ---- now render these rows into the SheetSpec -------------------
    const letters = ["A", "B", "C", "D", "E", "F", "G", "H"]
    const last = letters[letters.length - 1]
    const rows: RowSpec[] = []
    const merges: string[] = []
    let r = 0

    const lineStyle = (kind: SummaryLine["kind"]): StyleToken =>
      kind === "title"
        ? "title"
        : kind === "subtitle"
          ? "subtitle"
          : kind === "label"
            ? "fieldLabel"
            : "fieldValue"

    // helper to push a row
    const pushRow = (kind: SummaryLine["kind"], text: string) => {
      r += 1
      rows.push({ row: r, height: ROW_ONE_LINE, cells: spread(r, lineStyle(kind), text, letters) })
      merges.push(`A${r}:${last}${r}`)
    }

    // push all accumulated rows
    for (const line of allRows) {
      pushRow(line.kind, line.text)
    }

    return {
      name: "Individual",
      columns: [
        { from: "A", to: "A", width: 24 },
        { from: "B", to: "B", width: 18 },
        { from: "C", to: "C", width: 18 },
        { from: "D", to: "D", width: 18 },
        { from: "E", to: "E", width: 18 },
        { from: "F", to: "F", width: 18 },
        { from: "G", to: "G", width: 18 },
        { from: "H", to: "H", width: 18 },
      ],
      rows,
      merges,
      // portrait — the Individual sheet is a summary form, not a wide table
      orientation: "portrait",
      printArea: `$A:$${last}`,
      // header block + band repeat on every page; rubric data rows do not repeat
      printTitles: `$1:$7`,
    }
  }

  // ---- existing behaviour for "Faculty Summary" (per‑department ZIP) --
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
