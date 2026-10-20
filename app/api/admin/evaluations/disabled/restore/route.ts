import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import { evaluationRepository } from "@/lib/repositories/factory"
import { logAuditEvent, logServerError } from "@/lib/services/audit"

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  try {
    const body = await request.json()
    const { ids } = body as { ids: string[] }
    if (!ids || !Array.isArray(ids) || ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 })

    // Lookup first: a lookup failure 500s with nothing mutated.
    await Promise.all(ids.map((id) => evaluationRepository.findById(id)))
    await evaluationRepository.restoreByIds(ids)

    await logAuditEvent({ action: "restore_evaluations", details: JSON.stringify({ ids }) }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Restore evaluations error:", e)
    await logServerError({
      route: "/api/admin/evaluations/disabled/restore",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error: e,
    })
    return NextResponse.json({ error: "Failed to restore evaluations" }, { status: 500 })
  }
}
