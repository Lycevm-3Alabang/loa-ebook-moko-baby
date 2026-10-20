import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockEvalResultRepo = vi.hoisted(() => ({
  listLiveDeptAverages: vi.fn(),
  listAttributionWarnings: vi.fn(),
  listDepartmentRosters: vi.fn(),
}))
const mockEvalRepo = vi.hoisted(() => ({
  listSubmittedWithSentiment: vi.fn(),
}))
const mockDeptRepo = vi.hoisted(() => ({
  listAll: vi.fn(),
}))
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/route-guard", () => ({ requireAdmin: mockRequireAdmin }))
vi.mock("@/lib/repositories/factory", () => ({
  evaluationResultRepository: mockEvalResultRepo,
  evaluationRepository: mockEvalRepo,
  departmentRepository: mockDeptRepo,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET } from "@/app/api/admin/evaluation-results/route"

function req(qs: string) {
  return new Request(`http://localhost/api/admin/evaluation-results${qs}`) as never
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue(null)
  mockEvalResultRepo.listAttributionWarnings.mockResolvedValue({
    unattributed: { count: 0, faculty: [] },
    offSemester: { count: 0, faculty: [] },
  })
  mockEvalResultRepo.listDepartmentRosters.mockResolvedValue({})
})

describe("GET /api/admin/evaluation-results", () => {
  it("returns 400 when evaluationPeriodId missing", async () => {
    const res = await GET(req(""))
    expect(res.status).toBe(400)
    expect(mockEvalResultRepo.listLiveDeptAverages).not.toHaveBeenCalled()
  })

  it("returns 403 when not admin", async () => {
    mockRequireAdmin.mockResolvedValue(new Response("Forbidden", { status: 403 }))
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(403)
  })

  it("renders the live department figures without touching the cache", async () => {
    mockEvalRepo.listSubmittedWithSentiment.mockResolvedValue([])
    mockEvalResultRepo.listLiveDeptAverages.mockResolvedValue([
      { departmentId: "d1", facultyIds: ["f1"], totalRespondents: 5, avgRating: 4, remarks: "Very Satisfactory", catAverages: {}, highestRubrics: [], lowestRubrics: [] },
    ])
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])

    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.departments).toHaveLength(1)
    expect(body.departments[0].avgRating).toBe(4)
  })

  it("returns empty departments when no live averages", async () => {
    mockEvalRepo.listSubmittedWithSentiment.mockResolvedValue([])
    mockEvalResultRepo.listLiveDeptAverages.mockResolvedValue([])
    mockDeptRepo.listAll.mockResolvedValue([])

    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.departments).toEqual([])
  })

  it("attaches per-department sentiment from comments", async () => {
    mockEvalRepo.listSubmittedWithSentiment.mockResolvedValue([
      { evaluateeId: "f1", sentimentScore: 0.5 },
      { evaluateeId: "f1", sentimentScore: 0.25 },
    ])
    mockEvalResultRepo.listLiveDeptAverages.mockResolvedValue([
      { departmentId: "d1", facultyIds: ["f1"], totalRespondents: 2, avgRating: 4, remarks: null, catAverages: {}, highestRubrics: [], lowestRubrics: [] },
    ])
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])

    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.departments[0].sentimentScore).toBe(0.38) // (0.5+0.25)/2 rounded
  })

  it("excludes comments from faculty outside the department", async () => {    mockEvalRepo.listSubmittedWithSentiment.mockResolvedValue([
      { evaluateeId: "f1", sentimentScore: 0.1 },
      { evaluateeId: "f1", sentimentScore: 0.1 },
      { evaluateeId: "f1", sentimentScore: 0.1 },
      { evaluateeId: "f2", sentimentScore: 0.9 },
    ])
    mockEvalResultRepo.listLiveDeptAverages.mockResolvedValue([
      { departmentId: "d1", facultyIds: ["f1"], totalRespondents: 2, avgRating: 4, remarks: null, catAverages: {}, highestRubrics: [], lowestRubrics: [] },
    ])
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])

    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    // f2 is not in this department: only f1's three comments (0.1) count.
    expect(body.departments[0].sentimentScore).toBe(0.1)
  })

  it("pools the department's comment sentiment instead of averaging per-faculty averages", async () => {
    mockEvalRepo.listSubmittedWithSentiment.mockResolvedValue([
      { evaluateeId: "f1", sentimentScore: 0.1 },
      { evaluateeId: "f1", sentimentScore: 0.1 },
      { evaluateeId: "f1", sentimentScore: 0.1 },
      { evaluateeId: "f2", sentimentScore: 0.9 },
    ])
    mockEvalResultRepo.listLiveDeptAverages.mockResolvedValue([
      { departmentId: "d1", facultyIds: ["f1", "f2"], totalRespondents: 4, avgRating: 4, remarks: null, catAverages: {}, highestRubrics: [], lowestRubrics: [] },
    ])
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])

    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    // mean of the two faculty averages would be 0.50; pooled over the comments = 0.30
    expect(body.departments[0].sentimentScore).toBe(0.3)
  })

  it("reports the unattributed pseudo-department as a warning, not as a row", async () => {
    mockEvalRepo.listSubmittedWithSentiment.mockResolvedValue([])
    mockEvalResultRepo.listLiveDeptAverages.mockResolvedValue([
      { departmentId: "d1", facultyIds: ["f1"], totalRespondents: 2, avgRating: 4, remarks: null, catAverages: {}, highestRubrics: [], lowestRubrics: [] },
      { departmentId: "__unknown__", facultyIds: ["f9"], totalRespondents: 1, avgRating: 3, remarks: null, catAverages: {}, highestRubrics: [], lowestRubrics: [] },
    ])
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])
    mockEvalResultRepo.listAttributionWarnings.mockResolvedValue({
      unattributed: { count: 1, faculty: [{ id: "f9", name: "Ana" }] },
      offSemester: { count: 0, faculty: [] },
    })

    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.departments.map((d: { departmentId: string }) => d.departmentId)).toEqual(["d1"])
    expect(body.warnings.unattributed.count).toBe(1)
    expect(body.warnings.unattributed.faculty[0].name).toBe("Ana")
  })

  it("returns no warnings when every evaluation is attributed", async () => {
    mockEvalRepo.listSubmittedWithSentiment.mockResolvedValue([])
    mockEvalResultRepo.listLiveDeptAverages.mockResolvedValue([
      { departmentId: "d1", facultyIds: ["f1"], totalRespondents: 2, avgRating: 4, remarks: null, catAverages: {}, highestRubrics: [], lowestRubrics: [] },
    ])
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])

    const res = await GET(req("?evaluationPeriodId=p1"))
    const body = await res.json()
    expect(body.warnings.unattributed.count).toBe(0)
    expect(body.warnings.offSemester.count).toBe(0)
  })

  it("counts the faculty who got no responses in the department's faculty total", async () => {
    mockEvalRepo.listSubmittedWithSentiment.mockResolvedValue([])
    mockEvalResultRepo.listLiveDeptAverages.mockResolvedValue([
      { departmentId: "d1", facultyIds: ["f1"], totalRespondents: 2, avgRating: 4, remarks: null, catAverages: {}, highestRubrics: [], lowestRubrics: [] },
    ])
    mockEvalResultRepo.listDepartmentRosters.mockResolvedValue({
      d1: [{ id: "f2", name: "Ben" }, { id: "f3", name: "Cara" }],
    })
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])

    const res = await GET(req("?evaluationPeriodId=p1"))
    const body = await res.json()
    expect(body.departments[0].facultyCount).toBe(3)
    expect(body.departments[0].noResponses).toEqual([
      { id: "f2", name: "Ben" },
      { id: "f3", name: "Cara" },
    ])
  })
})
