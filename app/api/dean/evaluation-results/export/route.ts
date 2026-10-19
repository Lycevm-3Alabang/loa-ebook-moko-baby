import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { departmentRepository, evaluationResultRepository } from "@/lib/repositories/factory"
import { logServerError } from "@/lib/services/audit"
import { getDepartmentSubjectResults, type DepartmentSubjectResult } from "@/features/evaluation-results/evaluation-results.service"
import { createZip } from "@/lib/zip"

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function subjectCsv(subjects: DepartmentSubjectResult[]): string {
  const headers = ["Faculty", "Faculty Email", "Subject Code", "Subject", "Respondents", "Avg Rating", "Remark", "Professional Manner", "Communication w/ Students", "Student Engagement", "Learning Materials", "Time Management", "Experiential Learning", "Respect for Uniqueness", "Assessment & Feedback", "Sentiment"]
  const rows = subjects.map((s) => [
    s.facultyName, s.facultyEmail, s.subjectCode, s.subjectName, s.totalRespondents,
    s.avgRating ?? "", s.remarks ?? "",
    s.professionalManner ?? "", s.communicationWithStudent ?? "", s.studentEngagement ?? "",
    s.learningMaterials ?? "", s.timeManagement ?? "", s.experientialLearning ?? "",
    s.respectUniqueness ?? "", s.assessmentAndFeedback ?? "", s.sentimentScore ?? "",
  ])
  return [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n")
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "DEAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })

    const userId = (session.user as Record<string, unknown>).id as string
    const dept = await departmentRepository.findByDeanId(userId)
    if (!dept) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { subjects } = await getDepartmentSubjectResults(evaluationPeriodId, dept.id)
    const liveAvgs = await evaluationResultRepository.listLiveDeptAverages(evaluationPeriodId)
    const avg = liveAvgs.find((a) => a.departmentId === dept.id)

    const encoder = new TextEncoder()
    const entries: { name: string; data: Uint8Array }[] = []

    if (subjects.length > 0) {
      const code = (dept.code || dept.id).replace(/[^a-zA-Z0-9_-]/g, "_")
      entries.push({ name: `${code}_results.csv`, data: encoder.encode(subjectCsv(subjects)) })
    }

    if (subjects.length === 0) {
      return NextResponse.json({ error: "No data to export" }, { status: 404 })
    }

    const summaryHeaders = ["Department", "Code", "Faculty Count", "Respondents", "Avg Rating", "Remark"]
    const summaryRows = [[dept.name, dept.code ?? "", avg?.facultyIds.length ?? 0, avg?.totalRespondents ?? 0, avg?.avgRating ?? "", avg?.remarks ?? ""]]
    const summaryCsv = [summaryHeaders.join(","), ...summaryRows.map((r) => r.map(csvEscape).join(","))].join("\n")
    entries.push({ name: "summary.csv", data: encoder.encode(summaryCsv) })

    const zip = createZip(entries)
    return new NextResponse(zip as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="evaluation-results-${dept.code || dept.id}.zip"`,
      },
    })
  } catch (e) {
    const errShape = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    console.error("Dean evaluation results export error:", JSON.stringify({ message: errShape?.message, code: errShape?.code, details: errShape?.details, hint: errShape?.hint }))
    await logServerError({ route: "/api/dean/evaluation-results/export", method: request.method, params: Object.fromEntries(new URL(request.url).searchParams), error: e })
    return NextResponse.json({ error: "Failed to export evaluation results" }, { status: 500 })
  }
}
