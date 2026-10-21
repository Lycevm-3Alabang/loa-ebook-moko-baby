import {
  evaluationResultRepository,
  userRepository,
  evaluationRepository,
  evaluationPeriodRepository,
  subjectRepository,
  sectionRepository,
  semesterRepository,
  departmentRepository,
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
import type { AttributionWarnings, EvaluationAssignment, UserData } from "@/lib/types"
import { getFacultyCountsByDepartment } from "@/features/users/users.service"

/** One row of the results list: a department and its figures for a period. */
export interface DepartmentResultsRow {
  departmentId: string
  departmentName: string
  departmentCode: string
  /** The department's own faculty — the accounts homed in it. */
  facultyCount: number
  totalRespondents: number
  avgRating: number | null
  remarks: string | null
  highestRubrics: { key: string; label: string; score: number }[]
  lowestRubrics: { key: string; label: string; score: number }[]
  sentimentScore: number | null
}

/**
 * The results list's rows: one per department that has responses in the
 * period, with the department's own faculty count and its response count.
 *
 * The list is assembled from the app's own reads — the departments, the
 * faculty homed in each one, and the period's evaluations — so no direct
 * database connection is needed. With a department id, only that department's
 * row comes back (the dean's scope).
 */
export async function getDepartmentResults(
  evaluationPeriodId: string,
  departmentId?: string,
): Promise<{ departments: DepartmentResultsRow[]; warnings: AttributionWarnings }> {
  const [figures, allDepts, facultyCounts] = await Promise.all([
    evaluationResultRepository.listPeriodFigures(evaluationPeriodId, departmentId),
    departmentRepository.listAll(),
    getFacultyCountsByDepartment(),
  ])

  const deptMap = new Map(allDepts.map((d) => [d.id, d]))
  const departments: DepartmentResultsRow[] = []
  for (const figure of figures.departments) {
    if (departmentId && figure.departmentId !== departmentId) continue
    const dept = deptMap.get(figure.departmentId)
    if (!dept) continue
    departments.push({
      departmentId: figure.departmentId,
      departmentName: dept.name ?? "Unknown",
      departmentCode: dept.code ?? "",
      facultyCount: facultyCounts[figure.departmentId] ?? 0,
      totalRespondents: figure.totalRespondents,
      avgRating: null,
      remarks: null,
      highestRubrics: [],
      lowestRubrics: [],
      sentimentScore: null,
    })
  }

  return { departments, warnings: figures.warnings }
}

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

/**
 * The department's own teaching: the assignments of the faculty homed in it
 * (contract §3.15). The one place the membership set is decided - the
 * results page, the dean's release gate and the dean's guards all read it.
 */
export async function getDepartmentMemberTeaching(
  departmentId: string,
  evaluationPeriodId: string,
): Promise<{ assignments: EvaluationAssignment[]; users: Map<string, UserData> }> {
  const period = await evaluationPeriodRepository.findById(evaluationPeriodId)
  if (!period) return { assignments: [], users: new Map() }
  const assignments = await evaluationResultRepository.listDepartmentTeachingAssignments(departmentId, period.semesterId)
  if (assignments.length === 0) return { assignments: [], users: new Map() }

  // The chain does not filter deletedAt, so a soft-deleted faculty can be in
  // the set - fetch their row too, or their rows would read "Unknown".
  const facUsers = await userRepository.listByIds(
    [...new Set(assignments.map((a) => a.faculty_id))],
    { includeDeleted: true },
  )
  const users = new Map(facUsers.map((u) => [u.id, u]))

  // The department's OWN teaching: the assignments of the faculty homed in it
  // (contract §3.15). The resolver files a subject under the teacher's home
  // department, so these assignments are its members' - and the filter makes
  // the rows' population explicit here, where the rows are built.
  const members = assignments.filter(
    (a) => (users.get(a.faculty_id)?.departmentId ?? null) === departmentId,
  )
  return { assignments: members, users }
}

export async function getDepartmentSubjectResults(
  evaluationPeriodId: string,
  departmentId: string,
): Promise<DepartmentResults> {
  // The department's live response set — ONE set, read by the results list's
  // figure too (contract §3.21): the period's submitted and enabled
  // evaluations by the faculty homed in it, minus the ones whose assignment
  // no longer belongs to their evaluatee.
  const set = await evaluationResultRepository.listDepartmentResponseSet(departmentId, evaluationPeriodId)
  if (set.members.length === 0) return { subjects: [], facultyAggregates: {}, departmentAggregate: null }

  const memberIds = new Set(set.members.map((m) => m.id))
  const memberById = new Map(set.members.map((m) => [m.id, m]))

  // The subject list: the members' teaching this term, plus the assignments
  // the counted responses point at — so a counted response always has a row
  // (§3.16). The term's half is the teaching (evaluated or not); the other
  // half is the responses the term no longer covers.
  const period = await evaluationPeriodRepository.findById(evaluationPeriodId)
  const assignments = new Map<string, EvaluationAssignment>()
  if (period) {
    const teaching = await evaluationResultRepository.listDepartmentTeachingAssignments(departmentId, period.semesterId)
    for (const a of teaching) {
      // The members are the accounts homed in the department — the filter
      // makes the rows' population explicit here, where the rows are built.
      if (memberIds.has(a.faculty_id)) assignments.set(a.id, a)
    }
  }
  for (const [id, a] of set.assignments) assignments.set(id, a)
  if (assignments.size === 0) return { subjects: [], facultyAggregates: {}, departmentAggregate: null }

  const subjects = await subjectRepository.findByIds([...new Set([...assignments.values()].map((a) => a.subject_id))])
  const subjMap = new Map(subjects.map((s) => [s.id, s]))

  // Sections are few, so resolve them in memory from the row's OWN section.
  const allSections = await sectionRepository.list()
  const sectionById = new Map(allSections.map((s) => [s.id, s]))

  // The counted responses, grouped by the assignment they point at.
  const groupEvalMap = new Map<string, string[]>()
  for (const ev of set.evaluations) {
    const key = ev.facultySubjectId
    if (!key) continue
    const list = groupEvalMap.get(key)
    if (list) list.push(ev.id)
    else groupEvalMap.set(key, [ev.id])
  }

  const evaluationIds = set.evaluations.map((e) => e.id)

  const [ratings, commentsRaw] = await Promise.all([
    evaluationRepository.listRatingsByEvaluationIds(evaluationIds),
    evaluationRepository.listCommentsByEvaluationIds(evaluationIds),
  ])

  const commentsByEval = new Map<string, { sentimentScore: number | null }[]>()
  for (const c of commentsRaw) {
    if (!commentsByEval.has(c.evaluationId)) commentsByEval.set(c.evaluationId, [])
    commentsByEval.get(c.evaluationId)!.push(c)
  }

  const out: DepartmentSubjectResult[] = []
  // One row per subject of the department's teaching: the evaluated ones
  // carry their results, the others show no rating.
  for (const a of assignments.values()) {
    const evalIds = groupEvalMap.get(a.id) ?? []
    const user = memberById.get(a.faculty_id)
    const subj = subjMap.get(a.subject_id)
    const section = a.section_id ? sectionById.get(a.section_id) : undefined

    const groupRatings = evalIds.length > 0 ? ratings.filter((r) => evalIds.includes(r.evaluationId)) : []
    const catAverages = computeCategoryAverages(groupRatings)
    const general = computeGeneralRating(catAverages)
    const catColumns = mapCategoryAveragesToColumns(catAverages)
    const rubrics = findHighestLowestRubrics(catColumns)

    const groupComments = evalIds.flatMap((eid) => commentsByEval.get(eid) ?? [])
    const sentiment = computeSentimentScore(groupComments)

    out.push({
      facultySubjectId: a.id,
      facultyId: a.faculty_id,
      facultyName: user?.name ?? "Unknown",
      facultyEmail: user?.email ?? "",
      subjectId: a.subject_id,
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
    // The members' pooled figures. A member with no evaluation has none yet:
    // they are in the subject rows, not on a card.
    facultyAggregates: aggregateFacultyResults(set.evaluations, ratings, commentsRaw),
    departmentAggregate: aggregateDepartmentResults(out, ratings, commentsRaw),
  }
}
