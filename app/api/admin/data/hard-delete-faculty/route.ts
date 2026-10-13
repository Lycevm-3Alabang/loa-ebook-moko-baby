import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/route-guard"
import { exportAndHardDeleteFaculty } from "@/features/admin-data/admin-data.service"
import { logAuditEvent } from "@/lib/services/audit"

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()
  const currentUserId = (session!.user as Record<string, unknown>).id as string

  try {
    const body = await request.json().catch(() => ({}))
    const departmentIds = (body as { departmentIds?: string[] | "ALL" }).departmentIds
    if (!departmentIds || (Array.isArray(departmentIds) && departmentIds.length === 0)) {
      return NextResponse.json({ error: "departmentIds is required (an array or \"ALL\")" }, { status: 400 })
    }

    const data = await exportAndHardDeleteFaculty(departmentIds)

    await logAuditEvent({
      userId: currentUserId,
      action: "HARD_DELETE_FACULTY",
      details: `Exported and hard-deleted faculty for scope ${data.departmentScope.join(",")}: ${data.userIds.length} accounts, ${data.facultySubjects.length} mappings, ${data.enrollments.length} enrollments, ${data.appointments.length} consultations, ${data.evaluations.length} evaluations`,
    })

    const json = JSON.stringify(data, null, 2)

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="faculty-hard-delete-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const status = message.includes("Select at least one department") ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
