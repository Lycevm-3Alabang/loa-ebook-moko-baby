import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import {
  userRepository,
  evaluationRepository,
  facultySubjectRepository,
  subjectRepository,
  departmentRepository,
  evaluationResultRepository,
} from "@/lib/repositories/factory"
import { buildFacultySummary, getRemark } from "@/lib/evaluation-utils"

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

    const facUsers = await userRepository.listByDepartment(departmentId)
    if (!facUsers || facUsers.length === 0) return NextResponse.json({ department: null, subjects: [] })

    const facIds = facUsers.map((u) => u.id)
    const facNameMap = new Map(facUsers.map((u) => [u.id, u]))

    const evals = await evaluationRepository.listSubmittedByPeriodAndEvaluatees(evaluationPeriodId, facIds)
    if (evals.length === 0) return NextResponse.json({ department: null, subjects: [] })

    const evaluationIds = evals.map((e) => e.id)

    const [ratings, commentsRaw] = await Promise.all([
      evaluationRepository.listRatingsByEvaluationIds(evaluationIds),
      evaluationRepository.listCommentsByEvaluationIds(evaluationIds),
    ])

    const commentsByEval = new Map<string, { sentimentScore: number | null }[]>()
    for (const c of commentsRaw) {
      if (!commentsByEval.has(c.evaluationId)) commentsByEval.set(c.evaluationId, [])
      commentsByEval.get(c.evaluationId)!.push(c)
    }

    const fsIds = [...new Set(evals.map((e) => e.facultySubjectId).filter(Boolean))] as string[]
    const facultySubjects = await facultySubjectRepository.findByIds(fsIds)
    const subjects = await subjectRepository.findByIds([...new Set(facultySubjects.map((fs) => fs.subject_id))])
    const fsMap = new Map(facultySubjects.map((fs) => [fs.id, fs]))
    const subjMap = new Map(subjects.map((s) => [s.id, s]))

    const groupEvalMap = new Map<string, string[]>()
    for (const ev of evals) {
      const key = ev.facultySubjectId || ev.evaluateeId
      if (!groupEvalMap.has(key)) groupEvalMap.set(key, [])
      groupEvalMap.get(key)!.push(ev.id)
    }

    const subjectsList: Record<string, unknown>[] = []
    for (const [fsKey, evalIds] of groupEvalMap) {
      const fs = fsMap.get(fsKey)
      if (!fs) continue

      const user = facNameMap.get(fs.faculty_id)
      const subj = subjMap.get(fs.subject_id)

      const groupRatings = ratings.filter((r) => evalIds.includes(r.evaluationId))
      const groupComments = evalIds.flatMap((eid) => commentsByEval.get(eid) ?? [])
      const summary = buildFacultySummary(groupRatings, groupComments)

      subjectsList.push({
        facultySubjectId: fsKey,
        facultyId: fs.faculty_id,
        facultyName: user?.name ?? "Unknown",
        facultyEmail: user?.email ?? "",
        subjectId: fs.subject_id,
        subjectCode: subj?.code ?? "",
        subjectName: subj?.name ?? "",
        totalRespondents: evalIds.length,
        avgRating: summary.general,
        remarks: getRemark(summary.general),
        professionalManner: summary.catColumns.professionalManner,
        communicationWithStudent: summary.catColumns.communicationWithStudent,
        studentEngagement: summary.catColumns.studentEngagement,
        learningMaterials: summary.catColumns.learningMaterials,
        timeManagement: summary.catColumns.timeManagement,
        experientialLearning: summary.catColumns.experientialLearning,
        respectUniqueness: summary.catColumns.respectUniqueness,
        assessmentAndFeedback: summary.catColumns.assessmentAndFeedback,
        highestRubrics: summary.rubrics.highest,
        lowestRubrics: summary.rubrics.lowest,
        sentimentScore: summary.sentiment,
      })
    }

    const dept = await departmentRepository.findById(departmentId)

    const visMap = await evaluationResultRepository.getVisibilityMap(evaluationPeriodId)
    const visibilityMap: Record<string, boolean> = {}
    for (const item of subjectsList) {
      visibilityMap[item.facultyId as string] = visMap.get(item.facultyId as string) ?? false
    }

    return NextResponse.json({
      department: dept ?? null,
      subjects: subjectsList,
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
