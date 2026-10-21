import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import {
  facultySubjectRepository,
  userRepository,
  subjectRepository,
  departmentRepository,
  evaluationRepository,
  evaluationPeriodRepository,
  sectionRepository,
} from "@/lib/repositories/factory"
import {
  computeCategoryAverages,
  computeGeneralRating,
  mapCategoryAveragesToColumns,
  findHighestLowestRubrics,
  computeSentimentScore,
  getRemark,
  isSubjectInDepartment,
} from "@/lib/evaluation-utils"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ departmentId: string; facultySubjectId: string }> },
) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const { departmentId, facultySubjectId } = await params

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "periodId is required" }, { status: 400 })

    const fsData = await facultySubjectRepository.findById(facultySubjectId)
    if (!fsData) return NextResponse.json({ error: "Faculty-subject not found" }, { status: 404 })

    const [faculty, subject, dept, allSections, period] = await Promise.all([
      userRepository.findById(fsData.faculty_id),
      subjectRepository.findById(fsData.subject_id),
      departmentRepository.findById(departmentId),
      sectionRepository.list(),
      // The period AND its semester, in one read — the repository joins
      // semesters!inner(title), so the export's header never has to guess.
      evaluationPeriodRepository.findById(evaluationPeriodId),
    ])

    // The subject belongs to the teacher's HOME department (contract §3.1).
    // The department's drill-down is the only thing that scopes a subject
    // today, so without this the URL is a way around it (D9).
    if (!isSubjectInDepartment(faculty, departmentId)) {
      return NextResponse.json({ error: "This subject does not belong to the department" }, { status: 404 })
    }

    // Sections are few — one lookup for the row's OWN section.
    const section = fsData.section_id ? allSections.find((s) => s.id === fsData.section_id) : undefined

    const evals = await evaluationRepository.listSubmittedByPeriodAndEvaluateeAndFS(evaluationPeriodId, fsData.faculty_id, facultySubjectId)
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
      department: dept ? { id: dept.id, name: dept.name, code: dept.code } : null,
      faculty: faculty
        ? { id: faculty.id, name: faculty.name, email: faculty.email, employeeNo: faculty.employeeNo }
        : null,
      subject: subject ? { id: subject.id, code: subject.code, name: subject.name } : null,
      sectionProgram: section?.program ?? null,
      sectionName: section?.name ?? null,
      evaluationPeriodName: period?.name ?? null,
      semesterTitle: period?.semesterTitle ?? null,
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
    console.error("Group evaluation detail error:", e)
    await logServerError({
      route: "/api/admin/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: "Failed to fetch evaluation detail" }, { status: 500 })
  }
}
