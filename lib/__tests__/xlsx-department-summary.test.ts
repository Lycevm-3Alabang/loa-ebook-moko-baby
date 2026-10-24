import { describe, it, expect } from "vitest"
import { readZip, partText } from "@/lib/xlsx-template"
import {
  DEPARTMENT_SUMMARY_TITLE,
  buildDepartmentSummaryModel,
  buildDepartmentSummaryWorkbook,
} from "@/lib/xlsx/department-summary"
import { styleId } from "@/lib/xlsx/styles"

const INPUT = {
  semesterTitle: "SY 2026-2027 First Semester",
  evaluationPeriodName: "SY 2026-2027 First Semester - Evaluation",
  department: { name: "Computer Studies", code: "CCS" },
  // ⭐ this file pins the MAPPING; the assembly's test pins the SOURCE of
  // these two numbers (`members.length`, `departmentAggregate`).
  facultyCount: 2,
  totalRespondents: 34,
  avgRating: 3.4,
  remarks: "Satisfactory",
}

describe("the department's consolidated file", () => {
  it("carries the title and the period's two lines", () => {
    const model = buildDepartmentSummaryModel(INPUT)
    expect(model.header.map((line) => line.text)).toEqual([
      "DEPARTMENT PERFORMANCE EVALUATION RESULT (POST-EVALUATION)",
      "Semester: SY 2026-2027 First Semester",
      "Evaluation Period: SY 2026-2027 First Semester - Evaluation",
      "",
    ])
  })

  it("prints the summary.csv columns — one row: the department", () => {
    const model = buildDepartmentSummaryModel(INPUT)
    expect(model.headings).toEqual([
      "DEPARTMENT", "CODE", "FACULTY COUNT", "RESPONDENTS", "AVG RATING", "REMARK",
    ])
    expect(model.rows).toHaveLength(1)
    expect(model.rows[0].cells).toEqual([
      "Computer Studies", "CCS", 2, 34, 3.4, "Satisfactory",
    ])
  })

  it("prints 0 respondents and dashes when the department has no counted responses", () => {
    const model = buildDepartmentSummaryModel({
      ...INPUT,
      facultyCount: 3,
      totalRespondents: 0,
      avgRating: null,
      remarks: null,
    })
    expect(model.rows[0].cells).toEqual(["Computer Studies", "CCS", 3, 0, "—", "—"])
  })

  it("keeps the counts as numbers — general format, not two decimals", () => {
    const model = buildDepartmentSummaryModel(INPUT)
    expect(typeof model.rows[0].cells[2]).toBe("number")
    expect(typeof model.rows[0].cells[3]).toBe("number")
  })

  it("grows the row when the department's name is long", () => {
    const model = buildDepartmentSummaryModel({
      ...INPUT,
      department: {
        name: "College of Computer Studies and Information Technology",
        code: "CCS",
      },
    })
    // a single line is 12pt + 4 = 16; the long name wraps past it
    expect(model.rows[0].height).toBeGreaterThan(16)
  })

  it("is one sheet — and it is portrait", () => {
    const parts = readZip(buildDepartmentSummaryWorkbook(INPUT))
    expect(partText(parts, "xl/workbook.xml")).toContain(
      `<sheet name="Department Summary"`,
    )
    expect(partText(parts, "xl/worksheets/sheet1.xml")).toContain(
      'orientation="portrait"',
    )
  })

  it("prints the department's figures in the sheet", () => {
    const parts = readZip(buildDepartmentSummaryWorkbook(INPUT))
    const sheet = partText(parts, "xl/worksheets/sheet1.xml")
    expect(sheet).toContain(DEPARTMENT_SUMMARY_TITLE)
    expect(sheet).toContain("Computer Studies")
    expect(sheet).toContain("CCS")
    expect(sheet).toContain("34")
    expect(sheet).toContain(`<c r="E6" s="${styleId("tableNumber")}"><v>3.4</v></c>`)
    expect(sheet).toContain("Satisfactory")
  })
})
