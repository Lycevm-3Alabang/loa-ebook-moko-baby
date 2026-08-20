import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listAvailabilityRules, upsertAvailabilityRule } from "@/features/appointments/availability.service"
import { hasRole } from "@/lib/utils/roles"
import { logAuditEvent } from "@/lib/services/audit"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = (session.user as Record<string, unknown>).role as string
  const userId = (session.user as Record<string, unknown>).id as string
  const searchParams = request.nextUrl.searchParams
  const queryFacultyId = searchParams.get("facultyId")

  let targetFacultyId = queryFacultyId

  if (!targetFacultyId) {
    if (!hasRole(role, "FACULTY") && !hasRole(role, "DEAN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    targetFacultyId = userId
  }

  if (targetFacultyId !== userId && !hasRole(role, "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!targetFacultyId) {
    return NextResponse.json({ error: "Faculty ID is required" }, { status: 400 })
  }

  const rules = await listAvailabilityRules(targetFacultyId)
  return NextResponse.json({ rules })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  const role = (session?.user as Record<string, unknown>)?.role as string
  if (!role || (!hasRole(role, "FACULTY") && !hasRole(role, "DEAN") && !hasRole(role, "ADMIN"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = (session!.user as Record<string, unknown>).id as string
  const body = await request.json();

  const { dayOfWeek, isBlocked, startTime, endTime, startDate, endDate, facultyId: bodyFacultyId } = body

  const isAdmin = hasRole(role, "ADMIN")
  const facultyId = (isAdmin && bodyFacultyId) ? bodyFacultyId : userId

  if (typeof dayOfWeek !== "number" || dayOfWeek < 0 || dayOfWeek > 6) {
    return NextResponse.json({ error: "Invalid dayOfWeek (0-6)" }, { status: 400 })
  }

  if (typeof startDate !== "string" || !startDate) {
    return NextResponse.json({ error: "startDate is required (YYYY-MM-DD)" }, { status: 400 })
  }

  const rule = await upsertAvailabilityRule({
    facultyId,
    dayOfWeek,
    isBlocked: !!isBlocked,
    startTime: startTime ?? null,
    endTime: endTime ?? null,
    startDate,
    endDate: endDate ?? null,
  })

  if (isAdmin && bodyFacultyId && bodyFacultyId !== userId) {
    await logAuditEvent({
      userId,
      action: "UPDATE_AVAILABILITY_RULE",
      details: `Admin updated availability rule for faculty ${bodyFacultyId}: day ${dayOfWeek}, blocked=${isBlocked}`,
    })
  }

  return NextResponse.json({ rule })
}
