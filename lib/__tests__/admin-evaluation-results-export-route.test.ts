import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockDeptRepo = vi.hoisted(() => ({ listAll: vi.fn() }))
const mockEvalResultRepo = vi.hoisted(() => ({ listLiveDeptAverages: vi.fn() }))
const mockGetDeptResults = vi.hoisted(() => vi.fn())
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/route-guard", () => ({ requireAdmin: mockRequireAdmin }))
vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  evaluationResultRepository: mockEvalResultRepo,
}))
vi.mock("@/features/evaluation-results/evaluation-results.service", () => ({
  getDepartmentSubjectResults: mockGetDeptResults,
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET } from "@/app/api/admin/evaluation-results/export/route"

function req(qs: string) { return new Request(`http://localhost/api/admin/evaluation-results/export${qs}`) as never }

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue(null)
})

describe("GET /api/admin/evaluation-results/export", () => {
  it("returns 400 when period missing", async () => {
    const res = await GET(req(""))
    expect(res.status).toBe(400)
    expect(mockDeptRepo.listAll).not.toHaveBeenCalled()
  })

  it("returns 403 when not admin", async () => {
    mockRequireAdmin.mockResolvedValue(new Response("Forbidden", { status: 403 }))
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(403)
  })

  it("returns zip with correct content-type and disposition", async () => {
    mockDeptRepo.listAll.mockResolvedValue([{ id: "d1", name: "CCS", code: "CCS" }])
    mockEvalResultRepo.listLiveDeptAverages.mockResolvedValue([
      { departmentId: "d1", facultyIds: ["f1"], totalRespondents: 5, avgRating: 4, remarks: "Very Satisfactory", catAverages: {}, highestRubrics: [], lowestRubrics: [] },
    ])
    mockGetDeptResults.mockResolvedValue([
      { facultyName: "Ana", facultyEmail: "a@x.com", subjectCode: "IT101", subjectName: "Intro", totalRespondents: 5, avgRating: 4, remarks: "Very Satisfactory", professionalManner: 4, communicationWithStudent: 4, studentEngagement: 4, learningMaterials: 4, timeManagement: 4, experientialLearning: 4, respectUniqueness: 4, assessmentAndFeedback: 4, sentimentScore: 0.5, facultySubjectId: "fs1", facultyId: "f1", subjectId: "s1", highestRubrics: [], lowestRubrics: [] },
    ])

    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/zip")
    expect(res.headers.get("content-disposition")).toContain(".zip")
    const buf = await res.arrayBuffer()
    expect(buf.byteLength).toBeGreaterThan(0)
    // ZIP EOCD signature at end
    const bytes = new Uint8Array(buf)
    expect(bytes[bytes.length - 22] | (bytes[bytes.length - 21] << 8) | (bytes[bytes.length - 20] << 16) | (bytes[bytes.length - 19] << 24)).toBe(0x06054b50 >>> 0)
  })

  it("returns 404 when no data", async () => {
    mockDeptRepo.listAll.mockResolvedValue([])
    mockEvalResultRepo.listLiveDeptAverages.mockResolvedValue([])
    mockGetDeptResults.mockResolvedValue([])
    const res = await GET(req("?evaluationPeriodId=p1"))
    expect(res.status).toBe(404)
  })
})
