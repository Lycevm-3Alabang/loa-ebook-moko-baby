import { describe, it, expect, vi, beforeEach } from "vitest"
import type { DepartmentFigures, FacultyFigures } from "@/lib/types"

const mockResultRepo = vi.hoisted(() => ({
  listDepartmentFigures: vi.fn(),
  listFacultyFigures: vi.fn(),
}))

vi.mock("@/lib/repositories/factory", () => ({
  evaluationResultRepository: mockResultRepo,
}))

import {
  getCachedDepartmentFigures,
  getCachedFacultyFigures,
} from "@/features/evaluation-results/figure-cache"

function facultyFigures(facultyId: string): FacultyFigures {
  return {
    facultyId,
    totalRespondents: 5,
    avgRating: 4.2,
    remarks: "Very Satisfactory",
    catColumns: { professionalManner: 4.2 },
    catTotals: { "Professional Manner": { sum: 21, count: 5 } },
    highestRubrics: [],
    lowestRubrics: [],
    sentimentScore: 0.3,
  }
}

function departmentFigures(departmentId: string): DepartmentFigures {
  return {
    departmentId,
    totalRespondents: 5,
    avgRating: 4.2,
    remarks: "Very Satisfactory",
    highestRubrics: [],
    lowestRubrics: [],
    sentimentScore: 0.3,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockResultRepo.listFacultyFigures.mockImplementation(async (facultyId: string) => facultyFigures(facultyId))
  mockResultRepo.listDepartmentFigures.mockImplementation(async (departmentId: string) => departmentFigures(departmentId))
})

// The cache lives in the module, so its entries outlive a case. Every case
// therefore uses its own ids, and nothing leaks from one to the next.

describe("the figures cache", () => {
  it("reads a faculty's figures once and serves them from the cache", async () => {
    const first = await getCachedFacultyFigures("f1", "p1")
    const second = await getCachedFacultyFigures("f1", "p1")

    expect(mockResultRepo.listFacultyFigures).toHaveBeenCalledTimes(1)
    expect(first.figures.avgRating).toBe(4.2)
    expect(second.figures).toEqual(first.figures)
    // The same read, not a second one: the read time does not move.
    expect(second.readAt).toBe(first.readAt)
  })

  it("reads again when the refresh forces it", async () => {
    await getCachedFacultyFigures("f2", "p2")
    await getCachedFacultyFigures("f2", "p2", true)

    expect(mockResultRepo.listFacultyFigures).toHaveBeenCalledTimes(2)
  })

  it("keeps a department's figures and a faculty's figures apart", async () => {
    // The same id in both caches: the keys are namespaced, so neither entry
    // can answer for the other.
    const department = await getCachedDepartmentFigures("shared", "p3")
    const faculty = await getCachedFacultyFigures("shared", "p3")

    expect(department.figures.departmentId).toBe("shared")
    expect(faculty.figures.facultyId).toBe("shared")
    expect(mockResultRepo.listDepartmentFigures).toHaveBeenCalledTimes(1)
    expect(mockResultRepo.listFacultyFigures).toHaveBeenCalledTimes(1)
  })

  it("never reads the same faculty twice at once", async () => {
    let release: (figures: FacultyFigures) => void = () => {}
    mockResultRepo.listFacultyFigures.mockImplementation(
      () => new Promise<FacultyFigures>((resolve) => { release = resolve }),
    )

    const first = getCachedFacultyFigures("f4", "p4")
    const second = getCachedFacultyFigures("f4", "p4")
    release(facultyFigures("f4"))
    const [a, b] = await Promise.all([first, second])

    // Two callers, one read: the second waits for the read in flight.
    expect(mockResultRepo.listFacultyFigures).toHaveBeenCalledTimes(1)
    expect(a.readAt).toBe(b.readAt)
  })
})
