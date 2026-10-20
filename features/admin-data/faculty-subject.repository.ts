import { supabase } from "@/lib/db"
import type { FacultySubjectData, FacultySubjectWithEmbeds, FacultySubjectWithSubjectsSections, IFacultySubjectRepository } from "@/lib/types"

// PostgREST caps URL length (~8KB). Chunk large .in() lists to stay under it.
const IN_CHUNK_SIZE = 100

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

  async listAllWithEmbeds(filters?: { semesterId?: string; facultyId?: string }) {
    const build = (withSemester: boolean) => {
      let q = supabase
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
        ${withSemester ? ',semester:"semesterId" (id, title)' : ""}
      `)
      if (filters?.semesterId) q = q.eq("semesterId", filters.semesterId) as typeof q
      if (filters?.facultyId) q = q.eq("faculty_id", filters.facultyId) as typeof q
      return q
    }
    let { data, error } = await build(true)
    if (error && error.code === "PGRST201") {
      // PostgREST missed the camelCase "semesterId" FK — retry without the
      // semester embed; the route backfills titles from the semesters table.
      ;({ data, error } = await build(false))
    }
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

  async findByIdWithEmbeds(id: string) {
    const build = (withSemester: boolean) => supabase
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
        ${withSemester ? ',semester:"semesterId" (id, title)' : ""}
      `)
      .eq("id", id)
      .maybeSingle()
    let { data, error } = await build(true)
    if (error && error.code === "PGRST201") {
      // Same camelCase "semesterId" FK miss as the bulk read — retry without
      // the semester embed; the route backfills titles from semesters table.
      ;({ data, error } = await build(false))
    }
    if (error) {
      if (error.code === "PGRST116") return null
      throw error
    }
    return (data ?? null) as unknown as FacultySubjectWithEmbeds | null
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

  // Semester backfill for a caller-vetted id set (single roundtrip, atomic).
  // Callers must pre-filter against UNIQUE(subject_id, section_id,
  // "semesterId"): a stray colliding id here raises 23505 and rolls back the
  // whole statement — hence the id-set signature rather than a blanket WHERE.
  async updateSemesterForIds(ids: string[], semesterId: string): Promise<number> {
    if (ids.length === 0) return 0
    const { error } = await supabase.from("faculty_subjects").update({ semesterId }).in("id", ids)
    if (error) throw error
    return ids.length
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
    // PostgREST caps the URL (~8KB): a department's full assignment list
    // overflows it and answers 400, which surfaces as a 500 on the route.
    const rows: FacultySubjectData[] = []
    for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
      const { data, error } = await supabase
        .from("faculty_subjects")
        .select("*")
        .in("id", ids.slice(i, i + IN_CHUNK_SIZE))
      if (error) throw error
      rows.push(...(data || []) as FacultySubjectData[])
    }
    return rows
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
