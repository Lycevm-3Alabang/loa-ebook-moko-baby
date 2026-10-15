import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { evaluationResultRepository, evaluationRepository, userRepository } from "@/lib/repositories/factory"
import { EvaluationPeriodInactiveError } from "@/features/evaluation-results/evaluation-results.repository"
import { logServerError } from "@/lib/services/audit"

const CATEGORY_NAMES: Record<string, string> = {
  "Professional Manner": "professionalManner",
  "Communication with Students": "communicationWithStudent",
  "Student Engagement": "studentEngagement",
  "Learning Materials": "learningMaterials",
  "Time Management": "timeManagement",
  "Experiential Learning Provided to Students": "experientialLearning",
  "Experiential Learning": "experientialLearning",
  "Respect the Uniqueness of the Students": "respectUniqueness",
  "Respect for Uniqueness": "respectUniqueness",
  "Assessment and Feedback": "assessmentAndFeedback",
}

function getRemark(general: number | null): string | null {
  if (general === null) return null
  if (general >= 4.5) return "Outstanding"
  if (general >= 3.5) return "Very Satisfactory"
  if (general >= 2.5) return "Satisfactory"
  if (general >= 1.5) return "Unsatisfactory"
  return "Poor"
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("periodId")
    const userId = (session.user as Record<string, unknown>).id as string
    if (!evaluationPeriodId) return NextResponse.json({ error: "periodId is required" }, { status: 400 })

    await evaluationResultRepository.assertPeriodIsActive(evaluationPeriodId)

    const visMap = await evaluationResultRepository.getVisibilityMap(evaluationPeriodId)
    if (!visMap.get(userId)) {
      return NextResponse.json({ error: "Results are not visible yet. Admin has not enabled 'Allow User To View Results' for this evaluation period." }, { status: 403 })
    }

    const evals = await evaluationRepository.listSubmittedByPeriodAndEvaluatee(evaluationPeriodId, userId)

    if (evals.length === 0) {
      return NextResponse.json({ results: [], facultyNames: {} })
    }

    const evaluationIds = evals.map((e) => e.id)
    const ratings = await evaluationRepository.listRatingsByEvaluationIds(evaluationIds)

    const catRatings: Record<string, number[]> = {}
    for (const r of ratings) {
      const catName = r.rubric_items.rubric_categories.name
      if (!catRatings[catName]) catRatings[catName] = []
      catRatings[catName].push(r.rating)
    }

    const catAverages: Record<string, number> = {}
    for (const [cat, vals] of Object.entries(catRatings)) {
      catAverages[cat] = vals.reduce((a, b) => a + b, 0) / vals.length
    }

    const general = Object.keys(catAverages).length > 0
      ? Object.values(catAverages).reduce((a, b) => a + b, 0) / Object.keys(catAverages).length
      : null

    const result: Record<string, unknown> = {
      id: `${evaluationPeriodId}_${userId}`,
      evaluationPeriodId,
      facultyId: userId,
      departmentId: null,
      totalRespondents: evaluationIds.length,
      generalRating: general !== null ? Math.round(general * 100) / 100 : null,
      remarks: getRemark(general),
      professionalManner: null,
      communicationWithStudent: null,
      studentEngagement: null,
      learningMaterials: null,
      timeManagement: null,
      experientialLearning: null,
      respectUniqueness: null,
      assessmentAndFeedback: null,
    }

    for (const [catName, avg] of Object.entries(catAverages)) {
      const col = CATEGORY_NAMES[catName]
      if (col) {
        result[col] = Math.round(avg * 100) / 100
      }
    }

    const user = await userRepository.findById(userId)

    return NextResponse.json({
      results: [result],
      facultyNames: { [userId]: user?.name || userId },
    })
  } catch (e) {
    if (e instanceof EvaluationPeriodInactiveError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("Faculty evaluation results error:", e)
    await logServerError({
      route: "/api/faculty/evaluation-results",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      email: (session?.user as unknown as { email?: string | null } | undefined)?.email ?? null,
      role: (session?.user as unknown as { role?: string | null } | undefined)?.role ?? null,
      error: e,
    })
    return NextResponse.json({ error: "Failed to fetch evaluation results" }, { status: 500 })
  }
}
