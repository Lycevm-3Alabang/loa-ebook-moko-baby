import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { departmentRepository, evaluationResultRepository, evaluationRepository } from "@/lib/repositories/factory"
import { getFacultyCountsByDepartment } from "@/features/users/users.service"
import { computeSentimentScore } from "@/lib/evaluation-utils"
import { logServerError } from "@/lib/services/audit"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "DEAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    const userId = (session.user as Record<string, unknown>).id as string
    if (!evaluationPeriodId) return NextResponse.json({ error: "periodId is required" }, { status: 400 })

    const dept = await departmentRepository.findByDeanId(userId)
    if (!dept) return NextResponse.json({ departments: [] })

    // The same live, POOLED department figures the admin route renders - the
    // dean's page and the admin's page must not disagree about a department.
    const [liveAvgs, rosters, facultyCounts] = await Promise.all([
      evaluationResultRepository.listLiveDeptAverages(evaluationPeriodId),
      evaluationResultRepository.listDepartmentRosters(evaluationPeriodId),
      getFacultyCountsByDepartment(),
    ])
    const live = liveAvgs.find((a) => a.departmentId === dept.id)
    if (!live) return NextResponse.json({ departments: [] })

    const sentimentRows = await evaluationRepository.listSubmittedWithSentiment(evaluationPeriodId)
    const facIds = new Set(live.facultyIds)
    const scores = sentimentRows.filter((row) => facIds.has(row.evaluateeId))
    const noResponses = rosters[dept.id] ?? []

    return NextResponse.json({
      departments: [{
        departmentId: dept.id,
        departmentName: dept.name,
        departmentCode: dept.code ?? "",
        // Same rule as the admin route: the department's own faculty.
        facultyCount: facultyCounts[dept.id] ?? 0,
        totalRespondents: live.totalRespondents,
        avgRating: live.avgRating,
        remarks: live.remarks,
        highestRubrics: live.highestRubrics,
        lowestRubrics: live.lowestRubrics,
        sentimentScore: computeSentimentScore(scores),
        noResponses,
      }],
    })
  } catch (e) {
    console.error("Dean evaluation results error:", e)
    await logServerError({
      route: "/api/dean/evaluation-results",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      email: (session?.user as unknown as { email?: string | null } | undefined)?.email ?? null,
      role: (session?.user as unknown as { role?: string | null } | undefined)?.role ?? null,
      error: e,
    })
    return NextResponse.json({ error: "Failed to fetch evaluation results" }, { status: 500 })
  }
}
