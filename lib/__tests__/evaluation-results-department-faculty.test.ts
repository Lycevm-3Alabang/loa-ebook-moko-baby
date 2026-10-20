import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock("@/lib/db", () => ({ supabase: mockSupabase }))

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

describe("evaluationResultRepository.listDepartmentFacultyIds", () => {
  it("includes a faculty whose users.departmentId is the department", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f1" }], error: null },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f1", departmentId: "d1" }], error: null },
    })

    const ids = await evaluationResultRepository.listDepartmentFacultyIds("d1", "p1")
    expect(ids).toEqual(["f1"])
  })

  it("includes a faculty with no users.departmentId but resolvable through the chain", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f2", facultySubjectId: "fs1" }], error: null },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f2", departmentId: null }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f2", section_id: "sec1" }], error: null },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
    })

    const ids = await evaluationResultRepository.listDepartmentFacultyIds("d1", "p1")
    expect(ids).toEqual(["f2"])
  })

  it("excludes a faculty of another department", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f3", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f3" }], error: null },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f3", departmentId: "d2" }], error: null },
    })

    const ids = await evaluationResultRepository.listDepartmentFacultyIds("d1", "p1")
    expect(ids).toEqual([])
  })

  it("includes a soft-deleted faculty (the chain does not filter deletedAt)", async () => {
    const chains = respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f4", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f4" }], error: null },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f4", departmentId: "d1", deletedAt: "2026-01-01T00:00:00Z" }], error: null },
    })

    const ids = await evaluationResultRepository.listDepartmentFacultyIds("d1", "p1")
    expect(ids).toEqual(["f4"])
    expect(chains.flatMap((c) => c.is.mock.calls)).toEqual([])
  })

  it("resolves the same faculty set the top-level page uses", async () => {
    respondWith({
      evaluations: {
        data: [
          { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" },
          { id: "e2", evaluateeId: "f2", facultySubjectId: "fs2" },
        ],
        error: null,
      },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f1", departmentId: "d1" }, { id: "f2", departmentId: null }], error: null },
      faculty_subjects: {
        data: [{ id: "fs1", faculty_id: "f1" }, { id: "fs2", faculty_id: "f2", section_id: "sec1" }],
        error: null,
      },
      sections: { data: [{ id: "sec1", departmentCourseId: "dc1" }], error: null },
      department_courses: { data: [{ id: "dc1", departmentId: "d1" }], error: null },
      evaluation_ratings: { data: [{ evaluationId: "e1", rating: 4, itemId: "i1" }, { evaluationId: "e2", rating: 5, itemId: "i1" }], error: null },
      rubric_items: { data: [{ id: "i1", categoryId: "c1" }], error: null },
      rubric_categories: { data: [{ id: "c1", name: "Professional Manner" }], error: null },
    })

    const live = await evaluationResultRepository.listLiveDeptAverages("p1")
    const deptIds = await evaluationResultRepository.listDepartmentFacultyIds("d1", "p1")

    const d1 = live.find((d) => d.departmentId === "d1")
    expect(d1?.facultyIds).toEqual(["f1", "f2"])
    expect(deptIds).toEqual(d1?.facultyIds)
  })
})
