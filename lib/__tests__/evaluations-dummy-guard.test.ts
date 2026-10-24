import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.hoisted(() => vi.fn())
const mockHasRole = vi.hoisted(() => vi.fn())
const mockIsDummyAssignment = vi.hoisted(() => vi.fn())
const mockGetOrCreateEvaluation = vi.hoisted(() => vi.fn())
const mockGetEvaluation = vi.hoisted(() => vi.fn())
const mockGetEvaluationIfOwner = vi.hoisted(() => vi.fn())
const mockSubmitEvaluation = vi.hoisted(() => vi.fn())
const mockGetEvaluationComment = vi.hoisted(() => vi.fn())
const mockGetActiveEvaluationPeriod = vi.hoisted(() => vi.fn())
const mockUserRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockFsRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockSubjectRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockSectionRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockRubricRepo = vi.hoisted(() => ({ getSnapshot: vi.fn() }))
const mockEnrollmentRepo = vi.hoisted(() => ({ findExisting: vi.fn() }))
const mockPeriodRepo = vi.hoisted(() => ({ findById: vi.fn() }))

vi.mock("@/lib/auth", () => ({ auth: mockAuth }))
vi.mock("@/lib/utils/roles", () => ({ hasRole: mockHasRole }))
vi.mock("@/lib/services/audit", () => ({ logServerError: vi.fn(), logAuditEvent: vi.fn() }))
vi.mock("@/features/evaluations/evaluations.service", () => ({
  getOrCreateEvaluation: mockGetOrCreateEvaluation,
  getEvaluation: mockGetEvaluation,
  getEvaluationIfOwner: mockGetEvaluationIfOwner,
  submitEvaluation: mockSubmitEvaluation,
  isDummyAssignment: mockIsDummyAssignment,
  getEvaluationRatings: vi.fn().mockResolvedValue([]),
  getEvaluationComment: mockGetEvaluationComment,
  getMyEvaluations: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/features/admin-data/evaluation-periods.service", () => ({
  getActiveEvaluationPeriod: mockGetActiveEvaluationPeriod,
}))
vi.mock("@/lib/repositories/factory", () => ({
  userRepository: mockUserRepo,
  facultySubjectRepository: mockFsRepo,
  subjectRepository: mockSubjectRepo,
  sectionRepository: mockSectionRepo,
  rubricGroupRepository: mockRubricRepo,
  studentEnrollmentRepository: mockEnrollmentRepo,
  evaluationPeriodRepository: mockPeriodRepo,
}))

import { POST as createEvaluation } from "@/app/api/evaluations/route"
import { GET as getEvaluationById } from "@/app/api/evaluations/[id]/route"
import { POST as submitEvaluation } from "@/app/api/evaluations/[id]/submit/route"

function post(body: unknown) {
  return new Request("http://localhost/api/evaluations", {
    method: "POST",
    body: JSON.stringify(body),
  }) as never
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

const DRAFT = {
  id: "ev1",
  evaluatorId: "stu-1",
  evaluateeId: "f-dummy",
  facultySubjectId: "fs-dummy",
  evaluationPeriodId: "p1",
  status: "DRAFT",
  isDisabled: false,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockAuth.mockResolvedValue({ user: { id: "stu-1", role: "STUDENT" } })
  mockHasRole.mockImplementation((role: string, want: string) => role === want)
  mockIsDummyAssignment.mockResolvedValue(false)
  mockGetActiveEvaluationPeriod.mockResolvedValue({ id: "p1" })
  mockEnrollmentRepo.findExisting.mockResolvedValue({ id: "enr-1" })
  mockPeriodRepo.findById.mockResolvedValue({ id: "p1", semesterId: "sem1" })
  mockGetOrCreateEvaluation.mockResolvedValue(DRAFT)
  mockGetEvaluation.mockResolvedValue(DRAFT)
  mockGetEvaluationIfOwner.mockResolvedValue(DRAFT)
  mockSubmitEvaluation.mockResolvedValue({ ...DRAFT, status: "SUBMITTED" })
  mockGetEvaluationComment.mockResolvedValue({ comment: "A valid comment" })
  mockUserRepo.findById.mockResolvedValue({ id: "f-dummy", name: "Unassigned Faculty" })
  mockFsRepo.findById.mockResolvedValue({ id: "fs-dummy", subject_id: "sub1", section_id: "sec1" })
})

describe("the shared dummy account is never an evaluated entity for a student", () => {
  it("refuses to create an evaluation against a dummy assignment", async () => {
    mockIsDummyAssignment.mockResolvedValue(true)

    const res = await createEvaluation(
      post({ facultySubjectId: "fs-dummy", evaluateeId: "f-dummy", periodId: "p1" }),
    )

    expect(res.status).toBe(403)
    expect(mockGetOrCreateEvaluation).not.toHaveBeenCalled()
  })

  it("refuses to open a draft that points at a dummy assignment", async () => {
    mockIsDummyAssignment.mockResolvedValue(true)

    const res = await getEvaluationById(
      new Request("http://localhost/api/evaluations/ev1") as never,
      params("ev1"),
    )

    expect(res.status).toBe(404)
  })

  it("refuses to submit a draft that points at a dummy assignment", async () => {
    mockIsDummyAssignment.mockResolvedValue(true)

    const res = await submitEvaluation(
      new Request("http://localhost/api/evaluations/ev1/submit", { method: "POST" }) as never,
      params("ev1"),
    )

    expect(res.status).toBe(403)
    expect(mockSubmitEvaluation).not.toHaveBeenCalled()
  })

  it("refuses to submit when the required comment is missing or blank", async () => {
    mockGetEvaluationComment.mockResolvedValueOnce(null).mockResolvedValueOnce({ comment: "   " })

    const missingComment = await submitEvaluation(
      new Request("http://localhost/api/evaluations/ev1/submit", { method: "POST" }) as never,
      params("ev1"),
    )
    const blankComment = await submitEvaluation(
      new Request("http://localhost/api/evaluations/ev1/submit", { method: "POST" }) as never,
      params("ev1"),
    )

    expect(missingComment.status).toBe(400)
    expect(blankComment.status).toBe(400)
    expect(mockSubmitEvaluation).not.toHaveBeenCalled()
  })

  it("submits when a non-blank comment exists", async () => {
    const res = await submitEvaluation(
      new Request("http://localhost/api/evaluations/ev1/submit", { method: "POST" }) as never,
      params("ev1"),
    )

    expect(res.status).toBe(200)
    expect(mockSubmitEvaluation).toHaveBeenCalledWith("ev1")
  })

  it("still allows a normal assignment through", async () => {
    const res = await createEvaluation(
      post({ facultySubjectId: "fs-ana", evaluateeId: "f-ana", periodId: "p1" }),
    )

    expect(res.status).toBe(200)
    expect(mockGetOrCreateEvaluation).toHaveBeenCalled()
  })
})
