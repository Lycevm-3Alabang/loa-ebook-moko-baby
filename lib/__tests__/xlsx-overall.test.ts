import { describe, it, expect } from "vitest"
import {
  buildOverallModel,
  renderOverallSheet,
  OVERALL_TITLE,
  type OverallInput,
} from "@/lib/xlsx/overall"
import type { SheetSpec } from "@/lib/xlsx/writer"
import { APP_RUBRIC } from "./fixtures/eval-rubric"

const CRITERIA = APP_RUBRIC.map((criterion) => ({ name: criterion.name }))

/** The rubric's criteria, each scored. */
function averages(values: number[]): Record<string, number> {
  const out: Record<string, number> = {}
  CRITERIA.forEach((criterion, index) => {
    out[criterion.name] = values[index]
  })
  return out
}

/**
 * The responses' figures are the app's own: the criterion values average to
 * the general rating, and the general rating is what the app would compute
 * (the mean of the criteria, rounded to two decimals).
 */
const INPUT: OverallInput = {
  semesterTitle: "SY 2026-2027 First Semester",
  facultyName: "Dela Cruz",
  subject: { code: "IT101", name: "Introduction to Computing" },
  criteria: CRITERIA,
  responses: [
    {
      submittedAt: "2026-10-20T08:30:00.000Z",
      generalRating: 4.25,
      categoryAverages: averages([4.5, 4.0, 4.5, 4.0, 4.5, 4.0, 4.5, 4.0]),
    },
    {
      submittedAt: "2026-10-21T09:15:00.000Z",
      generalRating: 2.88,
      categoryAverages: averages([3.0, 2.5, 3.0, 2.5, 3.0, 3.0, 3.0, 3.0]),
    },
  ],
}

function sheet(input: OverallInput = INPUT): SheetSpec {
  return renderOverallSheet(buildOverallModel(input))
}

/** The cell at a reference. */
function at(s: SheetSpec, ref: string) {
  for (const row of s.rows) {
    for (const c of row.cells) {
      if (c.ref === ref) return c
    }
  }
  return undefined
}

/** Every text the sheet carries. */
function texts(s: SheetSpec): string[] {
  return s.rows
    .flatMap((row) => row.cells.map((c) => c.value))
    .filter((value): value is string => typeof value === "string")
}

describe("the Overall sheet", () => {
  it("carries the header block — the constants that used to be columns", () => {
    const s = sheet()
    expect(texts(s)).toContain(OVERALL_TITLE)
    expect(texts(s)).toContain("Semester: SY 2026-2027 First Semester")
    expect(texts(s)).toContain("Faculty: Dela Cruz")
    expect(texts(s)).toContain("Subject: IT101 Introduction to Computing")
    // and the block is merged across the sheet, so the text has room
    expect(s.merges).toContain("A1:L1")
    expect(s.merges).toContain("A4:L4")
  })

  it("writes one row per response, in the response set's order", () => {
    const s = sheet()
    expect(at(s, "A7")?.value).toBe(1)
    expect(at(s, "A8")?.value).toBe(2)
    // and the table has exactly those two rows
    expect(s.rows.filter((row) => row.row >= 7)).toHaveLength(2)
  })

  it("names its columns NO, DATE, the rubric's criteria, then the rating and the remark", () => {
    const model = buildOverallModel(INPUT)
    expect(model.columns.map((column) => column.heading)).toEqual([
      "NO",
      "DATE",
      ...CRITERIA.map((criterion) => criterion.name),
      "GENERAL RATING",
      "REMARKS",
    ])
    // ⭐ no NAME column: the respondents stay anonymous
    expect(model.columns.some((column) => column.heading === "NAME")).toBe(false)
  })

  it("derives the criteria columns from the rubric", () => {
    const extra = { name: "Course Coverage" }
    const s = sheet({
      ...INPUT,
      criteria: [...CRITERIA, extra],
      responses: [
        {
          ...INPUT.responses[0],
          categoryAverages: { ...INPUT.responses[0].categoryAverages, "Course Coverage": 3.7 },
        },
      ],
    })
    // the ninth criterion is a ninth column...
    expect(at(s, "K6")?.value).toBe("Course Coverage")
    // ⭐ ...and it carries a VALUE, not an empty column under a name
    expect(at(s, "K7")?.value).toBe(3.7)
  })

  it("puts the live average for THAT criterion under the criterion's column", () => {
    const s = sheet()
    expect(at(s, "C7")?.value).toBe(4.5) // Professional Manner, the first response
    expect(at(s, "D7")?.value).toBe(4.0) // Communication with Students
    expect(at(s, "C8")?.value).toBe(3.0) // the second response
  })

  it("leaves a criterion nobody rated BLANK — never a zero", () => {
    const s = sheet({
      ...INPUT,
      responses: [
        {
          ...INPUT.responses[0],
          categoryAverages: { "Professional Manner": 4.5 },
        },
      ],
    })
    expect(at(s, "C7")?.value).toBe(4.5)
    // ⭐ the other seven criteria were not rated by this response
    expect(at(s, "D7")?.value).toBeNull()
  })

  it("writes the date as YYYY-MM-DD, and a missing date as a dash", () => {
    expect(at(sheet(), "B7")?.value).toBe("2026-10-20")
    const undated = sheet({ ...INPUT, responses: [{ ...INPUT.responses[0], submittedAt: null }] })
    expect(at(undated, "B7")?.value).toBe("—")
  })

  it("writes the general rating and the APP's own remark", () => {
    const s = sheet()
    expect(at(s, "K7")?.value).toBe(4.25)
    // ⭐ the remark is getRemark's, not a second ladder's
    expect(at(s, "L7")?.value).toBe("Very Satisfactory")
    expect(at(s, "L8")?.value).toBe("Satisfactory")
  })

  it("is landscape, with its own print area and its header rows repeating", () => {
    const s = sheet()
    expect(s.orientation).toBe("landscape")
    expect(s.printArea).toBe("$A:$L")
    // the header block and the table's header row
    expect(s.printTitles).toBe("$1:$6")
  })

  it("gives the columns the widths the table needs", () => {
    expect(sheet().columns).toEqual([
      { from: "A", to: "A", width: 6 },
      { from: "B", to: "B", width: 12 },
      { from: "C", to: "J", width: 16 },
      { from: "K", to: "K", width: 15 },
      { from: "L", to: "L", width: 20 },
    ])
  })

  it("grows the table's header row for a heading that does not fit", () => {
    const model = buildOverallModel(INPUT)
    expect(model.headerHeight).toBeGreaterThanOrEqual(45)
    // ⭐ the rubric is data - a longer name makes the row taller, never clipped
    const longer = buildOverallModel({
      ...INPUT,
      criteria: [...CRITERIA, { name: "A Really Very Long Criterion Name That Will Not Fit On One Line" }],
    })
    expect(longer.headerHeight).toBeGreaterThan(model.headerHeight)
  })

  it("refuses a header row it does not have", () => {
    const model = buildOverallModel(INPUT)
    expect(() =>
      renderOverallSheet({ ...model, header: [{ kind: "criterion", heading: "I. X" }] }),
    ).toThrow(/no "criterion" row/)
  })
})

// ⭐ the faculty grain — the same table, with the subject and the section as
// COLUMNS because one faculty's sheet spans several subject-sections.
const FACULTY_INPUT: OverallInput = {
  semesterTitle: "SY 2026-2027 First Semester",
  facultyName: "Alamo, Nino Francisco",
  department: { name: "Computer Studies", code: "CCS" },
  subject: null,
  showSubjectColumn: true,
  showSectionColumn: true,
  criteria: CRITERIA,
  responses: [
    {
      ...INPUT.responses[0],
      subject: "1815-ITELEC009 Introduction to Computing",
      section: "BSIT-31E1",
    },
    {
      ...INPUT.responses[1],
      subject: "1815-ITELEC010 Data Structures",
      section: "BSIT-31E2",
    },
  ],
}

describe("the Overall sheet at the faculty grain", () => {
  it("puts SUBJECT and SECTION after NO, and DATE after them", () => {
    const model = buildOverallModel(FACULTY_INPUT)
    expect(model.columns.map((column) => column.heading)).toEqual([
      "NO",
      "SUBJECT",
      "SECTION",
      "DATE",
      ...CRITERIA.map((criterion) => criterion.name),
      "GENERAL RATING",
      "REMARKS",
    ])
  })

  it("prints the Department and OMITS the Subject line — never both", () => {
    const s = sheet(FACULTY_INPUT)
    expect(texts(s)).toContain("Department: Computer Studies (CCS)")
    // ⭐ the subject is a column now; a header line would say it twice
    expect(texts(s).some((text) => text.startsWith("Subject:"))).toBe(false)
  })

  it("writes each response's own subject and section", () => {
    const s = sheet(FACULTY_INPUT)
    expect(at(s, "B7")?.value).toBe("1815-ITELEC009 Introduction to Computing")
    expect(at(s, "C7")?.value).toBe("BSIT-31E1")
    expect(at(s, "B8")?.value).toBe("1815-ITELEC010 Data Structures")
    expect(at(s, "C8")?.value).toBe("BSIT-31E2")
  })

  it("keeps NO continuous and shifts the figures under their own columns", () => {
    const s = sheet(FACULTY_INPUT)
    expect(at(s, "A7")?.value).toBe(1)
    expect(at(s, "A8")?.value).toBe(2)
    // the criteria start at E — after NO, SUBJECT, SECTION and DATE
    expect(at(s, "E7")?.value).toBe(4.5)
    // and the rating/remark follow the last criterion
    expect(at(s, "M7")?.value).toBe(4.25)
    expect(at(s, "N7")?.value).toBe("Very Satisfactory")
  })

  it("prints a dash for a response with no label", () => {
    const s = sheet({
      ...FACULTY_INPUT,
      responses: [{ ...FACULTY_INPUT.responses[0], subject: undefined, section: undefined }],
    })
    expect(at(s, "B7")?.value).toBe("—")
    expect(at(s, "C7")?.value).toBe("—")
  })

  it("keeps the columns even when the faculty has no responses", () => {
    const model = buildOverallModel({ ...FACULTY_INPUT, responses: [] })
    expect(model.rows).toHaveLength(0)
    expect(model.columns.map((column) => column.heading)).toContain("SUBJECT")
    expect(model.columns.map((column) => column.heading)).toContain("SECTION")
  })

  it("grows a row when a label wraps, and keeps it landscape with the wider print area", () => {
    const s = sheet(FACULTY_INPUT)
    // ⭐ the subject's 38 characters take two lines in a 30-wide column
    expect(s.rows.find((row) => row.row === 7)?.height).toBeGreaterThan(13.5)
    expect(s.orientation).toBe("landscape")
    expect(s.printArea).toBe("$A:$N")
    expect(s.printTitles).toBe("$1:$6")
  })
})
