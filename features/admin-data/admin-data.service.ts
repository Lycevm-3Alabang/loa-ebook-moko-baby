import { supabase } from "@/lib/db"

type DbRecord = Record<string, unknown>

const CHUNK_SIZE = 200

async function chunkedDelete(table: string, column: string, ids: string[]) {
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from(table).delete().in(column, chunk)
    if (error) throw error
  }
}

async function chunkedUpdate(table: string, column: string, ids: string[], update: Record<string, unknown>) {
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from(table).update(update).in(column, chunk)
    if (error) throw error
  }
}

async function chunkedSelect(table: string, select: string, column: string, ids: string[]): Promise<DbRecord[]> {
  const allData: DbRecord[] = []
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    const { data } = await supabase.from(table).select(select).in(column, chunk)
    allData.push(...(data || []) as unknown as DbRecord[])
  }
  return allData
}

export interface ConsultationExportDto {
  exportedAt: string
  appointments: DbRecord[]
  files: DbRecord[]
  attendees: DbRecord[]
  timeSlots: DbRecord[]
}

export interface StudentExportDto {
  exportedAt: string
  students: DbRecord[]
  orphanedAppointmentIds: string[]
}

export async function exportAndClearConsultations(): Promise<ConsultationExportDto> {
  const { data: appointments } = await supabase
    .from("appointments")
    .select("*")
    .eq("meetingType", "CONSULTATION")
    .order("date", { ascending: false })

  const appointmentIds = (appointments || []).map((a: DbRecord) => a.id as string)

  let files: DbRecord[] = []
  let attendees: DbRecord[] = []
  let timeSlots: DbRecord[] = []

  if (appointmentIds.length > 0) {
    files = await chunkedSelect("appointment_files", "id, appointmentId, fileName, fileType, fileSize, createdAt", "appointmentId", appointmentIds)
    attendees = await chunkedSelect("appointment_attendees", "*", "appointmentId", appointmentIds)
    timeSlots = await chunkedSelect("appointment_time_slots", "*", "appointmentId", appointmentIds)
  }

  const exportData: ConsultationExportDto = {
    exportedAt: new Date().toISOString(),
    appointments: appointments || [],
    files,
    attendees,
    timeSlots,
  }

  if (appointmentIds.length > 0) {
    await chunkedDelete("appointment_files", "appointmentId", appointmentIds)
    await chunkedDelete("appointment_attendees", "appointmentId", appointmentIds)
    await chunkedDelete("appointment_time_slots", "appointmentId", appointmentIds)
    await chunkedDelete("appointments", "id", appointmentIds)
  }

  return exportData
}

export async function exportAndDeleteStudents(): Promise<StudentExportDto> {
  const { data: studentRoles } = await supabase
    .from("userrole")
    .select("userId")
    .eq("roleName", "STUDENT")

  const studentIds = (studentRoles || []).map((r: DbRecord) => r.userId as string)

  if (studentIds.length === 0) {
    return { exportedAt: new Date().toISOString(), students: [], orphanedAppointmentIds: [] }
  }

  const students = await chunkedSelect("users", "id, name, email, course, createdAt, isDisabled, hasLoggedInBefore", "id", studentIds)

  const studentAppointments = await chunkedSelect("appointments", "id", "studentId", studentIds)
  const orphanedAppointmentIds = studentAppointments.map((a: DbRecord) => a.id as string)

  if (orphanedAppointmentIds.length > 0) {
    await chunkedUpdate("appointments", "id", orphanedAppointmentIds, { studentId: null })
    await chunkedDelete("appointment_attendees", "appointmentId", orphanedAppointmentIds)
  }

  await chunkedDelete("userrole", "userId", studentIds)
  await chunkedDelete("users", "id", studentIds)

  return {
    exportedAt: new Date().toISOString(),
    students,
    orphanedAppointmentIds,
  }
}
