import { appointmentRepository, userRepository } from "@/lib/repositories/factory"
import { sendAppointmentCreatedWorkflow, sendConsultationInviteWorkflow } from "@/lib/workflows/email-workflows"
import { getAppointmentUrl } from "@/lib/utils/appointment-url"
import {
  resolveTimeSlots,
  validateTimeSlots,
  resolveCreator,
  assertUsersAssignable,
  resolveMeetingType,
  checkForConflicts,
  collectAttendeeIds,
  validateConsultationRules,
  validateAttendees,
  prepareCreateData,
  createAppointmentWithSlotsAndAttendees,
  acceptAppointment as serviceAcceptAppointment,
  completeAppointment as serviceCompleteAppointment,
  cancelAppointment as serviceCancelAppointment,
  studentResendInvitation as serviceStudentResendInvitation,
} from "./appointments.service"
import type { ApptWithJoins } from "./appointments.service"
import {
  notifyAppointmentAccepted,
  notifyAppointmentCompleted,
  notifyAppointmentCancelled,
} from "./appointments.notifications"

type DbRecord = Record<string, unknown>

export async function requestAppointment(input: {
  createdByUserId: string
  studentId: string | null
  facultyId: string
  sessionGroupId?: string
  date?: string
  startTime?: string
  endTime?: string
  timeSlots?: { date: string; startTime: string; endTime: string }[]
  title?: string
  description?: string
  attendeeIds?: string[]
  attendeeOptions?: { userId: string; isMandatory: boolean }[]
  teamsLink?: string
  slotLinks?: Record<string, string>
  meetingType?: "CONSULTATION"
}) {
  const timeSlots = resolveTimeSlots(input)
  validateTimeSlots(timeSlots)

  const creator = await resolveCreator(input.createdByUserId)
  const meetingType = resolveMeetingType(creator.role, input.meetingType)

  const allAttendeeIds = collectAttendeeIds(input.studentId, input.facultyId, input.attendeeIds, input.attendeeOptions)
  await assertUsersAssignable([input.createdByUserId, ...allAttendeeIds])
  await checkForConflicts(
    creator.role,
    input.createdByUserId,
    input.facultyId,
    timeSlots,
    input.sessionGroupId,
    allAttendeeIds,
  )

  const resolvedStudentId = validateConsultationRules(creator.role, creator.id, meetingType, input.studentId)
  validateAttendees(creator.role, input.attendeeOptions)

  const firstSlot = timeSlots[0]
  const createData = prepareCreateData(creator, input, meetingType, firstSlot, resolvedStudentId)

  const appointment = await createAppointmentWithSlotsAndAttendees(
    createData,
    timeSlots,
    input.slotLinks,
    input.attendeeOptions,
    input.attendeeIds,
    input.facultyId,
  )

  const fullAppointment = await appointmentRepository.findById(appointment.id)
  if (fullAppointment) {
    sendAppointmentCreatedWorkflow(
      fullAppointment as unknown as Record<string, unknown>,
      input.createdByUserId,
    ).catch((err) => {
      console.error("Failed to send appointment creation email:", err)
    })
  }

  return { appointment: fullAppointment, conflicts: [] }
}

export async function acceptAppointment(id: string, facultyId: string) {
  const result = await serviceAcceptAppointment(id, facultyId)
  await notifyAppointmentAccepted(result as unknown as ApptWithJoins)
  return result
}

export const approveAppointment = acceptAppointment

export async function completeAppointment(id: string, facultyId: string, actionTaken?: string) {
  const result = await serviceCompleteAppointment(id, facultyId, actionTaken)
  await notifyAppointmentCompleted(result as unknown as ApptWithJoins, actionTaken)
  return result
}

export async function cancelAppointment(id: string, userId: string, userEmail?: string) {
  const result = await serviceCancelAppointment(id, userId, userEmail)
  const [actor] = await Promise.all([userRepository.findById(userId)])
  const appt = result as unknown as ApptWithJoins
  const isFaculty = appt.facultyId === userId
  const actorName = actor?.name || (isFaculty ? "Faculty" : "Creator")
  await notifyAppointmentCancelled(appt, actorName)
  return result
}

export async function studentResendInvitation(id: string, userId: string) {
  const updated = await serviceStudentResendInvitation(id, userId)

  const [faculty, student] = await Promise.all([
    userRepository.findById((updated as unknown as Record<string, unknown>).facultyId as string),
    userRepository.findById(userId),
  ])

  if (faculty && student) {
    const viewUrl = getAppointmentUrl(id, "faculty")
    const ud = updated as unknown as Record<string, unknown>
    sendConsultationInviteWorkflow(
      { email: faculty.email, name: faculty.name },
      {
        studentName: student.name,
        studentEmail: student.email,
        facultyName: faculty.name,
        facultyEmail: faculty.email,
        date: ud.date as string,
        startTime: ud.startTime as string,
        endTime: ud.endTime as string,
        title: ud.title as string,
        description: ud.description as string | null,
        viewUrl,
      },
    ).catch((err) => {
      console.error("Failed to resend invitation email:", err)
    })
  }

  return updated
}

export async function getAppointmentDetail(id: string) {
  const appointment = await appointmentRepository.findById(id) as unknown as ApptWithJoins | null
  if (!appointment) throw new Error("Appointment not found")

  let timeSlots: DbRecord[] = appointment.timeSlots || []
  if (timeSlots.length === 0) {
    try {
      timeSlots = await appointmentRepository.listTimeSlots(id) as unknown as DbRecord[]
    } catch { /* table may not exist */ }
  }

  let files: DbRecord[] = []
  try {
    files = await appointmentRepository.listFiles(id) as unknown as DbRecord[]
  } catch { /* table may not exist */ }

  let organizer: { id: string; name: string; email: string; role?: string } | null = null

  if (appointment.createdByEmail === (appointment.student as DbRecord)?.email as string) {
    const stu = appointment.student as DbRecord
    organizer = { id: stu.id as string, name: stu.name as string, email: stu.email as string, role: stu.role as string }
  } else if (appointment.createdByEmail === (appointment.faculty as DbRecord)?.email as string) {
    const fac = appointment.faculty as DbRecord
    organizer = { id: fac.id as string, name: fac.name as string, email: fac.email as string, role: fac.role as string }
  } else {
    const matched = (appointment.attendees || []).find((a: DbRecord) => (a.user as DbRecord)?.email === appointment.createdByEmail)
    if (matched?.user) {
      const u = matched.user as DbRecord
      organizer = { id: u.id as string, name: u.name as string, email: u.email as string, role: u.role as string }
    }
  }

  if (!organizer) {
    const stu = appointment.student as DbRecord
    organizer = stu
      ? { id: stu.id as string, name: stu.name as string, email: stu.email as string, role: stu.role as string }
      : { id: "", name: "Unknown", email: appointment.createdByEmail }
  }

  const filtered = (appointment.attendees || []).filter((a: DbRecord) => {
    if (!a.user) return false
    if ((a.user as DbRecord).id === (appointment.faculty as DbRecord)?.id) return false
    if ((a.user as DbRecord).id === organizer!.id) return false
    return true
  })

  const mappedAttendees = filtered.map((a: DbRecord) => ({
    id: a.id as string,
    userId: a.userId as string,
    status: ((a.status as string) === "INVITED" ? "PENDING" : a.status as string) as "PENDING" | "ACCEPTED" | "DECLINED",
    isMandatory: a.isMandatory as boolean,
    user: {
      id: (a.user as DbRecord).id as string,
      name: (a.user as DbRecord).name as string,
      email: (a.user as DbRecord).email as string,
      role: (a.user as DbRecord).role as string,
    },
  }))

  const mapUser = (u: unknown) =>
    u
      ? {
          id: (u as DbRecord).id as string,
          name: (u as DbRecord).name as string,
          email: (u as DbRecord).email as string,
          role: (u as DbRecord).role as string,
        }
      : null

  return {
    id: appointment.id,
    status: appointment.status,
    meetingType: appointment.meetingType,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    title: appointment.title,
    description: appointment.description,
    teamsLink: appointment.teamsLink,
    teamsSyncStatus: appointment.teamsSyncStatus,
    teamsSyncRetries: appointment.teamsSyncRetries,
    teamsSyncError: appointment.teamsSyncError,
    actionTaken: appointment.actionTaken || null,
    teamsSyncLastAttempt: appointment.teamsSyncLastAttempt,
    requestedAt: appointment.requestedAt,
    updatedAt: appointment.updatedAt,
    organizer,
    student: mapUser(appointment.student),
    faculty: mapUser(appointment.faculty),
    attendees: mappedAttendees,
    timeSlots: timeSlots.map((s: DbRecord) => ({
      id: s.id as string,
      date: s.date as string,
      startTime: s.startTime as string,
      endTime: s.endTime as string,
      teamsLink: (s.teamsLink as string) || null,
    })),
    files: files.map((f: DbRecord) => ({
      id: f.id,
      fileName: f.fileName,
      fileType: f.fileType,
      fileData: f.fileData,
      fileSize: f.fileSize,
      createdAt: typeof f.createdAt === "string" ? f.createdAt : (f.createdAt as Date).toISOString(),
    })),
  }
}

export async function getMeetingsForUser(userId: string, pagination?: { page?: number; limit?: number }) {
  const [organized, invited] = await Promise.all([
    appointmentRepository.listByFaculty(userId, pagination),
    appointmentRepository.listByParticipant(userId, pagination),
  ])

  const organizedData = organized.data
  const invitedData = invited.data

  const merged = [...organizedData, ...invitedData]
  const seen = new Set<string>()
  const unique = merged.filter((apt: unknown) => {
    const a = apt as { id?: string }
    if (seen.has(a.id!)) return false
    seen.add(a.id!)
    return true
  })

  return (unique as unknown as DbRecord[]).map((appointment: DbRecord) => {
    const participants = ((appointment.attendees as DbRecord[]) || []).map((att: DbRecord) => ({
      id: att.id as string,
      meetingId: appointment.id as string,
      userId: att.userId as string,
      status: (att.status === "ACCEPTED" ? "ACCEPTED" : att.status === "DECLINED" ? "DECLINED" : "PENDING") as "ACCEPTED" | "DECLINED" | "PENDING",
      user: att.user as DbRecord,
    }))

    const stu = appointment.student as DbRecord | undefined
    const fac = appointment.faculty as DbRecord | undefined
    const organizer = stu?.email === appointment.createdByEmail
      ? stu
      : fac?.email === appointment.createdByEmail
        ? fac
        : stu || fac || null

    return {
      id: appointment.id as string,
      title: appointment.title as string,
      description: appointment.description as string,
      date: appointment.date as string,
      startTime: appointment.startTime as string,
      endTime: appointment.endTime as string,
      meetingType: (appointment.meetingType as string) || "MEETING",
      organizerId: (organizer?.id as string) || (appointment.facultyId as string) || (appointment.studentId as string),
      teamsEventId: null,
      teamsLink: appointment.teamsLink as string,
      status: appointment.status as string,
      createdAt: new Date(appointment.requestedAt as string),
      organizer,
      participants,
    }
  })
}
