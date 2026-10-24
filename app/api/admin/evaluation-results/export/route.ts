import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import { departmentRepository } from "@/lib/repositories/factory"
import { getDepartmentSubjectResults, type DepartmentSubjectResult } from "@/features/evaluation-results/evaluation-results.service"
import { getFacultyCountsByDepartment } from "@/features/users/users.service"
import { createZip } from "@/lib/zip"
import type { DepartmentAggregate } from "@/lib/evaluation-utils"

// The export walks every department's ratings: it is a download, and the
// budget is the same one the import routes use.
export const maxDuration = 60

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
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })

    const departments = await departmentRepository.listAll()
    // The same headcount the results page shows, so the CSV and the page
    // cannot disagree about a department.
    const facultyCounts = await getFacultyCountsByDepartment()

    const entries: { name: string; data: Uint8Array }[] = []
    const encoder = new TextEncoder()

    // Per-department CSVs. Parallelised: each department costs ~6 sequential
    // repository round trips, so awaiting them one-by-one over every department
    // blew past the serverless budget. One failure must not lose the rest.
    //
    // The department's row-based summary figures come from the same read as
    // its CSV, so the summary does not walk the ratings a second time.
    const perDept = await Promise.allSettled(
      departments.map(async (dept) => {
        const { subjects, departmentAggregate } = await getDepartmentSubjectResults(evaluationPeriodId, dept.id)
        const code = (dept.code || dept.id).replace(/[^a-zA-Z0-9_-]/g, "_")
        return {
          departmentId: dept.id,
          name: subjects.length > 0 ? `${code}_results.csv` : null,
          data: subjects.length > 0 ? encoder.encode(subjectCsv(subjects)) : null,
          aggregate: departmentAggregate,
        }
      }),
    )

    const failures = perDept.filter((r) => r.status === "rejected")
    if (failures.length > 0) {
      const first = failures[0] as PromiseRejectedResult
      const msg = (first.reason as { message?: unknown })?.message ?? String(first.reason)
      await logServerError({
        route: "/api/admin/evaluation-results/export",
        method: request.method,
        params: Object.fromEntries(new URL(request.url).searchParams),
        error: first.reason,
      })
      return NextResponse.json({ error: `Failed to export: ${msg}` }, { status: 500 })
    }

    const settled: {
      departmentId: string
      name: string | null
      data: Uint8Array | null
      aggregate: DepartmentAggregate | null
    }[] = []
    for (const r of perDept) {
      if (r.status === "fulfilled") settled.push(r.value)
    }
    for (const r of settled) {
      if (r.name && r.data) entries.push({ name: r.name, data: r.data })
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: "No data to export" }, { status: 404 })
    }

    // Summary CSV
    const aggregateByDept = new Map(settled.map((r) => [r.departmentId, r.aggregate]))
    const summaryHeaders = ["Department", "Code", "Faculty Count", "Respondents", "Avg Rating", "Remark"]
    const summaryRows = departments.map((dept) => {
      const aggregate = aggregateByDept.get(dept.id)
      return [
        dept.name, dept.code ?? "", facultyCounts[dept.id] ?? 0, aggregate?.totalResponses ?? 0,
        aggregate?.avgRating === null || aggregate?.avgRating === undefined ? "" : aggregate.avgRating.toFixed(2),
        aggregate?.remarks ?? "",
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
    // Surface the underlying cause. A generic "Failed to export" hides the real
    // fault from the only person who can act on it (the admin reading the toast).
    const detail = typeof errShape?.message === "string" ? errShape.message : "unknown error"
    return NextResponse.json({ error: `Failed to export: ${detail}` }, { status: 500 })
  }
}
