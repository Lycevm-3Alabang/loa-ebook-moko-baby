import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { evaluationRepository, evaluationResultRepository } from "@/lib/repositories/factory"
import { logAuditEvent, logServerError } from "@/lib/services/audit"

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const body = await request.json()
    const { periodId, evaluationPeriodId, facultyId, facultySubjectId, reason } = body as {
      periodId?: string
      evaluationPeriodId?: string
      facultyId?: string
      facultySubjectId?: string
      reason?: string
    }

    const targetPeriodId = evaluationPeriodId || periodId
    if (!targetPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })
    if (!facultyId && !facultySubjectId) return NextResponse.json({ error: "facultyId or facultySubjectId is required" }, { status: 400 })

    await evaluationRepository.bulkDisableByPeriod(targetPeriodId, { facultyId, facultySubjectId })

    await evaluationResultRepository.computeAll(targetPeriodId)

    await logAuditEvent({ action: "invalidate_evaluations", details: JSON.stringify({ evaluationPeriodId: targetPeriodId, facultyId, facultySubjectId, reason }) }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Invalidate evaluations error:", e)
    await logServerError({
      route: "/api/admin/evaluation-results/invalidate",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: "Failed to invalidate evaluations" }, { status: 500 })
  }
}
