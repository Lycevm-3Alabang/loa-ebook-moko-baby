import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/route-guard"
import {
  facultySubjectRepository,
  studentEnrollmentRepository,
  semesterRepository,
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
    const facultyId = searchParams.get("facultyId")
    const data = await facultySubjectRepository.listAllWithEmbeds({
      ...(semesterId ? { semesterId } : {}),
      ...(facultyId ? { facultyId } : {}),
    })

    // Headcount per faculty_subject (exact per teacher), aggregated in the
    // application. Only fetched on the per-faculty path (modal) — the bulk
    // table never displays headcount, so it skips this query entirely
    // instead of batching hundreds of ids into one oversized filter.
    const headcounts: Record<string, number> = facultyId
      ? await studentEnrollmentRepository.countByFacultySubjectIds(
        data.map((r) => r.id),
        semesterId || undefined,
      )
      : {}

    // Semester titles prefer the join embed; backfill from the semesters
    // table when the embed was unavailable (PostgREST camelCase FK miss).
    let titleById: Record<string, string> = {}
    if (data.some((r) => !r.semester)) {
      const semesters = await semesterRepository.list()
      titleById = Object.fromEntries(semesters.map((s) => [s.id, s.title]))
    }

    const enriched = data.map((r) => ({
      ...r,
      semester: r.semester ?? (r.semesterId ? { id: r.semesterId, title: titleById[r.semesterId] ?? "—" } : null),
      headcount: headcounts[r.id] ?? 0,
    }))

    return NextResponse.json({ data: enriched })
  }

  if (type === "student") {
    const facultySubjectId = searchParams.get("facultySubjectId")
    const semesterId = searchParams.get("semesterId")
    const data = facultySubjectId
      ? await studentEnrollmentRepository.listByFacultySubject(
        facultySubjectId,
        semesterId || undefined,
      )
      : await studentEnrollmentRepository.listAllWithEmbeds()
    const enriched = data.map((r) => ({
      ...r,
      faculty_subject_id: r.faculty_subject?.id ?? null,
    }))
    const total = facultySubjectId
      ? await studentEnrollmentRepository.countByFacultySubjectId(
        facultySubjectId,
        semesterId || undefined,
      )
      : enriched.length
    return NextResponse.json({ data: enriched, total })
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
