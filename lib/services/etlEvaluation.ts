import { supabase } from "@/lib/supabase"
import { userRepository, sectionRepository, subjectRepository, facultySubjectRepository, studentEnrollmentRepository } from "@/lib/repositories/factory"
import { cleanCell } from "@/lib/csv-utils"

function parseSectionIdentifier(raw: string): { name: string; program: string } {
  const dashIdx = raw.indexOf("-")
  const spaceIdx = raw.indexOf(" ")
  const idx = dashIdx !== -1 ? dashIdx : spaceIdx
  if (idx === -1) {
    return { name: raw, program: "" }
  }
  return {
    program: raw.slice(0, idx).trim(),
    name: raw.slice(idx + 1).trim(),
  }
}

export const DUMMY_FACULTY_EMAIL = "placeholder@lyceumalabang.edu.ph"

// ── Faculty-Subject CSV ──────────────────────────────────
// Required columns: faculty email, name, section, subject code, subject name, department code

interface FacultySubjectCsvRow {
  email: string
  name: string
  subjectCode: string
  subjectName: string
  sectionName: string
  sectionProgram: string
  departmentCode: string
}

export const FACULTY_CSV_HEADERS = ["faculty email", "name", "section", "subject code", "subject name", "department code"]

export interface FacultySubjectImportResult {
  matched: number
  errors: { row: number; email?: string; message: string }[]
  createdSubjects: number
  createdSections: number
}

export function parseFacultySubjectCsv(text: string): {
  rows: FacultySubjectCsvRow[]
  errors: { row: number; message: string }[]
  headerError?: string
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const rows: FacultySubjectCsvRow[] = []
  const errors: { row: number; message: string }[] = []

  if (lines.length === 0) {
    return { rows, errors, headerError: "CSV file is empty" }
  }

  const headerLine = lines[0]
  const rawHeaders = headerLine.split(",").map((h) => h.trim().toLowerCase())

  if (rawHeaders.length < 6 || rawHeaders[0] !== "faculty email" || rawHeaders[1] !== "name" || rawHeaders[2] !== "section" || rawHeaders[3] !== "subject code" || rawHeaders[4] !== "subject name" || rawHeaders[5] !== "department code") {
    return {
      rows,
      errors,
      headerError: `Expected headers: faculty email, name, section, subject code, subject name, department code — got: ${rawHeaders.join(", ")}`,
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const cols = line.split(",").map((c) => c.trim())

    if (cols.length < 6) {
      errors.push({ row: i + 1, message: `Expected at least 6 columns, got ${cols.length}` })
      continue
    }

    let email = cleanCell(cols[0]).toLowerCase().trim()
    const displayName = cleanCell(cols[1])
    const sectionRaw = cleanCell(cols[2])
    const subjectCode = cleanCell(cols[3])
    const subjectName = cleanCell(cols[4])
    const departmentCode = cleanCell(cols[5]).toUpperCase()
    const { program, name: sectionName } = parseSectionIdentifier(sectionRaw.trim())

    if (email.length === 0) {
      email = DUMMY_FACULTY_EMAIL
    }

    if (subjectCode.length === 0) {
      errors.push({ row: i + 1, message: "Subject code is required" })
      continue
    }

    if (sectionName.length === 0) {
      errors.push({ row: i + 1, message: "Section is required" })
      continue
    }

    if (departmentCode.length === 0) {
      errors.push({ row: i + 1, message: "Department code is required" })
      continue
    }

    rows.push({ email, name: displayName, subjectCode, subjectName, sectionName, sectionProgram: program, departmentCode })
  }

  return { rows, errors }
}

export async function importFacultySubjects(
  rows: FacultySubjectCsvRow[],
  semesterId?: string | null,
): Promise<FacultySubjectImportResult> {
  const result: FacultySubjectImportResult = {
    matched: 0,
    errors: [],
    createdSubjects: 0,
    createdSections: 0,
  }

  if (rows.length === 0) return result

  // ── Resolve department codes → ids ──
  const uniqueDeptCodes = [...new Set(rows.map((r) => r.departmentCode))]
  const { data: allDepts } = await supabase.from("departments").select("id, code")
  const deptCodeToId = new Map((allDepts || []).map((d: { id: string; code: string }) => [d.code.toUpperCase(), d.id]))
  const deptCodeErrors = new Set<string>()
  for (const code of uniqueDeptCodes) {
    if (!deptCodeToId.has(code)) {
      deptCodeErrors.add(code)
      result.errors.push({ row: 0, message: `Department code "${code}" not found` })
    }
  }

  // ── Filter out rows with invalid department codes ──
  const validRows = rows.filter((r) => !deptCodeErrors.has(r.departmentCode))

  // ── Upsert subjects ──
  const uniqueSubjectCodes = [...new Set(validRows.map((r) => r.subjectCode))]
  const subjectItems = uniqueSubjectCodes.map((code) => {
    const row = validRows.find((r) => r.subjectCode === code)
    return { code, name: row?.subjectName || code }
  })
  const { data: subjects, created: createdSubjects } = await subjectRepository.upsertMany(subjectItems)
  result.createdSubjects = createdSubjects

  // ── Upsert sections ──
  const sectionKeys = new Set<string>()
  const sectionItems: { name: string; program: string; departmentCourseId: string }[] = []

  const { data: allCourses } = await supabase.from("department_courses").select("id, code")
  const courseCodeToId = new Map((allCourses || []).map((c: { code: string; id: string }) => [c.code, c.id]))

  for (const r of validRows) {
    const key = `${r.sectionName}|${r.sectionProgram}`
    if (!sectionKeys.has(key)) {
      sectionKeys.add(key)
      const courseId = courseCodeToId.get(r.sectionProgram)
      if (!courseId) {
        result.errors.push({ row: 0, message: `No department course found for program "${r.sectionProgram}"` })
        continue
      }
      sectionItems.push({ name: r.sectionName, program: r.sectionProgram, departmentCourseId: courseId })
    }
  }
  const { data: sections, created: createdSections } = await sectionRepository.upsertMany(sectionItems)
  result.createdSections = createdSections

  // ── Resolve users (batch lookup + batch create) ──
  const uniqueEmails = [...new Set(validRows.map((r) => r.email.toLowerCase().trim()))]
  const userMap = await userRepository.findManyByEmail(uniqueEmails)
  const missingEmails = uniqueEmails.filter((e) => !userMap.has(e))
  if (missingEmails.length > 0) {
    const createdUsers = await userRepository.createMany(
      missingEmails.map((email) => {
        const row = validRows.find((r) => r.email.toLowerCase().trim() === email)
        const deptId = row ? deptCodeToId.get(row.departmentCode) ?? undefined : undefined
        const isPlaceholder = email === DUMMY_FACULTY_EMAIL
        return {
          email,
          name: isPlaceholder ? "Unassigned Faculty" : (row?.name?.trim() || email.split("@")[0] || email),
          role: "FACULTY",
          departmentId: deptId,
        }
      }),
    )
    for (const [email, user] of createdUsers) {
      userMap.set(email, user)
    }
  }

  // ── Build mappings ──
  const fsItems: { faculty_id: string; subject_id: string; section_id: string; semesterId?: string | null }[] = []
  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i]
    const rowNum = i + 1

    const user = userMap.get(row.email.toLowerCase().trim())
    if (!user) {
      result.errors.push({ row: rowNum, email: row.email, message: "Faculty not found in system" })
      continue
    }

    const subject = subjects.get(row.subjectCode)
    if (!subject) {
      result.errors.push({ row: rowNum, message: `Subject "${row.subjectCode}" could not be created or found` })
      continue
    }

    const sectionKey = `${row.sectionName}|${row.sectionProgram}`
    const section = sections.get(sectionKey)
    if (!section) {
      result.errors.push({ row: rowNum, message: `Section "${row.sectionProgram}-${row.sectionName}" could not be created or found` })
      continue
    }

    fsItems.push({ faculty_id: user.id, subject_id: subject.id, section_id: section.id, semesterId })
    result.matched++
  }

  // ── Group by section and replace ──
  const bySection = new Map<string, { faculty_id: string; subject_id: string; semesterId?: string | null }[]>()
  for (const item of fsItems) {
    if (!bySection.has(item.section_id)) bySection.set(item.section_id, [])
    bySection.get(item.section_id)!.push({ faculty_id: item.faculty_id, subject_id: item.subject_id, semesterId: item.semesterId })
  }

  for (const [section_id, items] of bySection) {
    const seen = new Set<string>()
    const unique = items.filter((item) => {
      if (seen.has(item.subject_id)) return false
      seen.add(item.subject_id)
      return true
    })
    await facultySubjectRepository.replaceBySection(section_id, unique)
  }

  return result
}

// ── Student Enrollment CSV ───────────────────────────────
// Columns: student email, section (e.g., "BSIT-32A3")

interface StudentEnrollmentCsvRow {
  email: string
  name: string
  sectionName: string
  sectionProgram: string
}

export interface StudentEnrollmentImportResult {
  matched: number
  errors: { row: number; email?: string; message: string }[]
  createdSections: number
}

export function parseStudentEnrollmentCsv(text: string): {
  rows: StudentEnrollmentCsvRow[]
  errors: { row: number; message: string }[]
  headerError?: string
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const rows: StudentEnrollmentCsvRow[] = []
  const errors: { row: number; message: string }[] = []

  if (lines.length === 0) {
    return { rows, errors, headerError: "CSV file is empty" }
  }

  const headerLine = lines[0]
  const rawHeaders = headerLine.split(",").map((h) => h.trim().toLowerCase())

  const hasName = rawHeaders.length > 1 && rawHeaders[1] === "name"
  const minCols = hasName ? 3 : 2

  if (rawHeaders.length < minCols) {
    return {
      rows,
      errors,
      headerError: `Expected at least ${minCols} columns (student email${hasName ? ", name" : ""}, section), got ${rawHeaders.length}.`,
    }
  }

  if (rawHeaders[0] !== "student email") {
    return {
      rows,
      errors,
      headerError: `Expected headers: student email${hasName ? ", name" : ""}, section — got: ${rawHeaders.join(", ")}`,
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const cols = line.split(",").map((c) => c.trim())

    if (cols.length < minCols) {
      errors.push({ row: i + 1, message: `Expected at least ${minCols} columns, got ${cols.length}` })
      continue
    }

    const email = cols[0].toLowerCase().trim()
    const displayName = hasName ? cols[1].trim() : ""
    const sectionRaw = cols.slice(hasName ? 2 : 1).join(", ").trim()
    const { program, name: sectionName } = parseSectionIdentifier(sectionRaw)

    if (email.length === 0) {
      errors.push({ row: i + 1, message: "Student email is required" })
      continue
    }

    if (sectionName.length === 0) {
      errors.push({ row: i + 1, message: "Section is required" })
      continue
    }

    rows.push({ email, name: displayName, sectionName, sectionProgram: program })
  }

  return { rows, errors }
}

export async function importStudentEnrollments(
  rows: StudentEnrollmentCsvRow[],
  semesterId: string | null,
): Promise<StudentEnrollmentImportResult> {
  const result: StudentEnrollmentImportResult = {
    matched: 0,
    errors: [],
    createdSections: 0,
  }

  if (rows.length === 0) return result

  // ── Upsert sections ──
  const sectionKeys = new Set<string>()
  const sectionItems: { name: string; program: string; departmentCourseId: string }[] = []

  const { data: allCourses } = await supabase.from("department_courses").select("id, code")
  const courseCodeToId = new Map((allCourses || []).map((c: { code: string; id: string }) => [c.code, c.id]))

  for (const r of rows) {
    const key = `${r.sectionName}|${r.sectionProgram}`
    if (!sectionKeys.has(key)) {
      sectionKeys.add(key)
      const courseId = courseCodeToId.get(r.sectionProgram)
      if (!courseId) {
        result.errors.push({ row: 0, message: `No department course found for program "${r.sectionProgram}"` })
        continue
      }
      sectionItems.push({ name: r.sectionName, program: r.sectionProgram, departmentCourseId: courseId })
    }
  }
  const { data: sections, created: createdSections } = await sectionRepository.upsertMany(sectionItems)
  result.createdSections = createdSections

  // ── Resolve users (batch lookup + batch create) ──
  const uniqueEmails = [...new Set(rows.map((r) => r.email.toLowerCase().trim()))]
  const userMap = await userRepository.findManyByEmail(uniqueEmails)
  const missingEmails = uniqueEmails.filter((e) => !userMap.has(e))
  if (missingEmails.length > 0) {
    const nameByEmail = new Map(rows.map((r) => [r.email.toLowerCase().trim(), r.name]))
    const createdUsers = await userRepository.createMany(
      missingEmails.map((email) => ({
        email,
        name: nameByEmail.get(email) || email.split("@")[0] || email,
        role: "STUDENT",
      })),
    )
    for (const [email, user] of createdUsers) {
      userMap.set(email, user)
    }
  }

  // ── Build enrollment items ──
  const enrollmentItems: { student_id: string; section_id: string; semesterId?: string | null }[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1

    const user = userMap.get(row.email.toLowerCase().trim())
    if (!user) {
      result.errors.push({ row: rowNum, email: row.email, message: "Student not found in system" })
      continue
    }

    const sectionKey = `${row.sectionName}|${row.sectionProgram}`
    const section = sections.get(sectionKey)
    if (!section) {
      result.errors.push({ row: rowNum, message: `Section "${row.sectionProgram}-${row.sectionName}" could not be created or found` })
      continue
    }

    enrollmentItems.push({ student_id: user.id, section_id: section.id, semesterId })
    result.matched++
  }

  // ── Group by section and replace ──
  const bySection = new Map<string, { student_id: string; semesterId?: string | null }[]>()
  for (const item of enrollmentItems) {
    if (!bySection.has(item.section_id)) bySection.set(item.section_id, [])
    bySection.get(item.section_id)!.push({ student_id: item.student_id, semesterId: item.semesterId })
  }

  for (const [section_id, items] of bySection) {
    const seen = new Set<string>()
    const unique = items.filter((item) => {
      if (seen.has(item.student_id)) return false
      seen.add(item.student_id)
      return true
    })
    await studentEnrollmentRepository.replaceBySection(section_id, unique)
  }

  return result
}
