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
  const studentIds: string[] = []
  let offset = 0
  const BATCH = 1000
  while (true) {
    const { data: studentRoles } = await supabase
      .from("userrole")
      .select("userId")
      .eq("roleName", "STUDENT")
      .range(offset, offset + BATCH - 1)
    const batch = (studentRoles || []).map((r: DbRecord) => r.userId as string)
    studentIds.push(...batch)
    if (!studentRoles || studentRoles.length < BATCH) break
    offset += BATCH
  }

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

export interface LoadingExportDto {
  exportedAt: string
  semesterScope: string
  enrollments: DbRecord[]
  facultySubjects: DbRecord[]
}

export async function exportAndClearLoading(semesterId: string | "ALL"): Promise<LoadingExportDto> {
  const scopeAll = semesterId === "ALL"
  if (!scopeAll) {
    const { data: sem, error: semErr } = await supabase.from("semesters").select("id").eq("id", semesterId).single()
    if (semErr || !sem) throw new Error("Semester not found")
  }

  let enrollQ = supabase.from("student_enrollments").select("*")
  if (!scopeAll) enrollQ = enrollQ.eq("semesterId", semesterId) as typeof enrollQ
  const { data: enrollments, error: enrollErr } = await enrollQ
  if (enrollErr) throw enrollErr

  let fsQ = supabase.from("faculty_subjects").select("*")
  if (!scopeAll) fsQ = fsQ.eq("semesterId", semesterId) as typeof fsQ
  const { data: mappings, error: fsErr } = await fsQ
  if (fsErr) throw fsErr

  // Never strand evaluations: mappings with live evaluations block the run.
  const mappingIds = (mappings || []).map((m: DbRecord) => m.id as string)
  if (mappingIds.length > 0) {
    const referenced = new Set<string>()
    for (let i = 0; i < mappingIds.length; i += 100) {
      const { data: evals, error: evalErr } = await supabase
        .from("evaluations")
        .select("facultySubjectId")
        .in("facultySubjectId", mappingIds.slice(i, i + 100))
        .eq("isDisabled", false)
      if (evalErr) throw evalErr
      for (const e of evals || []) referenced.add((e as unknown as DbRecord).facultySubjectId as string)
    }
    const blocked = mappingIds.filter((id) => referenced.has(id))
    if (blocked.length > 0) {
      throw new Error(`${blocked.length} subject mapping(s) still have evaluations — clear evaluations first`)
    }
  }

  const enrollmentIds = (enrollments || []).map((e: DbRecord) => e.id as string)
  if (enrollmentIds.length > 0) await chunkedDelete("student_enrollments", "id", enrollmentIds)
  if (mappingIds.length > 0) await chunkedDelete("faculty_subjects", "id", mappingIds)

  return {
    exportedAt: new Date().toISOString(),
    semesterScope: semesterId,
    enrollments: enrollments || [],
    facultySubjects: mappings || [],
  }
}

export interface EvaluationsExportDto {
  exportedAt: string
  semesterScope: string
  evaluationPeriodIds: string[]
  evaluations: DbRecord[]
  ratings: DbRecord[]
  comments: DbRecord[]
  results: DbRecord[]
}

async function chunkedSelectIn(table: string, select: string, column: string, values: string[]): Promise<DbRecord[]> {
  const allData: DbRecord[] = []
  for (let i = 0; i < values.length; i += CHUNK_SIZE) {
    const { data } = await supabase.from(table).select(select).in(column, values.slice(i, i + CHUNK_SIZE))
    allData.push(...(data || []) as unknown as DbRecord[])
  }
  return allData
}

async function chunkedDeleteIn(table: string, column: string, values: string[]) {
  for (let i = 0; i < values.length; i += CHUNK_SIZE) {
    const { error } = await supabase.from(table).delete().in(column, values.slice(i, i + CHUNK_SIZE))
    if (error) throw error
  }
}

export async function exportAndClearEvaluations(semesterId: string | "ALL"): Promise<EvaluationsExportDto> {
  const scopeAll = semesterId === "ALL"
  if (!scopeAll) {
    const { data: sem, error: semErr } = await supabase.from("semesters").select("id").eq("id", semesterId).single()
    if (semErr || !sem) throw new Error("Semester not found")
  }

  let periodQ = supabase.from("evaluation_periods").select("id")
  if (!scopeAll) periodQ = periodQ.eq("semesterId", semesterId) as typeof periodQ
  const { data: periods, error: periodErr } = await periodQ
  if (periodErr) throw periodErr
  const periodIds = (periods || []).map((p: DbRecord) => p.id as string)

  let evaluations: DbRecord[] = []
  let results: DbRecord[] = []
  if (periodIds.length > 0) {
    evaluations = await chunkedSelectIn("evaluations", "*", "evaluation_period_id", periodIds)
    results = await chunkedSelectIn("evaluation_results", "*", "evaluation_period_id", periodIds)
  }
  const evaluationIds = evaluations.map((e) => e.id as string)

  let ratings: DbRecord[] = []
  let comments: DbRecord[] = []
  if (evaluationIds.length > 0) {
    ratings = await chunkedSelectIn("evaluation_ratings", "*", "evaluationId", evaluationIds)
    comments = await chunkedSelectIn("evaluation_comments", "*", "evaluationId", evaluationIds)
    await chunkedDeleteIn("evaluation_ratings", "evaluationId", evaluationIds)
    await chunkedDeleteIn("evaluation_comments", "evaluationId", evaluationIds)
    await chunkedDeleteIn("evaluations", "id", evaluationIds)
  }
  if (periodIds.length > 0) {
    await chunkedDeleteIn("evaluation_results", "evaluation_period_id", periodIds)
  }

  return {
    exportedAt: new Date().toISOString(),
    semesterScope: semesterId,
    evaluationPeriodIds: periodIds,
    evaluations,
    ratings,
    comments,
    results,
  }
}

export interface ClearStudentsInput {
  semesterId: string | "ALL"
  mode: "enrolments" | "hard"
  preview?: boolean
}

export interface ClearStudentsResult {
  exportedAt: string
  semesterScope: string
  mode: string
  preview: boolean
  studentIds: string[]
  enrollments: DbRecord[]
  users: DbRecord[]
  consultations: DbRecord[]
  appointmentFiles: DbRecord[]
  evaluations: DbRecord[]
}

async function studentIdsInScope(semesterId: string | "ALL"): Promise<string[]> {
  if (semesterId === "ALL") {
    const ids: string[] = []
    let offset = 0
    const BATCH = 1000
    while (true) {
      const { data: studentRoles, error } = await supabase
        .from("userrole")
        .select("userId")
        .eq("roleName", "STUDENT")
        .range(offset, offset + BATCH - 1)
      if (error) throw error
      const batch = (studentRoles || []).map((r: DbRecord) => r.userId as string)
      ids.push(...batch)
      if (!studentRoles || studentRoles.length < BATCH) break
      offset += BATCH
    }
    return [...new Set(ids)]
  }
  const { data: sem, error: semErr } = await supabase.from("semesters").select("id").eq("id", semesterId).single()
  if (semErr || !sem) throw new Error("Semester not found")
  const rows = await chunkedSelectIn("student_enrollments", "student_id", "semesterId", [semesterId])
  return [...new Set(rows.map((r) => r.student_id as string).filter(Boolean))]
}

export async function exportAndClearStudents(input: ClearStudentsInput): Promise<ClearStudentsResult> {
  const { semesterId, mode, preview } = input
  const scopeAll = semesterId === "ALL"
  const studentIds = await studentIdsInScope(semesterId)

  const base = {
    exportedAt: new Date().toISOString(),
    semesterScope: semesterId,
    mode,
    preview: !!preview,
    studentIds,
  }
  if (studentIds.length === 0) {
    return { ...base, enrollments: [], users: [], consultations: [], appointmentFiles: [], evaluations: [] }
  }

  // Enrolments in scope for these students (ALL scope = every enrolment of theirs).
  const enrollments: DbRecord[] = []
  for (let i = 0; i < studentIds.length; i += CHUNK_SIZE) {
    let q = supabase.from("student_enrollments").select("*").in("student_id", studentIds.slice(i, i + CHUNK_SIZE))
    if (!scopeAll) q = q.eq("semesterId", semesterId) as typeof q
    const { data, error } = await q
    if (error) throw error
    enrollments.push(...(data || []) as unknown as DbRecord[])
  }
  const users = await chunkedSelect("users", "id, name, email, course, createdAt, isDisabled, hasLoggedInBefore", "id", studentIds)

  // Hard-mode cascade covers the accounts' consultations + evaluations across
  // all terms (account deletion is global, not per-semester).
  let consultations: DbRecord[] = []
  let appointmentFiles: DbRecord[] = []
  let evaluations: DbRecord[] = []
  if (mode === "hard") {
    consultations = await chunkedSelect("appointments", "id", "studentId", studentIds)
    const appointmentIds = consultations.map((a) => a.id as string)
    if (appointmentIds.length > 0) {
      appointmentFiles = await chunkedSelect("appointment_files", "id, appointmentId, fileName, fileType, fileSize, createdAt", "appointmentId", appointmentIds)
    }
    evaluations = await chunkedSelectIn("evaluations", "*", "evaluatorId", studentIds)
  }

  if (preview) {
    return { ...base, enrollments, users, consultations, appointmentFiles, evaluations }
  }

  const enrollmentIds = enrollments.map((e) => e.id as string)
  if (enrollmentIds.length > 0) await chunkedDelete("student_enrollments", "id", enrollmentIds)

  if (mode === "hard") {
    const appointmentIds = consultations.map((a) => a.id as string)
    if (appointmentIds.length > 0) {
      await chunkedDelete("appointment_files", "appointmentId", appointmentIds)
      await chunkedDelete("appointment_attendees", "appointmentId", appointmentIds)
      await chunkedDelete("appointment_time_slots", "appointmentId", appointmentIds)
      await chunkedDelete("appointments", "id", appointmentIds)
    }
    const evaluationIds = evaluations.map((e) => e.id as string)
    if (evaluationIds.length > 0) {
      await chunkedDeleteIn("evaluation_ratings", "evaluationId", evaluationIds)
      await chunkedDeleteIn("evaluation_comments", "evaluationId", evaluationIds)
      await chunkedDeleteIn("evaluations", "id", evaluationIds)
    }
    await chunkedDelete("userrole", "userId", studentIds)
    await chunkedDelete("users", "id", studentIds)
  } else {
    await chunkedUpdate("users", "id", studentIds, { deletedAt: new Date().toISOString() })
  }

  return { ...base, enrollments, users, consultations, appointmentFiles, evaluations }
}

const SOFT_DELETABLE_ROLES = ["STUDENT", "DEAN", "FACULTY"]

export interface RoleSoftDeleteResult {
  exportedAt: string
  roles: string[]
  userIds: string[]
  users: DbRecord[]
}

export async function exportAndSoftDeleteByRoles(roles: string[]): Promise<RoleSoftDeleteResult> {
  const normalized = [...new Set(roles.map((r) => r.toUpperCase().trim()).filter(Boolean))]
  if (normalized.length === 0) throw new Error("Select at least one role")
  const rejected = normalized.filter((r) => !SOFT_DELETABLE_ROLES.includes(r))
  if (rejected.length > 0) throw new Error(`Cannot soft-delete role(s): ${rejected.join(", ")} — ADMIN is never included`)

  const ids: string[] = []
  for (const role of normalized) {
    let offset = 0
    while (true) {
      const { data, error } = await supabase.from("userrole").select("userId").eq("roleName", role).range(offset, offset + 999)
      if (error) throw error
      ids.push(...((data || []).map((r: DbRecord) => r.userId as string)))
      if (!data || data.length < 1000) break
      offset += 1000
    }
  }
  const userIds = [...new Set(ids)]
  const users = userIds.length > 0
    ? await chunkedSelect("users", "id, name, email, course, createdAt, isDisabled, hasLoggedInBefore", "id", userIds)
    : []
  if (userIds.length > 0) {
    await chunkedUpdate("users", "id", userIds, { deletedAt: new Date().toISOString() })
  }
  return { exportedAt: new Date().toISOString(), roles: normalized, userIds, users }
}

export interface FacultyHardDeleteResult {
  exportedAt: string
  departmentScope: string[]
  userIds: string[]
  users: DbRecord[]
  facultySubjects: DbRecord[]
  enrollments: DbRecord[]
  appointments: DbRecord[]
  appointmentFiles: DbRecord[]
  evaluations: DbRecord[]
  ratings: DbRecord[]
  comments: DbRecord[]
  results: DbRecord[]
}

export async function exportAndHardDeleteFaculty(departmentIds: string[] | "ALL"): Promise<FacultyHardDeleteResult> {
  const scopeAll = departmentIds === "ALL"
  const deptIds = scopeAll ? [] : [...new Set(departmentIds.map((d) => d.trim()).filter(Boolean))]
  if (!scopeAll && deptIds.length === 0) throw new Error("Select at least one department")

  const staffIds: string[] = []
  for (const role of ["FACULTY", "DEAN"]) {
    let offset = 0
    while (true) {
      const { data, error } = await supabase.from("userrole").select("userId").eq("roleName", role).range(offset, offset + 999)
      if (error) throw error
      staffIds.push(...(((data || []) as DbRecord[]).map((r) => r.userId as string)))
      if (!data || data.length < 1000) break
      offset += 1000
    }
  }
  const candidates = [...new Set(staffIds)]
  let scopedIds = candidates
  if (!scopeAll && candidates.length > 0) {
    const deptSet = new Set(deptIds)
    const rows = await chunkedSelect("users", "id, departmentId", "id", candidates)
    scopedIds = rows.filter((r) => r.departmentId && deptSet.has(r.departmentId as string)).map((r) => r.id as string)
  }
  const userIds = [...new Set(scopedIds)]

  const empty = {
    exportedAt: new Date().toISOString(),
    departmentScope: scopeAll ? ["ALL"] : deptIds,
    userIds,
    users: [] as DbRecord[],
    facultySubjects: [] as DbRecord[],
    enrollments: [] as DbRecord[],
    appointments: [] as DbRecord[],
    appointmentFiles: [] as DbRecord[],
    evaluations: [] as DbRecord[],
    ratings: [] as DbRecord[],
    comments: [] as DbRecord[],
    results: [] as DbRecord[],
  }
  if (userIds.length === 0) return empty

  const users = await chunkedSelect("users", "id, name, email, course, createdAt, isDisabled, hasLoggedInBefore", "id", userIds)
  const mappings = await chunkedSelectIn("faculty_subjects", "*", "faculty_id", userIds)
  const mappingIds = mappings.map((m) => m.id as string)
  const appointments = await chunkedSelectIn("appointments", "*", "facultyId", userIds)
  const appointmentIds = appointments.map((a) => a.id as string)
  const appointmentFiles = appointmentIds.length > 0
    ? await chunkedSelect("appointment_files", "id, appointmentId, fileName, fileType, fileSize, createdAt", "appointmentId", appointmentIds)
    : []
  const evaluations = await chunkedSelectIn("evaluations", "*", "evaluateeId", userIds)
  const evaluationIds = evaluations.map((e) => e.id as string)
  const ratings = evaluationIds.length > 0 ? await chunkedSelectIn("evaluation_ratings", "*", "evaluationId", evaluationIds) : []
  const comments = evaluationIds.length > 0 ? await chunkedSelectIn("evaluation_comments", "*", "evaluationId", evaluationIds) : []
  const results = await chunkedSelectIn("evaluation_results", "*", "facultyId", userIds)
  const enrollments = mappingIds.length > 0 ? await chunkedSelectIn("student_enrollments", "*", "faculty_subject_id", mappingIds) : []

  if (evaluationIds.length > 0) {
    await chunkedDeleteIn("evaluation_ratings", "evaluationId", evaluationIds)
    await chunkedDeleteIn("evaluation_comments", "evaluationId", evaluationIds)
    await chunkedDeleteIn("evaluations", "id", evaluationIds)
  }
  if (userIds.length > 0) {
    await chunkedDeleteIn("evaluation_results", "facultyId", userIds)
  }
  const enrollmentIds = enrollments.map((e) => e.id as string)
  if (enrollmentIds.length > 0) await chunkedDelete("student_enrollments", "id", enrollmentIds)
  if (mappingIds.length > 0) await chunkedDelete("faculty_subjects", "id", mappingIds)
  if (appointmentIds.length > 0) {
    await chunkedDelete("appointment_files", "appointmentId", appointmentIds)
    await chunkedDelete("appointment_attendees", "appointmentId", appointmentIds)
    await chunkedDelete("appointment_time_slots", "appointmentId", appointmentIds)
    await chunkedDelete("appointments", "id", appointmentIds)
  }
  await chunkedDelete("userrole", "userId", userIds)
  await chunkedDelete("users", "id", userIds)

  return { ...empty, users, facultySubjects: mappings, enrollments, appointments, appointmentFiles, evaluations, ratings, comments, results }
}
