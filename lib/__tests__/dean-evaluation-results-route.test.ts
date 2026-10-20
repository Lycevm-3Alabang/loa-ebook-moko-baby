import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockDeptRepo = vi.hoisted(() => ({
  findByDeanId: vi.fn(),
  listAll: vi.fn(),
}))
const mockEvalResultRepo = vi.hoisted(() => ({
  listLiveDeptAverages: vi.fn(),
  listAttributionWarnings: vi.fn(),
  listDepartmentRosters: vi.fn(),
}))
const mockEvalRepo = vi.hoisted(() => ({
  listSubmittedWithSentiment: vi.fn(),
}))
const mockUserRepo = vi.hoisted(() => ({
  listByRole: vi.fn(),
}))
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/utils/roles", () => ({ hasRole: mockHasRole }))
vi.mock("@/lib/route-guard", () => ({ requireAdmin: mockRequireAdmin }))
vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  evaluationResultRepository: mockEvalResultRepo,
  evaluationRepository: mockEvalRepo,
  userRepository: mockUserRepo,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET as DeanGET } from "@/app/api/dean/evaluation-results/route"
import { GET as AdminGET } from "@/app/api/admin/evaluation-results/route"

function req(qs: string) {
  return new Request(`http://localhost/api/dean/evaluation-results${qs}`) as never
}

const DEPT = { id: "dept-1", name: "CCS", code: "CCS", deanId: "dean-1" }

const LIVE_AVG = {
  departmentId: "dept-1",
  facultyIds: ["f1", "f2"],
  totalRespondents: 7,
  avgRating: 4.2,
  remarks: "Very Satisfactory",
  catAverages: {},
  highestRubrics: [],
  lowestRubrics: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  mockAuth.mockResolvedValue({ user: { id: "dean-1", role: "DEAN" } })
  mockHasRole.mockReturnValue(true)
  mockRequireAdmin.mockResolvedValue(null)
  mockDeptRepo.findByDeanId.mockResolvedValue(DEPT)
  mockDeptRepo.listAll.mockResolvedValue([DEPT])
  mockEvalResultRepo.listLiveDeptAverages.mockResolvedValue([LIVE_AVG])
  mockEvalResultRepo.listAttributionWarnings.mockResolvedValue({
    unattributed: { count: 0, faculty: [] },
    offSemester: { count: 0, faculty: [] },
  })
  mockEvalResultRepo.listDepartmentRosters.mockResolvedValue({})
  mockUserRepo.listByRole.mockResolvedValue([
    { id: "f1", name: "Ana", email: "ana@x", departmentId: "dept-1", role: "FACULTY" },
    { id: "f2", name: "Ben", email: "ben@x", departmentId: "dept-1", role: "FACULTY" },
  ])
  mockEvalRepo.listSubmittedWithSentiment.mockResolvedValue([
    { evaluateeId: "f1", sentimentScore: 0.5 },
    { evaluateeId: "f2", sentimentScore: 0.1 },
  ])
})

describe("GET /api/dean/evaluation-results", () => {
  it("returns 403 when not a dean", async () => {
    mockHasRole.mockReturnValue(false)
    const res = await DeanGET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(403)
  })

  it("returns 400 when the period is missing", async () => {
    const res = await DeanGET(req(""))
    expect(res.status).toBe(400)
  })

  it("returns the pooled department figures for the dean's own department", async () => {
    const res = await DeanGET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.departments).toHaveLength(1)
    expect(body.departments[0].avgRating).toBe(4.2)
    expect(body.departments[0].remarks).toBe("Very Satisfactory")
    expect(body.departments[0].totalRespondents).toBe(7)
    expect(body.departments[0].facultyCount).toBe(2)
    expect(body.departments[0].sentimentScore).toBe(0.3)
  })

  it("returns the same figures the admin route returns for the same department", async () => {
    const deanRes = await DeanGET(req("?evaluationPeriodId=p1"))
    const deanBody = await deanRes.json()

    const adminRes = await AdminGET(req("?evaluationPeriodId=p1"))
    const adminBody = await adminRes.json()

    const adminDept = adminBody.departments.find(
      (d: { departmentId: string }) => d.departmentId === "dept-1",
    )
    expect(deanBody.departments[0]).toEqual(adminDept)
  })

  it("returns no department when the period has no live figures for it", async () => {
    mockEvalResultRepo.listLiveDeptAverages.mockResolvedValue([])
    const res = await DeanGET(req("?evaluationPeriodId=p1"))
    const body = await res.json()
    expect(body.departments).toEqual([])
  })
})
