import { describe, it, expect } from "vitest"
import { writeFileSync } from "fs"
import { buildConsolidatedFacultyWorkbook } from "@/lib/xlsx/consolidated-workbook"
import { buildFacultySummaryModel } from "@/lib/xlsx/overall-summary"
import { buildCommentsModel, COMMENTS_BANNER } from "@/lib/xlsx/comments"
import { buildOverallModel } from "@/lib/xlsx/overall"
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
      rubricCategories: APP_RUBRIC.map((criterion) => ({
        name: criterion.name,
        items: criterion.statements,
      })),
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

const COMMENTS = ["Great explanations.", "Clear examples.", "More practice exercises."]

function built() {
  return readZip(
    buildConsolidatedFacultyWorkbook({
      individual: buildFacultySummaryModel(SUMMARY),
      comments: buildCommentsModel(IDENTITY, COMMENTS),
      itemAverages: { [APP_RUBRIC[0].statements[0].id]: 4.25 },
      overall: buildOverallModel({
        semesterTitle: SUMMARY.semesterTitle,
        facultyName: SUMMARY.faculty.name,
        department: SUMMARY.department,
        subject: null,
        showDateColumn: false,
        showSubjectHeader: false,
        criteria: CRITERIA,
        responses: [{
          submittedAt: null,
          generalRating: 3.875,
          categoryAverages: averages([4, 3.75, 4, 3.75, 4, 3.75, 4, 3.75]),
        }],
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
    expect(sheet).toContain("<v>3.4</v>")
    expect(sheet).toContain("TOTAL RESPONDENTS")
    expect(sheet).toContain("FINAL RATING")
    expect(sheet).toContain("I. Professional Manner")
    expect(sheet).toContain("AVERAGE")
    expect(sheet).toContain("<v>4.25</v>")
    // ⭐ no SUBJECT column or 1815-ITELEC009 row in the new Individual layout
  })

  it("rounds the Individual sheet values to two decimals for display", () => {
    const sheet = partText(
      readZip(
        buildConsolidatedFacultyWorkbook({
          individual: buildFacultySummaryModel({
            ...SUMMARY,
            faculty: { ...SUMMARY.faculty, avgRating: 3.679, remarks: "Very Satisfactory" },
          }),
          comments: buildCommentsModel(IDENTITY, COMMENTS),
          overall: buildOverallModel({
            semesterTitle: SUMMARY.semesterTitle,
            facultyName: SUMMARY.faculty.name,
            department: SUMMARY.department,
            subject: null,
            showDateColumn: false,
            showSubjectHeader: false,
            criteria: CRITERIA,
            responses: [{
              submittedAt: null,
              generalRating: 3.679,
              categoryAverages: averages([3.679, 3.679, 3.679, 3.679, 3.679, 3.679, 3.679, 3.679]),
            }],
          }),
          itemAverages: { [APP_RUBRIC[0].statements[0].id]: 3.679 },
          rubricCategories: APP_RUBRIC.map((criterion) => ({
            name: criterion.name,
            items: criterion.statements,
          })),
        }),
      ),
      "xl/worksheets/sheet1.xml",
    )

    expect(sheet).toContain("3.68")
  })

  it("lists comments without subject-section group banners or dates", () => {
    const sheet = partText(built(), "xl/worksheets/sheet2.xml")
    expect(sheet).toContain(COMMENTS_BANNER)
    expect(sheet).toContain("Great explanations.")
    expect(sheet).toContain("More practice exercises.")
    expect(sheet).not.toContain("1815-ITELEC009")
    expect(sheet).not.toContain("BSIT-31E1")
    expect(/\d{4}-\d{2}-\d{2}/.test(sheet)).toBe(false)
  })

  it("draws the Overall tab as one faculty-level average row", () => {
    const sheet = partText(built(), "xl/worksheets/sheet3.xml")
    expect(sheet).not.toContain("SUBJECT")
    expect(sheet).not.toContain("SECTION")
    expect(sheet).not.toContain("DATE")
    expect(sheet).not.toContain("1815-ITELEC009")
    expect(sheet).toContain('<v>1</v>')
    expect(sheet).not.toContain("Subject:")
  })

  it("writes a sample of the workbook, when a path is given", () => {
    // ⭐ ACES_SAMPLE_PATH=... writes the real faculty-level workbook for review.
    const path = process.env.ACES_SAMPLE_PATH
    if (!path) return

    const bytes = buildConsolidatedFacultyWorkbook({
      individual: buildFacultySummaryModel(SUMMARY),
      comments: buildCommentsModel(IDENTITY, COMMENTS),
      overall: buildOverallModel({
        semesterTitle: SUMMARY.semesterTitle,
        facultyName: SUMMARY.faculty.name,
        department: SUMMARY.department,
        subject: null,
        showDateColumn: false,
        showSubjectHeader: false,
        criteria: CRITERIA,
        responses: [{
          submittedAt: null,
          generalRating: 3.875,
          categoryAverages: averages([4, 3.75, 4, 3.75, 4, 3.75, 4, 3.75]),
        }],
      }),
      itemAverages: { [APP_RUBRIC[0].statements[0].id]: 4.25 },
    })
    writeFileSync(path, bytes)

    const parts = readZip(bytes)
    expect(parts.has("xl/worksheets/sheet1.xml")).toBe(true)
    expect(parts.has("xl/worksheets/sheet2.xml")).toBe(true)
    expect(parts.has("xl/worksheets/sheet3.xml")).toBe(true)
  })
})
