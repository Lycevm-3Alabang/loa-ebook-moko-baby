import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import { departmentRepository, evaluationResultRepository } from "@/lib/repositories/factory"
import { getDepartmentSubjectResults } from "@/features/evaluation-results/evaluation-results.service"
import { createZip } from "@/lib/zip"

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function subjectCsv(subjects: Awaited<ReturnType<typeof getDepartmentSubjectResults>>): string {
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
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })

    const departments = await departmentRepository.listAll()
    const liveAvgs = await evaluationResultRepository.listLiveDeptAverages(evaluationPeriodId)
    const avgByDept = new Map(liveAvgs.map((a) => [a.departmentId, a]))

    const entries: { name: string; data: Uint8Array }[] = []
    const encoder = new TextEncoder()

    // Per-department CSVs
    let hasData = false
    for (const dept of departments) {
      const subjects = await getDepartmentSubjectResults(evaluationPeriodId, dept.id)
      if (subjects.length === 0) continue
      hasData = true
      const csv = subjectCsv(subjects)
      const code = (dept.code || dept.id).replace(/[^a-zA-Z0-9_-]/g, "_")
      entries.push({ name: `${code}_results.csv`, data: encoder.encode(csv) })
    }

    if (!hasData) {
      return NextResponse.json({ error: "No data to export" }, { status: 404 })
    }

    // Summary CSV
    const summaryHeaders = ["Department", "Code", "Faculty Count", "Respondents", "Avg Rating", "Remark"]
    const summaryRows = departments.map((dept) => {
      const avg = avgByDept.get(dept.id)
      return [
        dept.name, dept.code ?? "", avg?.facultyIds.length ?? 0, avg?.totalRespondents ?? 0,
        avg?.avgRating ?? "", avg?.remarks ?? "",
      ]
    })
    const summaryCsv = [summaryHeaders.join(","), ...summaryRows.map((r) => r.map(csvEscape).join(","))].join("\n")
    entries.push({ name: "summary.csv", data: encoder.encode(summaryCsv) })

    const zip = createZip(entries)
    return new NextResponse(zip as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="evaluation-results-${evaluationPeriodId}.zip"`,
      },
    })
  } catch (e) {
    const errShape = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    console.error("Admin evaluation results export error:", JSON.stringify({ message: errShape?.message, code: errShape?.code, details: errShape?.details, hint: errShape?.hint }))
    await logServerError({ route: "/api/admin/evaluation-results/export", method: request.method, params: Object.fromEntries(new URL(request.url).searchParams), error: e })
    return NextResponse.json({ error: "Failed to export evaluation results" }, { status: 500 })
  }
}
