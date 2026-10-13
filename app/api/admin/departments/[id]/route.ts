import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { departmentRepository, userRepository } from "@/lib/repositories/factory"
import { hasRole } from "@/lib/utils/roles"
import { requireAdmin } from "@/lib/route-guard"
import { logAuditEvent } from "@/lib/services/audit"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()

  const { id } = await params

  try {
    const body = await request.json()
    const { name, code, deanId, isDisabled } = body

    const existing = await departmentRepository.findById(id)
    if (!existing) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    const auditActions: string[] = []

    if (name !== undefined) {
      updateData.name = name
      auditActions.push(`name to "${name}"`)
    }
    if (code !== undefined) {
      updateData.code = code.toUpperCase()
      auditActions.push(`code to "${code.toUpperCase()}"`)
    }
    if (deanId !== undefined) {
      if (deanId) {
        const dean = await userRepository.findById(deanId)
        if (!dean) {
          return NextResponse.json({ error: "Assigned dean not found" }, { status: 404 })
        }
        if (!hasRole(dean.role, "DEAN")) {
          return NextResponse.json({ error: "Assigned user is not a dean" }, { status: 400 })
        }
        if (dean.departmentId !== id) {
          let actual = "no department"
          if (dean.departmentId) {
            const home = await departmentRepository.findById(dean.departmentId)
            actual = home ? `${home.name} (${home.code})` : "another department"
          }
          return NextResponse.json(
            { error: `Assigned dean belongs to ${actual} and cannot head this department` },
            { status: 400 },
          )
        }
      }
      updateData.deanId = deanId || null
      auditActions.push(deanId ? `dean to user ID ${deanId}` : "removed dean")
    }
    if (isDisabled !== undefined) {
      updateData.isDisabled = !!isDisabled
      auditActions.push(isDisabled ? "disabled department" : "enabled department")
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No changes provided" }, { status: 400 })
    }

    const updated = await departmentRepository.update(id, updateData)

    const currentUserId = (session!.user as Record<string, unknown>).id as string
    await logAuditEvent({
      userId: currentUserId,
      action: "UPDATE_DEPARTMENT",
      details: `Updated department ${existing.code}: ${auditActions.join("; ")}`,
    })

    return NextResponse.json(updated)
  } catch (err: unknown) {
    const pgErr = err as Record<string, unknown>
    if (pgErr.code === "23505") {
      return NextResponse.json({ error: "Department code already exists" }, { status: 409 })
    }
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
