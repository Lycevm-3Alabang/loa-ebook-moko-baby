import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockDeptRepo = vi.hoisted(() => ({ findByDeanId: vi.fn(), findById: vi.fn() }))
const mockFsRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockUserRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockSubjectRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockEvalRepo = vi.hoisted(() => ({
  listSubmittedByPeriodAndEvaluateeAndFS: vi.fn(),
  listRatingsByEvaluationIds: vi.fn(),
  listFullCommentsByEvaluationIds: vi.fn(),
}))
const mockEvalResultRepo = vi.hoisted(() => ({ assertPeriodIsActive: vi.fn() }))
const mockSectionRepo = vi.hoisted(() => ({ list: vi.fn() }))
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/route-guard", () => ({ requireAdmin: mockRequireAdmin }))
vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/utils/roles", () => ({ hasRole: mockHasRole }))
vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  facultySubjectRepository: mockFsRepo,
  userRepository: mockUserRepo,
  subjectRepository: mockSubjectRepo,
  evaluationRepository: mockEvalRepo,
  evaluationResultRepository: mockEvalResultRepo,
  sectionRepository: mockSectionRepo,
}))
vi.mock("@/features/evaluation-results/evaluation-results.repository", () => ({
  EvaluationPeriodInactiveError: class extends Error {
    status = 409
  },
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET as adminGET } from "@/app/api/admin/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/route"
import { GET as deanGET } from "@/app/api/dean/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/route"

const DEPT = { id: "d1", name: "CCS", code: "CCS" }

function req(path: string, qs: string) {
  return new Request(`http://localhost${path}${qs}`) as never
}

function params(departmentId: string, facultySubjectId: string) {
  return { params: Promise.resolve({ departmentId, facultySubjectId }) }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue(null)
  mockAuth.mockResolvedValue({ user: { id: "dean-1", role: "DEAN" } })
  mockHasRole.mockImplementation((role: string, want: string) => role === want)
  mockDeptRepo.findByDeanId.mockResolvedValue(DEPT)
  mockDeptRepo.findById.mockResolvedValue(DEPT)
  mockFsRepo.findById.mockResolvedValue({ id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: null })
  mockUserRepo.findById.mockResolvedValue({ id: "f1", name: "Ana Reyes", email: "ana@x", departmentId: "d1" })
  mockSubjectRepo.findById.mockResolvedValue({ id: "s1", code: "IT101", name: "Intro" })
  mockEvalRepo.listSubmittedByPeriodAndEvaluateeAndFS.mockResolvedValue([{ id: "e1", submittedAt: null, createdAt: null }])
  mockEvalRepo.listRatingsByEvaluationIds.mockResolvedValue([])
  mockEvalRepo.listFullCommentsByEvaluationIds.mockResolvedValue([])
  mockEvalResultRepo.assertPeriodIsActive.mockResolvedValue(undefined)
  mockSectionRepo.list.mockResolvedValue([])
})

describe("the subject page's department guard (D9)", () => {
  it("opens the subject when its teacher is homed in the department", async () => {
    const res = await adminGET(
      req("/api/admin/evaluation-results/departments/d1/groups/fs1", "?evaluationPeriodId=p1"),
      params("d1", "fs1"),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.faculty.id).toBe("f1")
  })

  it("refuses a subject whose teacher is homed in another department", async () => {
    mockUserRepo.findById.mockResolvedValue({ id: "f1", name: "Ben Cruz", email: "ben@x", departmentId: "d2" })

    const res = await adminGET(
      req("/api/admin/evaluation-results/departments/d1/groups/fs1", "?evaluationPeriodId=p1"),
      params("d1", "fs1"),
    )

    expect(res.status).toBe(404)
    // The responses are never read for a subject that is not the department's.
    expect(mockEvalRepo.listSubmittedByPeriodAndEvaluateeAndFS).not.toHaveBeenCalled()
  })

  it("refuses a subject whose teacher has no home department", async () => {
    mockUserRepo.findById.mockResolvedValue({ id: "f1", name: "Unassigned Faculty", email: "placeholder@x", departmentId: null })

    const res = await adminGET(
      req("/api/admin/evaluation-results/departments/d1/groups/fs1", "?evaluationPeriodId=p1"),
      params("d1", "fs1"),
    )

    expect(res.status).toBe(404)
    expect(mockEvalRepo.listSubmittedByPeriodAndEvaluateeAndFS).not.toHaveBeenCalled()
  })

  it("opens the dean's own subject", async () => {
    const res = await deanGET(
      req("/api/dean/evaluation-results/departments/d1/groups/fs1", "?evaluationPeriodId=p1"),
      params("d1", "fs1"),
    )

    expect(res.status).toBe(200)
  })

  it("refuses a dean passing their own department with another department's subject", async () => {
    mockUserRepo.findById.mockResolvedValue({ id: "f1", name: "Ben Cruz", email: "ben@x", departmentId: "d2" })

    const res = await deanGET(
      req("/api/dean/evaluation-results/departments/d1/groups/fs1", "?evaluationPeriodId=p1"),
      params("d1", "fs1"),
    )

    expect(res.status).toBe(403)
    expect(mockEvalRepo.listSubmittedByPeriodAndEvaluateeAndFS).not.toHaveBeenCalled()
  })

  it("refuses a dean passing another department in the url", async () => {
    const res = await deanGET(
      req("/api/dean/evaluation-results/departments/d2/groups/fs1", "?evaluationPeriodId=p1"),
      params("d2", "fs1"),
    )

    expect(res.status).toBe(403)
    expect(mockEvalRepo.listSubmittedByPeriodAndEvaluateeAndFS).not.toHaveBeenCalled()
  })
})
