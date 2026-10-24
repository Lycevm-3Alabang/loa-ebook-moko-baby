import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockDeptRepo = vi.hoisted(() => ({ findByDeanId: vi.fn() }))
const mockUserRepo = vi.hoisted(() => ({ listByRole: vi.fn() }))
const mockGetDeptResults = vi.hoisted(() => vi.fn())
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/utils/roles", () => ({ hasRole: mockHasRole }))
vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  userRepository: mockUserRepo,
}))
vi.mock("@/features/evaluation-results/evaluation-results.service", () => ({
  getDepartmentSubjectResults: mockGetDeptResults,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET } from "@/app/api/dean/evaluation-results/export/route"
import { readZip, partText } from "@/lib/xlsx-template"

function req(qs: string) { return new Request(`http://localhost/api/dean/evaluation-results/export${qs}`) as never }

beforeEach(() => {
  vi.resetAllMocks()
  mockUserRepo.listByRole.mockResolvedValue([])
})

describe("GET /api/dean/evaluation-results/export", () => {
  it("returns 403 when not dean", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "FACULTY" } })
    mockHasRole.mockReturnValue(false)
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(403)
  })

  it("returns 400 when period missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    const res = await GET(req(""))
    expect(res.status).toBe(400)
  })

  it("returns 403 when dean has no department", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    mockDeptRepo.findByDeanId.mockResolvedValue(null)
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(403)
  })

  it("returns zip for dean's department", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "DEAN" } })
    mockHasRole.mockReturnValue(true)
    mockDeptRepo.findByDeanId.mockResolvedValue({ id: "dept-1", name: "CCS", code: "CCS" })
    mockGetDeptResults.mockResolvedValue({
      subjects: [
        { facultyName: "Ana", facultyEmail: "a@x.com", subjectCode: "IT101", subjectName: "Intro", totalRespondents: 3, avgRating: 4.25, remarks: "Very Satisfactory", professionalManner: 4, communicationWithStudent: 4, studentEngagement: 4, learningMaterials: 4, timeManagement: 4, experientialLearning: 4, respectUniqueness: 4, assessmentAndFeedback: 4, sentimentScore: 0.5, facultySubjectId: "fs1", facultyId: "f1", subjectId: "s1", highestRubrics: [], lowestRubrics: [] },
      ],
      facultyAggregates: {},
      departmentAggregate: { totalResponses: 3, avgRating: 4.3, remarks: "Very Satisfactory" },
    })
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/zip")
    const zip = readZip(new Uint8Array(await res.arrayBuffer()))
    expect(partText(zip, "summary.csv")).toContain('"CCS","CCS","0","3","4.30","Very Satisfactory"')
  })
})
