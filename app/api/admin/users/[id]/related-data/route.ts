import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { evaluationRepository, evaluationResultRepository, appointmentRepository, userPermissionRepository, facultySubjectRepository, studentEnrollmentRepository, availabilityRuleRepository, departmentRepository } from "@/lib/repositories/factory"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin(_request)
  if (authErr) return authErr

  const { id } = await params

  const queries = await Promise.allSettled([
    evaluationRepository.listByUser(id, 100),
    evaluationResultRepository.listByFacultyId(id, 100),
    userPermissionRepository.findByUserId(id),
    facultySubjectRepository.list({ faculty_id: id }),
    appointmentRepository.listByUserId(id, 100),
    appointmentRepository.listAttendeesByUserId(id, 100),
    availabilityRuleRepository.listByFaculty(id),
    studentEnrollmentRepository.list({ student_id: id }),
    departmentRepository.listByDeanId(id),
  ])

  const related: Record<string, unknown[]> = {}

  const labels = [
    "evaluations",
    "evaluation_visibility",
    "user_permissions",
    "faculty_subjects",
    "appointments",
    "appointment_attendees",
    "faculty_availability_rules",
    "student_enrollments",
    "departments",
  ] as const

  for (let i = 0; i < queries.length; i++) {
    const result = queries[i]
    const key = labels[i]
    if (result.status === "fulfilled" && result.value) {
      if (Array.isArray(result.value)) {
        related[key] = result.value
      } else if (typeof result.value === "object" && "data" in (result.value as Record<string, unknown>)) {
        related[key] = (result.value as { data: unknown[] }).data
      } else {
        related[key] = result.value ? [result.value] : []
      }
    } else {
      related[key] = []
    }
  }

  const summary = Object.entries(related).map(([table, rows]) => ({
    table,
    count: rows.length,
    label: table.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }))

  return NextResponse.json({ related, summary })
}
