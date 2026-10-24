import {
  evaluationResultRepository,
  userRepository,
  evaluationRepository,
  evaluationPeriodRepository,
  facultySubjectRepository,
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
  computeItemAverages,
  type CategoryAverages,
  type FacultyAggregate,
  type DepartmentAggregate,
  type ItemAverage,
} from "@/lib/evaluation-utils"
import type { IntegrityWarnings, EvaluationAssignment, UserData } from "@/lib/types"
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
): Promise<{ departments: DepartmentResultsRow[]; warnings: IntegrityWarnings }> {
  const [figures, allDepts, facultyCounts] = await Promise.all([
    evaluationResultRepository.listPeriodFigures(evaluationPeriodId, departmentId),
    departmentRepository.listAll(),
    getFacultyCountsByDepartment(),
  ])

  const figureByDept = new Map(figures.departments.map((f) => [f.departmentId, f]))
  // EVERY department, not only the ones with responses: a department with no
  // results in this period is a row with no rating, not a missing row. The
  // headcount and the export's summary both carry it, so the list did not.
  const departments: DepartmentResultsRow[] = []
  for (const dept of allDepts) {
    if (departmentId && dept.id !== departmentId) continue
    const figure = figureByDept.get(dept.id)
    departments.push({
      departmentId: dept.id,
      departmentName: dept.name ?? "Unknown",
      departmentCode: dept.code ?? "",
      facultyCount: facultyCounts[dept.id] ?? 0,
      totalRespondents: figure?.totalRespondents ?? 0,
      avgRating: null,
      remarks: null,
      highestRubrics: [],
      lowestRubrics: [],
      sentimentScore: null,
    })
  }
  // A stable order while the figures land: the page sorts once they are all
  // in, and a table that re-sorts under the reader is worse than one that
  // sorts a moment later.
  departments.sort((a, b) => a.departmentName.localeCompare(b.departmentName))

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
  /**
   * The department's own faculty — the accounts homed in it. The cards are
   * them, with or without results (contract §3.15): a member with nothing to
   * show is still a member.
   */
  members: DepartmentMember[]
}

/** One member of the department: the account, and how to reach them. */
export interface DepartmentMember {
  id: string
  name: string
  email: string
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
 * The department's own faculty — the accounts homed in it (contract §3.15,
 * §3.17). The one membership set: the dean's guards, the drill-down's rows
 * and the headcount all read it.
 *
 * The set does not depend on the period: a teacher homed in the department is
 * a member of it, whether or not they have an assignment this term.
 */
export async function getDepartmentMembers(departmentId: string): Promise<UserData[]> {
  return userRepository.listFacultyByDepartment(departmentId)
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
  const members: DepartmentMember[] = set.members.map((m) => ({ id: m.id, name: m.name, email: m.email }))
  if (members.length === 0) return { subjects: [], facultyAggregates: {}, departmentAggregate: null, members: [] }

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
  if (assignments.size === 0) return { subjects: [], facultyAggregates: {}, departmentAggregate: null, members }

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
    // Faculty averages use their displayed subject rows; the department
    // average equally weights those faculty averages. Categories and
    // sentiment remain pooled from response data.
    facultyAggregates: aggregateFacultyResults(
      set.evaluations,
      ratings,
      commentsRaw,
      out.map(({ facultyId, avgRating }) => ({ facultyId, avgRating })),
    ),
    departmentAggregate: aggregateDepartmentResults(out, ratings, commentsRaw),
    members,
  }
}

// ── the subject page's result set ──────────────────────────────────────────

/** One evaluation of a subject, as the subject page and the export both show it. */
export interface SubjectEvaluationRow {
  evaluationId: string
  submittedAt: string | null
  generalRating: number | null
  /**
   * ⭐ The LIVE per-response averages — the rubric's category names to this
   * response's average for each. The eight columns below are the APP's fixed
   * model; this map is the rubric's own, so an export whose columns follow the
   * rubric has the values to put under them. It is computed from the ratings
   * the read already has, so carrying it costs nothing and adds no query.
   */
  categoryAverages: CategoryAverages
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  comment: string | null
  sentimentLabel: string | null
  sentimentScore: number | null
}

/**
 * One subject's result set: everything the subject page shows AND everything
 * the Excel export writes.
 *
 * The page and the export read the SAME set, so they cannot disagree - the
 * export is not a second implementation of the figures, it is a second
 * RENDERING of one read. (That is the same parity rule the surfaces live by:
 * contract §3.18.)
 */
export interface SubjectResultSet {
  facultySubjectId: string
  faculty: { id: string; name: string; email: string; employeeNo: string | null } | null
  subject: { id: string; code: string; name: string } | null
  section: { program: string | null; name: string | null }
  period: { name: string | null; semesterTitle: string | null; rubricGroupId: string | null }
  /** the counted responses, one row each */
  evaluations: SubjectEvaluationRow[]
  /** the comments the responses left, with their dates */
  comments: { submittedAt: string | null; comment: string }[]
  summary: {
    totalRespondents: number
    avgRating: number | null
    remarks: string | null
    /** the criterion averages, keyed by the rubric's category name */
    categoryAverages: Record<string, number>
    highestRubrics: { key: string; label: string; score: number }[]
    lowestRubrics: { key: string; label: string; score: number }[]
  }
  /** the per-statement averages, in the rubric's order */
  itemAverages: ItemAverage[]
}

/**
 * One subject's result set.
 *
 * The GUARDS stay with the caller - they are per role, and the dean and the
 * admin do not see the same subjects. What is shared is the READ, so the
 * page and the export can never show different numbers.
 *
 * Null when the assignment does not exist.
 */
export async function getSubjectResultSet(
  facultySubjectId: string,
  evaluationPeriodId: string,
): Promise<SubjectResultSet | null> {  const fsData = await facultySubjectRepository.findById(facultySubjectId)
  if (!fsData) return null

  const [faculty, subject, section, period] = await Promise.all([
    userRepository.findById(fsData.faculty_id),
    subjectRepository.findById(fsData.subject_id),
    fsData.section_id ? sectionRepository.findById(fsData.section_id) : Promise.resolve(null),
    evaluationPeriodRepository.findById(evaluationPeriodId),
  ])

  const evals = await evaluationRepository.listSubmittedByPeriodAndEvaluateeAndFS(
    evaluationPeriodId,
    fsData.faculty_id,
    facultySubjectId,
  )
  const evaluationIds = evals.map((e) => e.id)

  const [ratings, comments] = await Promise.all([
    evaluationRepository.listRatingsByEvaluationIds(evaluationIds),
    evaluationRepository.listFullCommentsByEvaluationIds(evaluationIds),
  ])

  const commentsByEval = new Map<string, typeof comments>()
  for (const c of comments) {
    if (!commentsByEval.has(c.evaluationId)) commentsByEval.set(c.evaluationId, [])
    commentsByEval.get(c.evaluationId)!.push(c)
  }

  const catAverages = computeCategoryAverages(ratings)
  const general = computeGeneralRating(catAverages)
  const catColumns = mapCategoryAveragesToColumns(catAverages)
  const rubrics = findHighestLowestRubrics(catColumns)

  const evaluations: SubjectEvaluationRow[] = evals.map((ev) => {
    const evalRatings = ratings.filter((r) => r.evaluationId === ev.id)
    const evalCatAverages = computeCategoryAverages(evalRatings)
    const evalGeneral = computeGeneralRating(evalCatAverages)
    const evalCatColumns = mapCategoryAveragesToColumns(evalCatAverages)
    const evalComments = commentsByEval.get(ev.id) ?? []
    return {
      evaluationId: ev.id,
      submittedAt: ev.submittedAt,
      generalRating: evalGeneral,
      // ⭐ the LIVE map, not the eight columns - the rubric's own criteria and
      // what this response scored against each of them
      categoryAverages: evalCatAverages,
      professionalManner: evalCatColumns.professionalManner,
      communicationWithStudent: evalCatColumns.communicationWithStudent,
      studentEngagement: evalCatColumns.studentEngagement,
      learningMaterials: evalCatColumns.learningMaterials,
      timeManagement: evalCatColumns.timeManagement,
      experientialLearning: evalCatColumns.experientialLearning,
      respectUniqueness: evalCatColumns.respectUniqueness,
      assessmentAndFeedback: evalCatColumns.assessmentAndFeedback,
      comment: evalComments.length > 0 ? evalComments[0].comment : null,
      sentimentLabel: evalComments.length > 0 ? evalComments[0].sentimentLabel : null,
      sentimentScore: evalComments.length > 0 ? evalComments[0].sentimentScore : null,
    }
  })

  return {
    facultySubjectId,
    faculty: faculty
      ? {
          id: faculty.id,
          name: faculty.name,
          email: faculty.email,
          employeeNo: faculty.employeeNo,
        }
      : null,
    subject: subject ? { id: subject.id, code: subject.code, name: subject.name } : null,
    section: { program: section?.program ?? null, name: section?.name ?? null },
    period: {
      name: period?.name ?? null,
      semesterTitle: period?.semesterTitle ?? null,
      rubricGroupId: period?.rubricGroupId ?? null,
    },
    evaluations,
    comments: evals
      .filter((ev) => (commentsByEval.get(ev.id) ?? []).length > 0)
      .map((ev) => ({
        submittedAt: ev.submittedAt,
        comment: (commentsByEval.get(ev.id) ?? [])[0].comment,
      })),
    summary: {
      totalRespondents: evaluations.length,
      avgRating: general,
      remarks: getRemark(general),
      categoryAverages: catAverages,
      highestRubrics: rubrics.highest,
      lowestRubrics: rubrics.lowest,
    },
    itemAverages: computeItemAverages(ratings),
  }
}
