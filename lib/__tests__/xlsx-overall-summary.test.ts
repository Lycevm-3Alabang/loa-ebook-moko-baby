import { describe, it, expect } from "vitest"
import { readZip, partText } from "@/lib/xlsx-template"
import {
  buildFacultySummaryModel,
  buildFacultySummaryWorkbook,
} from "@/lib/xlsx/overall-summary"

const INPUT = {
  semesterTitle: "SY 2026-2027 First Semester",
  evaluationPeriodName: "SY 2026-2027 First Semester - Evaluation",
  department: { name: "Computer Studies", code: "CCS" },
  faculty: {
    name: "Alamo, Nino Francisco",
    email: "nf.alamo@x.edu.ph",
    avgRating: 3.67,
    remarks: "Very Satisfactory",
  },
  rows: [
    {
      subject: { code: "1815-ITELEC009", name: "Introduction to Computing" },
      section: { program: "BSIT", name: "31E1" },
      totalRespondents: 20,
      avgRating: 3.38,
      highest: [{ label: "Professional Manner", score: 3.6 }],
      lowest: [{ label: "Assessment & Feedback", score: 3.25 }],
    },
  ],
}

describe("the faculty's consolidated file", () => {
  it("carries the header block and the band", () => {
    const model = buildFacultySummaryModel(INPUT)
    expect(model.header.map((line) => line.text)).toEqual([
      "FACULTY PERFORMANCE EVALUATION RESULT (POST-EVALUATION)",
      "Semester: SY 2026-2027 First Semester",
      "Evaluation Period: SY 2026-2027 First Semester - Evaluation",
      "Department: Computer Studies (CCS)",
      "",
    ])
    expect(model.band.map((line) => line.text)).toEqual([
      "Alamo, Nino Francisco",
      "nf.alamo@x.edu.ph",
      "Average: 3.67 — Very Satisfactory",
      "",
    ])
  })

  it("prints the band as a dash and no remark when the member has no responses", () => {
    const model = buildFacultySummaryModel({
      ...INPUT,
      faculty: { ...INPUT.faculty, avgRating: null, remarks: null },
    })
    expect(model.band[2].text).toBe("Average: —")
  })

  it("prints a row for a subject-section nobody evaluated", () => {
    const model = buildFacultySummaryModel({
      ...INPUT,
      rows: [{ ...INPUT.rows[0], totalRespondents: 0, avgRating: null, highest: [], lowest: [] }],
    })
    expect(model.rows).toHaveLength(1)
    expect(model.rows[0].cells[2]).toBe(0)
    expect(model.rows[0].cells[3]).toBe("—")
    expect(model.rows[0].cells[4]).toBe("")
    expect(model.rows[0].cells[5]).toBe("")
  })

  it("prints EVERY tie, comma-joined", () => {
    const model = buildFacultySummaryModel({
      ...INPUT,
      rows: [
        {
          ...INPUT.rows[0],
          highest: [
            { label: "Professional Manner", score: 3.6 },
            { label: "Student Engagement", score: 3.6 },
          ],
        },
      ],
    })
    expect(model.rows[0].cells[4]).toBe("Professional Manner 3.60, Student Engagement 3.60")
  })

  it("orders the rows — the subject code, then the section label", () => {
    const model = buildFacultySummaryModel({
      ...INPUT,
      rows: [
        {
          ...INPUT.rows[0],
          subject: { code: "1815-ITELEC009", name: "A" },
          section: { program: "BSIT", name: "31E2" },
        },
        {
          ...INPUT.rows[0],
          subject: { code: "1815-ITELEC008", name: "B" },
          section: { program: "BSIT", name: "31E1" },
        },
        {
          ...INPUT.rows[0],
          subject: { code: "1815-ITELEC009", name: "A" },
          section: { program: "BSIT", name: "31E1" },
        },
      ],
    })
    // ⭐ the subject code first (1815-ITELEC008 before 1815-ITELEC009), then
    // the section label (31E1 before 31E2)
    expect(model.rows.map((row) => row.cells[1])).toEqual([
      "BSIT-31E1",
      "BSIT-31E1",
      "BSIT-31E2",
    ])
    expect(model.rows.map((row) => row.cells[0])).toEqual([
      "1815-ITELEC008 B",
      "1815-ITELEC009 A",
      "1815-ITELEC009 A",
    ])
  })

  it("grows the row when a cell carries a long text", () => {
    const model = buildFacultySummaryModel(INPUT)
    expect(model.rows[0].height).toBeGreaterThan(16)
  })

  it("is one sheet — and it is landscape", () => {
    const parts = readZip(buildFacultySummaryWorkbook(INPUT))
    expect(partText(parts, "xl/workbook.xml")).toContain('<sheet name="Faculty Summary"')
    expect(partText(parts, "xl/worksheets/sheet1.xml")).toContain('orientation="landscape"')
  })

  it("prints the six columns, with the respondents as the weight", () => {
    const model = buildFacultySummaryModel(INPUT)
    expect(model.headings).toEqual([
      "SUBJECT", "SECTION", "RESPONDENTS", "AVG RATING", "HIGHEST", "LOWEST",
    ])
    expect(model.rows[0].cells[2]).toBe(20)
  })

  it("makes the band recomputable from its rows — weighted, not a plain mean", () => {
    const model = buildFacultySummaryModel({
      ...INPUT,
      rows: [
        { ...INPUT.rows[0], avgRating: 3.6, totalRespondents: 20 },
        { ...INPUT.rows[0], avgRating: 3.75, totalRespondents: 10, section: { program: "BSIT", name: "31E2" } },
        { ...INPUT.rows[0], avgRating: 3.8, totalRespondents: 4, section: { program: "BSIT", name: "31E3" } },
      ],
    })
    const total = model.rows.reduce((sum, row) => sum + Number(row.cells[2]), 0)
    const weighted = model.rows.reduce(
      (sum, row) => sum + Number(row.cells[3]) * Number(row.cells[2]),
      0,
    ) / total
    expect(weighted).toBeCloseTo(3.67, 2) // (20·3.60 + 10·3.75 + 4·3.80) / 34
    expect(weighted).not.toBeCloseTo(3.72, 2) // the naive mean of the rows
  })
})
