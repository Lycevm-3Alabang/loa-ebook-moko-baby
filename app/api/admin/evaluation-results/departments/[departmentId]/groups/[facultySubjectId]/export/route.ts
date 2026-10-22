import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import {
  facultySubjectRepository,
  userRepository,
  subjectRepository,
  departmentRepository,
  evaluationPeriodRepository,
  sectionRepository,
  rubricRepository,
} from "@/lib/repositories/factory"
import {
  isSubjectInDepartment,
} from "@/lib/evaluation-utils"
import { getSubjectResultSet } from "@/features/evaluation-results/evaluation-results.service"
import { buildEvaluationWorkbook } from "@/lib/evaluation-form-xlsx"

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

    const [faculty, subject, dept, section, period] = await Promise.all([
      userRepository.findById(fsData.faculty_id),
      subjectRepository.findById(fsData.subject_id),
      departmentRepository.findById(departmentId),
      fsData.section_id ? sectionRepository.findById(fsData.section_id) : Promise.resolve(null),
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
      employeeNo: faculty?.employeeNo ?? null,
      facultyName: faculty?.name ?? "Unknown",
      program: section?.program ?? null,
      sectionName: section?.name ?? null,
      subjectCode: subject?.code ?? "",
      subjectName: subject?.name ?? "",
      departmentName: dept?.name ?? "Department",
      departmentCode: dept?.code ?? "",
      semesterTitle: period?.semesterTitle ?? null,
      evaluationPeriodName: period?.name ?? null,
      avgRating: resultSet.summary.avgRating,
      remarks: resultSet.summary.remarks,
      totalRespondents: resultSet.summary.totalRespondents,
      criteria,
      comments: resultSet.comments,
    })

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
