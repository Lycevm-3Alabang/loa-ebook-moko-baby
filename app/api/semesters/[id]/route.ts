import { NextResponse } from "next/server"
import { getSemester, updateSemester, deleteSemester, activateSemester } from "@/features/admin-data/semesters.service"
import { auth } from "@/lib/auth"
import { hasRole } from "@/lib/utils/roles"
import { logAuditEvent, logServerError } from "@/lib/services/audit"

async function requireAuth() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized: No active session found." }, { status: 401 })
  }
  return null
}

async function getSessionOrDeny() {
  const session = await auth()
  const role = (session?.user as Record<string, unknown>)?.role as string
  if (!role || !hasRole(role, "ADMIN")) {
    return { session: null, error: NextResponse.json({ error: "Forbidden: Administrator role required for this action." }, { status: 403 }) }
  }
  return { session, error: null }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  const authErr = await requireAuth()
  if (authErr) return authErr
  
  try {
    const semester = await getSemester(id)
    if (!semester) {
      return NextResponse.json({ error: `Semester with ID ${id} not found.` }, { status: 404 })
    }
    return NextResponse.json({ data: semester }, { status: 200 })
  } catch (error) {
    console.error("Error fetching semester details", error)
    await logServerError({
      route: "/api/semesters/[id]",
      method: _request.method,
      params: Object.fromEntries(new URL(_request.url).searchParams),
      error,
    })
    return NextResponse.json({ error: "Failed to retrieve semester details." }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  const { session, error: forbidden } = await getSessionOrDeny()
  if (forbidden) return forbidden

  try {
    const body = await request.json()
    const { title, isActive, evalStartDate, evalEndDate } = body
    
    const updates: Record<string, unknown> = {}
    if (title !== undefined) updates.title = title
    if (isActive !== undefined) updates.isActive = isActive
    if (evalStartDate !== undefined) updates.evalStartDate = evalStartDate
    if (evalEndDate !== undefined) updates.evalEndDate = evalEndDate

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 })
    }

    const updatedSemester = await updateSemester(id, updates)

    const currentUserId = (session!.user as Record<string, unknown>).id as string
    await logAuditEvent({
      userId: currentUserId,
      action: "UPDATE_SEMESTER",
      details: `Updated semester ${id}: ${Object.keys(updates).join(", ")}`,
    })

    return NextResponse.json({ data: updatedSemester }, { status: 200 })
  } catch (error) {
    console.error("Error updating semester", error)
    await logServerError({
      route: "/api/semesters/[id]",
      method: request.method,
      params: Object.fromEntries(new URL(request.url).searchParams),
      error,
    })
    return NextResponse.json({ error: (error as Error).message || "Failed to update semester." }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  const { session, error: forbidden } = await getSessionOrDeny()
  if (forbidden) return forbidden

  try {
    const semester = await getSemester(id)
    await deleteSemester(id)

    const currentUserId = (session!.user as Record<string, unknown>).id as string
    await logAuditEvent({
      userId: currentUserId,
      action: "DELETE_SEMESTER",
      details: semester ? `Deleted semester: ${semester.title}` : `Deleted semester ${id}`,
    })

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error("Error deleting semester", error)
    await logServerError({
      route: "/api/semesters/[id]",
      method: _request.method,
      params: Object.fromEntries(new URL(_request.url).searchParams),
      error,
    })
    return NextResponse.json({ error: (error as Error).message || "Failed to delete semester." }, { status: 500 })
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  const { session, error: forbidden } = await getSessionOrDeny()
  if (forbidden) return forbidden
  
  try {
    const activatedSemester = await activateSemester(id)

    const currentUserId = (session!.user as Record<string, unknown>).id as string
    await logAuditEvent({
      userId: currentUserId,
      action: "ACTIVATE_SEMESTER",
      details: `Activated semester ${id}`,
    })

    return NextResponse.json({ data: activatedSemester }, { status: 200 })
  } catch (error) {
    console.error("Error activating semester", error)
    await logServerError({
      route: "/api/semesters/[id]",
      method: _request.method,
      params: Object.fromEntries(new URL(_request.url).searchParams),
      error,
    })
    return NextResponse.json({ error: (error as Error).message || "Failed to activate semester." }, { status: 500 })
  }
}
