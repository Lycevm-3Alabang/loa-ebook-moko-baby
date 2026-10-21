import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockDeptRepo = vi.hoisted(() => ({
  findByDeanId: vi.fn(),
  listAll: vi.fn(),
}))
const mockEvalResultRepo = vi.hoisted(() => ({
  listPeriodFigures: vi.fn(),
  listDepartmentFigures: vi.fn(),
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
  departmentCourseRepository: {},
  evaluationResultRepository: mockEvalResultRepo,
  userRepository: mockUserRepo,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET as DeanGET } from "@/app/api/dean/evaluation-results/route"
import { GET as AdminGET } from "@/app/api/admin/evaluation-results/route"

function req(qs: string) {
  return new Request(`http://localhost/api/dean/evaluation-results${qs}`) as never
}

const DEPT = { id: "dept-1", name: "CCS", code: "CCS", deanId: "dean-1" }

const FIGURE = {
  departmentId: "dept-1",
  totalRespondents: 7,
  facultyIds: ["f1", "f2"],
}

beforeEach(() => {
  vi.resetAllMocks()
  mockAuth.mockResolvedValue({ user: { id: "dean-1", role: "DEAN" } })
  mockHasRole.mockReturnValue(true)
  mockRequireAdmin.mockResolvedValue(null)
  mockDeptRepo.findByDeanId.mockResolvedValue(DEPT)
  mockDeptRepo.listAll.mockResolvedValue([DEPT])
  mockEvalResultRepo.listPeriodFigures.mockResolvedValue({
    departments: [FIGURE],
    warnings: {
      unattributed: { count: 0, faculty: [] },
    },
  })
  mockUserRepo.listByRole.mockResolvedValue([
    { id: "f1", name: "Ana", email: "ana@x", departmentId: "dept-1", role: "FACULTY" },
    { id: "f2", name: "Ben", email: "ben@x", departmentId: "dept-1", role: "FACULTY" },
  ])
  mockEvalResultRepo.listDepartmentFigures.mockResolvedValue({
    departmentId: "dept-1",
    totalRespondents: 7,
    avgRating: 4.2,
    remarks: "Very Satisfactory",
    highestRubrics: [],
    lowestRubrics: [],
    sentimentScore: 0.3,
  })
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

  it("returns the department's own row", async () => {
    const res = await DeanGET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.departments).toHaveLength(1)
    expect(body.departments[0].totalRespondents).toBe(7)
    expect(body.departments[0].facultyCount).toBe(2)
    // The rating figures are read with the row: the dean has one department.
    expect(body.departments[0].avgRating).toBe(4.2)
    expect(body.departments[0].remarks).toBe("Very Satisfactory")
    expect(body.departments[0].sentimentScore).toBe(0.3)
  })

  it("returns the same spine the admin route returns for the same department", async () => {
    const deanRes = await DeanGET(req("?evaluationPeriodId=p1"))
    const deanBody = await deanRes.json()

    const adminRes = await AdminGET(req("?evaluationPeriodId=p1"))
    const adminBody = await adminRes.json()

    const adminDept = adminBody.departments.find(
      (d: { departmentId: string }) => d.departmentId === "dept-1",
    )
    // The same department, the same faculty, the same responses. The rating
    // figures are read per department on both surfaces — the admin's list
    // asks for them department by department, so its rows fill as they land.
    expect(deanBody.departments[0].departmentId).toBe(adminDept.departmentId)
    expect(deanBody.departments[0].facultyCount).toBe(adminDept.facultyCount)
    expect(deanBody.departments[0].totalRespondents).toBe(adminDept.totalRespondents)
  })

  it("returns the department with no rating when the period has no responses for it", async () => {
    mockEvalResultRepo.listPeriodFigures.mockResolvedValue({
      departments: [],
      warnings: {
        unattributed: { count: 0, faculty: [] },
      },
    })
    const res = await DeanGET(req("?evaluationPeriodId=p1"))
    const body = await res.json()
    // The department is still a row - it just has no results in this period.
    expect(body.departments).toHaveLength(1)
    expect(body.departments[0].departmentId).toBe("dept-1")
    expect(body.departments[0].totalRespondents).toBe(0)
    expect(body.departments[0].avgRating).toBeNull()
  })
})
