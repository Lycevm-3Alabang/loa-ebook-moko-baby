import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/route-guard"
import { exportAndClearStudents } from "@/features/admin-data/admin-data.service"
import { logAuditEvent } from "@/lib/services/audit"

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()
  const currentUserId = (session!.user as Record<string, unknown>).id as string

  try {
    const body = await request.json().catch(() => ({}))
    const { semesterId, mode, preview } = body as { semesterId?: string; mode?: "enrolments" | "hard"; preview?: boolean }
    if (!semesterId) {
      return NextResponse.json({ error: "semesterId is required (a semester id or \"ALL\")" }, { status: 400 })
    }
    if (mode !== "enrolments" && mode !== "hard") {
      return NextResponse.json({ error: "mode is required (\"enrolments\" or \"hard\")" }, { status: 400 })
    }

    const data = await exportAndClearStudents({ semesterId, mode, preview: !!preview })

    if (!preview) {
      await logAuditEvent({
        userId: currentUserId,
        action: "CLEAR_STUDENTS",
        details: `Exported and cleared students for scope ${data.semesterScope} (${mode}): ${data.studentIds.length} students, ${data.enrollments.length} enrollments, ${data.consultations.length} consultations, ${data.evaluations.length} evaluations`,
      })
    }

    const json = JSON.stringify(data, null, 2)

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="students-clear-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const status = message.includes("Semester not found") ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
