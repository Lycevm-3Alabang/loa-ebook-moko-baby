import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { requireAdmin } from "@/lib/route-guard"
import { parseFacultySubjectCsv, importFacultySubjects } from "@/lib/services/etlEvaluation"
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
