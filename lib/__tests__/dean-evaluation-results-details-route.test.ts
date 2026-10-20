import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockDeptRepo = vi.hoisted(() => ({ findByDeanId: vi.fn() }))
const mockGetMemberTeaching = vi.hoisted(() => vi.fn())
const mockGetBreakdowns = vi.hoisted(() => vi.fn())
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/utils/roles", () => ({ hasRole: mockHasRole }))
vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
}))
vi.mock("@/features/evaluation-results/evaluation-results.service", () => ({
  getDepartmentMemberTeaching: mockGetMemberTeaching,
}))
vi.mock("@/features/evaluation-results/evaluation-results.repository", () => ({
  getStudentBreakdownsForFaculty: mockGetBreakdowns,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET } from "@/app/api/dean/evaluation-results/details/route"

function req(qs: string) {
  return new Request(`http://localhost/api/dean/evaluation-results/details${qs}`) as never
}

const DEPT = { id: "dept-1", name: "CCS", code: "CCS", deanId: "dean-1" }

beforeEach(() => {
  vi.resetAllMocks()
  mockAuth.mockResolvedValue({ user: { id: "dean-1", role: "DEAN" } })
  mockHasRole.mockImplementation((role: string, want: string) => role === want)
  mockDeptRepo.findByDeanId.mockResolvedValue(DEPT)
  mockGetMemberTeaching.mockResolvedValue({
    assignments: [
      { id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1", departmentId: "dept-1" },
    ],
    users: new Map(),
  })
  mockGetBreakdowns.mockResolvedValue([{ id: "stu-1", name: "Ann", email: "ann@x", rating: 5 }])
})

describe("GET /api/dean/evaluation-results/details", () => {
  it("returns the breakdown for a teacher in the dean's department", async () => {
    const res = await GET(req("?evaluationPeriodId=p1&facultyId=f1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.students[0].id).toBe("S1")
    expect(mockGetBreakdowns).toHaveBeenCalledWith("p1", "f1")
  })

  it("refuses a teacher from another department", async () => {
    const res = await GET(req("?evaluationPeriodId=p1&facultyId=f-other"))
    expect(res.status).toBe(403)
    expect(mockGetBreakdowns).not.toHaveBeenCalled()
  })

  it("scopes the membership to the dean's own department and period", async () => {
    await GET(req("?evaluationPeriodId=p1&facultyId=f1"))
    expect(mockGetMemberTeaching).toHaveBeenCalledWith("dept-1", "p1")
  })

  it("returns 400 when the params are missing", async () => {
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(400)
  })

  it("lets an admin read any teacher", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } })
    mockHasRole.mockImplementation((role: string, want: string) => role === want)

    const res = await GET(req("?evaluationPeriodId=p1&facultyId=f-other"))
    expect(res.status).toBe(200)
  })
})
