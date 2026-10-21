import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockDeptRepo = vi.hoisted(() => ({ findByDeanId: vi.fn() }))
const mockEvalResultRepo = vi.hoisted(() => ({
  setVisibility: vi.fn(),
}))
const mockGetMembers = vi.hoisted(() => vi.fn())
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/utils/roles", () => ({ hasRole: mockHasRole }))
vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  evaluationResultRepository: mockEvalResultRepo,
}))
vi.mock("@/features/evaluation-results/evaluation-results.service", () => ({
  getDepartmentMembers: mockGetMembers,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { POST } from "@/app/api/dean/evaluation-results/visibility/route"

const DEPT = { id: "dept-1", name: "CCS", code: "CCS", deanId: "dean-1" }

function body(payload: unknown) {
  return new Request("http://localhost/api/dean/evaluation-results/visibility", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as never
}

const member = (facultyId: string) => ({ id: facultyId, name: "F", email: "f@x", departmentId: "dept-1" })

beforeEach(() => {
  vi.resetAllMocks()
  mockAuth.mockResolvedValue({ user: { id: "dean-1", role: "DEAN" } })
  mockHasRole.mockReturnValue(true)
  mockDeptRepo.findByDeanId.mockResolvedValue(DEPT)
  mockGetMembers.mockResolvedValue([member("f1"), member("f2")])
  mockEvalResultRepo.setVisibility.mockResolvedValue(undefined)
})

describe("POST /api/dean/evaluation-results/visibility", () => {
  it("returns 403 when not a dean", async () => {
    mockHasRole.mockReturnValue(false)
    const res = await POST(body({ evaluationPeriodId: "p1", facultyIds: ["f1"], visible: true }))
    expect(res.status).toBe(403)
  })

  it("returns 400 when the period or the faculty list is missing", async () => {
    const noPeriod = await POST(body({ facultyIds: ["f1"], visible: true }))
    expect(noPeriod.status).toBe(400)
    const noFaculty = await POST(body({ evaluationPeriodId: "p1", facultyIds: [], visible: true }))
    expect(noFaculty.status).toBe(400)
  })

  it("returns 400 for a semester id: the write path is keyed by the period", async () => {
    const res = await POST(body({ semesterId: "s1", facultyIds: ["f1"], visible: true }))
    expect(res.status).toBe(400)
    expect(mockEvalResultRepo.setVisibility).not.toHaveBeenCalled()
  })

  it("returns 404 when the dean has no department", async () => {
    mockDeptRepo.findByDeanId.mockResolvedValue(null)
    const res = await POST(body({ evaluationPeriodId: "p1", facultyIds: ["f1"], visible: true }))
    expect(res.status).toBe(404)
  })

  it("scopes the membership to the department's OWN faculty", async () => {
    await POST(body({ evaluationPeriodId: "p1", facultyIds: ["f1"], visible: true }))
    expect(mockGetMembers).toHaveBeenCalledWith("dept-1")
  })

  it("allows a toggle for a faculty of the department", async () => {
    const res = await POST(body({ evaluationPeriodId: "p1", facultyIds: ["f1", "f2"], visible: true }))
    expect(res.status).toBe(200)
    expect(mockEvalResultRepo.setVisibility).toHaveBeenCalledWith("p1", ["f1", "f2"], true)
  })

  it("rejects a faculty outside the department", async () => {
    const res = await POST(body({ evaluationPeriodId: "p1", facultyIds: ["f1", "f-other"], visible: true }))
    expect(res.status).toBe(403)
    expect(mockEvalResultRepo.setVisibility).not.toHaveBeenCalled()
  })

  it("rejects every toggle when the department has no faculty of its own", async () => {
    mockGetMembers.mockResolvedValue([])
    const res = await POST(body({ evaluationPeriodId: "p1", facultyIds: ["f1"], visible: true }))
    expect(res.status).toBe(403)
    expect(mockEvalResultRepo.setVisibility).not.toHaveBeenCalled()
  })
})
