import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getEvaluation, getEvaluationRatings, getEvaluationComment } from "@/features/evaluations/evaluations.service"
import { rubricGroupRepository, userRepository, facultySubjectRepository, subjectRepository, sectionRepository } from "@/lib/repositories/factory"
import { groupSnapshotRows } from "@/lib/evaluation-utils"
import { logServerError } from "@/lib/services/audit"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = (session.user as Record<string, unknown>).id as string
  const { id } = await params

  const searchParams = new URL(request.url).searchParams
  const includeRaw = searchParams.get("include") || ""
  const includes = new Set(includeRaw ? includeRaw.split(",").map((s) => s.trim()).filter(Boolean) : [])

  try {
    const evaluation = await getEvaluation(id)
    if (!evaluation) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (evaluation.evaluatorId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (evaluation.status !== "SUBMITTED" && evaluation.status !== "DRAFT") return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (evaluation.isDisabled) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const [facultyUser, fsData] = await Promise.all([
      userRepository.findById(evaluation.evaluateeId),
      evaluation.facultySubjectId
        ? facultySubjectRepository.findById(evaluation.facultySubjectId)
        : Promise.resolve(null),
    ])

    let subjectCode = ""
    let subjectName = ""
    let sectionName = ""
    if (fsData?.subject_id) {
      const [subj, sec] = await Promise.all([
        subjectRepository.findById(fsData.subject_id),
        fsData.section_id
          ? sectionRepository.findById(fsData.section_id)
          : Promise.resolve(null),
      ])
      if (subj) {
        subjectCode = subj.code
        subjectName = subj.name
      }
      if (sec) {
        sectionName = sec.name
      }
    }

    const responseBody: Record<string, unknown> = {
      evaluation: {
        ...evaluation,
        evaluateeName: facultyUser?.name || "Unknown",
        subjectId: fsData?.subject_id || "",
        subjectCode,
        subjectName,
        sectionName,
      },
    }

    if (includes.has("ratings")) {
      const ratings = await getEvaluationRatings(id)
      responseBody.ratings = ratings
    }

    if (includes.has("comments")) {
      const comment = await getEvaluationComment(id)
      responseBody.comment = comment
    }

    if (includes.has("rubric")) {
      const snapshot = await rubricGroupRepository.getSnapshot(evaluation.evaluationPeriodId)
      responseBody.rubric = groupSnapshotRows(snapshot as unknown as import("@/lib/evaluation-utils").FlatSnapshotRow[])
    }

    return NextResponse.json(responseBody)
  } catch (err) {
    console.error("[EVAL API ERROR]", err)
    await logServerError({
      route: "/api/evaluations/[id]",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: err,
    })
    return NextResponse.json({ error: "Failed to fetch evaluation" }, { status: 500 })
  }
}
