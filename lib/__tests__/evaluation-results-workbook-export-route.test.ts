import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockLogServerError = vi.hoisted(() => vi.fn())
const mockBuildSubjectWorkbook = vi.hoisted(() => vi.fn())
const mockGetSubjectResultSet = vi.hoisted(() => vi.fn())
const mockGetDepartmentResults = vi.hoisted(() => vi.fn())
const mockGetDepartmentList = vi.hoisted(() => vi.fn())
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
  getDepartmentResults: mockGetDepartmentList,
  getDepartmentSubjectResults: mockGetDepartmentResults,
}))
// ⭐ the mock mirrors the real class: the status comes from the throw site,
// and the route answers with it
vi.mock("@/features/evaluation-results/evaluation-results.repository", () => ({
  EvaluationPeriodInactiveError: class extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))
// The BUILDER is mocked: the ROUTE's job is to hand it the result set, the
// rubric and the letterhead — the builder's own test owns the assembly, and
// the workbook's own test owns the bytes.
vi.mock("@/lib/xlsx/subject-workbook", () => ({ buildSubjectWorkbook: mockBuildSubjectWorkbook }))
vi.mock("@/lib/xlsx/letterhead", () => ({ loadLetterhead: () => new Uint8Array([1, 2, 3]) }))

import { GET as adminGET } from "@/app/api/admin/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/export/route"
import { GET as deanGET } from "@/app/api/dean/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/export/route"
import { GET as facultyGET } from "@/app/api/faculty/evaluation-results/subjects/[facultySubjectId]/export/route"
import { GET as adminDeptZipGET } from "@/app/api/admin/evaluation-results/export/excel/route"
import { GET as deanDeptZipGET } from "@/app/api/dean/evaluation-results/export/excel/route"
import { EvaluationPeriodInactiveError } from "@/features/evaluation-results/evaluation-results.repository"
import { readZip } from "@/lib/xlsx-template"

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

/** One subject-section of the department — the drill-down's own row. */
const DEPT_ROW = {
  facultySubjectId: "fs1",
  facultyId: "f1",
  facultyName: "Dela Cruz",
  facultyEmail: "d@x.com",
  subjectCode: "IT101",
  subjectName: "Introduction to Computing",
  sectionProgram: "BSCS",
  sectionName: "A",
  avgRating: 4.25,
  remarks: "Very Satisfactory",
  highestRubrics: [{ key: "professionalManner", label: "Professional Manner", score: 4.5 }],
  lowestRubrics: [{ key: "assessmentAndFeedback", label: "Assessment & Feedback", score: 4 }],
}

beforeEach(() => {
  vi.resetAllMocks()
  mockBuildSubjectWorkbook.mockImplementation(() => new Uint8Array([80, 75, 3, 4]))
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
  mockGetDepartmentResults.mockResolvedValue({
    subjects: [DEPT_ROW],
    facultyAggregates: { f1: { avgRating: 4.25, remarks: "Very Satisfactory" } },
    members: [{ id: "f1", name: "Dela Cruz", email: "d@x.com" }],
    departmentAggregate: null,
  })
  // ⭐ the LIST read (the empty-scope branch); the detail read above is
  // what buildDepartmentZip consumes per department
  mockGetDepartmentList.mockResolvedValue({ departments: [], warnings: {} })
})

describe("the workbook export routes", () => {
  it("hands the builder the result set, the rubric and the letterhead", async () => {
    const res = await adminGET(req("?evaluationPeriodId=p1"), params("d1", "fs1"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    expect(res.headers.get("content-disposition")).toContain(".xlsx")
    // ⭐ the route's job is the HAND-OFF — the assembly is the builder's, and
    // the builder's own test owns the input it builds
    const [resultSet, rubric, logo] = mockBuildSubjectWorkbook.mock.calls[0]
    expect(resultSet).toBe(RESULT_SET)
    expect(rubric).toEqual([
      {
        name: "Professional Manner",
        displayOrder: 1,
        items: [{ id: "i1", text: "He/she behaves appropriately at all times." }],
      },
    ])
    expect(logo).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("refuses a subject that is not in the department — and builds nothing", async () => {
    mockUserRepo.findById.mockResolvedValue({ ...FACULTY, departmentId: "d2" })
    const res = await adminGET(req("?evaluationPeriodId=p1"), params("d1", "fs1"))
    expect(res.status).toBe(404)
    expect(mockBuildSubjectWorkbook).not.toHaveBeenCalled()
  })

  it("the dean gets the same workbook", async () => {
    const res = await deanGET(req("?evaluationPeriodId=p1"), params("d1", "fs1"))
    expect(res.status).toBe(200)
    expect(mockBuildSubjectWorkbook).toHaveBeenCalledTimes(1)
  })

  it("the faculty gets it too — for their own subject", async () => {
    const res = await facultyGET(req("?evaluationPeriodId=p1"), facultyParams("fs1"))
    expect(res.status).toBe(200)
    expect(mockBuildSubjectWorkbook).toHaveBeenCalledTimes(1)
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
    expect(mockBuildSubjectWorkbook).not.toHaveBeenCalled()
  })
})

// ⭐ the department ZIP — the two routes that serve it. An API, not a button:
// the surface is its own slice.
describe("the department ZIP routes", () => {
  it("the admin gets the ZIP for the scope", async () => {
    const res = await adminDeptZipGET(req("?evaluationPeriodId=p1&departmentIds=d1"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/zip")
    expect(res.headers.get("content-disposition")).toContain("evaluation-results-p1.zip")
    // ⭐ the entries are the tree — the department summary, then the member →
    // the subject workbook, and the member's consolidated file
    const parts = readZip(new Uint8Array(await res.arrayBuffer()))
    expect([...parts.keys()]).toEqual([
      // ⭐ D30: the department summary is FIRST, at the folder's root
      "CCS/CCS_summary.xlsx",
      "CCS/Dela Cruz/IT101_BSCS-A_evaluation.xlsx",
      "CCS/Dela Cruz/Dela Cruz_summary.xlsx",
    ])
  })

  it("an empty scope resolves all departments — and an empty period is a 404", async () => {
    const res = await adminDeptZipGET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(404)
    expect(mockGetDepartmentList).toHaveBeenCalledWith("p1")
    expect(mockGetDepartmentResults).not.toHaveBeenCalled()
  })

  it("the period is required", async () => {
    const res = await adminDeptZipGET(req("?departmentIds=d1"))
    expect(res.status).toBe(400)
  })

  it("a non-admin is refused", async () => {
    mockRequireAdmin.mockResolvedValue(new Response("Forbidden", { status: 403 }))
    const res = await adminDeptZipGET(req("?evaluationPeriodId=p1&departmentIds=d1"))
    expect(res.status).toBe(403)
    expect(mockGetDepartmentResults).not.toHaveBeenCalled()
  })

  it("an unknown department is refused — the download must not quietly shrink", async () => {
    mockDeptRepo.findById.mockResolvedValue(null)
    const res = await adminDeptZipGET(req("?evaluationPeriodId=p1&departmentIds=d1"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("d1")
  })

  it("the size guard refuses loudly, with the count and the estimate", async () => {
    const many = Array.from({ length: 97 }, (_, i) => ({ ...DEPT_ROW, facultySubjectId: `fs${i}` }))
    mockGetDepartmentResults.mockResolvedValue({
      subjects: many,
      facultyAggregates: {},
      members: [{ id: "f1", name: "Dela Cruz", email: "d@x.com" }],
      departmentAggregate: null,
    })
    const res = await adminDeptZipGET(req("?evaluationPeriodId=p1&departmentIds=d1"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("97 subject-sections")
    expect(body.error).toContain("4.1 MB")
  })

  it("the dean gets their own department", async () => {
    const res = await deanDeptZipGET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    const parts = readZip(new Uint8Array(await res.arrayBuffer()))
    expect([...parts.keys()]).toContain("CCS/Dela Cruz/IT101_BSCS-A_evaluation.xlsx")
  })

  it("a foreign department is a 403 — the export is not a way around the read route's", async () => {
    const res = await deanDeptZipGET(req("?evaluationPeriodId=p1&departmentIds=d2"))
    expect(res.status).toBe(403)
    expect(mockGetDepartmentResults).not.toHaveBeenCalled()
  })

  it("the dean's period must be the active one", async () => {
    mockEvalResultRepo.assertPeriodIsActive.mockRejectedValue(
      new EvaluationPeriodInactiveError("Results for this period are not available", 403),
    )
    const res = await deanDeptZipGET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(403)
    expect(mockGetDepartmentResults).not.toHaveBeenCalled()
  })

  it("a dean without a department gets nothing", async () => {
    mockDeptRepo.findByDeanId.mockResolvedValue(null)
    const res = await deanDeptZipGET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(404)
  })
})
