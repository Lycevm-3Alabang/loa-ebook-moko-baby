import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import { getCachedDepartmentFigures } from "@/features/evaluation-results/figure-cache"

/**
 * One department's figures for a period: the mean of its rated
 * Subject–Section scores and its remark,
 * the highest and lowest rubrics, and the comment sentiment.
 *
 * The list reads the departments first and then asks for each one's figures,
 * so a row can be filled as soon as its numbers arrive. The figures are kept
 * for five minutes; `refresh=1` reads them again.
 */
export async function GET(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    const departmentId = searchParams.get("departmentId")
    if (!evaluationPeriodId || !departmentId) {
      return NextResponse.json({ error: "evaluationPeriodId and departmentId are required" }, { status: 400 })
    }

    const refresh = searchParams.get("refresh") === "1"
    const { figures, readAt } = await getCachedDepartmentFigures(departmentId, evaluationPeriodId, refresh)
    // The read time travels with the numbers: the page says when the data it
    // shows was read.
    return NextResponse.json({ ...figures, cachedAt: new Date(readAt).toISOString() })
  } catch (e) {
    const errShape = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    console.error(
      "Admin evaluation results figures error:",
      JSON.stringify({
        message: errShape?.message,
        code: errShape?.code,
        details: errShape?.details,
        hint: errShape?.hint,
      }),
    )
    await logServerError({
      route: "/api/admin/evaluation-results/figures",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: "Failed to fetch evaluation results" }, { status: 500 })
  }
}
