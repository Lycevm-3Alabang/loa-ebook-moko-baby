import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { logServerError } from "@/lib/services/audit"
import {
  departmentRepository,
  evaluationResultRepository,
} from "@/lib/repositories/factory"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "DEAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const userId = (session.user as Record<string, unknown>).id as string

  try {
    const body = await request.json()
    const { evaluationPeriodId, facultyIds, visible } = body as {
      evaluationPeriodId?: string
      facultyIds: string[]
      visible: boolean
    }

    // A period id, not a semester id: the membership check and setVisibility
    // both key on evaluation_period_id.
    if (!evaluationPeriodId || !facultyIds?.length) {
      return NextResponse.json({ error: "evaluationPeriodId and facultyIds are required" }, { status: 400 })
    }

    const dept = await departmentRepository.findByDeanId(userId)
    if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 })

    // The dean's membership set is the department's own subjects — the same
    // rule the results page uses, so the toggle never 403s a faculty the
    // dean can actually see.
    const assignments = await evaluationResultRepository.listDepartmentAssignments(dept.id, evaluationPeriodId)
    const deptFacIds = new Set(assignments.map((a) => a.faculty_id))
    if (facultyIds.some((id) => !deptFacIds.has(id))) {
      return NextResponse.json({ error: "You can only manage visibility for faculty in your own department" }, { status: 403 })
    }

    await evaluationResultRepository.setVisibility(evaluationPeriodId, facultyIds, visible)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Dean visibility toggle error:", e)
    await logServerError({
      route: "/api/dean/evaluation-results/visibility",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      email: (session?.user as unknown as { email?: string | null } | undefined)?.email ?? null,
      role: (session?.user as unknown as { role?: string | null } | undefined)?.role ?? null,
      error: e,
    })
    return NextResponse.json({ error: "Failed to update visibility" }, { status: 500 })
  }
}
