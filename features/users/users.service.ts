import { userRepository, departmentRepository, departmentCourseRepository } from "@/lib/repositories/factory"
import type { UserData } from "@/lib/types"

export async function softDeleteUser(id: string): Promise<void> {
  const user = await userRepository.findById(id)
  if (!user) throw new Error("User not found")
  if (user.deletedAt) throw new Error("User is already deleted")
  await userRepository.softDelete(id)
}

export async function restoreUser(id: string): Promise<void> {
  const user = await userRepository.findById(id)
  if (!user) throw new Error("User not found")
  if (!user.deletedAt) throw new Error("User is not deleted")
  await userRepository.restore(id)
}

export async function permanentDeleteUser(id: string): Promise<void> {
  const user = await userRepository.findById(id)
  if (!user) throw new Error("User not found")
  if (!user.deletedAt) throw new Error("User must be soft-deleted first before permanent deletion")
  await userRepository.permanentDelete(id)
}

export async function listDeletedUsers(): Promise<UserData[]> {
  return userRepository.listDeleted()
}

// ── Bulk User ETL ─────────────────────────────────────────

export interface BulkUserRow {
  name: string
  email: string
  role: string
  department: string
  program?: string
  employeeNo?: string
}

export interface BulkPreviewRow {
  row: number
  name: string
  email: string
  role: string
  department: string
  program: string
  employeeNo: string
  exists: boolean
  existingName: string | null
  invalidDept: boolean
  invalidProgram: boolean
  departmentId: string | null
  errors: string[]
}

export interface BulkPreviewResponse {
  rows: BulkPreviewRow[]
  validCount: number
  totalRows: number
}

export interface BulkFailureRow {
  name: string
  email: string
  role: string
  department: string
  program: string
  employeeNo: string
  remark: string
}

export interface BulkUpsertResponse {
  created: number
  updated: number
  failed: number
  failures: BulkFailureRow[]
  successCsv: string
}

const STUDENT_DOMAIN = "itmlyceumalabang.onmicrosoft.com"
const FACULTY_DOMAIN = "lyceumalabang.edu.ph"

function validateEmailDomain(email: string, role: string): string | null {
  const lower = email.toLowerCase()
  const roles = new Set(role.split("|").map((r) => r.trim().toUpperCase()))

  const hasFaculty = roles.has("FACULTY") || roles.has("DEAN")
  const hasStudent = roles.has("STUDENT")

  if (hasFaculty && !lower.endsWith(`@${FACULTY_DOMAIN}`)) {
    return `Email must end with @${FACULTY_DOMAIN} for ${roles.has("DEAN") ? "DEAN" : "FACULTY"} role`
  }
  if (hasStudent && !hasFaculty && !lower.endsWith(`@${STUDENT_DOMAIN}`)) {
    return `Email must end with @${STUDENT_DOMAIN} for STUDENT role`
  }

  return null
}

async function fetchDepartmentMap(): Promise<Map<string, string>> {
  const departments = await departmentRepository.listAll()
  const map = new Map<string, string>()
  for (const d of departments) {
    map.set(d.code.toUpperCase(), d.id)
  }
  return map
}

interface CourseMapEntry {
  code: string
  departmentId: string
  courseName: string
}

async function fetchCourseMap(): Promise<Map<string, CourseMapEntry>> {
  const courses = await departmentCourseRepository.findAll()
  const map = new Map<string, CourseMapEntry>()
  for (const c of courses) {
    const code = c.code.toUpperCase()
    if (!map.has(code)) {
      map.set(code, { code: c.code, departmentId: c.departmentId, courseName: c.name })
    }
  }
  return map
}

export async function bulkPreviewUsers(
  rows: BulkUserRow[],
): Promise<BulkPreviewResponse> {
  const deptMap = await fetchDepartmentMap()
  const courseMap = await fetchCourseMap()
  const emails = rows.map((r) => r.email.toLowerCase().trim())
  const existingUsers = await userRepository.findManyByEmail(emails)

  const previewRows: BulkPreviewRow[] = rows.map((r, i) => {
    const email = r.email.toLowerCase().trim()
    const existing = existingUsers.get(email)
    const deptCode = r.department?.trim().toUpperCase()
    const deptId = deptCode ? deptMap.get(deptCode) ?? null : null
    const progCode = r.program?.trim().toUpperCase()
    const course = progCode ? courseMap.get(progCode) ?? null : null
    const isStudent = r.role?.toUpperCase().includes("STUDENT")
    const errors: string[] = []

    if (!r.name?.trim()) errors.push("Name is required")
    if (!email) errors.push("Email is required")
    else if (!email.includes("@")) errors.push("Invalid email format")
    if (!r.role?.trim()) errors.push("Role is required")
    if (r.role?.trim()) {
      const domainErr = validateEmailDomain(email, r.role)
      if (domainErr) errors.push(domainErr)
    }

    let invalidDept = !deptCode || !deptId
    let invalidProgram = false

    if (!deptCode || !deptId) {
      errors.push("Department code not found")
    }
    if (isStudent) {
      if (!progCode) {
        errors.push("Program is required for STUDENT")
      } else if (!course) {
        invalidDept = true
        invalidProgram = true
        errors.push(`Program code "${progCode}" not found`)
      } else if (deptId && course.departmentId !== deptId) {
        invalidDept = true
        invalidProgram = true
        errors.push("Department and program do not match")
      }
    }

    return {
      row: i + 1,
      name: r.name,
      email,
      role: r.role,
      department: r.department || "",
      program: r.program || "",
      employeeNo: r.employeeNo || "",
      exists: !!existing,
      existingName: existing?.name || null,
      invalidDept,
      invalidProgram,
      departmentId: deptId,
      errors,
    }
  })

  const validCount = previewRows.filter((r) => r.errors.length === 0).length
  return { rows: previewRows, validCount, totalRows: rows.length }
}

export async function bulkUpsertUsers(
  rows: BulkUserRow[],
): Promise<BulkUpsertResponse> {
  console.log(`[bulkUpsertUsers] Starting with ${rows.length} rows`)
  const deptMap = await fetchDepartmentMap()
  console.log(`[bulkUpsertUsers] deptMap loaded: ${deptMap.size} entries`)
  const courseMap = await fetchCourseMap()
  console.log(`[bulkUpsertUsers] courseMap loaded: ${courseMap.size} entries`)
  const emails = rows.map((r) => r.email.toLowerCase().trim())
  console.log(`[bulkUpsertUsers] Unique emails: ${new Set(emails).size}`)
  const existingUsers = await userRepository.findManyByEmail(emails)
  console.log(`[bulkUpsertUsers] findManyByEmail returned: ${existingUsers.size} existing users`)

  const failures: BulkFailureRow[] = []
  let created = 0
  let updated = 0
  const seenEmails = new Set<string>()

  const toCreate: {
    email: string
    name: string
    role: string
    departmentId?: string
    course?: string
    employeeNo?: string
  }[] = []

  const toUpdate: {
    existingId: string
    email: string
    name: string
    role: string
    departmentId?: string
    course?: string
    employeeNo?: string
  }[] = []

  for (const r of rows) {
    const email = r.email.toLowerCase().trim()
    const deptCode = r.department?.trim().toUpperCase()
    const deptId = deptCode ? deptMap.get(deptCode) ?? undefined : undefined
    const progCode = r.program?.trim().toUpperCase()
    const course = progCode ? courseMap.get(progCode) ?? undefined : undefined
    const isStudent = r.role?.toUpperCase().includes("STUDENT")
    const errors: string[] = []

    if (!r.name?.trim()) errors.push("Name is required")
    if (!email) errors.push("Email is required")
    else if (!email.includes("@")) errors.push("Invalid email format")
    if (!r.role?.trim()) errors.push("Role is required")
    if (r.role?.trim()) {
      const domainErr = validateEmailDomain(email, r.role)
      if (domainErr) errors.push(domainErr)
    }
    if (!deptCode || !deptId) errors.push("Department code not found")
    if (isStudent) {
      if (!progCode) errors.push("Program is required for STUDENT")
      else if (!course) errors.push(`Program code "${progCode}" not found`)
      else if (deptId && course.departmentId !== deptId) errors.push("Department and program do not match")
    }

    if (errors.length > 0) {
      failures.push({
        name: r.name,
        email,
        role: r.role,
        department: r.department || "",
        program: r.program || "",
        employeeNo: r.employeeNo || "",
        remark: errors.join("; "),
      })
      continue
    }

    if (seenEmails.has(email)) {
      failures.push({
        name: r.name,
        email,
        role: r.role,
        department: r.department || "",
        program: r.program || "",
        employeeNo: r.employeeNo || "",
        remark: `Duplicate email in import file: ${email}`,
      })
      continue
    }
    seenEmails.add(email)

    const existing = existingUsers.get(email)
    const base = {
      email,
      name: r.name.trim(),
      role: r.role,
      departmentId: deptId,
      course: course?.code || progCode || undefined,
      employeeNo: r.employeeNo?.trim() || undefined,
    }

    if (existing) {
      toUpdate.push({ existingId: existing.id, ...base })
    } else {
      toCreate.push(base)
    }
  }

  console.log(`[bulkUpsertUsers] Validation done: ${toCreate.length} to create, ${toUpdate.length} to update, ${failures.length} validation failures`)

  let createdUsers: Map<string, UserData> = new Map()
  let createFailures: string[] = []

  if (toCreate.length > 0) {
    console.log(`[bulkUpsertUsers] Calling createMany with ${toCreate.length} users...`)
    const result = await userRepository.createMany(toCreate)
    console.log(`[bulkUpsertUsers] createMany returned: ${result.created.size} created, ${result.failures.length} failures`)
    createdUsers = result.created
    createFailures = result.failures
  }
  created = createdUsers.size
  for (const email of createFailures) {
      const input = toCreate.find((i) => i.email.toLowerCase().trim() === email.toLowerCase().trim())
      if (input) {
        failures.push({
          name: input.name,
          email: input.email,
          role: input.role,
          department: input.departmentId || "",
          program: input.course || "",
          employeeNo: input.employeeNo || "",
          remark: "Failed to create user",
         })
       }
   }

   for (const u of toUpdate) {
    try {
      await userRepository.update(u.existingId, {
        name: u.name,
        role: u.role,
        departmentId: u.departmentId,
        course: u.course,
        employeeNo: u.employeeNo,
      })
      updated++
    } catch (_err) {
      failures.push({
        name: u.name,
        email: u.email,
        role: u.role,
        department: u.departmentId || "",
        program: u.course || "",
        employeeNo: u.employeeNo || "",
        remark: "Failed to update user",
      })
    }
  }

  const createdEmails = new Set(createdUsers.keys())

  const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`
  const successRows: { email: string; action: string }[] = []
  for (const email of createdEmails) {
    successRows.push({ email, action: "created" })
  }
  for (const u of toUpdate) {
    successRows.push({ email: u.email, action: "updated" })
  }

  const successCsv = [
    "email,action",
    ...successRows.map((r) => `${csvCell(r.email)},${r.action}`),
  ].join("\n")

  return {
    created,
    updated,
    failed: failures.length,
    failures,
    successCsv,
  }
}
