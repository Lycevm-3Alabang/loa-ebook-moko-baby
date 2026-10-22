import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { logServerError } from "@/lib/services/audit"
import {
  buildDepartmentZip,
  verdictForDepartmentZip,
} from "@/features/evaluation-results/department-zip"

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

    // ⭐ the scope is REQUIRED — "all departments" is not one download (D27:
    // GENED ⇒ 8.2 MB against the platform's ≈4.5 MB ceiling). The scope
    // picker offers one department or a few (the surface's slice).
    const departmentIds = (searchParams.get("departmentIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
    if (departmentIds.length === 0) {
      return NextResponse.json(
        { error: "departmentIds is required — pick one or more departments" },
        { status: 400 },
      )
    }

    // the per-faculty export (D27) — one member of the scope
    const facultyId = searchParams.get("facultyId") || undefined

    const result = await buildDepartmentZip({ evaluationPeriodId, departmentIds, facultyId })
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
