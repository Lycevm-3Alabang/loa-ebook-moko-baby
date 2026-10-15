import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { evaluationRepository, evaluationResultRepository } from "@/lib/repositories/factory"
import { logAuditEvent, logServerError } from "@/lib/services/audit"

export async function POST(request: NextRequest, { params }: { params: Promise<{ evaluationId: string }> }) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const { evaluationId } = await params
    if (!evaluationId) return NextResponse.json({ error: "evaluationId is required" }, { status: 400 })

    const body = await request.json()
    const { evaluationPeriodId, reason } = body as { evaluationPeriodId?: string; reason?: string }
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })

    await evaluationRepository.invalidateById(evaluationId, reason || "")

    await evaluationResultRepository.computeAll(evaluationPeriodId)

    await logAuditEvent({ action: "invalidate_evaluation", details: JSON.stringify({ evaluationId, evaluationPeriodId, reason }) }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Invalidate evaluation error:", e)
    await logServerError({
      route: "/api/admin/evaluations/[evaluationId]/invalidate",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: "Failed to invalidate evaluation" }, { status: 500 })
  }
}
