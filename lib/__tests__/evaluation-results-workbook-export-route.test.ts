import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockLogServerError = vi.hoisted(() => vi.fn())
const mockBuildWorkbook = vi.hoisted(() => vi.fn())
const mockGetSubjectResultSet = vi.hoisted(() => vi.fn())
const mockDeptRepo = vi.hoisted(() => ({ findByDeanId: vi.fn(), findById: vi.fn() }))
const mockFsRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockUserRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockSubjectRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockEvalPeriodRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockSectionRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockRubricRepo = vi.hoisted(() => ({ getCategoriesWithItems: vi.fn() }))
const mockEvalResultRepo = vi.hoisted(() => ({ assertPeriodIsActive: vi.fn(), getVisibilityMap: vi.fn() }))

vi.mock("@/lib/route-guard", () => ({ requireAdmin: mockRequireAdmin }))
vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/utils/roles", () => ({ hasRole: mockHasRole }))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))
vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  facultySubjectRepository: mockFsRepo,
  userRepository: mockUserRepo,
  subjectRepository: mockSubjectRepo,
  evaluationPeriodRepository: mockEvalPeriodRepo,
  sectionRepository: mockSectionRepo,
  rubricRepository: mockRubricRepo,
  evaluationResultRepository: mockEvalResultRepo,
}))
vi.mock("@/features/evaluation-results/evaluation-results.service", () => ({
  getSubjectResultSet: mockGetSubjectResultSet,
}))
vi.mock("@/features/evaluation-results/evaluation-results.repository", () => ({
  EvaluationPeriodInactiveError: class extends Error {
    status = 409
  },
}))
// The workbook is mocked: the ROUTE's job is the input it assembles — the
// workbook's own test owns the bytes.
vi.mock("@/lib/xlsx/workbook", () => ({ buildEvaluationWorkbook: mockBuildWorkbook }))
vi.mock("@/lib/xlsx/letterhead", () => ({ loadLetterhead: () => new Uint8Array([1, 2, 3]) }))

import { GET as adminGET } from "@/app/api/admin/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/export/route"
import { GET as deanGET } from "@/app/api/dean/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/export/route"
import { GET as facultyGET } from "@/app/api/faculty/evaluation-results/subjects/[facultySubjectId]/export/route"

const FACULTY = {
  id: "f1",
  name: "Dela Cruz",
  email: "d@x.com",
  employeeNo: "2024-0017",
  departmentId: "d1",
}

const EVALUATIONS = [
  {
    evaluationId: "e1",
    submittedAt: "2026-10-20T08:30:00.000Z",
    generalRating: 4.25,
    categoryAverages: { "Professional Manner": 4.5 },
  },
]

const RESULT_SET = {
  faculty: FACULTY,
  subject: { id: "s1", code: "IT101", name: "Introduction to Computing" },
  section: { program: "BSCS", name: "A" },
  period: {
    name: "SY 2026-2027 First Semester - Evaluation",
    semesterTitle: "SY 2026-2027 First Semester",
    rubricGroupId: "rg1",
  },
  evaluations: EVALUATIONS,
  comments: [{ submittedAt: "2026-10-20T08:30:00.000Z", comment: "Great explanations." }],
  summary: {
    totalRespondents: 1,
    avgRating: 4.25,
    remarks: "Very Satisfactory",
    categoryAverages: { "Professional Manner": 4.5 },
    highestRubrics: [],
    lowestRubrics: [],
  },
  itemAverages: [
    {
      itemId: "i1",
      text: "He/she behaves appropriately at all times.",
      displayOrder: 1,
      categoryId: "c1",
      categoryName: "Professional Manner",
      categoryDisplayOrder: 1,
      avg: 4.5,
      count: 1,
    },
  ],
}

function req(qs: string) {
  return new Request(`http://localhost${qs}`) as never
}

function params(departmentId: string, facultySubjectId: string) {
  return { params: Promise.resolve({ departmentId, facultySubjectId }) }
}

function facultyParams(facultySubjectId: string) {
  return { params: Promise.resolve({ facultySubjectId }) }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockBuildWorkbook.mockImplementation(() => new Uint8Array([80, 75, 3, 4]))
  mockRequireAdmin.mockResolvedValue(null)
  mockAuth.mockResolvedValue({ user: { id: "f1", role: "DEAN" } })
  mockHasRole.mockImplementation((role: string, want: string) => role === want)
  mockDeptRepo.findByDeanId.mockResolvedValue({ id: "d1", name: "CCS", code: "CCS" })
  mockDeptRepo.findById.mockResolvedValue({ id: "d1", name: "CCS", code: "CCS" })
  mockFsRepo.findById.mockResolvedValue({
    id: "fs1",
    faculty_id: "f1",
    subject_id: "s1",
    section_id: "sec1",
  })
  mockUserRepo.findById.mockResolvedValue(FACULTY)
  mockSubjectRepo.findById.mockResolvedValue({
    id: "s1",
    code: "IT101",
    name: "Introduction to Computing",
  })
  mockSectionRepo.findById.mockResolvedValue({ program: "BSCS", name: "A" })
  mockEvalPeriodRepo.findById.mockResolvedValue({
    id: "p1",
    name: "SY 2026-2027 First Semester - Evaluation",
    semesterTitle: "SY 2026-2027 First Semester",
    rubricGroupId: "rg1",
  })
  mockRubricRepo.getCategoriesWithItems.mockResolvedValue([
    {
      name: "Professional Manner",
      displayOrder: 1,
      items: [{ id: "i1", text: "He/she behaves appropriately at all times." }],
    },
  ])
  mockEvalResultRepo.assertPeriodIsActive.mockResolvedValue(undefined)
  mockEvalResultRepo.getVisibilityMap.mockResolvedValue(new Map([["f1", true]]))
  mockGetSubjectResultSet.mockResolvedValue(RESULT_SET)
})

describe("the workbook export routes", () => {
  it("hands the generator the rubric's criteria, the comments and the per-response map", async () => {
    const res = await adminGET(req("?evaluationPeriodId=p1"), params("d1", "fs1"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    expect(res.headers.get("content-disposition")).toContain(".xlsx")
    const input = mockBuildWorkbook.mock.calls[0][0]
    expect(input.form.criteria).toEqual([
      {
        name: "Professional Manner",
        average: 4.5,
        statements: [{ text: "He/she behaves appropriately at all times.", avg: 4.5 }],
      },
    ])
    // the Comments sheet takes the TEXTS only — no date
    expect(input.comments).toEqual(["Great explanations."])
    // ⭐ the rows carry the LIVE map, so the Overall sheet's columns follow the
    // rubric with the values under them
    expect(input.responses).toEqual(EVALUATIONS)
    expect(input.logo).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("refuses a subject that is not in the department — and builds nothing", async () => {
    mockUserRepo.findById.mockResolvedValue({ ...FACULTY, departmentId: "d2" })
    const res = await adminGET(req("?evaluationPeriodId=p1"), params("d1", "fs1"))
    expect(res.status).toBe(404)
    expect(mockBuildWorkbook).not.toHaveBeenCalled()
  })

  it("the dean gets the same workbook", async () => {
    const res = await deanGET(req("?evaluationPeriodId=p1"), params("d1", "fs1"))
    expect(res.status).toBe(200)
    expect(mockBuildWorkbook).toHaveBeenCalledTimes(1)
  })

  it("the faculty gets it too — for their own subject", async () => {
    const res = await facultyGET(req("?evaluationPeriodId=p1"), facultyParams("fs1"))
    expect(res.status).toBe(200)
    expect(mockBuildWorkbook).toHaveBeenCalledTimes(1)
  })

  it("the faculty cannot export another faculty's subject", async () => {
    mockFsRepo.findById.mockResolvedValue({
      id: "fs1",
      faculty_id: "someone-else",
      subject_id: "s1",
      section_id: "sec1",
    })
    const res = await facultyGET(req("?evaluationPeriodId=p1"), facultyParams("fs1"))
    expect(res.status).toBe(403)
    expect(mockBuildWorkbook).not.toHaveBeenCalled()
  })
})
