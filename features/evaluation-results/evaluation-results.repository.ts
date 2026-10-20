import { supabase } from "@/lib/db"
import { fetchRatingsWithCategories } from "@/lib/db/common"
import { buildLiveDeptAverages, buildFacultySummary, getRemark, resolveFacultyDepartment, resolveDepartmentFaculties } from "@/lib/evaluation-utils"
import type { RatingRow, DeptResolutionContext } from "@/lib/evaluation-utils"
import type { IEvaluationResultRepository, LiveDeptAverage, LiveFacultyResult, StudentBreakdownItem, EvaluationVisibilityRow } from "@/lib/types"
import { semesterRepository } from "@/lib/repositories/factory"

export class EvaluationPeriodInactiveError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// PostgREST caps URL length (~8KB). Chunk large .in() lists to stay under it.
const IN_CHUNK_SIZE = 100

function chunkStrIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

/** The period's submitted, enabled evaluations — the candidate faculty set. */
async function listSubmittedEvaluates(evaluationPeriodId: string): Promise<{ id: string; evaluateeId: string }[]> {
  const { data, error } = await supabase
    .from("evaluations")
    .select("id, evaluateeId")
    .eq("evaluation_period_id", evaluationPeriodId)
    .eq("status", "SUBMITTED")
    .eq("isDisabled", false)
    .not("facultySubjectId", "is", null)
  if (error) throw error
  return data || []
}

/**
 * The chain context the pure resolveFacultyDepartment helper needs: the users'
 * department, the faculty's subject rows, the section -> course -> department
 * map, and the period's semester. Staged on purpose — the chain lookups run
 * only for the faculty WITHOUT a users.departmentId.
 */
async function loadDeptResolutionContext(
  evaluationPeriodId: string,
  facultyIds: string[],
): Promise<DeptResolutionContext> {
  const [evalPeriod, usersResults] = await Promise.all([
    supabase.from("evaluation_periods").select("semesterId").eq("id", evaluationPeriodId).single(),
    Promise.all(
      chunkStrIds([...new Set(facultyIds)], IN_CHUNK_SIZE).map((ids) =>
        supabase.from("users").select("id, departmentId").in("id", ids),
      ),
    ),
  ])
  for (const res of usersResults) {
    if (res.error) throw res.error
  }
  const usersRows = usersResults.flatMap((res) => res.data || [])
  const semesterId = evalPeriod.data?.semesterId ?? null
  const userDept = new Map<string, string | null>(usersRows.map((u) => [u.id, u.departmentId as string | null]))

  const nullFacIds = facultyIds.filter((id) => !userDept.get(id))
  const facultySubjects: { faculty_id: string; section_id: string | null; semesterId: string | null }[] = []
  const sections = new Map<string, string | null>()
  const departmentCourses = new Map<string, string | null>()

  if (nullFacIds.length > 0 && semesterId) {
    const fsResults = await Promise.all(
      chunkStrIds([...new Set(nullFacIds)], IN_CHUNK_SIZE).map((ids) =>
        supabase
          .from("faculty_subjects")
          .select("faculty_id, section_id")
          .in("faculty_id", ids)
          .eq("semesterId", semesterId),
      ),
    )
    for (const res of fsResults) {
      if (res.error) throw res.error
    }
    const fsRows = fsResults.flatMap((res) => res.data || [])
    facultySubjects.push(...fsRows.map((r) => ({ faculty_id: r.faculty_id, section_id: r.section_id, semesterId })))

    if (fsRows.length > 0) {
      const sectionIds = [...new Set(fsRows.map((r) => r.section_id).filter(Boolean))]
      if (sectionIds.length > 0) {
        const sectionResults = await Promise.all(
          chunkStrIds(sectionIds as string[], IN_CHUNK_SIZE).map((ids) =>
            supabase
              .from("sections")
              .select("id, departmentCourseId")
              .in("id", ids),
          ),
        )
        for (const res of sectionResults) {
          if (res.error) throw res.error
        }
        const sectionRows = sectionResults.flatMap((res) => res.data || [])
        for (const s of sectionRows) sections.set(s.id, s.departmentCourseId)

        if (sectionRows.length > 0) {
          const dcIds = [...new Set(sectionRows.map((r) => r.departmentCourseId).filter(Boolean))]
          if (dcIds.length > 0) {
            const dcResults = await Promise.all(
              chunkStrIds(dcIds as string[], IN_CHUNK_SIZE).map((ids) =>
                supabase
                  .from("department_courses")
                  .select("id, departmentId")
                  .in("id", ids),
              ),
            )
            for (const res of dcResults) {
              if (res.error) throw res.error
            }
            const dcRows = dcResults.flatMap((res) => res.data || [])
            for (const dc of dcRows) departmentCourses.set(dc.id, dc.departmentId)
          }
        }
      }
    }
  }

  return { userDept, facultySubjects, sections, departmentCourses, semesterId }
}

interface LivePeriodData {
  ctx: DeptResolutionContext
  facEvalMap: Map<string, string[]>
  ratingsByEval: Map<string, RatingRow[]>
}

/** The period's submitted evals, the chain context and every rating row. */
async function loadLivePeriodData(evaluationPeriodId: string): Promise<LivePeriodData | null> {
  const evals = await listSubmittedEvaluates(evaluationPeriodId)
  if (evals.length === 0) return null

  const facEvalMap = new Map<string, string[]>()
  for (const ev of evals) {
    if (!facEvalMap.has(ev.evaluateeId)) facEvalMap.set(ev.evaluateeId, [])
    facEvalMap.get(ev.evaluateeId)!.push(ev.id)
  }
  const facIds = [...facEvalMap.keys()]

  const [ctx, ratings] = await Promise.all([
    loadDeptResolutionContext(evaluationPeriodId, facIds),
    fetchRatingsWithCategories(supabase, evals.map((e) => e.id)),
  ])

  const ratingsByEval = new Map<string, RatingRow[]>()
  for (const r of ratings) {
    if (!ratingsByEval.has(r.evaluationId)) ratingsByEval.set(r.evaluationId, [])
    ratingsByEval.get(r.evaluationId)!.push(r)
  }

  return { ctx, facEvalMap, ratingsByEval }
}

export const evaluationResultRepository: IEvaluationResultRepository = {
  async listLiveDeptAverages(evaluationPeriodId): Promise<LiveDeptAverage[]> {
    const live = await loadLivePeriodData(evaluationPeriodId)
    if (!live) return []
    const { ctx, facEvalMap, ratingsByEval } = live

    // Live home department per faculty, same chain as compute(), resolved via
    // the pure resolveFacultyDepartment helper (single source of truth).
    const deptOf = new Map<string, string | null>()
    for (const facId of facEvalMap.keys()) {
      deptOf.set(facId, resolveFacultyDepartment(facId, ctx))
    }

    const inputs: { facultyId: string; deptId: string; evalCount: number; ratings: RatingRow[] }[] = []
    for (const [facId, eids] of facEvalMap) {
      const facRatings = eids.flatMap((eid) => ratingsByEval.get(eid) ?? [])
      if (facRatings.length === 0) continue
      const deptId = deptOf.get(facId) ?? "__unknown__"
      inputs.push({ facultyId: facId, deptId, evalCount: eids.length, ratings: facRatings })
    }

    return buildLiveDeptAverages(inputs)
  },

  /**
   * Per-faculty live results, pooled over that faculty's rating rows with the
   * same chain the detail page uses. The row shape matches the cached rows the
   * report service used to read, so it is a source swap, not a rewrite.
   */
  async listLiveFacultyResults(evaluationPeriodId: string): Promise<LiveFacultyResult[]> {
    const live = await loadLivePeriodData(evaluationPeriodId)
    if (!live) return []

    const out: LiveFacultyResult[] = []
    for (const [facultyId, eids] of live.facEvalMap) {
      const facRatings = eids.flatMap((eid) => live.ratingsByEval.get(eid) ?? [])
      if (facRatings.length === 0) continue
      const { general, catColumns } = buildFacultySummary(facRatings)
      out.push({
        facultyId,
        totalRespondents: eids.length,
        generalRating: general,
        remarks: getRemark(general),
        professionalManner: catColumns.professionalManner ?? null,
        communicationWithStudent: catColumns.communicationWithStudent ?? null,
        studentEngagement: catColumns.studentEngagement ?? null,
        learningMaterials: catColumns.learningMaterials ?? null,
        timeManagement: catColumns.timeManagement ?? null,
        experientialLearning: catColumns.experientialLearning ?? null,
        respectUniqueness: catColumns.respectUniqueness ?? null,
        assessmentAndFeedback: catColumns.assessmentAndFeedback ?? null,
      })
    }
    return out
  },

  /**
   * The faculty of one department, resolved with the SAME chain the top-level
   * page uses (users.departmentId, else faculty_subjects -> sections ->
   * department_courses) and the same candidate population, so the two surfaces
   * cover the same faculty and print the same pooled numbers.
   */
  async listDepartmentFacultyIds(departmentId: string, evaluationPeriodId: string): Promise<string[]> {
    const evals = await listSubmittedEvaluates(evaluationPeriodId)
    if (evals.length === 0) return []

    const candidateIds = [...new Set(evals.map((e) => e.evaluateeId))]
    const ctx = await loadDeptResolutionContext(evaluationPeriodId, candidateIds)
    return resolveDepartmentFaculties(departmentId, candidateIds, ctx)
  },

  async setVisibility(evaluationPeriodId, facultyIds, visible) {
    const { data: ep } = await supabase
      .from("evaluation_periods")
      .select("semesterId")
      .eq("id", evaluationPeriodId)
      .single()
    const semesterId = ep?.semesterId

    const { data: existing } = await supabase
      .from("evaluation_results")
      .select("facultyId")
      .eq("evaluation_period_id", evaluationPeriodId)
      .in("facultyId", facultyIds)

    const existingSet = new Set((existing || []).map((r) => r.facultyId))
    const toUpdate = facultyIds.filter((id) => existingSet.has(id))
    const toInsert = facultyIds.filter((id) => !existingSet.has(id))

    if (toUpdate.length > 0) {
      const { error } = await supabase
        .from("evaluation_results")
        .update({ is_results_visible: visible })
        .eq("evaluation_period_id", evaluationPeriodId)
        .in("facultyId", toUpdate)
      if (error) throw error
    }

    if (toInsert.length > 0) {
      const { error } = await supabase
        .from("evaluation_results")
        .insert(toInsert.map((facultyId) => ({
          evaluation_period_id: evaluationPeriodId,
          semesterId,
          facultyId,
          is_results_visible: visible,
          totalRespondents: 0,
        })))
      if (error) throw error
    }
  },

  async getVisibilityMap(evaluationPeriodId) {
    const { data, error } = await supabase
      .from("evaluation_results")
      .select("facultyId, is_results_visible")
      .eq("evaluation_period_id", evaluationPeriodId)
    if (error) throw error
    return new Map((data || []).map((r) => [r.facultyId, r.is_results_visible]))
  },
  async countBySemesterId(semesterId) {
    const { count, error } = await supabase
      .from("evaluation_results")
      .select("id", { count: "exact", head: true })
      .eq("semesterId", semesterId)
      .eq("is_results_visible", true)
    if (error) throw error
    return count ?? 0
  },
  async listByFacultyId(facultyId, limit = 100) {
    const { data, error } = await supabase
      .from("evaluation_results")
      .select("id, evaluation_period_id, semesterId, facultyId, is_results_visible")
      .eq("facultyId", facultyId)
      .limit(limit)
    if (error) throw error
    return (data || []) as EvaluationVisibilityRow[]
  },

  async assertPeriodIsActive(evaluationPeriodId: string) {
    const { data: period, error: pErr } = await supabase
      .from("evaluation_periods")
      .select("semesterId")
      .eq("id", evaluationPeriodId)
      .single()
    if (pErr) {
      if (pErr.code === "PGRST116") {
        throw new EvaluationPeriodInactiveError("Evaluation period not found", 404)
      }
      throw pErr
    }
    if (!period) {
      throw new EvaluationPeriodInactiveError("Evaluation period not found", 404)
    }
    const activeSemester = await semesterRepository.findActive()
    if (!activeSemester || period.semesterId !== activeSemester.id) {
      throw new EvaluationPeriodInactiveError(
        "Results for this period are not available — only the active semester's results can be viewed. Ask ADMIN to activate the correct semester.",
        403,
      )
    }
  },
}

const nameToColumn: Record<string, keyof StudentBreakdownItem> = {
  "Professional Manner": "professionalManner",
  "Communication with Students": "communicationWithStudent",
  "Student Engagement": "studentEngagement",
  "Learning Materials": "learningMaterials",
  "Time Management": "timeManagement",
  "Experiential Learning Provided to Students": "experientialLearning",
  "Respect the Uniqueness of the Students": "respectUniqueness",
  "Assessment and Feedback": "assessmentAndFeedback",
}

export async function getStudentBreakdownsForFaculty(
  evaluationPeriodId: string,
  facultyId: string,
): Promise<StudentBreakdownItem[]> {
  const result = await getStudentBreakdownsForFaculties(evaluationPeriodId, [facultyId])
  return result.get(facultyId) || []
}

async function getStudentBreakdownsForFaculties(
  evaluationPeriodId: string,
  facultyIds: string[],
): Promise<Map<string, StudentBreakdownItem[]>> {
  if (facultyIds.length === 0) return new Map()

  const { data: evals, error: evErr } = await supabase
    .from("evaluations")
    .select(`
      id,
      evaluateeId
    `)
    .eq("evaluation_period_id", evaluationPeriodId)
    .in("evaluateeId", facultyIds)
    .eq("status", "SUBMITTED")
    .eq("isDisabled", false)
    .not("facultySubjectId", "is", null)
  if (evErr) throw evErr
  if (!evals || evals.length === 0) return new Map()

  const allEvalIds = evals.map((e) => e.id)

  const [allRatings, commentsResult] = await Promise.all([
    fetchRatingsWithCategories(supabase, allEvalIds),
    supabase
      .from("evaluation_comments")
      .select("id, evaluationId, comment, sentimentLabel, sentimentScore")
      .in("evaluationId", allEvalIds),
  ])
  if (commentsResult.error) throw commentsResult.error

  const commentsByEval = new Map<string, Array<{ comment: string; sentimentLabel: string | null; sentimentScore: number | null }>>()
  for (const c of commentsResult.data || []) {
    if (!commentsByEval.has(c.evaluationId)) commentsByEval.set(c.evaluationId, [])
    commentsByEval.get(c.evaluationId)!.push(c)
  }

  const ratingsByEval = new Map<string, typeof allRatings>()
  for (const r of allRatings) {
    if (!ratingsByEval.has(r.evaluationId)) ratingsByEval.set(r.evaluationId, [])
    ratingsByEval.get(r.evaluationId)!.push(r)
  }

  const result = new Map<string, StudentBreakdownItem[]>()
  for (const facultyId of facultyIds) result.set(facultyId, [])

  for (const ev of evals as Array<Record<string, unknown>>) {
    const evaluateeId = ev.evaluateeId as string
    const ratings = ratingsByEval.get(ev.id as string) || []
    const comments = commentsByEval.get(ev.id as string) || []

    const catScores: Record<string, number[]> = {}
    for (const r of ratings) {
      const catName = r.rubric_items.rubric_categories.name
      if (!catScores[catName]) catScores[catName] = []
      catScores[catName].push(r.rating)
    }

    const item: StudentBreakdownItem = {
      professionalManner: null,
      communicationWithStudent: null,
      studentEngagement: null,
      learningMaterials: null,
      timeManagement: null,
      experientialLearning: null,
      respectUniqueness: null,
      assessmentAndFeedback: null,
      generalRating: null,
      comment: comments.length > 0 ? comments[0].comment : null,
      sentimentLabel: comments.length > 0 ? comments[0].sentimentLabel : null,
      sentimentScore: comments.length > 0 ? comments[0].sentimentScore : null,
    }

    let catAvgSum = 0
    let catCount = 0
    for (const [catName, vals] of Object.entries(catScores)) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      const col = nameToColumn[catName]
      if (col) {
        ;(item as unknown as Record<string, unknown>)[col] = Math.round(avg * 100) / 100
        catAvgSum += avg
        catCount++
      }
    }
    if (catCount > 0) {
      item.generalRating = Math.round((catAvgSum / catCount) * 100) / 100
    }

    result.get(evaluateeId)!.push(item)
  }

  return result
}
