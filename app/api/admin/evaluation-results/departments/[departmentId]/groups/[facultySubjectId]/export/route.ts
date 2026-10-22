import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import {
  facultySubjectRepository,
  userRepository,
  subjectRepository,
  evaluationPeriodRepository,
  rubricRepository,
} from "@/lib/repositories/factory"
import {
  isSubjectInDepartment,
} from "@/lib/evaluation-utils"
import { getSubjectResultSet } from "@/features/evaluation-results/evaluation-results.service"
import { buildSubjectWorkbook } from "@/lib/xlsx/subject-workbook"
import { loadLetterhead } from "@/lib/xlsx/letterhead"

export const maxDuration = 60

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

    const [faculty, subject, period] = await Promise.all([
      userRepository.findById(fsData.faculty_id),
      subjectRepository.findById(fsData.subject_id),
      evaluationPeriodRepository.findById(evaluationPeriodId),
    ])

    if (!isSubjectInDepartment(faculty, departmentId)) {
      return NextResponse.json({ error: "This subject does not belong to the department" }, { status: 404 })
    }
    if (!period) return NextResponse.json({ error: "periodId is required" }, { status: 400 })

    const rubricCategories = period.rubricGroupId
      ? await rubricRepository.getCategoriesWithItems(period.rubricGroupId)
      : []

    // one read, shared with the subject page
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
        "Content-Disposition": `attachment; filename="${(subject?.code ?? "subject").replace(/[^a-zA-Z0-9_-]/g, "_")}_${(faculty?.name ?? "faculty").replace(/[^a-zA-Z0-9_-]/g, "_")}_evaluation.xlsx"`,
      },
    })
  } catch (e) {
    console.error("Group evaluation export error:", e)
    await logServerError({
      route: "/api/admin/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/export",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: `Failed to export: ${(e as Error).message}` }, { status: 500 })
  }
}
