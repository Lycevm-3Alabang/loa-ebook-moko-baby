import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/route-guard"
import { logAuditEvent } from "@/lib/services/audit"
import { studentEnrollmentRepository, evaluationRepository, evaluationPeriodRepository, evaluationResultRepository } from "@/lib/repositories/factory"

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()

  const { id } = await params

  const enrollment = await studentEnrollmentRepository.findById(id)
  if (!enrollment) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 })

  if (enrollment.faculty_subject_id) {
    const adminName = (session!.user as Record<string, unknown>).name as string || "Unknown"
    const remarks = `Invalidated by user: ${adminName} - student removed from enrollment`
    await evaluationRepository.invalidateByFacultySubjectAndEvaluator(
      enrollment.faculty_subject_id,
      enrollment.student_id,
      remarks,
    )

    if (enrollment.semesterId) {
      const periods = await evaluationPeriodRepository.findBySemester(enrollment.semesterId)
      for (const period of periods) {
        await evaluationResultRepository.computeAll(period.id)
      }
    }
  }

  await studentEnrollmentRepository.deleteById(id)

  const currentUserId = (session!.user as Record<string, unknown>).id as string
  await logAuditEvent({
    userId: currentUserId,
    action: "DELETE_ENROLLMENT",
    details: `Deleted enrollment ${id} (faculty_subject: ${enrollment.faculty_subject_id}, student: ${enrollment.student_id})`,
  })

  return NextResponse.json({ success: true })
}
