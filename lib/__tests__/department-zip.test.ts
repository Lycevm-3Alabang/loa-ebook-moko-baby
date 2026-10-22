import { describe, it, expect, vi, beforeEach } from "vitest"

const mockDepartmentRepo = vi.hoisted(() => ({ findById: vi.fn(), listAll: vi.fn() }))
const mockPeriodRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockRubricRepo = vi.hoisted(() => ({ getCategoriesWithItems: vi.fn() }))
const mockGetDepartmentResults = vi.hoisted(() => vi.fn())
const mockGetSubjectResultSet = vi.hoisted(() => vi.fn())
const mockBuildSubjectWorkbook = vi.hoisted(() => vi.fn())

vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDepartmentRepo,
  evaluationPeriodRepository: mockPeriodRepo,
  rubricRepository: mockRubricRepo,
}))
vi.mock("@/features/evaluation-results/evaluation-results.service", () => ({
  getDepartmentSubjectResults: mockGetDepartmentResults,
  getSubjectResultSet: mockGetSubjectResultSet,
}))
// ⭐ the BUILDER is mocked: this test is about the ASSEMBLY — the tree, the
// guard, the failures and the scope. The workbook's own test owns the bytes.
vi.mock("@/lib/xlsx/subject-workbook", () => ({
  buildSubjectWorkbook: mockBuildSubjectWorkbook,
}))
vi.mock("@/lib/xlsx/letterhead", () => ({ loadLetterhead: () => new Uint8Array([1, 2, 3]) }))

import {
  buildDepartmentZip,
  MAX_SUBJECT_SECTIONS,
} from "@/features/evaluation-results/department-zip"
import { readZip } from "@/lib/xlsx-template"

const ROW = {
  facultySubjectId: "fs1",
  facultyId: "f1",
  facultyName: "Alamo, Nino Francisco",
  facultyEmail: "nf@x.edu.ph",
  subjectCode: "1815-ITELEC009",
  subjectName: "Introduction to Computing",
  sectionProgram: "BSIT",
  sectionName: "31E1",
  avgRating: 3.38,
  remarks: "Very Satisfactory",
  highestRubrics: [{ key: "professionalManner", label: "Professional Manner", score: 3.6 }],
  lowestRubrics: [{ key: "assessmentAndFeedback", label: "Assessment & Feedback", score: 3.25 }],
}

beforeEach(() => {
  vi.resetAllMocks()
  mockBuildSubjectWorkbook.mockReturnValue(new Uint8Array([80, 75, 3, 4]))
  mockPeriodRepo.findById.mockResolvedValue({
    id: "p1",
    name: "Evaluation",
    semesterTitle: "SY 2026-2027 First Semester",
    rubricGroupId: "rg1",
  })
  mockDepartmentRepo.findById.mockResolvedValue({
    id: "d1",
    name: "Computer Studies",
    code: "CCS",
  })
  mockRubricRepo.getCategoriesWithItems.mockResolvedValue([
    { name: "Professional Manner", items: [{ id: "i1", text: "A statement." }] },
  ])
  mockGetDepartmentResults.mockResolvedValue({
    subjects: [ROW],
    facultyAggregates: { f1: { avgRating: 3.67, remarks: "Very Satisfactory" } },
    members: [{ id: "f1", name: "Alamo, Nino Francisco", email: "nf@x.edu.ph" }],
    departmentAggregate: null,
  })
  mockGetSubjectResultSet.mockResolvedValue({
    faculty: { name: "Alamo, Nino Francisco", employeeNo: "2024-0017" },
    subject: { code: "1815-ITELEC009", name: "Introduction to Computing" },
    section: { program: "BSIT", name: "31E1" },
    period: { name: "Evaluation", semesterTitle: "SY 2026-2027 First Semester" },
    evaluations: [],
    comments: [],
    summary: {
      totalRespondents: 1,
      avgRating: 3.38,
      remarks: "Very Satisfactory",
      categoryAverages: { "Professional Manner": 3.6 },
    },
    itemAverages: [{ itemId: "i1", avg: 3.6 }],
  })
})

describe("the department ZIP", () => {
  it("writes the tree — a department, a member, a workbook and the summary", async () => {
    const result = await buildDepartmentZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // ⭐ nothing failed — so there is no _INCOMPLETE.txt
    expect(result.failures).toEqual([])
    const parts = readZip(result.bytes)
    expect([...parts.keys()]).toEqual([
      "CCS/Alamo, Nino Francisco/1815-ITELEC009_BSIT-31E1_evaluation.xlsx",
      "CCS/Alamo, Nino Francisco/Alamo, Nino Francisco_summary.xlsx",
    ])
  })

  it("refuses a selection that cannot fit in one response — with the number", async () => {
    const many = Array.from({ length: MAX_SUBJECT_SECTIONS + 1 }, (_, i) => ({
      ...ROW,
      facultySubjectId: `fs${i}`,
    }))
    mockGetDepartmentResults.mockResolvedValue({
      subjects: many,
      facultyAggregates: {},
      members: [{ id: "f1", name: "Alamo", email: "a@x.edu.ph" }],
      departmentAggregate: null,
    })
    const result = await buildDepartmentZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })
    expect(result).toMatchObject({
      ok: false,
      reason: "too-large",
      count: MAX_SUBJECT_SECTIONS + 1,
    })
    if (result.ok || result.reason !== "too-large") return
    expect(result.estimateBytes).toBeGreaterThan(result.limitBytes)
  })

  it("refuses a department that is not there — it must not quietly shrink", async () => {
    mockDepartmentRepo.findById.mockResolvedValue(null)
    const result = await buildDepartmentZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })
    expect(result).toMatchObject({ ok: false, reason: "unknown-department", departmentId: "d1" })
  })

  it("names a subject it could not build — in _INCOMPLETE.txt, inside the ZIP", async () => {
    mockGetSubjectResultSet.mockRejectedValue(new Error("boom"))
    const result = await buildDepartmentZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })
    expect(result.ok).toBe(true)
    const parts = readZip(result.ok ? result.bytes : new Uint8Array())
    expect(parts.has("_INCOMPLETE.txt")).toBe(true)
    expect(new TextDecoder().decode(parts.get("_INCOMPLETE.txt")!)).toContain("1815-ITELEC009")
  })

  it("exports one member only, when the scope is a faculty", async () => {
    const result = await buildDepartmentZip({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
      facultyId: "f1",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.failures).toEqual([])
    const parts = readZip(result.bytes)
    expect([...parts.keys()]).toEqual([
      "CCS/Alamo, Nino Francisco/1815-ITELEC009_BSIT-31E1_evaluation.xlsx",
      "CCS/Alamo, Nino Francisco/Alamo, Nino Francisco_summary.xlsx",
    ])
  })
})
