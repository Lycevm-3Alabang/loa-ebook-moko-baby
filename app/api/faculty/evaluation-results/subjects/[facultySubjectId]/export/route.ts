import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { logServerError } from "@/lib/services/audit"
import {
  facultySubjectRepository,
  userRepository,
  subjectRepository,
  evaluationPeriodRepository,
  sectionRepository,
  rubricRepository,
  evaluationResultRepository,
} from "@/lib/repositories/factory"
import { EvaluationPeriodInactiveError } from "@/features/evaluation-results/evaluation-results.repository"
import { getSubjectResultSet } from "@/features/evaluation-results/evaluation-results.service"
import { buildEvaluationWorkbook } from "@/lib/xlsx/workbook"
import { loadLetterhead } from "@/lib/xlsx/letterhead"

export const maxDuration = 60

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
    if (!evaluationPeriodId) return NextResponse.json({ error: "periodId is required" }, { status: 400 })

    await evaluationResultRepository.assertPeriodIsActive(evaluationPeriodId)

    const visRow = await evaluationResultRepository.getVisibilityMap(evaluationPeriodId)
    if (!visRow.get(userId)) {
      return NextResponse.json({ error: "Results for this period are still hidden — ask your DEAN or ADMIN to enable them" }, { status: 403 })
    }

    const fsData = await facultySubjectRepository.findById(facultySubjectId)
    if (!fsData) return NextResponse.json({ error: "Faculty-subject not found" }, { status: 404 })
    if (fsData.faculty_id !== userId) {
      return NextResponse.json({ error: "This subject belongs to another faculty member" }, { status: 403 })
    }

    const facultyUser = await userRepository.findById(userId)
    if (!facultyUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const [subject, period, section] = await Promise.all([
      subjectRepository.findById(fsData.subject_id),
      evaluationPeriodRepository.findById(evaluationPeriodId),
      fsData.section_id ? sectionRepository.findById(fsData.section_id) : Promise.resolve(null),
    ])

    if (!period) return NextResponse.json({ error: "periodId is required" }, { status: 400 })

    const rubricCategories = period.rubricGroupId
      ? await rubricRepository.getCategoriesWithItems(period.rubricGroupId)
      : []

    const resultSet = await getSubjectResultSet(facultySubjectId, evaluationPeriodId)
    if (!resultSet) {
      return NextResponse.json({ error: "No evaluations found" }, { status: 404 })
    }

    const itemByStatement = new Map(resultSet.itemAverages.map((i) => [i.itemId, i]))
    const criteria = rubricCategories.map((category) => ({
      name: category.name,
      average: resultSet.summary.categoryAverages[category.name] ?? null,
      statements: ((category as { items?: { id: string; text: string }[] }).items ?? []).map((item) => ({
        text: item.text,
        avg: itemByStatement.get(item.id)?.avg ?? null,
      })),
    }))

    const bytes = buildEvaluationWorkbook({
      form: {
        semesterTitle: period.semesterTitle ?? null,
        evaluationPeriodName: period.name ?? null,
        employeeNo: facultyUser.employeeNo,
        facultyName: facultyUser.name,
        program: section?.program ?? null,
        sectionName: section?.name ?? null,
        subject: subject ? { code: subject.code, name: subject.name } : null,
        avgRating: resultSet.summary.avgRating,
        remarks: resultSet.summary.remarks,
        totalRespondents: resultSet.summary.totalRespondents,
        criteria,
      },
      // ⭐ the letterhead is decoration — a missing logo must not fail the export
      logo: loadLetterhead(),
      // the Comments sheet: the texts only (no date, by the owner's decision)
      comments: resultSet.comments.map((comment) => comment.comment),
      // ⭐ the rows carry the LIVE per-response map, so the Overall sheet's
      // columns follow the rubric with the values under them — no second query
      responses: resultSet.evaluations,
    })

    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${(subject?.code ?? "subject").replace(/[^a-zA-Z0-9_-]/g, "_")}_${(facultyUser?.name ?? "faculty").replace(/[^a-zA-Z0-9_-]/g, "_")}_evaluation.xlsx"`,
      },
    })
  } catch (e) {
    if (e instanceof EvaluationPeriodInactiveError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("Faculty subject evaluation export error:", e)
    await logServerError({
      route: "/api/faculty/evaluation-results/subjects/[facultySubjectId]/export",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      email: (session?.user as unknown as { email?: string | null } | undefined)?.email ?? null,
      role: (session?.user as unknown as { role?: string | null } | undefined)?.role ?? null,
      error: e,
    })
    return NextResponse.json({ error: `Failed to export: ${(e as Error).message}` }, { status: 500 })
  }
}
