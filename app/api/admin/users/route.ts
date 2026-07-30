import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/route-guard'
import { userRepository, departmentRepository } from '@/lib/repositories/factory'
import { bulkPreviewUsers, bulkUpsertUsers } from '@/features/users/users.service'
import { logAuditEvent } from '@/lib/services/audit'

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message)
  }
  return "Unknown error"
}

export async function GET(
  _request: NextRequest
) {
  const users = await userRepository.listAll()
  const departments = await departmentRepository.listAll()

  return NextResponse.json({ users, departments })
}

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()
  const currentUserId = (session?.user as Record<string, unknown>)?.id as string | undefined

  try {
    const body = await request.json()

    if (body.preview === true && Array.isArray(body.users)) {
      const result = await bulkPreviewUsers(body.users)
      return NextResponse.json(result)
    }

    if (Array.isArray(body.users)) {
      const result = await bulkUpsertUsers(body.users)
      await logAuditEvent({
        userId: currentUserId,
        action: "BULK_IMPORT_USERS",
        details: `Imported ${result.created} created, ${result.updated} updated, ${result.failed} failed (${body.users.length} total rows)`,
      })
      return NextResponse.json(result)
    }

    const { name, email, role, departmentId } = body
    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }
    if (!role) {
      return NextResponse.json({ error: "At least one role is required" }, { status: 400 })
    }

    const user = await userRepository.create({ name, email, role, departmentId })
    await logAuditEvent({
      userId: currentUserId,
      action: "CREATE_USER",
      details: `Created user ${email} with role ${role}`,
    })
    return NextResponse.json({ user }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/admin/users]", err)
    return NextResponse.json({ error: extractErrorMessage(err) }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()
  const currentUserId = (session?.user as Record<string, unknown>)?.id as string | undefined

  try {
    const body = await request.json()
    const { userId, ...fields } = body
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    const user = await userRepository.update(userId, fields)
    const updatedFields = Object.keys(fields).join(", ")
    await logAuditEvent({
      userId: currentUserId,
      action: "UPDATE_USER",
      details: `Updated user ${userId} [${updatedFields}]`,
    })
    return NextResponse.json({ user })
  } catch (err) {
    console.error("[PATCH /api/admin/users]", err)
    return NextResponse.json({ error: extractErrorMessage(err) }, { status: 400 })
  }
}
