import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import {
  facultySubjectRepository,
  studentEnrollmentRepository,
  subjectRepository,
  sectionRepository,
} from "@/lib/repositories/factory"

export async function GET(request: NextRequest) {
  const authErr = await requireAdmin(request)
  if (authErr) return authErr

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")

  if (type === "faculty") {
    const semesterId = searchParams.get("semesterId")
    const data = await facultySubjectRepository.listAllWithEmbeds(semesterId || undefined)

    const sectionIds = [...new Set(data.map((r) => r.section?.id).filter(Boolean))] as string[]
    const counts = await studentEnrollmentRepository.countBySectionIds(sectionIds)

    const enriched = data.map((r) => ({
      ...r,
      student_count: counts[r.section?.id || ""] || 0,
    }))

    return NextResponse.json({ data: enriched })
  }

  if (type === "student") {
    const data = await studentEnrollmentRepository.listAllWithEmbeds()
    const enriched = data.map((r) => ({
      ...r,
      faculty_subject_id: r.faculty_subject?.id ?? null,
    }))
    return NextResponse.json({ data: enriched })
  }

  if (type === "subjects") {
    const data = await subjectRepository.list()
    return NextResponse.json({ data })
  }

  if (type === "sections") {
    const data = await sectionRepository.list()
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: 'Invalid type — use "faculty", "student", "subjects", or "sections"' }, { status: 400 })
}
