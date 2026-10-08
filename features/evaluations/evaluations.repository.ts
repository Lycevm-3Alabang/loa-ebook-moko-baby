import { supabase } from "@/lib/db"
import { fetchRatingsWithCategories } from "@/lib/db/common"
import type { EvaluationData, EvaluationComment, EvaluationCommentWithEvaluation, IEvaluationRepository, EvaluationListItem, EvaluationDetailItem, EvaluationRatingRow, EvaluationCommentLight, EvaluationCommentFull, PendingEvaluationItem } from "@/lib/types"

const DUMMY_FACULTY_EMAIL_EVAL = "placeholder@lyceumalabang.edu.ph"

export const evaluationRepository: IEvaluationRepository = {
  async findPending(evaluatorId, evaluationPeriodId) {
    const { data: enrollments, error: enrollErr } = await supabase
      .from("student_enrollments")
      .select("faculty_subject_id, section_id")
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
        .select("id, faculty_id, subject_id")
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

      return facultySubjects
        .filter((fs) => !skipFsIds.has(fs.id) && fs.faculty_id !== dummyId)
        .map(
          (fs): PendingEvaluationItem => ({
            evaluateeId: fs.faculty_id,
            facultySubjectId: fs.id,
            subjectId: fs.subject_id,
          }),
        )
    }

    const sectionIds = enrollments.map((r) => r.section_id)
    const { data: facultySubjects, error: fsErr } = await supabase
      .from("faculty_subjects")
      .select("id, faculty_id, subject_id")
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

    return facultySubjects
      .filter((fs) => !skipFsIds.has(fs.id) && fs.faculty_id !== dummyId)
      .map(
        (fs): PendingEvaluationItem => ({
          evaluateeId: fs.faculty_id,
          facultySubjectId: fs.id,
          subjectId: fs.subject_id,
        }),
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
    if (error) throw error
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

    const evalIds = data.map((e) => e.id)
    const { data: commentRows } = await supabase
      .from("evaluation_comments")
      .select("evaluationId, sentimentScore")
      .in("evaluationId", evalIds)

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
    const { data, error } = await supabase
      .from("evaluations")
      .select("id, evaluateeId, facultySubjectId, submittedAt")
      .eq("evaluation_period_id", evaluationPeriodId)
      .eq("status", "SUBMITTED")
      .in("evaluateeId", evaluateeIds)
    if (error) throw error
    return (data || []) as EvaluationListItem[]
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
  async listRatingsByEvaluationIds(evaluationIds) {
    if (evaluationIds.length === 0) return []
    return fetchRatingsWithCategories(supabase, evaluationIds) as Promise<EvaluationRatingRow[]>
  },
  async listCommentsByEvaluationIds(evaluationIds) {
    if (evaluationIds.length === 0) return []
    const { data, error } = await supabase
      .from("evaluation_comments")
      .select("evaluationId, sentimentScore")
      .in("evaluationId", evaluationIds)
    if (error) throw error
    return (data || []) as EvaluationCommentLight[]
  },
  async listFullCommentsByEvaluationIds(evaluationIds) {
    if (evaluationIds.length === 0) return []
    const { data, error } = await supabase
      .from("evaluation_comments")
      .select("id, evaluationId, comment, sentimentLabel, sentimentScore")
      .in("evaluationId", evaluationIds)
    if (error) throw error
    return (data || []) as EvaluationCommentFull[]
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
