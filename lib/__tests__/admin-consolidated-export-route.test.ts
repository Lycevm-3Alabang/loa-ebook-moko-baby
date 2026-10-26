import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockGetDepartmentResults = vi.hoisted(() => vi.fn())
const mockBuildConsolidatedZip = vi.hoisted(() => vi.fn())
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/route-guard", () => ({ requireAdmin: mockRequireAdmin }))
// ⭐ department-zip (for the verdict) imports the factory and the service, so
// the mocks cover their imports even though this test never calls them
vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: { findById: vi.fn(), listAll: vi.fn() },
  evaluationPeriodRepository: { findById: vi.fn() },
  rubricRepository: { getCategoriesWithItems: vi.fn() },
}))
vi.mock("@/features/evaluation-results/evaluation-results.service", () => ({
  getDepartmentResults: mockGetDepartmentResults,
  getDepartmentSubjectResults: vi.fn(),
  getSubjectResultSet: vi.fn(),
}))
vi.mock("@/features/evaluation-results/consolidated-zip", () => ({
  buildConsolidatedFacultyZip: mockBuildConsolidatedZip,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET } from "@/app/api/admin/evaluation-results/export/consolidated/route"

function req(qs: string) {
  return new Request(
    `http://localhost/api/admin/evaluation-results/export/consolidated${qs}`,
  ) as never
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue(null)
  mockGetDepartmentResults.mockResolvedValue({
    departments: [{ departmentId: "d1" }],
    warnings: {},
  })
  mockBuildConsolidatedZip.mockResolvedValue({
    ok: true,
    bytes: new Uint8Array([80, 75, 3, 4]),
    failures: [],
    count: 1,
  })
})

describe("GET /api/admin/evaluation-results/export/consolidated", () => {
  it("returns 400 when the period is missing", async () => {
    const res = await GET(req(""))
    expect(res.status).toBe(400)
    expect(mockGetDepartmentResults).not.toHaveBeenCalled()
    expect(mockBuildConsolidatedZip).not.toHaveBeenCalled()
  })

  it("returns 403 when not admin", async () => {
    mockRequireAdmin.mockResolvedValue(new Response("Forbidden", { status: 403 }))
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(403)
  })

  it("returns the ZIP with the consolidated filename", async () => {
    const res = await GET(req("?evaluationPeriodId=p1&departmentIds=d1&facultyIds=f1"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/zip")
    expect(res.headers.get("content-disposition")).toContain(
      "evaluation-results-consolidated-p1.zip",
    )
    const buffer = await res.arrayBuffer()
    expect(buffer.byteLength).toBeGreaterThan(0)
    expect(mockBuildConsolidatedZip).toHaveBeenCalledWith({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
      facultyIds: ["f1"],
    })
  })

  it("expands an empty department scope — the whole department", async () => {
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    expect(mockGetDepartmentResults).toHaveBeenCalledWith("p1")
    expect(mockBuildConsolidatedZip).toHaveBeenCalledWith({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
      facultyIds: undefined,
    })
  })

  it("returns 404 when the period has no departments", async () => {
    mockGetDepartmentResults.mockResolvedValue({ departments: [], warnings: {} })
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(404)
    expect(mockBuildConsolidatedZip).not.toHaveBeenCalled()
  })

  it("returns the verdict's refusal, not a quiet ZIP", async () => {
    mockBuildConsolidatedZip.mockResolvedValue({
      ok: false,
      reason: "unknown-faculty",
      facultyId: "f9",
      departmentId: "d1",
    })
    const res = await GET(req("?evaluationPeriodId=p1&departmentIds=d1&facultyIds=f9"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("f9")
    expect(body.error).toContain("d1")
  })
})
