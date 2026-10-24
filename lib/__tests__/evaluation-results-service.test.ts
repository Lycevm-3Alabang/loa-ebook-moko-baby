import { describe, it, expect, vi, beforeEach } from "vitest"

const mockUserRepo = vi.hoisted(() => ({ listByIds: vi.fn(), listByDepartment: vi.fn() }))
const mockEvalRepo = vi.hoisted(() => ({
  listRatingsByEvaluationIds: vi.fn(),
  listCommentsByEvaluationIds: vi.fn(),
}))
const mockEvalResultRepo = vi.hoisted(() => ({
  listDepartmentAssignments: vi.fn(),
  listDepartmentTeachingAssignments: vi.fn(),
  listDepartmentResponseSet: vi.fn(),
}))
const mockEvalPeriodRepo = vi.hoisted(() => ({ findById: vi.fn() }))
const mockSectionRepo = vi.hoisted(() => ({ list: vi.fn() }))
const mockSubjectRepo = vi.hoisted(() => ({ findByIds: vi.fn() }))

vi.mock("@/lib/repositories/factory", () => ({
  userRepository: mockUserRepo,
  evaluationRepository: mockEvalRepo,
  evaluationResultRepository: mockEvalResultRepo,
  evaluationPeriodRepository: mockEvalPeriodRepo,
  sectionRepository: mockSectionRepo,
  subjectRepository: mockSubjectRepo,
}))

import { getDepartmentSubjectResults } from "@/features/evaluation-results/evaluation-results.service"

/** An assignment: the section is owned by the department. */
const assignment = (over: Partial<{ id: string; faculty_id: string; subject_id: string; section_id: string | null; departmentId: string | null }> = {}) => ({
  id: "fs1",
  faculty_id: "f1",
  subject_id: "s1",
  section_id: null,
  departmentId: "d1",
  ...over,
})

/** A member: an account homed in the department. */
const member = (over: Partial<{ id: string; name: string; email: string; departmentId: string | null }> = {}) => ({
  id: "f1",
  name: "F",
  email: "f@x",
  departmentId: "d1",
  ...over,
})

/**
 * The department's live response set: the members, the counted responses and
 * the assignments those responses point at. The repository decides it (the
 * period scopes the responses — contract §3.21); the service only assembles.
 */
const responseSet = (over: {
  members?: ReturnType<typeof member>[]
  evaluations?: { id: string; evaluateeId: string; facultySubjectId: string | null }[]
  assignments?: ReturnType<typeof assignment>[]
} = {}) => ({
  members: over.members ?? [member()],
  evaluations: over.evaluations ?? [],
  assignments: new Map((over.assignments ?? []).map((a) => [a.id, a])),
})

beforeEach(() => {
  vi.resetAllMocks()
  mockSectionRepo.list.mockResolvedValue([])
  mockEvalPeriodRepo.findById.mockResolvedValue({ id: "p1", semesterId: "s1" })
  mockEvalResultRepo.listDepartmentTeachingAssignments.mockResolvedValue([])
  mockEvalResultRepo.listDepartmentResponseSet.mockResolvedValue(responseSet())
  mockEvalRepo.listRatingsByEvaluationIds.mockResolvedValue([])
  mockEvalRepo.listCommentsByEvaluationIds.mockResolvedValue([])
})

describe("getDepartmentSubjectResults", () => {
  it("averages the displayed subject rows for faculty and department summaries", async () => {
    mockEvalResultRepo.listDepartmentTeachingAssignments.mockResolvedValue([
      assignment({ id: "fs1", subject_id: "s1" }),
      assignment({ id: "fs2", subject_id: "s2" }),
    ])
    mockEvalResultRepo.listDepartmentResponseSet.mockResolvedValue(responseSet({
      evaluations: [
        { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" },
        { id: "e2", evaluateeId: "f1", facultySubjectId: "fs1" },
        { id: "e3", evaluateeId: "f1", facultySubjectId: "fs1" },
        { id: "e4", evaluateeId: "f1", facultySubjectId: "fs2" },
      ],
      assignments: [assignment({ id: "fs1" }), assignment({ id: "fs2", subject_id: "s2" })],
    }))
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

    const { subjects, facultyAggregates, departmentAggregate } = await getDepartmentSubjectResults("p1", "d1")

    expect(subjects.map((s) => s.avgRating)).toEqual([4, 2])
    // One subject has three responses and the other has one; each row still
    // contributes equally to the summary.
    expect(facultyAggregates.f1.avgRating).toBe(3)
    expect(facultyAggregates.f1.totalRespondents).toBe(4)
    expect(departmentAggregate?.totalSubjects).toBe(2)
    expect(departmentAggregate?.uniqueFaculty).toBe(1)
    expect(departmentAggregate?.totalResponses).toBe(4)
    expect(departmentAggregate?.avgRating).toBe(3)
  })

  it("reads the response set and the term's teaching, and nothing else", async () => {
    mockEvalResultRepo.listDepartmentTeachingAssignments.mockResolvedValue([assignment()])
    mockEvalResultRepo.listDepartmentResponseSet.mockResolvedValue(responseSet({
      evaluations: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }],
      assignments: [assignment()],
    }))
    mockSubjectRepo.findByIds.mockResolvedValue([{ id: "s1", code: "C", name: "N" }])

    await getDepartmentSubjectResults("p1", "d1")

    // The set is the ONE place the responses are decided.
    expect(mockEvalResultRepo.listDepartmentResponseSet).toHaveBeenCalledWith("d1", "p1")
    // The term's teaching is the subject list's other half.
    expect(mockEvalResultRepo.listDepartmentTeachingAssignments).toHaveBeenCalledWith("d1", "s1")
    expect(mockUserRepo.listByDepartment).not.toHaveBeenCalled()
  })

  it("counts a response on an assignment the term no longer covers, and gives it a row", async () => {
    // The term's teaching is fs1; the period's response points at fs2 — an
    // assignment from another term. The response is in the period, so it
    // counts, and it has a row of its own.
    mockEvalResultRepo.listDepartmentTeachingAssignments.mockResolvedValue([assignment({ id: "fs1" })])
    mockEvalResultRepo.listDepartmentResponseSet.mockResolvedValue(responseSet({
      evaluations: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs2" }],
      assignments: [assignment({ id: "fs2", subject_id: "s2" })],
    }))
    mockSubjectRepo.findByIds.mockResolvedValue([
      { id: "s1", code: "C1", name: "N1" },
      { id: "s2", code: "C2", name: "N2" },
    ])

    const { subjects, departmentAggregate } = await getDepartmentSubjectResults("p1", "d1")

    // Both rows: the term's teaching and the assignment the response points at.
    expect(subjects).toHaveLength(2)
    const counted = subjects.find((s) => s.facultySubjectId === "fs2")
    expect(counted?.totalRespondents).toBe(1)
    expect(counted?.subjectCode).toBe("C2")
    // The term's subject is still there, with nothing to show.
    expect(subjects.find((s) => s.facultySubjectId === "fs1")?.totalRespondents).toBe(0)
    expect(departmentAggregate?.totalResponses).toBe(1)
  })

  it("keeps a teacher homed elsewhere out of the department's subjects and results", async () => {
    // The department's faculty read does not return them: a teacher homed in
    // d2 is not a member of d1, so neither the subject nor the results are
    // the department's.
    mockEvalResultRepo.listDepartmentResponseSet.mockResolvedValue(responseSet({
      members: [],
      evaluations: [{ id: "e1", evaluateeId: "f2", facultySubjectId: "fs1" }],
      assignments: [assignment({ faculty_id: "f2" })],
    }))

    const { subjects, facultyAggregates, departmentAggregate } = await getDepartmentSubjectResults("p1", "d1")

    expect(subjects).toEqual([])
    expect(facultyAggregates.f2).toBeUndefined()
    expect(departmentAggregate).toBeNull()
  })

  it("lists a member's subject that has no evaluation, with no rating", async () => {
    mockEvalResultRepo.listDepartmentTeachingAssignments.mockResolvedValue([assignment()])
    mockSubjectRepo.findByIds.mockResolvedValue([{ id: "s1", code: "C", name: "N" }])

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
    mockEvalResultRepo.listDepartmentResponseSet.mockResolvedValue(responseSet({
      evaluations: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }],
      assignments: [assignment({ section_id: "sec1" })],
    }))
    mockSubjectRepo.findByIds.mockResolvedValue([{ id: "s1", code: "C", name: "N" }])
    mockSectionRepo.list.mockResolvedValue([{ id: "sec1", name: "1A", program: "BSCS" }])

    const { subjects } = await getDepartmentSubjectResults("p1", "d1")

    expect(subjects[0].sectionProgram).toBe("BSCS")
  })
})
