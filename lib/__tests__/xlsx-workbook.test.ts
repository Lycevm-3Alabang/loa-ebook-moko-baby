import { describe, it, expect } from "vitest"
import { buildEvaluationWorkbook } from "@/lib/xlsx/workbook"
import type { FormInput } from "@/lib/xlsx/form-model"
import { readZip, partText } from "@/lib/xlsx-template"

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

/** A PNG header — the size is all the builder reads. */
function fakePng(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe("the export's workbook", () => {
  it("writes the Individual sheet with the form's cells", () => {
    const parts = readZip(buildEvaluationWorkbook({ form: FORM, logo: fakePng(340, 156) }))
    const sheet = partText(parts, "xl/worksheets/sheet1.xml")
    expect(partText(parts, "xl/workbook.xml")).toContain('<sheet name="Individual"')
    expect(sheet).toContain("FACULTY PERFORMANCE EVALUATION")
    expect(sheet).toContain('<mergeCell ref="A10:H10"/>')
  })

  it("carries the letterhead", () => {
    const logo = fakePng(340, 156)
    const parts = readZip(buildEvaluationWorkbook({ form: FORM, logo }))
    expect(parts.has("xl/media/image1.png")).toBe(true)
    expect(parts.has("xl/drawings/drawing1.xml")).toBe(true)
    expect(Buffer.from(parts.get("xl/media/image1.png")!)).toEqual(Buffer.from(logo))
  })

  it("still writes the form when the letterhead is missing", () => {
    const parts = readZip(buildEvaluationWorkbook({ form: FORM, logo: null }))
    expect(parts.has("xl/drawings/drawing1.xml")).toBe(false)
    expect(partText(parts, "xl/worksheets/sheet1.xml")).toContain("FACULTY PERFORMANCE EVALUATION")
  })
})
