import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockEvalResultRepo = vi.hoisted(() => ({ setVisibility: vi.fn() }))
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/route-guard", () => ({ requireAdmin: mockRequireAdmin }))
vi.mock("@/lib/repositories/factory", () => ({
  evaluationResultRepository: mockEvalResultRepo,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { POST } from "@/app/api/admin/evaluation-results/visibility/route"

function body(payload: unknown) {
  return new Request("http://localhost/api/admin/evaluation-results/visibility", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as never
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue(null)
  mockEvalResultRepo.setVisibility.mockResolvedValue(undefined)
})

describe("POST /api/admin/evaluation-results/visibility", () => {
  it("returns 403 when not admin", async () => {
    mockRequireAdmin.mockResolvedValue(new Response("Forbidden", { status: 403 }))
    const res = await POST(body({ evaluationPeriodId: "p1", facultyIds: ["f1"], visible: true }))
    expect(res.status).toBe(403)
  })

  it("returns 400 when the period or the faculty list is missing", async () => {
    const noPeriod = await POST(body({ facultyIds: ["f1"], visible: true }))
    expect(noPeriod.status).toBe(400)
    const noFaculty = await POST(body({ evaluationPeriodId: "p1", facultyIds: [], visible: true }))
    expect(noFaculty.status).toBe(400)
  })

  it("returns 400 for a semester id: the row is keyed by evaluation_period_id", async () => {
    const res = await POST(body({ semesterId: "s1", facultyIds: ["f1"], visible: true }))
    expect(res.status).toBe(400)
    expect(mockEvalResultRepo.setVisibility).not.toHaveBeenCalled()
  })

  it("writes the visibility for the given period", async () => {
    const res = await POST(body({ evaluationPeriodId: "p1", facultyIds: ["f1", "f2"], visible: false }))
    expect(res.status).toBe(200)
    expect(mockEvalResultRepo.setVisibility).toHaveBeenCalledWith("p1", ["f1", "f2"], false)
  })
})
