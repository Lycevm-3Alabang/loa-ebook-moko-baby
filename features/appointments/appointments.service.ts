import { appointmentRepository, userRepository } from "@/lib/repositories/factory"
import { MIN_TIMESLOT_DURATION_MINUTES, MAX_TIMESLOT_DURATION_MINUTES } from "@/lib/constants"
import { hasRole } from "@/lib/utils/roles"
import { isValidTeamsLink } from "@/lib/utils/teams-link"
import type { AppointmentData, PaginationParams, PagedResult } from "@/lib/types"

type DbRecord = Record<string, unknown>

export interface TimeSlot {
  date: string
  startTime: string
  endTime: string
}

interface CreateData {
  studentId: string | null
  facultyId: string
  createdByEmail: string
  meetingType?: "CONSULTATION"
  sessionGroupId: string | null
  date: string
  startTime: string
  endTime: string
  title: string | null
  description: string | null
  teamsLink?: string
  status?: string
}

// ─── Pure helpers ───────────────────────────────

export function getMinutesDifference(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number)
  const [eh, em] = endTime.split(":").map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

export function isValidTime(time: string): boolean {
  if (!time) return false
  const [, mins] = time.split(":").map(Number)
  return [0, 15, 30, 45].includes(mins)
}

// ─── Validation helpers ─────────────────────────

export function resolveTimeSlots(input: {
  date?: string
  startTime?: string
  endTime?: string
  timeSlots?: TimeSlot[]
}): TimeSlot[] {
  const timeSlots = input.timeSlots || (
    input.date && input.startTime && input.endTime
      ? [{ date: input.date, startTime: input.startTime, endTime: input.endTime }]
      : []
  )
  if (!timeSlots || timeSlots.length === 0) {
    throw new Error("At least one timeslot (date, startTime, endTime) is required")
  }
  return timeSlots
}

export function validateTimeSlots(timeSlots: TimeSlot[]): void {
  for (const slot of timeSlots) {
    if (!isValidTime(slot.startTime) || !isValidTime(slot.endTime)) {
      throw new Error("Time must be on a 15-minute boundary")
    }
    const duration = getMinutesDifference(slot.startTime, slot.endTime)
    if (duration < MIN_TIMESLOT_DURATION_MINUTES || duration > MAX_TIMESLOT_DURATION_MINUTES) {
      throw new Error("Invalid duration")
    }
  }

  for (let i = 0; i < timeSlots.length; i++) {
    for (let j = i + 1; j < timeSlots.length; j++) {
      if (
        timeSlots[i].date === timeSlots[j].date &&
        timeSlots[i].startTime < timeSlots[j].endTime &&
        timeSlots[i].endTime > timeSlots[j].startTime
      ) {
        throw new Error("Timeslots cannot overlap within the same appointment")
      }
    }
  }
}

export async function resolveCreator(creatorId: string) {
  const creator = await userRepository.findById(creatorId)
  if (!creator) throw new Error("Creator not found")
  return creator
}

export async function assertUsersAssignable(userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (unique.length === 0) return
  const users = await Promise.all(unique.map((id) => userRepository.findById(id)))
  const blocked = users.find((u) => u && (u.isDisabled || u.deletedAt))
  if (blocked) {
    throw new Error(`User ${blocked.name} (${blocked.email}) is disabled or deleted and cannot be assigned to appointments`)
  }
}

export function resolveMeetingType(creatorRole: string, inputMeetingType?: "CONSULTATION"): "CONSULTATION" {
  if (hasRole(creatorRole, "STUDENT")) return "CONSULTATION"
  return inputMeetingType || "CONSULTATION"
}

export async function checkForConflicts(
  creatorRole: string,
  createdByUserId: string,
  facultyId: string,
  timeSlots: TimeSlot[],
  sessionGroupId: string | undefined,
  allAttendeeIds: string[],
): Promise<void> {
  const mapConflicts = (slots: DbRecord[]) =>
    slots.map((s) => ({
      appointmentId: ((s.appointment as DbRecord)?.id as string) || (s.appointmentId as string) || "",
      title: ((s.appointment as DbRecord)?.title as string) || null,
      meetingType: ((s.appointment as DbRecord)?.meetingType as string) || "MEETING",
      date: s.date as string,
      startTime: s.startTime as string,
      endTime: s.endTime as string,
    }))

  // Students cannot invite other students
  if (hasRole(creatorRole, "STUDENT")) {
    const otherIds = allAttendeeIds.filter((uid) => uid !== createdByUserId)
    if (otherIds.length > 0) {
      const users = await Promise.all(otherIds.map((uid) => userRepository.findById(uid)))
      const studentAttendee = users.find((user) => user && hasRole(user.role, "STUDENT"))
      if (studentAttendee) {
        throw new Error("Students cannot invite other students to appointments")
      }
    }
  }

  if (hasRole(creatorRole, "STUDENT")) {
    const [studentConflicts, facultyConflicts] = await Promise.all([
      Promise.all(
        timeSlots.map((slot) =>
          appointmentRepository.listStudentConflictingSlots(
            createdByUserId,
            slot.date,
            slot.startTime,
            slot.endTime,
            sessionGroupId,
          )
        )
      ),
      Promise.all(
        timeSlots.map((slot) =>
          appointmentRepository.listConflictingSlots(
            [facultyId],
            slot.date,
            slot.startTime,
            slot.endTime,
          )
        )
      ),
    ])

    const allStudentConflicts = studentConflicts.flat()
    if (allStudentConflicts.length > 0) {
      const err = Object.assign(
        new Error("You already have an appointment that overlaps with this time"),
        {
          conflicts: [{
            userId: createdByUserId,
            userName: "You",
            message: "You already have an appointment that overlaps with this time",
            appointments: mapConflicts(allStudentConflicts as unknown as DbRecord[]),
          }],
        },
      )
      throw err
    }

    const allFacultySlots = facultyConflicts.flat() as unknown as DbRecord[]
    const actualFacultyConflicts = allFacultySlots.filter((s) => {
      const apt = s.appointment as DbRecord | undefined
      return apt && apt.sessionGroupId !== sessionGroupId && apt.status === "APPROVED"
    })
    if (actualFacultyConflicts.length > 0) {
      const faculty = await userRepository.findById(facultyId)
      const err = Object.assign(
        new Error(`${faculty?.name || "Faculty"} is already booked at this time`),
        {
          conflicts: [{
            userId: facultyId,
            userName: faculty?.name || "Faculty",
            message: `${faculty?.name || "Faculty"} is already booked at this time`,
            appointments: mapConflicts(actualFacultyConflicts),
          }],
        },
      )
      throw err
    }
  } else if (hasRole(creatorRole, "FACULTY") || hasRole(creatorRole, "DEAN")) {
    const conflictResults = await Promise.all(
      timeSlots.map((slot) =>
        appointmentRepository.listConflictingSlots(
          [createdByUserId],
          slot.date,
          slot.startTime,
          slot.endTime,
        )
      )
    )

    const allSlots = conflictResults.flat() as unknown as DbRecord[]
    const actualConflicts = allSlots.filter((s) => {
      const apt = s.appointment as DbRecord | undefined
      return apt && apt.sessionGroupId !== sessionGroupId && apt.status === "APPROVED"
    })
    if (actualConflicts.length > 0) {
      const faculty = await userRepository.findById(facultyId)
      const err = Object.assign(
        new Error(`${faculty?.name || "Faculty"} is already booked at this time`),
        {
          conflicts: [{
            userId: facultyId,
            userName: faculty?.name || "Faculty",
            message: `${faculty?.name || "Faculty"} is already booked at this time`,
            appointments: mapConflicts(actualConflicts),
          }],
        },
      )
      throw err
    }
  }
}

export function validateConsultationRules(
  creatorRole: string,
  creatorId: string,
  meetingType: string | undefined,
  inputStudentId: string | null,
): string | null {
  if (meetingType === "CONSULTATION") {
    if (!hasRole(creatorRole, "STUDENT")) {
      throw new Error("Consultations can only be created by students")
    }
    if (inputStudentId && inputStudentId !== creatorId) {
      throw new Error("Consultation studentId must match the creator")
    }
    return inputStudentId || creatorId
  }
  return inputStudentId
}

export function validateAttendees(
  creatorRole: string,
  attendeeOptions?: { userId: string; isMandatory: boolean }[],
): void {
  if (!hasRole(creatorRole, "STUDENT") && (!attendeeOptions || attendeeOptions.length === 0)) {
    throw new Error("Meetings must have at least one attendee")
  }
}

export function collectAttendeeIds(
  studentId: string | null,
  facultyId: string,
  attendeeIds?: string[],
  attendeeOptions?: { userId: string; isMandatory: boolean }[],
): string[] {
  return [...new Set([
    studentId,
    facultyId,
    ...(attendeeIds || []),
    ...(attendeeOptions?.map(a => a.userId) || []),
  ])].filter(Boolean) as string[]
}

// ─── DB operations ──────────────────────────────

export function prepareCreateData(
  creator: { id: string; email?: string | null; role: string },
  input: {
    studentId: string | null
    facultyId: string
    meetingType?: "CONSULTATION"
    sessionGroupId?: string
    title?: string
    description?: string
    teamsLink?: string
  },
  meetingType: "CONSULTATION",
  firstSlot: TimeSlot,
  resolvedStudentId: string | null,
): CreateData {
  const createData: CreateData = {
    studentId: resolvedStudentId,
    facultyId: input.facultyId,
    createdByEmail: creator.email ?? resolvedStudentId ?? "unknown@system.com",
    meetingType,
    sessionGroupId: input.sessionGroupId ?? null,
    date: firstSlot.date,
    startTime: firstSlot.startTime,
    endTime: firstSlot.endTime,
    title: input.title ?? null,
    description: input.description ?? null,
  }
  if (input.teamsLink) {
    if (!isValidTeamsLink(input.teamsLink)) {
      throw new Error("Please enter a valid Microsoft Teams meeting URL (https://teams.microsoft.com/...)")
    }
    createData.teamsLink = input.teamsLink.trim()
  }
  if (!hasRole(creator.role, "STUDENT")) {
    createData.status = "APPROVED"
  }
  return createData
}

export async function createAppointmentWithSlotsAndAttendees(
  createData: CreateData,
  timeSlots: TimeSlot[],
  slotLinks: Record<string, string> | undefined,
  attendeeOptions: { userId: string; isMandatory: boolean }[] | undefined,
  attendeeIds: string[] | undefined,
  facultyId: string,
) {
  const appointment = await appointmentRepository.create(createData)

  const createdSlots = await Promise.all(
    timeSlots.map((slot) =>
      appointmentRepository.addTimeSlot(appointment.id, slot.date, slot.startTime, slot.endTime)
    )
  )

  if (slotLinks) {
    await Promise.all(
      createdSlots.map((createdSlot, i) => {
        const slot = timeSlots[i]
        const key = `${slot.date}-${slot.startTime}-${slot.endTime}`
        const link = slotLinks[key]
        if (link && typeof link === "string") {
          if (!isValidTeamsLink(link)) {
            console.error(`Invalid Teams link for slot ${key}: ${link}`)
            return Promise.resolve()
          }
          return appointmentRepository.updateTimeSlot(createdSlot.id, { teamsLink: link.trim() }).catch((err) => {
            console.error("Failed to save slot teams link:", err)
          })
        }
        return Promise.resolve()
      })
    )
  }

  const attendeePayloads = attendeeOptions
    ? attendeeOptions.filter((opt) => opt.userId !== facultyId).map((opt) => ({ userId: opt.userId, isMandatory: opt.isMandatory }))
    : (attendeeIds || []).filter((id) => id !== facultyId).map((userId) => ({ userId, isMandatory: true }))

  if (attendeePayloads.length > 0) {
    await Promise.all(
      attendeePayloads.map(({ userId, isMandatory }) =>
        appointmentRepository.addAttendee(appointment.id, userId, isMandatory)
      )
    )
  }

  return appointment
}

// ─── Business-logic service functions ─────────

export async function acceptAppointment(id: string, facultyId: string) {
  const appointment = await appointmentRepository.findById(id)
  if (!appointment) throw new Error("Appointment not found")
  if (appointment.facultyId !== facultyId) throw new Error("Unauthorized")
  if (appointment.status !== "PENDING") throw new Error("Appointment is not pending")
  return appointmentRepository.update(id, { status: "APPROVED", teamsSyncStatus: "UNWRITTEN" })
}

export const approveAppointment = acceptAppointment

export async function declineAppointment(id: string, facultyId: string) {
  const appointment = await appointmentRepository.findById(id)
  if (!appointment) throw new Error("Appointment not found")
  if (appointment.facultyId !== facultyId) throw new Error("Unauthorized")
  if (appointment.status !== "PENDING") throw new Error("Appointment is not pending")
  return appointmentRepository.update(id, { status: "REJECTED" })
}

export const rejectAppointment = declineAppointment

export async function completeAppointment(id: string, facultyId: string, actionTaken?: string) {
  const appointment = await appointmentRepository.findById(id)
  if (!appointment) throw new Error("Appointment not found")
  if (appointment.facultyId !== facultyId) throw new Error("Unauthorized")
  if (appointment.status !== "APPROVED") throw new Error("Appointment is not approved")
  if (!actionTaken || actionTaken.trim().length < 20) {
    throw new Error("Actions taken must be at least 20 characters")
  }
  return appointmentRepository.update(id, { status: "COMPLETED", actionTaken })
}

export async function cancelAppointment(id: string, userId: string, userEmail?: string) {
  const appointment = await appointmentRepository.findById(id)
  if (!appointment) throw new Error("Appointment not found")

  const isCreator = userEmail && appointment.createdByEmail === userEmail
  const isFaculty = appointment.facultyId === userId
  if (!isCreator && !isFaculty) throw new Error("Unauthorized — only the creator or faculty can cancel")
  if (isFaculty && !isCreator && appointment.status !== "APPROVED") {
    throw new Error("Only approved appointments can be cancelled by faculty")
  }

  if (appointment.teamsSyncStatus === "WRITTEN") {
    // TODO: Phase 7 — attempt Teams meeting deletion
  }

  return appointmentRepository.update(id, { status: "CANCELLED" })
}

export async function studentResendInvitation(id: string, userId: string) {
  const appointment = await appointmentRepository.findById(id)
  if (!appointment) throw new Error("Appointment not found")
  if (appointment.studentId !== userId) throw new Error("Unauthorized — only the student can resend")
  if (appointment.status !== "REJECTED" && appointment.status !== "CANCELLED") {
    throw new Error("Can only resend invitation for rejected or cancelled appointments")
  }

  return appointmentRepository.update(id, {
    status: "PENDING",
    teamsLink: null,
    teamsSyncStatus: "UNWRITTEN",
    teamsSyncRetries: 0,
    teamsSyncError: null,
    teamsSyncLastAttempt: null,
  })
}

export async function attendeeAcceptAppointment(id: string, userId: string) {
  const appointment = await appointmentRepository.findById(id)
  if (!appointment) throw new Error("Appointment not found")
  const attendee = await appointmentRepository.updateAttendeeStatus(id, userId, "ACCEPTED")
  return { appointment, attendee }
}

export async function attendeeDeclineAppointment(id: string, userId: string) {
  const appointment = await appointmentRepository.findById(id)
  if (!appointment) throw new Error("Appointment not found")
  const attendee = await appointmentRepository.updateAttendeeStatus(id, userId, "DECLINED")
  return { appointment, attendee }
}

export async function updateTeamsLink(id: string, facultyId: string, teamsLink: string) {
  const appointment = await appointmentRepository.findById(id)
  if (!appointment) throw new Error("Appointment not found")
  if (appointment.facultyId !== facultyId) throw new Error("Unauthorized")
  if (!teamsLink || !isValidTeamsLink(teamsLink)) {
    throw new Error("Please enter a valid Microsoft Teams meeting URL (https://teams.microsoft.com/...)")
  }
  return appointmentRepository.update(id, { teamsLink: teamsLink.trim() })
}

export async function retryTeamsSync(id: string, facultyId: string) {
  const appointment = await appointmentRepository.findById(id)
  if (!appointment) throw new Error("Appointment not found")
  if (appointment.facultyId !== facultyId) throw new Error("Unauthorized")
  if (appointment.status !== "APPROVED") throw new Error("Only approved appointments can be synced")
  return appointmentRepository.update(id, {
    teamsSyncStatus: "UNWRITTEN",
    teamsSyncRetries: 0,
    teamsSyncError: null,
    teamsSyncLastAttempt: null,
  })
}

// ─── Passthroughs ────────────────────────────────

export async function getFacultyBookedAppointments(facultyId: string, startDate: string, endDate: string) {
  return appointmentRepository.listFacultyAppointmentsByDateRange(facultyId, startDate, endDate, "APPROVED")
}

export async function listStudentAppointments(studentId: string, pagination?: PaginationParams): Promise<PagedResult<AppointmentData>> {
  return appointmentRepository.listByStudent(studentId, pagination)
}

export async function listFacultyAppointments(facultyId: string, pagination?: PaginationParams): Promise<PagedResult<AppointmentData>> {
  return appointmentRepository.listByFaculty(facultyId, pagination)
}

export async function getAllAppointments(pagination?: PaginationParams): Promise<PagedResult<AppointmentData>> {
  return appointmentRepository.listAll(pagination)
}

export async function getAppointmentById(id: string) {
  const appointment = await appointmentRepository.findById(id)
  if (!appointment) throw new Error("Appointment not found")
  return appointment
}

// ─── Type ───────────────────────────────────────

export interface ApptWithJoins extends AppointmentData {
  student?: { id: string; name: string; email: string; role: string }
  faculty?: { id: string; name: string; email: string; role: string }
  attendees?: Array<{
    id: string
    userId: string
    status: string
    isMandatory: boolean
    user?: { id: string; name: string; email: string; role: string }
  }>
  timeSlots?: Array<{ id: string; date: string; startTime: string; endTime: string; teamsLink?: string }>
}
