import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { departmentRepository, evaluationResultRepository } from "@/lib/repositories/factory"
import { getStudentBreakdownsForFaculty } from "@/features/evaluation-results/evaluation-results.repository"
import { logServerError } from "@/lib/services/audit"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const role = (session.user as Record<string, unknown>).role as string
  const userId = (session.user as Record<string, unknown>).id as string

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("periodId")
    const facultyId = searchParams.get("facultyId")
    if (!evaluationPeriodId || !facultyId) {
      return NextResponse.json({ error: "periodId and facultyId are required" }, { status: 400 })
    }

    if (!hasRole(role, "DEAN") && !hasRole(role, "ADMIN") && facultyId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (hasRole(role, "DEAN")) {
      const dept = await departmentRepository.findByDeanId(userId)
      if (!dept) return NextResponse.json({ students: [] })

      // The dean may only open a teacher in their OWN department — the same
      // membership the results page and the visibility toggle use. Without
      // this, any facultyId in the query string returns another department's
      // student-level breakdown.
      const assignments = await evaluationResultRepository.listDepartmentAssignments(dept.id, evaluationPeriodId)
      const deptFacultyIds = new Set(assignments.map((a) => a.faculty_id))
      if (!deptFacultyIds.has(facultyId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const students = await getStudentBreakdownsForFaculty(evaluationPeriodId, facultyId)
    const anonymized = students.map((s, i) => ({
      ...s,
      // The counter must come last: spread after it would restore the real id.
      id: `S${i + 1}`,
    }))
    return NextResponse.json({ students: anonymized })
  } catch (e) {
    console.error("Dean student breakdown error:", e)
    await logServerError({
      route: "/api/dean/evaluation-results/details",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: "Failed to fetch student breakdown" }, { status: 500 })
  }
}
