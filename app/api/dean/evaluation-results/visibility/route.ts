import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import {
  departmentRepository,
  userRepository,
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
    const { evaluationPeriodId, semesterId, facultyIds, visible } = body as {
      evaluationPeriodId?: string
      semesterId?: string
      facultyIds: string[]
      visible: boolean
    }

    const periodId = evaluationPeriodId || semesterId
    if (!periodId || !facultyIds?.length) {
      return NextResponse.json({ error: "evaluationPeriodId and facultyIds are required" }, { status: 400 })
    }

    const dept = await departmentRepository.findByDeanId(userId)
    if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 })

    const facUsers = await userRepository.listByDepartment(dept.id)
    const deptFacIds = new Set((facUsers || []).map((u) => u.id))
    if (facultyIds.some((id) => !deptFacIds.has(id))) {
      return NextResponse.json({ error: "You can only manage visibility for faculty in your own department" }, { status: 403 })
    }

    await evaluationResultRepository.setVisibility(periodId, facultyIds, visible)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Dean visibility toggle error:", e)
    return NextResponse.json({ error: "Failed to update visibility" }, { status: 500 })
  }
}
