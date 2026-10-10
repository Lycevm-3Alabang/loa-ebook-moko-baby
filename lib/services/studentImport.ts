import { userRepository, sectionRepository, subjectRepository, facultySubjectRepository, studentEnrollmentRepository } from "@/lib/repositories/factory"
import { isExcelErrorCell, isAllowedStudentEmail, STUDENT_ALLOWED_DOMAINS, reasonRemarks, type ImportReasonCode } from "@/lib/csv-utils"

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
  // Rows this call actually WROTE, as the repository reports them — distinct from
  // `enrolled`, which counts rows RESOLVED (including ones the database already
  // held). A re-run reads enrolled > 0 with inserted === 0.
  inserted: number
  skipped: number
  failed: { row: number; email: string; subjectCode: string; section: string; remark: string; reasonCode: ImportReasonCode }[]
  // Rows the file repeated: same (student, subject, section) as an earlier row in
  // this same request. Counted in `skipped`, never inserted twice. Distinguished
  // from ALREADY_PERSISTED (already in the database) by DUPLICATE_IN_FILE
  // (already in THIS file) — different statements, different ledger rows.
  duplicateRows: { row: number; email: string; subjectCode: string; section: string; reasonCode: ImportReasonCode; remark: string }[]
  // Keys the repository found already in the database for (student,
  // faculty_subject, semester). The enrollment exists — a re-run of a completed
  // file reads entirely of these. Joined back to source rows by the same key the
  // repo dedupes on, so no new query and no client-side id mapping.
  alreadyPersisted: { row: number; email: string; subjectCode: string; section: string; reasonCode: ImportReasonCode }[]
  // Set when the faculty mappings this chunk needs are attached to a semester other
  // than the active one — typically because a new term was activated without
  // re-importing the faculty CSV. Without this the symptom is every row failing
  // with "not assigned to X in Y", which reads like bad data. Never null when the
  // mappings resolve normally.
  termMismatch: { mappedTerms: string[]; activeTerm: string | null } | null
  parseErrors: { row: number; message: string }[]
  totalRows: number
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
    return { created, enrolled, inserted: 0, skipped, failed, duplicateRows: [], alreadyPersisted: [], termMismatch: null, parseErrors: [], totalRows: 0 }
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

  // ── Term mismatch: mappings live under a semester that is not the active one ──
  //
  // faculty_subjects keeps its semesterId forever. Activating a new term deactivates
  // the old one but never re-stamps its mappings, so the mappings a student import
  // needs can all be attached to a now-inactive term. resolveSlot deliberately
  // refuses to substitute another term's mapping, so every row would then fail with
  // "not assigned to X in Y" — which reads like bad CSV data, and sends an admin
  // hunting for typos that do not exist.
  //
  // Detect it from the rows already fetched, and say so. A null-semester row is NOT
  // a mismatch: resolveSlot falls back to those, so they still work.
  const mappedTerms = [...new Set(slotRows.map((r) => r.semesterId ?? ""))]
    .filter((t) => t !== semesterId && t !== "")
  const termMismatch = slotRows.length > 0 && mappedTerms.length > 0
    ? { mappedTerms, activeTerm: semesterId }
    : null

  const toEnroll: { student_id: string; section_id: string; faculty_subject_id?: string | null; semesterId?: string | null }[] = []
  // Dedupe within this request: the CSV may repeat a row, and one multi-row INSERT
  // cannot contain two copies of the same (student, faculty_subject, semester).
  const seenEnrollments = new Set<string>()
  const duplicateRows: StudentImportResult["duplicateRows"] = []
  // Enrollment key → the source row that first produced it. The repository
  // reports already-present keys as bare ids; this map turns them back into
  // ledger rows without a second query.
  const enrollmentRow = new Map<string, { row: number; email: string; subjectCode: string; section: string }>()

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 1
    const sectionLabel = `${r.sectionProgram}-${r.sectionName}`

    const excelOffender = excelOffenderFor(r)
    if (excelOffender) { failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, reasonCode: "EXCEL_ERROR_CELL", remark: reasonRemarks("EXCEL_ERROR_CELL", { column: excelOffender }) }); continue }

    if (!r.email) { failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, reasonCode: "EMAIL_BLANK", remark: reasonRemarks("EMAIL_BLANK") }); continue }
    if (!isAllowedStudentEmail(r.email)) { failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, reasonCode: "EMAIL_DOMAIN_NOT_ALLOWED", remark: reasonRemarks("EMAIL_DOMAIN_NOT_ALLOWED") }); continue }

    const user = userMap.get(r.email.toLowerCase().trim())
    if (!user) { failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, reasonCode: "STUDENT_NOT_FOUND", remark: reasonRemarks("STUDENT_NOT_FOUND") }); continue }

    const subject = subjects.get(r.subjectCode)
    if (!subject) { failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, reasonCode: "SUBJECT_NOT_FOUND", remark: reasonRemarks("SUBJECT_NOT_FOUND", { code: r.subjectCode }) }); continue }

    const section = sections.get(`${r.sectionName}|${r.sectionProgram}`)
    if (!section) { failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, reasonCode: "SECTION_NOT_FOUND", remark: reasonRemarks("SECTION_NOT_FOUND", { section: sectionLabel }) }); continue }

    let mapping: { id: string } | null = null
    if (r.facultyEmail) {
      const facEmail = r.facultyEmail.toLowerCase().trim()
      const facUser = facultyUserMap.get(facEmail)
      if (!facUser) {
        failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, reasonCode: "FACULTY_NOT_FOUND", remark: reasonRemarks("FACULTY_NOT_FOUND", { email: facEmail }) })
        continue
      }
      // One mapping per (subject, section) per semester, so a named faculty row
      // matches exactly when the slot's owner is that faculty.
      const slot = resolveSlot(subject.id, section.id)
      mapping = slot && slot.faculty_id === facUser.id ? { id: slot.id } : null
      if (!mapping) {
        failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, reasonCode: "FACULTY_NOT_ASSIGNED", remark: reasonRemarks("FACULTY_NOT_ASSIGNED", { email: facEmail, subject: r.subjectCode, section: sectionLabel }) })
        continue
      }
    } else {
      // Blank faculty email: fall back to whatever the slot already holds,
      // including the dummy faculty for an unassigned slot.
      const slot = resolveSlot(subject.id, section.id)
      if (!slot) {
        failed.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, reasonCode: "NO_FACULTY_ASSIGNED", remark: reasonRemarks("NO_FACULTY_ASSIGNED", { subject: r.subjectCode, section: sectionLabel }) })
        continue
      }
      mapping = { id: slot.id }
    }

    // An enrollment's identity is (student, faculty_subject, semester) — the
    // columns of student_enrollments_student_id_faculty_subject_id_key. The
    // faculty_subject already pins (subject, section, semester), and
    // faculty_subjects is UNIQUE(subject, section, semester), so the CSV's
    // (student, subject code, section) triple plus the active semester IS the key.
    //
    // The 2026-1 student CSV contains 5,162 redundant rows out of 28,096 —
    // 4,208 (student, subject, section, faculty) tuples appearing more than once,
    // with zero cases of the same triple carrying a different faculty. Without
    // this dedupe, a chunk holding a redundant tuple twice puts two copies of the
    // same key into ONE multi-row INSERT; Postgres checks the unique index per
    // row, so the second copy raises 23505 and the whole chunk's insert rolls back.
    const enrollmentKey = `${user.id}|${mapping.id}|${semesterId ?? ""}`
    if (seenEnrollments.has(enrollmentKey)) {
      const first = enrollmentRow.get(enrollmentKey)?.row ?? rowNum
      duplicateRows.push({ row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel, reasonCode: "DUPLICATE_IN_FILE", remark: reasonRemarks("DUPLICATE_IN_FILE", { row: String(first) }) })
      continue
    }
    seenEnrollments.add(enrollmentKey)
    enrollmentRow.set(enrollmentKey, { row: rowNum, email: r.email, subjectCode: r.subjectCode, section: sectionLabel })

    toEnroll.push({ student_id: user.id, section_id: section.id, faculty_subject_id: mapping.id, semesterId })
    enrolled++
  }

  const alreadyPersisted: StudentImportResult["alreadyPersisted"] = []
  // Rows this call actually wrote, as the repository reports them — 0 when the
  // insert never ran (every row failed) or wrote nothing.
  let inserted = 0
  if (toEnroll.length > 0) {
    // The repo returns which keys were ALREADY in the database as bare ids —
    // join them back to source rows so the ledger can say which rows a re-run
    // skipped as persisted, distinct from rows this file repeated.
    const { inserted: wroteRows, skipped: dupSkipped, skippedItems } = await studentEnrollmentRepository.addEnrollments(toEnroll)
    inserted = wroteRows
    skipped = dupSkipped
    for (const s of skippedItems) {
      const origin = enrollmentRow.get(`${s.student_id}|${s.faculty_subject_id ?? ""}|${semesterId ?? ""}`)
      if (origin) alreadyPersisted.push({ ...origin, reasonCode: "ALREADY_PERSISTED" })
    }
  }
  // In-file duplicates are not persisted either, so they must still be accounted
  // for — the client reconciles every preview row against enrolled + skipped +
  // failed. The ledger (D3) now carries them as DUPLICATE_IN_FILE rows.
  skipped += duplicateRows.length

  return {
    created,
    enrolled,
    skipped,
    failed,
    duplicateRows,
    alreadyPersisted,
    inserted,
    termMismatch,
    parseErrors: [],
    totalRows: rows.length,
  }
}

export function getStudentCsvTemplate(): string {
  const headers = "name, email, subject code, section, faculty email"
  const sample = "Alice Student, alice.student@itmlyceumalabang.onmicrosoft.com, CS101, BSIT-32A3, juan.delacruz@lyceumalabang.edu.ph\nBob Martinez, bob.martinez@itmlyceumalabang.onmicrosoft.com, MATH201, BSCS-21B, maria.santos@lyceumalabang.edu.ph"
  return `${headers}\n${sample}\n`
}
