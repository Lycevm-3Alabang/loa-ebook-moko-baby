import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { getOrCreateEvaluation, getEvaluation, getMyEvaluations } from "@/features/evaluations/evaluations.service"
import { getActiveEvaluationPeriod } from "@/features/admin-data/evaluation-periods.service"
import { userRepository, facultySubjectRepository, subjectRepository, evaluationPeriodRepository, studentEnrollmentRepository } from "@/lib/repositories/factory"
import type { EvaluationData } from "@/lib/types"
import { logServerError } from "@/lib/services/audit"

async function enrichEvaluation(evaluation: EvaluationData) {
  const [facultyUser, fsData] = await Promise.all([
    userRepository.findById(evaluation.evaluateeId),
    evaluation.facultySubjectId
      ? facultySubjectRepository.findById(evaluation.facultySubjectId)
      : Promise.resolve(null),
  ])

  let subjectName = ""
  let subjectCode = ""
  if (fsData?.subject_id) {
    const subj = await subjectRepository.findById(fsData.subject_id)
    if (subj) {
      subjectCode = subj.code
      subjectName = subj.name
    }
  }

  return {
    ...evaluation,
    evaluateeName: facultyUser?.name || "Unknown",
    subjectId: fsData?.subject_id || "",
    subjectCode,
    subjectName,
  }
}

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
    const evaluations = await getMyEvaluations(userId, activePeriod.id)
    const result = await Promise.all(evaluations.map(enrichEvaluation))
    return NextResponse.json({ evaluations: result })
  } catch {
    return NextResponse.json({ error: "Failed to fetch evaluations" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as Record<string, unknown>).role as string
  const userId = (session.user as Record<string, unknown>).id as string

  if (!hasRole(role, "STUDENT")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { periodId, evaluateeId, facultySubjectId, source, id } = await request.json()

    if (id) {
      const existing = await getEvaluation(id)
      if (!existing || existing.evaluatorId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      const enriched = await enrichEvaluation(existing)
      return NextResponse.json({ evaluation: enriched }, { status: 200 })
    }

    const activePeriodId = periodId || (await getActiveEvaluationPeriod())?.id
    if (!activePeriodId) {
      return NextResponse.json({ error: "No active evaluation period" }, { status: 400 })
    }

    if (source !== "unenrolled") {
      const evalPeriod = await evaluationPeriodRepository.findById(activePeriodId)

      if (!evalPeriod) {
        return NextResponse.json({ error: "Invalid evaluation period" }, { status: 400 })
      }

      const enrollment = await studentEnrollmentRepository.findExisting(userId, facultySubjectId, evalPeriod.semesterId)

      if (!enrollment) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const fsId = facultySubjectId || null
    const evaluation = await getOrCreateEvaluation(activePeriodId, userId, evaluateeId, fsId, source)
    const enriched = await enrichEvaluation(evaluation)

    return NextResponse.json({ evaluation: enriched }, { status: 200 })
  } catch (e) {
    console.error("Create evaluation error:", e)
    await logServerError({
      route: "/api/evaluations",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: "Failed to create evaluation" }, { status: 500 })
  }
}
