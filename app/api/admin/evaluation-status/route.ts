import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import { getEvaluationStatus } from "@/features/evaluations/evaluation-status.service"

export async function GET(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })
    const search = searchParams.get("search") ?? undefined

    const data = await getEvaluationStatus(evaluationPeriodId, search)
    return NextResponse.json(data)
  } catch (e) {
    const errShape = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    console.error(
      "Admin evaluation status error:",
      JSON.stringify({
        message: errShape?.message,
        code: errShape?.code,
        details: errShape?.details,
        hint: errShape?.hint,
      }),
    )
    await logServerError({
      route: "/api/admin/evaluation-status",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: "Failed to fetch evaluation status" }, { status: 500 })
  }
}
