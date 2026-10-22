/**
 * The form MODEL — what the Individual form IS, in form-terms.
 *
 * The model is a flat list of rows: each row says what it is ("a title", "a
 * criterion", "a statement") and what it carries. It carries NO xml, no column
 * letters and no style ids — the renderer owns the look. So the same model can
 * be drawn as a spreadsheet (the export) and, later, as a page (the preview),
 * and the two cannot disagree about the CONTENT.
 *
 * The row HEIGHTS are in the model, because the height is a layout fact: a
 * statement's text decides how many lines it takes, and the line count decides
 * the height. A renderer that guessed the height differently would print a
 * different page.
 */

/** A criterion, with its statements. */
export interface FormCriterion {
  /** the rubric's category name */
  name: string
  /** the criterion's average over the counted responses */
  average: number | null
  /** the criterion's statements, in the rubric's order */
  statements: { text: string; avg: number | null }[]
}

/** What the form shows about the teacher and the teaching. */
export interface FormInput {
  /** the semester's title, e.g. "SY 2026-2027 First Semester" */
  semesterTitle: string | null
  /** the evaluation period's name */
  evaluationPeriodName: string | null
  /** the teacher's employee number */
  employeeNo: string | null
  /** the teacher's name */
  facultyName: string | null
  /** the program the row's section belongs to */
  program: string | null
  /** the row's section */
  sectionName: string | null
  /** the subject this form is about */
  subject: { code: string; name: string } | null
  /** the general rating — the mean of the criterion averages */
  avgRating: number | null
  /** the general rating's remark */
  remarks: string | null
  /** how many responses were counted */
  totalRespondents: number
  /** the criteria, in the rubric's order */
  criteria: FormCriterion[]
}

/** A field's value — a number prints with its own format, a text as it is. */
export type FieldValue = string | number | null

/** The kinds of row a form is made of. */
export type FormRow =
  | { kind: "band"; height: number }
  | { kind: "title"; text: string }
  | { kind: "subtitle"; text: string }
  | { kind: "field"; label: string; value: FieldValue }
  | { kind: "fieldPair"; left: { label: string; value: FieldValue }; right: { label: string; value: FieldValue } }
  | { kind: "criterion"; heading: string }
  | { kind: "statement"; text: string; value: number | null; first: boolean; height: number }
  | { kind: "average"; label: string; value: number | null }
  | { kind: "spacer" }
  | { kind: "total"; label: string; value: number | null }
  | { kind: "final"; label: string; value: number | null }

/** The form's title — the school's wording. */
export const FORM_TITLE = "FACULTY PERFORMANCE EVALUATION — STUDENTS POST-EVALUATION"

/** The height of the letterhead band. */
export const BAND_HEIGHT = 82.5
/** The height of a one-line row. */
export const ROW_ONE_LINE = 13.5
/** The height of a two-line row. */
export const ROW_TWO_LINES = 30
/** A statement's text past this many characters needs a second line. */
export const STATEMENT_WRAP = 90

/** A dash for a value that is not there - never a blank, never a guess. */
export function orDash(value: string | number | null | undefined): string {
  const text = (value ?? "").toString().trim()
  return text === "" ? "—" : text
}

const ROMAN_VALUES = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
const ROMAN_LETTERS = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"]

/** A number in roman numerals — the form numbers its criteria that way. */
export function roman(value: number): string {
  let rest = value
  let out = ""
  for (let i = 0; i < ROMAN_VALUES.length; i++) {
    while (rest >= ROMAN_VALUES[i]) {
      out += ROMAN_LETTERS[i]
      rest -= ROMAN_VALUES[i]
    }
  }
  return out
}

/** A statement's row height — its text decides how many lines it takes. */
function statementHeight(text: string): number {
  const lines = Math.max(1, Math.ceil(text.length / STATEMENT_WRAP))
  if (lines === 1) return ROW_ONE_LINE
  return ROW_TWO_LINES + (lines - 2) * (ROW_TWO_LINES / 2)
}

/** The form, as a list of rows. */
export function buildFormModel(input: FormInput): FormRow[] {
  const rows: FormRow[] = []

  rows.push({ kind: "band", height: BAND_HEIGHT })
  rows.push({ kind: "title", text: FORM_TITLE })
  rows.push({ kind: "subtitle", text: `Semester: ${orDash(input.semesterTitle)}` })
  rows.push({ kind: "subtitle", text: `Evaluation Period: ${orDash(input.evaluationPeriodName)}` })
  rows.push({
    kind: "fieldPair",
    left: { label: "Employee No", value: orDash(input.employeeNo) },
    right: { label: "Rating", value: input.avgRating === null ? "—" : input.avgRating },
  })
  rows.push({
    kind: "fieldPair",
    left: { label: "Employee Name", value: orDash(input.facultyName) },
    right: { label: "Remarks", value: input.remarks === null ? "—" : input.remarks },
  })
  rows.push({ kind: "field", label: "Program", value: orDash(input.program) })
  rows.push({ kind: "field", label: "Section", value: orDash(input.sectionName) })
  if (input.subject) {
    rows.push({ kind: "field", label: "Subject", value: `${input.subject.code} ${input.subject.name}`.trim() })
  }

  input.criteria.forEach((criterion, ci) => {
    rows.push({ kind: "criterion", heading: `${roman(ci + 1)}. ${criterion.name}` })

    criterion.statements.forEach((statement, si) => {
      const text = `${si + 1}. ${statement.text}`
      rows.push({ kind: "statement", text, value: statement.avg, first: si === 0, height: statementHeight(text) })
    })

    rows.push({ kind: "average", label: "AVERAGE", value: criterion.average })
    rows.push({ kind: "spacer" })
  })

  rows.push({ kind: "total", label: "TOTAL RESPONDENTS", value: input.totalRespondents })
  rows.push({ kind: "final", label: "FINAL RATING", value: input.avgRating })
  return rows
}
