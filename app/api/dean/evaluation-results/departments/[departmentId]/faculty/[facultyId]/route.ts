import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import {
  userRepository,
  departmentRepository,
  facultySubjectRepository,
  evaluationRepository,
  evaluationResultRepository,
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
  { params }: { params: Promise<{ departmentId: string; facultyId: string }> },
) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "DEAN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { departmentId, facultyId } = await params

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })

    await evaluationResultRepository.assertPeriodIsActive(evaluationPeriodId)

    const deanId = (session.user as Record<string, unknown>).id as string
    const deanDept = await departmentRepository.findByDeanId(deanId)
    const deptAccess = await departmentRepository.findById(departmentId)
    if (!deptAccess || deptAccess.deanId !== deanId) {
      return NextResponse.json({ error: `You manage ${deanDept?.name ?? "your department"} — tried to open ${departmentId}` }, { status: 403 })
    }

    const faculty = await userRepository.findById(facultyId)
    if (!faculty) return NextResponse.json({ error: "Faculty not found" }, { status: 404 })

    const dept = await departmentRepository.findById(departmentId)
    if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 })

    const fsList = await facultySubjectRepository.findByFacultyIdWithEmbeds(facultyId)
    if (!fsList || fsList.length === 0) {
      return NextResponse.json({ error: "No subjects found for this faculty" }, { status: 404 })
    }

    const facultySubjectIds = fsList.map((fs) => fs.id)

    const evals = await evaluationRepository.listSubmittedByPeriodAndFacultySubjectIds(evaluationPeriodId, facultySubjectIds)
    if (evals.length === 0) {
      return NextResponse.json({ error: "No evaluations found for this faculty" }, { status: 404 })
    }

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

    const subjectCodes = [...new Set(fsList.map((fs) => fs.subjects?.code).filter(Boolean))]

    return NextResponse.json({
      faculty: { id: faculty.id, name: faculty.name, email: faculty.email },
      department: { id: dept.id, name: dept.name, code: dept.code },
      subject: {
        code: subjectCodes.join(", ") || "Multiple Subjects",
      },
      summary: {
        totalRespondents: evaluationRows.length,
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
      },
      evaluations: evaluationRows,
    })
  } catch (e) {
    if (e instanceof EvaluationPeriodInactiveError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("Consolidated dean faculty evaluation error:", e)
    await logServerError({
      route: "/api/dean/evaluation-results/departments/[departmentId]/faculty/[facultyId]",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      email: (session?.user as unknown as { email?: string | null } | undefined)?.email ?? null,
      role: (session?.user as unknown as { role?: string | null } | undefined)?.role ?? null,
      error: e,
    })
    return NextResponse.json({ error: "Failed to fetch consolidated evaluation" }, { status: 500 })
  }
}
