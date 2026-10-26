import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import {
  buildConsolidatedFacultyZip,
} from "@/features/evaluation-results/consolidated-zip"
import { verdictForDepartmentZip } from "@/features/evaluation-results/department-zip"
import { getDepartmentResults } from "@/features/evaluation-results/evaluation-results.service"

// The export reads the department and then every faculty's subject-sections:
// it is a download, and the budget is the import routes' one.
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

    // ⭐ the scope: "all departments" when empty, the same rule as Part II's
    // route. The surface always sends one department.
    let departmentIds = (searchParams.get("departmentIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)

    if (departmentIds.length === 0) {
      const { departments } = await getDepartmentResults(evaluationPeriodId)
      departmentIds = departments.map((department) => department.departmentId)
    }

    if (departmentIds.length === 0) {
      return NextResponse.json(
        { error: "No departments found for this period" },
        { status: 404 },
      )
    }

    // the selected faculty — empty = the whole department
    const facultyIds = (searchParams.get("facultyIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)

    const result = await buildConsolidatedFacultyZip({
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
        "Content-Disposition": `attachment; filename="evaluation-results-consolidated-${evaluationPeriodId}.zip"`,
      },
    })
  } catch (e) {
    console.error("Consolidated faculty export error:", e)
    await logServerError({
      route: "/api/admin/evaluation-results/export/consolidated",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: `Failed to export: ${(e as Error).message}` }, { status: 500 })
  }
}
