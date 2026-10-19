import { supabase } from "@/lib/db"
import { fetchRatingsWithCategories } from "@/lib/db/common"
import { buildLiveDeptAverages, resolveFacultyDepartment, resolveDepartmentFaculties } from "@/lib/evaluation-utils"
import type { RatingRow, DeptResolutionContext } from "@/lib/evaluation-utils"
import type { EvaluationResultData, IEvaluationResultRepository, LiveDeptAverage, StudentBreakdownItem, FacultyEvalDetail } from "@/lib/types"
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

export const evaluationResultRepository: IEvaluationResultRepository = {
  async list(evaluationPeriodId, filters) {
    let q = supabase.from("evaluation_results").select("*").eq("evaluation_period_id", evaluationPeriodId)
    if (filters?.departmentId) q = q.eq("departmentId", filters.departmentId)
    if (filters?.facultyId) q = q.eq("facultyId", filters.facultyId)
    const { data, error } = await q
    if (error) throw error
    return data as EvaluationResultData[]
  },

  async getLatestComputedAt(evaluationPeriodId) {
    const { data, error } = await supabase
      .from("evaluation_results")
      .select("computedAt")
      .eq("evaluation_period_id", evaluationPeriodId)
      .order("computedAt", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return (data?.computedAt as string | null) ?? null
  },

  async findByFaculty(evaluationPeriodId, facultyId) {
    const { data, error } = await supabase
      .from("evaluation_results")
      .select("*")
      .eq("evaluation_period_id", evaluationPeriodId)
      .eq("facultyId", facultyId)
      .single()
    if (error) {
      if (error.code === "PGRST116") return null
      throw error
    }
    return data as EvaluationResultData
  },

  async compute(evaluationPeriodId, facultyId) {
    const filterFaculty = facultyId ? { evaluateeId: facultyId } : {}
    const { data: evals, error: evErr } = await supabase
      .from("evaluations")
      .select("id, evaluateeId, facultySubjectId")
      .eq("evaluation_period_id", evaluationPeriodId)
      .eq("status", "SUBMITTED")
      .eq("isDisabled", false)
      .not("facultySubjectId", "is", null)
      .match(filterFaculty)
    if (evErr) throw evErr
    if (!evals || evals.length === 0) return

    const facEvalMap = new Map<string, string[]>()
    const allEvalIds: string[] = []
    for (const ev of evals) {
      allEvalIds.push(ev.id)
      if (!facEvalMap.has(ev.evaluateeId)) facEvalMap.set(ev.evaluateeId, [])
      facEvalMap.get(ev.evaluateeId)!.push(ev.id)
    }

    const allFacultyIds = Array.from(facEvalMap.keys())

    const { data: evalPeriod } = await supabase
      .from("evaluation_periods")
      .select("semesterId")
      .eq("id", evaluationPeriodId)
      .single()

    const semesterId = evalPeriod?.semesterId

    const uniqueFacultyIds = [...new Set(allFacultyIds)]
    const facultyChunks = chunkStrIds(uniqueFacultyIds, IN_CHUNK_SIZE)
    const [ratings, usersResults, existingResults] = await Promise.all([
      fetchRatingsWithCategories(supabase, allEvalIds),
      Promise.all(
        facultyChunks.map((ids) =>
          supabase.from("users").select("id, departmentId").in("id", ids),
        ),
      ),
      Promise.all(
        facultyChunks.map((ids) =>
          supabase
            .from("evaluation_results")
            .select("id, facultyId")
            .eq("evaluation_period_id", evaluationPeriodId)
            .in("facultyId", ids),
        ),
      ),
    ])
    for (const res of [...usersResults, ...existingResults]) {
      if (res.error) throw res.error
    }

    const users = usersResults.flatMap((res) => res.data || [])
    const existingResultsRows = existingResults.flatMap((res) => res.data || [])

    const evalRatingsMap = new Map<string, typeof ratings>()
    for (const r of ratings) {
      if (!evalRatingsMap.has(r.evaluationId)) evalRatingsMap.set(r.evaluationId, [])
      evalRatingsMap.get(r.evaluationId)!.push(r)
    }

    const userDeptMap = new Map(users.map((u) => [u.id, u.departmentId]))

    const facIdsWithNullDept = allFacultyIds.filter((id) => !userDeptMap.get(id))
    if (facIdsWithNullDept.length > 0 && semesterId) {
      const fsResults = await Promise.all(
        chunkStrIds([...new Set(facIdsWithNullDept)], IN_CHUNK_SIZE).map((ids) =>
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

              if (dcRows && dcRows.length > 0) {
                const dcDeptMap = new Map(dcRows.map((r) => [r.id, r.departmentId]))
                const sectionDeptMap = new Map(
                  sectionRows.map((r) => [r.id, dcDeptMap.get(r.departmentCourseId)])
                )

                for (const fs of fsRows) {
                  const deptId = sectionDeptMap.get(fs.section_id)
                  if (deptId && !userDeptMap.get(fs.faculty_id)) {
                    userDeptMap.set(fs.faculty_id, deptId)
                  }
                }
              }
            }
          }
        }
      }
    }

    const existingMap = new Map(existingResultsRows.map((r) => [r.facultyId, r.id]))

    const nameToColumn: Record<string, string> = {
      "Professional Manner": "professionalManner",
      "Communication with Students": "communicationWithStudent",
      "Student Engagement": "studentEngagement",
      "Learning Materials": "learningMaterials",
      "Time Management": "timeManagement",
      "Experiential Learning Provided to Students": "experientialLearning",
      "Respect the Uniqueness of the Students": "respectUniqueness",
      "Assessment and Feedback": "assessmentAndFeedback",
    }

    const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = []
    const toInsert: Array<Record<string, unknown>> = []

    for (const [facId, evaluationIds] of facEvalMap) {
      if (evaluationIds.length === 0) continue

      const facRatings = evaluationIds.flatMap((eid) => evalRatingsMap.get(eid) || [])

      const catRatings: Record<string, number[]> = {}
      for (const r of facRatings as unknown as Array<{ rating: number; rubric_items: { categoryId: string; rubric_categories: { name: string } } }>) {
        const catName = r.rubric_items.rubric_categories.name
        if (!catRatings[catName]) catRatings[catName] = []
        catRatings[catName].push(r.rating)
      }

      const catAverages: Record<string, number> = {}
      for (const [cat, vals] of Object.entries(catRatings)) {
        catAverages[cat] = vals.reduce((a, b) => a + b, 0) / vals.length
      }

      const general = Object.keys(catAverages).length > 0
        ? Object.values(catAverages).reduce((a, b) => a + b, 0) / Object.keys(catAverages).length
        : null

      let remarks: string | null = null
      if (general !== null) {
        if (general >= 4.5) remarks = "Outstanding"
        else if (general >= 3.5) remarks = "Very Satisfactory"
        else if (general >= 2.5) remarks = "Satisfactory"
        else if (general >= 1.5) remarks = "Unsatisfactory"
        else remarks = "Poor"
      }

      const updateData: Record<string, unknown> = {
        totalRespondents: evaluationIds.length,
        generalRating: general ? Math.round(general * 100) / 100 : null,
        remarks,
        departmentId: userDeptMap.get(facId) ?? null,
        computedAt: new Date().toISOString(),
      }

      for (const [catName, avg] of Object.entries(catAverages)) {
        const col = nameToColumn[catName]
        if (col) {
          updateData[col] = Math.round(avg * 100) / 100
        }
      }

      const existingId = existingMap.get(facId)
      if (existingId) {
        toUpdate.push({ id: existingId, data: updateData })
      } else {
        toInsert.push({ evaluation_period_id: evaluationPeriodId, semesterId, facultyId: facId, ...updateData })
      }
    }

    const results = await Promise.all([
      ...toUpdate.map(({ id, data }) => supabase.from("evaluation_results").update(data).eq("id", id)),
      ...(toInsert.length > 0 ? [supabase.from("evaluation_results").insert(toInsert)] : []),
    ])
    for (const res of results) {
      if (res.error) throw res.error
    }

    const { data: allExisting } = await supabase
      .from("evaluation_results")
      .select("id, facultyId")
      .eq("evaluation_period_id", evaluationPeriodId)
    if (allExisting && allExisting.length > 0) {
      const staleIds = allExisting
        .filter((r) => !facEvalMap.has(r.facultyId))
        .map((r) => r.id)
      if (staleIds.length > 0) {
        const { error: delErr } = await supabase
          .from("evaluation_results")
          .delete()
          .in("id", staleIds)
        if (delErr) throw delErr
      }
    }
  },

  async computeAll(evaluationPeriodId) {
    await this.compute(evaluationPeriodId)
  },

  /**
   * Live per-department averages computed from submitted evals (no cache read,
   * no writes). The department figure is POOLED over the department's rating
   * rows, the same rule the detail page and the faculty card use. Faculty with
   * no usable ratings contribute nothing, so placeholder and rating-less rows
   * can never blank a department average.
   */
  async listLiveDeptAverages(evaluationPeriodId): Promise<LiveDeptAverage[]> {
    const evals = await listSubmittedEvaluates(evaluationPeriodId)
    if (evals.length === 0) return []

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

    const ratingsByEval = new Map<string, typeof ratings>()
    for (const r of ratings) {
      if (!ratingsByEval.has(r.evaluationId)) ratingsByEval.set(r.evaluationId, [])
      ratingsByEval.get(r.evaluationId)!.push(r)
    }

    // Live home department per faculty, same chain as compute(), resolved via
    // the pure resolveFacultyDepartment helper (single source of truth).
    const deptOf = new Map<string, string | null>()
    for (const facId of facIds) {
      deptOf.set(facId, resolveFacultyDepartment(facId, ctx))
    }

    const inputs: { facultyId: string; deptId: string; evalCount: number; ratings: RatingRow[] }[] = []
    for (const [facId, eids] of facEvalMap) {
      const facRatings = eids.flatMap((eid) => ratingsByEval.get(eid) ?? [])
      if (facRatings.length === 0) continue
      const deptId = deptOf.get(facId) ?? "__unknown__"
      inputs.push({ facultyId: facId, deptId, evalCount: eids.length, ratings: facRatings as unknown as RatingRow[] })
    }

    return buildLiveDeptAverages(inputs)
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
    if (error) throw error
    return count ?? 0
  },
  async listByFacultyId(facultyId, limit = 100) {
    const { data, error } = await supabase
      .from("evaluation_results")
      .select("*")
      .eq("facultyId", facultyId)
      .limit(limit)
    if (error) throw error
    return (data || []) as EvaluationResultData[]
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

export async function getDeanDetails(
  evaluationPeriodId: string,
  departmentId: string,
): Promise<FacultyEvalDetail[]> {
  // Live home department — do not filter by evaluation_results.departmentId (stale snapshot).
  const { data: allResults, error: resErr } = await supabase
    .from("evaluation_results")
    .select("*")
    .eq("evaluation_period_id", evaluationPeriodId)
  if (resErr) throw resErr
  if (!allResults || allResults.length === 0) return []

  const allFacIds = allResults.map((r) => r.facultyId)
  const { data: deptUsers, error: duErr } = await supabase
    .from("users")
    .select("id, departmentId")
    .in("id", allFacIds)
  if (duErr) throw duErr
  const liveDept = new Map((deptUsers || []).map((u) => [u.id, u.departmentId as string | null]))
  const results = allResults.filter((r) => liveDept.get(r.facultyId) === departmentId)
  if (results.length === 0) return []

  const facultyIds = results.map((r) => r.facultyId)

  const { data: users, error: uErr } = await supabase
    .from("users")
    .select("id, name")
    .in("id", facultyIds)
  if (uErr) throw uErr
  const nameMap = new Map((users || []).map((u) => [u.id, u.name]))

  const studentsMap = await getStudentBreakdownsForFaculties(evaluationPeriodId, facultyIds)
  const details: FacultyEvalDetail[] = results.map((r) => ({
    facultyId: r.facultyId,
    facultyName: nameMap.get(r.facultyId) || r.facultyId,
    totalRespondents: r.totalRespondents,
    generalRating: r.generalRating,
    remarks: r.remarks,
    professionalManner: r.professionalManner,
    communicationWithStudent: r.communicationWithStudent,
    studentEngagement: r.studentEngagement,
    learningMaterials: r.learningMaterials,
    timeManagement: r.timeManagement,
    experientialLearning: r.experientialLearning,
    respectUniqueness: r.respectUniqueness,
    assessmentAndFeedback: r.assessmentAndFeedback,
    students: studentsMap.get(r.facultyId) || [],
  }))
  return details
}
