import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import { getDepartmentResults } from "@/features/evaluation-results/evaluation-results.service"

export async function GET(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })

    // The departments, their own faculty and their response counts — read
    // through the app's own repositories. The pseudo-department for the
    // evaluations that could not be attributed is reported as a warning, not
    // as a row (a row would link to a page that can only say "no data").
    const { departments, warnings } = await getDepartmentResults(evaluationPeriodId)

    return NextResponse.json({ departments, warnings })
  } catch (e) {
    // PostgrestErrors are plain objects ({ message, code, details, hint }),
    // which Vercel serializes as { message } only — extract all fields so
    // the next 400 names its table instead of logging "Bad Request" alone.
    const errShape = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    console.error(
      "Admin evaluation results error:",
      JSON.stringify({
        message: errShape?.message,
        code: errShape?.code,
        details: errShape?.details,
        hint: errShape?.hint,
      }),
    )
    await logServerError({
      route: "/api/admin/evaluation-results",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: "Failed to fetch evaluation results" }, { status: 500 })
  }
}
