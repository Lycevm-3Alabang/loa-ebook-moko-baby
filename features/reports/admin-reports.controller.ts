import { departmentRepository, reportsRepository } from "@/lib/repositories/factory"
import { getFacultyCountsByDepartment } from "@/features/users/users.service"
import {
  getDepartmentSummary,
  mergeStats,
  mergeMonthlyFreq,
  mergeYearlyFreq,
  mergeFacultyMonthly,
  mergeFacultyYearly,
} from "./admin-reports.service"
import type { AdminReportResult } from "./admin-reports.service"

export async function getAdminReportData(
  filters?: { startDate?: string; endDate?: string; status?: string },
  selectedDepartmentId?: string | null
): Promise<AdminReportResult> {
  const departments = await departmentRepository.listAll()
  // One query for the whole page: each department's own faculty headcount.
  const facultyCounts = await getFacultyCountsByDepartment()

  const deptCandidates = selectedDepartmentId
    ? departments.filter((d) => d.id === selectedDepartmentId)
    : departments

  const departmentSummaries = await Promise.all(
    deptCandidates.map((dept) => getDepartmentSummary(dept.id, dept.name, facultyCounts[dept.id] ?? 0, filters))
  )

  const allResults = await Promise.all(
    deptCandidates.map((dept) =>
      Promise.all([
        reportsRepository.getDepartmentConsultationStats(dept.id, filters),
        reportsRepository.getDepartmentConsultationAppointments(dept.id, filters),
        reportsRepository.getConsultationSummaries(dept.id, filters),
        reportsRepository.getDepartmentFrequency(dept.id, filters),
        reportsRepository.getFacultyFrequency(dept.id, filters),
        reportsRepository.getDepartmentYearlyFrequency(dept.id, filters),
        reportsRepository.getFacultyYearlyFrequency(dept.id, filters),
      ])
    )
  )

  const allStats = allResults.map((r) => r[0])
  const allRaw = allResults.map((r) => r[1])
  const allSummaries = allResults.map((r) => r[2])
  const allDeptFreq = allResults.map((r) => r[3])
  const allFacFreq = allResults.map((r) => r[4])
  const allDeptYrFreq = allResults.map((r) => r[5])
  const allFacYrFreq = allResults.map((r) => r[6])

  const departmentName = selectedDepartmentId
    ? deptCandidates[0]?.name || "Unknown"
    : "All Departments"

  const departmentId = selectedDepartmentId || null

  const stats = mergeStats(allStats.flat(), [])
  const rawAppointments = allRaw.flat()
  const summaries = allSummaries.flat()
  const departmentFrequency = mergeMonthlyFreq(allDeptFreq)
  const facultyFrequency = mergeFacultyMonthly(allFacFreq)
  const departmentYearlyFrequency = mergeYearlyFreq(allDeptYrFreq)
  const facultyYearlyFrequency = mergeFacultyYearly(allFacYrFreq)

  return {
    departments: departmentSummaries,
    selectedDepartmentId: departmentId,
    departmentName,
    departmentId,
    stats,
    rawAppointments,
    summaries,
    departmentFrequency,
    facultyFrequency,
    departmentYearlyFrequency,
    facultyYearlyFrequency,
  }
}
