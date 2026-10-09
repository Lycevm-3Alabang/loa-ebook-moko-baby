import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/route-guard"
import {
  subjectRepository,
  sectionRepository,
  userRepository,
  facultySubjectRepository,
  departmentCourseRepository,
  departmentRepository,
} from "@/lib/repositories/factory"

export async function GET(request: NextRequest) {
  const authErr = await requireRole(request, ["ADMIN", "DEAN", "FACULTY"])
  if (authErr) return authErr

  try {
    const [subjects, sections, users, facultySubjects, departmentCourses, departments] = await Promise.all([
      subjectRepository.list(),
      sectionRepository.list(),
      userRepository.listAll(),
      facultySubjectRepository.list(),
      departmentCourseRepository.findAll(),
      departmentRepository.listAll(),
    ])

    return NextResponse.json({
      subjects: subjects.map((s) => ({ id: s.id, code: s.code })),
      sections: sections.map((s) => ({ id: s.id, name: s.name, program: s.program, departmentCourseId: s.departmentCourseId })),
      users: users.map((u) => ({ id: u.id, email: u.email.toLowerCase(), role: u.role || null })),
      facultySubjects: facultySubjects.map((fs) => ({ id: fs.id, subject_id: fs.subject_id, section_id: fs.section_id, faculty_id: fs.faculty_id })),
      departmentCourses: departmentCourses.map((c) => ({ id: c.id, code: c.code })),
      departments: departments.map((d) => ({ id: d.id, code: d.code })),
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch reference data" }, { status: 500 })
  }
}
