import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/route-guard"
import { exportAndSoftDeleteByRoles } from "@/features/admin-data/admin-data.service"
import { logAuditEvent } from "@/lib/services/audit"

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()
  const currentUserId = (session!.user as Record<string, unknown>).id as string

  try {
    const body = await request.json().catch(() => ({}))
    const roles = (body as { roles?: string[] }).roles
    if (!Array.isArray(roles) || roles.length === 0) {
      return NextResponse.json({ error: "roles is required (any of STUDENT, DEAN, FACULTY)" }, { status: 400 })
    }

    const data = await exportAndSoftDeleteByRoles(roles)

    await logAuditEvent({
      userId: currentUserId,
      action: "SOFT_DELETE_USERS",
      details: `Exported and soft-deleted ${data.userIds.length} users for roles ${data.roles.join(", ")}`,
    })

    const json = JSON.stringify(data, null, 2)

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="users-soft-delete-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const status = message.includes("Select at least one role") || message.includes("Cannot soft-delete role") ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
