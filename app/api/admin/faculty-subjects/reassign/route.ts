import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/route-guard"
import { logAuditEvent } from "@/lib/services/audit"
import { facultySubjectRepository, evaluationRepository, evaluationPeriodRepository, evaluationResultRepository } from "@/lib/repositories/factory"

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()

  try {
    const { oldFacultySubjectId, newFacultyId } = await request.json()
    if (!oldFacultySubjectId || !newFacultyId) {
      return NextResponse.json({ error: "oldFacultySubjectId and newFacultyId are required" }, { status: 400 })
    }

    const oldRecord = await facultySubjectRepository.findById(oldFacultySubjectId)

    if (!oldRecord) {
      return NextResponse.json({ error: "Faculty-subject mapping not found" }, { status: 404 })
    }

    if (oldRecord.faculty_id === newFacultyId) {
      return NextResponse.json({ error: "New faculty is the same as current faculty" }, { status: 400 })
    }

    try {
      await facultySubjectRepository.update(oldFacultySubjectId, { faculty_id: newFacultyId })
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") {
        return NextResponse.json({ error: "This subject-section is already assigned to another faculty" }, { status: 409 })
      }
      throw error
    }

    const adminName = (session!.user as Record<string, unknown>).name as string || "Unknown"
    const remarks = `Invalidated by user: ${adminName} - change of faculty assigned for the subject/section`
    await evaluationRepository.invalidateByFacultySubject(oldFacultySubjectId, remarks)

    if (oldRecord.semesterId) {
      const periods = await evaluationPeriodRepository.findBySemester(oldRecord.semesterId)
      for (const period of periods) {
        await evaluationResultRepository.computeAll(period.id)
      }
    }

    const currentUserId = (session!.user as Record<string, unknown>).id as string
    await logAuditEvent({
      userId: currentUserId,
      action: "REASSIGN_FACULTY_SUBJECT",
      details: `Reassigned faculty_subject ${oldFacultySubjectId} from faculty ${oldRecord.faculty_id} to faculty ${newFacultyId}`,
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}
