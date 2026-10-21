import { createZip } from "./zip"
import {
  type FormPositions,
  type WorkbookParts,
  SHEET_COMMENTS,
  SHEET_INDIVIDUAL,
  SHEET_OVERALL,
  clearRowsFrom,
  deriveFormPositions,
  internString,
  loadEvalTemplate,
  partText,
  setCellNumber,
  setCellSharedString,
  setCellText,
  setPartText,
} from "./xlsx-template"

/**
 * The export's Excel workbook: the fill contract.
 *
 * The TEMPLATE owns the LAYOUT - where the cells are, their styles, the
 * letterhead, the print setup. The APP owns the CONTENT - the numbers, the
 * names, the statements, the comments. This module is the seam between them.
 *
 * The position map is DERIVED from the template's own formulas (the AVERAGE
 * cells say which cells they average), so a re-cut template is followed
 * automatically and no cell reference is typed into the code.
 */

/** One criterion, with its statements. */
export interface EvalFormCriterion {
  /** the rubric's category name, e.g. "Professional Manner" */
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

/**
 * The rubric and the template disagree - the workbook would show a number
 * against the wrong statement, so the export refuses to write anything.
 */
export class FormRubricMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FormRubricMismatchError"
  }
}

/** A dash for a value that is not there - never a blank, never a guess. */
export function orDash(value: string | null | undefined): string {
  const text = (value ?? "").trim()
  return text === "" ? "—" : text
}

/**
 * The guard: the live rubric must fit the template's LAYOUT.
 *
 * The template provides the LAYOUT - how many criteria, how many statement
 * cells in each - and the app provides the CONTENT: the criterion names, the
 * statement texts, the numbers. So the guard is the SHAPE and nothing else:
 * the same number of criteria, and the same number of statements in each.
 *
 * The names deliberately do NOT have to match. The legacy's headings are the
 * school's own wording ("COMMUNICATION WITH STUDENT", singular) and the app's
 * rubric says "Communication with Students". The export writes the rubric's
 * wording into the heading, so the heading and the numbers always travel
 * together - a criterion that is renamed, or two criteria that are swapped,
 * cannot mis-pair.
 */
export function assertRubricFitsTemplate(
  criteria: EvalFormCriterion[],
  positions: FormPositions,
): void {
  const expectedCounts = positions.statementCells.map((c) => c.length)
  const actualCounts = criteria.map((c) => c.statements.length)
  if (expectedCounts.length !== actualCounts.length) {
    throw new FormRubricMismatchError(
      `the rubric has ${actualCounts.length} criteria but the template has ${expectedCounts.length} - ` +
        `the Excel template needs to be re-cut`,
    )
  }
  for (let i = 0; i < expectedCounts.length; i++) {
    if (expectedCounts[i] !== actualCounts[i]) {
      throw new FormRubricMismatchError(
        `criterion ${i + 1} has ${actualCounts[i]} statements in the rubric but the template has ` +
          `${expectedCounts[i]} - the Excel template needs to be re-cut`,
      )
    }
  }
}

/** The roman numerals the template's criteria are numbered with. */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]

/** The header block, written on both the form and the comments sheet. */
function writeHeaderBlock(xml: string, parts: WorkbookParts, input: EvalFormInput): string {
  let out = xml
  out = setCellSharedString(out, "B7", internString(parts, orDash(input.employeeNo)))
  out = setCellSharedString(out, "B8", internString(parts, orDash(input.facultyName)))
  out = setCellSharedString(out, "H8", internString(parts, orDash(input.remarks)))
  out = setCellNumber(out, "H7", input.avgRating)
  out = setCellSharedString(out, "A4", internString(parts, `Semester: ${orDash(input.semesterTitle)}`))
  out = setCellSharedString(
    out,
    "A5",
    internString(parts, `Evaluation Period: ${orDash(input.evaluationPeriodName)}`),
  )
  return out
}

/** The workbook, filled with the app's figures. */
export function buildEvaluationWorkbook(input: EvalFormInput): Uint8Array {
  const parts = loadEvalTemplate()
  let sheet = partText(parts, SHEET_INDIVIDUAL)
  let comments = partText(parts, SHEET_COMMENTS)
  let overall = partText(parts, SHEET_OVERALL)

  const positions = deriveFormPositions(sheet)

  // the guard runs BEFORE anything is written
  assertRubricFitsTemplate(input.criteria, positions)

  // ── the form ──────────────────────────────────────────────────────────────
  sheet = writeHeaderBlock(sheet, parts, input)
  sheet = setCellSharedString(sheet, "B9", internString(parts, orDash(input.program)))
  sheet = setCellSharedString(sheet, "B10", internString(parts, orDash(input.sectionName)))
  sheet = setCellNumber(sheet, "H77", input.totalRespondents)
  sheet = setCellNumber(sheet, positions.finalRatingCell, input.avgRating)

  for (let c = 0; c < input.criteria.length; c++) {
    const criterion = input.criteria[c]
    // the criterion's HEADING is the rubric's wording, so a renamed or
    // reordered criterion keeps its heading with its own numbers
    sheet = setCellText(
      sheet,
      positions.criterionHeaderCells[c],
      `${ROMAN[c]}. ${criterion.name}`,
    )
    for (let s = 0; s < criterion.statements.length; s++) {
      const statement = criterion.statements[s]
      // the statement's TEXT is data - the students rated this wording - so the
      // workbook says what they rated, not what the legacy workbook typed
      sheet = setCellText(sheet, positions.statementTextCells[c][s], statement.text)
      sheet = setCellNumber(sheet, positions.statementCells[c][s], statement.avg)
    }
    sheet = setCellNumber(sheet, positions.criterionAverageCells[c], criterion.average)
  }

  // ── the comments ──────────────────────────────────────────────────────────
  comments = writeHeaderBlock(comments, parts, input)
  // the comments sheet's rows already carry their styles (and their height, so
  // there is room to read a comment) - the export writes INTO them
  for (let i = 0; i < input.comments.length; i++) {
    const row = 11 + i
    const comment = input.comments[i]
    const date = comment.submittedAt ? comment.submittedAt.slice(0, 10) : ""
    comments = setCellText(comments, `A${row}`, date)
    comments = setCellText(comments, `B${row}`, comment.comment)
  }

  // ── the overall row ───────────────────────────────────────────────────────
  // the sheet's data row already exists with its styles - the export writes
  // into it, and the rows below it (the legacy's stray numbering) are dropped
  overall = clearRowsFrom(overall, 8)
  // the column HEADINGS are the rubric's wording too, so a criterion that is
  // renamed or reordered keeps its name over its own numbers
  input.criteria.forEach((c, i) => {
    overall = setCellText(overall, `${String.fromCharCode(67 + i)}6`, c.name)
  })
  const overallValues: [string, string | number | null][] = [
    ["A7", 1],
    ["B7", input.facultyName],
  ]
  input.criteria.forEach((c, i) => {
    overallValues.push([`${String.fromCharCode(67 + i)}7`, c.average])
  })
  overallValues.push(["K7", input.avgRating])
  overallValues.push(["L7", input.remarks])
  overallValues.push(["M7", input.totalRespondents])
  overallValues.push(["N7", input.departmentName])
  for (const [cell, value] of overallValues) {
    overall =
      typeof value === "number" || value === null
        ? setCellNumber(overall, cell, value)
        : setCellText(overall, cell, value)
  }

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

  // the workbook is a ZIP of its parts - store-only, which is what lib/zip.ts
  // writes and what every reader accepts
  const entries = [...parts.entries()].map(([name, data]) => ({ name, data }))
  return createZip(entries)
}
