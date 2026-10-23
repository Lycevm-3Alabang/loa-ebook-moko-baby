import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { logServerError } from "@/lib/services/audit"
import {
  departmentRepository,
  evaluationResultRepository,
} from "@/lib/repositories/factory"
import { EvaluationPeriodInactiveError } from "@/features/evaluation-results/evaluation-results.repository"
import {
  buildDepartmentZip,
  verdictForDepartmentZip,
} from "@/features/evaluation-results/department-zip"

// The export reads the department and then every subject-section in it: it is
// a download, and the budget is the import routes' one.
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "DEAN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const evaluationPeriodId =
      searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
    if (!evaluationPeriodId) {
      return NextResponse.json({ error: "evaluationPeriodId is required" }, { status: 400 })
    }

    const userId = (session.user as Record<string, unknown>).id as string
    const dept = await departmentRepository.findByDeanId(userId)
    if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 })

    // ⭐ the scope is the dean's OWN department — a foreign id is REFUSED, not
    // ignored: an ignored id would quietly shrink the download, and the
    // export must never become a way around a read route's 403.
    const asked = (searchParams.get("departmentIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
    if (asked.some((id) => id !== dept.id)) {
      return NextResponse.json(
        { error: `You manage ${dept.name} — tried to open ${asked.join(", ")}` },
        { status: 403 },
      )
    }

    // the dean's results are the active semester's — the same guard the
    // subject-grain export carries
    await evaluationResultRepository.assertPeriodIsActive(evaluationPeriodId)

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
      departmentIds: [dept.id],
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
    if (e instanceof EvaluationPeriodInactiveError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("Dean department evaluation export error:", e)
    await logServerError({
      route: "/api/dean/evaluation-results/export/excel",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      email: (session?.user as unknown as { email?: string | null } | undefined)?.email ?? null,
      role: (session?.user as unknown as { role?: string | null } | undefined)?.role ?? null,
      error: e,
    })
    return NextResponse.json({ error: `Failed to export: ${(e as Error).message}` }, { status: 500 })
  }
}
