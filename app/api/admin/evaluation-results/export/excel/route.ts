import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import {
  buildDepartmentZip,
  verdictForDepartmentZip,
} from "@/features/evaluation-results/department-zip"
import { getDepartmentResults } from "@/features/evaluation-results/evaluation-results.service"

// The export reads the department and then every subject-section in it: it is
// a download, and the budget is the import routes' one.
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId =
      searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) {
      return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })
    }

    // ⭐ the scope: "all departments" when empty (D27: GENED ⇒ 8.2 MB against
    // the platform's ≈4.5 MB ceiling, so "all" will likely trip the guard
    // and return a helpful 400).
    let departmentIds = (searchParams.get("departmentIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)

    if (departmentIds.length === 0) {
      const { departments } = await getDepartmentResults(evaluationPeriodId)
      departmentIds = departments.map((d) => d.departmentId)
    }

    if (departmentIds.length === 0) {
      return NextResponse.json(
        { error: "No departments found for this period" },
        { status: 404 },
      )
    }

    // the selected faculty (D39) — empty = the whole department
    const facultyIds = (searchParams.get("facultyIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
    // ⭐ deleted in E3: the per-card bridge that auto-pushed facultyId into facultyIds.
    // Removed: const legacyFacultyId = searchParams.get("facultyId")
    // Removed: if (facultyIds.length === 0 && legacyFacultyId) facultyIds.push(legacyFacultyId)

    const result = await buildDepartmentZip({
      evaluationPeriodId,
      departmentIds,
      facultyIds: facultyIds.length > 0 ? facultyIds : undefined,
    })
    const verdict = verdictForDepartmentZip(result)
    if (verdict.kind === "refusal") {
      return NextResponse.json({ error: verdict.error }, { status: verdict.status })
    }

    return new NextResponse(verdict.bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="evaluation-results-${evaluationPeriodId}.zip"`,
      },
    })
  } catch (e) {
    console.error("Department evaluation export error:", e)
    await logServerError({
      route: "/api/admin/evaluation-results/export/excel",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: `Failed to export: ${(e as Error).message}` }, { status: 500 })
  }
}
