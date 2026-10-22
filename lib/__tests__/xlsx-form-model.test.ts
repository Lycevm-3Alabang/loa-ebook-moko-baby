import { describe, it, expect } from "vitest"
import {
  buildFormModel,
  orDash,
  roman,
  FORM_TITLE,
  type FormInput,
  type FormRow,
} from "@/lib/xlsx/form-model"

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
    {
      name: "Communication with Students",
      average: 4.3,
      statements: [{ text: "He/she guides the direction of the discussion.", avg: 4.3 }],
    },
  ],
}

function rows(): FormRow[] {
  return buildFormModel(INPUT)
}

describe("the form model", () => {
  it("opens with the band, the title and the period's two lines", () => {
    const r = rows()
    expect(r[0]).toEqual({ kind: "band", height: 82.5 })
    expect(r[1]).toEqual({ kind: "title", text: FORM_TITLE })
    expect(r[2]).toMatchObject({ kind: "subtitle", text: "Semester: SY 2026-2027 First Semester" })
    expect(r[3]).toMatchObject({
      kind: "subtitle",
      text: "Evaluation Period: SY 2026-2027 First Semester - Evaluation",
    })
  })

  it("carries the identity block", () => {
    const fields = rows().filter((r) => r.kind === "field" || r.kind === "fieldPair")
    expect(fields.map((r) => (r.kind === "field" ? r.label : r.left.label))).toEqual([
      "Employee No",
      "Employee Name",
      "Program",
      "Section",
      "Subject",
    ])
    const first = fields[0]
    expect(first.kind).toBe("fieldPair")
    if (first.kind === "fieldPair") {
      expect(first.left.value).toBe("2024-0017")
      expect(first.right).toEqual({ label: "Rating", value: 4.2 })
    }
  })

  it("builds one block per criterion, numbered in roman numerals", () => {
    const headings = rows()
      .filter((r) => r.kind === "criterion")
      .map((r) => (r.kind === "criterion" ? r.heading : ""))
    expect(headings).toEqual(["I. Professional Manner", "II. Communication with Students"])
  })

  it("numbers the statements and marks the first of each block", () => {
    const statements = rows().filter((r) => r.kind === "statement")
    expect(statements[0]).toMatchObject({
      text: "1. The professor has always dressed appropriately and is well groomed.",
      first: true,
    })
    expect(statements[1]).toMatchObject({
      text: "2. He/she behaves appropriately at all times.",
      first: false,
    })
  })

  it("grows a statement's row with its text", () => {
    const long = buildFormModel({
      ...INPUT,
      criteria: [
        {
          name: "Communication with Students",
          average: 4,
          statements: [
            {
              text: "He/she gives positive and specific feedback to students, which reinforces behaviour and helps them understand how to improve and makes progress.",
              avg: 4,
            },
          ],
        },
      ],
    })
    const statement = long.find((r) => r.kind === "statement")
    expect(statement && statement.kind === "statement" ? statement.height : 0).toBe(30)
  })

  it("ends with the totals", () => {
    const r = rows()
    const total = r[r.length - 2]
    const final = r[r.length - 1]
    expect(total).toEqual({ kind: "total", label: "TOTAL RESPONDENTS", value: 32 })
    expect(final).toEqual({ kind: "final", label: "FINAL RATING", value: 4.2 })
  })

  it("numbers any count of criteria", () => {
    expect(roman(1)).toBe("I")
    expect(roman(8)).toBe("VIII")
    expect(roman(13)).toBe("XIII")
  })

  it("prints a dash for a value that is not there", () => {
    expect(orDash(null)).toBe("—")
    expect(orDash("")).toBe("—")
    expect(orDash("BSCS")).toBe("BSCS")
  })
})
