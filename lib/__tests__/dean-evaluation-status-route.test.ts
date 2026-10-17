import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockDeptRepo = vi.hoisted(() => ({ findByDeanId: vi.fn() }))
const mockFsRepo = vi.hoisted(() => ({ findByIdWithEmbeds: vi.fn() }))
const mockGetDetail = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/utils/roles", () => ({ hasRole: mockHasRole }))
vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  facultySubjectRepository: mockFsRepo,
}))
vi.mock("@/features/evaluations/evaluation-status.service", () => ({
  getEvaluationStatusDetail: mockGetDetail,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: vi.fn() }))

import { GET } from "@/app/api/dean/evaluation-status/route"

function req(qs: string) { return new Request(`http://localhost/api/dean/evaluation-status${qs}`) as never }

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

  it("returns 400 when params missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(400)
  })

  it("returns 403 when fs belongs to another department", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    mockDeptRepo.findByDeanId.mockResolvedValue({ id: "dept-1" })
    mockFsRepo.findByIdWithEmbeds.mockResolvedValue({ id: "fs1", faculty: { departmentId: "dept-2" } })
    const res = await GET(req("?evaluationPeriodId=p1&facultySubjectId=fs1"))
    expect(res.status).toBe(403)
    expect(mockGetDetail).not.toHaveBeenCalled()
  })

  it("returns 403 when dean has no department", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    mockDeptRepo.findByDeanId.mockResolvedValue(null)
    const res = await GET(req("?evaluationPeriodId=p1&facultySubjectId=fs1"))
    expect(res.status).toBe(403)
  })

  it("returns detail when fs belongs to dean's department", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    mockDeptRepo.findByDeanId.mockResolvedValue({ id: "dept-1" })
    mockFsRepo.findByIdWithEmbeds.mockResolvedValue({ id: "fs1", faculty: { departmentId: "dept-1" } })
    mockGetDetail.mockResolvedValue({ facultySubjectId: "fs1", participated: [], notParticipated: [], disputed: [], inProgress: [] })
    const res = await GET(req("?evaluationPeriodId=p1&facultySubjectId=fs1"))
    expect(res.status).toBe(200)
    expect(mockGetDetail).toHaveBeenCalledWith("p1", "fs1")
  })
})
