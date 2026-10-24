import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { departmentRepository } from "@/lib/repositories/factory"
import { getDepartmentResults } from "@/features/evaluation-results/evaluation-results.service"
import { getCachedDepartmentFigures } from "@/features/evaluation-results/figure-cache"
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

    // The same live department figures the admin route renders - the dean's
    // page and the admin's page must not disagree about a department.
    const { departments } = await getDepartmentResults(evaluationPeriodId, dept.id)
    if (departments.length === 0) return NextResponse.json({ departments: [] })

    // The dean's own department has one set of figures, so they are read with
    // the row instead of in a second call.
    const { figures } = await getCachedDepartmentFigures(dept.id, evaluationPeriodId)

    return NextResponse.json({
      departments: [{
        ...departments[0],
        avgRating: figures.avgRating,
        remarks: figures.remarks,
        highestRubrics: figures.highestRubrics,
        lowestRubrics: figures.lowestRubrics,
        sentimentScore: figures.sentimentScore,
      }],
    })  } catch (e) {
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
