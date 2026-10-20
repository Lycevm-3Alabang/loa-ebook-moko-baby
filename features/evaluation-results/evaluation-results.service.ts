import {
  evaluationResultRepository,
  userRepository,
  evaluationRepository,
  evaluationPeriodRepository,
  facultySubjectRepository,
  subjectRepository,
  sectionRepository,
  semesterRepository,
} from "@/lib/repositories/factory"
import {
  computeCategoryAverages,
  computeGeneralRating,
  mapCategoryAveragesToColumns,
  findHighestLowestRubrics,
  computeSentimentScore,
  getRemark,
  aggregateFacultyResults,
  aggregateDepartmentResults,
  type FacultyAggregate,
  type DepartmentAggregate,
} from "@/lib/evaluation-utils"

export interface DepartmentSubjectResult {
  facultySubjectId: string
  facultyId: string
  facultyName: string
  facultyEmail: string
  subjectId: string
  subjectCode: string
  subjectName: string
  sectionProgram: string | null
  sectionName: string | null
  totalRespondents: number
  avgRating: number | null
  remarks: string | null
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  highestRubrics: { key: string; label: string; score: number }[]
  lowestRubrics: { key: string; label: string; score: number }[]
  sentimentScore: number | null
}

export interface DepartmentResults {
  subjects: DepartmentSubjectResult[]
  facultyAggregates: Record<string, FacultyAggregate>
  departmentAggregate: DepartmentAggregate | null
}

export interface DepartmentTeachingFaculty {
  id: string
  name: string
  email: string
}

/**
 * The people who teach in a department this term: the faculty with an
 * assignment that counts under the department. The same rule the results
 * pages use, so a dean's roster and their results page agree.
 *
 * The term is the active evaluation period's semester, falling back to the
 * active semester when no period is open.
 */
export async function getDepartmentTeachingFaculty(
  departmentId: string,
): Promise<DepartmentTeachingFaculty[]> {
  const [period, activeSemester] = await Promise.all([
    evaluationPeriodRepository.findActive(),
    semesterRepository.findActive(),
  ])
  const semesterId = period?.semesterId ?? activeSemester?.id ?? null
  if (!semesterId) return []
  const roster = await evaluationResultRepository.listSemesterRoster(semesterId)
  return roster[departmentId] ?? []
}

export async function getDepartmentSubjectResults(
  evaluationPeriodId: string,
  departmentId: string,
): Promise<DepartmentResults> {
  // The department's own subjects: the evaluated assignments that count
  // under this department.
  const assignments = await evaluationResultRepository.listDepartmentAssignments(departmentId, evaluationPeriodId)
  if (assignments.length === 0) return { subjects: [], facultyAggregates: {}, departmentAggregate: null }

  const assignmentIds = new Set(assignments.map((a) => a.id))
  const facIds = [...new Set(assignments.map((a) => a.faculty_id))]

  // The chain does not filter deletedAt, so a soft-deleted faculty can be in
  // the set - fetch their row too, or their rows would read "Unknown".
  const facUsers = await userRepository.listByIds(facIds, { includeDeleted: true })
  const facNameMap = new Map(facUsers.map((u) => [u.id, u]))

  const evals = await evaluationRepository.listSubmittedByPeriodAndEvaluatees(evaluationPeriodId, facIds)
  // Keep only the evaluations of THIS department's assignments: a faculty may
  // teach in more than one department.
  const deptEvals = evals.filter((e) => !!e.facultySubjectId && assignmentIds.has(e.facultySubjectId))
  if (deptEvals.length === 0) return { subjects: [], facultyAggregates: {}, departmentAggregate: null }

  const fsIds = [...new Set(deptEvals.map((e) => e.facultySubjectId).filter(Boolean))] as string[]
  const facultySubjects = await facultySubjectRepository.findByIds(fsIds)
  const subjects = await subjectRepository.findByIds([...new Set(facultySubjects.map((fs) => fs.subject_id))])
  const fsMap = new Map(facultySubjects.map((fs) => [fs.id, fs]))
  const subjMap = new Map(subjects.map((s) => [s.id, s]))

  // Sections are few, so resolve them in memory from the row's OWN section.
  const allSections = await sectionRepository.list()
  const sectionById = new Map(allSections.map((s) => [s.id, s]))

  // Match the detail page's eval set: evaluatee must equal the subject's faculty.
  const validEvals = deptEvals.filter((ev) => {
    if (!ev.facultySubjectId) return false
    const fs = fsMap.get(ev.facultySubjectId)
    return !!fs && fs.faculty_id === ev.evaluateeId
  })
  if (validEvals.length === 0) return { subjects: [], facultyAggregates: {}, departmentAggregate: null }

  const evaluationIds = validEvals.map((e) => e.id)

  const [ratings, commentsRaw] = await Promise.all([
    evaluationRepository.listRatingsByEvaluationIds(evaluationIds),
    evaluationRepository.listCommentsByEvaluationIds(evaluationIds),
  ])

  const commentsByEval = new Map<string, { sentimentScore: number | null }[]>()
  for (const c of commentsRaw) {
    if (!commentsByEval.has(c.evaluationId)) commentsByEval.set(c.evaluationId, [])
    commentsByEval.get(c.evaluationId)!.push(c)
  }

  const groupEvalMap = new Map<string, string[]>()
  for (const ev of validEvals) {
    const key = ev.facultySubjectId as string
    if (!groupEvalMap.has(key)) groupEvalMap.set(key, [])
    groupEvalMap.get(key)!.push(ev.id)
  }

  const out: DepartmentSubjectResult[] = []
  for (const [fsKey, evalIds] of groupEvalMap) {
    const fs = fsMap.get(fsKey)
    if (!fs) continue
    const user = facNameMap.get(fs.faculty_id)
    const subj = subjMap.get(fs.subject_id)
    const section = fs.section_id ? sectionById.get(fs.section_id) : undefined

    const groupRatings = ratings.filter((r) => evalIds.includes(r.evaluationId))
    const catAverages = computeCategoryAverages(groupRatings)
    const general = computeGeneralRating(catAverages)
    const catColumns = mapCategoryAveragesToColumns(catAverages)
    const rubrics = findHighestLowestRubrics(catColumns)

    const groupComments = evalIds.flatMap((eid) => commentsByEval.get(eid) ?? [])
    const sentiment = computeSentimentScore(groupComments)

    out.push({
      facultySubjectId: fsKey,
      facultyId: fs.faculty_id,
      facultyName: user?.name ?? "Unknown",
      facultyEmail: user?.email ?? "",
      subjectId: fs.subject_id,
      subjectCode: subj?.code ?? "",
      subjectName: subj?.name ?? "",
      sectionProgram: section?.program ?? null,
      sectionName: section?.name ?? null,
      totalRespondents: evalIds.length,
      avgRating: general,
      remarks: getRemark(general),
      professionalManner: catColumns.professionalManner,
      communicationWithStudent: catColumns.communicationWithStudent,
      studentEngagement: catColumns.studentEngagement,
      learningMaterials: catColumns.learningMaterials,
      timeManagement: catColumns.timeManagement,
      experientialLearning: catColumns.experientialLearning,
      respectUniqueness: catColumns.respectUniqueness,
      assessmentAndFeedback: catColumns.assessmentAndFeedback,
      highestRubrics: rubrics.highest,
      lowestRubrics: rubrics.lowest,
      sentimentScore: sentiment,
    })
  }

  return {
    subjects: out,
    facultyAggregates: aggregateFacultyResults(validEvals, ratings, commentsRaw),
    departmentAggregate: aggregateDepartmentResults(out, ratings, commentsRaw),
  }
}
