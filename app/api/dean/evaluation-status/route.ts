import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { departmentRepository, facultySubjectRepository } from "@/lib/repositories/factory"
import { logServerError } from "@/lib/services/audit"
import { getEvaluationStatusDetail } from "@/features/evaluations/evaluation-status.service"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "DEAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })

    const facultySubjectId = searchParams.get("facultySubjectId")
    if (!facultySubjectId) return NextResponse.json({ error: "facultySubjectId is required" }, { status: 400 })

    const userId = (session.user as Record<string, unknown>).id as string
    const dept = await departmentRepository.findByDeanId(userId)
    if (!dept) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const fs = await facultySubjectRepository.findByIdWithEmbeds(facultySubjectId)
    if (!fs || fs.faculty?.departmentId !== dept.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const detail = await getEvaluationStatusDetail(evaluationPeriodId, facultySubjectId)
    return NextResponse.json(detail)
  } catch (e) {
    const errShape = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    console.error("Dean evaluation status error:", JSON.stringify({ message: errShape?.message, code: errShape?.code, details: errShape?.details, hint: errShape?.hint }))
    await logServerError({ route: "/api/dean/evaluation-status", method: request.method, params: Object.fromEntries(new URL(request.url).searchParams), error: e })
    return NextResponse.json({ error: "Failed to fetch evaluation status" }, { status: 500 })
  }
}
