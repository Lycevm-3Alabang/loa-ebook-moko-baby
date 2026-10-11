import { userRepository, studentEnrollmentRepository, semesterRepository } from "@/lib/repositories/factory"
import { supabase } from "@/lib/db"
import { logAuditEvent } from "@/lib/services/audit"
import type { StudentEnrollmentData } from "@/lib/types"

export class EnrollmentError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export interface CreateEnrollmentInput {
  student_id?: string
  name?: string
  email?: string
  faculty_subject_id: string
  section_id?: string
  // NOTE: semesterId is deliberately NOT accepted. The client-held
  // `activeSemesterId || null` pattern wrote NULL rows whenever the
  // semesters fetch had not resolved — and a NULL semester is exactly what
  // the evaluation gate (findExisting) rejects. Resolve server-side instead.
}

export interface CreateEnrollmentResult {
  data: StudentEnrollmentData
  createdNewUser: boolean
  studentEmail?: string
}

export async function createEnrollment(
  input: CreateEnrollmentInput,
  currentUserId: string
): Promise<CreateEnrollmentResult> {
  const { student_id, name, email, faculty_subject_id, section_id } = input

  if (!faculty_subject_id) {
    throw new EnrollmentError("faculty_subject_id is required", 400)
  }

  // Server-side active semester, exactly-once — same pattern as
  // POST /api/import/students (which its own comment calls load-bearing:
  // a null or stale value produces rows the evaluation gate rejects).
  const activeSemesters = await semesterRepository.list({ isActive: true })
  if (activeSemesters.length !== 1) {
    throw new EnrollmentError(
      activeSemesters.length === 0
        ? "No active semester. Activate one before adding enrollments."
        : "More than one semester is active. Deactivate all but one before adding enrollments.",
      400,
    )
  }
  const semesterId = activeSemesters[0].id

  let resolvedStudentId = student_id
  let createdNewUser = false
  let normalEmail = ""

  if (!resolvedStudentId) {
    if (!name || !email) {
      throw new EnrollmentError("Either student_id or name+email is required", 400)
    }
    normalEmail = email.toLowerCase().trim()

    const existingUser = await userRepository.findByEmail(normalEmail)
    if (existingUser) {
      resolvedStudentId = existingUser.id
    } else {
      try {
        const newUser = await userRepository.create({ name, email: normalEmail, role: "STUDENT" })
        resolvedStudentId = newUser.id
        createdNewUser = true
      } catch (err: unknown) {
        const dbErr = err as { code?: string; message?: string }
        if (dbErr.code === "23505") {
          throw new EnrollmentError("A user with this email already exists", 409)
        }
        throw new EnrollmentError(dbErr.message || "Failed to create user", 500)
      }
    }
  }

  let resolvedSectionId = section_id
  if (!resolvedSectionId) {
    const { data: fs, error: fsErr } = await supabase
      .from("faculty_subjects")
      .select("section_id")
      .eq("id", faculty_subject_id)
      .single()
    if (fsErr || !fs) {
      throw new EnrollmentError("Faculty-subject mapping not found", 404)
    }
    resolvedSectionId = fs.section_id
  }

  const existing = await studentEnrollmentRepository.findExisting(resolvedStudentId, faculty_subject_id, semesterId)
  if (existing) {
    throw new EnrollmentError("This enrollment already exists", 409)
  }

  let data: StudentEnrollmentData
  try {
    data = await studentEnrollmentRepository.create({
      student_id: resolvedStudentId,
      faculty_subject_id,
      section_id: resolvedSectionId!,
      semesterId,
    })
  } catch (err: unknown) {
    const dbErr = err as { code?: string; message?: string }
    if (dbErr.code === "23505") {
      throw new EnrollmentError(
        "This student is already enrolled in a different section for the same subject this semester",
        409
      )
    }
    throw new EnrollmentError(dbErr.message || "Failed to create enrollment", 500)
  }

  await logAuditEvent({
    userId: currentUserId,
    action: "CREATE_ENROLLMENT",
    details: createdNewUser
      ? `Created student ${name} (${normalEmail}) and enrolled in faculty-subject ${faculty_subject_id}`
      : `Enrolled student ${resolvedStudentId} in faculty-subject ${faculty_subject_id}`,
  })

  return { data, createdNewUser, studentEmail: normalEmail || undefined }
}
