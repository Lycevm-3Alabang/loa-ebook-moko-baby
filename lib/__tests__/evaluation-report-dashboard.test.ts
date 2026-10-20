import { describe, it, expect, vi, beforeEach } from "vitest"
import type {
  DepartmentData,
  EvaluationPeriodData,
  EvaluationResultData,
  FacultySubjectWithEmbeds,
  LiveDeptAverage,
  RubricGroupWithCategories,
  SemesterData,
  UserData,
} from "@/lib/types"

const mockDeptRepo = vi.hoisted(() => ({
  listAll: vi.fn(),
  findById: vi.fn(),
  findByDeanId: vi.fn(),
}))

const mockUserRepo = vi.hoisted(() => ({
  listByIds: vi.fn(),
}))

const mockEvalPeriodRepo = vi.hoisted(() => ({
  findActive: vi.fn(),
  findById: vi.fn(),
  findBySemester: vi.fn(),
  list: vi.fn(),
}))

const mockEvalResultRepo = vi.hoisted(() => ({
  listLiveFacultyResults: vi.fn(),
  listLiveDeptAverages: vi.fn(),
}))

const mockFacultySubjectRepo = vi.hoisted(() => ({
  listAllWithEmbeds: vi.fn(),
}))

const mockEnrollmentRepo = vi.hoisted(() => ({
  countByFacultySubjectIds: vi.fn(),
}))

const mockRubricGroupRepo = vi.hoisted(() => ({
  findById: vi.fn(),
}))

vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  userRepository: mockUserRepo,
  evaluationPeriodRepository: mockEvalPeriodRepo,
  evaluationResultRepository: mockEvalResultRepo,
  facultySubjectRepository: mockFacultySubjectRepo,
  studentEnrollmentRepository: mockEnrollmentRepo,
  rubricGroupRepository: mockRubricGroupRepo,
}))

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { getDeanDashboardData, getAdminDashboardData } from "@/features/evaluations/evaluation-report.service"
import { CATEGORY_KEYS } from "@/lib/evaluation-utils"

beforeEach(() => {
  vi.resetAllMocks()
  seedDefaults()
})

const DEPT_CCS = { id: "dept-1", name: "CCS", code: "CCS", deanId: "dean-1" } as unknown as DepartmentData
const DEPT_COE = { id: "dept-2", name: "COE", code: "COE", deanId: "dean-2" } as unknown as DepartmentData

const USERS = [
  { id: "f1", name: "Ana Cruz", departmentId: "dept-1" },
  { id: "f2", name: "Ben Lim", departmentId: "dept-1" },
  { id: "f3", name: "Cara Uy", departmentId: "dept-1" },
  { id: "x1", name: "Dan Poe", departmentId: "dept-2" },
] as unknown as UserData[]

const P3: EvaluationPeriodData = {
  id: "p3", semesterId: "s1", name: "Final", source: null,
  startDate: null, endDate: null, isActive: true, rubricGroupId: "g1",
  createdAt: new Date("2026-01-01"), semesterTitle: "Sem 1",
}
const P2: EvaluationPeriodData = {
  id: "p2", semesterId: "s1", name: "Prelim", source: null,
  startDate: null, endDate: null, isActive: false, rubricGroupId: "g1",
  createdAt: new Date("2025-06-01"), semesterTitle: "Sem 1",
}
const P1: EvaluationPeriodData = {
  id: "p1", semesterId: "s0", name: "Final", source: null,
  startDate: null, endDate: null, isActive: false, rubricGroupId: "g0",
  createdAt: new Date("2025-01-01"), semesterTitle: "Sem 0",
}

function resultRow(periodId: string, facultyId: string, respondents: number, score: number, remarks: string): EvaluationResultData {
  return {
    id: `r-${periodId}-${facultyId}`,
    evaluationPeriodId: periodId,
    facultyId,
    subjectId: "sub1",
    departmentId: "dept-1",
    totalRespondents: respondents,
    professionalManner: score,
    communicationWithStudent: score,
    studentEngagement: score,
    learningMaterials: score,
    timeManagement: score,
    experientialLearning: score,
    respectUniqueness: score,
    assessmentAndFeedback: score,
    generalRating: score,
    remarks,
    computedAt: new Date("2026-01-01"),
    isResultsVisible: true,
  }
}

const RESULTS_BY_PERIOD: Record<string, EvaluationResultData[]> = {
  p3: [
    resultRow("p3", "f1", 10, 4.0, "Very Satisfactory"),
    resultRow("p3", "f2", 3, 5.0, "Outstanding"),
    resultRow("p3", "f3", 8, 2.0, "Unsatisfactory"),
    { ...resultRow("p3", "x1", 10, 4.6, "Outstanding"), departmentId: "dept-2" },
  ],
  p2: [resultRow("p2", "f1", 6, 3.0, "Satisfactory")],
  p1: [resultRow("p1", "f1", 6, 3.5, "Very Satisfactory")],
}

/** The POOLED department figures the repository produces (not a mean of faculty means). */
function liveDept(
  departmentId: string,
  facultyIds: string[],
  totalRespondents: number,
  score: number,
): LiveDeptAverage {
  const catAverages: Record<string, number | null> = {}
  for (const key of CATEGORY_KEYS) catAverages[key] = score
  return {
    departmentId,
    facultyIds,
    totalRespondents,
    avgRating: score,
    remarks: score >= 4.5 ? "Outstanding" : score >= 3.5 ? "Very Satisfactory" : score >= 2.5 ? "Satisfactory" : score >= 1.5 ? "Unsatisfactory" : "Poor",
    catAverages,
    highestRubrics: [],
    lowestRubrics: [],
  }
}

const LIVE_DEPTS_BY_PERIOD: Record<string, LiveDeptAverage[]> = {
  // dept-1: 10 responses @ 4.0 + 3 @ 5.0 + 8 @ 2.0 -> pooled 71/21 = 3.38
  p3: [liveDept("dept-1", ["f1", "f2", "f3"], 21, 3.38), liveDept("dept-2", ["x1"], 10, 4.6)],
  p2: [liveDept("dept-1", ["f1"], 6, 3)],
  p1: [liveDept("dept-1", ["f1"], 6, 3.5)],
}

const FS_ROWS: FacultySubjectWithEmbeds[] = [
  {
    id: "fs1", faculty_id: "f1", subject_id: "sub1", section_id: "sec1", semesterId: "s1",
    faculty: { id: "f1", name: "Ana Cruz", email: "a@x.edu", departmentId: "dept-1" },
    subject: { id: "sub1", code: "IT101", name: "Intro" },
    section: { id: "sec1", name: "1A", program: "BSIT" },
    semester: { id: "s1", title: "Sem 1" },
  },
  {
    id: "fs2", faculty_id: "f3", subject_id: "sub2", section_id: "sec2", semesterId: "s1",
    faculty: { id: "f3", name: "Cara Uy", email: "c@x.edu", departmentId: "dept-1" },
    subject: { id: "sub2", code: "IT102", name: "Data" },
    section: { id: "sec2", name: "2B", program: "BSIT" },
    semester: { id: "s1", title: "Sem 1" },
  },
  {
    id: "fs9", faculty_id: "x1", subject_id: "sub9", section_id: "sec9", semesterId: "s1",
    faculty: { id: "x1", name: "Dan Poe", email: "d@x.edu", departmentId: "dept-2" },
    subject: { id: "sub9", code: "CS101", name: "CS" },
    section: { id: "sec9", name: "1A", program: "BSCS" },
    semester: { id: "s1", title: "Sem 1" },
  },
]

const GROUP_DEFAULT = {
  id: "g1", name: "Default", description: null, seed: true,
  createdAt: new Date("2025-01-01"), categories: [],
} as unknown as RubricGroupWithCategories

function seedDefaults() {
  mockDeptRepo.findByDeanId.mockImplementation(async (deanId: string) =>
    deanId === "dean-1" ? DEPT_CCS : null,
  )
  mockDeptRepo.listAll.mockResolvedValue([DEPT_CCS, DEPT_COE])
  mockDeptRepo.findById.mockImplementation(async (id: string) =>
    id === "dept-1" ? DEPT_CCS : id === "dept-2" ? DEPT_COE : null,
  )
  mockUserRepo.listByIds.mockImplementation(async (ids: string[]) =>
    USERS.filter((u) => ids.includes(u.id)),
  )
  mockEvalPeriodRepo.findActive.mockResolvedValue(P3)
  mockEvalPeriodRepo.findById.mockImplementation(async (id: string) =>
    id === "p3" ? P3 : id === "p2" ? P2 : id === "p1" ? P1 : null,
  )
  mockEvalPeriodRepo.findBySemester.mockImplementation(async (semesterId: string) =>
    semesterId === "s1" ? [P3, P2] : semesterId === "s0" ? [P1] : [],
  )
  mockEvalPeriodRepo.list.mockResolvedValue([P3, P2, P1])
  mockEvalResultRepo.listLiveFacultyResults.mockImplementation(async (periodId: string) =>
    RESULTS_BY_PERIOD[periodId] ?? [],
  )
  mockEvalResultRepo.listLiveDeptAverages.mockImplementation(async (periodId: string) =>
    LIVE_DEPTS_BY_PERIOD[periodId] ?? [],
  )
  mockFacultySubjectRepo.listAllWithEmbeds.mockResolvedValue(FS_ROWS)
  mockEnrollmentRepo.countByFacultySubjectIds.mockResolvedValue({ fs1: 20, fs2: 16 })
  mockRubricGroupRepo.findById.mockResolvedValue(GROUP_DEFAULT)
}

describe("getDeanDashboardData", () => {
  it("returns null when the dean manages no department", async () => {
    const data = await getDeanDashboardData("ghost-dean", undefined, "p3")
    expect(data).toBeNull()
  })

  it("returns null when no period resolves", async () => {
    mockEvalPeriodRepo.findActive.mockResolvedValue(null)
    const data = await getDeanDashboardData("dean-1")
    expect(data).toBeNull()
  })

  it("resolves the period from semesterId, preferring the active one", async () => {
    const data = await getDeanDashboardData("dean-1", "s1")
    expect(mockEvalPeriodRepo.findBySemester).toHaveBeenCalledWith("s1")
    expect(data?.evaluationPeriodId).toBe("p3")
  })

  it("builds KPIs from faculty grain with n<5 suppression", async () => {
    const data = await getDeanDashboardData("dean-1", undefined, "p3")
    expect(data?.semesterId).toBe("s1")
    expect(data?.rubricGroupName).toBe("Default")
    // the POOLED department figure (71/21 over the response rows), not the
    // mean of the faculty generals (4.0 + 5.0 + 2.0) / 3 = 3.67
    expect(data?.kpis.general).toBeCloseTo(3.38, 2)
    expect(data?.kpis.remark).toBe("Very Satisfactory")
    expect(data?.kpis.actual).toBe(21)
    expect(data?.kpis.expected).toBe(36)
    expect(data?.kpis.responsePct).toBe(58)
    expect(data?.kpis.facultyEvaluated).toBe(2)
    expect(data?.kpis.facultyAssigned).toBe(3)
    expect(data?.kpis.atRisk).toBe(1)
    expect(data?.kpis.outstanding).toBe(0)
  })

  it("counts the remark mix over non-suppressed faculty only", async () => {
    const data = await getDeanDashboardData("dean-1", undefined, "p3")
    const mix = Object.fromEntries((data?.remarkMix ?? []).map((m) => [m.remark, m.count]))
    expect(mix).toMatchObject({
      Outstanding: 0,
      "Very Satisfactory": 1,
      Satisfactory: 0,
      Unsatisfactory: 1,
      Poor: 0,
    })
  })

  it("orders top/bottom 5 and puts suppressed faculty in lowResponse", async () => {
    const data = await getDeanDashboardData("dean-1", undefined, "p3")
    expect(data?.top5.map((f) => f.facultyId)).toEqual(["f1", "f3"])
    expect(data?.bottom5.map((f) => f.facultyId)).toEqual(["f3", "f1"])
    expect(data?.lowResponse).toEqual([{ facultyId: "f2", facultyName: "Ben Lim", actual: 3, expected: null }])
  })

  it("builds chronological trend with rubric-change flags and category deltas", async () => {
    const data = await getDeanDashboardData("dean-1", undefined, "p3")
    expect(data?.trend.map((t) => t.semesterId)).toEqual(["s0", "s1", "s1"])
    expect(data?.trend.map((t) => t.general)).toEqual([3.5, 3.0, 3.38])
    expect(data?.trend.map((t) => t.rubricChanged)).toEqual([true, false, false])
    // delta vs p2: 3.38 - 3.0 = 0.38 per category
    for (const c of data?.categories ?? []) {
      expect(c.value).toBeCloseTo(3.38, 2)
      expect(c.delta).toBeCloseTo(0.38, 2)
    }
  })

  it("scopes everything to the live home department", async () => {
    const data = await getDeanDashboardData("dean-1", undefined, "p3")
    const names = [...(data?.top5 ?? []), ...(data?.lowResponse ?? [])].map((f) => f.facultyName)
    expect(names).not.toContain("Dan Poe")
  })
})

describe("getAdminDashboardData", () => {
  it("returns null when no period resolves", async () => {
    mockEvalPeriodRepo.findActive.mockResolvedValue(null)
    expect(await getAdminDashboardData()).toBeNull()
  })

  it("ranks department bars and builds the selected dept dashboard", async () => {
    const data = await getAdminDashboardData("p3", "dept-1")
    expect(data?.evaluationPeriodId).toBe("p3")
    expect(data?.departments.map((d) => d.departmentId)).toEqual(["dept-2", "dept-1"])
    expect(data?.departments[0]).toMatchObject({ departmentName: "COE", general: 4.6 })
    expect(data?.selected?.kpis.general).toBeCloseTo(3.38, 2)
    expect(data?.selected?.rubricGroupName).toBe("Default")
  })

  it("leaves selected null for unknown departments but keeps bars", async () => {
    const data = await getAdminDashboardData("p3", "dept-9")
    expect(data?.selected).toBeNull()
    expect(data?.departments).toHaveLength(2)
  })
})

describe("dashboard fixtures", () => {
  it("uses SemesterData shapes the page selectors rely on", () => {
    const semesters: SemesterData[] = [
      { id: "s1", title: "Sem 1", evalStartDate: "2026-01-01", evalEndDate: null, isActive: true, createdAt: new Date() },
    ]
    expect(semesters.find((s) => s.isActive)?.id).toBe("s1")
  })
})
