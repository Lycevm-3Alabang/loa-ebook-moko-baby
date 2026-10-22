import { describe, it, expect } from "vitest"
import { writeFileSync } from "fs"
import { buildEvaluationWorkbook } from "@/lib/xlsx/workbook"
import type { FormCriterion, FormInput } from "@/lib/xlsx/form-model"
import type { OverallResponse } from "@/lib/xlsx/overall"
import { computeGeneralRating } from "@/lib/evaluation-utils"
import { readZip, partText } from "@/lib/xlsx-template"
import { APP_RUBRIC } from "./fixtures/eval-rubric"

const FORM: FormInput = {
  semesterTitle: "SY 2026-2027 First Semester",
  evaluationPeriodName: "SY 2026-2027 First Semester - Evaluation",
  employeeNo: "2024-0017",
  facultyName: "Dela Cruz",
  program: "BSCS",
  sectionName: "A",
  subject: { code: "IT101", name: "Introduction to Computing" },
  avgRating: 4.2,
  remarks: "Very Satisfactory",
  totalRespondents: 32,
  criteria: [
    {
      name: "Professional Manner",
      average: 4.2,
      statements: [{ text: "He/she behaves appropriately at all times.", avg: 4.2 }],
    },
  ],
}

const COMMENTS = ["Great explanations.", "Please post the slides earlier."]

const RESPONSES: OverallResponse[] = [
  {
    submittedAt: "2026-10-20T08:30:00.000Z",
    generalRating: 4.25,
    categoryAverages: { "Professional Manner": 4.5 },
  },
]

/**
 * The SAMPLE — the workbook the owner opens in Excel.
 *
 * ⭐ It uses the app's own rubric (8 criteria, 34 statements), because the
 * proof is about the LAYOUT: a form with one criterion would prove nothing
 * about a rubric that changes between periods.
 */
const SAMPLE_CRITERIA: FormCriterion[] = APP_RUBRIC.map((criterion) => ({
  name: criterion.name,
  average: 4.2,
  statements: criterion.statements.map((statement, i) => ({
    text: statement.text,
    avg: 4 + ((i + 1) % 3) * 0.1,
  })),
}))

const SAMPLE_RESPONSES: OverallResponse[] = Array.from({ length: 12 }, (_, i) => {
  const categoryAverages: Record<string, number> = {}
  SAMPLE_CRITERIA.forEach((criterion, ci) => {
    categoryAverages[criterion.name] = Number((3.9 + ((ci + i) % 5) * 0.2).toFixed(2))
  })
  return {
    submittedAt: `2026-02-${String(11 + i).padStart(2, "0")}T09:00:00.000Z`,
    // the app's own rule for the general rating
    generalRating: computeGeneralRating(categoryAverages),
    categoryAverages,
  }
})

const SAMPLE_FORM: FormInput = {
  semesterTitle: "SY 2026-2027 First Semester",
  evaluationPeriodName: "SY 2026-2027 First Semester - Evaluation",
  employeeNo: "2024-0017",
  facultyName: "Dela Cruz",
  program: "BSCS",
  sectionName: "A",
  subject: { code: "IT101", name: "Introduction to Computing" },
  avgRating: 4.2,
  remarks: "Very Satisfactory",
  totalRespondents: SAMPLE_RESPONSES.length,
  criteria: SAMPLE_CRITERIA,
}

const SAMPLE_COMMENTS = [
  "Great explanations and clear examples in class.",
  "Always willing to help after class.",
  "The hands-on activities made the topic much easier to understand.",
]

/** A PNG header — the size is all the builder reads. */
function fakePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

function built(logo: Uint8Array | null = fakePng(340, 156)) {
  return readZip(
    buildEvaluationWorkbook({ form: FORM, logo, comments: COMMENTS, responses: RESPONSES }),
  )
}

describe("the export's workbook", () => {
  it("writes the Individual sheet with the form's cells", () => {
    const parts = built()
    const sheet = partText(parts, "xl/worksheets/sheet1.xml")
    expect(partText(parts, "xl/workbook.xml")).toContain('<sheet name="Individual"')
    expect(sheet).toContain("FACULTY PERFORMANCE EVALUATION")
    expect(sheet).toContain('<mergeCell ref="A10:H10"/>')
  })

  it("writes the three sheets, in the legacy's tab order", () => {
    const parts = built()
    const workbook = partText(parts, "xl/workbook.xml")
    expect(workbook).toContain('<sheet name="Individual"')
    expect(workbook).toContain('<sheet name="Comments"')
    expect(workbook).toContain('<sheet name="Overall"')
    // the legacy's order: sheet1 Individual, sheet2 Comments, sheet3 Overall
    expect(workbook.indexOf('<sheet name="Individual"')).toBeLessThan(
      workbook.indexOf('<sheet name="Comments"'),
    )
    expect(workbook.indexOf('<sheet name="Comments"')).toBeLessThan(
      workbook.indexOf('<sheet name="Overall"'),
    )
    expect(parts.has("xl/worksheets/sheet2.xml")).toBe(true)
    expect(parts.has("xl/worksheets/sheet3.xml")).toBe(true)
  })

  it("carries the comments on the Comments sheet", () => {
    expect(partText(built(), "xl/worksheets/sheet2.xml")).toContain("Great explanations.")
  })

  it("carries the Overall sheet's rows", () => {
    const overall = partText(built(), "xl/worksheets/sheet3.xml")
    expect(overall).toContain("GENERAL RATING")
    expect(overall).toContain("<v>4.25</v>") // the response's general rating
    expect(overall).toContain("<v>4.5</v>") // the criterion's live average
  })

  it("carries the letterhead", () => {
    const logo = fakePng(340, 156)
    const parts = built(logo)
    expect(parts.has("xl/media/image1.png")).toBe(true)
    expect(parts.has("xl/drawings/drawing1.xml")).toBe(true)
    expect(Buffer.from(parts.get("xl/media/image1.png")!)).toEqual(Buffer.from(logo))
  })

  it("still writes the form when the letterhead is missing", () => {
    const parts = built(null)
    expect(parts.has("xl/drawings/drawing1.xml")).toBe(false)
    expect(partText(parts, "xl/worksheets/sheet1.xml")).toContain("FACULTY PERFORMANCE EVALUATION")
  })

  it("writes a sample of the workbook, when a path is given", () => {
    // ⭐ ACES_SAMPLE_PATH=... writes the REAL workbook somewhere it can be
    // opened — the hook for the Excel proof
    const path = process.env.ACES_SAMPLE_PATH
    if (!path) return
    const bytes = buildEvaluationWorkbook({
      form: SAMPLE_FORM,
      logo: fakePng(340, 156),
      comments: SAMPLE_COMMENTS,
      responses: SAMPLE_RESPONSES,
    })
    writeFileSync(path, bytes)
    // and it reads back as a workbook
    const parts = readZip(bytes)
    expect(parts.has("xl/worksheets/sheet1.xml")).toBe(true)
    expect(parts.has("xl/worksheets/sheet2.xml")).toBe(true)
    expect(parts.has("xl/worksheets/sheet3.xml")).toBe(true)
  })
})
