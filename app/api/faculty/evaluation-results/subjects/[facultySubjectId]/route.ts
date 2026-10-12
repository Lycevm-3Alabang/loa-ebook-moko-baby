import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  evaluationRepository,
  evaluationResultRepository,
  userRepository,
  facultySubjectRepository,
  subjectRepository,
  departmentRepository,
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ facultySubjectId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = (session.user as Record<string, unknown>).id as string
  const { facultySubjectId } = await params

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })

    await evaluationResultRepository.assertPeriodIsActive(evaluationPeriodId)

    const visRow = await evaluationResultRepository.getVisibilityMap(evaluationPeriodId)
    if (!visRow.get(userId)) {
      return NextResponse.json({ error: "Evaluation results are not visible yet" }, { status: 403 })
    }

    const facultyUser = await userRepository.findById(userId)
    if (!facultyUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const fsMatch = await facultySubjectRepository.findById(facultySubjectId)
    if (!fsMatch) {
      return NextResponse.json({ error: "Faculty-subject not found" }, { status: 404 })
    }

    const subject = await subjectRepository.findById(fsMatch.subject_id)

    let deptInfo = { id: "", name: "", code: "" }
    if (facultyUser.departmentId) {
      const dept = await departmentRepository.findById(facultyUser.departmentId)
      if (dept) deptInfo = dept
    }

    const evals = await evaluationRepository.listSubmittedByPeriodAndEvaluateeAndFS(evaluationPeriodId, userId, facultySubjectId)
    if (evals.length === 0) return NextResponse.json({ error: "No evaluations found" }, { status: 404 })

    const evaluationIds = evals.map((e) => e.id)

    const [ratings, comments] = await Promise.all([
      evaluationRepository.listRatingsByEvaluationIds(evaluationIds),
      evaluationRepository.listFullCommentsByEvaluationIds(evaluationIds),
    ])

    const commentsByEval = new Map<string, typeof comments>()
    for (const c of comments) {
      if (!commentsByEval.has(c.evaluationId)) commentsByEval.set(c.evaluationId, [])
      commentsByEval.get(c.evaluationId)!.push(c)
    }

    const catAverages = computeCategoryAverages(ratings)
    const general = computeGeneralRating(catAverages)
    const catColumns = mapCategoryAveragesToColumns(catAverages)
    const rubrics = findHighestLowestRubrics(catColumns)
    const sentiment = computeSentimentScore(comments)

    const evaluationRows = evals.map((ev) => {
      const evalRatings = ratings.filter((r) => r.evaluationId === ev.id)
      const evalCatAverages = computeCategoryAverages(evalRatings)
      const evalGeneral = computeGeneralRating(evalCatAverages)
      const evalCatColumns = mapCategoryAveragesToColumns(evalCatAverages)

      const evalComments = commentsByEval.get(ev.id) ?? []

      return {
        evaluationId: ev.id,
        submittedAt: ev.submittedAt,
        generalRating: evalGeneral,
        ...evalCatColumns,
        comment: evalComments.length > 0 ? evalComments[0].comment : null,
        sentimentLabel: evalComments.length > 0 ? evalComments[0].sentimentLabel : null,
        sentimentScore: evalComments.length > 0 ? evalComments[0].sentimentScore : null,
      }
    })

    return NextResponse.json({
      faculty: { id: facultyUser.id, name: facultyUser.name, email: facultyUser.email },
      subject: subject ? { id: subject.id, code: subject.code, name: subject.name } : null,
      department: deptInfo,
      summary: {
        totalRespondents: evaluationRows.length,
        avgRating: general,
        remarks: getRemark(general),
        ...catColumns,
        highestRubrics: rubrics.highest,
        lowestRubrics: rubrics.lowest,
        sentimentScore: sentiment,
      },
      evaluations: evaluationRows,
    })
  } catch (e) {
    if (e instanceof EvaluationPeriodInactiveError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("Faculty subject detail error:", e)
    return NextResponse.json({ error: "Failed to fetch evaluation detail" }, { status: 500 })
  }
}
