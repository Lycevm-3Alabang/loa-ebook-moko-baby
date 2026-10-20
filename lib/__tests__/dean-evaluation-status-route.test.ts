import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockDeptRepo = vi.hoisted(() => ({ findByDeanId: vi.fn() }))
const mockFsRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockEvalResultRepo = vi.hoisted(() => ({ buildSubjectContext: vi.fn() }))
const mockGetDetail = vi.hoisted(() => vi.fn())
const mockGetStatus = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/utils/roles", () => ({ hasRole: mockHasRole }))
vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  facultySubjectRepository: mockFsRepo,
  evaluationResultRepository: mockEvalResultRepo,
}))
vi.mock("@/features/evaluations/evaluation-status.service", () => ({
  getEvaluationStatusDetail: mockGetDetail,
  getEvaluationStatus: mockGetStatus,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: vi.fn() }))

import { GET } from "@/app/api/dean/evaluation-status/route"

function req(qs: string) { return new Request(`http://localhost/api/dean/evaluation-status${qs}`) as never }

/** A resolution context where the section "sec1" belongs to the given department. */
function ctxFor(deptId: string) {
  return {
    userDept: new Map<string, string | null>([["f1", null]]),
    sections: new Map<string, string | null>([["sec1", "dc1"]]),
    departmentCourses: new Map<string, string | null>([["dc1", deptId]]),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("GET /api/dean/evaluation-status", () => {
  it("returns 403 when not dean", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "FACULTY" } })
    mockHasRole.mockReturnValue(false)
    const res = await GET(req("?evaluationPeriodId=p1&facultySubjectId=fs1"))
    expect(res.status).toBe(403)
  })

  it("returns 403 when no session", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(req("?evaluationPeriodId=p1&facultySubjectId=fs1"))
    expect(res.status).toBe(403)
  })

  it("returns 400 when the period is missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    const res = await GET(req(""))
    expect(res.status).toBe(400)
  })

  it("returns the dean's own department coverage, scoped", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    mockDeptRepo.findByDeanId.mockResolvedValue({ id: "dept-1" })
    mockGetStatus.mockResolvedValue({ departments: [{ departmentId: "dept-1" }], subjects: [] })

    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    expect(mockGetStatus).toHaveBeenCalledWith("p1", undefined, "dept-1")
  })

  it("returns 403 when the subject's teacher has no home department", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    mockDeptRepo.findByDeanId.mockResolvedValue({ id: "dept-1" })
    mockFsRepo.findById.mockResolvedValue({ id: "fs1", faculty_id: "f1", section_id: "sec1" })
    // f1 has no home: the subject is unattributed, whoever owns the section.
    mockEvalResultRepo.buildSubjectContext.mockResolvedValue(ctxFor("dept-1"))
    const res = await GET(req("?evaluationPeriodId=p1&facultySubjectId=fs1"))
    expect(res.status).toBe(403)
    expect(mockGetDetail).not.toHaveBeenCalled()
  })

  it("returns 404 when the assignment does not exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    mockDeptRepo.findByDeanId.mockResolvedValue({ id: "dept-1" })
    mockFsRepo.findById.mockResolvedValue(null)
    const res = await GET(req("?evaluationPeriodId=p1&facultySubjectId=fs1"))
    expect(res.status).toBe(404)
    expect(mockGetDetail).not.toHaveBeenCalled()
  })

  it("returns 403 when dean has no department", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    mockDeptRepo.findByDeanId.mockResolvedValue(null)
    const res = await GET(req("?evaluationPeriodId=p1&facultySubjectId=fs1"))
    expect(res.status).toBe(403)
  })

  it("returns detail when the subject's teacher is the dean's", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    mockDeptRepo.findByDeanId.mockResolvedValue({ id: "dept-1" })
    mockFsRepo.findById.mockResolvedValue({ id: "fs1", faculty_id: "f1", section_id: "sec1" })
    // f1 is homed in the dean's own department: the subject is theirs.
    mockEvalResultRepo.buildSubjectContext.mockResolvedValue({
      ...ctxFor("dept-1"),
      userDept: new Map<string, string | null>([["f1", "dept-1"]]),
    })
    mockGetDetail.mockResolvedValue({ facultySubjectId: "fs1", participated: [], notParticipated: [], disputed: [], inProgress: [] })
    const res = await GET(req("?evaluationPeriodId=p1&facultySubjectId=fs1"))
    expect(res.status).toBe(200)
    expect(mockGetDetail).toHaveBeenCalledWith("p1", "fs1")
  })

  it("refuses a subject whose teacher is homed in another department", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    mockDeptRepo.findByDeanId.mockResolvedValue({ id: "dept-1" })
    mockFsRepo.findById.mockResolvedValue({ id: "fs1", faculty_id: "f1", section_id: "sec1" })
    // f1 is homed in dept-other; the section belongs to dept-1. The teacher's
    // own department owns the subject, so this is not the dean's to open.
    mockEvalResultRepo.buildSubjectContext.mockResolvedValue({
      ...ctxFor("dept-1"),
      userDept: new Map([["f1", "dept-other"]]),
    })
    mockGetDetail.mockResolvedValue({ facultySubjectId: "fs1", participated: [], notParticipated: [], disputed: [], inProgress: [] })
    const res = await GET(req("?evaluationPeriodId=p1&facultySubjectId=fs1"))
    expect(res.status).toBe(403)
  })
})
