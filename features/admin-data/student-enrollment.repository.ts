import { supabase } from "@/lib/db"
import type { StudentEnrollmentData, StudentEnrollmentWithEmbeds, IStudentEnrollmentRepository } from "@/lib/types"

export const studentEnrollmentRepository: IStudentEnrollmentRepository = {
  async list(filters) {
    let q = supabase.from("student_enrollments").select("*")
    if (filters?.student_id) q = q.eq("student_id", filters.student_id)
    if (filters?.section_id) q = q.eq("section_id", filters.section_id)
    if (filters?.semesterId) q = q.eq("semesterId", filters.semesterId)
    const { data, error } = await q
    if (error) throw error
    return data as StudentEnrollmentData[]
  },

  async replaceBySection(section_id, items) {
    const { error: delErr } = await supabase.from("student_enrollments").delete().eq("section_id", section_id)
    if (delErr) throw delErr
    if (items.length === 0) return
    const rows = items.map((i) => ({ student_id: i.student_id, section_id, semesterId: i.semesterId ?? null }))
    const { error: insErr } = await supabase.from("student_enrollments").insert(rows)
    if (insErr) throw insErr
  },

  async findExisting(student_id, faculty_subject_id, semesterId) {
    let q = supabase
      .from("student_enrollments")
      .select("*")
      .eq("student_id", student_id)
      .eq("faculty_subject_id", faculty_subject_id)
    if (semesterId) {
      q = q.eq("semesterId", semesterId)
    } else {
      q = q.is("semesterId", null)
    }
    const { data, error } = await q.maybeSingle()
    if (error) throw error
    return data as StudentEnrollmentData | null
  },

  async create(data) {
    const { data: created, error } = await supabase
      .from("student_enrollments")
      .insert(data)
      .select("*")
      .single()
    if (error) throw error
    return created as StudentEnrollmentData
  },

  async addEnrollments(items) {
    if (items.length === 0) return { inserted: 0, skipped: 0 }
    const sectionIds = [...new Set(items.map((i) => i.section_id))]
    const { data: existing, error: fetchErr } = await supabase
      .from("student_enrollments")
      .select("student_id, section_id, faculty_subject_id")
      .in("section_id", sectionIds)
    if (fetchErr) throw fetchErr
    const existingSet = new Set((existing || []).map((r) => `${r.student_id}|${r.section_id}|${r.faculty_subject_id ?? ""}`))
    const newItems = items.filter((i) => !existingSet.has(`${i.student_id}|${i.section_id}|${i.faculty_subject_id ?? ""}`))
    const skipped = items.length - newItems.length
    if (newItems.length === 0) return { inserted: 0, skipped }
    const { error: insErr } = await supabase.from("student_enrollments").insert(newItems)
    if (insErr) throw insErr
    return { inserted: newItems.length, skipped }
  },

  async getFacultySubjectsByStudent(student_id, faculty_id, semesterId) {
    let q = supabase.from("student_enrollments").select("section_id").eq("student_id", student_id)
    if (semesterId) q = q.eq("semesterId", semesterId) as typeof q
    const { data: enrollments, error: enrollErr } = await q
    if (enrollErr) throw enrollErr
    if (!enrollments?.length) return []

    const sectionIds = enrollments.map((r) => r.section_id)

    let fsQ = supabase
      .from("faculty_subjects")
      .select("subject_id")
      .eq("faculty_id", faculty_id)
      .in("section_id", sectionIds)
    if (semesterId) fsQ = fsQ.eq("semesterId", semesterId) as typeof fsQ
    const { data: fs, error: fsErr } = await fsQ
    if (fsErr) throw fsErr
    if (!fs?.length) return []

    const subjectIds = [...new Set(fs.map((r) => r.subject_id))]
    const { data: subjects, error: subjErr } = await supabase
      .from("subjects")
      .select("id, code, title")
      .in("id", subjectIds)
    if (subjErr) throw subjErr

    return (subjects || []) as { id: string; code: string; title: string }[]
  },

  async getDistinctFaculty(student_id, semesterId) {
    let q = supabase.from("student_enrollments").select("section_id").eq("student_id", student_id)
    if (semesterId) q = q.eq("semesterId", semesterId) as typeof q
    const { data: enrollments, error: enrollErr } = await q
    if (enrollErr) throw enrollErr
    if (enrollments.length === 0) return []

    const sectionIds = enrollments.map((r) => r.section_id)
    let fsQ = supabase.from("faculty_subjects").select("faculty_id").in("section_id", sectionIds)
    if (semesterId) fsQ = fsQ.eq("semesterId", semesterId) as typeof fsQ
    const { data: fs, error: fsErr } = await fsQ
    if (fsErr) throw fsErr

    return [...new Set(fs.map((r) => r.faculty_id))]
  },
  async findById(id) {
    const { data, error } = await supabase.from("student_enrollments").select("*").eq("id", id).single()
    if (error) {
      if (error.code === "PGRST116") return null
      throw error
    }
    return data as StudentEnrollmentData
  },
  async deleteById(id) {
    const { error } = await supabase.from("student_enrollments").delete().eq("id", id)
    if (error) throw error
  },

  async countBySectionIds(sectionIds) {
    if (sectionIds.length === 0) return {}
    const { data, error } = await supabase
      .from("student_enrollments")
      .select("section_id")
      .in("section_id", sectionIds)
    if (error) throw error
    return (data || []).reduce<Record<string, number>>((acc, r) => {
      acc[r.section_id] = (acc[r.section_id] || 0) + 1
      return acc
    }, {})
  },

  async listAllWithEmbeds() {
    const { data, error } = await supabase
      .from("student_enrollments")
      .select(`
        id,
        "semesterId",
        student:student_id (id, name, email),
        section:section_id (id, name, program),
        faculty_subject:faculty_subject_id (
          id,
          faculty:faculty_id (id, name, email),
          subject:subject_id (id, code, name),
          section:section_id (id, name, program)
        )
      `)
    if (error) throw error
    return (data || []) as unknown as StudentEnrollmentWithEmbeds[]
  },

  async countBySemesterId(semesterId) {
    const { count, error } = await supabase
      .from("student_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("semesterId", semesterId)
    if (error) throw error
    return count ?? 0
  },
}
