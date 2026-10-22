import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { logServerError } from "@/lib/services/audit"
import {
  facultySubjectRepository,
  userRepository,
  subjectRepository,
  evaluationPeriodRepository,
  rubricRepository,
  evaluationResultRepository,
} from "@/lib/repositories/factory"
import { EvaluationPeriodInactiveError } from "@/features/evaluation-results/evaluation-results.repository"
import { getSubjectResultSet } from "@/features/evaluation-results/evaluation-results.service"
import { buildSubjectWorkbook } from "@/lib/xlsx/subject-workbook"
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

    const [subject, period] = await Promise.all([
      subjectRepository.findById(fsData.subject_id),
      evaluationPeriodRepository.findById(evaluationPeriodId),
    ])

    if (!period) return NextResponse.json({ error: "periodId is required" }, { status: 400 })

    const rubricCategories = period.rubricGroupId
      ? await rubricRepository.getCategoriesWithItems(period.rubricGroupId)
      : []

    const resultSet = await getSubjectResultSet(facultySubjectId, evaluationPeriodId)
    if (!resultSet) {
      return NextResponse.json({ error: "No evaluations found" }, { status: 404 })
    }

    // ⭐ the workbook is assembled in ONE place — the three routes and the
    // department ZIP share it, so they cannot drift
    const bytes = buildSubjectWorkbook(resultSet, rubricCategories, loadLetterhead())

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
