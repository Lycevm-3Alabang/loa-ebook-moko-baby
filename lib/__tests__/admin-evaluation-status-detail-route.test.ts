import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockGetDetail = vi.hoisted(() => vi.fn())
const mockGetStatus = vi.hoisted(() => vi.fn())

vi.mock("@/lib/route-guard", () => ({ requireAdmin: mockRequireAdmin }))
vi.mock("@/features/evaluations/evaluation-status.service", () => ({
  getEvaluationStatus: mockGetStatus,
  getEvaluationStatusDetail: mockGetDetail,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: vi.fn() }))

import { GET } from "@/app/api/admin/evaluation-status/route"

function req(qs: string) { return new Request(`http://localhost/api/admin/evaluation-status${qs}`) as never }

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue(null)
})

describe("GET /api/admin/evaluation-status (detail)", () => {
  it("returns 400 when evaluationPeriodId missing", async () => {
    const res = await GET(req("?facultySubjectId=fs1"))
    expect(res.status).toBe(400)
    expect(mockGetDetail).not.toHaveBeenCalled()
  })

  it("returns 403 when not admin", async () => {
    mockRequireAdmin.mockResolvedValue(new Response("Forbidden", { status: 403 }))
    const res = await GET(req("?evaluationPeriodId=p1&facultySubjectId=fs1"))
    expect(res.status).toBe(403)
  })

  it("returns detail buckets when facultySubjectId provided", async () => {
    mockGetDetail.mockResolvedValue({
      facultySubjectId: "fs1",
      participated: [{ id: "s1", name: "Alice", email: "a@x.com" }],
      notParticipated: [{ id: "s2", name: "Bob", email: "b@x.com" }],
      disputed: [],
      inProgress: [],
    })
    const res = await GET(req("?evaluationPeriodId=p1&facultySubjectId=fs1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.participated).toHaveLength(1)
    expect(body.notParticipated).toHaveLength(1)
    expect(mockGetDetail).toHaveBeenCalledWith("p1", "fs1")
  })

  it("falls through to counts when no facultySubjectId", async () => {
    mockGetStatus.mockResolvedValue({ departments: [], subjects: [] })
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    expect(mockGetStatus).toHaveBeenCalledWith("p1", undefined)
    expect(mockGetDetail).not.toHaveBeenCalled()
  })
})
