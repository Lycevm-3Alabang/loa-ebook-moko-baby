import { describe, it, expect, vi, beforeEach } from "vitest"

const mockBuildWorkbook = vi.hoisted(() => vi.fn())
// the workbook is mocked: the BUILDER's job is the input it assembles — the
// workbook's own test owns the bytes
vi.mock("@/lib/xlsx/workbook", () => ({ buildEvaluationWorkbook: mockBuildWorkbook }))

import { buildSubjectWorkbook } from "@/lib/xlsx/subject-workbook"

const RESULT_SET = {
  faculty: { id: "f1", name: "Dela Cruz", email: "d@x.com", employeeNo: "2024-0017" },
  subject: { id: "s1", code: "IT101", name: "Introduction to Computing" },
  section: { program: "BSCS", name: "A" },
  period: {
    name: "SY 2026-2027 First Semester - Evaluation",
    semesterTitle: "SY 2026-2027 First Semester",
  },
  evaluations: [
    {
      submittedAt: "2026-10-20T08:30:00.000Z",
      generalRating: 4.25,
      categoryAverages: { "Professional Manner": 4.5 },
    },
  ],
  comments: [{ submittedAt: "2026-10-20T08:30:00.000Z", comment: "Great explanations." }],
  summary: {
    totalRespondents: 1,
    avgRating: 4.25,
    remarks: "Very Satisfactory",
    categoryAverages: { "Professional Manner": 4.5 },
  },
  itemAverages: [{ itemId: "i1", avg: 4.5 }],
}

const RUBRIC = [
  {
    name: "Professional Manner",
    displayOrder: 1,
    items: [{ id: "i1", text: "He/she behaves appropriately at all times." }],
  },
]

/** The input the builder handed to the generator. */
function input() {
  return mockBuildWorkbook.mock.calls[0][0]
}

describe("the subject workbook builder", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockBuildWorkbook.mockReturnValue(new Uint8Array([1, 2, 3]))
  })

  it("hands the generator the rubric's criteria — each statement's own average", () => {
    buildSubjectWorkbook(RESULT_SET, RUBRIC, null)
    // ⭐ the assertion that lived in the route's test
    expect(input().form.criteria).toEqual([
      {
        name: "Professional Manner",
        average: 4.5,
        statements: [{ text: "He/she behaves appropriately at all times.", avg: 4.5 }],
      },
    ])
  })

  it("hands the generator the form's identity block and its footer", () => {
    buildSubjectWorkbook(RESULT_SET, RUBRIC, null)
    expect(input().form).toMatchObject({
      semesterTitle: "SY 2026-2027 First Semester",
      evaluationPeriodName: "SY 2026-2027 First Semester - Evaluation",
      employeeNo: "2024-0017",
      facultyName: "Dela Cruz",
      program: "BSCS",
      sectionName: "A",
      subject: { code: "IT101", name: "Introduction to Computing" },
      avgRating: 4.25,
      remarks: "Very Satisfactory",
      totalRespondents: 1,
    })
  })

  it("hands the generator the comments' TEXTS only — no date", () => {
    buildSubjectWorkbook(RESULT_SET, RUBRIC, null)
    expect(input().comments).toEqual(["Great explanations."])
  })

  it("hands the generator the per-response rows — the live map", () => {
    buildSubjectWorkbook(RESULT_SET, RUBRIC, null)
    expect(input().responses).toEqual(RESULT_SET.evaluations)
  })

  it("passes the letterhead through", () => {
    buildSubjectWorkbook(RESULT_SET, RUBRIC, new Uint8Array([9, 9]))
    expect(input().logo).toEqual(new Uint8Array([9, 9]))
  })

  it("assumes no criterion count — nine criteria make nine criterion blocks", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({
      name: `Criterion ${i + 1}`,
      items: [{ id: `i${i}`, text: `Statement ${i + 1}` }],
    }))
    buildSubjectWorkbook(RESULT_SET, nine, null)
    expect(input().form.criteria).toHaveLength(9)
    expect(input().form.criteria[8].name).toBe("Criterion 9")
  })

  it("carries a teacher who is not there as 'Unknown', and a missing subject as none", () => {
    buildSubjectWorkbook({ ...RESULT_SET, faculty: null, subject: null }, RUBRIC, null)
    expect(input().form.facultyName).toBe("Unknown")
    // ⭐ the raw value — the em dash is the form model's job, later
    expect(input().form.employeeNo).toBeNull()
    expect(input().form.subject).toBeNull()
  })
})
