import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock("@/lib/db", () => ({ supabase: mockSupabase }))
// The repository imports the factory for the semester lookup; stub it so the
// test does not need SUPABASE_URL in the environment.
vi.mock("@/lib/repositories/factory", () => ({
  semesterRepository: { findActive: vi.fn() },
  userRepository: { listByRole: vi.fn(), listByIds: vi.fn() },
}))

import { evaluationResultRepository } from "@/features/evaluation-results/evaluation-results.repository"
import { computeCategoryAveragesFromTotals, poolCategoryTotals } from "@/lib/evaluation-utils"

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
    // fixed response below is a SHORT page, so the loop asks once and stops.
    order: vi.fn(() => chain),
    range: vi.fn(() => chain),
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

/** A period's facts for one faculty: the evaluations, the assignments, the ratings. */
function respondWithFacts(over: {
  evaluations?: { id: string; evaluateeId: string; facultySubjectId: string | null }[]
  assignmentFaculty?: string
  ratings?: { evaluationId: string; rating: number; itemId: string }[]
  comments?: { evaluationId: string; sentimentScore: number | null }[]
} = {}) {
  respondWith({
    evaluations: { data: over.evaluations ?? [], error: null },
    faculty_subjects: {
      data: [
        { id: "fs1", faculty_id: over.assignmentFaculty ?? "f1", subject_id: "s1", section_id: null, semesterId: "sem1" },
        { id: "fs2", faculty_id: over.assignmentFaculty ?? "f1", subject_id: "s2", section_id: null, semesterId: "sem1" },
      ],
      error: null,
    },
    evaluation_ratings: { data: over.ratings ?? [], error: null },
    rubric_items: { data: [{ id: "i1", categoryId: "c1" }], error: null },
    rubric_categories: { data: [{ id: "c1", name: "Professional Manner" }], error: null },
    evaluation_comments: { data: over.comments ?? [], error: null },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe("evaluationResultRepository.listFacultyFigures", () => {
  it("pools a faculty's ratings into their figures", async () => {
    respondWithFacts({
      evaluations: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }],
      ratings: [{ evaluationId: "e1", rating: 5, itemId: "i1" }],
      comments: [{ evaluationId: "e1", sentimentScore: 0.4 }],
    })

    const figures = await evaluationResultRepository.listFacultyFigures("f1", "p1")

    expect(figures.facultyId).toBe("f1")
    expect(figures.totalRespondents).toBe(1)
    expect(figures.avgRating).toBe(5)
    expect(figures.remarks).toBe("Outstanding")
    expect(figures.catColumns.professionalManner).toBe(5)
    expect(figures.highestRubrics[0].key).toBe("professionalManner")
    expect(figures.sentimentScore).toBe(0.4)
  })

  it("keeps the weights, so the figures pool over the rows and not over the means", async () => {
    // One subject averages 4.00 over one response, the other 3.00 over three.
    // The mean of the two subject means is 3.50; pooled over the rating rows
    // it is 13/4 = 3.25 — and the totals are what make that pool possible.
    respondWithFacts({
      evaluations: [
        { id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" },
        { id: "e2", evaluateeId: "f1", facultySubjectId: "fs2" },
      ],
      ratings: [
        { evaluationId: "e1", rating: 4, itemId: "i1" },
        { evaluationId: "e2", rating: 3, itemId: "i1" },
        { evaluationId: "e2", rating: 3, itemId: "i1" },
        { evaluationId: "e2", rating: 3, itemId: "i1" },
      ],
    })

    const figures = await evaluationResultRepository.listFacultyFigures("f1", "p1")

    expect(figures.totalRespondents).toBe(2)
    expect(figures.catTotals["Professional Manner"]).toEqual({ sum: 13, count: 4 })
    expect(computeCategoryAveragesFromTotals(figures.catTotals)["Professional Manner"]).toBe(3.25)
    expect(figures.avgRating).toBe(3.25)
  })

  it("drops an evaluation whose assignment no longer belongs to its evaluatee", async () => {
    respondWithFacts({
      evaluations: [{ id: "e1", evaluateeId: "f2", facultySubjectId: "fs1" }],
      ratings: [{ evaluationId: "e1", rating: 5, itemId: "i1" }],
    })

    const figures = await evaluationResultRepository.listFacultyFigures("f1", "p1")

    expect(figures.totalRespondents).toBe(0)
    expect(figures.avgRating).toBeNull()
    expect(figures.catTotals).toEqual({})
  })

  it("counts a faculty whose evaluation carries no rating rows", async () => {
    respondWithFacts({
      evaluations: [{ id: "e1", evaluateeId: "f1", facultySubjectId: "fs1" }],
    })

    const figures = await evaluationResultRepository.listFacultyFigures("f1", "p1")

    // The response counts; there is nothing to average.
    expect(figures.totalRespondents).toBe(1)
    expect(figures.avgRating).toBeNull()
    expect(figures.remarks).toBeNull()
    expect(figures.catTotals).toEqual({})
  })

  it("leaves a faculty with no evaluations empty", async () => {
    respondWithFacts()

    const figures = await evaluationResultRepository.listFacultyFigures("f1", "p1")

    expect(figures.totalRespondents).toBe(0)
    expect(figures.avgRating).toBeNull()
    expect(figures.sentimentScore).toBeNull()
  })
})

describe("the faculty figures pool into a department's figure", () => {
  it("adds the weights, so the department's mean is over the rows", () => {
    // Ana: 13 over 4 ratings (3.25). Ben: 9 over 2 ratings (4.50). The mean of
    // the two means is 3.875; pooled over the six rows it is 22/6 = 3.667.
    const pooled = poolCategoryTotals([
      { "Professional Manner": { sum: 13, count: 4 } },
      { "Professional Manner": { sum: 9, count: 2 } },
    ])

    expect(pooled["Professional Manner"]).toEqual({ sum: 22, count: 6 })
    expect(computeCategoryAveragesFromTotals(pooled)["Professional Manner"]).toBeCloseTo(3.67, 2)
  })
})
