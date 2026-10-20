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
  mockSupabase.from.mockImplementation((table: string) =>
    makeChain(rows[table] ?? { data: [], error: null }),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("evaluationResultRepository.listLiveFacultyResults", () => {
  it("pools a faculty's rating rows instead of averaging its subject means", async () => {
    respondWith({
      evaluations: {
        data: [
          { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" },
          { id: "e2", evaluateeId: "f1", facultySubjectId: "fs1" },
          { id: "e3", evaluateeId: "f1", facultySubjectId: "fs1" },
          { id: "e4", evaluateeId: "f1", facultySubjectId: "fs1" },
        ],
        error: null,
      },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f1" }], error: null },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f1", departmentId: "d1" }], error: null },
      evaluation_ratings: {
        data: [
          { evaluationId: "e1", rating: 4, itemId: "i1" },
          { evaluationId: "e2", rating: 4, itemId: "i1" },
          { evaluationId: "e3", rating: 4, itemId: "i1" },
          { evaluationId: "e4", rating: 2, itemId: "i1" },
        ],
        error: null,
      },
      rubric_items: { data: [{ id: "i1", categoryId: "c1" }], error: null },
      rubric_categories: { data: [{ id: "c1", name: "Professional Manner" }], error: null },
    })

    const out = await evaluationResultRepository.listLiveFacultyResults("p1")

    // the mean of the two subject means would be 3.00; pooled over the rating rows = 3.50
    expect(out).toHaveLength(1)
    expect(out[0].generalRating).toBe(3.5)
    expect(out[0].totalRespondents).toBe(4)
    expect(out[0].professionalManner).toBe(3.5)
  })

  it("gives each faculty its own row", async () => {
    respondWith({
      evaluations: {
        data: [
          { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" },
          { id: "e2", evaluateeId: "f2", facultySubjectId: "fs2" },
        ],
        error: null,
      },
      faculty_subjects: {
        data: [{ id: "fs1", faculty_id: "f1" }, { id: "fs2", faculty_id: "f2" }],
        error: null,
      },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f1", departmentId: "d1" }, { id: "f2", departmentId: "d1" }], error: null },
      evaluation_ratings: {
        data: [
          { evaluationId: "e1", rating: 4, itemId: "i1" },
          { evaluationId: "e2", rating: 2, itemId: "i1" },
        ],
        error: null,
      },
      rubric_items: { data: [{ id: "i1", categoryId: "c1" }], error: null },
      rubric_categories: { data: [{ id: "c1", name: "Professional Manner" }], error: null },
    })

    const out = await evaluationResultRepository.listLiveFacultyResults("p1")

    expect(out).toHaveLength(2)
    expect(out.find((r) => r.facultyId === "f1")?.generalRating).toBe(4)
    expect(out.find((r) => r.facultyId === "f1")?.totalRespondents).toBe(1)
    expect(out.find((r) => r.facultyId === "f2")?.generalRating).toBe(2)
    expect(out.find((r) => r.facultyId === "f2")?.totalRespondents).toBe(1)
  })

  it("skips a faculty with no usable ratings", async () => {
    respondWith({
      evaluations: { data: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }], error: null },
      faculty_subjects: { data: [{ id: "fs1", faculty_id: "f1" }], error: null },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f1", departmentId: "d1" }], error: null },
      evaluation_ratings: { data: [], error: null },
    })

    const out = await evaluationResultRepository.listLiveFacultyResults("p1")

    expect(out).toEqual([])
  })

  it("drops an evaluation whose assignment now belongs to a different faculty", async () => {
    respondWith({
      evaluations: {
        data: [
          { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" },
          { id: "e2", evaluateeId: "f1", facultySubjectId: "fs2" },
        ],
        error: null,
      },
      // fs1 was reassigned from f1 to f2 — e1 no longer belongs to f1.
      faculty_subjects: {
        data: [{ id: "fs1", faculty_id: "f2" }, { id: "fs2", faculty_id: "f1" }],
        error: null,
      },
      evaluation_periods: { data: { semesterId: "sem1" }, error: null },
      users: { data: [{ id: "f1", departmentId: "d1" }], error: null },
      evaluation_ratings: {
        data: [
          { evaluationId: "e1", rating: 4, itemId: "i1" },
          { evaluationId: "e2", rating: 2, itemId: "i1" },
        ],
        error: null,
      },
      rubric_items: { data: [{ id: "i1", categoryId: "c1" }], error: null },
      rubric_categories: { data: [{ id: "c1", name: "Professional Manner" }], error: null },
    })

    const out = await evaluationResultRepository.listLiveFacultyResults("p1")

    // only e2 (the assignment that still belongs to f1) counts
    expect(out).toHaveLength(1)
    expect(out[0].generalRating).toBe(2)
    expect(out[0].totalRespondents).toBe(1)
  })

  it("returns an empty list when the period has no submitted evaluations", async () => {
    respondWith({ evaluations: { data: [], error: null } })

    const out = await evaluationResultRepository.listLiveFacultyResults("p1")

    expect(out).toEqual([])
  })
})
