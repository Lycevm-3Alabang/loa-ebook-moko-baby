import { describe, it, expect, vi, beforeEach } from "vitest"

const mockDeptRepo = vi.hoisted(() => ({
  listAll: vi.fn(),
  findByDeanId: vi.fn(),
}))

const mockUserRepo = vi.hoisted(() => ({
  listByDepartment: vi.fn(),
  listByRole: vi.fn(),
}))

const mockReportsRepo = vi.hoisted(() => ({
  getDepartmentConsultationStats: vi.fn(),
  getDepartmentConsultationAppointments: vi.fn(),
  getConsultationSummaries: vi.fn(),
  getDepartmentFrequency: vi.fn(),
  getFacultyFrequency: vi.fn(),
  getDepartmentYearlyFrequency: vi.fn(),
  getFacultyYearlyFrequency: vi.fn(),
}))

vi.mock("@/lib/repositories/factory", () => ({
  departmentRepository: mockDeptRepo,
  userRepository: mockUserRepo,
  reportsRepository: mockReportsRepo,
}))

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { getAdminReportData } from "@/features/reports/admin-reports.controller"
import type { FacultyStatsData, DepartmentFrequencyEntry, FacultyFrequencyData, DepartmentYearlyEntry, FacultyYearlyData } from "@/lib/types"

beforeEach(() => {
  vi.resetAllMocks()
  mockUserRepo.listByRole.mockResolvedValue([])
})

const MOCK_DEPARTMENTS = [
  { id: "dept-1", name: "Computer Science" },
  { id: "dept-2", name: "Mathematics" },
]

const MOCK_STATS_1: FacultyStatsData[] = [
  { facultyId: "f1", facultyName: "Dr. Smith", total: 10, completed: 7, pending: 2, approved: 0, rejected: 0, cancelled: 1, completionRate: 70 },
]
const MOCK_STATS_2: FacultyStatsData[] = [
  { facultyId: "f2", facultyName: "Dr. Jones", total: 5, completed: 3, pending: 1, approved: 0, rejected: 0, cancelled: 1, completionRate: 60 },
]

const MOCK_DEPT_FREQ_1: DepartmentFrequencyEntry[] = [
  { month: "2026-01", monthName: "January", year: 2026, count: 5 },
  { month: "2026-02", monthName: "February", year: 2026, count: 3 },
]
const MOCK_DEPT_FREQ_2: DepartmentFrequencyEntry[] = [
  { month: "2026-01", monthName: "January", year: 2026, count: 2 },
  { month: "2026-03", monthName: "March", year: 2026, count: 4 },
]

const MOCK_FAC_FREQ_1: FacultyFrequencyData[] = [
  {
    facultyId: "f1", facultyName: "Dr. Smith", total: 8, averagePerMonth: 4,
    monthlyCounts: [{ month: "2026-01", monthName: "January", count: 5 }, { month: "2026-02", monthName: "February", count: 3 }],
  },
]
const MOCK_FAC_FREQ_2: FacultyFrequencyData[] = [
  {
    facultyId: "f2", facultyName: "Dr. Jones", total: 6, averagePerMonth: 3,
    monthlyCounts: [{ month: "2026-01", monthName: "January", count: 2 }, { month: "2026-03", monthName: "March", count: 4 }],
  },
]

const MOCK_YR_FREQ_1: DepartmentYearlyEntry[] = [{ year: 2026, count: 8 }]
const MOCK_YR_FREQ_2: DepartmentYearlyEntry[] = [{ year: 2026, count: 6 }]

const MOCK_FAC_YR_FREQ_1: FacultyYearlyData[] = [
  {
    facultyId: "f1", facultyName: "Dr. Smith", total: 8, averagePerYear: 8,
    yearlyCounts: [{ year: 2026, count: 8 }],
  },
]
const MOCK_FAC_YR_FREQ_2: FacultyYearlyData[] = [
  {
    facultyId: "f2", facultyName: "Dr. Jones", total: 6, averagePerYear: 6,
    yearlyCounts: [{ year: 2026, count: 6 }],
  },
]

describe("getAdminReportData", () => {
  it("merges data from multiple departments", async () => {
    mockDeptRepo.listAll.mockResolvedValue(MOCK_DEPARTMENTS)
    mockUserRepo.listByDepartment.mockResolvedValue([])
    // The headcount: one faculty homed in dept-1, nobody in dept-2.
    mockUserRepo.listByRole.mockResolvedValue([
      { id: "f1", name: "Dr. Smith", email: "smith@x", departmentId: "dept-1", role: "FACULTY" },
    ])

    const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null })
    const { supabase } = await import("@/lib/supabase")
    ;(supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ select: mockSelect })

    mockReportsRepo.getDepartmentConsultationStats
      .mockResolvedValueOnce(MOCK_STATS_1)
      .mockResolvedValueOnce(MOCK_STATS_2)
    mockReportsRepo.getDepartmentConsultationAppointments
      .mockResolvedValue([])
      .mockResolvedValue([])
    mockReportsRepo.getConsultationSummaries
      .mockResolvedValue([])
      .mockResolvedValue([])
    mockReportsRepo.getDepartmentFrequency
      .mockResolvedValueOnce(MOCK_DEPT_FREQ_1)
      .mockResolvedValueOnce(MOCK_DEPT_FREQ_2)
    mockReportsRepo.getFacultyFrequency
      .mockResolvedValueOnce(MOCK_FAC_FREQ_1)
      .mockResolvedValueOnce(MOCK_FAC_FREQ_2)
    mockReportsRepo.getDepartmentYearlyFrequency
      .mockResolvedValueOnce(MOCK_YR_FREQ_1)
      .mockResolvedValueOnce(MOCK_YR_FREQ_2)
    mockReportsRepo.getFacultyYearlyFrequency
      .mockResolvedValueOnce(MOCK_FAC_YR_FREQ_1)
      .mockResolvedValueOnce(MOCK_FAC_YR_FREQ_2)

    const result = await getAdminReportData()

    expect(result.departmentName).toBe("All Departments")
    expect(result.departments.find((d) => d.id === "dept-1")?.facultyCount).toBe(1)
    expect(result.departments.find((d) => d.id === "dept-2")?.facultyCount).toBe(0)
    expect(result.stats).toHaveLength(2)
    expect(result.stats[0].facultyId).toBe("f1")
    expect(result.stats[1].facultyId).toBe("f2")

    expect(result.departmentFrequency).toHaveLength(3)
    const janEntry = result.departmentFrequency.find((e) => e.month === "2026-01")
    expect(janEntry?.count).toBe(7)

    expect(result.facultyFrequency).toHaveLength(2)

    expect(result.departmentYearlyFrequency).toHaveLength(1)
    expect(result.departmentYearlyFrequency[0].count).toBe(14)

    expect(result.facultyYearlyFrequency).toHaveLength(2)
  })

  it("filters to a single department when selectedDepartmentId is provided", async () => {
    mockDeptRepo.listAll.mockResolvedValue(MOCK_DEPARTMENTS)
    mockUserRepo.listByDepartment.mockResolvedValue([])

    const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null })
    const { supabase } = await import("@/lib/supabase")
    ;(supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ select: mockSelect })

    mockReportsRepo.getDepartmentConsultationStats.mockResolvedValue(MOCK_STATS_1)
    mockReportsRepo.getDepartmentConsultationAppointments.mockResolvedValue([])
    mockReportsRepo.getConsultationSummaries.mockResolvedValue([])
    mockReportsRepo.getDepartmentFrequency.mockResolvedValue(MOCK_DEPT_FREQ_1)
    mockReportsRepo.getFacultyFrequency.mockResolvedValue(MOCK_FAC_FREQ_1)
    mockReportsRepo.getDepartmentYearlyFrequency.mockResolvedValue(MOCK_YR_FREQ_1)
    mockReportsRepo.getFacultyYearlyFrequency.mockResolvedValue(MOCK_FAC_YR_FREQ_1)

    const result = await getAdminReportData({}, "dept-1")

    expect(result.departmentName).toBe("Computer Science")
    expect(result.stats).toHaveLength(1)
    expect(mockReportsRepo.getDepartmentConsultationStats).toHaveBeenCalledTimes(1)
  })
})
