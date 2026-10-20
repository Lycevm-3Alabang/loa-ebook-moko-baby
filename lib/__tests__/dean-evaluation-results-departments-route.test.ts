import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockDeptRepo = vi.hoisted(() => ({ findByDeanId: vi.fn() }))
const mockEvalResultRepo = vi.hoisted(() => ({
  assertPeriodIsActive: vi.fn(),
  getVisibilityMap: vi.fn(),
  listDepartmentAssignments: vi.fn(),
}))
const mockGetDeptResults = vi.hoisted(() => vi.fn())
const mockLogServerError = vi.hoisted(() => vi.fn())

// vi.mock factories are hoisted above the module body, so the error class has
// to be created inside vi.hoisted too.
const { MockEvaluationPeriodInactiveError } = vi.hoisted(() => {
  class MockEvaluationPeriodInactiveError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  }
  return { MockEvaluationPeriodInactiveError }
})

vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/utils/roles", () => ({ hasRole: mockHasRole }))
vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  evaluationResultRepository: mockEvalResultRepo,
}))
vi.mock("@/features/evaluation-results/evaluation-results.service", () => ({
  getDepartmentSubjectResults: mockGetDeptResults,
}))
vi.mock("@/features/evaluation-results/evaluation-results.repository", () => ({
  EvaluationPeriodInactiveError: MockEvaluationPeriodInactiveError,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET } from "@/app/api/dean/evaluation-results/departments/[departmentId]/route"

const DEPT = { id: "dept-1", name: "CCS", code: "CCS", deanId: "dean-1" }

function req(qs: string) {
  return new Request(`http://localhost/api/dean/evaluation-results/departments/dept-1${qs}`) as never
}

const params = (departmentId = "dept-1") => ({ params: Promise.resolve({ departmentId }) })

const subject = (facultyId: string, facultySubjectId: string) => ({
  facultySubjectId,
  facultyId,
  facultyName: "F",
  facultyEmail: "f@x",
  subjectId: "s1",
  subjectCode: "C",
  subjectName: "N",
  sectionProgram: null,
  sectionName: null,
  totalRespondents: 1,
  avgRating: 4,
  remarks: null,
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
})

beforeEach(() => {
  vi.resetAllMocks()
  mockAuth.mockResolvedValue({ user: { id: "dean-1", role: "DEAN" } })
  mockHasRole.mockReturnValue(true)
  mockDeptRepo.findByDeanId.mockResolvedValue(DEPT)
  mockEvalResultRepo.assertPeriodIsActive.mockResolvedValue(undefined)
  mockEvalResultRepo.getVisibilityMap.mockResolvedValue(new Map([["f1", true]]))
  mockGetDeptResults.mockResolvedValue({
    subjects: [subject("f1", "fs1")],
    facultyAggregates: { f1: { facultyId: "f1" } },
    departmentAggregate: { totalSubjects: 1, uniqueFaculty: 1, totalResponses: 1, avgRating: 4 },
  })
})

describe("GET /api/dean/evaluation-results/departments/[departmentId]", () => {
  it("returns 403 when not a dean", async () => {
    mockHasRole.mockReturnValue(false)
    const res = await GET(req("?evaluationPeriodId=p1"), params())
    expect(res.status).toBe(403)
  })

  it("returns 404 when the dean has no department", async () => {
    mockDeptRepo.findByDeanId.mockResolvedValue(null)
    const res = await GET(req("?evaluationPeriodId=p1"), params())
    expect(res.status).toBe(404)
  })

  it("returns 403 for another department's id", async () => {
    const res = await GET(req("?evaluationPeriodId=p1"), params("dept-other"))
    expect(res.status).toBe(403)
    expect(mockGetDeptResults).not.toHaveBeenCalled()
  })

  it("returns 400 when the period is missing", async () => {
    const res = await GET(req(""), params())
    expect(res.status).toBe(400)
  })

  it("returns the period's own status when the period is not active", async () => {
    mockEvalResultRepo.assertPeriodIsActive.mockRejectedValue(
      new MockEvaluationPeriodInactiveError("Results for this period are not available", 403),
    )
    const res = await GET(req("?evaluationPeriodId=p1"), params())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain("not available")
  })

  it("delegates to the shared service with the dean's own department", async () => {
    const res = await GET(req("?evaluationPeriodId=p1"), params())
    expect(res.status).toBe(200)
    expect(mockGetDeptResults).toHaveBeenCalledWith("p1", "dept-1")
  })

  it("returns the dean's own department, not a lookup of the path id", async () => {
    const res = await GET(req("?evaluationPeriodId=p1"), params())
    const body = await res.json()
    expect(body.department.id).toBe("dept-1")
    expect(body.department.name).toBe("CCS")
  })

  it("returns the subjects and the visibility map", async () => {
    const res = await GET(req("?evaluationPeriodId=p1"), params())
    const body = await res.json()
    expect(body.subjects).toHaveLength(1)
    expect(body.subjects[0].facultySubjectId).toBe("fs1")
    expect(body.visibilityMap).toEqual({ f1: true })
  })

  it("returns 403 when no result has been released", async () => {
    mockEvalResultRepo.getVisibilityMap.mockResolvedValue(new Map([["f1", false]]))
    const res = await GET(req("?evaluationPeriodId=p1"), params())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain("hasn't released results")
  })

  it("reads the release gate from the RESULTS, not from the roster", async () => {
    // A faculty who is visible but has no result in this period must not
    // release the page: the gate reads the returned subjects.
    mockEvalResultRepo.getVisibilityMap.mockResolvedValue(new Map([["f-noresults", true]]))
    mockGetDeptResults.mockResolvedValue({
      subjects: [subject("f1", "fs1")],
      facultyAggregates: {},
      departmentAggregate: { totalSubjects: 1, uniqueFaculty: 1, totalResponses: 1, avgRating: 4 },
    })
    const res = await GET(req("?evaluationPeriodId=p1"), params())
    expect(res.status).toBe(403)
  })

  it("does not release the page for a subject with no responses", async () => {
    // A member's subject that nobody answered is a row, not a result: it
    // cannot release the page.
    mockEvalResultRepo.getVisibilityMap.mockResolvedValue(new Map([["f1", true]]))
    mockGetDeptResults.mockResolvedValue({
      subjects: [{ ...subject("f1", "fs1"), totalRespondents: 0 }],
      facultyAggregates: {},
      departmentAggregate: { totalSubjects: 1, uniqueFaculty: 1, totalResponses: 0, avgRating: null },
    })
    const res = await GET(req("?evaluationPeriodId=p1"), params())
    expect(res.status).toBe(403)
  })

  it("releases the page when a result's faculty is visible", async () => {
    mockEvalResultRepo.getVisibilityMap.mockResolvedValue(new Map([["f1", true]]))
    const res = await GET(req("?evaluationPeriodId=p1"), params())
    expect(res.status).toBe(200)
  })
})
