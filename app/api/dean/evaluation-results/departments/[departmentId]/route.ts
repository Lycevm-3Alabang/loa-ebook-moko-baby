import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import {
  departmentRepository,
  userRepository,
  evaluationRepository,
  evaluationResultRepository,
  facultySubjectRepository,
  subjectRepository,
} from "@/lib/repositories/factory"
import { EvaluationPeriodInactiveError } from "@/features/evaluation-results/evaluation-results.repository"
import { logServerError } from "@/lib/services/audit"
import {
  computeCategoryAverages,
  computeGeneralRating,
  mapCategoryAveragesToColumns,
  findHighestLowestRubrics,
  computeSentimentScore,
  getRemark,
} from "@/lib/evaluation-utils"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ departmentId: string }> },
) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "DEAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const userId = (session.user as Record<string, unknown>).id as string
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

    const facUsers = await userRepository.listByDepartment(departmentId)
    if (!facUsers || facUsers.length === 0) return NextResponse.json({ department: null, subjects: [] })

    const facIds = facUsers.map((u) => u.id)

    const visMap = await evaluationResultRepository.getVisibilityMap(evaluationPeriodId)
    const anyVisible = facIds.some((id) => visMap.get(id))
    if (!anyVisible) {
      return NextResponse.json({ error: `ADMIN hasn't released results for ${dept.name} yet` }, { status: 403 })
    }

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

  const validEvals = evals.filter((ev) => {
    if (!ev.facultySubjectId) return false
    const fs = fsMap.get(ev.facultySubjectId)
    return !!fs && fs.faculty_id === ev.evaluateeId
  })

  const groupEvalMap = new Map<string, string[]>()
  for (const ev of validEvals) {
    const key = ev.facultySubjectId as string
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
      const catAverages = computeCategoryAverages(groupRatings)
      const general = computeGeneralRating(catAverages)
      const catColumns = mapCategoryAveragesToColumns(catAverages)
      const rubrics = findHighestLowestRubrics(catColumns)

      const groupComments = evalIds.flatMap((eid) => commentsByEval.get(eid) ?? [])
      const sentiment = computeSentimentScore(groupComments)

      subjectsList.push({
        facultySubjectId: fsKey,
        facultyId: fs.faculty_id,
        facultyName: user?.name ?? "Unknown",
        facultyEmail: user?.email ?? "",
        subjectId: fs.subject_id,
        subjectCode: subj?.code ?? "",
        subjectName: subj?.name ?? "",
        totalRespondents: evalIds.length,
        avgRating: general,
        remarks: getRemark(general),
        professionalManner: catColumns.professionalManner,
        communicationWithStudent: catColumns.communicationWithStudent,
        studentEngagement: catColumns.studentEngagement,
        learningMaterials: catColumns.learningMaterials,
        timeManagement: catColumns.timeManagement,
        experientialLearning: catColumns.experientialLearning,
        respectUniqueness: catColumns.respectUniqueness,
        assessmentAndFeedback: catColumns.assessmentAndFeedback,
        highestRubrics: rubrics.highest,
        lowestRubrics: rubrics.lowest,
        sentimentScore: sentiment,
      })
    }

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
    if (e instanceof EvaluationPeriodInactiveError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("Dean department evaluation results error:", e)
    await logServerError({
      route: "/api/dean/evaluation-results/departments/[departmentId]",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      email: (session?.user as unknown as { email?: string | null } | undefined)?.email ?? null,
      role: (session?.user as unknown as { role?: string | null } | undefined)?.role ?? null,
      error: e,
    })
    return NextResponse.json({ error: "Failed to fetch department evaluation results" }, { status: 500 })
  }
}
