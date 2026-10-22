import { createZip } from "./zip"
import {
  SHEET_COMMENTS,
  SHEET_INDIVIDUAL,
  SHEET_OVERALL,
  clearRowsFrom,
  internString,
  loadEvalTemplate,
  partText,
  readCell,
  putRow,
  readRow,
  setCellNumber,
  setCellSharedString,
  setCellText,
  setPartText,
} from "./xlsx-template"

/**
 * The export's Excel workbook: the GENERATOR.
 *
 * The template is a **style donor**, not the piece to fill in. Its header rows
 * and its styling for each rubric are copied; the criterion blocks are written
 * from the data. So the layout follows the rubric - a rubric that gains a
 * statement makes a longer form, and there is no cell map to keep in step with
 * anything.
 *
 * The workbook is a REPORT: the template's formulas are replaced by our own
 * values, and the criterion names and the statement texts are the APP's wording
 * (the students rated those), not the legacy's typed ones.
 */

/** One criterion, with its statements. */
export interface EvalFormCriterion {
  /** the rubric's category name */
  name: string
  /** the criterion's average over the counted responses */
  average: number | null
  /** the criterion's statements, in the rubric's order */
  statements: { text: string; avg: number | null }[]
}

export interface EvalFormInput {
  employeeNo: string | null
  facultyName: string
  program: string | null
  sectionName: string | null
  subjectCode: string
  subjectName: string
  departmentName: string
  departmentCode: string
  semesterTitle: string | null
  evaluationPeriodName: string | null
  /** the general rating - the mean of the criterion averages */
  avgRating: number | null
  remarks: string | null
  totalRespondents: number
  /** the criteria, in the rubric's order */
  criteria: EvalFormCriterion[]
  /** the comments the responses left */
  comments: { submittedAt: string | null; comment: string }[]
}

/** The rows of the template the header block occupies. */
const HEADER_ROWS = 10

/** The style ids the statement text wraps at - past it, the row is two lines. */
const STATEMENT_WRAP = 90
const ROW_ONE_LINE = 13.5
const ROW_TWO_LINES = 30

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]

// ── the style donor ─────────────────────────────────────────────────────────

interface DonatedRow {
  /** the row's opening tag - it carries the height and the row's own style */
  open: string
  /** the style id of a cell in that row */
  style: (ref: string) => string | null
}

interface BlockStyles {
  criterion: DonatedRow
  statement: DonatedRow
  /** the statement rows alternate, so the donor has two */
  statementAlt: DonatedRow
  average: DonatedRow
  spacer: DonatedRow
  total: DonatedRow
  final: DonatedRow
}

function donor(sheet: string, row: number, refs: string[]): DonatedRow {
  const info = readRow(sheet, row)
  if (!info) throw new Error(`the template has no row ${row} - it is not the form`)
  return {
    open: info.open,
    style: (ref) => readCell(sheet, `${ref}${row}`)?.style ?? null,
  }
}

/** The template's rubric-block styles, read before the rows are replaced. */
function readBlockStyles(sheet: string): BlockStyles {
  return {
    criterion: donor(sheet, 11, ["A", "I"]),
    statement: donor(sheet, 12, ["A", "I"]),
    statementAlt: donor(sheet, 13, ["A", "I"]),
    average: donor(sheet, 15, ["A", "I"]),
    spacer: donor(sheet, 16, []),
    total: donor(sheet, 77, ["H", "I"]),
    final: donor(sheet, 78, ["G", "I"]),
  }
}

// ── building a row ─────────────────────────────────────────────────────────

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** A cell holding text. */
function textCell(ref: string, style: string | null, text: string): string {
  const s = style === null ? "" : ` s="${style}"`
  return `<c r="${ref}"${s} t="inlineStr"><is><t>${escapeText(text)}</t></is></c>`
}

/** A cell holding a number, or an empty cell when there is none. */
function numberCell(ref: string, style: string | null, value: number | null): string {
  const s = style === null ? "" : ` s="${style}"`
  return value === null ? `<c r="${ref}"${s}/>` : `<c r="${ref}"${s}><v>${value}</v></c>`
}

/** An empty cell that carries a style. */
function emptyCell(ref: string, style: string | null): string {
  const s = style === null ? "" : ` s="${style}"`
  return `<c r="${ref}"${s}/>`
}

/** A row's opening tag, moved to a row number and given a height. */
function rowTag(donorOpen: string, rowNumber: number, height?: number): string {
  let tag = donorOpen.replace(/r="\d+"/, `r="${rowNumber}"`)
  if (height !== undefined) {
    if (/\sht="[\d.]+"/.test(tag)) {
      tag = tag.replace(/\sht="[\d.]+"/, ` ht="${height}"`)
    } else {
      tag = tag.replace(/\scustomHeight="[^"]*"/, ` customHeight="true" ht="${height}"`)
    }
  }
  return tag.replace(/\/>$/, ">")
}

/**
 * A row of the form: the statement text across A:H (merged), and the value in I.
 */
function formRow(
  style: DonatedRow,
  rowNumber: number,
  text: string,
  value: number | null,
): string {
  return (
    textCell(`A${rowNumber}`, style.style("A"), text) +
    ["B", "C", "D", "E", "F", "G", "H"]
      .map((c) => emptyCell(`${c}${rowNumber}`, style.style("A")))
      .join("") +
    numberCell(`I${rowNumber}`, style.style("I"), value)
  )
}

/** A row of the form whose last cell is text rather than a number. */
function formTextRow(
  style: DonatedRow,
  rowNumber: number,
  text: string,
  iText: string,
): string {
  return (
    textCell(`A${rowNumber}`, style.style("A"), text) +
    ["B", "C", "D", "E", "F", "G", "H"]
      .map((c) => emptyCell(`${c}${rowNumber}`, style.style("A")))
      .join("") +
    textCell(`I${rowNumber}`, style.style("I"), iText)
  )
}

// ── the sheet's merges ─────────────────────────────────────────────────────

/**
 * The merges of a generated sheet: the header block's own merges (rows 1-10) plus
 * the generated rows'. The legacy's merges for the rows it no longer has are
 * dropped - they would be merges over cells that are not there.
 */
function rebuildMerges(sheet: string, generated: string[]): string {
  const existing = (sheet.match(/<mergeCell ref="[^"]*"\/>/g) || [])
    .map((m) => m.match(/ref="([^"]+)"/)?.[1] ?? "")
    .filter((ref) => ref !== "")
  const kept = existing.filter((ref) => {
    const row = Number(ref.match(/\d+$/)?.[0] ?? 0)
    return row <= HEADER_ROWS
  })
  const all = [...kept, ...generated]
  return `<mergeCells count="${all.length}">${all
    .map((ref) => `<mergeCell ref="${ref}"/>`)
    .join("")}</mergeCells>`
}

// ── the workbook ───────────────────────────────────────────────────────────

/** The workbook, generated from the data, wearing the template's styling. */
export function buildEvaluationWorkbook(input: EvalFormInput): Uint8Array {
  const parts = loadEvalTemplate()
  let sheet = partText(parts, SHEET_INDIVIDUAL)
  let comments = partText(parts, SHEET_COMMENTS)
  let overall = partText(parts, SHEET_OVERALL)

  // the style donor is read BEFORE the rows it donates are replaced
  const styles = readBlockStyles(sheet)

  // ── the header block ─────────────────────────────────────────────────────
  // The FORM carries Program and Section (r9, r10); the COMMENTS sheet keeps
  // the legacy's own header, which has no Program and Section.
  const header = (xml: string, withProgramAndSection: boolean): string => {
    let out = xml
    out = setCellSharedString(out, "B7", internString(parts, orDash(input.employeeNo)))
    out = setCellSharedString(out, "B8", internString(parts, orDash(input.facultyName)))
    out = setCellSharedString(out, "H8", internString(parts, orDash(input.remarks)))
    out = setCellNumber(out, "H7", input.avgRating)
    out = setCellSharedString(
      out,
      "A4",
      internString(parts, `Semester: ${orDash(input.semesterTitle)}`),
    )
    out = setCellSharedString(
      out,
      "A5",
      internString(parts, `Evaluation Period: ${orDash(input.evaluationPeriodName)}`),
    )
    if (withProgramAndSection) {
      out = setCellSharedString(out, "B9", internString(parts, orDash(input.program)))
      out = setCellSharedString(out, "B10", internString(parts, orDash(input.sectionName)))
    }
    return out
  }

  sheet = header(sheet, true)
  comments = header(comments, false)
  // the comments sheet carries the identity block too - the same header rows,
  // and the same Program/Section as the form, so the two sheets never disagree
  comments = setCellSharedString(comments, "B9", internString(parts, orDash(input.program)))
  comments = setCellSharedString(comments, "B10", internString(parts, orDash(input.sectionName)))

  // ── the criterion blocks ─────────────────────────────────────────────────
  // The template's own rows from 11 down are dropped FIRST: the generated
  // blocks are the form now, and the legacy's rows would sit under them.
  sheet = clearRowsFrom(sheet, HEADER_ROWS + 1)

  const generated: string[] = []
  let row = HEADER_ROWS + 1
  input.criteria.forEach((criterion, ci) => {
    const head = formTextRow(styles.criterion, row, `${ROMAN[ci]}. ${criterion.name}`, "RATING")
    sheet = putRow(sheet, row, rowTag(styles.criterion.open, row), head)
    generated.push(`A${row}:H${row}`)
    row++

    criterion.statements.forEach((statement, si) => {
      const style = si % 2 === 0 ? styles.statement : styles.statementAlt
      const numbered = `${si + 1}. ${statement.text}`
      const height = numbered.length > STATEMENT_WRAP ? ROW_TWO_LINES : ROW_ONE_LINE
      sheet = putRow(
        sheet,
        row,
        rowTag(style.open, row, height),
        formRow(style, row, numbered, statement.avg),
      )
      generated.push(`A${row}:H${row}`)
      row++
    })

    sheet = putRow(
      sheet,
      row,
      rowTag(styles.average.open, row),
      formRow(styles.average, row, "AVERAGE", criterion.average),
    )
    generated.push(`A${row}:H${row}`)
    row++

    // the legacy's spacer between the criteria
    sheet = putRow(sheet, row, rowTag(styles.spacer.open, row), "")
    row++
  })

  // ── the footer ───────────────────────────────────────────────────────────
  const totalCells =
    ["A", "B", "C", "D", "E", "F", "G"]
      .map((c) => emptyCell(`${c}${row}`, styles.total.style(c)))
      .join("") +
    textCell(`H${row}`, styles.total.style("H"), "TOTAL RESPONDENTS") +
    numberCell(`I${row}`, styles.total.style("I"), input.totalRespondents)
  sheet = putRow(sheet, row, rowTag(styles.total.open, row), totalCells)
  row++

  const finalCells =
    ["A", "B", "C", "D", "E", "F"]
      .map((c) => emptyCell(`${c}${row}`, styles.final.style(c)))
      .join("") +
    textCell(`G${row}`, styles.final.style("G"), "FINAL RATING") +
    emptyCell(`H${row}`, styles.final.style("G")) +
    numberCell(`I${row}`, styles.final.style("I"), input.avgRating)
  sheet = putRow(sheet, row, rowTag(styles.final.open, row), finalCells)
  generated.push(`G${row}:H${row}`)

  // ── the comments sheet ───────────────────────────────────────────────────
  // the legacy's writing rows are dropped, and the comments take their place
  const commentStyles = {
    open: readRow(comments, 11)?.open ?? "",
    style: (ref: string) => readCell(comments, `${ref}11`)?.style ?? null,
  }
  comments = clearRowsFrom(comments, HEADER_ROWS + 1)
  let commentRow = HEADER_ROWS + 1
  input.comments.forEach((comment) => {
    const date = comment.submittedAt ? comment.submittedAt.slice(0, 10) : ""
    const cells =
      textCell(`A${commentRow}`, commentStyles.style("A"), date) +
      textCell(`B${commentRow}`, commentStyles.style("B"), comment.comment)
    comments = putRow(comments, commentRow, rowTag(commentStyles.open, commentRow), cells)
    commentRow++
  })

  // ── the overall sheet ────────────────────────────────────────────────────
  // the legacy's stray numbering below the data row goes; its data ROW stays,
  // because it carries the styles the row is written with
  overall = clearRowsFrom(overall, 8)
  const overallRow: [string, string | number | null][] = [
    ["A7", 1],
    ["B7", input.facultyName],
  ]
  input.criteria.forEach((c, i) => {
    const col = String.fromCharCode(67 + i)
    // the column's HEADING is the rubric's name, and the value under it is the
    // criterion's average - so a renamed or reordered criterion keeps its name
    // over its own numbers
    overallRow.push([`${col}6`, c.name])
    overallRow.push([`${col}7`, c.average])
  })
  overallRow.push(["K7", input.avgRating])
  overallRow.push(["L7", input.remarks])
  overallRow.push(["M7", input.totalRespondents])
  overallRow.push(["N7", input.departmentName])
  for (const [ref, value] of overallRow) {
    if (typeof value === "number") {
      overall = setCellNumber(overall, ref, value)
    } else {
      overall = setCellText(overall, ref, value ?? "")
    }
  }

  // ── the merges ───────────────────────────────────────────────────────────
  sheet = sheet.replace(
    /<mergeCells count="\d+">[\s\S]*?<\/mergeCells>/,
    rebuildMerges(sheet, generated),
  )

  setPartText(parts, SHEET_INDIVIDUAL, sheet)
  setPartText(parts, SHEET_COMMENTS, comments)
  setPartText(parts, SHEET_OVERALL, overall)

  // the shared strings' counts are advisory, but they are cheap to get right
  const stringsXml = partText(parts, "xl/sharedStrings.xml")
  let stringCells = 0
  for (const name of [SHEET_INDIVIDUAL, SHEET_COMMENTS, SHEET_OVERALL]) {
    stringCells += (partText(parts, name).match(/t="s"/g) || []).length
  }
  const uniqueCount = (stringsXml.match(/<si>/g) || []).length
  setPartText(
    parts,
    "xl/sharedStrings.xml",
    stringsXml
      .replace(/count="\d+"/, `count="${stringCells}"`)
      .replace(/uniqueCount="\d+"/, `uniqueCount="${uniqueCount}"`),
  )

  const entries = [...parts.entries()].map(([name, data]) => ({ name, data }))
  return createZip(entries)
}

/** A dash for a value that is not there - never a blank, never a guess. */
export function orDash(value: string | null | undefined): string {
  const text = (value ?? "").trim()
  return text === "" ? "—" : text
}
