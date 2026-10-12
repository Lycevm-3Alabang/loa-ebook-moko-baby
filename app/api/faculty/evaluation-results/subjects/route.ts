import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  evaluationRepository,
  evaluationResultRepository,
  facultySubjectRepository,
  subjectRepository,
} from "@/lib/repositories/factory"
import { EvaluationPeriodInactiveError } from "@/features/evaluation-results/evaluation-results.repository"
import {
  computeCategoryAverages,
  computeGeneralRating,
  mapCategoryAveragesToColumns,
  findHighestLowestRubrics,
  computeSentimentScore,
  getRemark,
} from "@/lib/evaluation-utils"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = (session.user as Record<string, unknown>).id as string

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })

    await evaluationResultRepository.assertPeriodIsActive(evaluationPeriodId)

    const visRow = await evaluationResultRepository.getVisibilityMap(evaluationPeriodId)
    if (!visRow.get(userId)) {
      return NextResponse.json({ error: "Evaluation results are not visible yet" }, { status: 403 })
    }

    const evals = await evaluationRepository.listSubmittedByPeriodAndEvaluatee(evaluationPeriodId, userId)
    if (evals.length === 0) return NextResponse.json({ subjects: [] })

    const evaluationIds = evals.map((e) => e.id)
    const fsIds = [...new Set(evals.map((e) => e.facultySubjectId).filter(Boolean))] as string[]

    const [ratings, commentsRaw] = await Promise.all([
      evaluationRepository.listRatingsByEvaluationIds(evaluationIds),
      evaluationRepository.listCommentsByEvaluationIds(evaluationIds),
    ])

    const commentsByEval = new Map<string, { sentimentScore: number | null }[]>()
    for (const c of commentsRaw) {
      if (!commentsByEval.has(c.evaluationId)) commentsByEval.set(c.evaluationId, [])
      commentsByEval.get(c.evaluationId)!.push(c)
    }

    const facultySubjects = await facultySubjectRepository.findByIds(fsIds)
    const fsMap = new Map(facultySubjects.map((fs) => [fs.id, fs]))

    const subjIds = [...new Set(facultySubjects.map((fs) => fs.subject_id))]
    const subjects = await subjectRepository.findByIds(subjIds)
    const subjMap = new Map(subjects.map((s) => [s.id, s]))

    const groupEvalMap = new Map<string, string[]>()
    for (const ev of evals) {
      const key = ev.facultySubjectId || ev.id
      if (!groupEvalMap.has(key)) groupEvalMap.set(key, [])
      groupEvalMap.get(key)!.push(ev.id)
    }

    const subjectsList: Record<string, unknown>[] = []
    for (const [fsKey, evalIds] of groupEvalMap) {
      const fs = fsMap.get(fsKey)
      const subj = fs ? subjMap.get(fs.subject_id) : null

      const groupRatings = ratings.filter((r) => evalIds.includes(r.evaluationId))
      const catAverages = computeCategoryAverages(groupRatings)
      const general = computeGeneralRating(catAverages)
      const catColumns = mapCategoryAveragesToColumns(catAverages)
      const rubrics = findHighestLowestRubrics(catColumns)

      const groupComments = evalIds.flatMap((eid) => commentsByEval.get(eid) ?? [])
      const sentiment = computeSentimentScore(groupComments)

      subjectsList.push({
        facultySubjectId: fsKey,
        subjectCode: subj?.code ?? "",
        subjectName: subj?.name ?? "",
        totalRespondents: evalIds.length,
        avgRating: general,
        remarks: getRemark(general),
        highestRubrics: rubrics.highest,
        lowestRubrics: rubrics.lowest,
        sentimentScore: sentiment,
      })
    }

    return NextResponse.json({ subjects: subjectsList })
  } catch (e) {
    if (e instanceof EvaluationPeriodInactiveError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("Faculty subjects evaluation error:", e)
    return NextResponse.json({ error: "Failed to fetch evaluation results" }, { status: 500 })
  }
}
