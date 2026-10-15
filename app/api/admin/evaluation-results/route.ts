import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { evaluationResultRepository, evaluationRepository, departmentRepository } from "@/lib/repositories/factory"

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

    const sentByFaculty = new Map<string, number[]>()
    for (const row of sentimentRows) {
      if (row.sentimentScore !== null) {
        if (!sentByFaculty.has(row.evaluateeId)) sentByFaculty.set(row.evaluateeId, [])
        sentByFaculty.get(row.evaluateeId)!.push(row.sentimentScore)
      }
    }
    const avgSentByFaculty = new Map<string, number>()
    for (const [facId, scores] of sentByFaculty) {
      avgSentByFaculty.set(facId, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) / 100)
    }

    // Live department averages — never read cached generalRating (stale/placeholder nulls).
    const liveAvgs = await evaluationResultRepository.listLiveDeptAverages(evaluationPeriodId)

    const deptIds = [...new Set(liveAvgs.map((a) => a.departmentId).filter((id) => id !== "__unknown__"))]
    const allDepts = await departmentRepository.listAll()
    const deptMap = new Map(allDepts.filter((d) => deptIds.includes(d.id)).map((d) => [d.id, d]))

    const departments = liveAvgs.map((a) => {
      const dept = deptMap.get(a.departmentId)
      const scores = a.facultyIds.flatMap((id) => {
        const s = avgSentByFaculty.get(id)
        return s === undefined ? [] : [s]
      })
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
        sentimentScore: scores.length > 0
          ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length * 100) / 100
          : null,
      }
    })

    return NextResponse.json({ departments })
  } catch (e) {
    console.error("Admin evaluation results error:", e)
    return NextResponse.json({ error: "Failed to fetch evaluation results" }, { status: 500 })
  }
}
