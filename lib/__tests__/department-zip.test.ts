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
  verdictForDepartmentZip,
  MAX_SUBJECT_SECTIONS,
} from "@/features/evaluation-results/department-zip"
import { readZip, partText } from "@/lib/xlsx-template"
import { styleId } from "@/lib/xlsx/styles"

/** The XML inside one cell — the summary's figures are asserted by position. */
function cellOf(sheet: string, ref: string): string {
  const match = sheet.match(new RegExp(`<c r="${ref}"[^>]*>([\\s\\S]*?)</c>`))
  return match?.[1] ?? ""
}

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
  totalRespondents: 1,
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
    facultyAggregates: { f1: { avgRating: 3.4, remarks: "Satisfactory" } },
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
  it("writes the tree — the department summary, then a member's workbook and summary", async () => {
    const result = await buildDepartmentZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // ⭐ nothing failed — so there is no _INCOMPLETE.txt
    expect(result.failures).toEqual([])
    const parts = readZip(result.bytes)
    expect([...parts.keys()]).toEqual([
      // ⭐ D30: the department summary is FIRST, at the folder's root
      "CCS/CCS_summary.xlsx",
      "CCS/Alamo, Nino Francisco/1815-ITELEC009_BSIT-31E1_evaluation.xlsx",
      "CCS/Alamo, Nino Francisco/Alamo, Nino Francisco_summary.xlsx",
    ])
    const facultySummary = readZip(parts.get("CCS/Alamo, Nino Francisco/Alamo, Nino Francisco_summary.xlsx")!)
    expect(partText(facultySummary, "xl/worksheets/sheet1.xml")).toContain("Average: 3.40 — Satisfactory")
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

  it("refuses a faculty that is not a member — it must not quietly shrink", async () => {
    const result = await buildDepartmentZip({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
      facultyIds: ["someone-else"],
    })
    expect(result).toMatchObject({
      ok: false,
      reason: "unknown-faculty",
      facultyId: "someone-else",
      departmentId: "d1",
    })
    // ⭐ the refusal costs no subject read
    expect(mockGetSubjectResultSet).not.toHaveBeenCalled()
  })

  it("names a subject it could not build — in _INCOMPLETE.txt, inside the ZIP", async () => {
    mockGetSubjectResultSet.mockRejectedValue(new Error("boom"))
    const result = await buildDepartmentZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })
    expect(result.ok).toBe(true)
    const parts = readZip(result.ok ? result.bytes : new Uint8Array())
    expect(parts.has("_INCOMPLETE.txt")).toBe(true)
    expect(new TextDecoder().decode(parts.get("_INCOMPLETE.txt")!)).toContain("1815-ITELEC009")
  })

  it("exports one selected member only — and no department summary", async () => {
    const result = await buildDepartmentZip({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
      facultyIds: ["f1"],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.failures).toEqual([])
    const parts = readZip(result.bytes)
    expect([...parts.keys()]).toEqual([
      "CCS/Alamo, Nino Francisco/1815-ITELEC009_BSIT-31E1_evaluation.xlsx",
      "CCS/Alamo, Nino Francisco/Alamo, Nino Francisco_summary.xlsx",
    ])
    // ⭐ D34: a per-faculty export carries NO department summary — that ZIP's
    // details are one faculty's, so a whole-department row would read as the
    // scope's figure.
    expect(parts.has("CCS/CCS_summary.xlsx")).toBe(false)
  })

  it("exports exactly the selected set — and no department summary", async () => {
    const ROW2 = {
      ...ROW,
      facultySubjectId: "fs2",
      facultyId: "f2",
      facultyName: "Dela Cruz, Juan",
      facultyEmail: "jd@x.edu.ph",
      subjectCode: "1815-ITELEC010",
      subjectName: "Data Structures",
      sectionName: "31E2",
    }
    mockGetDepartmentResults.mockResolvedValue({
      subjects: [ROW, ROW2],
      facultyAggregates: {
        f1: { avgRating: 3.38, remarks: "Very Satisfactory" },
        f2: { avgRating: 3.10, remarks: "Satisfactory" },
      },
      members: [
        { id: "f1", name: "Alamo, Nino Francisco", email: "nf@x.edu.ph" },
        { id: "f2", name: "Dela Cruz, Juan", email: "jd@x.edu.ph" },
        { id: "f3", name: "Reyes, Ana", email: "ar@x.edu.ph" },
      ],
      departmentAggregate: null,
    })

    const result = await buildDepartmentZip({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
      facultyIds: ["f1", "f2"],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parts = readZip(result.bytes)
    expect([...parts.keys()]).toEqual([
      "CCS/Alamo, Nino Francisco/1815-ITELEC009_BSIT-31E1_evaluation.xlsx",
      "CCS/Dela Cruz, Juan/1815-ITELEC010_BSIT-31E2_evaluation.xlsx",
      "CCS/Alamo, Nino Francisco/Alamo, Nino Francisco_summary.xlsx",
      "CCS/Dela Cruz, Juan/Dela Cruz, Juan_summary.xlsx",
    ])
    // ⭐ f3 is a member, but was not selected — no folder for them
    expect([...parts.keys()].some((name) => name.startsWith("CCS/Reyes, Ana/"))).toBe(false)
    // ⭐ D38/D34: a proper subset carries NO department summary
    expect(parts.has("CCS/CCS_summary.xlsx")).toBe(false)
  })

  it("exports the whole department when the selected set is empty", async () => {
    const result = await buildDepartmentZip({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
      facultyIds: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parts = readZip(result.bytes)
    // ⭐ an empty set is not a filter — the whole-department ZIP, summary first
    expect([...parts.keys()]).toEqual([
      "CCS/CCS_summary.xlsx",
      "CCS/Alamo, Nino Francisco/1815-ITELEC009_BSIT-31E1_evaluation.xlsx",
      "CCS/Alamo, Nino Francisco/Alamo, Nino Francisco_summary.xlsx",
    ])
  })

  it("builds the department summary from its row-based aggregate, not a mean of faculty averages", async () => {
    mockGetDepartmentResults.mockResolvedValue({
      subjects: [ROW],
      // The department row is the row-based aggregate. The faculty averages
      // are deliberately different so the export cannot substitute their mean.
      facultyAggregates: {
        f1: { avgRating: 4, remarks: "Very Satisfactory" },
        f2: { avgRating: 2, remarks: "Unsatisfactory" },
      },
      members: [
        { id: "f1", name: "Alamo, Nino Francisco", email: "nf@x.edu.ph" },
        { id: "f2", name: "Dela Cruz, Juan", email: "jd@x.edu.ph" },
      ],
      departmentAggregate: {
        totalSubjects: 1,
        // ⭐ deliberately NOT the members' count (2) — the file must ignore it
        uniqueFaculty: 1,
        totalResponses: 34,
        avgRating: 3.4,
        remarks: "Satisfactory",
        professionalManner: null,
        communicationWithStudent: null,
        studentEngagement: null,
        learningMaterials: null,
        timeManagement: null,
        experientialLearning: null,
        respectUniqueness: null,
        assessmentAndFeedback: null,
        highestRubrics: [],
        lowestRubrics: [],
        sentimentScore: null,
      },
    })

    const result = await buildDepartmentZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parts = readZip(result.bytes)
    const summary = readZip(parts.get("CCS/CCS_summary.xlsx")!)
    const sheet = partText(summary, "xl/worksheets/sheet1.xml")

    // The summary row: 2 members (not uniqueFaculty's 1), 34 responses,
    // and the row-based average rather than the faculty averages' mean.
    expect(cellOf(sheet, "A6")).toContain("Computer Studies")
    expect(cellOf(sheet, "B6")).toContain("CCS")
    expect(cellOf(sheet, "C6")).toContain(">2<")
    expect(cellOf(sheet, "D6")).toContain(">34<")
    expect(cellOf(sheet, "E6")).toContain(">3.4<")
    expect(sheet).toContain(`<c r="E6" s="${styleId("tableNumber")}"><v>3.4</v></c>`)
    expect(cellOf(sheet, "F6")).toContain("Satisfactory")
  })

  it("still writes the department summary with no responses — 0 and dashes", async () => {
    mockGetDepartmentResults.mockResolvedValue({
      subjects: [ROW],
      facultyAggregates: {},
      members: [
        { id: "f1", name: "Alamo, Nino Francisco", email: "nf@x.edu.ph" },
        { id: "f2", name: "Dela Cruz, Juan", email: "jd@x.edu.ph" },
        { id: "f3", name: "Reyes, Ana", email: "ar@x.edu.ph" },
      ],
      departmentAggregate: null,
    })

    const result = await buildDepartmentZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parts = readZip(result.bytes)
    expect(parts.has("CCS/CCS_summary.xlsx")).toBe(true)
    const summary = readZip(parts.get("CCS/CCS_summary.xlsx")!)
    const sheet = partText(summary, "xl/worksheets/sheet1.xml")

    // ⭐ a missing file would read as a missing department — 0 and dashes
    expect(cellOf(sheet, "C6")).toContain(">3<")
    expect(cellOf(sheet, "D6")).toContain(">0<")
    expect(cellOf(sheet, "E6")).toContain("—")
    expect(cellOf(sheet, "F6")).toContain("—")
  })
})

// ⭐ the verdict — what the ROUTE answers. One place, so the admin's route
// and the dean's twin cannot disagree about a refusal.
describe("the verdict", () => {
  it("the zip", async () => {
    const result = await buildDepartmentZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })
    expect(verdictForDepartmentZip(result)).toMatchObject({ kind: "zip" })
  })

  it("the size refusal names the count, the estimate, the limit and the way out", async () => {
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
    const verdict = verdictForDepartmentZip(result)
    expect(verdict.kind).toBe("refusal")
    if (verdict.kind !== "refusal") return
    expect(verdict.status).toBe(400)
    expect(verdict.error).toContain(`${MAX_SUBJECT_SECTIONS + 1} subject-sections`)
    // ⭐ the estimate is rounded UP, so it never reads smaller than it is
    expect(verdict.error).toContain("4.1 MB")
    expect(verdict.error).toContain("the limit is 4.0 MB")
    expect(verdict.error).toContain("one department at a time")
  })

  it("an unknown department is a 400 that names it", async () => {
    mockDepartmentRepo.findById.mockResolvedValue(null)
    const result = await buildDepartmentZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })
    const verdict = verdictForDepartmentZip(result)
    expect(verdict).toMatchObject({ kind: "refusal", status: 400 })
    if (verdict.kind !== "refusal") return
    expect(verdict.error).toContain("d1")
  })

  it("an unknown faculty is a 400 that names it and its department", async () => {
    const result = await buildDepartmentZip({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
      facultyIds: ["someone-else"],
    })
    const verdict = verdictForDepartmentZip(result)
    expect(verdict).toMatchObject({ kind: "refusal", status: 400 })
    if (verdict.kind !== "refusal") return
    expect(verdict.error).toContain("someone-else")
    expect(verdict.error).toContain("d1")
  })

  it("a period that is not there is a 404", async () => {
    mockPeriodRepo.findById.mockResolvedValue(null)
    const result = await buildDepartmentZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })
    expect(verdictForDepartmentZip(result)).toMatchObject({
      kind: "refusal",
      status: 404,
      error: "Evaluation period not found",
    })
  })
})
