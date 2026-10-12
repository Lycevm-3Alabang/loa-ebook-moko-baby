import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireRole } from "@/lib/route-guard"
import { parseStudentCsv, importStudents, ensureStudentUsers, enrollStudentRows, getStudentCsvTemplate } from "@/lib/services/studentImport"
import { logAuditEvent } from "@/lib/services/audit"
import { departmentRepository, semesterRepository } from "@/lib/repositories/factory"

// Chunked ETL: chunks insert hundreds of rows per request; allow a long
// execution window on platforms that cap serverless run time.
export const maxDuration = 60

export async function GET() {
  const csv = getStudentCsvTemplate()
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="import_students_template.csv"',
    },
  })
}

export async function POST(request: NextRequest) {
  const authErr = await requireRole(request, ["ADMIN", "DEAN", "FACULTY"])
  if (authErr) return authErr

  // semesterId is load-bearing: findExisting matches it exactly, so a null or stale
  // value produces rows the evaluation gate rejects. Derive it server-side.
  const activeSemesters = await semesterRepository.list({ isActive: true })
  if (activeSemesters.length === 0) {
    return NextResponse.json(
      { error: "No active semester. Set one as active before importing." },
      { status: 400 },
    )
  }
  if (activeSemesters.length > 1) {
    return NextResponse.json(
      { error: "More than one semester is active. Deactivate all but one before importing." },
      { status: 400 },
    )
  }
  const semesterId = activeSemesters[0].id

  const session = await auth()

  let importRows: { email: string; name: string; subjectCode: string; sectionName: string; sectionProgram: string; facultyEmail?: string }[]
  let parseErrors: { row: number; message: string }[] = []
  let departmentId: string | null = null
  let chunkIndex = 0
  let totalChunks = 1
  let fileId: string | undefined = undefined
  let isLast = true
  let mode: string | undefined = undefined
  let step1Note = ""
  let ensureItems: { email: string; name: string; departmentId?: string | null }[] | undefined = undefined

  const contentType = request.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    const body = await request.json()
    const { departmentId: bodyDeptId = null } = body
    chunkIndex = typeof body.chunkIndex === "number" ? body.chunkIndex : 0
    totalChunks = typeof body.totalChunks === "number" ? body.totalChunks : 1
    fileId = typeof body.fileId === "string" ? body.fileId : undefined
    isLast = body.isLast !== false
    mode = typeof body.mode === "string" ? body.mode : undefined
    const step1Raw = typeof body.step1 === "string" ? body.step1 : ""
    step1Note = step1Raw === "skipped"
      ? "; Step 1 skipped — students assumed registered"
      : step1Raw === "done"
        ? "; Step 1 done"
        : ""
    if (bodyDeptId) {
      const dept = await departmentRepository.findById(bodyDeptId)
      if (dept) departmentId = bodyDeptId
    }
    if (mode === "ensure") {
      const rawItems = body.items as { email: string; name?: string; departmentId?: string | null }[] | undefined
      if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
        return NextResponse.json({ error: "Items array is required" }, { status: 400 })
      }
      ensureItems = rawItems.map((r) => ({
        email: (r.email || "").toLowerCase().trim(),
        name: r.name || "",
        departmentId: r.departmentId ?? undefined,
      }))
      importRows = []
    } else {
      const rawRows = body.rows as { email: string; name?: string; subjectCode: string; section: string; facultyEmail?: string; departmentId?: string }[] | undefined
      if (!rawRows || !Array.isArray(rawRows) || rawRows.length === 0) {
        return NextResponse.json({ error: "Rows array is required" }, { status: 400 })
      }
      importRows = rawRows.map((r) => {
        const idx = (r.section || "").indexOf("-")
        const program = idx === -1 ? "" : r.section.slice(0, idx).trim()
        const sectionName = idx === -1 ? r.section.trim() : r.section.slice(idx + 1).trim()
        return {
          email: r.email.toLowerCase().trim(),
          name: r.name || "",
          subjectCode: r.subjectCode.trim(),
          sectionName,
          sectionProgram: program,
          facultyEmail: r.facultyEmail?.toLowerCase().trim() || undefined,
          departmentId: r.departmentId || undefined,
        }
      })
    }
  } else {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "CSV file is required" }, { status: 400 })
    }
    const deptId = formData.get("departmentId") as string | null
    if (deptId) {
      const dept = await departmentRepository.findById(deptId)
      if (dept) departmentId = dept.id
    }

    const text = await file.text()
    const parsed = parseStudentCsv(text)
    if (parsed.headerError) {
      return NextResponse.json({ error: `Header mismatch: ${parsed.headerError}` }, { status: 400 })
    }
    if (parsed.errors.length > 0 && parsed.rows.length === 0) {
      return NextResponse.json({ error: "CSV parsing failed", details: parsed.errors }, { status: 400 })
    }
    importRows = parsed.rows
    parseErrors = parsed.errors
  }

  if (mode === "ensure") {
    const ensured = await ensureStudentUsers(ensureItems ?? [], departmentId)
    await logAuditEvent({
      userId: (session!.user as Record<string, unknown>).id as string,
      action: "IMPORT_STUDENTS_ENSURE",
      details: fileId
        ? `Ensured users (file ${fileId}): ${ensured.created.length} created, ${ensured.existing} existing, ${ensured.failed.length} failed`
        : `Ensured users: ${ensured.created.length} created, ${ensured.existing} existing, ${ensured.failed.length} failed`,
    })
    const ensuredPublic = { created: ensured.created, existing: ensured.existing, failed: ensured.failed }
    return NextResponse.json({ ...ensuredPublic, semesterId, semesterTitle: activeSemesters[0].title, fileId })
  }

  const result = mode === "enroll"
    ? await enrollStudentRows(importRows, departmentId, semesterId)
    : await importStudents(importRows, departmentId, semesterId)
  result.parseErrors = parseErrors
  result.semesterTitle = activeSemesters[0].title

  if (isLast) {
    await logAuditEvent({
      userId: (session!.user as Record<string, unknown>).id as string,
      action: mode === "enroll" ? "IMPORT_STUDENTS_ENROLL" : "IMPORT_STUDENTS",
      details: fileId
        ? `Imported chunk ${chunkIndex + 1}/${totalChunks} (file ${fileId}): ${result.enrolled} enrollments (${result.failed.length} failed, ${result.parseErrors.length} parse errors)${step1Note}`
        : `Imported ${result.enrolled} enrollments (${result.failed.length} failed, ${result.parseErrors.length} parse errors)${step1Note}`,
    })
  }

  return NextResponse.json({ ...result, chunkIndex, totalChunks, fileId, isLast })
}
