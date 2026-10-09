import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/route-guard"
import { parseFacultySubjectCsv, importFacultySubjects, importDepartmentsStep, importCoursesStep, importSectionsStep, importSubjectsStep, importFacultyUsersStep, importMappingsStep } from "@/lib/services/etlEvaluation"
import { logAuditEvent } from "@/lib/services/audit"

// Chunked ETL: chunks insert hundreds of rows per request; allow a long
// execution window on platforms that cap serverless run time.
export const maxDuration = 60

function parseSectionIdentifier(raw: string): { name: string; program: string } {
  const dashIdx = raw.indexOf("-")
  const spaceIdx = raw.indexOf(" ")
  const idx = dashIdx !== -1 ? dashIdx : spaceIdx
  if (idx === -1) return { name: raw, program: "" }
  return { program: raw.slice(0, idx).trim(), name: raw.slice(idx + 1).trim() }
}

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()

  let importRows: { email: string; name: string; subjectCode: string; subjectName: string; sectionName: string; sectionProgram: string; departmentCode: string }[]
  let parseErrors: { row: number; message: string }[] = []
  let semesterId: string | null = null
  let chunkIndex = 0
  let totalChunks = 1
  let fileId: string | undefined = undefined
  let isLast = true

  const contentType = request.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    const body = await request.json()
    semesterId = body.semesterId || null
    chunkIndex = typeof body.chunkIndex === "number" ? body.chunkIndex : 0
    totalChunks = typeof body.totalChunks === "number" ? body.totalChunks : 1
    fileId = typeof body.fileId === "string" ? body.fileId : undefined
    isLast = body.isLast !== false
    if (body.step === "departments") {
      const items = body.items as unknown
      if (!Array.isArray(items)) {
        return NextResponse.json({ error: "Items array is required" }, { status: 400 })
      }
      const stepResult = await importDepartmentsStep(items.map((v) => String(v ?? "")))
      await logAuditEvent({
        userId: (session!.user as Record<string, unknown>).id as string,
        action: "ETL_FACULTY_SUBJECT",
        details: fileId
          ? `Step departments (file ${fileId}): ${stepResult.inserted} inserted, ${stepResult.existing} existing (${stepResult.invalid.length} invalid)`
          : `Step departments: ${stepResult.inserted} inserted, ${stepResult.existing} existing (${stepResult.invalid.length} invalid)`,
      })
      return NextResponse.json({ ...stepResult, fileId })
    }
    if (body.step === "courses") {
      const pairs = body.pairs as unknown
      if (!Array.isArray(pairs)) {
        return NextResponse.json({ error: "Pairs array is required" }, { status: 400 })
      }
      // deptCodeToId travels client-held: the client sends back the map the
      // departments step returned. No server session, same model as items.
      const deptCodeToId = (body.deptCodeToId ?? {}) as Record<string, string>
      const stepResult = await importCoursesStep(
        pairs.map((p) => ({
          departmentCode: String((p as { departmentCode?: unknown })?.departmentCode ?? ""),
          program: String((p as { program?: unknown })?.program ?? ""),
        })),
        deptCodeToId,
      )
      await logAuditEvent({
        userId: (session!.user as Record<string, unknown>).id as string,
        action: "ETL_FACULTY_SUBJECT",
        details: fileId
          ? `Step courses (file ${fileId}): ${stepResult.inserted} inserted, ${stepResult.existing} existing (${stepResult.invalid.length} invalid)`
          : `Step courses: ${stepResult.inserted} inserted, ${stepResult.existing} existing (${stepResult.invalid.length} invalid)`,
      })
      return NextResponse.json({ ...stepResult, fileId })
    }
    if (body.step === "sections") {
      const items = body.items as unknown
      if (!Array.isArray(items)) {
        return NextResponse.json({ error: "Items array is required" }, { status: 400 })
      }
      // programToCourseId travels client-held: the client sends back the map
      // the courses step returned. No server session, same model as deptCodeToId.
      const programToCourseId = (body.programToCourseId ?? {}) as Record<string, string>
      const stepResult = await importSectionsStep(
        items.map((v) => ({
          name: String((v as { name?: unknown })?.name ?? ""),
          program: String((v as { program?: unknown })?.program ?? ""),
        })),
        programToCourseId,
      )
      await logAuditEvent({
        userId: (session!.user as Record<string, unknown>).id as string,
        action: "ETL_FACULTY_SUBJECT",
        details: fileId
          ? `Step sections (file ${fileId}): ${stepResult.inserted} inserted, ${stepResult.existing} existing (${stepResult.invalid.length} invalid)`
          : `Step sections: ${stepResult.inserted} inserted, ${stepResult.existing} existing (${stepResult.invalid.length} invalid)`,
      })
      return NextResponse.json({ ...stepResult, fileId })
    }
    if (body.step === "subjects") {
      const items = body.items as unknown
      if (!Array.isArray(items)) {
        return NextResponse.json({ error: "Items array is required" }, { status: 400 })
      }
      const stepResult = await importSubjectsStep(items.map((v) => String(v ?? "")))
      await logAuditEvent({
        userId: (session!.user as Record<string, unknown>).id as string,
        action: "ETL_FACULTY_SUBJECT",
        details: fileId
          ? `Step subjects (file ${fileId}): ${stepResult.inserted} inserted, ${stepResult.existing} existing (${stepResult.invalid.length} invalid)`
          : `Step subjects: ${stepResult.inserted} inserted, ${stepResult.existing} existing (${stepResult.invalid.length} invalid)`,
      })
      return NextResponse.json({ ...stepResult, fileId })
    }
    if (body.step === "faculty-users") {
      const items = body.items as unknown
      if (!Array.isArray(items)) {
        return NextResponse.json({ error: "Items array is required" }, { status: 400 })
      }
      // deptCodeToId travels client-held: the client sends back the map the
      // departments step returned. No server session, same model as courses.
      // semesterId stays envelope-only (users are semester-agnostic); Step 7
      // mappings is what scopes by semester.
      const deptCodeToId = (body.deptCodeToId ?? {}) as Record<string, string>
      const stepResult = await importFacultyUsersStep(
        items.map((v) => ({
          email: String((v as { email?: unknown })?.email ?? ""),
          name: String((v as { name?: unknown })?.name ?? ""),
          departmentCode: String((v as { departmentCode?: unknown })?.departmentCode ?? ""),
        })),
        deptCodeToId,
      )
      await logAuditEvent({
        userId: (session!.user as Record<string, unknown>).id as string,
        action: "ETL_FACULTY_SUBJECT",
        details: fileId
          ? `Step faculty-users (file ${fileId}): ${stepResult.inserted} inserted, ${stepResult.existing} existing (${stepResult.invalid.length} invalid)`
          : `Step faculty-users: ${stepResult.inserted} inserted, ${stepResult.existing} existing (${stepResult.invalid.length} invalid)`,
      })
      return NextResponse.json({ ...stepResult, fileId })
    }
    // Mappings travel client-held: sectionKeyToId (Step 3) + subjectCodeToId
    // (Step 4) + facultyUserMap (Step 5). semesterId is FUNCTIONAL here
    // (combo key + list + create scope by semester), unlike Steps 1-5.
    if (body.step === "mappings") {
      const items = body.items as unknown
      if (!Array.isArray(items)) {
        return NextResponse.json({ error: "Items array is required" }, { status: 400 })
      }
      const sectionKeyToId = (body.sectionKeyToId ?? {}) as Record<string, string>
      const subjectCodeToId = (body.subjectCodeToId ?? {}) as Record<string, string>
      const facultyUserMap = (body.facultyUserMap ?? {}) as Record<string, string>
      const stepResult = await importMappingsStep(
        items.map((v) => ({
          subjectCode: String((v as { subjectCode?: unknown })?.subjectCode ?? ""),
          sectionName: String((v as { sectionName?: unknown })?.sectionName ?? ""),
          sectionProgram: String((v as { sectionProgram?: unknown })?.sectionProgram ?? ""),
          facultyEmail: String((v as { facultyEmail?: unknown })?.facultyEmail ?? ""),
        })),
        { sectionKeyToId, subjectCodeToId, facultyUserMap },
        semesterId,
      )
      await logAuditEvent({
        userId: (session!.user as Record<string, unknown>).id as string,
        action: "ETL_FACULTY_SUBJECT",
        details: fileId
          ? `Step mappings (file ${fileId}): ${stepResult.inserted} inserted, ${stepResult.existing} existing (${stepResult.invalid.length} invalid)`
          : `Step mappings: ${stepResult.inserted} inserted, ${stepResult.existing} existing (${stepResult.invalid.length} invalid)`,
      })
      return NextResponse.json({ ...stepResult, fileId })
    }
    const rawRows = body.rows as { email: string; name?: string; subjectCode: string; subjectName?: string; section: string; departmentCode?: string }[] | undefined
    if (!rawRows || !Array.isArray(rawRows) || rawRows.length === 0) {
      return NextResponse.json({ error: "Rows array is required" }, { status: 400 })
    }
    importRows = rawRows.map((r) => {
      const { program, name: sectionName } = parseSectionIdentifier(r.section || "")
      return { email: (r.email || "").toLowerCase().trim(), name: r.name || "", subjectCode: r.subjectCode.trim(), subjectName: r.subjectName || "", sectionName, sectionProgram: program, departmentCode: (r.departmentCode || "").trim().toUpperCase() }
    })
  } else {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "CSV file is required" }, { status: 400 })
    }

    const text = await file.text()
    const parsed = parseFacultySubjectCsv(text)
    if (parsed.headerError) {
      return NextResponse.json({ error: `Header mismatch: ${parsed.headerError}` }, { status: 400 })
    }
    if (parsed.errors.length > 0 && parsed.rows.length === 0) {
      return NextResponse.json({ error: "CSV parsing failed", details: parsed.errors }, { status: 400 })
    }
    importRows = parsed.rows
    parseErrors = parsed.errors
  }

    const result = await importFacultySubjects(importRows, semesterId)

  if (isLast) {
    await logAuditEvent({
      userId: (session!.user as Record<string, unknown>).id as string,
      action: "ETL_FACULTY_SUBJECT",
      details: fileId
        ? `Imported chunk ${chunkIndex + 1}/${totalChunks} (file ${fileId}): ${result.matched} mappings (${result.errors.length} errors)`
        : `Imported ${result.matched} faculty-subject-section mappings (${result.errors.length} errors)`,
    })
  }

  return NextResponse.json({ ...result, parseErrors, chunkIndex, totalChunks, fileId, isLast })
}
