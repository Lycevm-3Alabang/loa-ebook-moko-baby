import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/route-guard"
import { logAuditEvent } from "@/lib/services/audit"
import { facultySubjectRepository, semesterRepository } from "@/lib/repositories/factory"

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()

  try {
    const { faculty_id, subject_id, section_id } = await request.json()
    if (!faculty_id || !subject_id || !section_id) {
      return NextResponse.json({ error: "faculty_id, subject_id, and section_id are required" }, { status: 400 })
    }

    // Server-side active semester, exactly-once — the client-held
    // `activeSemesterId || null` pattern wrote NULL-semester mappings
    // whenever the semesters fetch had not resolved, and those rows then
    // needed the loader-side fallbacks everywhere downstream.
    const activeSemesters = await semesterRepository.list({ isActive: true })
    if (activeSemesters.length !== 1) {
      return NextResponse.json(
        {
          error:
            activeSemesters.length === 0
              ? "No active semester. Activate one before adding a mapping."
              : "More than one semester is active. Deactivate all but one before adding a mapping.",
        },
        { status: 400 },
      )
    }
    const semesterId = activeSemesters[0].id

    let data
    try {
      data = await facultySubjectRepository.create({ faculty_id, subject_id, section_id, semesterId })
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505") {
        return NextResponse.json({ error: "This mapping already exists" }, { status: 409 })
      }
      throw error
    }

    const currentUserId = (session!.user as Record<string, unknown>).id as string
    await logAuditEvent({
      userId: currentUserId,
      action: "CREATE_FACULTY_SUBJECT",
      details: `Mapped faculty ${faculty_id} to subject ${subject_id} in section ${section_id}`,
    })

    return NextResponse.json({ data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}
