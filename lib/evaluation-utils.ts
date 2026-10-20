import type { LiveDeptAverage, SubjectResolutionContext } from "@/lib/types"

/**
 * The shared dummy account the CSV import parks a faculty row on when the
 * row carries no faculty email. It is a real `users` row that owns real
 * `faculty_subjects` rows, so any roster built from assignments must
 * exclude it — it is a placeholder, not a person.
 */
export const UNASSIGNED_FACULTY_EMAIL = "placeholder@lyceumalabang.edu.ph"

export const CATEGORY_NAMES: Record<string, string> = {  "Professional Manner": "professionalManner",
  "Communication with Students": "communicationWithStudent",
  "Student Engagement": "studentEngagement",
  "Learning Materials": "learningMaterials",
  "Time Management": "timeManagement",
  "Experiential Learning Provided to Students": "experientialLearning",
  "Experiential Learning": "experientialLearning",
  "Respect the Uniqueness of the Students": "respectUniqueness",
  "Respect for Uniqueness": "respectUniqueness",
  "Assessment and Feedback": "assessmentAndFeedback",
}

export const CATEGORY_KEYS = [
  "professionalManner",
  "communicationWithStudent",
  "studentEngagement",
  "learningMaterials",
  "timeManagement",
  "experientialLearning",
  "respectUniqueness",
  "assessmentAndFeedback",
] as const

export type RubricKey = (typeof CATEGORY_KEYS)[number]

export const CATEGORY_LABELS: Record<RubricKey, string> = {
  professionalManner: "Professional Manner",
  communicationWithStudent: "Communication w/ Students",
  studentEngagement: "Student Engagement",
  learningMaterials: "Learning Materials",
  timeManagement: "Time Management",
  experientialLearning: "Experiential Learning",
  respectUniqueness: "Respect for Uniqueness",
  assessmentAndFeedback: "Assessment & Feedback",
}

export function getRemark(general: number | null): string | null {
  if (general === null) return null
  if (general >= 4.5) return "Outstanding"
  if (general >= 3.5) return "Very Satisfactory"
  if (general >= 2.5) return "Satisfactory"
  if (general >= 1.5) return "Unsatisfactory"
  return "Poor"
}

export interface RatingRow {
  rating: number
  rubric_items: { categoryId: string; rubric_categories: { name: string } }
}

export interface CategoryAverages {
  [categoryName: string]: number
}

export function computeCategoryAverages(ratings: RatingRow[]): CategoryAverages {
  const catRatings: Record<string, number[]> = {}
  for (const r of ratings) {
    const catName = r.rubric_items.rubric_categories.name
    if (!catRatings[catName]) catRatings[catName] = []
    catRatings[catName].push(r.rating)
  }
  const catAverages: CategoryAverages = {}
  for (const [cat, vals] of Object.entries(catRatings)) {
    catAverages[cat] = vals.reduce((a, b) => a + b, 0) / vals.length
  }
  return catAverages
}

export function computeGeneralRating(catAverages: CategoryAverages): number | null {
  const keys = Object.keys(catAverages)
  if (keys.length === 0) return null
  return Math.round(keys.reduce((sum, k) => sum + catAverages[k], 0) / keys.length * 100) / 100
}

export function mapCategoryAveragesToColumns(catAverages: CategoryAverages): Record<string, number | null> {
  const row: Record<string, number | null> = {
    professionalManner: null,
    communicationWithStudent: null,
    studentEngagement: null,
    learningMaterials: null,
    timeManagement: null,
    experientialLearning: null,
    respectUniqueness: null,
    assessmentAndFeedback: null,
  }
  for (const [catName, avg] of Object.entries(catAverages)) {
    const col = CATEGORY_NAMES[catName]
    if (col) row[col] = Math.round(avg * 100) / 100
  }
  return row
}

export function findHighestLowestRubrics(catAverages: Record<string, number | null>): {
  highest: { key: string; label: string; score: number }[]
  lowest: { key: string; label: string; score: number }[]
} {
  const entries = Object.entries(catAverages)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => ({ key: k, label: CATEGORY_LABELS[k as RubricKey] || k, score: v as number }))
  if (entries.length === 0) return { highest: [], lowest: [] }
  const maxScore = Math.max(...entries.map((e) => e.score))
  const minScore = Math.min(...entries.map((e) => e.score))
  return {
    highest: entries.filter((e) => e.score === maxScore),
    lowest: entries.filter((e) => e.score === minScore),
  }
}

export function computeSentimentScore(comments: { sentimentScore: number | null }[]): number | null {
  const scored = comments.filter((c) => c.sentimentScore !== null).map((c) => c.sentimentScore as number)
  if (scored.length === 0) return null
  return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length * 100) / 100
}

export function sectionLabel(program: string | null, name: string | null): string {
  if (program && name) return `${program}-${name}`
  return program ?? name ?? ""
}

export function getRemarkColor(remarks: string | null): string {
  switch (remarks) {
    case "Outstanding": return "bg-success-bg text-success-text"
    case "Very Satisfactory": return "bg-info-bg text-info-text"
    case "Satisfactory": return "bg-warning-bg text-warning-text"
    case "Unsatisfactory": return "bg-danger-bg text-danger-text"
    case "Poor": return "bg-danger-bg text-danger-text"
    default: return "bg-surface-tertiary text-tertiary"
  }
}

export function formatPeriodLabel(period: { name?: string; title?: string; semesterTitle?: string; id: string }): string {
  const base = period.name || period.title || period.id
  return period.semesterTitle ? `${base} — ${period.semesterTitle}` : base
}

export interface FlatSnapshotRow {
  id: string
  evaluation_period_id: string
  rubric_group_id: string
  rubric_group_name: string
  category_name: string
  category_display_order: number
  category_id: string | null
  item_text: string
  item_display_order: number
  item_weight: number
  item_id: string | null
}

export interface NestedRubricCategory {
  id: string
  name: string
  displayOrder: number
  items: { id: string; text: string; displayOrder: number; weight: number }[]
}

export function groupSnapshotRows(rows: FlatSnapshotRow[]): NestedRubricCategory[] {
  const catMap = new Map<string, NestedRubricCategory>()
  for (const row of rows) {
    const key = row.category_name
    if (!catMap.has(key)) {
      catMap.set(key, {
        id: row.category_id || `snap_${row.rubric_group_id}_${row.category_display_order}`,
        name: row.category_name,
        displayOrder: row.category_display_order,
        items: [],
      })
    }
    catMap.get(key)!.items.push({
      id: row.item_id || `snap_item_${row.rubric_group_id}_${row.category_display_order}_${row.item_display_order}`,
      text: row.item_text,
      displayOrder: row.item_display_order,
      weight: row.item_weight,
    })
  }
  return Array.from(catMap.values()).sort((a, b) => a.displayOrder - b.displayOrder)
}

// --- Aggregation helpers (extracted for testability) -----------------------

export interface FacultySummary {
  catAverages: Record<string, number>
  general: number | null
  catColumns: Record<string, number | null>
  rubrics: { highest: { key: string; label: string; score: number }[]; lowest: { key: string; label: string; score: number }[] }
  sentiment: number | null
}

export function buildFacultySummary(
  ratings: RatingRow[],
  comments: { sentimentScore: number | null }[] = [],
): FacultySummary {
  const catAverages = computeCategoryAverages(ratings)
  const general = computeGeneralRating(catAverages)
  const catColumns = mapCategoryAveragesToColumns(catAverages)
  const rubrics = findHighestLowestRubrics(catColumns)
  const sentiment = computeSentimentScore(comments)
  return { catAverages, general, catColumns, rubrics, sentiment }
}

export interface PooledAggregate {
  avgRating: number | null
  remarks: string | null
  catColumns: Record<string, number | null>
  highestRubrics: { key: string; label: string; score: number }[]
  lowestRubrics: { key: string; label: string; score: number }[]
  sentimentScore: number | null
}

/**
 * The one aggregation rule: pool a set of rating rows, then average the
 * category averages. Used at every level so a higher-level figure is the
 * same kind of number as the one below it.
 */
export function aggregatePooledResults(
  ratings: RatingRow[],
  comments: { sentimentScore: number | null }[] = [],
): PooledAggregate {
  const { general, catColumns, rubrics, sentiment } = buildFacultySummary(ratings, comments)
  return {
    avgRating: general,
    remarks: getRemark(general),
    catColumns,
    highestRubrics: rubrics.highest,
    lowestRubrics: rubrics.lowest,
    sentimentScore: sentiment,
  }
}

export interface DepartmentAggregate {
  totalSubjects: number
  uniqueFaculty: number
  totalResponses: number
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

/**
 * Assemble a department-level aggregate from its subject rows and the
 * department's pooled rating/comment rows. The averages are pooled, so the
 * department figure is the same kind of number as the faculty figure below it.
 */
export function aggregateDepartmentResults(
  subjects: { facultyId: string; totalRespondents: number }[],
  ratings: RatingRow[],
  comments: { sentimentScore: number | null }[] = [],
): DepartmentAggregate {
  const pooled = aggregatePooledResults(ratings, comments)
  return {
    totalSubjects: subjects.length,
    uniqueFaculty: new Set(subjects.map((s) => s.facultyId)).size,
    totalResponses: subjects.reduce((sum, s) => sum + s.totalRespondents, 0),
    avgRating: pooled.avgRating,
    remarks: pooled.remarks,
    professionalManner: pooled.catColumns.professionalManner ?? null,
    communicationWithStudent: pooled.catColumns.communicationWithStudent ?? null,
    studentEngagement: pooled.catColumns.studentEngagement ?? null,
    learningMaterials: pooled.catColumns.learningMaterials ?? null,
    timeManagement: pooled.catColumns.timeManagement ?? null,
    experientialLearning: pooled.catColumns.experientialLearning ?? null,
    respectUniqueness: pooled.catColumns.respectUniqueness ?? null,
    assessmentAndFeedback: pooled.catColumns.assessmentAndFeedback ?? null,
    highestRubrics: pooled.highestRubrics,
    lowestRubrics: pooled.lowestRubrics,
    sentimentScore: pooled.sentimentScore,
  }
}

export interface FacultyRatingRow extends RatingRow {
  evaluationId: string
}

export interface FacultyCommentRow {
  evaluationId: string
  sentimentScore: number | null
}

export interface FacultyAggregate {
  facultyId: string
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

/**
 * Pool a faculty's evaluation set into one aggregate, keyed by facultyId.
 * Uses the same chain as the per-facultySubject detail page
 * (buildFacultySummary), so a faculty headline equals the detail page's
 * pooled figure instead of a mean of per-subject means.
 */
export function aggregateFacultyResults(
  evals: { id: string; evaluateeId: string }[],
  ratings: FacultyRatingRow[],
  comments: FacultyCommentRow[],
): Record<string, FacultyAggregate> {
  const evalIdsByFaculty = new Map<string, string[]>()
  for (const ev of evals) {
    const list = evalIdsByFaculty.get(ev.evaluateeId)
    if (list) list.push(ev.id)
    else evalIdsByFaculty.set(ev.evaluateeId, [ev.id])
  }

  const out: Record<string, FacultyAggregate> = {}
  for (const [facultyId, evalIds] of evalIdsByFaculty) {
    const idSet = new Set(evalIds)
    const pooled = aggregatePooledResults(
      ratings.filter((r) => idSet.has(r.evaluationId)),
      comments.filter((c) => idSet.has(c.evaluationId)),
    )
    out[facultyId] = {
      facultyId,
      totalRespondents: evalIds.length,
      avgRating: pooled.avgRating,
      remarks: pooled.remarks,
      professionalManner: pooled.catColumns.professionalManner ?? null,
      communicationWithStudent: pooled.catColumns.communicationWithStudent ?? null,
      studentEngagement: pooled.catColumns.studentEngagement ?? null,
      learningMaterials: pooled.catColumns.learningMaterials ?? null,
      timeManagement: pooled.catColumns.timeManagement ?? null,
      experientialLearning: pooled.catColumns.experientialLearning ?? null,
      respectUniqueness: pooled.catColumns.respectUniqueness ?? null,
      assessmentAndFeedback: pooled.catColumns.assessmentAndFeedback ?? null,
      highestRubrics: pooled.highestRubrics,
      lowestRubrics: pooled.lowestRubrics,
      sentimentScore: pooled.sentimentScore,
    }
  }
  return out
}

export interface FacultyDeptInput {
  facultyId: string
  deptId: string
  evalCount: number
  ratings: RatingRow[]
}

export interface DeptResolutionContext extends SubjectResolutionContext {
  facultySubjects: { faculty_id: string; section_id: string | null; semesterId: string | null }[]
  semesterId: string | null
}

/**
 * The faculty-level department rule: the user's home department, else the
 * teaching chain.
 *
 * SUPERSEDED for the results surfaces by `resolveSubjectDepartment`, which
 * resolves the department of an evaluated subject by its section. Kept for
 * callers that need a person's department rather than a subject's — do not
 * use it to decide which department owns an evaluation.
 */
export function resolveFacultyDepartment(facultyId: string, ctx: DeptResolutionContext): string | null {
  const direct = ctx.userDept.get(facultyId)
  if (direct) return direct
  if (!ctx.semesterId) return null
  const fs = ctx.facultySubjects.find((f) => f.faculty_id === facultyId && f.semesterId === ctx.semesterId)
  if (!fs || !fs.section_id) return null
  const dcId = ctx.sections.get(fs.section_id)
  if (!dcId) return null
  return ctx.departmentCourses.get(dcId) ?? null
}

export interface SubjectDepartmentInput {
  faculty_id: string
  section_id: string | null
}

export interface WarningAssignment {
  faculty_id: string
  section_id: string | null
  semesterId: string | null
}

/**
 * The integrity conditions in a set of assignments: the ones whose department
 * cannot be resolved, and the ones that belong to another semester than the
 * period. With a scope, only that department's conditions come back — the
 * department-less assignments belong to no department, so they fall outside
 * every scope.
 *
 * Pure: the caller decides how a department is resolved, and supplies the
 * assignments it already holds.
 */
export function classifyWarningAssignments(
  assignments: WarningAssignment[],
  departmentOf: (assignment: WarningAssignment) => string | null,
  periodSemesterId: string | null,
  scopeDepartmentId?: string,
): { unattributed: WarningAssignment[]; offSemester: WarningAssignment[] } {
  const unattributed = assignments.filter((a) => departmentOf(a) === null)
  const offSemester = periodSemesterId
    ? assignments.filter((a) => a.semesterId !== periodSemesterId)
    : []
  return {
    unattributed: scopeDepartmentId ? [] : unattributed,
    offSemester: scopeDepartmentId
      ? offSemester.filter((a) => departmentOf(a) === scopeDepartmentId)
      : offSemester,
  }
}

/**
 * The department that owns an evaluated subject: the section's department
 * (section -> department_course -> department). The faculty's home
 * department is the fallback for a section whose course cannot be resolved.
 *
 * Unlike the faculty-level rule, this does not depend on the period's
 * semester: a section belongs to its course, and a course belongs to a
 * department, in every term. A subject that resolves to null here is an
 * integrity condition, not an unassigned person.
 */
export function resolveSubjectDepartment(
  subject: SubjectDepartmentInput,
  ctx: SubjectResolutionContext,
): string | null {
  if (subject.section_id) {
    const dcId = ctx.sections.get(subject.section_id)
    if (dcId) {
      const deptId = ctx.departmentCourses.get(dcId)
      if (deptId) return deptId
    }
  }
  return ctx.userDept.get(subject.faculty_id) ?? null
}

/**
 * The inverse of resolveFacultyDepartment: the candidates whose department is
 * this one. Uses the same helper, so the forward and the backward direction
 * can never disagree.
 */
export function resolveDepartmentFaculties(
  departmentId: string,
  candidateFacultyIds: string[],
  ctx: DeptResolutionContext,
): string[] {
  return candidateFacultyIds.filter((id) => resolveFacultyDepartment(id, ctx) === departmentId)
}

export function buildLiveDeptAverages(inputs: FacultyDeptInput[]): LiveDeptAverage[] {
  const groups = new Map<string, {
    facultyIds: Set<string>
    respondents: number
    ratings: RatingRow[]
  }>()
  for (const inp of inputs) {
    const { general } = buildFacultySummary(inp.ratings)
    if (general === null) continue
    let g = groups.get(inp.deptId)
    if (!g) {
      g = { facultyIds: new Set(), respondents: 0, ratings: [] }
      groups.set(inp.deptId, g)
    }
    g.facultyIds.add(inp.facultyId)
    g.respondents += inp.evalCount
    g.ratings.push(...inp.ratings)
  }
  return [...groups.entries()].map(([departmentId, g]) => {
    const pooled = aggregatePooledResults(g.ratings)
    return {
      departmentId,
      facultyIds: [...g.facultyIds],
      totalRespondents: g.respondents,
      avgRating: pooled.avgRating,
      remarks: pooled.remarks,
      catAverages: pooled.catColumns,
      highestRubrics: pooled.highestRubrics,
      lowestRubrics: pooled.lowestRubrics,
    }
  })
}
