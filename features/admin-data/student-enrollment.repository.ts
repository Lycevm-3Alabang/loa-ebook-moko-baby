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
    if (items.length === 0) return { inserted: 0, skipped: 0, skippedItems: [] }

    // The live constraint is UNIQUE(student_id, faculty_subject_id, "semesterId")
    // (supabase-schema.sql, Migrations 21 + 25) — NOT (student_id, section_id).
    // The dedupe key must match it column-for-column: keying without semesterId made a
    // second term's re-import read every row as already-present and write nothing,
    // silently returning { inserted: 0, skipped: N }.

    // Scope the read as well as the key. Every item in one chunk shares a semester, so
    // a fresh term reads ~0 rows and a re-run reads only that term. The previous
    // .in("section_id", …) selected every enrollment in those sections, so the final
    // chunk of a run read the whole table to conclude "nothing to do".
    //
    // If a caller ever mixes semesters in one call, drop the semester filter rather
    // than read the wrong subset — the key still carries semesterId, so a stale read
    // cannot cause a wrong skip.
    const semesterValues = new Set(items.map((i) => i.semesterId ?? null))
    const filterBySemester = semesterValues.size === 1
    const onlySemester = filterBySemester ? [...semesterValues][0] : null

    let q = supabase
      .from("student_enrollments")
      .select("student_id, faculty_subject_id, \"semesterId\"")
      .in("student_id", [...new Set(items.map((i) => i.student_id))])
    const facultySubjectIds = [...new Set(items.map((i) => i.faculty_subject_id).filter((id): id is string => !!id))]
    if (facultySubjectIds.length > 0) q = q.in("faculty_subject_id", facultySubjectIds)
    if (filterBySemester) {
      q = onlySemester ? q.eq("semesterId", onlySemester) : q.is("semesterId", null)
    }

    const { data: existing, error: fetchErr } = await q
    if (fetchErr) throw fetchErr

    const keyOf = (i: { student_id: string; faculty_subject_id?: string | null; semesterId?: string | null }) =>
      `${i.student_id}|${i.faculty_subject_id ?? ""}|${i.semesterId ?? ""}`

    // Dedupe the request against ITSELF before writing. One multi-row INSERT cannot
    // contain two copies of the same (student, faculty_subject, semester) — Postgres
    // checks the unique index per row, so the second copy raises 23505 and the whole
    // statement rolls back. The 2026-1 student CSV has 5,162 redundant rows out of
    // 28,096, so this is the common case, not an edge case.
    //
    // The service already dedupes; this is defence in depth, because the constraint
    // is this layer's to guarantee and any other caller inherits it.
    const seen = new Set<string>()
    const uniqueItems = items.filter((i) => {
      const k = keyOf(i)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    const collapsed = items.length - uniqueItems.length

    const existingSet = new Set((existing || []).map((r) =>
      `${r.student_id}|${r.faculty_subject_id ?? ""}|${r.semesterId ?? ""}`))

    const newItems = uniqueItems.filter((i) => !existingSet.has(keyOf(i)))
    const skippedItems = uniqueItems
      .filter((i) => existingSet.has(keyOf(i)))
      .map((i) => ({
        student_id: i.student_id,
        faculty_subject_id: i.faculty_subject_id ?? null,
        section_id: i.section_id,
      }))
    // Rows collapsed by the dedupe above were not persisted either, so they belong
    // in the same accounting as rows the database already held.
    const skipped = skippedItems.length + collapsed

    if (newItems.length === 0) return { inserted: 0, skipped, skippedItems }

    const { error: insErr } = await supabase.from("student_enrollments").insert(newItems)
    if (insErr) throw insErr
    return { inserted: newItems.length, skipped, skippedItems }
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
