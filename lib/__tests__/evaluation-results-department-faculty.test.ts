import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock("@/lib/db", () => ({ supabase: mockSupabase }))
// The repository imports the factory for the semester lookup; stub it so the
// test does not need SUPABASE_URL in the environment.
vi.mock("@/lib/repositories/factory", () => ({
  semesterRepository: { findActive: vi.fn() },
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

  it("gives the section's department precedence over the faculty's home department", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1" }], error: null },
      users: { data: [{ id: "f1", departmentId: "d-home" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d-section" }], error: null },
    })

    const inSection = await evaluationResultRepository.listDepartmentAssignments("d-section", "p1")
    expect(inSection.map((a) => a.id)).toEqual(["fs1"])

    const inHome = await evaluationResultRepository.listDepartmentAssignments("d-home", "p1")
    expect(inHome).toEqual([])
  })

  it("includes a dept-agnostic faculty by the section", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f2", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f2", subject_id: "s1", section_id: "sec1" }], error: null },
      users: { data: [{ id: "f2", departmentId: null }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
    })

    const assignments = await evaluationResultRepository.listDepartmentAssignments("d1", "p1")
    expect(assignments.map((a) => a.faculty_id)).toEqual(["f2"])
  })

  it("falls back to the home department when the section cannot be resolved", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1" }], error: null },
      users: { data: [{ id: "f1", departmentId: "d1" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: null }], error: null },
      department_courses: { data: [], error: null },
    })

    const assignments = await evaluationResultRepository.listDepartmentAssignments("d1", "p1")
    expect(assignments.map((a) => a.id)).toEqual(["fs1"])
    expect(assignments[0].departmentId).toBe("d1")
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

  it("groups the live averages by the section's department", async () => {
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
          { id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec-cs" },
          { id: "fs2", faculty_id: "f2", subject_id: "s2", section_id: "sec-math" },
        ],
        error: null,
      },
      users: { data: [{ id: "f1", departmentId: "d-math" }, { id: "f2", departmentId: null }], error: null },
      sections: {
        data: [
          { id: "sec-cs", departmentCourseId: "dc-cs" },
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
      evaluation_ratings: { data: [{ evaluationId: "e1", rating: 4, itemId: "i1" }, { evaluationId: "e2", rating: 5, itemId: "i1" }], error: null },
      rubric_items: { data: [{ id: "i1", categoryId: "c1" }], error: null },
      rubric_categories: { data: [{ id: "c1", name: "Professional Manner" }], error: null },
    })

    const live = await evaluationResultRepository.listLiveDeptAverages("p1")

    // f1 is homed in d-math but teaches a d-cs section: the subject belongs to
    // d-cs. f2 is dept-agnostic and teaches a d-math section.
    expect(live.find((d) => d.departmentId === "d-cs")?.facultyIds).toEqual(["f1"])
    expect(live.find((d) => d.departmentId === "d-math")?.facultyIds).toEqual(["f2"])
  })

  it("counts a faculty whose evaluation carries no rating rows", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1" }], error: null },
      users: { data: [{ id: "f1", departmentId: "d1", name: "Ana", email: "ana@x" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
      evaluation_ratings: { data: [], error: null },
      rubric_items: { data: [], error: null },
      rubric_categories: { data: [], error: null },
    })

    const live = await evaluationResultRepository.listLiveDeptAverages("p1")
    const d1 = live.find((d) => d.departmentId === "d1")
    // The department page shows a row for this faculty, so the list must
    // count them too — even with no rating rows to pool.
    expect(d1?.facultyIds).toEqual(["f1"])
    expect(d1?.totalRespondents).toBe(1)
    expect(d1?.avgRating).toBeNull()
  })

  it("covers the same faculty as the department's assignments", async () => {    respondWith({
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
      users: { data: [{ id: "f1", departmentId: "d1" }, { id: "f2", departmentId: null }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
      evaluation_ratings: { data: [{ evaluationId: "e1", rating: 4, itemId: "i1" }, { evaluationId: "e2", rating: 5, itemId: "i1" }], error: null },
      rubric_items: { data: [{ id: "i1", categoryId: "c1" }], error: null },
      rubric_categories: { data: [{ id: "c1", name: "Professional Manner" }], error: null },
    })

    const live = await evaluationResultRepository.listLiveDeptAverages("p1")
    const assignments = await evaluationResultRepository.listDepartmentAssignments("d1", "p1")

    const d1 = live.find((d) => d.departmentId === "d1")
    expect(d1?.facultyIds).toEqual(["f1", "f2"])
    expect([...new Set(assignments.map((a) => a.faculty_id))]).toEqual(d1?.facultyIds)
  })
})

describe("evaluationResultRepository.listDepartmentRosters", () => {
  it("lists the faculty who were assigned to teach and received nothing", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: {
        data: [
          { id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1", semesterId: "sem1" },
          { id: "fs2", faculty_id: "f2", subject_id: "s1", section_id: "sec1", semesterId: "sem1" },
        ],
        error: null,
      },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: {
        data: [
          { id: "f1", name: "Ana", email: "ana@x", departmentId: "d1" },
          { id: "f2", name: "Ben", email: "ben@x", departmentId: "d1" },
        ],
        error: null,
      },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
    })

    const rosters = await evaluationResultRepository.listDepartmentRosters("p1")
    // f1 has an evaluation, so only f2 is missing one.
    expect(rosters.d1).toEqual([{ id: "f2", name: "Ben" }])
  })

  it("excludes the dummy account, which owns assignments but is not a person", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: {
        data: [
          { id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1", semesterId: "sem1" },
          { id: "fs3", faculty_id: "f-dummy", subject_id: "s1", section_id: "sec1", semesterId: "sem1" },
        ],
        error: null,
      },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: {
        data: [
          { id: "f1", name: "Ana", email: "ana@x", departmentId: "d1" },
          { id: "f-dummy", name: "Unassigned Faculty", email: "placeholder@lyceumalabang.edu.ph", departmentId: null },
        ],
        error: null,
      },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
    })

    const rosters = await evaluationResultRepository.listDepartmentRosters("p1")
    expect(rosters.d1 ?? []).toEqual([])
  })

  it("returns nothing when the period has no semester", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [], error: null },
      evaluation_periods: { data: { semesterId: null }, error: null },
      users: { data: [], error: null },
      sections: { data: [], error: null },
      department_courses: { data: [], error: null },
    })

    const rosters = await evaluationResultRepository.listDepartmentRosters("p1")
    expect(rosters).toEqual({})
  })
})

describe("evaluationResultRepository.listSemesterRoster", () => {
  it("lists the people who teach in a department, by the section's department", async () => {
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
    // f1 teaches two CS sections but is homed in Math: they belong to CS.
    expect(roster["d-cs"].map((f) => f.id)).toEqual(["f1"])
    expect(roster["d-math"].map((f) => f.id)).toEqual(["f2"])
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
  it("reports nothing when every evaluation is attributed and in term", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1", semesterId: "sem1" }], error: null },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f1", departmentId: "d1", name: "Ana" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
    })

    const warnings = await evaluationResultRepository.listAttributionWarnings("p1")
    expect(warnings.unattributed.count).toBe(0)
    expect(warnings.offSemester.count).toBe(0)
  })

  it("reports an assignment whose department cannot be resolved", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1", semesterId: "sem1" }], error: null },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f1", departmentId: null, name: "Ana" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: null }], error: null },
      department_courses: { data: [], error: null },
    })

    const warnings = await evaluationResultRepository.listAttributionWarnings("p1")
    expect(warnings.unattributed.count).toBe(1)
    expect(warnings.unattributed.faculty[0].name).toBe("Ana")
  })

  it("reports an assignment from another semester than the period", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1", semesterId: "semOTHER" }], error: null },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f1", departmentId: "d1", name: "Ana" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
    })

    const warnings = await evaluationResultRepository.listAttributionWarnings("p1")
    expect(warnings.offSemester.count).toBe(1)
    expect(warnings.offSemester.faculty[0].name).toBe("Ana")
    // The section still resolves, so the evaluation is attributed, not orphaned.
    expect(warnings.unattributed.count).toBe(0)
  })

  it("scopes the warning to one department", async () => {
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
          { id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1", semesterId: "semOTHER" },
          { id: "fs2", faculty_id: "f2", subject_id: "s2", section_id: "sec2", semesterId: "semOTHER" },
        ],
        error: null,
      },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: {
        data: [
          { id: "f1", departmentId: "d1", name: "Ana", email: "ana@x" },
          { id: "f2", departmentId: "d2", name: "Ben", email: "ben@x" },
        ],
        error: null,
      },
      sections: {
        data: [
          { id: "sec1", departmentCourseId: "dc1" },
          { id: "sec2", departmentCourseId: "dc2" },
        ],
        error: null,
      },
      department_courses: {
        data: [
          { id: "dc1", departmentId: "d1" },
          { id: "dc2", departmentId: "d2" },
        ],
        error: null,
      },
    })

    const scoped = await evaluationResultRepository.listAttributionWarnings("p1", "d1")
    expect(scoped.offSemester.count).toBe(1)
    expect(scoped.offSemester.faculty.map((f) => f.id)).toEqual(["f1"])

    const unscoped = await evaluationResultRepository.listAttributionWarnings("p1")
    expect(unscoped.offSemester.count).toBe(2)
  })

  it("drops the department-less assignments from a scoped warning", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f1", subject_id: "s1", section_id: "sec1", semesterId: "sem1" }], error: null },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f1", departmentId: null, name: "Ana", email: "ana@x" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: null }], error: null },
      department_courses: { data: [], error: null },
    })

    const scoped = await evaluationResultRepository.listAttributionWarnings("p1", "d1")
    expect(scoped.unattributed.count).toBe(0)
    expect(scoped.unattributed.faculty).toEqual([])

    const unscoped = await evaluationResultRepository.listAttributionWarnings("p1")
    expect(unscoped.unattributed.count).toBe(1)
  })
})
