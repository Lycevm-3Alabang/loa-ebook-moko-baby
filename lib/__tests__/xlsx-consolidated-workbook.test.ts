import { describe, it, expect } from "vitest"
import { writeFileSync } from "fs"
import { buildConsolidatedFacultyWorkbook } from "@/lib/xlsx/consolidated-workbook"
import { buildFacultySummaryModel } from "@/lib/xlsx/overall-summary"
import { buildGroupedCommentsModel, COMMENTS_BANNER } from "@/lib/xlsx/comments"
import { buildOverallModel, type OverallResponse } from "@/lib/xlsx/overall"
import type { Identity } from "@/lib/xlsx/form-model"
import { readZip, partText } from "@/lib/xlsx-template"
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

const SUMMARY = {
  semesterTitle: "SY 2026-2027 First Semester",
  evaluationPeriodName: "SY 2026-2027 First Semester - Evaluation",
  department: { name: "Computer Studies", code: "CCS" },
  faculty: {
    name: "Alamo, Nino Francisco",
    email: "nf.alamo@x.edu.ph",
    avgRating: 3.4,
    remarks: "Satisfactory",
  },
  rows: [
    {
      subject: { code: "1815-ITELEC009", name: "Introduction to Computing" },
      section: { program: "BSIT", name: "31E1" },
      totalRespondents: 1,
      avgRating: 4.25,
      highest: [{ label: "Professional Manner", score: 4.5 }],
      lowest: [{ label: "Assessment & Feedback", score: 4.0 }],
    },
    {
      subject: { code: "1815-ITELEC010", name: "Data Structures" },
      section: { program: "BSIT", name: "31E2" },
      totalRespondents: 1,
      avgRating: 3.5,
      highest: [{ label: "Student Engagement", score: 3.5 }],
      lowest: [{ label: "Time Management", score: 3.5 }],
    },
  ],
}

const IDENTITY: Identity = {
  semesterTitle: "SY 2026-2027 First Semester",
  evaluationPeriodName: "SY 2026-2027 First Semester - Evaluation",
  employeeNo: "2024-0017",
  facultyName: "Alamo, Nino Francisco",
  avgRating: 3.4,
  remarks: "Satisfactory",
}

const GROUPS = [
  {
    label: "1815-ITELEC009 Introduction to Computing — BSIT-31E1",
    comments: ["Great explanations.", "Clear examples."],
  },
  {
    label: "1815-ITELEC010 Data Structures — BSIT-31E2",
    comments: ["More practice exercises."],
  },
]

const RESPONSES: OverallResponse[] = [
  {
    submittedAt: "2026-10-20T08:30:00.000Z",
    generalRating: 4.25,
    categoryAverages: averages([4.5, 4.0, 4.5, 4.0, 4.5, 4.0, 4.5, 4.0]),
    subject: "1815-ITELEC009 Introduction to Computing",
    section: "BSIT-31E1",
  },
  {
    submittedAt: "2026-10-21T09:15:00.000Z",
    generalRating: 3.5,
    categoryAverages: averages([3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5]),
    subject: "1815-ITELEC010 Data Structures",
    section: "BSIT-31E2",
  },
]

function built() {
  return readZip(
    buildConsolidatedFacultyWorkbook({
      individual: buildFacultySummaryModel(SUMMARY),
      comments: buildGroupedCommentsModel(IDENTITY, GROUPS),
      overall: buildOverallModel({
        semesterTitle: SUMMARY.semesterTitle,
        facultyName: SUMMARY.faculty.name,
        department: SUMMARY.department,
        subject: null,
        showSubjectColumn: true,
        showSectionColumn: true,
        criteria: CRITERIA,
        responses: RESPONSES,
      }),
    }),
  )
}

describe("the consolidated faculty workbook", () => {
  it("writes the three tabs, in the legacy's order, with no letterhead", () => {
    const parts = built()
    const workbook = partText(parts, "xl/workbook.xml")
    expect(workbook).toContain('<sheet name="Individual"')
    expect(workbook).toContain('<sheet name="Comments"')
    expect(workbook).toContain('<sheet name="Overall"')
    expect(workbook.indexOf('<sheet name="Individual"')).toBeLessThan(
      workbook.indexOf('<sheet name="Comments"'),
    )
    expect(workbook.indexOf('<sheet name="Comments"')).toBeLessThan(
      workbook.indexOf('<sheet name="Overall"'),
    )
    // ⭐ the consolidated file is data, not the signed form
    expect(parts.has("xl/media/image1.png")).toBe(false)
    expect(parts.has("xl/drawings/drawing1.xml")).toBe(false)
  })

  it("draws the Individual tab from the faculty summary — the card's average", () => {
    const sheet = partText(built(), "xl/worksheets/sheet1.xml")
    expect(sheet).toContain("FACULTY PERFORMANCE EVALUATION RESULT (POST-EVALUATION)")
    // ⭐ the new Individual sheet has rubric blocks and totals, not a subject table
    expect(sheet).toContain("Alamo, Nino Francisco")
    expect(sheet).toContain("3.40")
    expect(sheet).toContain("TOTAL RESPONDENTS:")
    expect(sheet).toContain("FINAL RATING:")
    // ⭐ no SUBJECT column or 1815-ITELEC009 row in the new Individual layout
  })

  it("groups every comment under its subject-section, with no date", () => {
    const sheet = partText(built(), "xl/worksheets/sheet2.xml")
    expect(sheet).toContain(COMMENTS_BANNER)
    expect(sheet).toContain("1815-ITELEC009 Introduction to Computing — BSIT-31E1")
    expect(sheet).toContain("1815-ITELEC010 Data Structures — BSIT-31E2")
    expect(sheet).toContain("Great explanations.")
    expect(sheet).toContain("More practice exercises.")
    expect(/\d{4}-\d{2}-\d{2}/.test(sheet)).toBe(false)
  })

  it("draws the Overall tab with the subject and section columns, continuous NO", () => {
    const sheet = partText(built(), "xl/worksheets/sheet3.xml")
    expect(sheet).toContain("SUBJECT")
    expect(sheet).toContain("SECTION")
    expect(sheet).toContain("1815-ITELEC009 Introduction to Computing")
    expect(sheet).toContain("BSIT-31E1")
    expect(sheet).toContain("1815-ITELEC010 Data Structures")
    expect(sheet).toContain('<v>1</v>')
    expect(sheet).toContain('<v>2</v>')
    // ⭐ the subject is a column — the header line is absent
    expect(sheet).not.toContain("Subject:")
  })

  it("writes a sample of the workbook, when a path is given", () => {
    // ⭐ ACES_SAMPLE_PATH=... writes the REAL workbook for the owner's Excel
    // proof — the tabs, the columns and the groups, ready to open and print
    const path = process.env.ACES_SAMPLE_PATH
    if (!path) return

    const responses: OverallResponse[] = Array.from({ length: 12 }, (_, index) => {
      // ⭐ grouped by subject-section, as the assembly prints them
      const nine = index < 6
      return {
        submittedAt: `2026-10-${String(10 + index).padStart(2, "0")}T09:00:00.000Z`,
        generalRating: nine ? 4.25 : 3.5,
        categoryAverages: nine
          ? averages([4.5, 4.0, 4.5, 4.0, 4.5, 4.0, 4.5, 4.0])
          : averages([3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5]),
        subject: nine
          ? "1815-ITELEC009 Introduction to Computing"
          : "1815-ITELEC010 Data Structures",
        section: nine ? "BSIT-31E1" : "BSIT-31E2",
      }
    })

    const bytes = buildConsolidatedFacultyWorkbook({
      individual: buildFacultySummaryModel(SUMMARY),
      comments: buildGroupedCommentsModel(IDENTITY, GROUPS),
      overall: buildOverallModel({
        semesterTitle: SUMMARY.semesterTitle,
        facultyName: SUMMARY.faculty.name,
        department: SUMMARY.department,
        subject: null,
        showSubjectColumn: true,
        showSectionColumn: true,
        criteria: CRITERIA,
        responses,
      }),
    })
    writeFileSync(path, bytes)

    const parts = readZip(bytes)
    expect(parts.has("xl/worksheets/sheet1.xml")).toBe(true)
    expect(parts.has("xl/worksheets/sheet2.xml")).toBe(true)
    expect(parts.has("xl/worksheets/sheet3.xml")).toBe(true)
  })
})
