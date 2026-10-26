import { describe, it, expect, vi, beforeEach } from "vitest"

const mockDepartmentRepo = vi.hoisted(() => ({ findById: vi.fn(), listAll: vi.fn() }))
const mockPeriodRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockRubricRepo = vi.hoisted(() => ({ getCategoriesWithItems: vi.fn() }))
const mockGetDepartmentResults = vi.hoisted(() => vi.fn())
const mockGetSubjectResultSet = vi.hoisted(() => vi.fn())
const mockBuildConsolidatedWorkbook = vi.hoisted(() => vi.fn())

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
// models, the scope, the guard and the failures. The workbook's own test owns
// the bytes.
vi.mock("@/lib/xlsx/consolidated-workbook", () => ({
  buildConsolidatedFacultyWorkbook: mockBuildConsolidatedWorkbook,
}))

import {
  buildConsolidatedFacultyZip,
} from "@/features/evaluation-results/consolidated-zip"
import { MAX_SUBJECT_SECTIONS } from "@/features/evaluation-results/department-zip"
import { readZip } from "@/lib/xlsx-template"

const PERIOD = {
  id: "p1",
  name: "Evaluation",
  semesterTitle: "SY 2026-2027 First Semester",
  rubricGroupId: "rg1",
}

const MEMBER_1 = { id: "f1", name: "Alamo, Nino Francisco", email: "nf@x.edu.ph" }
const MEMBER_2 = { id: "f2", name: "Reyes, Ana", email: "ar@x.edu.ph" }

function row(overrides: Record<string, unknown>) {
  return {
    facultySubjectId: "fs",
    facultyId: "f1",
    facultyName: MEMBER_1.name,
    facultyEmail: MEMBER_1.email,
    subjectId: "s1",
    subjectCode: "1815-ITELEC009",
    subjectName: "Introduction to Computing",
    sectionProgram: "BSIT",
    sectionName: "31E1",
    avgRating: 3.38,
    remarks: "Very Satisfactory",
    highestRubrics: [],
    lowestRubrics: [],
    totalRespondents: 1,
    ...overrides,
  }
}

// ⭐ deliberately out of order — the assembly sorts subject, then section
const ROW_009_E2 = row({ facultySubjectId: "fs-009-e2", sectionName: "31E2" })
const ROW_008_E1 = row({
  facultySubjectId: "fs-008",
  subjectId: "s0",
  subjectCode: "1815-ITELEC008",
  subjectName: "Discrete Mathematics",
})
const ROW_009_E1 = row({ facultySubjectId: "fs-009-e1" })

function evaluation(id: string, submittedAt: string, score = 4) {
  return {
    evaluationId: id,
    submittedAt,
    generalRating: score,
    categoryAverages: { "Professional Manner": score },
    itemAverages: [{ itemId: "i1", avg: score }],
  }
}

const RESULT_SETS: Record<string, unknown> = {
  "fs-008": {
    faculty: { ...MEMBER_1, employeeNo: "2024-0017" },
    subject: { code: "1815-ITELEC008", name: "Discrete Mathematics" },
    section: { program: "BSIT", name: "31E1" },
    period: { name: PERIOD.name, semesterTitle: PERIOD.semesterTitle },
    evaluations: [evaluation("e1", "2026-10-20T08:30:00.000Z", 2)],
    comments: [{ submittedAt: null, comment: "Clear." }],
    summary: {},
    itemAverages: [],
  },
  "fs-009-e1": {
    faculty: { ...MEMBER_1, employeeNo: "2024-0017" },
    subject: { code: "1815-ITELEC009", name: "Introduction to Computing" },
    section: { program: "BSIT", name: "31E1" },
    period: { name: PERIOD.name, semesterTitle: PERIOD.semesterTitle },
    evaluations: [
      evaluation("e2", "2026-10-21T09:15:00.000Z", 4),
      evaluation("e3", "2026-10-22T10:00:00.000Z", 4),
    ],
    comments: [{ submittedAt: null, comment: "Great." }],
    summary: {},
    itemAverages: [],
  },
  "fs-009-e2": {
    faculty: { ...MEMBER_1, employeeNo: "2024-0017" },
    subject: { code: "1815-ITELEC009", name: "Introduction to Computing" },
    section: { program: "BSIT", name: "31E2" },
    period: { name: PERIOD.name, semesterTitle: PERIOD.semesterTitle },
    evaluations: [evaluation("e4", "2026-10-23T11:00:00.000Z", 5)],
    comments: [],
    summary: {},
    itemAverages: [],
  },
}

beforeEach(() => {
  vi.resetAllMocks()
  mockBuildConsolidatedWorkbook.mockReturnValue(new Uint8Array([80, 75, 3, 4]))
  mockPeriodRepo.findById.mockResolvedValue(PERIOD)
  mockDepartmentRepo.findById.mockResolvedValue({
    id: "d1",
    name: "Computer Studies",
    code: "CCS",
  })
  mockRubricRepo.getCategoriesWithItems.mockResolvedValue([
    { name: "Professional Manner", items: [] },
    { name: "Communication with Students", items: [] },
  ])
  mockGetDepartmentResults.mockResolvedValue({
    subjects: [ROW_009_E2, ROW_008_E1, ROW_009_E1],
    facultyAggregates: { f1: { avgRating: 3.4, remarks: "Satisfactory" } },
    members: [MEMBER_1, MEMBER_2],
    departmentAggregate: null,
  })
  mockGetSubjectResultSet.mockImplementation(async (facultySubjectId: string) => {
    return RESULT_SETS[facultySubjectId] ?? null
  })
})

/** The input the mocked workbook builder received for a member. */
function inputOf(name: string) {
  const calls = mockBuildConsolidatedWorkbook.mock.calls.map(([input]) => input)
  return calls.find((input) => input.individual.band[0].text === name)
}

describe("the consolidated faculty ZIP", () => {
  it("writes one file per member — no subject workbooks, no department summary", async () => {
    const result = await buildConsolidatedFacultyZip({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.failures).toEqual([])
    const parts = readZip(result.bytes)
    expect([...parts.keys()]).toEqual([
      "CCS/Alamo, Nino Francisco/Alamo, Nino Francisco_consolidated.xlsx",
      "CCS/Reyes, Ana/Reyes, Ana_consolidated.xlsx",
    ])
    expect([...parts.keys()].some((name) => name.endsWith("_evaluation.xlsx"))).toBe(false)
    expect(parts.has("CCS/CCS_summary.xlsx")).toBe(false)
  })

  it("matches the non-consolidated faculty average and keeps the member count, including a member with none", async () => {
    await buildConsolidatedFacultyZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })

    const member = inputOf(MEMBER_1.name)!
    expect(member.individual.band[2].text).toContain("Average: 3.67")
    expect(member.individual.rows).toHaveLength(1)
    expect(member.individual.rows[0].cells[2]).toBe(4)
    expect(member.itemAverages.i1).toBe(3.75)
    expect(member.overall.rows).toHaveLength(1)
    expect(member.overall.rows[0].values[0]).toBe(3.75)
    expect(member.overall.rows[0].rating).toBe(3.75)
    expect(member.overall.columns.map((column: { heading: string }) => column.heading)).not.toContain("SUBJECT")
    expect(member.overall.columns.map((column: { heading: string }) => column.heading)).not.toContain("SECTION")
    expect(member.overall.columns.map((column: { heading: string }) => column.heading)).not.toContain("DATE")

    // ⭐ C6 — an empty member gets a FILE, not a failure or a missing folder
    const empty = inputOf(MEMBER_2.name)!
    expect(empty.individual.rows).toHaveLength(1)
    expect(empty.individual.rows[0].cells[2]).toBe(0)
    expect(empty.individual.band[2].text).toBe("Average: —")
    expect(empty.comments.some((row: { kind: string }) => row.kind === "group")).toBe(false)
    expect(empty.overall.rows).toHaveLength(1)
    expect(empty.overall.rows[0].rating).toBeNull()
  })

  it("writes comments without subject-section group banners", async () => {
    await buildConsolidatedFacultyZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })

    const member = inputOf(MEMBER_1.name)!
    expect(member.comments.some((row: { kind: string }) => row.kind === "group")).toBe(false)
    expect(
      member.comments
        .filter((row: { kind: string }) => row.kind === "comment")
        .map((row: { text: string }) => row.text),
    ).toEqual(["Clear.", "Great."])
  })

  it("uses the subject-section average for the faculty final output while keeping raw response values on Overall", async () => {
    await buildConsolidatedFacultyZip({ evaluationPeriodId: "p1", departmentIds: ["d1"] })

    const member = inputOf(MEMBER_1.name)!
    expect(member.overall.rows.map((row: { no: number }) => row.no)).toEqual([1])
    expect(member.overall.rows[0].values[0]).toBe(3.75)
    const texts = member.overall.header.map((line: { kind: string; text?: string }) =>
      line.kind === "spacer" ? "" : (line.text ?? ""),
    )
    expect(texts).toContain("Department: Computer Studies (CCS)")
    expect(texts.some((text: string) => text.startsWith("Subject:"))).toBe(false)
  })

  it("skips the whole workbook of a faculty whose read fails, and names it", async () => {
    mockGetSubjectResultSet.mockImplementation(async (facultySubjectId: string) => {
      if (facultySubjectId === "fs-008") throw new Error("boom")
      return RESULT_SETS[facultySubjectId] ?? null
    })

    const result = await buildConsolidatedFacultyZip({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.failures).toEqual([
      "Alamo, Nino Francisco — 1815-ITELEC008 Discrete Mathematics BSIT-31E1: boom",
    ])

    const parts = readZip(result.bytes)
    expect(parts.has("_INCOMPLETE.txt")).toBe(true)
    expect(new TextDecoder().decode(parts.get("_INCOMPLETE.txt")!)).toContain(
      "Alamo, Nino Francisco — 1815-ITELEC008 Discrete Mathematics BSIT-31E1: boom",
    )
    // ⭐ no partial workbook — the other member still ships
    expect(parts.has("CCS/Alamo, Nino Francisco/Alamo, Nino Francisco_consolidated.xlsx")).toBe(false)
    expect(parts.has("CCS/Reyes, Ana/Reyes, Ana_consolidated.xlsx")).toBe(true)
    expect(mockBuildConsolidatedWorkbook).toHaveBeenCalledTimes(1)
  })

  it("refuses a selection that cannot fit in one response — with the number", async () => {
    mockGetDepartmentResults.mockResolvedValue({
      subjects: Array.from({ length: MAX_SUBJECT_SECTIONS + 1 }, (_, index) =>
        row({ facultySubjectId: `fs${index}` }),
      ),
      facultyAggregates: {},
      members: [MEMBER_1],
      departmentAggregate: null,
    })

    const result = await buildConsolidatedFacultyZip({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
    })
    expect(result).toMatchObject({
      ok: false,
      reason: "too-large",
      count: MAX_SUBJECT_SECTIONS + 1,
    })
    // ⭐ the guard costs no subject read
    expect(mockGetSubjectResultSet).not.toHaveBeenCalled()
  })

  it("refuses a department that is not there", async () => {
    mockDepartmentRepo.findById.mockResolvedValue(null)
    const result = await buildConsolidatedFacultyZip({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
    })
    expect(result).toMatchObject({ ok: false, reason: "unknown-department", departmentId: "d1" })
  })

  it("refuses a faculty that is not a member", async () => {
    const result = await buildConsolidatedFacultyZip({
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
    expect(mockGetSubjectResultSet).not.toHaveBeenCalled()
  })

  it("exports the selected member only", async () => {
    const result = await buildConsolidatedFacultyZip({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
      facultyIds: [MEMBER_2.id],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parts = readZip(result.bytes)
    expect([...parts.keys()]).toEqual([
      "CCS/Reyes, Ana/Reyes, Ana_consolidated.xlsx",
    ])
    expect(mockBuildConsolidatedWorkbook).toHaveBeenCalledTimes(1)
  })

  it("a period that is not there is a 404's reason", async () => {
    mockPeriodRepo.findById.mockResolvedValue(null)
    const result = await buildConsolidatedFacultyZip({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
    })
    expect(result).toMatchObject({ ok: false, reason: "nothing-to-export", count: 0 })
  })
})
