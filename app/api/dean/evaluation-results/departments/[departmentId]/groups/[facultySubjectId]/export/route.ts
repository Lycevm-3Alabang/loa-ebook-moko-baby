import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { logServerError } from "@/lib/services/audit"
import {
  facultySubjectRepository,
  userRepository,
  subjectRepository,
  departmentRepository,
  evaluationRepository,
  evaluationPeriodRepository,
  sectionRepository,
  rubricRepository,
} from "@/lib/repositories/factory"
import { EvaluationPeriodInactiveError } from "@/features/evaluation-results/evaluation-results.repository"
import { getSubjectResultSet } from "@/features/evaluation-results/evaluation-results.service"
import { buildEvaluationWorkbook } from "@/lib/evaluation-form-xlsx"

export const maxDuration = 60

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ departmentId: string; facultySubjectId: string }> },
) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "DEAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const userId = (session.user as Record<string, unknown>).id as string
  const dept = await departmentRepository.findByDeanId(userId)
  if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  const { departmentId, facultySubjectId } = await params
  if (departmentId !== dept.id) {
    return NextResponse.json({ error: `You manage ${dept.name} — tried to open ${departmentId}` }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "periodId is required" }, { status: 400 })

    await evaluationResultRepository.assertPeriodIsActive(evaluationPeriodId)

    const fsData = await facultySubjectRepository.findById(facultySubjectId)
    if (!fsData) return NextResponse.json({ error: "Faculty-subject not found" }, { status: 404 })

    const [faculty, subject, deptInfo, section, period] = await Promise.all([
      userRepository.findById(fsData.faculty_id),
      subjectRepository.findById(fsData.subject_id),
      departmentRepository.findById(departmentId),
      fsData.section_id ? sectionRepository.findById(fsData.section_id) : Promise.resolve(null),
      evaluationPeriodRepository.findById(evaluationPeriodId),
    ])

    // the subject belongs to the teacher's HOME department (contract §3.1)
    if (!faculty || faculty.departmentId !== departmentId) {
      return NextResponse.json({ error: "This subject does not belong to your department" }, { status: 404 })
    }
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
      statements: (category.items ?? []).map((item) => ({
        text: item.text,
        avg: itemByStatement.get(item.id)?.avg ?? null,
      })),
    }))

    const bytes = buildEvaluationWorkbook({
      employeeNo: faculty.employeeNo,
      facultyName: faculty.name,
      program: section?.program ?? null,
      sectionName: section?.name ?? null,
      subjectCode: subject?.code ?? "",
      subjectName: subject?.name ?? "",
      departmentName: deptInfo?.name ?? "Department",
      departmentCode: deptInfo?.code ?? "",
      semesterTitle: period.semesterTitle ?? null,
      evaluationPeriodName: period.name ?? null,
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
    if (e instanceof EvaluationPeriodInactiveError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("Dean group evaluation export error:", e)
    await logServerError({
      route: "/api/dean/evaluation-results/departments/[departmentId]/groups/[facultySubjectId]/export",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      email: (session?.user as unknown as { email?: string | null } | undefined)?.email ?? null,
      role: (session?.user as unknown as { role?: string | null } | undefined)?.role ?? null,
      error: e,
    })
    return NextResponse.json({ error: `Failed to export: ${(e as Error).message}` }, { status: 500 })
  }
}
