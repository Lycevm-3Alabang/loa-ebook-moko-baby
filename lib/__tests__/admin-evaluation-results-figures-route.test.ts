import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockGetCachedDepartmentFigures = vi.hoisted(() => vi.fn())
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/route-guard", () => ({ requireAdmin: mockRequireAdmin }))
vi.mock("@/features/evaluation-results/figure-cache", () => ({
  getCachedDepartmentFigures: mockGetCachedDepartmentFigures,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET } from "@/app/api/admin/evaluation-results/figures/route"

function req(qs: string) {
  return new Request(`http://localhost/api/admin/evaluation-results/figures${qs}`) as never
}

const FIGURES = {
  departmentId: "d1",
  totalRespondents: 5,
  avgRating: 4.2,
  remarks: "Very Satisfactory",
  highestRubrics: [{ key: "professionalManner", label: "Professional Manner", score: 4.5 }],
  lowestRubrics: [],
  sentimentScore: 0.3,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue(null)
  mockGetCachedDepartmentFigures.mockResolvedValue({
    figures: FIGURES,
    readAt: new Date("2026-10-21T10:00:00Z").getTime(),
  })
})

describe("GET /api/admin/evaluation-results/figures", () => {
  it("returns 400 when the period or the department is missing", async () => {
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(400)
    expect(mockGetCachedDepartmentFigures).not.toHaveBeenCalled()
  })

  it("returns 403 when not admin", async () => {
    mockRequireAdmin.mockResolvedValue(new Response("Forbidden", { status: 403 }))
    const res = await GET(req("?evaluationPeriodId=p1&departmentId=d1"))
    expect(res.status).toBe(403)
  })

  it("returns the department's figures with the time they were read", async () => {
    const res = await GET(req("?evaluationPeriodId=p1&departmentId=d1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ...FIGURES, cachedAt: "2026-10-21T10:00:00.000Z" })
    expect(mockGetCachedDepartmentFigures).toHaveBeenCalledWith("d1", "p1", false)
  })

  it("reads the figures again when the refresh is asked for", async () => {
    await GET(req("?evaluationPeriodId=p1&departmentId=d1&refresh=1"))
    expect(mockGetCachedDepartmentFigures).toHaveBeenCalledWith("d1", "p1", true)
  })

  it("returns 500 when the read fails", async () => {
    mockGetCachedDepartmentFigures.mockRejectedValue(new Error("boom"))
    const res = await GET(req("?evaluationPeriodId=p1&departmentId=d1"))
    expect(res.status).toBe(500)
    expect(mockLogServerError).toHaveBeenCalled()
  })
})
