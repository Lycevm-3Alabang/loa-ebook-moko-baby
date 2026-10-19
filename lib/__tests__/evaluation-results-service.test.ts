import { describe, it, expect, vi, beforeEach } from "vitest"

const mockUserRepo = vi.hoisted(() => ({ listByDepartment: vi.fn() }))
const mockEvalRepo = vi.hoisted(() => ({
  listSubmittedByPeriodAndEvaluatees: vi.fn(),
  listRatingsByEvaluationIds: vi.fn(),
  listCommentsByEvaluationIds: vi.fn(),
}))
const mockFsRepo = vi.hoisted(() => ({ findByIds: vi.fn() }))
const mockSubjectRepo = vi.hoisted(() => ({ findByIds: vi.fn() }))

vi.mock("@/lib/repositories/factory", () => ({
  userRepository: mockUserRepo,
  evaluationRepository: mockEvalRepo,
  facultySubjectRepository: mockFsRepo,
  subjectRepository: mockSubjectRepo,
}))

import { getDepartmentSubjectResults } from "@/features/evaluation-results/evaluation-results.service"

beforeEach(() => vi.resetAllMocks())

describe("getDepartmentSubjectResults", () => {
  it("excludes stale evals where evaluateeId !== facultySubject.faculty_id", async () => {
    mockUserRepo.listByDepartment.mockResolvedValue([{ id: "f1", name: "F", email: "f@x" }])
    mockEvalRepo.listSubmittedByPeriodAndEvaluatees.mockResolvedValue([
      { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1", submittedAt: null },
      { id: "e2", evaluateeId: "f2", facultySubjectId: "fs1", submittedAt: null },
    ])
    mockFsRepo.findByIds.mockResolvedValue([{ id: "fs1", faculty_id: "f1", subject_id: "s1" }])
    mockSubjectRepo.findByIds.mockResolvedValue([{ id: "s1", code: "C", name: "N" }])
    mockEvalRepo.listRatingsByEvaluationIds.mockResolvedValue([])
    mockEvalRepo.listCommentsByEvaluationIds.mockResolvedValue([])

    const rows = await getDepartmentSubjectResults("p1", "d1")
    expect(rows).toHaveLength(1)
    expect(rows[0].totalRespondents).toBe(1)
  })
})
