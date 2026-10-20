import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { departmentRepository, evaluationResultRepository } from "@/lib/repositories/factory"
import { EvaluationPeriodInactiveError } from "@/features/evaluation-results/evaluation-results.repository"
import { logServerError } from "@/lib/services/audit"
import { getDepartmentSubjectResults } from "@/features/evaluation-results/evaluation-results.service"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ departmentId: string }> },
) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "DEAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const userId = (session.user as unknown as { id?: string | null } | undefined)?.id as string
  const dept = await departmentRepository.findByDeanId(userId)
  if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  const { departmentId } = await params
  if (departmentId !== dept.id) {
    return NextResponse.json({ error: `You manage ${dept.name} — tried to open ${departmentId}` }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "periodId is required" }, { status: 400 })

    await evaluationResultRepository.assertPeriodIsActive(evaluationPeriodId)

    // One implementation for admin and dean: the department's own subjects,
    // by the teacher's own department.
    const { subjects, facultyAggregates, departmentAggregate } =
      await getDepartmentSubjectResults(evaluationPeriodId, departmentId)

    // The release gate reads the RESULTS, not the roster: a roster change
    // must never make released results look unreleased. A row with no
    // responses is a subject, not a result: it cannot release the page.
    const visMap = await evaluationResultRepository.getVisibilityMap(evaluationPeriodId)
    const anyVisible = subjects.some((s) => s.totalRespondents > 0 && visMap.get(s.facultyId))
    if (!anyVisible) {
      return NextResponse.json({ error: `ADMIN hasn't released results for ${dept.name} yet` }, { status: 403 })
    }

    const visibilityMap: Record<string, boolean> = {}
    for (const item of subjects) {
      visibilityMap[item.facultyId as string] = visMap.get(item.facultyId) ?? false
    }

    return NextResponse.json({
      department: dept,
      subjects,
      facultyAggregates,
      departmentAggregate,
      visibilityMap,
    })
  } catch (e) {
    if (e instanceof EvaluationPeriodInactiveError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("Dean department evaluation results error:", e)
    await logServerError({
      route: "/api/dean/evaluation-results/departments/[departmentId]",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      email: (session.user as unknown as { email?: string | null } | undefined)?.email ?? null,
      role: (session.user as unknown as { role?: string | null } | undefined)?.role ?? null,
      error: e,
    })
    return NextResponse.json({ error: "Failed to fetch department evaluation results" }, { status: 500 })
  }
}
