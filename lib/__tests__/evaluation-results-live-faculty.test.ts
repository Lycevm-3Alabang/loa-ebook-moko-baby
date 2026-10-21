import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAggregates = vi.hoisted(() => ({
  fetchDepartmentTotals: vi.fn(),
  fetchDepartmentSentiment: vi.fn(),
  fetchAttributionWarnings: vi.fn(),
}))

// The repository module imports the Supabase client at load time; stub it so
// the test does not need SUPABASE_URL in the environment.
vi.mock("@/lib/db", () => ({ supabase: { from: vi.fn() } }))
// The repository reads the department aggregates from Postgres now; the
// database did the grouping, so the repository's input is a set of totals.
vi.mock("@/features/evaluation-results/evaluation-aggregates", () => mockAggregates)
// The repository imports the factory for the semester lookup; stub it so the
// test does not need SUPABASE_URL in the environment.
vi.mock("@/lib/repositories/factory", () => ({
  semesterRepository: { findActive: vi.fn() },
}))

import { evaluationResultRepository } from "@/features/evaluation-results/evaluation-results.repository"

/** One row of the aggregate: an assignment, its teacher and its totals. */
function total(
  facultyId: string,
  facultySubjectId: string,
  sum: number,
  count: number,
  departmentId: string | null = "d1",
) {
  return {
    department_id: departmentId,
    faculty_subject_id: facultySubjectId,
    faculty_id: facultyId,
    respondent_count: count,
    category_totals: { "Professional Manner": { sum, count } },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockAggregates.fetchDepartmentTotals.mockResolvedValue([])
})

describe("evaluationResultRepository.listLiveFacultyResults", () => {
  it("pools a faculty's rating rows instead of averaging its subject means", async () => {
    // One subject averages 4.00 over one response, the other 3.00 over three.
    // The mean of the two subject means is 3.50; pooled over the rating rows
    // it is 13/4 = 3.25.
    mockAggregates.fetchDepartmentTotals.mockResolvedValue([
      total("f1", "fs1", 4, 1),
      total("f1", "fs2", 9, 3),
    ])

    const out = await evaluationResultRepository.listLiveFacultyResults("p1")

    expect(out).toHaveLength(1)
    expect(out[0].generalRating).toBe(3.25)
    expect(out[0].totalRespondents).toBe(4)
    expect(out[0].professionalManner).toBe(3.25)
  })

  it("gives each faculty its own row", async () => {
    mockAggregates.fetchDepartmentTotals.mockResolvedValue([
      total("f1", "fs1", 4, 1),
      total("f2", "fs2", 2, 1),
    ])

    const out = await evaluationResultRepository.listLiveFacultyResults("p1")

    expect(out).toHaveLength(2)
    expect(out.find((r) => r.facultyId === "f1")?.generalRating).toBe(4)
    expect(out.find((r) => r.facultyId === "f1")?.totalRespondents).toBe(1)
    expect(out.find((r) => r.facultyId === "f2")?.generalRating).toBe(2)
    expect(out.find((r) => r.facultyId === "f2")?.totalRespondents).toBe(1)
  })

  it("skips a faculty with no usable ratings", async () => {
    mockAggregates.fetchDepartmentTotals.mockResolvedValue([
      {
        department_id: "d1",
        faculty_subject_id: "fs1",
        faculty_id: "f1",
        respondent_count: 1,
        category_totals: {},
      },
    ])

    const out = await evaluationResultRepository.listLiveFacultyResults("p1")

    expect(out).toEqual([])
  })

  it("returns an empty list when the period has no submitted evaluations", async () => {
    mockAggregates.fetchDepartmentTotals.mockResolvedValue([])

    const out = await evaluationResultRepository.listLiveFacultyResults("p1")

    expect(out).toEqual([])
  })
})
