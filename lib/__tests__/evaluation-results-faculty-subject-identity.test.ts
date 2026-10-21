import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.hoisted(() => vi.fn())
const mockUserRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockSubjectRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockFsRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockDeptRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockSectionRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockEvalPeriodRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockEvalRepo = vi.hoisted(() => ({
  listSubmittedByPeriodAndEvaluateeAndFS: vi.fn(),
  listRatingsByEvaluationIds: vi.fn(),
  listFullCommentsByEvaluationIds: vi.fn(),
}))
const mockEvalResultRepo = vi.hoisted(() => ({
  assertPeriodIsActive: vi.fn(),
  getVisibilityMap: vi.fn(),
}))
const mockLogServerError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/repositories/factory", () => ({
  userRepository: mockUserRepo,
  subjectRepository: mockSubjectRepo,
  facultySubjectRepository: mockFsRepo,
  departmentRepository: mockDeptRepo,
  sectionRepository: mockSectionRepo,
  evaluationPeriodRepository: mockEvalPeriodRepo,
  evaluationRepository: mockEvalRepo,
  evaluationResultRepository: mockEvalResultRepo,
}))
vi.mock("@/features/evaluation-results/evaluation-results.repository", () => ({
  EvaluationPeriodInactiveError: class extends Error {
    status = 409
  },
}))
vi.mock("@/lib/services/audit", () => ({ logServerError: mockLogServerError }))

import { GET as facultyGET } from "@/app/api/faculty/evaluation-results/subjects/[facultySubjectId]/route"

const ME = "f1"

function req(qs: string) {
  return new Request(`http://localhost/api/faculty/evaluation-results/subjects/fs1${qs}`) as never
}

function params(facultySubjectId: string) {
  return { params: Promise.resolve({ facultySubjectId }) }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockAuth.mockResolvedValue({ user: { id: ME, role: "FACULTY" } })
  mockEvalResultRepo.assertPeriodIsActive.mockResolvedValue(undefined)
  mockEvalResultRepo.getVisibilityMap.mockResolvedValue(new Map([[ME, true]]))
  mockUserRepo.findById.mockResolvedValue({
    id: ME,
    name: "Ana Reyes",
    email: "ana@x",
    departmentId: "d1",
    employeeNo: "2024-0017",
  })
  mockFsRepo.findById.mockResolvedValue({
    id: "fs1",
    faculty_id: ME,
    subject_id: "s1",
    section_id: "sec1",
  })
  mockSubjectRepo.findById.mockResolvedValue({ id: "s1", code: "IT101", name: "Intro" })
  mockDeptRepo.findById.mockResolvedValue({ id: "d1", name: "CCS", code: "CCS" })
  mockSectionRepo.findById.mockResolvedValue({ id: "sec1", name: "A", program: "BSCS" })
  mockEvalPeriodRepo.findById.mockResolvedValue({
    id: "p1",
    name: "SY 2026-2027 First Semester - Evaluation",
    semesterTitle: "SY 2026-2027 First Semester",
  })
  mockEvalRepo.listSubmittedByPeriodAndEvaluateeAndFS.mockResolvedValue([
    { id: "e1", submittedAt: null, createdAt: null },
  ])
  mockEvalRepo.listRatingsByEvaluationIds.mockResolvedValue([])
  mockEvalRepo.listFullCommentsByEvaluationIds.mockResolvedValue([])
})

/**
 * The export's identity block, on the faculty's OWN page.
 *
 * The faculty page is the third surface the export reads, and it was the one
 * that never resolved its section: the admin and dean routes have carried the
 * program and the section name all along, and the faculty route had neither.
 */
describe("the faculty's own subject page carries the export's identity block", () => {
  it("carries the program, the section, the semester and the period", async () => {
    const res = await facultyGET(req("?evaluationPeriodId=p1"), params("fs1"))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sectionProgram).toBe("BSCS")
    expect(body.sectionName).toBe("A")
    expect(body.evaluationPeriodName).toBe("SY 2026-2027 First Semester - Evaluation")
    expect(body.semesterTitle).toBe("SY 2026-2027 First Semester")
    expect(body.faculty.employeeNo).toBe("2024-0017")
  })

  it("reads the row's OWN section", async () => {
    await facultyGET(req("?evaluationPeriodId=p1"), params("fs1"))

    expect(mockSectionRepo.findById).toHaveBeenCalledWith("sec1")
  })

  it("still answers when the assignment carries no section", async () => {
    mockFsRepo.findById.mockResolvedValue({
      id: "fs1",
      faculty_id: ME,
      subject_id: "s1",
      section_id: null,
    })

    const res = await facultyGET(req("?evaluationPeriodId=p1"), params("fs1"))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sectionProgram).toBeNull()
    expect(body.sectionName).toBeNull()
    expect(mockSectionRepo.findById).not.toHaveBeenCalled()
  })

  it("does not read another faculty member's subject", async () => {
    mockFsRepo.findById.mockResolvedValue({
      id: "fs1",
      faculty_id: "someone-else",
      subject_id: "s1",
      section_id: "sec1",
    })

    const res = await facultyGET(req("?evaluationPeriodId=p1"), params("fs1"))

    expect(res.status).toBe(403)
    // The responses are never read for a subject that is not the faculty's.
    expect(mockEvalRepo.listSubmittedByPeriodAndEvaluateeAndFS).not.toHaveBeenCalled()
    expect(mockSectionRepo.findById).not.toHaveBeenCalled()
  })

  it("refuses a period whose results are still hidden", async () => {
    mockEvalResultRepo.getVisibilityMap.mockResolvedValue(new Map([[ME, false]]))

    const res = await facultyGET(req("?evaluationPeriodId=p1"), params("fs1"))

    expect(res.status).toBe(403)
    expect(mockEvalRepo.listSubmittedByPeriodAndEvaluateeAndFS).not.toHaveBeenCalled()
  })
})
