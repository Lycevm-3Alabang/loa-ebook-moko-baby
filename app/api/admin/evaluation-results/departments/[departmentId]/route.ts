import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import { departmentRepository, evaluationResultRepository } from "@/lib/repositories/factory"
import { getDepartmentSubjectResults } from "@/features/evaluation-results/evaluation-results.service"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ departmentId: string }> },
) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const { departmentId } = await params

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "periodId is required" }, { status: 400 })

    const { subjects: subjectsList, facultyAggregates, departmentAggregate, members } = await getDepartmentSubjectResults(evaluationPeriodId, departmentId)
    if (subjectsList.length === 0) {
      const dept = await departmentRepository.findById(departmentId)
      // still return department info even with no subjects
      const visMap = await evaluationResultRepository.getVisibilityMap(evaluationPeriodId)
      return NextResponse.json({ department: dept ?? null, subjects: [], facultyAggregates, departmentAggregate, members, visibilityMap: Object.fromEntries(visMap) })
    }

    const dept = await departmentRepository.findById(departmentId)

    const visMap = await evaluationResultRepository.getVisibilityMap(evaluationPeriodId)
    const visibilityMap: Record<string, boolean> = {}
    for (const item of subjectsList) {
      visibilityMap[item.facultyId] = visMap.get(item.facultyId) ?? false
    }

    return NextResponse.json({
      department: dept ?? null,
      subjects: subjectsList,
      facultyAggregates,
      departmentAggregate,
      members,
      visibilityMap,
    })
  } catch (e) {
    console.error("Department evaluation results error:", e)
    await logServerError({
      route: "/api/admin/evaluation-results/departments/[departmentId]",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: "Failed to fetch department evaluation results" }, { status: 500 })
  }
}
