import { supabase } from "@/lib/db"
import { fetchRatingsWithCategories } from "@/lib/db/common"
import type { EvaluationResultData, IEvaluationResultRepository, StudentBreakdownItem, FacultyEvalDetail } from "@/lib/types"

export const evaluationResultRepository: IEvaluationResultRepository = {
  async list(evaluationPeriodId, filters) {
    let q = supabase.from("evaluation_results").select("*").eq("evaluation_period_id", evaluationPeriodId)
    if (filters?.departmentId) q = q.eq("departmentId", filters.departmentId)
    if (filters?.facultyId) q = q.eq("facultyId", filters.facultyId)
    const { data, error } = await q
    if (error) throw error
    return data as EvaluationResultData[]
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

    const [ratings, usersResult, existingResult] = await Promise.all([
      fetchRatingsWithCategories(supabase, allEvalIds),
      supabase.from("users").select("id, departmentId").in("id", allFacultyIds),
      supabase
        .from("evaluation_results")
        .select("id, facultyId")
        .eq("evaluation_period_id", evaluationPeriodId)
        .in("facultyId", allFacultyIds),
    ])
    if (usersResult.error) throw usersResult.error
    if (existingResult.error) throw existingResult.error

    const users = usersResult.data || []
    const existingResults = existingResult.data || []

    const evalRatingsMap = new Map<string, typeof ratings>()
    for (const r of ratings) {
      if (!evalRatingsMap.has(r.evaluationId)) evalRatingsMap.set(r.evaluationId, [])
      evalRatingsMap.get(r.evaluationId)!.push(r)
    }

    const userDeptMap = new Map(users.map((u) => [u.id, u.departmentId]))

    const facIdsWithNullDept = allFacultyIds.filter((id) => !userDeptMap.get(id))
    if (facIdsWithNullDept.length > 0 && semesterId) {
      const { data: fsRows } = await supabase
        .from("faculty_subjects")
        .select("faculty_id, section_id")
        .in("faculty_id", facIdsWithNullDept)
        .eq("semesterId", semesterId)

      if (fsRows && fsRows.length > 0) {
        const sectionIds = [...new Set(fsRows.map((r) => r.section_id).filter(Boolean))]
        if (sectionIds.length > 0) {
          const { data: sectionRows } = await supabase
            .from("sections")
            .select("id, departmentCourseId")
            .in("id", sectionIds)

          if (sectionRows && sectionRows.length > 0) {
            const dcIds = [...new Set(sectionRows.map((r) => r.departmentCourseId).filter(Boolean))]
            if (dcIds.length > 0) {
              const { data: dcRows } = await supabase
                .from("department_courses")
                .select("id, departmentId")
                .in("id", dcIds)

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

    const existingMap = new Map(existingResults.map((r) => [r.facultyId, r.id]))

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
  const { data: results, error: resErr } = await supabase
    .from("evaluation_results")
    .select("*")
    .eq("evaluation_period_id", evaluationPeriodId)
    .eq("departmentId", departmentId)
  if (resErr) throw resErr
  if (!results || results.length === 0) return []

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
