import { describe, it, expect, vi, beforeEach } from "vitest"
import type { FacultyFigures } from "@/lib/types"

const mockDeptRepo = vi.hoisted(() => ({
  listAll: vi.fn(),
  findByDeanId: vi.fn(),
}))
const mockUserRepo = vi.hoisted(() => ({
  listByRole: vi.fn(),
  listByIds: vi.fn(),
}))
const mockPeriodRepo = vi.hoisted(() => ({
  findActive: vi.fn(),
}))
const mockResultRepo = vi.hoisted(() => ({
  listFacultyFigures: vi.fn(),
  listDepartmentFigures: vi.fn(),
}))

vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  userRepository: mockUserRepo,
  evaluationPeriodRepository: mockPeriodRepo,
  evaluationResultRepository: mockResultRepo,
}))

import {
  getDeanEvalReportData,
  getFacultyEvalReportData,
} from "@/features/evaluations/evaluation-report.service"

const DEPT = { id: "dept-1", name: "CCS", code: "CCS", deanId: "dean-1" }

/** One faculty's figures: a pooled average and the weights behind it. */
function figures(
  facultyId: string,
  over: { sum: number; count: number; respondents?: number },
): FacultyFigures {
  const avg = over.count > 0 ? Math.round((over.sum / over.count) * 100) / 100 : null
  return {
    facultyId,
    totalRespondents: over.respondents ?? over.count,
    avgRating: avg,
    remarks:
      avg === null
        ? null
        : avg >= 4.5
          ? "Outstanding"
          : avg >= 3.5
            ? "Very Satisfactory"
            : avg >= 2.5
              ? "Satisfactory"
              : avg >= 1.5
                ? "Unsatisfactory"
                : "Poor",
    catColumns: { professionalManner: avg },
    catTotals: { "Professional Manner": { sum: over.sum, count: over.count } },
    highestRubrics: [],
    lowestRubrics: [],
    sentimentScore: 0.3,
  }
}

/** The department's roster for a case: the members, and anyone homed elsewhere. */
function roster(...ids: string[]) {
  return ids.map((id) => ({ id, name: `Teacher ${id}`, email: `${id}@x`, departmentId: "dept-1", role: "FACULTY" }))
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDeptRepo.listAll.mockResolvedValue([DEPT])
  mockDeptRepo.findByDeanId.mockResolvedValue(DEPT)
  mockUserRepo.listByRole.mockResolvedValue([])
  mockUserRepo.listByIds.mockResolvedValue([])
  mockPeriodRepo.findActive.mockResolvedValue({ id: "p1" })
  mockResultRepo.listFacultyFigures.mockImplementation(async (facultyId: string) => figures(facultyId, { sum: 13, count: 4 }))
})

// The figures cache lives in the module, so its entries outlive a case. Every
// case therefore uses its own faculty ids, and nothing leaks from one to the
// next.

describe("getDeanEvalReportData", () => {
  it("carries the department's pooled row and one row per member", async () => {
    mockUserRepo.listByRole.mockResolvedValue([
      ...roster("d1a", "d1b"),
      { id: "other", name: "Dan Poe", email: "dan@x", departmentId: "dept-2", role: "FACULTY" },
    ])
    mockResultRepo.listFacultyFigures.mockImplementation(async (facultyId: string) =>
      facultyId === "d1a" ? figures(facultyId, { sum: 13, count: 4 }) : figures(facultyId, { sum: 9, count: 2 }),
    )

    const data = await getDeanEvalReportData("dean-1", "p1")

    // Dan is homed in dept-2, so he is not this department's.
    expect(data.facultyResults.map((f) => f.facultyId)).toEqual(["d1a", "d1b"])
    expect(data.departments).toHaveLength(1)
    expect(data.departments[0].departmentName).toBe("CCS")
    expect(data.departments[0].totalRespondents).toBe(6)
    expect(data.departments[0].facultyCount).toBe(2)
  })

  it("pools the department's figure over the rows, not over the faculty's means", async () => {
    // Ana: 13 over 4 ratings (3.25). Ben: 9 over 2 ratings (4.50). The mean of
    // the two means is 3.875; pooled over the six rows it is 22/6 = 3.667.
    mockUserRepo.listByRole.mockResolvedValue(roster("d2a", "d2b"))
    mockResultRepo.listFacultyFigures.mockImplementation(async (facultyId: string) =>
      facultyId === "d2a" ? figures(facultyId, { sum: 13, count: 4 }) : figures(facultyId, { sum: 9, count: 2 }),
    )

    const data = await getDeanEvalReportData("dean-1", "p1")

    expect(data.departments[0].avgGeneralRating).toBeCloseTo(3.67, 2)
    expect(data.departments[0].avgGeneralRating).not.toBeCloseTo(3.875, 2)
  })

  it("gives each faculty their own row", async () => {
    mockUserRepo.listByRole.mockResolvedValue(roster("d3a", "d3b"))
    mockResultRepo.listFacultyFigures.mockImplementation(async (facultyId: string) =>
      facultyId === "d3a" ? figures(facultyId, { sum: 20, count: 4 }) : figures(facultyId, { sum: 4, count: 4 }),
    )

    const data = await getDeanEvalReportData("dean-1", "p1")

    const first = data.facultyResults.find((f) => f.facultyId === "d3a")
    const second = data.facultyResults.find((f) => f.facultyId === "d3b")
    expect(first?.generalRating).toBe(5)
    expect(first?.professionalManner).toBe(5)
    expect(second?.generalRating).toBe(1)
  })

  it("returns nothing when the dean manages no department", async () => {
    mockDeptRepo.findByDeanId.mockResolvedValue(null)

    const data = await getDeanEvalReportData("ghost", "p1")

    expect(data.departments).toEqual([])
    expect(data.facultyResults).toEqual([])
  })
})

describe("getFacultyEvalReportData", () => {
  it("carries the faculty's own row", async () => {
    mockUserRepo.listByIds.mockResolvedValue([
      { id: "fa", name: "Ana Cruz", email: "ana@x", departmentId: "dept-1", role: "FACULTY" },
    ])
    mockResultRepo.listFacultyFigures.mockResolvedValue(figures("fa", { sum: 20, count: 4 }))

    const data = await getFacultyEvalReportData("fa", "p1")

    expect(data.facultyResults).toHaveLength(1)
    expect(data.facultyResults[0].facultyName).toBe("Ana Cruz")
    expect(data.facultyResults[0].generalRating).toBe(5)
    expect(data.facultyResults[0].totalRespondents).toBe(4)
  })

  it("carries the row of the department they are homed in", async () => {
    mockUserRepo.listByIds.mockResolvedValue([
      { id: "fb", name: "Ana Cruz", email: "ana@x", departmentId: "dept-1", role: "FACULTY" },
    ])
    mockResultRepo.listFacultyFigures.mockResolvedValue(figures("fb", { sum: 20, count: 4 }))

    const data = await getFacultyEvalReportData("fb", "p1")

    expect(data.departments).toHaveLength(1)
    expect(data.departments[0].departmentId).toBe("dept-1")
    expect(data.departments[0].departmentName).toBe("CCS")
    expect(data.departments[0].avgGeneralRating).toBe(5)
  })

  it("leaves a faculty with no home department without a department row", async () => {
    mockUserRepo.listByIds.mockResolvedValue([
      { id: "fc", name: "Ana Cruz", email: "ana@x", departmentId: null, role: "FACULTY" },
    ])

    const data = await getFacultyEvalReportData("fc", "p1")

    expect(data.departments).toEqual([])
    expect(data.facultyResults).toHaveLength(1)
  })
})
