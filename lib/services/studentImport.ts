import { userRepository, sectionRepository, subjectRepository, facultySubjectRepository, studentEnrollmentRepository } from "@/lib/repositories/factory"
import { isExcelErrorCell, isAllowedStudentEmail, STUDENT_ALLOWED_DOMAINS } from "@/lib/csv-utils"

function parseSectionIdentifier(raw: string): { name: string; program: string } {
  const idx = raw.indexOf("-")
  if (idx === -1) return { name: raw, program: "" }
  return { program: raw.slice(0, idx).trim(), name: raw.slice(idx + 1).trim() }
}

export interface StudentCsvRow {
  email: string
  name: string
  subjectCode: string
  sectionName: string
  sectionProgram: string
  facultyEmail?: string
  departmentId?: string | null
}

export interface StudentImportResult {
  created: { name: string; email: string; role: string }[]
  enrolled: number
  skipped: number
  failed: { row: number; email: string; subjectCode: string; section: string; remark: string }[]
  parseErrors: { row: number; message: string }[]
  successCsv: string
  failureCsv: string
  totalRows: number
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toCsv(rows: Record<string, string>[], headers: string[]): string {
  const header = headers.map(escapeCsv).join(",")
  const lines = rows.map((r) => headers.map((h) => escapeCsv(r[h] ?? "")).join(","))
  return [header, ...lines].join("\n")
}

export function parseStudentCsv(text: string): {
  rows: StudentCsvRow[]
  errors: { row: number; message: string }[]
  headerError?: string
} {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const rows: StudentCsvRow[] = []
  const errors: { row: number; message: string }[] = []

  if (lines.length === 0) return { rows, errors, headerError: "CSV file is empty" }

  const rawHeaders = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const expected = ["name", "email", "subject code", "section", "faculty email"]

  if (rawHeaders.length < expected.length || rawHeaders[0] !== "name" || rawHeaders[1] !== "email") {
    return { rows, errors, headerError: `Expected headers: ${expected.join(", ")}` }
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim())
    if (cols.length < expected.length) {
      errors.push({ row: i + 1, message: `Expected ${expected.length} columns, got ${cols.length}` })
      continue
    }

    const displayName = cols[0].trim()
    const email = cols[1].toLowerCase().trim()
    const subjectCode = cols[2].trim()
    const sectionRaw = cols[3].trim()
    const { program, name: sectionName } = parseSectionIdentifier(sectionRaw)
    const facultyEmail = cols[4]?.toLowerCase().trim() || ""
    const departmentCode = cols[5]?.toUpperCase().trim() || ""

    const excelOffender =
      [
        ["name", displayName],
        ["email", email],
        ["subject code", subjectCode],
        ["section", sectionRaw],
        ["faculty email", facultyEmail],
        ["department code", departmentCode],
      ].find(([, v]) => isExcelErrorCell(v))?.[0] ?? null
    if (excelOffender) {
      errors.push({ row: i + 1, message: `Invalid value in ${excelOffender} (Excel error)` })
      continue
    }

    if (!displayName) { errors.push({ row: i + 1, message: "Name is required" }); continue }
    if (!email) { errors.push({ row: i + 1, message: "Email is required" }); continue }
    if (!isAllowedStudentEmail(email)) {
      errors.push({ row: i + 1, message: `Email must end with ${STUDENT_ALLOWED_DOMAINS.join(" or ")}` }); continue
    }
    if (!subjectCode) { errors.push({ row: i + 1, message: "Subject code is required" }); continue }
    if (!sectionName) { errors.push({ row: i + 1, message: "Section is required" }); continue }
    if (!departmentCode) { errors.push({ row: i + 1, message: "Department code is required" }); continue }

    rows.push({ email, name: displayName, subjectCode, sectionName, sectionProgram: program, facultyEmail, departmentId: undefined })
  }

  return { rows, errors }
}

export async function importStudents(
  rows: StudentCsvRow[],
  departmentId: string | null,
  semesterId: string | null,
): Promise<StudentImportResult> {
  const failed: StudentImportResult["failed"] = []
  const created: StudentImportResult["created"] = []
  let enrolled = 0
  let skipped = 0

  if (rows.length === 0) {
    return { created, enrolled, skipped, failed, parseErrors: [], successCsv: "", failureCsv: "", totalRows: 0 }
  }

  const excelOffenderFor = (r: StudentCsvRow): string | null =>
    (
      [
        ["name", r.name],
        ["email", r.email],
        ["subject code", r.subjectCode],
        ["section", `${r.sectionProgram}-${r.sectionName}`],
        ["faculty email", r.facultyEmail || ""],
      ] as [string, string][]
    ).find(([, v]) => isExcelErrorCell((v || "").trim()))?.[0] ?? null

  const excelInvalidIdx = new Set<number>()
  rows.forEach((r, idx) => {
    if (excelOffenderFor(r)) excelInvalidIdx.add(idx)
  })

  const uniqueEmails = [...new Set(rows.filter((_, idx) => !excelInvalidIdx.has(idx)).map((r) => r.email.toLowerCase().trim()))].filter((e) => e.length > 0)
  const userMap = await userRepository.findManyByEmail(uniqueEmails)
  const missingEmails = uniqueEmails.filter((e) => !userMap.has(e))
  if (missingEmails.length > 0) {
    const nameByEmail = new Map(rows.map((r) => [r.email.toLowerCase().trim(), r.name]))
    const deptIdByEmail = new Map<string, string | null>()
    for (const r of rows) {
      const key = r.email.toLowerCase().trim()
      if (!deptIdByEmail.has(key)) deptIdByEmail.set(key, r.departmentId ?? departmentId ?? null)
    }
    const createdUsers = await userRepository.createMany(
      missingEmails.map((email) => ({
        email,
        name: nameByEmail.get(email) || email.split("@")[0] || email,
        role: "STUDENT",
        departmentId: deptIdByEmail.get(email) ?? departmentId ?? null,
      })),
    )
    for (const [, user] of createdUsers) {
      created.push({ name: user.name, email: user.email, role: "STUDENT" })
      userMap.set(user.email.toLowerCase(), user)
    }
  }

  const subjects = new Map<string, { id: string }>()
  for (const code of [...new Set(rows.map((r) => r.subjectCode))]) {
    const s = await subjectRepository.findByCode(code)
    if (s) subjects.set(code, s)
  }

  const sections = new Map<string, { id: string }>()
  for (const key of [...new Set(rows.map((r) => `${r.sectionName}|${r.sectionProgram}`))]) {
    const [name, program] = key.split("|")
    const s = await sectionRepository.findByNameAndProgram(name, program)
    if (s) sections.set(key, s)
  }

  const uniqueFacultyEmails = [...new Set(rows.filter((r, idx) => r.facultyEmail && !excelInvalidIdx.has(idx)).map((r) => r.facultyEmail!.toLowerCase().trim()))]
  const facultyUserMap = new Map<string, { id: string; name: string }>()
  if (uniqueFacultyEmails.length > 0) {
    const facultyUsers = await userRepository.findManyByEmail(uniqueFacultyEmails)
    for (const [email, user] of facultyUsers) {
      if (user.role.includes("FACULTY") || user.role.includes("DEAN") || user.role.includes("ADMIN")) {
        facultyUserMap.set(email, user)
      }
    }
  }

  // ── Faculty-subject slots: ONE read per chunk, not one per row ──
  //
  // This read used to sit inside the row loop as a per-row
  // findBySubjectSectionAndFaculty, making the loop O(rows) in network latency
  // rather than in work. See faculty-subject.repository.ts:findManyBySubjectSectionIds.
  //
  // Grouping key is (subject_id, section_id, "semesterId") — the columns of
  // UNIQUE(subject_id, section_id, "semesterId") — so a pair holding one row per
  // semester still resolves deterministically. Resolution order is the active
  // semester first, then a legacy null-semester row, matching what the per-row
  // finders returned; another term's mapping is never substituted.
  const slotSubjectIds = [...new Set([...subjects.values()].map((s) => s.id))]
  const slotSectionIds = [...new Set([...sections.values()].map((s) => s.id))]
  const slotRows = await facultySubjectRepository.findManyBySubjectSectionIds(slotSubjectIds, slotSectionIds)
  const slotsByPair = new Map<string, { id: string; faculty_id: string; semesterId?: string | null }[]>()
  for (const row of slotRows) {
    const key = `${row.subject_id}|${row.section_id}`
    const bucket = slotsByPair.get(key)
    if (bucket) bucket.push(row)
    else slotsByPair.set(key, [row])
  }
  const resolveSlot = (subjectId: string, sectionId: string) => {
    const candidates = slotsByPair.get(`${subjectId}|${sectionId}`)
    if (!candidates || candidates.length === 0) return null
    return candidates.find((c) => c.semesterId === semesterId)
      ?? candidates.find((c) => c.semesterId === null)
      ?? null
  }

  const toEnroll: { student_id: string; section_id: string; faculty_subject_id?: string | null; semesterId?: string | null }[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 1
    const sectionLabel = `${r.sectionProgram}-${r.sectionName}`

    const excelOffender = excelOffenderFor(r)
    if (excelOffender) { failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, remark: `Invalid value in ${excelOffender} (Excel error)` }); continue }

    if (!r.email) { failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, remark: "Email is required" }); continue }
    if (!isAllowedStudentEmail(r.email)) { failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, remark: "Email domain not allowed" }); continue }

    const user = userMap.get(r.email.toLowerCase().trim())
    if (!user) { failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, remark: "Student not found" }); continue }

    const subject = subjects.get(r.subjectCode)
    if (!subject) { failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, remark: `Subject "${r.subjectCode}" not found` }); continue }

    const section = sections.get(`${r.sectionName}|${r.sectionProgram}`)
    if (!section) { failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, remark: `Section "${sectionLabel}" not found` }); continue }

    let mapping: { id: string } | null = null
    if (r.facultyEmail) {
      const facEmail = r.facultyEmail.toLowerCase().trim()
      const facUser = facultyUserMap.get(facEmail)
      if (!facUser) {
        failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, remark: `Faculty "${facEmail}" not found` })
        continue
      }
      // One mapping per (subject, section) per semester, so a named faculty row
      // matches exactly when the slot's owner is that faculty.
      const slot = resolveSlot(subject.id, section.id)
      mapping = slot && slot.faculty_id === facUser.id ? { id: slot.id } : null
      if (!mapping) {
        failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, remark: `${facEmail} not assigned to ${r.subjectCode} in ${sectionLabel}` })
        continue
      }
    } else {
      // Blank faculty email: fall back to whatever the slot already holds,
      // including the dummy faculty for an unassigned slot.
      const slot = resolveSlot(subject.id, section.id)
      if (!slot) {
        failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, remark: `No faculty assigned to ${r.subjectCode} in ${sectionLabel}` })
        continue
      }
      mapping = { id: slot.id }
    }

    toEnroll.push({ student_id: user.id, section_id: section.id, faculty_subject_id: mapping.id, semesterId })
    enrolled++
  }

  if (toEnroll.length > 0) {
    const { skipped: dupSkipped } = await studentEnrollmentRepository.addEnrollments(toEnroll)
    skipped = dupSkipped
  }

  const successRows = rows
    .filter((r) => !failed.some((f) => f.email === r.email && f.subjectCode === r.subjectCode && f.section === `${r.sectionProgram}-${r.sectionName}`))
    .map((r) => ({ name: r.name, email: r.email, "subject code": r.subjectCode, section: `${r.sectionProgram}-${r.sectionName}`, "faculty email": r.facultyEmail || "" }))

  const failureRows = failed.map((f) => ({
    name: rows.find((r) => r.email === f.email && r.subjectCode === f.subjectCode)?.name ?? "",
    email: f.email,
    "subject code": f.subjectCode,
    section: f.section,
    remarks: f.remark,
  }))

  return {
    created,
    enrolled,
    skipped,
    failed,
    parseErrors: [],
    successCsv: toCsv(successRows, ["name", "email", "subject code", "section", "faculty email"]),
    failureCsv: toCsv(failureRows, ["name", "email", "subject code", "section", "remarks"]),
    totalRows: rows.length,
  }
}

export function getStudentCsvTemplate(): string {
  const headers = "name, email, subject code, section, faculty email"
  const sample = "Alice Student, alice.student@itmlyceumalabang.onmicrosoft.com, CS101, BSIT-32A3, juan.delacruz@lyceumalabang.edu.ph\nBob Martinez, bob.martinez@itmlyceumalabang.onmicrosoft.com, MATH201, BSCS-21B, maria.santos@lyceumalabang.edu.ph"
  return `${headers}\n${sample}\n`
}
