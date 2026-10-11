import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/route-guard"
import { facultySubjectRepository, semesterRepository } from "@/lib/repositories/factory"
import { logAuditEvent } from "@/lib/services/audit"

// Applies the ACTIVE semester to every faculty_subjects row that can take it.
//
// Two protections are load-bearing:
//  1. The active semester is resolved server-side. A client-held id would let
//     any admin stamp an arbitrary semester across every mapping.
//  2. Rows colliding on UNIQUE(subject_id, section_id, "semesterId") are
//     skipped, not updated. A blanket UPDATE would raise 23505 on the first
//     duplicate pair (NULL-semester CSV row + real-semester stepper row being
//     the common case) and roll back the entire statement.
//
// Scope is faculty_subjects ONLY. student_enrollments keeps its own
// semesterId — it is a separate decision with different semantics.
export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()

  try {
    const { preview } = (await request.json().catch(() => ({}))) as { preview?: boolean }

    const activeSemesters = await semesterRepository.list({ isActive: true })
    if (activeSemesters.length !== 1) {
      return NextResponse.json(
        {
          error:
            activeSemesters.length === 0
              ? "No active semester. Activate one first."
              : "More than one semester is active. Deactivate all but one first.",
        },
        { status: 400 },
      )
    }
    const active = activeSemesters[0]

    // Embeds give subject/section labels for the report-back and audit snapshot.
    const rows = await facultySubjectRepository.listAllWithEmbeds()

    // Keys that already resolve under the active semester: any OTHER row with
    // the same (subject, section) can never join them without violating the
    // unique constraint.
    const activeKeys = new Set(
      rows.filter((r) => r.semesterId === active.id).map((r) => `${r.subject_id}|${r.section_id}`),
    )

    let alreadyActive = 0
    const safeIds: string[] = []
    const changes: { id: string; label: string; from: string | null }[] = []
    const skipped: { id: string; label: string }[] = []

    for (const r of rows) {
      if (r.semesterId === active.id) {
        alreadyActive++
        continue
      }
      const label = `${r.subject?.code ?? r.subject_id} · ${r.section?.program ?? ""}-${r.section?.name ?? r.section_id}`
      if (activeKeys.has(`${r.subject_id}|${r.section_id}`)) {
        skipped.push({ id: r.id, label })
      } else {
        safeIds.push(r.id)
        changes.push({ id: r.id, label, from: r.semesterId ?? null })
      }
    }

    const report = {
      semesterTitle: active.title,
      semesterId: active.id,
      total: rows.length,
      alreadyActive,
      updated: 0,
      skipped: skipped.length,
      skippedSample: skipped.slice(0, 25),
    }

    if (preview) {
      return NextResponse.json({
        ...report,
        willUpdate: safeIds.length,
        willSkip: skipped.length,
        changesSample: changes.slice(0, 25),
      })
    }

    if (safeIds.length === 0) {
      return NextResponse.json(report)
    }

    let updated: number
    try {
      updated = await facultySubjectRepository.updateSemesterForIds(safeIds, active.id)
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505") {
        return NextResponse.json(
          { error: "A concurrent edit created a conflicting mapping. Re-run to re-evaluate." },
          { status: 409 },
        )
      }
      throw err
    }

    // The update overwrites prior semesters with no column backup — the audit
    // entry is the only recoverable before-state. Capped to stay bounded.
    await logAuditEvent({
      userId: (session!.user as Record<string, unknown>).id as string,
      action: "APPLY_SEMESTER_FACULTY_SUBJECTS",
      details: JSON.stringify({
        toSemester: { id: active.id, title: active.title },
        updated,
        alreadyActive,
        skipped: skipped.length,
        changes: changes.slice(0, 200),
        skippedSample: skipped.slice(0, 100),
      }),
    })

    return NextResponse.json({ ...report, updated })
  } catch {
    return NextResponse.json({ error: "Failed to apply semester" }, { status: 500 })
  }
}
