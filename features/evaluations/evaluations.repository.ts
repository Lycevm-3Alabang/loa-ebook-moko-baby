import { supabase } from "@/lib/db"
import { fetchRatingsWithCategories } from "@/lib/db/common"
import type { EvaluationData, EvaluationComment, EvaluationCommentWithEvaluation, IEvaluationRepository, EvaluationListItem, EvaluationDetailItem, EvaluationStatusItem, EvaluationRatingRow, EvaluationCommentLight, EvaluationCommentFull, PendingEvaluationItem } from "@/lib/types"

const DUMMY_FACULTY_EMAIL_EVAL = "placeholder@lyceumalabang.edu.ph"

// PostgREST caps URL length (~8KB). 1318 UUIDs ≈ 48KB in one .in() → 400
// Bad Request. Chunk large .in() lists to stay under it.
const IN_CHUNK_SIZE = 100

// PostgREST's db-max-rows (1,000) truncates an unbounded read with HTTP 200
// and no error. Reads that ask for "every evaluation of these people" must
// page past it.
const PAGE_SIZE = 1000

function chunkStrIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

// Semester titles for a set of mapping semesterIds, in one round trip.
// Deliberately a separate query, NOT an embedded `semesters!inner(title)`
// join on the faculty_subjects selects: !inner would silently drop
// NULL-semester mappings from Branch A, which must still list (locked).
async function fetchSemesterTitleMap(semesterIds: (string | null | undefined)[]) {
  const ids = [...new Set(semesterIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return new Map<string, string>()
  const { data, error } = await supabase.from("semesters").select("id, title").in("id", ids)
  if (error) throw error
  return new Map(((data || []) as { id: string; title: string }[]).map((r) => [r.id, r.title]))
}

// Sections for a set of mapping section_ids, in one round trip. Same shape
// as the title lookup above; sections are few, so callers pass every id.
async function fetchSectionMap(sectionIds: (string | null | undefined)[]) {
  const ids = [...new Set(sectionIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return new Map<string, { name: string; program: string }>()
  const { data, error } = await supabase.from("sections").select("id, name, program").in("id", ids)
  if (error) throw error
  return new Map(
    ((data || []) as { id: string; name: string; program: string }[]).map((r) => [
      r.id,
      { name: r.name, program: r.program },
    ]),
  )
}

function toEligiblePendingItem(
  fs: { id: string; faculty_id: string; subject_id: string; semesterId?: string | null; section_id?: string | null },
  enrollments: { faculty_subject_id?: string | null; semesterId?: string | null }[],
  periodSemesterId: string,
  activeSemesterId: string | null | undefined,
  titleBySemesterId: Map<string, string>,
  sectionById: Map<string, { name: string; program: string }>,
): PendingEvaluationItem {
  const mappingSemesterId = fs.semesterId ?? null
  const section = fs.section_id ? (sectionById.get(fs.section_id) ?? null) : null
  const rowsForMapping = enrollments.filter((e) => e.faculty_subject_id === fs.id)
  // Gate mirror: studentEnrollmentRepository.findExisting matches
  // (student_id, faculty_subject_id, semesterId) exactly, and .eq() never
  // matches NULL — so strict === here, including NULL-* handling, is the
  // same predicate the POST gate will apply.
  const eligible = rowsForMapping.some((e) => e.semesterId === periodSemesterId)
  return {
    evaluateeId: fs.faculty_id,
    facultySubjectId: fs.id,
    subjectId: fs.subject_id,
    sectionProgram: section?.program ?? null,
    sectionName: section?.name ?? null,
    mappingSemesterId,
    mappingSemesterTitle: mappingSemesterId ? (titleBySemesterId.get(mappingSemesterId) ?? null) : null,
    // Display/diagnostic only — never gates. False when either side is null.
    isMappedToActiveSemester:
      mappingSemesterId !== null && activeSemesterId != null && mappingSemesterId === activeSemesterId,
    eligible,
    ineligibilityReason: eligible ? null : rowsForMapping.length > 0 ? "WRONG_TERM" : "NOT_ENROLLED",
  }
}

export const evaluationRepository: IEvaluationRepository = {
  /**
   * True when the assignment belongs to the shared dummy account. The dummy
   * owns real classes (the CSV parks a faculty-less class on it) but it is a
   * placeholder, never a person: it must not be shown to a student as the
   * evaluated entity, and it must not be rated.
   */
  async isDummyAssignment(facultySubjectId) {
    if (!facultySubjectId) return false
    const { data: fs, error: fsErr } = await supabase
      .from("faculty_subjects")
      .select("faculty_id")
      .eq("id", facultySubjectId)
      .maybeSingle()
    if (fsErr) throw fsErr
    if (!fs) return false
    const { data: dummyUser, error: dummyErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", DUMMY_FACULTY_EMAIL_EVAL)
      .maybeSingle()
    if (dummyErr) throw dummyErr
    return !!dummyUser && fs.faculty_id === dummyUser.id
  },

  async findPending(evaluatorId, evaluationPeriodId, activeSemesterId?: string | null) {
    const { data: enrollments, error: enrollErr } = await supabase
      .from("student_enrollments")
      .select("faculty_subject_id, section_id, semesterId")
      .eq("student_id", evaluatorId)
    if (enrollErr) throw enrollErr
    if (enrollments.length === 0) return []

    const { data: evalPeriod, error: epErr } = await supabase
      .from("evaluation_periods")
      .select("semesterId")
      .eq("id", evaluationPeriodId)
      .single()
    if (epErr) throw epErr

    const { data: existing, error: evErr } = await supabase
      .from("evaluations")
      .select("id, facultySubjectId, evaluateeId, isDisabled")
      .eq("evaluatorId", evaluatorId)
      .eq("evaluation_period_id", evaluationPeriodId)
    if (evErr) throw evErr

    // Unassigned loads (shared dummy) are never evaluatable — resolve once, filter both branches.
    const { data: dummyUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", DUMMY_FACULTY_EMAIL_EVAL)
      .maybeSingle()
    const dummyId = (dummyUser as { id: string } | null)?.id ?? null

    const existingByFsId = new Map(existing.filter((r) => r.facultySubjectId).map((r) => [r.facultySubjectId, r]))
    const activeExistingFsIds = new Set(
      existing.filter((r) => r.facultySubjectId && !r.isDisabled).map((r) => r.facultySubjectId),
    )
    const disabledFsIds = new Set(
      existing.filter((r) => r.facultySubjectId && r.isDisabled).map((r) => r.facultySubjectId),
    )

    const directIds = enrollments.filter((r) => r.faculty_subject_id).map((r) => r.faculty_subject_id)

    if (directIds.length > 0) {
      const { data: facultySubjects, error: fsErr } = await supabase
        .from("faculty_subjects")
        .select("id, faculty_id, subject_id, semesterId, section_id")
        .in("id", directIds)
      if (fsErr) throw fsErr

      const staleIds: string[] = []

      for (const fs of facultySubjects) {
        const ev = existingByFsId.get(fs.id)
        if (ev && ev.evaluateeId !== fs.faculty_id && !ev.isDisabled) {
          staleIds.push(ev.id)
        }
      }

      if (staleIds.length > 0) {
        await supabase.from("evaluations").update({ isDisabled: true }).in("id", staleIds)
        for (const id of staleIds) activeExistingFsIds.delete(existingByFsId.get(id)!.facultySubjectId)
      }

      const skipFsIds = new Set([...Array.from(activeExistingFsIds), ...Array.from(disabledFsIds)])
      for (const id of staleIds) {
        const fsId = existingByFsId.get(id)?.facultySubjectId
        if (fsId) skipFsIds.delete(fsId)
      }

      const titleBySemesterId = await fetchSemesterTitleMap(facultySubjects.map((fs) => fs.semesterId))
      const sectionById = await fetchSectionMap(facultySubjects.map((fs) => fs.section_id))

      return facultySubjects
        .filter((fs) => !skipFsIds.has(fs.id) && fs.faculty_id !== dummyId)
        .map((fs) =>
          toEligiblePendingItem(fs, enrollments, evalPeriod.semesterId, activeSemesterId, titleBySemesterId, sectionById),
        )
    }

    const sectionIds = enrollments.map((r) => r.section_id)
    const { data: facultySubjects, error: fsErr } = await supabase
      .from("faculty_subjects")
      .select("id, faculty_id, subject_id, semesterId, section_id")
      .in("section_id", sectionIds)
      .eq("semesterId", evalPeriod.semesterId)
    if (fsErr) throw fsErr

    const staleIds: string[] = []

    for (const fs of facultySubjects) {
      const ev = existingByFsId.get(fs.id)
      if (ev && ev.evaluateeId !== fs.faculty_id && !ev.isDisabled) {
        staleIds.push(ev.id)
      }
    }

    if (staleIds.length > 0) {
      await supabase.from("evaluations").update({ isDisabled: true }).in("id", staleIds)
      for (const id of staleIds) activeExistingFsIds.delete(existingByFsId.get(id)!.facultySubjectId)
    }

    const skipFsIds = new Set([...Array.from(activeExistingFsIds), ...Array.from(disabledFsIds)])
    for (const id of staleIds) {
      const fsId = existingByFsId.get(id)?.facultySubjectId
      if (fsId) skipFsIds.delete(fsId)
    }

    const titleBySemesterId = await fetchSemesterTitleMap(facultySubjects.map((fs) => fs.semesterId))
    const sectionById = await fetchSectionMap(facultySubjects.map((fs) => fs.section_id))

    return facultySubjects
      .filter((fs) => !skipFsIds.has(fs.id) && fs.faculty_id !== dummyId)
      .map((fs) =>
        toEligiblePendingItem(fs, enrollments, evalPeriod.semesterId, activeSemesterId, titleBySemesterId, sectionById),
      )
  },

  async findByEvaluator(evaluatorId, evaluationPeriodId?) {
    let query = supabase
      .from("evaluations")
      .select("*")
      .eq("evaluatorId", evaluatorId)
      .eq("isDisabled", false)
    if (evaluationPeriodId) query = query.eq("evaluation_period_id", evaluationPeriodId)
    const { data, error } = await query.order("createdAt", { ascending: false })
    if (error) throw error
    return data as EvaluationData[]
  },

  async findByEvaluatorBrief(evaluatorId) {
    const { data, error } = await supabase
      .from("evaluations")
      .select("id, evaluateeId, status, submittedAt")
      .eq("evaluatorId", evaluatorId)
      .eq("isDisabled", false)
      .order("createdAt", { ascending: false })
    if (error) throw error
    return data as EvaluationData[]
  },

  async findById(id) {
    const { data, error } = await supabase.from("evaluations").select("*").eq("id", id).single()
    if (error) {
      if (error.code === "PGRST116") return null
      throw error
    }
    return data as EvaluationData
  },

  async findByComposite(evaluationPeriodId, evaluatorId, facultySubjectId) {
    const { data, error } = await supabase
      .from("evaluations")
      .select("*")
      .eq("evaluation_period_id", evaluationPeriodId)
      .eq("evaluatorId", evaluatorId)
      .eq("facultySubjectId", facultySubjectId)
      .single()
    if (error) {
      if (error.code === "PGRST116") return null
      throw error
    }
    return data as EvaluationData
  },

  async create(evaluationPeriodId, evaluatorId, evaluateeId, facultySubjectId, source) {
    const { data: ep } = await supabase
      .from("evaluation_periods")
      .select("semesterId")
      .eq("id", evaluationPeriodId)
      .single()

    const { data, error } = await supabase
      .from("evaluations")
      .insert({ evaluation_period_id: evaluationPeriodId, semesterId: ep?.semesterId, evaluatorId, evaluateeId, facultySubjectId, source: source ?? null })
      .select("*")
      .single()
    if (error) {
      // Lost a creation race (unique period+evaluator+subject): return the
      // row the other request inserted instead of surfacing a 500.
      if (error.code === "23505") {
        const existing = await this.findByComposite(evaluationPeriodId, evaluatorId, facultySubjectId)
        if (existing) return existing
      }
      throw error
    }
    return data as EvaluationData
  },

  async setRatings(evaluationId, ratings) {
    const rows = ratings.map((r) => ({ evaluationId, itemId: r.itemId, rating: r.rating }))
    const { error: delErr } = await supabase.from("evaluation_ratings").delete().eq("evaluationId", evaluationId)
    if (delErr) throw delErr
    const { error: insErr } = await supabase.from("evaluation_ratings").insert(rows)
    if (insErr) throw insErr
  },

  async submit(evaluationId) {
    const { data, error } = await supabase
      .from("evaluations")
      .update({ status: "SUBMITTED", submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .eq("id", evaluationId)
      .select("*")
      .single()
    if (error) throw error
    return data as EvaluationData
  },

  async getRatings(evaluationId) {
    const { data, error } = await supabase
      .from("evaluation_ratings")
      .select("itemId, rating")
      .eq("evaluationId", evaluationId)
    if (error) throw error
    return data as { itemId: string; rating: number }[]
  },

  async addComment(evaluationId, comment) {
    const { data, error } = await supabase
      .from("evaluation_comments")
      .insert({ evaluationId, comment })
      .select("*")
      .single()
    if (error) throw error
    return data as EvaluationComment
  },

  async getComment(evaluationId) {
    const { data, error } = await supabase
      .from("evaluation_comments")
      .select("*")
      .eq("evaluationId", evaluationId)
      .maybeSingle()
    if (error) throw error
    return data as EvaluationComment | null
  },
  async listCommentsWithFilters(filters) {
    let q = supabase
      .from("evaluation_comments")
      .select("*, evaluation:evaluations!inner(*)")
    if (filters?.evaluationPeriodId) q = q.eq("evaluation.evaluation_period_id", filters.evaluationPeriodId)
    if (filters?.sentimentLabel) q = q.eq("sentimentLabel", filters.sentimentLabel)
    const { data, error } = await q
    if (error) throw error
    return (data || []) as unknown as EvaluationCommentWithEvaluation[]
  },
  async bulkDisableByPeriod(evaluationPeriodId, filter) {
    let q = supabase
      .from("evaluations")
      .update({ isDisabled: true })
      .eq("evaluation_period_id", evaluationPeriodId)
      .eq("status", "SUBMITTED")
    if (filter?.facultySubjectId) {
      q = q.eq("facultySubjectId", filter.facultySubjectId)
    } else if (filter?.facultyId) {
      q = q.eq("evaluateeId", filter.facultyId)
    }
    const { error } = await q
    if (error) throw error
  },
  async restoreByIds(ids) {
    const { error } = await supabase
      .from("evaluations")
      .update({ isDisabled: false })
      .in("id", ids)
    if (error) throw error
  },
  async listDisabled() {
    const { data, error } = await supabase
      .from("evaluations")
      .select(`
        *,
        evaluator:evaluatorId(id, name, email),
        evaluatee:evaluateeId(id, name, email),
        faculty_subject:facultySubjectId(
          id,
          faculty:faculty_id(id, name),
          subject:subject_id(id, code, name),
          section:section_id(id, name, program)
        )
      `)
      .eq("isDisabled", true)
      .order("updatedAt", { ascending: false })
    if (error) throw error
    return (data || []) as unknown[]
  },
  async deleteDisabled(ids) {
    let q = supabase.from("evaluations").delete().eq("isDisabled", true)
    if (ids && ids.length > 0) {
      q = q.in("id", ids)
    }
    const { error } = await q
    if (error) throw error
  },
  async invalidateByFacultySubjectAndEvaluator(facultySubjectId, evaluatorId, remarks) {
    const { error } = await supabase
      .from("evaluations")
      .update({ status: "INVALID", remarks, isDisabled: true, updatedAt: new Date().toISOString() })
      .eq("facultySubjectId", facultySubjectId)
      .eq("evaluatorId", evaluatorId)
    if (error) throw error
  },
  async invalidateById(id, remarks) {
    const { error } = await supabase
      .from("evaluations")
      .update({ isDisabled: true, status: "INVALID", remarks })
      .eq("id", id)
    if (error) throw error
  },
  async invalidateByEvaluatorAndPeriod(evaluatorId, facultySubjectId, evaluationPeriodId, remarks) {
    const { error } = await supabase
      .from("evaluations")
      .update({ isDisabled: true, status: "INVALID", remarks })
      .eq("evaluatorId", evaluatorId)
      .eq("facultySubjectId", facultySubjectId)
      .eq("evaluation_period_id", evaluationPeriodId)
    if (error) throw error
  },
  async listSubmittedWithSentiment(evaluationPeriodId) {
    const { data, error } = await supabase
      .from("evaluations")
      .select("id, evaluateeId")
      .eq("evaluation_period_id", evaluationPeriodId)
      .eq("status", "SUBMITTED")
      .eq("isDisabled", false)
      .not("facultySubjectId", "is", null)
    if (error) throw error
    if (!data || data.length === 0) return []

    const evalIds = [...new Set(data.map((e) => e.id))]
    const commentResults = await Promise.all(
      chunkStrIds(evalIds, IN_CHUNK_SIZE).map((ids) =>
        supabase
          .from("evaluation_comments")
          .select("evaluationId, sentimentScore")
          .in("evaluationId", ids),
      ),
    )
    const commentRows = commentResults.flatMap((res) => res.data || [])

    const sentByEval = new Map<string, { sentimentScore: number | null }[]>()
    for (const c of commentRows || []) {
      if (!sentByEval.has(c.evaluationId)) sentByEval.set(c.evaluationId, [])
      sentByEval.get(c.evaluationId)!.push(c)
    }

    const result: { evaluateeId: string; sentimentScore: number | null }[] = []
    for (const row of data) {
      const comments = sentByEval.get(row.id) ?? []
      for (const c of comments) {
        result.push({ evaluateeId: row.evaluateeId, sentimentScore: c.sentimentScore })
      }
    }
    return result
  },
  async listSubmittedEvaluateeIds(evaluationPeriodId) {
    const { data, error } = await supabase
      .from("evaluations")
      .select("evaluateeId")
      .eq("evaluation_period_id", evaluationPeriodId)
      .eq("status", "SUBMITTED")
      .eq("isDisabled", false)
      .not("facultySubjectId", "is", null)
    if (error) throw error
    return [...new Set((data || []).map((e) => e.evaluateeId))]
  },
  async invalidateByFacultySubject(facultySubjectId, remarks) {
    const { error } = await supabase
      .from("evaluations")
      .update({ status: "INVALID", remarks, isDisabled: true, updatedAt: new Date().toISOString() })
      .eq("facultySubjectId", facultySubjectId)
    if (error) throw error
  },
  async countSubmittedByFacultyIds(facultyIds) {
    if (facultyIds.length === 0) return 0
    const { count, error } = await supabase
      .from("evaluations")
      .select("id", { count: "exact", head: true })
      .eq("status", "SUBMITTED")
      .in("evaluateeId", facultyIds)
    if (error) throw error
    return count ?? 0
  },
  async countDistinctSubmittedEvaluateesByFacultyIds(facultyIds) {
    if (facultyIds.length === 0) return { total: 0, distinctEvaluatees: 0 }
    const { data, error } = await supabase
      .from("evaluations")
      .select("evaluateeId")
      .eq("status", "SUBMITTED")
      .in("evaluateeId", facultyIds)
    if (error) throw error
    const rows = (data || []) as { evaluateeId: string }[]
    const distinct = new Set(rows.map((r) => r.evaluateeId))
    return { total: rows.length, distinctEvaluatees: distinct.size }
  },
  async listSubmittedByPeriodAndEvaluatee(evaluationPeriodId, evaluateeId) {
    const { data, error } = await supabase
      .from("evaluations")
      .select("id, evaluateeId, facultySubjectId, submittedAt")
      .eq("evaluation_period_id", evaluationPeriodId)
      .eq("evaluateeId", evaluateeId)
      .eq("status", "SUBMITTED")
    if (error) throw error
    return (data || []) as EvaluationListItem[]
  },
  async listSubmittedByPeriodAndEvaluatees(evaluationPeriodId, evaluateeIds) {
    if (evaluateeIds.length === 0) return []
    // Chunked .in(): evaluateeIds is every faculty in a department, which
    // overflows PostgREST's ~8KB URL cap and answers 400.
    // Paged .range(): one chunk still asks for every evaluation of up to 100
    // faculty, and PostgREST's db-max-rows (1,000) truncates that with HTTP
    // 200 and no error — so the rows have to be paged out. Ordered by id (the
    // primary key, so a total order) to keep the pages from overlapping.
    const results = await Promise.all(
      chunkStrIds([...new Set(evaluateeIds)], IN_CHUNK_SIZE).map(async (ids) => {
        const rows: EvaluationListItem[] = []
        let offset = 0
        for (;;) {
          const { data, error } = await supabase
            .from("evaluations")
            .select("id, evaluateeId, facultySubjectId, submittedAt")
            .eq("evaluation_period_id", evaluationPeriodId)
            .eq("status", "SUBMITTED")
            .in("evaluateeId", ids)
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1)
          if (error) throw error
          const page = (data || []) as EvaluationListItem[]
          rows.push(...page)
          if (page.length < PAGE_SIZE) break
          offset += PAGE_SIZE
        }
        return rows
      }),
    )
    return results.flat() as EvaluationListItem[]
  },
  async listSubmittedByPeriodAndEvaluateeAndFS(evaluationPeriodId, evaluateeId, facultySubjectId) {
    const { data, error } = await supabase
      .from("evaluations")
      .select("id, evaluatorId, submittedAt, createdAt")
      .eq("evaluation_period_id", evaluationPeriodId)
      .eq("evaluateeId", evaluateeId)
      .eq("facultySubjectId", facultySubjectId)
      .eq("status", "SUBMITTED")
      .order("submittedAt", { ascending: true })
    if (error) throw error
    return (data || []) as EvaluationDetailItem[]
  },
  async listSubmittedByPeriodAndFacultySubjectIds(evaluationPeriodId, facultySubjectIds) {
    if (facultySubjectIds.length === 0) return []
    const { data, error } = await supabase
      .from("evaluations")
      .select("id, evaluatorId, submittedAt, createdAt, facultySubjectId")
      .eq("evaluation_period_id", evaluationPeriodId)
      .eq("status", "SUBMITTED")
      .in("facultySubjectId", facultySubjectIds)
      .order("submittedAt", { ascending: true })
    if (error) throw error
    return (data || []) as EvaluationDetailItem[]
  },
  async listStatusByPeriodAndFacultySubjectIds(evaluationPeriodId, facultySubjectIds) {
    if (facultySubjectIds.length === 0) return []
    // Chunked .in(): PostgREST caps URL length (~8KB). A semester's full
    // faculty-subject list in one .in() overflows the URL and PostgREST
    // answers 400, which surfaces as a 500 on the route.
    const results = await Promise.all(
      chunkStrIds([...new Set(facultySubjectIds)], IN_CHUNK_SIZE).map((ids) =>
        supabase
          .from("evaluations")
          .select("id, evaluatorId, status, isDisabled, submittedAt, facultySubjectId")
          .eq("evaluation_period_id", evaluationPeriodId)
          .in("facultySubjectId", ids),
      ),
    )
    for (const res of results) {
      if (res.error) throw res.error
    }
    return results.flatMap((res) => (res.data || [])).map((r) => ({
      id: r.id,
      evaluatorId: r.evaluatorId,
      status: r.status as "DRAFT" | "SUBMITTED" | "INVALID",
      isDisabled: r.isDisabled ?? false,
      submittedAt: r.submittedAt,
      facultySubjectId: r.facultySubjectId,
    })) as EvaluationStatusItem[]
  },
  async countSubmittedByFacultySubjectIds(evaluationPeriodId, facultySubjectIds) {
    if (facultySubjectIds.length === 0) return {}
    // Status-report counter: chunked .in() (URL cap) + .range() pages
    // (PostgREST 1000-row cap). Tallies DISTINCT evaluators per mapping.
    const IN_CHUNK = 100
    const PAGE = 1000
    const sets = new Map<string, Set<string>>()
    for (let i = 0; i < facultySubjectIds.length; i += IN_CHUNK) {
      const chunk = facultySubjectIds.slice(i, i + IN_CHUNK)
      let offset = 0
      for (;;) {
        const { data, error } = await supabase
          .from("evaluations")
          .select("evaluatorId, facultySubjectId")
          .eq("evaluation_period_id", evaluationPeriodId)
          .eq("status", "SUBMITTED")
          .in("facultySubjectId", chunk)
          .order("facultySubjectId", { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (error) throw error
        const rows = data || []
        for (const r of rows) {
          if (!r.facultySubjectId) continue
          if (!sets.has(r.facultySubjectId)) sets.set(r.facultySubjectId, new Set())
          sets.get(r.facultySubjectId)!.add(r.evaluatorId)
        }
        if (rows.length < PAGE) break
        offset += PAGE
      }
    }
    const out: Record<string, number> = {}
    for (const [k, v] of sets) out[k] = v.size
    return out
  },
  async listRatingsByEvaluationIds(evaluationIds) {
    if (evaluationIds.length === 0) return []
    return fetchRatingsWithCategories(supabase, evaluationIds) as Promise<EvaluationRatingRow[]>
  },
  async listCommentsByEvaluationIds(evaluationIds) {
    if (evaluationIds.length === 0) return []
    const results = await Promise.all(
      chunkStrIds([...new Set(evaluationIds)], IN_CHUNK_SIZE).map((ids) =>
        supabase
          .from("evaluation_comments")
          .select("evaluationId, sentimentScore")
          .in("evaluationId", ids),
      ),
    )
    for (const res of results) {
      if (res.error) throw res.error
    }
    return results.flatMap((res) => res.data || []) as EvaluationCommentLight[]
  },
  async listFullCommentsByEvaluationIds(evaluationIds) {
    if (evaluationIds.length === 0) return []
    const results = await Promise.all(
      chunkStrIds([...new Set(evaluationIds)], IN_CHUNK_SIZE).map((ids) =>
        supabase
          .from("evaluation_comments")
          .select("id, evaluationId, comment, sentimentLabel, sentimentScore")
          .in("evaluationId", ids),
      ),
    )
    for (const res of results) {
      if (res.error) throw res.error
    }
    return results.flatMap((res) => res.data || []) as EvaluationCommentFull[]
  },
  async countBySemesterId(semesterId) {
    const { count, error } = await supabase
      .from("evaluations")
      .select("id", { count: "exact", head: true })
      .eq("semesterId", semesterId)
    if (error) throw error
    return count ?? 0
  },
  async listByUser(userId, limit = 100) {
    const { data, error } = await supabase
      .from("evaluations")
      .select("id, evaluatorId, evaluateeId, createdAt")
      .or(`evaluatorId.eq.${userId},evaluateeId.eq.${userId}`)
      .limit(limit)
    if (error) throw error
    return (data || []) as EvaluationData[]
  },
}
