import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))
const mockAggregates = vi.hoisted(() => ({
  fetchDepartmentTotals: vi.fn(),
  fetchDepartmentSentiment: vi.fn(),
  fetchAttributionWarnings: vi.fn(),
}))
const mockUserRepo = vi.hoisted(() => ({
  listByRole: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ supabase: mockSupabase }))
// The repository reads the department aggregates from Postgres now; the
// database did the grouping, so the repository's input is a set of totals.
vi.mock("@/features/evaluation-results/evaluation-aggregates", () => mockAggregates)
// The repository imports the factory for the semester lookup; stub it so the
// test does not need SUPABASE_URL in the environment.
vi.mock("@/lib/repositories/factory", () => ({
  semesterRepository: { findActive: vi.fn() },
  userRepository: mockUserRepo,
}))

import { evaluationResultRepository } from "@/features/evaluation-results/evaluation-results.repository"

type TableRows = Record<string, { data: unknown; error: unknown }>

function makeChain(resolveValue: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    not: vi.fn(() => chain),
    single: vi.fn(() => chain),
    is: vi.fn(() => chain),
    // The paged reads order by a unique column and ask for a window. The
    // fixed response below is a SHORT page, so the loop asks once and stops —
    // the same single read this suite always asserted.
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
    then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolveValue).then(onFulfilled),
  }
  return chain
}

/** Each table answers with its own rows, so the test reads like the data. */
function respondWith(rows: TableRows) {
  const chains: ReturnType<typeof makeChain>[] = []
  mockSupabase.from.mockImplementation((table: string) => {
    const chain = makeChain(rows[table] ?? { data: [], error: null })
    chains.push(chain)
    return chain
  })
  return chains
}

beforeEach(() => {
  vi.resetAllMocks()
  mockAggregates.fetchDepartmentTotals.mockResolvedValue([])
  mockAggregates.fetchDepartmentSentiment.mockResolvedValue({})
  mockAggregates.fetchAttributionWarnings.mockResolvedValue([])
  mockUserRepo.listByRole.mockResolvedValue([])
})

describe("evaluationResultRepository.listDepartmentAssignments", () => {
  it("includes an assignment whose section belongs to the department", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1" }], error: null },
      users: { data: [{ id: "f1", departmentId: "d1" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
    })

    const assignments = await evaluationResultRepository.listDepartmentAssignments("d1", "p1")
    expect(assignments.map((a) => a.id)).toEqual(["fs1"])
    expect(assignments[0].departmentId).toBe("d1")
  })

  it("gives the teacher's home department, even when the home owns no course", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1" }], error: null },
      users: { data: [{ id: "f1", departmentId: "d-home" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d-section" }], error: null },
    })

    // A department's teaching is its members' teaching: the home wins, and
    // the section's department does not take it.
    const inHome = await evaluationResultRepository.listDepartmentAssignments("d-home", "p1")
    expect(inHome.map((a) => a.id)).toEqual(["fs1"])

    const inSection = await evaluationResultRepository.listDepartmentAssignments("d-section", "p1")
    expect(inSection).toEqual([])
  })

  it("leaves a teacher with no home department unattributed", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f2", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f2", subject_id: "s1", section_id: "sec1" }], error: null },
      users: { data: [{ id: "f2", departmentId: null }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
    })

    // No home, no department: the subject is unattributed, not the section's.
    const assignments = await evaluationResultRepository.listDepartmentAssignments("d1", "p1")
    expect(assignments).toEqual([])
  })

  it("includes a soft-deleted faculty (the lookup does not filter deletedAt)", async () => {
    const chains = respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f4", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f4", subject_id: "s1", section_id: "sec1" }], error: null },
      users: { data: [{ id: "f4", departmentId: "d1", deletedAt: "2026-01-01T00:00:00Z" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
    })

    const assignments = await evaluationResultRepository.listDepartmentAssignments("d1", "p1")
    expect(assignments.map((a) => a.id)).toEqual(["fs1"])
    expect(chains.flatMap((c) => c.is.mock.calls)).toEqual([])
  })

  it("lists the department's assignments in the term, evaluated or not", async () => {
    respondWith({
      faculty_subjects: {
        data: [
          { id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1", semesterId: "sem1" },
          { id: "fs2", faculty_id: "f2", subject_id: "s2", section_id: "sec2", semesterId: "sem1" },
        ],
        error: null,
      },
      users: { data: [{ id: "f1", name: "Ana", email: "ana@x", departmentId: "d1" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
    })

    const assignments = await evaluationResultRepository.listDepartmentTeachingAssignments("d1", "sem1")

    // f1 is homed in d1, so their subject counts here; f2's does not resolve.
    expect(assignments.map((a) => a.id)).toEqual(["fs1"])
    expect(assignments[0].departmentId).toBe("d1")
  })

  it("groups the live averages by the teacher's own department", async () => {
    // The database attributes an assignment to the teacher's home department
    // (and to no department when they have none) — the rule the aggregate
    // carries. The repository reads the department off the row.
    mockAggregates.fetchDepartmentTotals.mockResolvedValue([
      {
        department_id: "d-math",
        faculty_subject_id: "fs1",
        faculty_id: "f1",
        respondent_count: 1,
        category_totals: { "Professional Manner": { sum: 4, count: 1 } },
      },
      {
        department_id: null,
        faculty_subject_id: "fs2",
        faculty_id: "f2",
        respondent_count: 1,
        category_totals: { "Professional Manner": { sum: 5, count: 1 } },
      },
    ])

    const live = await evaluationResultRepository.listLiveDeptAverages("p1")

    // f1 is homed in d-math, so their subject belongs to d-math even though
    // the section is a d-cs one. f2 has no home department: their subject is
    // unattributed, not the section's.
    expect(live.find((d) => d.departmentId === "d-math")?.facultyIds).toEqual(["f1"])
    expect(live.find((d) => d.departmentId === "d-cs")).toBeUndefined()
    expect(live.find((d) => d.departmentId === "__unknown__")?.facultyIds).toEqual(["f2"])
  })

  it("counts a faculty whose evaluation carries no rating rows", async () => {
    mockAggregates.fetchDepartmentTotals.mockResolvedValue([
      {
        department_id: "d1",
        faculty_subject_id: "fs1",
        faculty_id: "f1",
        respondent_count: 1,
        category_totals: {},
      },
    ])

    const live = await evaluationResultRepository.listLiveDeptAverages("p1")
    const d1 = live.find((d) => d.departmentId === "d1")
    // The department page shows a row for this faculty, so the list must
    // count them too — even with no rating rows to pool.
    expect(d1?.facultyIds).toEqual(["f1"])
    expect(d1?.totalRespondents).toBe(1)
    expect(d1?.avgRating).toBeNull()
  })

  it("covers the same faculty as the department's assignments", async () => {
    mockAggregates.fetchDepartmentTotals.mockResolvedValue([
      {
        department_id: "d1",
        faculty_subject_id: "fs1",
        faculty_id: "f1",
        respondent_count: 1,
        category_totals: { "Professional Manner": { sum: 4, count: 1 } },
      },
      {
        department_id: "d1",
        faculty_subject_id: "fs2",
        faculty_id: "f2",
        respondent_count: 1,
        category_totals: { "Professional Manner": { sum: 5, count: 1 } },
      },
    ])
    respondWith({
      evaluations: {
        data: [
          { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" },
          { id: "e2", evaluateeId: "f2", facultySubjectId: "fs2" },
        ],
        error: null,
      },
      faculty_subjects: {
        data: [
          { id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1" },
          { id: "fs2", faculty_id: "f2", subject_id: "s2", section_id: "sec1" },
        ],
        error: null,
      },
      users: { data: [{ id: "f1", departmentId: "d1" }, { id: "f2", departmentId: "d1" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
    })

    const live = await evaluationResultRepository.listLiveDeptAverages("p1")
    const assignments = await evaluationResultRepository.listDepartmentAssignments("d1", "p1")

    const d1 = live.find((d) => d.departmentId === "d1")
    expect(d1?.facultyIds).toEqual(["f1", "f2"])
    expect([...new Set(assignments.map((a) => a.faculty_id))]).toEqual(d1?.facultyIds)
  })
})

describe("evaluationResultRepository.listDepartmentSentiment", () => {
  it("pools the teachers' scores instead of averaging their averages", async () => {
    mockAggregates.fetchDepartmentSentiment.mockResolvedValue([
      { department_id: "d1", faculty_id: "f1", sentiment_sum: 0.3, sentiment_count: 3 },
      { department_id: "d1", faculty_id: "f2", sentiment_sum: 0.9, sentiment_count: 1 },
    ])

    const out = await evaluationResultRepository.listDepartmentSentiment("p1")

    // The mean of the two faculty averages would be 0.50; pooled over the
    // comments it is 1.2/4 = 0.30.
    expect(out["d1"]).toBe(0.3)
  })

  it("has no sentiment for a department with no scored comments", async () => {
    mockAggregates.fetchDepartmentSentiment.mockResolvedValue([])

    const out = await evaluationResultRepository.listDepartmentSentiment("p1")

    expect(out).toEqual({})
  })
})

describe("evaluationResultRepository.listSemesterRoster", () => {
  it("lists the people who teach in a department, by the teacher's own department", async () => {
    respondWith({
      evaluations: { data: [], error: null },
      faculty_subjects: {
        data: [
          { id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec-cs", semesterId: "sem1" },
          { id: "fs2", faculty_id: "f2", subject_id: "s2", section_id: "sec-math", semesterId: "sem1" },
          { id: "fs3", faculty_id: "f1", subject_id: "s3", section_id: "sec-cs2", semesterId: "sem1" },
        ],
        error: null,
      },
      users: {
        data: [
          { id: "f1", name: "Ana", email: "ana@x", departmentId: "d-math" },
          { id: "f2", name: "Ben", email: "ben@x", departmentId: null },
        ],
        error: null,
      },
      sections: {
        data: [
          { id: "sec-cs", departmentCourseId: "dc-cs" },
          { id: "sec-cs2", departmentCourseId: "dc-cs" },
          { id: "sec-math", departmentCourseId: "dc-math" },
        ],
        error: null,
      },
      department_courses: {
        data: [
          { id: "dc-cs", departmentId: "d-cs" },
          { id: "dc-math", departmentId: "d-math" },
        ],
        error: null,
      },
    })

    const roster = await evaluationResultRepository.listSemesterRoster("sem1")
    // f1 teaches two CS sections but is homed in Math: they belong to Math.
    // f2 has no home department, so their Math section belongs to nobody.
    expect(roster["d-math"].map((f) => f.id)).toEqual(["f1"])
    expect(roster["d-cs"] ?? []).toEqual([])
  })

  it("excludes the dummy account from the teaching roster", async () => {
    respondWith({
      evaluations: { data: [], error: null },
      faculty_subjects: {
        data: [{ id: "fs1", faculty_id: "f-dummy", subject_id: "s1", section_id: "sec1", semesterId: "sem1" }],
        error: null,
      },
      users: {
        data: [{ id: "f-dummy", name: "Unassigned Faculty", email: "placeholder@lyceumalabang.edu.ph", departmentId: null }],
        error: null,
      },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
    })

    const roster = await evaluationResultRepository.listSemesterRoster("sem1")
    expect(roster["d1"] ?? []).toEqual([])
  })
})

describe("evaluationResultRepository.listAttributionWarnings", () => {
  /**
   * The period's facts, as the app's own reads return them: the submitted
   * evaluations, the assignments they point at, the teachers' home
   * departments and the period's semester.
   */
  function respondWithPeriodFacts(over: {
    evaluations?: { id: string; evaluateeId: string; facultySubjectId: string | null }[]
    facultySubjects?: { id: string; faculty_id: string; semesterId: string | null }[]
    users?: { id: string; name: string; email: string; departmentId: string | null }[]
    periodSemesterId?: string | null
  } = {}) {
    respondWith({
      evaluations: { data: over.evaluations ?? [], error: null },
      faculty_subjects: {
        data: (over.facultySubjects ?? []).map((fs) => ({
          id: fs.id,
          faculty_id: fs.faculty_id,
          subject_id: "s1",
          section_id: null,
          semesterId: fs.semesterId,
        })),
        error: null,
      },
      users: { data: over.users ?? [], error: null },
      evaluation_periods: { data: { semesterId: over.periodSemesterId ?? "sem1" }, error: null },
    })
  }

  it("reports nothing when every evaluation is attributed and in term", async () => {
    respondWithPeriodFacts({
      evaluations: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }],
      facultySubjects: [{ id: "fs1", faculty_id: "f1", semesterId: "sem1" }],
      users: [{ id: "f1", name: "Ana", email: "ana@x", departmentId: "d1" }],
    })

    const warnings = await evaluationResultRepository.listAttributionWarnings("p1")
    expect(warnings.unattributed.count).toBe(0)
    expect(warnings.offSemester.count).toBe(0)
  })

  it("reports an assignment whose department cannot be resolved", async () => {
    respondWithPeriodFacts({
      evaluations: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }],
      facultySubjects: [{ id: "fs1", faculty_id: "f1", semesterId: "sem1" }],
      users: [{ id: "f1", name: "Ana", email: "ana@x", departmentId: null }],
    })

    const warnings = await evaluationResultRepository.listAttributionWarnings("p1")
    expect(warnings.unattributed.count).toBe(1)
    expect(warnings.unattributed.faculty[0].name).toBe("Ana")
  })

  it("reports an assignment from another semester than the period", async () => {
    respondWithPeriodFacts({
      evaluations: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }],
      facultySubjects: [{ id: "fs1", faculty_id: "f1", semesterId: "semOTHER" }],
      users: [{ id: "f1", name: "Ana", email: "ana@x", departmentId: "d1" }],
    })

    const warnings = await evaluationResultRepository.listAttributionWarnings("p1")
    expect(warnings.offSemester.count).toBe(1)
    expect(warnings.offSemester.faculty[0].name).toBe("Ana")
    // The teacher has a home department, so the evaluation is attributed, not orphaned.
    expect(warnings.unattributed.count).toBe(0)
  })

  it("scopes the warning to one department", async () => {
    respondWithPeriodFacts({
      evaluations: [
        { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" },
        { id: "e2", evaluateeId: "f2", facultySubjectId: "fs2" },
      ],
      facultySubjects: [
        { id: "fs1", faculty_id: "f1", semesterId: "semOTHER" },
        { id: "fs2", faculty_id: "f2", semesterId: "semOTHER" },
      ],
      users: [
        { id: "f1", name: "Ana", email: "ana@x", departmentId: "d1" },
        { id: "f2", name: "Ben", email: "ben@x", departmentId: "d2" },
      ],
    })

    const scoped = await evaluationResultRepository.listAttributionWarnings("p1", "d1")
    expect(scoped.offSemester.count).toBe(1)
    expect(scoped.offSemester.faculty.map((f) => f.id)).toEqual(["f1"])

    const unscoped = await evaluationResultRepository.listAttributionWarnings("p1")
    expect(unscoped.offSemester.count).toBe(2)
  })

  it("drops the department-less assignments from a scoped warning", async () => {
    respondWithPeriodFacts({
      evaluations: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }],
      facultySubjects: [{ id: "fs1", faculty_id: "f1", semesterId: "sem1" }],
      users: [{ id: "f1", name: "Ana", email: "ana@x", departmentId: null }],
    })

    const scoped = await evaluationResultRepository.listAttributionWarnings("p1", "d1")
    expect(scoped.unattributed.count).toBe(0)
    expect(scoped.unattributed.faculty).toEqual([])

    const unscoped = await evaluationResultRepository.listAttributionWarnings("p1")
    expect(unscoped.unattributed.count).toBe(1)
  })
})

describe("evaluationResultRepository.listDepartmentFigures", () => {
  /** A period's facts: the evaluations, the assignments, the ratings. */
  function respondWithDepartmentFacts(over: {
    evaluations?: { id: string; evaluateeId: string; facultySubjectId: string | null }[]
    assignmentFaculty?: string
    users?: { id: string; name: string; email: string; departmentId: string | null }[]
    ratings?: { evaluationId: string; rating: number; itemId: string }[]
    comments?: { evaluationId: string; sentimentScore: number | null }[]
  } = {}) {
    respondWith({
      evaluations: { data: over.evaluations ?? [], error: null },
      faculty_subjects: {
        data: [{ id: "fs1", faculty_id: over.assignmentFaculty ?? "f1", subject_id: "s1", section_id: null, semesterId: "sem1" }],
        error: null,
      },
      users: { data: over.users ?? [], error: null },
      evaluation_ratings: { data: over.ratings ?? [], error: null },
      rubric_items: { data: [{ id: "i1", categoryId: "c1" }], error: null },
      rubric_categories: { data: [{ id: "c1", name: "Professional Manner" }], error: null },
      evaluation_comments: { data: over.comments ?? [], error: null },
    })
  }

  it("pools a department's ratings into its figures", async () => {
    mockUserRepo.listByRole.mockResolvedValue([
      { id: "f1", name: "Ana", email: "ana@x", departmentId: "d1", role: "FACULTY" },
    ])
    respondWithDepartmentFacts({
      evaluations: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }],
      users: [{ id: "f1", name: "Ana", email: "ana@x", departmentId: "d1" }],
      ratings: [{ evaluationId: "e1", rating: 5, itemId: "i1" }],
      comments: [{ evaluationId: "e1", sentimentScore: 0.4 }],
    })

    const figures = await evaluationResultRepository.listDepartmentFigures("d1", "p1")
    expect(figures.totalRespondents).toBe(1)
    expect(figures.avgRating).toBe(5)
    expect(figures.remarks).toBe("Outstanding")
    expect(figures.highestRubrics[0].key).toBe("professionalManner")
    expect(figures.sentimentScore).toBe(0.4)
  })

  it("drops an evaluation whose assignment no longer belongs to its evaluatee", async () => {
    mockUserRepo.listByRole.mockResolvedValue([
      { id: "f1", name: "Ana", email: "ana@x", departmentId: "d1", role: "FACULTY" },
    ])
    respondWithDepartmentFacts({
      evaluations: [{ id: "e1", evaluateeId: "f2", facultySubjectId: "fs1" }],
      users: [{ id: "f1", name: "Ana", email: "ana@x", departmentId: "d1" }],
      ratings: [{ evaluationId: "e1", rating: 5, itemId: "i1" }],
    })

    const figures = await evaluationResultRepository.listDepartmentFigures("d1", "p1")
    expect(figures.totalRespondents).toBe(0)
    expect(figures.avgRating).toBeNull()
  })

  it("leaves a teacher homed in another department out", async () => {
    mockUserRepo.listByRole.mockResolvedValue([
      { id: "f2", name: "Ben", email: "ben@x", departmentId: "d2", role: "FACULTY" },
    ])
    respondWithDepartmentFacts({
      evaluations: [{ id: "e1", evaluateeId: "f2", facultySubjectId: "fs1" }],
      users: [{ id: "f2", name: "Ben", email: "ben@x", departmentId: "d2" }],
    })

    const figures = await evaluationResultRepository.listDepartmentFigures("d1", "p1")
    expect(figures.totalRespondents).toBe(0)
    expect(figures.avgRating).toBeNull()
  })
})

describe("evaluationResultRepository.listPeriodFigures", () => {
  function respondWithPeriodFacts(rows: {
    evaluations: { id: string; evaluateeId: string; facultySubjectId: string | null }[]
    facultySubjects: { id: string; faculty_id: string }[]
    users: { id: string; departmentId: string | null }[]
  }) {
    respondWith({
      evaluations: { data: rows.evaluations, error: null },
      faculty_subjects: {
        data: rows.facultySubjects.map((fs) => ({
          id: fs.id,
          faculty_id: fs.faculty_id,
          subject_id: "s1",
          section_id: null,
          semesterId: "sem1",
        })),
        error: null,
      },
      users: { data: rows.users, error: null },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
    })
  }

  it("counts a department's responses and names the faculty they are", async () => {
    respondWithPeriodFacts({
      evaluations: [
        { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" },
        { id: "e2", evaluateeId: "f1", facultySubjectId: "fs1" },
      ],
      facultySubjects: [{ id: "fs1", faculty_id: "f1" }],
      users: [{ id: "f1", departmentId: "d1" }],
    })

    const figures = await evaluationResultRepository.listPeriodFigures("p1")
    expect(figures.departments).toHaveLength(1)
    expect(figures.departments[0].departmentId).toBe("d1")
    expect(figures.departments[0].totalRespondents).toBe(2)
    expect(figures.departments[0].facultyIds).toEqual(["f1"])
  })

  it("drops an evaluation whose assignment no longer belongs to its evaluatee", async () => {
    respondWithPeriodFacts({
      evaluations: [{ id: "e1", evaluateeId: "f2", facultySubjectId: "fs1" }],
      facultySubjects: [{ id: "fs1", faculty_id: "f1" }],
      users: [{ id: "f1", departmentId: "d1" }],
    })

    // The live-eval rule: the assignment has another faculty now.
    const figures = await evaluationResultRepository.listPeriodFigures("p1")
    expect(figures.departments).toEqual([])
  })

  it("leaves a teacher with no home department unattributed", async () => {
    respondWithPeriodFacts({
      evaluations: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }],
      facultySubjects: [{ id: "fs1", faculty_id: "f1" }],
      users: [{ id: "f1", departmentId: null }],
    })

    const figures = await evaluationResultRepository.listPeriodFigures("p1")
    expect(figures.departments).toEqual([])
    expect(figures.warnings.unattributed.count).toBe(1)
  })
})
