import { describe, it, expect } from "vitest"
import { renderIndividualSheet } from "@/lib/xlsx/individual"
import { buildFormModel, type FormInput } from "@/lib/xlsx/form-model"

const INPUT: FormInput = {
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
      statements: [
        { text: "The professor has always dressed appropriately and is well groomed.", avg: 4.1 },
        { text: "He/she behaves appropriately at all times.", avg: 4.2 },
      ],
    },
  ],
}

function sheet(logoAspect = 340 / 156) {
  return renderIndividualSheet({
    rows: buildFormModel(INPUT),
    logoMedia: "image1.png",
    logoAspect,
  })
}

describe("the Individual renderer", () => {
  it("writes the header block with the legacy's merges", () => {
    const s = sheet()
    expect(s.rows[1].cells[0]).toMatchObject({ ref: "A2", style: "title" })
    expect(s.merges).toContain("A1:I1")
    expect(s.merges).toContain("A2:I2")
    expect(s.merges).toContain("B5:F5")
    expect(s.merges).toContain("H5:I5")
  })

  it("writes a field row's label and value", () => {
    const s = sheet()
    const row = s.rows[4]
    expect(row.cells[0]).toMatchObject({ ref: "A5", style: "fieldLabel", value: "Employee No" })
    expect(row.cells[1]).toMatchObject({ ref: "B5", style: "fieldValue", value: "2024-0017" })
    expect(row.cells[6]).toMatchObject({ ref: "G5", style: "fieldValueRight", value: "Rating" })
    expect(row.cells[7]).toMatchObject({ ref: "H5", style: "ratingValue", value: 4.2 })
  })

  it("writes the criterion block", () => {
    const s = sheet()
    const criterion = s.rows[9]
    expect(criterion.cells[0]).toMatchObject({ ref: "A10", style: "criterion", value: "I. Professional Manner" })
    expect(criterion.cells[8]).toMatchObject({ ref: "I10", style: "criterionRating", value: "RATING" })
    expect(s.merges).toContain("A10:H10")
  })

  it("gives the first statement of a block its rule, and the rest none", () => {
    const s = sheet()
    expect(s.rows[10].cells[0]).toMatchObject({ ref: "A11", style: "statementFirst" })
    expect(s.rows[11].cells[0]).toMatchObject({ ref: "A12", style: "statement" })
    expect(s.rows[10].cells[8]).toMatchObject({ ref: "I11", style: "statementRating", value: 4.1 })
  })

  it("writes the footer", () => {
    const s = sheet()
    const total = s.rows[s.rows.length - 2]
    const final = s.rows[s.rows.length - 1]
    expect(total.cells[7]).toMatchObject({ style: "totalLabel", value: "TOTAL RESPONDENTS" })
    expect(total.cells[8]).toMatchObject({ style: "totalValue", value: 32 })
    expect(final.cells[6]).toMatchObject({ style: "finalLabel", value: "FINAL RATING" })
    expect(final.cells[8]).toMatchObject({ style: "finalValue", value: 4.2 })
  })

  it("repeats the header block on every printed page", () => {
    const s = sheet()
    expect(s.printArea).toBe("$A:$I")
    // the band, the title, the period's two lines and the five fields
    expect(s.printTitles).toBe("$1:$9")
  })

  it("hangs the letterhead in the band, at the image's own aspect", () => {
    const s = sheet()
    expect(s.picture?.media).toBe("image1.png")
    expect(s.picture?.ext.cx).toBe(50 * 36000)
    expect(s.picture?.ext.cy).toBe(Math.round((50 * 36000) / (340 / 156)))
    expect(s.picture?.from.row).toBe(0)
    expect(s.picture?.from.colOff).toBeGreaterThan(0)
  })

  it("refuses a letterhead that does not fit the band", () => {
    expect(() => sheet(0.4)).toThrow(/does not fit/)
  })
})
