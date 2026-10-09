import { supabase } from "@/lib/supabase"
import { userRepository, sectionRepository, subjectRepository, facultySubjectRepository, studentEnrollmentRepository, departmentRepository, departmentCourseRepository } from "@/lib/repositories/factory"
import { cleanCell, cleanSubjectCode, isExcelErrorCell } from "@/lib/csv-utils"

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
  skipped: { row: number; email?: string; message: string }[]
  createdSubjects: number
  createdSections: number
  createdDepartments: number
  createdCourses: number
}

export interface DepartmentStepInvalid {
  key: string
  reason: string
}

export interface DepartmentStepResult {
  stepId: "departments"
  status: "done"
  inserted: number
  existing: number
  invalid: DepartmentStepInvalid[]
  deptCodeToId: Record<string, string>
}

export async function importDepartmentsStep(
  items: string[],
): Promise<DepartmentStepResult> {
  const invalid: DepartmentStepInvalid[] = []
  const deptCodeToId: Record<string, string> = {}
  let inserted = 0
  let existing = 0

  const seen = new Set<string>()
  for (const raw of items) {
    const code = (raw ?? "").trim().toUpperCase()
    if (code.length === 0) {
      invalid.push({ key: raw, reason: "Department code is required" })
      continue
    }
    if (seen.has(code)) continue
    seen.add(code)

    const found = await departmentRepository.findByCode(code)
    if (found) {
      deptCodeToId[code] = found.id
      existing++
      continue
    }
    try {
      const created = await departmentRepository.create({ name: code, code })
      deptCodeToId[code] = created.id
      inserted++
    } catch (err) {
      if ((err as { code?: string })?.code !== "23505") throw err
      const raced = await departmentRepository.findByCode(code)
      if (!raced) throw err
      deptCodeToId[code] = raced.id
      existing++
    }
  }

  return { stepId: "departments", status: "done", inserted, existing, invalid, deptCodeToId }
}

// ── Step 3 (courses) ───────────────────────────────────────
// Resolves every (departmentCode, program) pair to a department_course id,
// creating missing courses with a visibly synthetic name. Lookup is always by
// the (departmentId, code) pair — code alone is NOT unique.

export interface CourseStepPair {
  departmentCode: string
  program: string
}

export interface CourseStepResult {
  stepId: "courses"
  status: "done"
  inserted: number
  existing: number
  invalid: DepartmentStepInvalid[]
  programToCourseId: Record<string, string>
}

export async function importCoursesStep(
  pairs: CourseStepPair[],
  deptCodeToId: Record<string, string>,
): Promise<CourseStepResult> {
  const invalid: DepartmentStepInvalid[] = []
  const programToCourseId: Record<string, string> = {}
  let inserted = 0
  let existing = 0

  const seen = new Set<string>()
  for (const raw of pairs) {
    const departmentCode = (raw.departmentCode ?? "").trim().toUpperCase()
    const program = (raw.program ?? "").trim()
    // Blank programs are excluded client-side; never sent. Skip defensively.
    if (program.length === 0) continue
    const key = `${departmentCode}|${program}`
    if (seen.has(key)) continue
    seen.add(key)

    const departmentId = deptCodeToId[departmentCode]
    if (!departmentId) {
      invalid.push({ key: program, reason: `No department for course "${program}"` })
      continue
    }
    const found = await departmentCourseRepository.findByDepartmentAndCode(departmentId, program)
    if (found) {
      // First-writer-wins on collision (documented: 2026-1 file is unambiguous).
      if (programToCourseId[program] === undefined) programToCourseId[program] = found.id
      existing++
      continue
    }
    try {
      const created = await departmentCourseRepository.create({ departmentId, code: program, name: `${program} [unmapped]` })
      if (programToCourseId[program] === undefined) programToCourseId[program] = created.id
      inserted++
    } catch (err) {
      if ((err as { code?: string })?.code !== "23505") throw err
      const raced = await departmentCourseRepository.findByDepartmentAndCode(departmentId, program)
      if (!raced) throw err
      if (programToCourseId[program] === undefined) programToCourseId[program] = raced.id
      existing++
    }
  }

  return { stepId: "courses", status: "done", inserted, existing, invalid, programToCourseId }
}

// ── Step 4 (sections) ──────────────────────────────────────
// Resolves every distinct (name, program) pair to a section id,
// upserting any that do not exist. Sections hang off a course, so a
// missing course becomes a visible invalid rather than a silent drop
// (and never reaches the NOT NULL departmentCourseId insert).

export interface SectionStepItem {
  name: string
  program: string
}

export interface SectionStepResult {
  stepId: "sections"
  status: "done"
  inserted: number
  existing: number
  invalid: DepartmentStepInvalid[]
  sectionKeyToId: Record<string, string>
}

export async function importSectionsStep(
  items: SectionStepItem[],
  programToCourseId: Record<string, string>,
): Promise<SectionStepResult> {
  const invalid: DepartmentStepInvalid[] = []
  const sectionKeyToId: Record<string, string> = {}

  const seen = new Set<string>()
  const sectionItems: { name: string; program: string; departmentCourseId: string }[] = []
  for (const raw of items) {
    const name = (raw.name ?? "").trim()
    const program = (raw.program ?? "").trim()
    const key = `${name}|${program}`
    if (seen.has(key)) continue
    seen.add(key)

    const courseId = programToCourseId[program]
    if (!courseId) {
      invalid.push({
        key: program ? `${program}-${name}` : name,
        reason: `No department course found for program "${program}"`,
      })
      continue
    }
    sectionItems.push({ name, program, departmentCourseId: courseId })
  }

  const { data, created } = await sectionRepository.upsertMany(sectionItems)
  for (const [key, row] of data) {
    sectionKeyToId[key] = row.id
  }

  return {
    stepId: "sections",
    status: "done",
    inserted: created,
    existing: sectionItems.length - created,
    invalid,
    sectionKeyToId,
  }
}

// ── Step 5 (subjects) ──────────────────────────────────────
// Resolves every distinct subject code to a subject id, upserting any
// that do not exist. Subjects carry no FK dependency, so no predecessor
// map is needed — the code itself (NOT NULL UNIQUE) is the key. Client
// sends plain string[]; server applies name = code fallback (2026-1 file
// has blank subjectName on all 28,096 rows, so all 315 fire the fallback).

export interface SubjectStepResult {
  stepId: "subjects"
  status: "done"
  inserted: number
  existing: number
  invalid: DepartmentStepInvalid[]
  subjectCodeToId: Record<string, string>
}

export async function importSubjectsStep(
  items: string[],
): Promise<SubjectStepResult> {
  const invalid: DepartmentStepInvalid[] = []
  const subjectCodeToId: Record<string, string> = {}

  const seen = new Set<string>()
  const distinct: string[] = []
  for (const raw of items) {
    const code = (raw ?? "").trim()
    // Blank codes are filtered client-side per spec (not applicable);
    // skip defensively without an invalid entry.
    if (code.length === 0) continue
    if (seen.has(code)) continue
    seen.add(code)
    distinct.push(code)
  }

  // Must NOT case-fold: cs101 vs CS101 must stay distinct per spec edge case.
  const subjectItems = distinct.map((code) => ({ code, name: code }))

  const { data, created } = await subjectRepository.upsertMany(subjectItems)
  for (const [code, row] of data) {
    subjectCodeToId[code] = row.id
  }

  return {
    stepId: "subjects",
    status: "done",
    inserted: created,
    existing: subjectItems.length - created,
    invalid,
    subjectCodeToId,
  }
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

    const rawEmail = cleanCell(cols[0]).toLowerCase().trim()
    const displayName = cleanCell(cols[1])
    // Slice 1a: blank faculty email maps to the shared dummy instead of erroring.
    // Department still comes from the row for section creation; the dummy user
    // itself stays dept-agnostic (created with undefined departmentId below).
    const email = rawEmail.length === 0 ? DUMMY_FACULTY_EMAIL : rawEmail
    const isUnassignedDummy = email === DUMMY_FACULTY_EMAIL
    const sectionRaw = cleanCell(cols[2])
    const subjectCode = cleanSubjectCode(cols[3])
    const subjectName = cleanCell(cols[4])
    const departmentCode = cleanCell(cols[5]).toUpperCase()
    const { program, name: sectionName } = parseSectionIdentifier(sectionRaw.trim())
    // Seed parity: Excel-error NAME on an unassigned row becomes the placeholder
    // name instead of erroring. All other Excel-error cells stay invalid.
    const effectiveDisplayName =
      isUnassignedDummy && isExcelErrorCell(displayName) ? "Unassigned Faculty" : displayName

    const excelOffender =
      [
        ["faculty email", email],
        ...(!isUnassignedDummy ? [["name", displayName] as [string, string]] : []),
        ["section", sectionRaw],
        ["subject code", subjectCode],
        ["subject name", subjectName],
        ["department code", departmentCode],
      ].find(([, v]) => isExcelErrorCell(v))?.[0] ?? null
    if (excelOffender) {
      errors.push({ row: i + 1, message: `Invalid value in ${excelOffender} (Excel error)` })
      continue
    }

    if (!email.endsWith("@lyceumalabang.edu.ph")) {
      errors.push({ row: i + 1, message: `Email domain not allowed: ${email}` })
      continue
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

    rows.push({ email, name: effectiveDisplayName, subjectCode, subjectName, sectionName, sectionProgram: program, departmentCode })
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
    skipped: [],
    createdSubjects: 0,
    createdSections: 0,
    createdDepartments: 0,
    createdCourses: 0,
  }

  if (rows.length === 0) return result

  // Slice 1a: chunked JSON path bypasses parseFacultySubjectCsv, so normalize
  // blanks here too. Dummy stays dept-agnostic; department still comes from
  // each row for section creation.
  const withEmails = rows.map((r) =>
    (r.email || "").trim().length === 0
      ? { ...r, email: DUMMY_FACULTY_EMAIL, name: r.name?.trim() || "Unassigned Faculty", subjectCode: cleanSubjectCode(r.subjectCode || "") }
      : { ...r, email: r.email.toLowerCase().trim(), subjectCode: cleanSubjectCode(r.subjectCode || "") },
  )
  const effectiveRows = withEmails.map((r) =>
    r.email === DUMMY_FACULTY_EMAIL && isExcelErrorCell((r.name || "").trim())
      ? { ...r, name: "Unassigned Faculty" }
      : r,
  )

  // Defense in depth: chunked JSON bypasses parse, so reject Excel-error cells
  // here before any subject/section/user side-creates.
  const cleanRows: typeof effectiveRows = []
  effectiveRows.forEach((r, idx) => {
    const isDummyRow = r.email === DUMMY_FACULTY_EMAIL
    const offender =
      [
        ["faculty email", r.email],
        ...(!isDummyRow ? [["name", r.name] as [string, string]] : []),
        ["section", `${r.sectionProgram}-${r.sectionName}`],
        ["subject code", r.subjectCode],
        ["subject name", r.subjectName],
        ["department code", r.departmentCode],
      ].find(([, v]) => isExcelErrorCell((v || "").trim()))?.[0] ?? null
    if (offender) {
      result.errors.push({ row: idx + 1, email: r.email, message: `Invalid value in ${offender} (Excel error)` })
      return
    }
    cleanRows.push(r)
  })

  // ── Resolve department codes → ids ──
  const blankDeptCount = cleanRows.filter((r) => r.departmentCode.trim().length === 0).length
  if (blankDeptCount > 0) {
    result.errors.push({ row: 0, message: "Department code is required" })
  }
  const validRows = cleanRows.filter((r) => r.departmentCode.trim().length > 0)

  // Departments root the chain (courses -> sections), so they resolve first. A miss
  // inserts name = code and the row survives. The chunked JSON path bypasses
  // parseFacultySubjectCsv, which rejects blank codes, so blanks are caught above
  // instead of reaching a NOT NULL insert.
  const deptCodeToId = new Map<string, string>()
  for (const code of new Set(validRows.map((r) => r.departmentCode.toUpperCase()))) {
    const existing = await departmentRepository.findByCode(code)
    if (existing) {
      deptCodeToId.set(code, existing.id)
      continue
    }
    try {
      const created = await departmentRepository.create({ name: code, code })
      deptCodeToId.set(code, created.id)
      result.createdDepartments++
    } catch (err) {
      // 281 chunked calls run concurrently - a sibling chunk may have inserted the
      // same code between our read and write. Re-read instead of failing the chunk.
      if ((err as { code?: string })?.code !== "23505") throw err
      const raced = await departmentRepository.findByCode(code)
      if (!raced) throw err
      deptCodeToId.set(code, raced.id)
    }
  }

  // Courses: UNIQUE("departmentId", code) means the code alone is NOT unique, so
  // every lookup and insert goes through the pair. A miss creates a visibly
  // synthetic name so it is easy to find and rename later.
  const courseCodeToId = new Map<string, string>()
  for (const program of new Set(validRows.map((r) => r.sectionProgram).filter((p) => p.length > 0))) {
    const deptCode = validRows.find((r) => r.sectionProgram === program)?.departmentCode.toUpperCase()
    const departmentId = deptCode ? deptCodeToId.get(deptCode) : undefined
    if (!departmentId) continue
    const existing = await departmentCourseRepository.findByDepartmentAndCode(departmentId, program)
    if (existing) {
      courseCodeToId.set(program, existing.id)
      continue
    }
    try {
      const created = await departmentCourseRepository.create({ departmentId, code: program, name: `${program} [unmapped]` })
      courseCodeToId.set(program, created.id)
      result.createdCourses++
    } catch (err) {
      if ((err as { code?: string })?.code !== "23505") throw err
      const raced = await departmentCourseRepository.findByDepartmentAndCode(departmentId, program)
      if (!raced) throw err
      courseCodeToId.set(program, raced.id)
    }
  }

  // ── Upsert sections ──
  const sectionKeys = new Set<string>()
  const sectionItems: { name: string; program: string; departmentCourseId: string }[] = []

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

  // Subjects have no FK dependency, so they upsert safely at this point in the
  // precedence order.
  const uniqueSubjectCodes = [...new Set(validRows.map((r) => r.subjectCode))]
  const subjectItems = uniqueSubjectCodes.map((code) => {
    const row = validRows.find((r) => r.subjectCode === code)
    return { code, name: row?.subjectName || code }
  })
  const { data: subjects, created: createdSubjects } = await subjectRepository.upsertMany(subjectItems)
  result.createdSubjects = createdSubjects

  // ── Resolve users (batch lookup + batch create; wrong uploads never become users) ──
  const mappableRows = validRows.filter((r) => r.email.length > 0 && r.email.endsWith("@lyceumalabang.edu.ph"))
  const uniqueEmails = [...new Set(mappableRows.map((r) => r.email.toLowerCase().trim()))]
  const userMap = await userRepository.findManyByEmail(uniqueEmails)
  const missingEmails = uniqueEmails.filter((e) => !userMap.has(e))
  if (missingEmails.length > 0) {
    const createdUsers = await userRepository.createMany(
      missingEmails.map((email) => {
        const row = mappableRows.find((r) => r.email.toLowerCase().trim() === email)
        const isPlaceholder = email === DUMMY_FACULTY_EMAIL
        // Dummy stays dept-agnostic (null) so it never inflates one department's filter.
        const deptId = isPlaceholder ? undefined : (row ? deptCodeToId.get(row.departmentCode) ?? undefined : undefined)
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
  const fsItems: { faculty_id: string; subject_id: string; section_id: string; semesterId?: string | null; rowNum: number; email: string }[] = []
  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i]
    const rowNum = i + 1

    if (!row.email.endsWith("@lyceumalabang.edu.ph")) { result.errors.push({ row: rowNum, email: row.email, message: "Email domain not allowed" }); continue }

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

    fsItems.push({ faculty_id: user.id, subject_id: subject.id, section_id: section.id, semesterId, rowNum, email: row.email })
    result.matched++
  }

  // ── Additive insert per chunk (chunk-safe: never deletes prior chunks) ──
  // Dedup within this chunk (real wins over dummy for the same slot), then insert
  // ignoring UNIQUE(subject, section, semester) repeats so re-runs are no-ops.
  // On conflict: dummy-owned slot + real incoming → update (auto-overwrite);
  // same owner → no-op; real-owned + different incoming (or dummy over real) →
  // error, never overwrite.
  const dummyId = userMap.get(DUMMY_FACULTY_EMAIL)?.id
  // One batch fetch of existing slots for this semester instead of a per-row
  // findBySubjectSectionSemester lookup on every 23505 (that made chunk
  // requests time out on mostly-already-loaded files).
  const existingSlots = semesterId
    ? await facultySubjectRepository.list({ semesterId })
    : await facultySubjectRepository.list()
  const existingByCombo = new Map<string, { id: string; faculty_id: string }>()
  for (const e of existingSlots) {
    if (!semesterId && e.semesterId) continue
    existingByCombo.set(`${e.subject_id}|${e.section_id}|${e.semesterId ?? ""}`, { id: e.id, faculty_id: e.faculty_id })
  }
  const comboMap = new Map<string, { faculty_id: string; subject_id: string; section_id: string; semesterId?: string | null; rowNum: number; email: string }>()
  for (const item of fsItems) {
    const key = `${item.subject_id}|${item.section_id}|${item.semesterId ?? ""}`
    const prev = comboMap.get(key)
    if (!prev) {
      comboMap.set(key, item)
    } else if (dummyId && prev.faculty_id === dummyId && item.faculty_id !== dummyId) {
      comboMap.set(key, item)
    }
  }
  const uniqueItems = [...comboMap.values()]

  for (const item of uniqueItems) {
    try {
      await facultySubjectRepository.create({
        faculty_id: item.faculty_id,
        subject_id: item.subject_id,
        section_id: item.section_id,
        semesterId: item.semesterId ?? null,
      })
    } catch (err) {
      if ((err as { code?: string })?.code !== "23505") throw err
      const existing = existingByCombo.get(`${item.subject_id}|${item.section_id}|${item.semesterId ?? ""}`)
      if (!existing) continue
      if (existing.faculty_id === item.faculty_id) {
        result.skipped.push({ row: item.rowNum, email: item.email, message: "Already loaded — skipped" })
        result.matched--
        continue
      }
      if (existing.faculty_id === dummyId && item.faculty_id !== dummyId) {
        await facultySubjectRepository.update(existing.id, { faculty_id: item.faculty_id })
        existingByCombo.set(`${item.subject_id}|${item.section_id}|${item.semesterId ?? ""}`, { id: existing.id, faculty_id: item.faculty_id })
        continue
      }
      result.errors.push({
        row: item.rowNum,
        email: item.email,
        message: "Already assigned — not overwritten (existing load kept)",
      })
      result.matched--
    }
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
  semesterId?: string | null,
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
