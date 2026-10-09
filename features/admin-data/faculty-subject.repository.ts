import { supabase } from "@/lib/db"
import type { FacultySubjectData, FacultySubjectWithEmbeds, FacultySubjectWithSubjectsSections, IFacultySubjectRepository } from "@/lib/types"

export const facultySubjectRepository: IFacultySubjectRepository = {
  async list(filters) {
    let q = supabase.from("faculty_subjects").select("*")
    if (filters?.faculty_id) q = q.eq("faculty_id", filters.faculty_id)
    if (filters?.section_id) q = q.eq("section_id", filters.section_id)
    if (filters?.semesterId) q = q.eq("semesterId", filters.semesterId)
    const { data, error } = await q
    if (error) throw error
    return data as FacultySubjectData[]
  },

  async listAllWithEmbeds() {
    const { data, error } = await supabase
      .from("faculty_subjects")
      .select(`
        id,
        faculty_id,
        subject_id,
        section_id,
        "semesterId",
        faculty:faculty_id (id, name, email, "departmentId"),
        subject:subject_id (id, code, name),
        section:section_id (id, name, program)
      `)
    if (error) throw error
    return (data || []) as unknown as FacultySubjectWithEmbeds[]
  },

  async replaceBySection(section_id, items) {
    const { error: delErr } = await supabase.from("faculty_subjects").delete().eq("section_id", section_id)
    if (delErr) throw delErr
    if (items.length === 0) return
    const rows = items.map((i) => ({ faculty_id: i.faculty_id, subject_id: i.subject_id, section_id, semesterId: i.semesterId ?? null }))
    const { error: insErr } = await supabase.from("faculty_subjects").insert(rows)
    if (insErr) throw insErr
  },

  async findById(id) {
    const { data, error } = await supabase.from("faculty_subjects").select("*").eq("id", id).single()
    if (error) {
      if (error.code === "PGRST116") return null
      throw error
    }
    return data as FacultySubjectData
  },

  async create(fields) {
    const { data, error } = await supabase.from("faculty_subjects").insert(fields).select("*").single()
    if (error) throw error
    return data as FacultySubjectData
  },

  async createMany(items) {
    if (items.length === 0) return []
    const { data, error } = await supabase.from("faculty_subjects").insert(items).select("*")
    if (error) throw error
    return (data || []) as FacultySubjectData[]
  },

  async update(id, fields) {
    const { data, error } = await supabase.from("faculty_subjects").update(fields).eq("id", id).select("*").single()
    if (error) throw error
    return data as FacultySubjectData
  },

  async findBySubjectAndSection(subject_id, section_id) {
    const { data, error } = await supabase
      .from("faculty_subjects")
      .select("*")
      .eq("subject_id", subject_id)
      .eq("section_id", section_id)
      .maybeSingle()
    if (error) {
      if (error.code === "PGRST116") return null
      throw error
    }
    return data as FacultySubjectData
  },

  async findBySubjectSectionAndFaculty(subject_id, section_id, faculty_id) {
    const { data, error } = await supabase
      .from("faculty_subjects")
      .select("*")
      .eq("subject_id", subject_id)
      .eq("section_id", section_id)
      .eq("faculty_id", faculty_id)
      .maybeSingle()
    if (error) throw error
    return data as FacultySubjectData | null
  },

  async findBySubjectSectionSemester(subject_id, section_id, semesterId) {
    let q = supabase
      .from("faculty_subjects")
      .select("*")
      .eq("subject_id", subject_id)
      .eq("section_id", section_id)
    if (semesterId) q = q.eq("semesterId", semesterId) as typeof q
    else q = q.is("semesterId", null) as typeof q
    const { data, error } = await q.maybeSingle()
    if (error) throw error
    return data as FacultySubjectData | null
  },

  // All mappings for the given subject/section pairs, in ONE round trip.
  //
  // Why this exists: the student importer used to call
  // findBySubjectSectionAndFaculty once per row — ~22,000 sequential awaited
  // PostgREST calls for the 2026-1 file. The route is capped at maxDuration=60
  // and runs in iad1 while admins upload from sin1, so that is ~150ms of
  // Pacific latency per call. It 504'd at 62.8s.
  //
  // Deliberately NOT filtered by semester here: UNIQUE(subject_id, section_id,
  // "semesterId") means a pair can hold one row per semester, so the caller
  // must group by (subject_id, section_id, "semesterId") and pick the active
  // semester — a flat filtered read would hide the legacy null-semester rows
  // the per-row finders used to return.
  //
  // Bound: callers chunk. STUDENT_CHUNK_SIZE=100 means ~100 pairs → ~100-200
  // rows returned, safely under PostgREST's default 1000-row response cap.
  async findManyBySubjectSectionIds(subjectIds, sectionIds) {
    if (subjectIds.length === 0 || sectionIds.length === 0) return []
    const { data, error } = await supabase
      .from("faculty_subjects")
      .select("*")
      .in("subject_id", subjectIds)
      .in("section_id", sectionIds)
    if (error) throw error
    return (data || []) as FacultySubjectData[]
  },

  async findByIds(ids) {
    if (ids.length === 0) return []
    const { data, error } = await supabase.from("faculty_subjects").select("*").in("id", ids)
    if (error) throw error
    return (data || []) as FacultySubjectData[]
  },

  async findByFacultyIdWithEmbeds(facultyId) {
    const { data, error } = await supabase
      .from("faculty_subjects")
      .select(`
        id, subject_id,
        subjects!inner(id, code, name),
        sections!inner(departmentCourseId)
      `)
      .eq("faculty_id", facultyId)
    if (error) throw error
    return (data || []) as unknown as FacultySubjectWithSubjectsSections[]
  },

  async countBySemesterId(semesterId) {
    const { count, error } = await supabase
      .from("faculty_subjects")
      .select("id", { count: "exact", head: true })
      .eq("semesterId", semesterId)
    if (error) throw error
    return count ?? 0
  },
}
