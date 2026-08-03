import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { departmentRepository, departmentCourseRepository } from "@/lib/db"
import { requireAdmin } from "@/lib/route-guard"
import { logAuditEvent } from "@/lib/services/audit"

interface ImportRow {
  departmentCode: string
  departmentName: string
  courseCode: string
  courseName: string
}

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const session = await auth()

  let rows: ImportRow[]
  try {
    const body = await request.json()
    rows = body.rows as ImportRow[]
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "Rows array is required" }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const result = {
    departmentsCreated: 0,
    departmentsSkipped: 0,
    departmentsUpdated: 0,
    coursesCreated: 0,
    coursesSkipped: 0,
    coursesUpdated: 0,
    errors: [] as { row: number; departmentCode: string; courseCode: string; message: string }[],
  }

  for (let i = 0; i < rows.length; i++) {
    const { departmentCode, departmentName, courseCode, courseName } = rows[i]
    const deptCode = departmentCode.toUpperCase().trim()
    const cCode = courseCode.toUpperCase().trim()

     try {
       let dept = await departmentRepository.findByCode(deptCode)
       if (!dept) {
         dept = await departmentRepository.create({ name: departmentName.trim(), code: deptCode })
         result.departmentsCreated++
       } else if (dept.name !== departmentName.trim()) {
         await departmentRepository.update(dept.id, { name: departmentName.trim() })
         result.departmentsUpdated++
       } else {
         result.departmentsSkipped++
       }

       const existing = await departmentCourseRepository.findByDepartmentAndCode(dept.id, cCode)
       if (!existing) {
         await departmentCourseRepository.create({
           departmentId: dept.id,
           name: courseName.trim(),
           code: cCode,
         })
         result.coursesCreated++
       } else if (existing.name !== courseName.trim()) {
         await departmentCourseRepository.update(existing.id, { name: courseName.trim() })
         result.coursesUpdated++
       } else {
         result.coursesSkipped++
       }
    } catch (err) {
      const msg = err instanceof Error ? err.message : (typeof err === "string" ? err : (err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "Unknown error"))
      result.errors.push({
        row: i + 1,
        departmentCode: deptCode,
        courseCode: cCode,
        message: msg,
      })
    }
  }

  const currentUserId = (session!.user as Record<string, unknown>).id as string
  await logAuditEvent({
    userId: currentUserId,
    action: "IMPORT_DEPARTMENTS_COURSES",
    details: `Imported ${result.departmentsCreated} departments, ${result.coursesCreated} courses (${result.departmentsSkipped} depts skipped, ${result.coursesSkipped} courses skipped, ${result.departmentsUpdated} depts updated, ${result.coursesUpdated} courses updated, ${result.errors.length} errors)`,
  })

  return NextResponse.json(result)
}
