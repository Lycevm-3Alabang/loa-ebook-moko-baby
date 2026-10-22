import { describe, it, expect } from "vitest"
import { writeFileSync } from "fs"
import {
  buildEvaluationWorkbook,
  orDash,
  type EvalFormCriterion,
  type EvalFormInput,
} from "@/lib/evaluation-form-xlsx"
import {
  readZip,
  partText,
  readSharedStrings,
  readCellText,
  SHEET_COMMENTS,
  SHEET_INDIVIDUAL,
  SHEET_OVERALL,
} from "@/lib/xlsx-template"
import { APP_RUBRIC } from "./fixtures/eval-rubric"

/**
 * The sample's figures.
 *
 * The rubric is the app's own (lib/__tests__/fixtures/eval-rubric.ts) and the
 * numbers are plausible for a well-rated subject. Nothing here is special -
 * the point is that the workbook is generated from the DATA, so any rubric and
 * any numbers will do.
 */
export const SAMPLE_CRITERIA: EvalFormCriterion[] = APP_RUBRIC.map((criterion) => ({
  name: criterion.name,
  average: 4.2,
  statements: criterion.statements.map((s, i) => ({
    text: s.text,
    avg: 4 + ((i + 1) % 3) * 0.1,
  })),
}))

export const SAMPLE_INPUT: EvalFormInput = {
  employeeNo: "2024-0017",
  facultyName: "Dela Cruz",
  program: "BSCS",
  sectionName: "A",
  subjectCode: "IT101",
  subjectName: "Introduction to Computing",
  departmentName: "Computer Science",
  departmentCode: "BSCS",
  semesterTitle: "SY 2026-2027 First Semester",
  evaluationPeriodName: "SY 2026-2027 First Semester - Evaluation",
  avgRating: 4.2,
  remarks: "Very Satisfactory",
  totalRespondents: 32,
  criteria: SAMPLE_CRITERIA,
  comments: [
    { submittedAt: "2026-02-11T09:00:00.000Z", comment: "Great explanations and clear examples in class." },
    { submittedAt: "2026-02-12T14:30:00.000Z", comment: "Always willing to help after class." },
    { submittedAt: "2026-02-13T10:15:00.000Z", comment: "The hands-on activities made the topic much easier to understand." },
  ],
}

/** The workbook, read back. */
export function readSample(input: EvalFormInput = SAMPLE_INPUT) {
  const parts = readZip(buildEvaluationWorkbook(input))
  const sheet = partText(parts, SHEET_INDIVIDUAL)
  const comments = partText(parts, SHEET_COMMENTS)
  const overall = partText(parts, SHEET_OVERALL)
  const strings = readSharedStrings(parts)
  return {
    parts,
    sheet,
    comments,
    overall,
    strings,
    text: (ref: string, source = sheet) => readCellText(source, ref, strings),
    number: (ref: string, source = sheet) => {
      const m = source.match(new RegExp(`<c r="${ref}"[^>]*>(?:<v>([^<]*)</v>)?`))
      return m && m[1] !== undefined ? Number(m[1]) : null
    },
  }
}

describe("buildEvaluationWorkbook — the generated form", () => {
  it("writes the identity block", () => {
    const wb = readSample()
    expect(wb.text("B7")).toBe("2024-0017")
    expect(wb.text("B8")).toBe("Dela Cruz")
    expect(wb.text("B9")).toBe("BSCS")
    expect(wb.text("B10")).toBe("A")
    expect(wb.number("H7")).toBe(4.2)
    expect(wb.text("H8")).toBe("Very Satisfactory")
    expect(wb.text("A4")).toBe("Semester: SY 2026-2027 First Semester")
    expect(wb.text("A5")).toBe("Evaluation Period: SY 2026-2027 First Semester - Evaluation")
  })

  it("generates one block per criterion, with the rubric's own name", () => {
    const wb = readSample()
    // the first block starts right after the header block
    expect(wb.text("A11")).toBe("I. Professional Manner")
    expect(wb.text("I11")).toBe("RATING")
    // the second follows the first: 1 header + 3 statements + 1 average + 1 spacer
    expect(wb.text("A17")).toBe("II. Communication with Students")
    // and the LAST one is there
    expect(wb.text("A60")).toBe("VIII. Assessment and Feedback")
  })

  it("numbers the statements and writes the app's wording", () => {
    const wb = readSample()
    expect(wb.text("A12")).toBe(
      "1. The professor has always dressed appropriately and is well groomed.",
    )
    // the app's wording, not the legacy's ("a good sence of humor")
    expect(wb.text("A14")).toBe(
      "3. He/she shows composure, exude confidence, and displays a good sense of humor.",
    )
  })

  it("writes every statement's rating and every criterion's average", () => {
    const wb = readSample()
    expect(wb.number("I12")).toBe(4.1)
    expect(wb.number("I13")).toBe(4.2)
    expect(wb.number("I14")).toBe(4)
    expect(wb.text("A15")).toBe("AVERAGE")
    expect(wb.number("I15")).toBe(4.2)
  })

  it("writes the footer", () => {
    const wb = readSample()
    expect(wb.text("H69")).toBe("TOTAL RESPONDENTS")
    expect(wb.number("I69")).toBe(32)
    expect(wb.text("G70")).toBe("FINAL RATING")
    expect(wb.number("I70")).toBe(4.2)
  })

  it("leaves no formula and no legacy row behind", () => {
    const wb = readSample()
    expect(wb.sheet).not.toContain("<f")
    // the legacy's own statement wording is gone
    expect(wb.sheet).not.toContain("sence of humor")
    // and the legacy's hidden page-2 header is gone
    expect(wb.sheet).not.toContain("STUDENTS EVALUATION")
  })

  it("lands on the LEGACY's rows — the form is the same shape as the school's", () => {
    // The rubric's statement counts are the legacy's, so the generated blocks
    // fall on the legacy's rows: 11, 17, 26, 33, 40, 47, 54, 60. The legacy's
    // form is the layout, so the printed page is the school's page.
    const wb = readSample()
    const headers = [11, 17, 26, 33, 40, 47, 54, 60]
    expect(headers.map((r) => wb.text(`A${r}`))).toEqual([
      "I. Professional Manner",
      "II. Communication with Students",
      "III. Student Engagement",
      "IV. Learning Materials",
      "V. Time Management",
      "VI. Experiential Learning Provided to Students",
      "VII. Respect the Uniqueness of the Students",
      "VIII. Assessment and Feedback",
    ])
    // and the AVERAGE rows are the legacy's too
    expect([15, 24, 31, 38, 45, 52, 58, 67].map((r) => wb.text(`A${r}`))).toEqual(
      Array(8).fill("AVERAGE"),
    )
  })

  it("writes the comments, one per row, on the comments sheet", () => {
    const wb = readSample()
    expect(wb.text("A11", wb.comments)).toBe("2026-02-11")
    expect(wb.text("B11", wb.comments)).toBe("Great explanations and clear examples in class.")
    expect(wb.text("A13", wb.comments)).toBe("2026-02-13")
    // and the comments sheet carries the same identity block
    expect(wb.text("B7", wb.comments)).toBe("2024-0017")
  })

  it("writes ONE row on the overall sheet, headed by the rubric's names", () => {
    const wb = readSample()
    expect(wb.text("B7", wb.overall)).toBe("Dela Cruz")
    expect(wb.text("C6", wb.overall)).toBe("Professional Manner")
    expect(wb.text("D6", wb.overall)).toBe("Communication with Students")
    expect(wb.number("C7", wb.overall)).toBe(4.2)
    expect(wb.number("K7", wb.overall)).toBe(4.2)
    expect(wb.text("L7", wb.overall)).toBe("Very Satisfactory")
    expect(wb.number("M7", wb.overall)).toBe(32)
    expect(wb.text("N7", wb.overall)).toBe("Computer Science")
    // the legacy's stray numbering is gone
    expect(wb.overall).not.toContain('<row r="8"')
  })

  it("follows the rubric's LENGTH — a rubric with another statement makes a longer form", () => {
    // the layout follows the data, so the form is not a fixed set of cells
    const longer = SAMPLE_CRITERIA.map((c, i) =>
      i === 0 ? { ...c, statements: [...c.statements, { text: "An extra statement.", avg: 4.5 }] } : c,
    )
    const wb = readSample({ ...SAMPLE_INPUT, criteria: longer })
    // the second criterion moved down by one row
    expect(wb.text("A18")).toBe("II. Communication with Students")
    // and the new statement is in the first block
    expect(wb.text("A15")).toBe("4. An extra statement.")
    expect(wb.number("I15")).toBe(4.5)
  })

  it("writes a sample of the workbook, when a path is given", () => {
    // ACES_SAMPLE_PATH=... writes the REAL output somewhere it can be opened
    const path = process.env.ACES_SAMPLE_PATH
    if (!path) return
    const bytes = buildEvaluationWorkbook(SAMPLE_INPUT)
    writeFileSync(path, bytes)
    // and it reads back as a workbook
    const parts = readZip(bytes)
    expect(parts.has(SHEET_INDIVIDUAL)).toBe(true)
    expect(parts.has(SHEET_COMMENTS)).toBe(true)
    expect(parts.has(SHEET_OVERALL)).toBe(true)
  })
})

describe("orDash", () => {
  it("prints a dash for nothing, and the value otherwise", () => {
    expect(orDash(null)).toBe("—")
    expect(orDash("")).toBe("—")
    expect(orDash("   ")).toBe("—")
    expect(orDash("BSCS")).toBe("BSCS")
  })
})
