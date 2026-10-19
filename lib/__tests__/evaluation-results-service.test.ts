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

    const { subjects, facultyAggregates, departmentAggregate } = await getDepartmentSubjectResults("p1", "d1")
    expect(subjects).toHaveLength(1)
    expect(subjects[0].totalRespondents).toBe(1)
    expect(facultyAggregates.f1.totalRespondents).toBe(1)
    expect(facultyAggregates.f2).toBeUndefined()
    expect(departmentAggregate?.totalSubjects).toBe(1)
    expect(departmentAggregate?.uniqueFaculty).toBe(1)
    expect(departmentAggregate?.totalResponses).toBe(1)
    expect(departmentAggregate?.avgRating).toBeNull()
  })

  it("returns a pooled faculty aggregate, not a mean of per-subject means", async () => {
    mockUserRepo.listByDepartment.mockResolvedValue([{ id: "f1", name: "F", email: "f@x" }])
    mockEvalRepo.listSubmittedByPeriodAndEvaluatees.mockResolvedValue([
      { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1", submittedAt: null },
      { id: "e2", evaluateeId: "f1", facultySubjectId: "fs1", submittedAt: null },
      { id: "e3", evaluateeId: "f1", facultySubjectId: "fs1", submittedAt: null },
      { id: "e4", evaluateeId: "f1", facultySubjectId: "fs2", submittedAt: null },
    ])
    mockFsRepo.findByIds.mockResolvedValue([
      { id: "fs1", faculty_id: "f1", subject_id: "s1" },
      { id: "fs2", faculty_id: "f1", subject_id: "s2" },
    ])
    mockSubjectRepo.findByIds.mockResolvedValue([
      { id: "s1", code: "C1", name: "N1" },
      { id: "s2", code: "C2", name: "N2" },
    ])
    mockEvalRepo.listRatingsByEvaluationIds.mockResolvedValue([
      { evaluationId: "e1", rating: 4, rubric_items: { categoryId: "c1", rubric_categories: { name: "Professional Manner" } } },
      { evaluationId: "e2", rating: 4, rubric_items: { categoryId: "c1", rubric_categories: { name: "Professional Manner" } } },
      { evaluationId: "e3", rating: 4, rubric_items: { categoryId: "c1", rubric_categories: { name: "Professional Manner" } } },
      { evaluationId: "e4", rating: 2, rubric_items: { categoryId: "c1", rubric_categories: { name: "Professional Manner" } } },
    ])
    mockEvalRepo.listCommentsByEvaluationIds.mockResolvedValue([])

    const { subjects, facultyAggregates, departmentAggregate } = await getDepartmentSubjectResults("p1", "d1")

    expect(subjects.map((s) => s.avgRating)).toEqual([4, 2])
    // mean of the two subject averages would be 3.00; pooled is 3.50
    expect(facultyAggregates.f1.avgRating).toBe(3.5)
    expect(facultyAggregates.f1.totalRespondents).toBe(4)
    expect(departmentAggregate?.totalSubjects).toBe(2)
    expect(departmentAggregate?.uniqueFaculty).toBe(1)
    expect(departmentAggregate?.totalResponses).toBe(4)
    expect(departmentAggregate?.avgRating).toBe(3.5)
    expect(departmentAggregate?.avgRating).not.toBe(3)
  })
})
