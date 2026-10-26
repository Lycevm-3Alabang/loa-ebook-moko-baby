import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockDeptRepo = vi.hoisted(() => ({ findByDeanId: vi.fn() }))
const mockEvalResultRepo = vi.hoisted(() => ({ assertPeriodIsActive: vi.fn() }))
const mockBuildConsolidatedZip = vi.hoisted(() => vi.fn())
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/utils/roles", () => ({ hasRole: mockHasRole }))
// department-zip (for the verdict) imports these too
vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  evaluationResultRepository: mockEvalResultRepo,
  evaluationPeriodRepository: { findById: vi.fn() },
  rubricRepository: { getCategoriesWithItems: vi.fn() },
}))
vi.mock("@/features/evaluation-results/evaluation-results.service", () => ({
  getDepartmentSubjectResults: vi.fn(),
  getSubjectResultSet: vi.fn(),
}))
// ⭐ the mock mirrors the real class: the status comes from the throw site, and
// the route answers with it
vi.mock("@/features/evaluation-results/evaluation-results.repository", () => ({
  EvaluationPeriodInactiveError: class extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))
vi.mock("@/features/evaluation-results/consolidated-zip", () => ({
  buildConsolidatedFacultyZip: mockBuildConsolidatedZip,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET } from "@/app/api/dean/evaluation-results/export/consolidated/route"
import { EvaluationPeriodInactiveError } from "@/features/evaluation-results/evaluation-results.repository"

function req(qs: string) {
  return new Request(
    `http://localhost/api/dean/evaluation-results/export/consolidated${qs}`,
  ) as never
}

beforeEach(() => {
  vi.resetAllMocks()
  mockAuth.mockResolvedValue({
    user: { id: "u1", role: "DEAN", email: "dean@x.edu.ph" },
  })
  mockHasRole.mockReturnValue(true)
  mockDeptRepo.findByDeanId.mockResolvedValue({
    id: "d1",
    name: "Computer Studies",
    code: "CCS",
  })
  mockEvalResultRepo.assertPeriodIsActive.mockResolvedValue(undefined)
  mockBuildConsolidatedZip.mockResolvedValue({
    ok: true,
    bytes: new Uint8Array([80, 75, 3, 4]),
    failures: [],
    count: 1,
  })
})

describe("GET /api/dean/evaluation-results/export/consolidated", () => {
  it("returns 403 when the session is not a DEAN", async () => {
    mockHasRole.mockReturnValue(false)
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(403)
    expect(mockBuildConsolidatedZip).not.toHaveBeenCalled()
  })

  it("returns 400 when the period is missing", async () => {
    const res = await GET(req(""))
    expect(res.status).toBe(400)
  })

  it("returns 404 when the dean has no department", async () => {
    mockDeptRepo.findByDeanId.mockResolvedValue(null)
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(404)
  })

  it("refuses a foreign department — it must not quietly shrink", async () => {
    const res = await GET(req("?evaluationPeriodId=p1&departmentIds=d2"))
    expect(res.status).toBe(403)
    expect(mockBuildConsolidatedZip).not.toHaveBeenCalled()
  })

  it("returns the ZIP for the dean's own department", async () => {
    const res = await GET(req("?evaluationPeriodId=p1&facultyIds=f1"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/zip")
    expect(res.headers.get("content-disposition")).toContain(
      "evaluation-results-consolidated-p1.zip",
    )
    expect(mockEvalResultRepo.assertPeriodIsActive).toHaveBeenCalledWith("p1")
    expect(mockBuildConsolidatedZip).toHaveBeenCalledWith({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
      facultyIds: ["f1"],
    })
  })

  it("an empty selected set means the whole department", async () => {
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    expect(mockBuildConsolidatedZip).toHaveBeenCalledWith({
      evaluationPeriodId: "p1",
      departmentIds: ["d1"],
      facultyIds: undefined,
    })
  })

  it("an inactive period answers with its own status and message", async () => {
    mockEvalResultRepo.assertPeriodIsActive.mockRejectedValue(
      new EvaluationPeriodInactiveError("Results for this period are not available", 403),
    )
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain("not available")
    expect(mockBuildConsolidatedZip).not.toHaveBeenCalled()
  })
})
