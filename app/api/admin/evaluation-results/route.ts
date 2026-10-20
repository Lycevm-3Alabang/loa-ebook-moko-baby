import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import { evaluationResultRepository, evaluationRepository, departmentRepository } from "@/lib/repositories/factory"
import { computeSentimentScore } from "@/lib/evaluation-utils"

/** The pseudo-department for evaluations that could not be attributed. */
const UNKNOWN_DEPARTMENT = "__unknown__"

export async function GET(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })

    const sentimentRows = await evaluationRepository.listSubmittedWithSentiment(evaluationPeriodId)

    // Live department averages — never read cached generalRating (stale/placeholder nulls).
    const liveAvgs = await evaluationResultRepository.listLiveDeptAverages(evaluationPeriodId)

    // The pseudo-department is not a department: it carries evaluations that
    // could not be attributed, and it is reported as a warning instead of a
    // row (a row would link to a page that can only say "no data").
    const attributed = liveAvgs.filter((a) => a.departmentId !== UNKNOWN_DEPARTMENT)
    const [warnings, rosters] = await Promise.all([
      evaluationResultRepository.listAttributionWarnings(evaluationPeriodId),
      evaluationResultRepository.listDepartmentRosters(evaluationPeriodId),
    ])

    const deptIds = [...new Set(attributed.map((a) => a.departmentId))]
    const allDepts = await departmentRepository.listAll()
    const deptMap = new Map(allDepts.filter((d) => deptIds.includes(d.id)).map((d) => [d.id, d]))

    const departments = attributed.map((a) => {
      const dept = deptMap.get(a.departmentId)
      const facIds = new Set(a.facultyIds)
      const scores = sentimentRows.filter((row) => facIds.has(row.evaluateeId))
      const noResponses = rosters[a.departmentId] ?? []
      return {
        departmentId: a.departmentId,
        departmentName: dept?.name ?? "Unknown",
        departmentCode: dept?.code ?? "",
        // Everyone the department accounts for: the faculty with results and
        // the faculty who were assigned to teach and got nothing.
        facultyCount: a.facultyIds.length + noResponses.length,
        totalRespondents: a.totalRespondents,
        avgRating: a.avgRating,
        remarks: a.remarks,
        highestRubrics: a.highestRubrics,
        lowestRubrics: a.lowestRubrics,
        sentimentScore: computeSentimentScore(scores),
        noResponses,
      }
    })

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
