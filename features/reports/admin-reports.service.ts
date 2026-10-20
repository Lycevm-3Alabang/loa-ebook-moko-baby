import { supabase } from "@/lib/db"
import { userRepository } from "@/lib/repositories/factory"
import type { FacultyStatsData, RawAppointmentData, ConsultationSummaryData, DepartmentFrequencyEntry, FacultyFrequencyData, DepartmentYearlyEntry, FacultyYearlyData, DepartmentSummary } from "@/lib/types"
import { hasRole } from "@/lib/utils/roles"

export interface AdminReportResult {
  departments: DepartmentSummary[]
  selectedDepartmentId: string | null
  departmentName: string
  departmentId: string | null
  stats: FacultyStatsData[]
  rawAppointments: RawAppointmentData[]
  summaries: ConsultationSummaryData[]
  departmentFrequency: DepartmentFrequencyEntry[]
  facultyFrequency: FacultyFrequencyData[]
  departmentYearlyFrequency: DepartmentYearlyEntry[]
  facultyYearlyFrequency: FacultyYearlyData[]
}

export async function getDepartmentSummary(
  deptId: string,
  deptName: string,
  facultyCount: number,
  filters?: { startDate?: string; endDate?: string; status?: string }
): Promise<DepartmentSummary> {
  const facultyUsers = (await userRepository.listByDepartment(deptId))
    .filter((u) => hasRole(u.role, "FACULTY") || hasRole(u.role, "DEAN"))

  const facultyIds = facultyUsers.map((u) => u.id)

  let total = 0
  let completed = 0
  let pending = 0
  let approved = 0
  let rejected = 0
  let cancelled = 0
  let overdueCompletion = 0
  const activeFaculty = new Set<string>()

  if (facultyIds.length > 0) {
    let query = supabase
      .from("appointments")
      .select("status, date, facultyId")
      .eq("meetingType", "CONSULTATION")
      .in("facultyId", facultyIds)

    if (filters?.startDate) {
      query = query.gte("date", filters.startDate)
    }
    if (filters?.endDate) {
      query = query.lte("date", filters.endDate)
    }
    if (filters?.status) {
      const statusMap: Record<string, string> = {
        "completed": "COMPLETED",
        "pending": "PENDING",
        "approved": "APPROVED",
        "cancelled": "CANCELLED",
        "rejected": "REJECTED",
      }
      const dbStatus = statusMap[filters.status.toLowerCase()] || filters.status
      query = query.eq("status", dbStatus)
    }

    const { data: appointments } = await query
    const today = new Date().toISOString().slice(0, 10)

    if (appointments) {
      for (const apt of appointments as Record<string, unknown>[]) {
        total++
        activeFaculty.add(apt.facultyId as string)

        switch (apt.status) {
          case "COMPLETED": completed++; break
          case "PENDING": pending++; break
          case "APPROVED":
            approved++
            if ((apt.date as string) < today) overdueCompletion++
            break
          case "REJECTED": rejected++; break
          case "CANCELLED": cancelled++; break
        }
      }
    }
  }

  // The inactive count sits under the headcount it is a fraction of, so it
  // counts the headcount's people - the faculty, not the deans.
  const headcountIds = facultyUsers.filter((u) => hasRole(u.role, "FACULTY")).map((u) => u.id)
  const inactiveFaculty = headcountIds.filter((id) => !activeFaculty.has(id)).length

  return {
    id: deptId,
    name: deptName,
    facultyCount,
    total,
    completed,
    pending,
    approved,
    rejected,
    cancelled,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    inactiveFaculty,
    unresponded: pending,
    overdueCompletion,
  }
}

export function mergeStats(acc: FacultyStatsData[], deptStats: FacultyStatsData[]): FacultyStatsData[] {
  const map = new Map(acc.map((s) => [s.facultyId, s]))
  for (const s of deptStats) {
    if (!map.has(s.facultyId)) {
      map.set(s.facultyId, { ...s })
    }
  }
  return Array.from(map.values())
}

export function mergeMonthlyFreq(entries: DepartmentFrequencyEntry[][]): DepartmentFrequencyEntry[] {
  const map = new Map<string, DepartmentFrequencyEntry>()
  for (const arr of entries) {
    for (const e of arr) {
      const existing = map.get(e.month)
      if (existing) {
        existing.count += e.count
      } else {
        map.set(e.month, { ...e })
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month))
}

export function mergeYearlyFreq(entries: DepartmentYearlyEntry[][]): DepartmentYearlyEntry[] {
  const map = new Map<number, number>()
  for (const arr of entries) {
    for (const e of arr) {
      map.set(e.year, (map.get(e.year) || 0) + e.count)
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, count]) => ({ year, count }))
}

export function mergeFacultyMonthly(data: FacultyFrequencyData[][]): FacultyFrequencyData[] {
  const map = new Map<string, FacultyFrequencyData>()
  for (const arr of data) {
    for (const f of arr) {
      if (!map.has(f.facultyId)) {
        map.set(f.facultyId, { ...f, monthlyCounts: [...f.monthlyCounts] })
      } else {
        const existing = map.get(f.facultyId)!
        existing.total += f.total
        existing.averagePerMonth = existing.total / Math.max(existing.monthlyCounts.length, 1)
        for (const mc of f.monthlyCounts) {
          const found = existing.monthlyCounts.find((e) => e.month === mc.month)
          if (found) {
            found.count += mc.count
          } else {
            existing.monthlyCounts.push({ ...mc })
          }
        }
        existing.monthlyCounts.sort((a, b) => a.month.localeCompare(b.month))
      }
    }
  }
  return Array.from(map.values())
}

export function mergeFacultyYearly(data: FacultyYearlyData[][]): FacultyYearlyData[] {
  const map = new Map<string, FacultyYearlyData>()
  for (const arr of data) {
    for (const f of arr) {
      if (!map.has(f.facultyId)) {
        map.set(f.facultyId, { ...f, yearlyCounts: [...f.yearlyCounts] })
      } else {
        const existing = map.get(f.facultyId)!
        existing.total += f.total
        existing.averagePerYear = existing.total / Math.max(existing.yearlyCounts.length, 1)
        for (const yc of f.yearlyCounts) {
          const found = existing.yearlyCounts.find((e) => e.year === yc.year)
          if (found) {
            found.count += yc.count
          } else {
            existing.yearlyCounts.push({ ...yc })
          }
        }
        existing.yearlyCounts.sort((a, b) => a.year - b.year)
      }
    }
  }
  return Array.from(map.values())
}


