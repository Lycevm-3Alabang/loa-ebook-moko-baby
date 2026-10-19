import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import { evaluationResultRepository, evaluationRepository, departmentRepository } from "@/lib/repositories/factory"
import { computeSentimentScore } from "@/lib/evaluation-utils"

export async function GET(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })

    let results = await evaluationResultRepository.list(evaluationPeriodId)
    const hasCategoryData = results.length > 0 && results.some((r) => r.generalRating !== null)
    if (!hasCategoryData) {
      await evaluationResultRepository.computeAll(evaluationPeriodId)
      results = await evaluationResultRepository.list(evaluationPeriodId)
      if (results.length === 0) return NextResponse.json({ departments: [] })
    } else {
      const submittedIds = await evaluationRepository.listSubmittedEvaluateeIds(evaluationPeriodId)
      const resultFaculty = new Set(results.map((r) => r.facultyId))
      const hasMissing = submittedIds.some((id) => !resultFaculty.has(id))
      if (hasMissing) {
        await evaluationResultRepository.computeAll(evaluationPeriodId)
        results = await evaluationResultRepository.list(evaluationPeriodId)
      }
    }

    const sentimentRows = await evaluationRepository.listSubmittedWithSentiment(evaluationPeriodId)

    // Live department averages — never read cached generalRating (stale/placeholder nulls).
    const liveAvgs = await evaluationResultRepository.listLiveDeptAverages(evaluationPeriodId)

    const deptIds = [...new Set(liveAvgs.map((a) => a.departmentId).filter((id) => id !== "__unknown__"))]
    const allDepts = await departmentRepository.listAll()
    const deptMap = new Map(allDepts.filter((d) => deptIds.includes(d.id)).map((d) => [d.id, d]))

    const departments = liveAvgs.map((a) => {
      const dept = deptMap.get(a.departmentId)
      const facIds = new Set(a.facultyIds)
      const scores = sentimentRows.filter((row) => facIds.has(row.evaluateeId))
      return {
        departmentId: a.departmentId,
        departmentName: dept?.name ?? (a.departmentId === "__unknown__" ? "Unassigned" : "Unknown"),
        departmentCode: dept?.code ?? "",
        facultyCount: a.facultyIds.length,
        totalRespondents: a.totalRespondents,
        avgRating: a.avgRating,
        remarks: a.remarks,
        highestRubrics: a.highestRubrics,
        lowestRubrics: a.lowestRubrics,
        sentimentScore: computeSentimentScore(scores),
      }
    })

    return NextResponse.json({ departments })
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
