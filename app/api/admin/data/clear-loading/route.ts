import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/route-guard"
import { exportAndClearLoading } from "@/features/admin-data/admin-data.service"
import { logAuditEvent } from "@/lib/services/audit"

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()
  const currentUserId = (session!.user as Record<string, unknown>).id as string

  try {
    const body = await request.json().catch(() => ({}))
    const semesterId = (body as { semesterId?: string }).semesterId
    if (!semesterId) {
      return NextResponse.json({ error: "semesterId is required (a semester id or \"ALL\")" }, { status: 400 })
    }

    const data = await exportAndClearLoading(semesterId)

    await logAuditEvent({
      userId: currentUserId,
      action: "CLEAR_LOADING",
      details: `Exported and cleared loading for scope ${data.semesterScope}: ${data.enrollments.length} enrollments, ${data.facultySubjects.length} mappings`,
    })

    const json = JSON.stringify(data, null, 2)

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="loading-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const status = message.includes("Semester not found") || message.includes("still have evaluations") ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
