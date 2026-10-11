import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { getActiveEvaluationPeriod } from "@/features/admin-data/evaluation-periods.service"
import { getActiveSemester } from "@/features/admin-data/semesters.service"
import { getPendingEvaluations } from "@/features/evaluations/evaluations.service"
import { userRepository, subjectRepository } from "@/lib/repositories/factory"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as Record<string, unknown>).role as string
  const userId = (session.user as Record<string, unknown>).id as string

  if (!hasRole(role, "STUDENT")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const activePeriod = await getActiveEvaluationPeriod()
    if (!activePeriod) {
      return NextResponse.json({ error: "No active evaluation period" }, { status: 400 })
    }
    const activeSemester = await getActiveSemester()
    const pending = await getPendingEvaluations(userId, activePeriod.id, activeSemester?.id ?? null)
    if (pending.length === 0) return NextResponse.json({ pending: [] })

    const facultyIds = [...new Set(pending.map((p) => p.evaluateeId))]
    const subjectIds = [...new Set(pending.map((p) => p.subjectId))]

    const [faculty, subjects] = await Promise.all([
      userRepository.listByIds(facultyIds),
      subjectRepository.findByIds(subjectIds),
    ])

    const facultyMap = new Map(faculty.map((u) => [u.id, u]))
    const subjectMap = new Map(subjects.map((s) => [s.id, s]))

    const result = pending.map((p) => {
      const f = facultyMap.get(p.evaluateeId)
      const s = subjectMap.get(p.subjectId)
      return {
        evaluateeId: p.evaluateeId,
        evaluateeName: f?.name || "Unknown",
        evaluateeEmail: f?.email || "",
        facultySubjectId: p.facultySubjectId,
        subjectId: p.subjectId,
        subjectCode: s?.code || "",
        subjectName: s?.name || "",
        mappingSemesterId: p.mappingSemesterId,
        mappingSemesterTitle: p.mappingSemesterTitle,
        isMappedToActiveSemester: p.isMappedToActiveSemester,
        eligible: p.eligible,
        ineligibilityReason: p.ineligibilityReason,
      }
    })

    return NextResponse.json({ pending: result })
  } catch {
    return NextResponse.json({ error: "Failed to fetch pending evaluations" }, { status: 500 })
  }
}
