import { describe, it, expect, vi, beforeEach } from "vitest"

const mockUserRepo = vi.hoisted(() => ({ listByIds: vi.fn(), listByDepartment: vi.fn() }))
const mockEvalRepo = vi.hoisted(() => ({
  listSubmittedByPeriodAndEvaluatees: vi.fn(),
  listRatingsByEvaluationIds: vi.fn(),
  listCommentsByEvaluationIds: vi.fn(),
}))
const mockEvalResultRepo = vi.hoisted(() => ({
  listDepartmentAssignments: vi.fn(),
  listDepartmentTeachingAssignments: vi.fn(),
}))
const mockEvalPeriodRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockSectionRepo = vi.hoisted(() => ({ list: vi.fn() }))
const mockFsRepo = vi.hoisted(() => ({ findByIds: vi.fn() }))
const mockSubjectRepo = vi.hoisted(() => ({ findByIds: vi.fn() }))

vi.mock("@/lib/repositories/factory", () => ({
  userRepository: mockUserRepo,
  evaluationRepository: mockEvalRepo,
  evaluationResultRepository: mockEvalResultRepo,
  evaluationPeriodRepository: mockEvalPeriodRepo,
  sectionRepository: mockSectionRepo,
  facultySubjectRepository: mockFsRepo,
  subjectRepository: mockSubjectRepo,
}))

import { getDepartmentSubjectResults } from "@/features/evaluation-results/evaluation-results.service"

/** The department's own assignment: the section is owned by the department. */
const assignment = (over: Partial<{ id: string; faculty_id: string; subject_id: string; section_id: string | null; departmentId: string | null }> = {}) => ({
  id: "fs1",
  faculty_id: "f1",
  subject_id: "s1",
  section_id: null,
  departmentId: "d1",
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  mockSectionRepo.list.mockResolvedValue([])
  mockEvalPeriodRepo.findById.mockResolvedValue({ id: "p1", semesterId: "s1" })
})

describe("getDepartmentSubjectResults", () => {
  it("excludes stale evals where evaluateeId !== facultySubject.faculty_id", async () => {
    mockEvalResultRepo.listDepartmentTeachingAssignments.mockResolvedValue([assignment()])
    mockUserRepo.listByIds.mockResolvedValue([{ id: "f1", name: "F", email: "f@x", departmentId: "d1" }])
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
    mockEvalResultRepo.listDepartmentTeachingAssignments.mockResolvedValue([
      assignment({ id: "fs1", subject_id: "s1" }),
      assignment({ id: "fs2", subject_id: "s2" }),
    ])
    mockUserRepo.listByIds.mockResolvedValue([{ id: "f1", name: "F", email: "f@x", departmentId: "d1" }])
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

  it("resolves the department's assignments through the shared repository, not listByDepartment", async () => {
    mockEvalResultRepo.listDepartmentTeachingAssignments.mockResolvedValue([assignment()])
    mockUserRepo.listByIds.mockResolvedValue([{ id: "f1", name: "F", email: "f@x", departmentId: "d1" }])
    mockEvalRepo.listSubmittedByPeriodAndEvaluatees.mockResolvedValue([
      { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1", submittedAt: null },
    ])
    mockFsRepo.findByIds.mockResolvedValue([{ id: "fs1", faculty_id: "f1", subject_id: "s1" }])
    mockSubjectRepo.findByIds.mockResolvedValue([{ id: "s1", code: "C", name: "N" }])
    mockEvalRepo.listRatingsByEvaluationIds.mockResolvedValue([])
    mockEvalRepo.listCommentsByEvaluationIds.mockResolvedValue([])

    await getDepartmentSubjectResults("p1", "d1")

    // The term's roster, not the evaluated subset: the department's teaching.
    expect(mockEvalResultRepo.listDepartmentTeachingAssignments).toHaveBeenCalledWith("d1", "s1")
    expect(mockUserRepo.listByIds).toHaveBeenCalledWith(["f1"], { includeDeleted: true })
    expect(mockUserRepo.listByDepartment).not.toHaveBeenCalled()
  })

  it("keeps another department's assignment out, even for the same faculty", async () => {
    mockEvalResultRepo.listDepartmentTeachingAssignments.mockResolvedValue([assignment({ id: "fs1" })])
    mockUserRepo.listByIds.mockResolvedValue([{ id: "f1", name: "F", email: "f@x", departmentId: "d1" }])
    mockEvalRepo.listSubmittedByPeriodAndEvaluatees.mockResolvedValue([
      { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1", submittedAt: null },
      { id: "e2", evaluateeId: "f1", facultySubjectId: "fs-other", submittedAt: null },
    ])
    mockFsRepo.findByIds.mockResolvedValue([{ id: "fs1", faculty_id: "f1", subject_id: "s1" }])
    mockSubjectRepo.findByIds.mockResolvedValue([{ id: "s1", code: "C", name: "N" }])
    mockEvalRepo.listRatingsByEvaluationIds.mockResolvedValue([])
    mockEvalRepo.listCommentsByEvaluationIds.mockResolvedValue([])

    const { subjects, departmentAggregate } = await getDepartmentSubjectResults("p1", "d1")

    expect(subjects).toHaveLength(1)
    expect(subjects[0].totalRespondents).toBe(1)
    expect(departmentAggregate?.totalResponses).toBe(1)
  })

  it("keeps a teacher homed elsewhere out of the department's subjects and results", async () => {
    mockEvalResultRepo.listDepartmentTeachingAssignments.mockResolvedValue([assignment()])
    // f1 teaches a subject of d1 but is homed in d2: not a member of d1, so
    // neither the subject nor the results are the department's.
    mockUserRepo.listByIds.mockResolvedValue([{ id: "f1", name: "F", email: "f@x", departmentId: "d2" }])
    mockEvalRepo.listSubmittedByPeriodAndEvaluatees.mockResolvedValue([
      { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1", submittedAt: null },
    ])
    mockFsRepo.findByIds.mockResolvedValue([{ id: "fs1", faculty_id: "f1", subject_id: "s1" }])
    mockSubjectRepo.findByIds.mockResolvedValue([{ id: "s1", code: "C", name: "N" }])
    mockEvalRepo.listRatingsByEvaluationIds.mockResolvedValue([])
    mockEvalRepo.listCommentsByEvaluationIds.mockResolvedValue([])

    const { subjects, facultyAggregates, departmentAggregate } = await getDepartmentSubjectResults("p1", "d1")

    expect(subjects).toEqual([])
    expect(facultyAggregates.f1).toBeUndefined()
    expect(departmentAggregate).toBeNull()
  })

  it("lists a member's subject that has no evaluation, with no rating", async () => {
    mockEvalResultRepo.listDepartmentTeachingAssignments.mockResolvedValue([assignment()])
    mockUserRepo.listByIds.mockResolvedValue([{ id: "f1", name: "F", email: "f@x", departmentId: "d1" }])
    mockEvalRepo.listSubmittedByPeriodAndEvaluatees.mockResolvedValue([])
    mockFsRepo.findByIds.mockResolvedValue([{ id: "fs1", faculty_id: "f1", subject_id: "s1" }])
    mockSubjectRepo.findByIds.mockResolvedValue([{ id: "s1", code: "C", name: "N" }])
    mockEvalRepo.listRatingsByEvaluationIds.mockResolvedValue([])
    mockEvalRepo.listCommentsByEvaluationIds.mockResolvedValue([])

    const { subjects, facultyAggregates } = await getDepartmentSubjectResults("p1", "d1")

    // The member's subject is there - the teaching - with nothing to show yet.
    expect(subjects).toHaveLength(1)
    expect(subjects[0].subjectCode).toBe("C")
    expect(subjects[0].totalRespondents).toBe(0)
    expect(subjects[0].avgRating).toBeNull()
    expect(subjects[0].remarks).toBeNull()
    // No card: there are no results to pool.
    expect(facultyAggregates.f1).toBeUndefined()
  })

  it("carries each row's section (program and name)", async () => {
    mockEvalResultRepo.listDepartmentTeachingAssignments.mockResolvedValue([assignment({ section_id: "sec1" })])
    mockUserRepo.listByIds.mockResolvedValue([{ id: "f1", name: "F", email: "f@x", departmentId: "d1" }])
    mockEvalRepo.listSubmittedByPeriodAndEvaluatees.mockResolvedValue([
      { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1", submittedAt: null },
    ])
    mockFsRepo.findByIds.mockResolvedValue([{ id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1" }])
    mockSubjectRepo.findByIds.mockResolvedValue([{ id: "s1", code: "C", name: "N" }])
    mockSectionRepo.list.mockResolvedValue([{ id: "sec1", name: "1A", program: "BSCS" }])
    mockEvalRepo.listRatingsByEvaluationIds.mockResolvedValue([])
    mockEvalRepo.listCommentsByEvaluationIds.mockResolvedValue([])

    const { subjects } = await getDepartmentSubjectResults("p1", "d1")

    expect(subjects[0].sectionProgram).toBe("BSCS")
  })
})
