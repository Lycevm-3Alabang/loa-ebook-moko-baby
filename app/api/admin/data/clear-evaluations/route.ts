import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/route-guard"
import { exportAndClearEvaluations } from "@/features/admin-data/admin-data.service"
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

    const data = await exportAndClearEvaluations(semesterId)

    await logAuditEvent({
      userId: currentUserId,
      action: "CLEAR_EVALUATIONS",
      details: `Exported and cleared evaluations for scope ${data.semesterScope}: ${data.evaluations.length} evaluations, ${data.ratings.length} ratings, ${data.comments.length} comments, ${data.results.length} results across ${data.evaluationPeriodIds.length} periods`,
    })

    const json = JSON.stringify(data, null, 2)

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="evaluations-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const status = message.includes("Semester not found") ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
