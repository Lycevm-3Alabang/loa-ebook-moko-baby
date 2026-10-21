import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockEvalResultRepo = vi.hoisted(() => ({
  listPeriodFigures: vi.fn(),
}))
const mockDeptRepo = vi.hoisted(() => ({
  listAll: vi.fn(),
}))
const mockFacultyCounts = vi.hoisted(() => vi.fn())
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/route-guard", () => ({ requireAdmin: mockRequireAdmin }))
vi.mock("@/lib/repositories/factory", () => ({
  evaluationResultRepository: mockEvalResultRepo,
  departmentRepository: mockDeptRepo,
}))
vi.mock("@/features/users/users.service", () => ({
  getFacultyCountsByDepartment: mockFacultyCounts,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET } from "@/app/api/admin/evaluation-results/route"

function req(qs: string) {
  return new Request(`http://localhost/api/admin/evaluation-results${qs}`) as never
}

/** The repository's answer: the departments, and the warnings from the same facts. */
function figures(
  departments: { departmentId: string; totalRespondents: number; facultyIds: string[] }[],
  warnings: {
    unattributed: { count: number; faculty: { id: string; name: string }[] }
  } = { unattributed: { count: 0, faculty: [] } },
) {
  return { departments, warnings }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue(null)
  mockFacultyCounts.mockResolvedValue({})
})

describe("GET /api/admin/evaluation-results", () => {
  it("returns 400 when evaluationPeriodId missing", async () => {
    const res = await GET(req(""))
    expect(res.status).toBe(400)
    expect(mockEvalResultRepo.listPeriodFigures).not.toHaveBeenCalled()
  })

  it("returns 403 when not admin", async () => {
    mockRequireAdmin.mockResolvedValue(new Response("Forbidden", { status: 403 }))
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(403)
  })

  it("renders the department rows the service assembled", async () => {
    mockEvalResultRepo.listPeriodFigures.mockResolvedValue(
      figures([{ departmentId: "d1", totalRespondents: 5, facultyIds: ["f1"] }]),
    )
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])
    mockFacultyCounts.mockResolvedValue({ d1: 3 })

    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.departments).toHaveLength(1)
    expect(body.departments[0].departmentName).toBe("CCS")
    expect(body.departments[0].totalRespondents).toBe(5)
    expect(body.departments[0].facultyCount).toBe(3)
  })

  it("returns empty departments when the period has no responses", async () => {
    mockEvalResultRepo.listPeriodFigures.mockResolvedValue(figures([]))
    mockDeptRepo.listAll.mockResolvedValue([])

    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.departments).toEqual([])
  })

  it("keeps the payload's shape while the rating columns are still empty", async () => {
    mockEvalResultRepo.listPeriodFigures.mockResolvedValue(
      figures([{ departmentId: "d1", totalRespondents: 2, facultyIds: ["f1"] }]),
    )
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])

    const res = await GET(req("?evaluationPeriodId=p1"))
    const body = await res.json()
    // The rating figures arrive in the next step; the keys are already there.
    expect(body.departments[0].avgRating).toBeNull()
    expect(body.departments[0].remarks).toBeNull()
    expect(body.departments[0].highestRubrics).toEqual([])
    expect(body.departments[0].lowestRubrics).toEqual([])
    expect(body.departments[0].sentimentScore).toBeNull()
  })

  it("reports the unattributed pseudo-department as a warning, not as a row", async () => {
    mockEvalResultRepo.listPeriodFigures.mockResolvedValue(
      figures(
        [{ departmentId: "d1", totalRespondents: 2, facultyIds: ["f1"] }],
        { unattributed: { count: 1, faculty: [{ id: "f9", name: "Ana" }] } },
      ),
    )
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])

    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.departments.map((d: { departmentId: string }) => d.departmentId)).toEqual(["d1"])
    expect(body.warnings.unattributed.count).toBe(1)
    expect(body.warnings.unattributed.faculty[0].name).toBe("Ana")
  })

  it("returns no warnings when every evaluation is attributed", async () => {
    mockEvalResultRepo.listPeriodFigures.mockResolvedValue(
      figures([{ departmentId: "d1", totalRespondents: 2, facultyIds: ["f1"] }]),
    )
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])

    const res = await GET(req("?evaluationPeriodId=p1"))
    const body = await res.json()
    expect(body.warnings.unattributed.count).toBe(0)
  })

  it("does not serve a no-response roster - the coverage page owns that number", async () => {
    mockEvalResultRepo.listPeriodFigures.mockResolvedValue(
      figures([{ departmentId: "d1", totalRespondents: 2, facultyIds: ["f1"] }]),
    )
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])
    mockFacultyCounts.mockResolvedValue({ d1: 1 })

    const res = await GET(req("?evaluationPeriodId=p1"))
    const body = await res.json()
    // The count is the department's own faculty (f1).
    expect(body.departments[0].facultyCount).toBe(1)
    // The roster is the coverage page's number, not this payload's.
    expect(body.departments[0].noResponses).toBeUndefined()
  })

  it("passes the department's own faculty count through, uncounted", async () => {
    mockEvalResultRepo.listPeriodFigures.mockResolvedValue(
      figures([{ departmentId: "d1", totalRespondents: 2, facultyIds: ["f1"] }]),
    )
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])
    // The headcount is one number, counted once by the users service: the
    // accounts homed in the department.
    mockFacultyCounts.mockResolvedValue({ d1: 1 })

    const res = await GET(req("?evaluationPeriodId=p1"))
    const body = await res.json()
    // f2 is homed in d2 and f3 has no home department: neither is d1's.
    expect(body.departments[0].facultyCount).toBe(1)
  })
})
