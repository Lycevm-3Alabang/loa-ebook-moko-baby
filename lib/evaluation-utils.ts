import type { SubjectResolutionContext } from "@/lib/types"

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

/**
 * The category name a rating gets when its rubric item does not resolve.
 *
 * The foreign keys cascade (a rubric item's ratings go with it), so this is a
 * safety net rather than a state the schema allows. The general rating leaves
 * it out: a rating that belongs to no criterion must not move the average of
 * the criteria the report names.
 */
export const UNMAPPED_CATEGORY_NAME = ""

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

/** A category's rating total: the sum, and how many ratings are behind it. */
export interface CategoryTotal {
  sum: number
  count: number
}

/** The category totals of one group, keyed by the raw category name. */
export type CategoryTotals = Record<string, CategoryTotal>

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

/**
 * A rating row that knows its rubric item — the statement, not the criterion.
 *
 * `RatingRow` is the criterion grain: it carries the category's name and nothing
 * below it. The export's form needs the grain *below* that — one value per
 * statement — so the read carries the item's identity, text and order as well.
 */
export interface ItemRatingRow {
  rating: number
  itemId: string
  rubric_items: {
    id: string
    categoryId: string
    text: string
    displayOrder: number
    rubric_categories: { id: string; name: string; displayOrder: number }
  }
}

/** One rubric item's average over a set of rating rows. */
export interface ItemAverage {
  itemId: string
  text: string
  displayOrder: number
  categoryId: string
  categoryName: string
  categoryDisplayOrder: number
  /** The mean of the ratings for this item. Not rounded — the caller rounds. */
  avg: number
  /** How many ratings the mean is over. */
  count: number
}

/**
 * The per-ITEM averages of a set of rating rows: one entry per rubric item,
 * ordered by the criterion's order and then the item's own.
 *
 * This is the grain below `computeCategoryAverages` — the same rows, grouped by
 * the statement rather than the criterion. The mean is left raw for the same
 * reason the category mean is: the rounding belongs to whoever renders it.
 */
export function computeItemAverages(ratings: ItemRatingRow[]): ItemAverage[] {
  const acc = new Map<
    string,
    { sum: number; count: number; meta: Omit<ItemAverage, "avg" | "count"> }
  >()
  for (const r of ratings) {
    if (!r.itemId) continue
    const current = acc.get(r.itemId)
    if (current) {
      current.sum += r.rating
      current.count += 1
      continue
    }
    const item = r.rubric_items
    acc.set(r.itemId, {
      sum: r.rating,
      count: 1,
      meta: {
        itemId: r.itemId,
        text: item?.text ?? "",
        displayOrder: item?.displayOrder ?? 0,
        categoryId: item?.categoryId || UNMAPPED_CATEGORY_NAME,
        categoryName: item?.rubric_categories?.name || UNMAPPED_CATEGORY_NAME,
        categoryDisplayOrder: item?.rubric_categories?.displayOrder ?? 0,
      },
    })
  }
  return [...acc.values()]
    .map(({ sum, count, meta }) => ({ ...meta, avg: sum / count, count }))
    .sort(
      (a, b) =>
        a.categoryDisplayOrder - b.categoryDisplayOrder || a.displayOrder - b.displayOrder,
    )
}

/**
 * The category totals of a set of rating rows: the sum and the count of each
 * rubric category.
 *
 * The averages are the totals divided — but the totals are the *weights*, so
 * two groups of rows can be pooled into one number without walking the rows
 * again. That is what lets a department's figure be the pool of its faculty's
 * figures.
 */
export function computeCategoryTotals(ratings: RatingRow[]): CategoryTotals {
  const totals: CategoryTotals = {}
  for (const r of ratings) {
    const catName = r.rubric_items.rubric_categories.name
    const current = totals[catName] ?? { sum: 0, count: 0 }
    totals[catName] = { sum: current.sum + r.rating, count: current.count + 1 }
  }
  return totals
}

/**
 * The category averages from their totals — the same numbers the raw rows
 * give, without carrying the rows. The database did the grouping, so the
 * pooling rule is unchanged: a category's mean is its sum over its count, and
 * a group with no ratings has no category at all.
 */
export function computeCategoryAveragesFromTotals(totals: CategoryTotals): CategoryAverages {
  const catAverages: CategoryAverages = {}
  for (const [cat, total] of Object.entries(totals)) {
    if (!total || !total.count) continue
    catAverages[cat] = total.sum / total.count
  }
  return catAverages
}

/**
 * Two sets of category totals added together — the pool of a set of groups.
 * The pooled mean is the same weighted mean the pooled rows would give.
 */
export function poolCategoryTotals(parts: CategoryTotals[]): CategoryTotals {
  const pooled: CategoryTotals = {}
  for (const part of parts) {
    for (const [cat, total] of Object.entries(part)) {
      if (!total) continue
      const current = pooled[cat] ?? { sum: 0, count: 0 }
      pooled[cat] = { sum: current.sum + total.sum, count: current.count + total.count }
    }
  }
  return pooled
}

export function computeGeneralRating(catAverages: CategoryAverages): number | null {
  // The error bucket does not count: a rating whose rubric item no longer
  // resolves has no criterion to belong to, so it must not move the average of
  // the criteria the report names. A criterion the app has no column for IS a
  // real criterion, so it still counts.
  const keys = Object.keys(catAverages).filter((k) => k !== UNMAPPED_CATEGORY_NAME)
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

/**
 * The rubrics worth flagging: the lowest ones, and only when they are
 * critically low — "Unsatisfactory" or worse on the app's own ladder. A
 * department whose weakest criterion is still "Satisfactory" has nothing to
 * flag; a "needs attention" badge on a satisfactory criterion is noise.
 *
 * Ties come back together — every criterion at the lowest score.
 */
export function findAttentionRubrics(
  lowest: { key: string; label: string; score: number }[],
): { key: string; label: string; score: number }[] {
  if (lowest.length === 0) return []
  const remark = getRemark(lowest[0].score)
  return remark === "Unsatisfactory" || remark === "Poor" ? lowest : []
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

/**
 * A department's display label: the name, then its code in parentheses —
 * "Computer Science (BSCS)". The code is dropped when the department has
 * none. One helper so every surface labels a department the same way.
 */
export function departmentLabel(name: string | null | undefined, code?: string | null): string {
  const n = name ?? ""
  return code ? `${n} (${code})` : n
}

/**
 * Name particles that belong to the surname in front of it: "de", "dela",
 * "van", "bin" … The surname is the last name, extended left over one.
 */
const NAME_PARTICLES = new Set([
  "al", "bin", "binti", "da", "de", "del", "dela", "den", "der", "di", "la",
  "le", "los", "san", "sana", "santa", "van", "von",
])

/**
 * A person's name as "Surname, FirstName" — the order a list is read in and
 * the order a directory is sorted by. A middle name or initial stays between
 * them, as it is written.
 *
 * The surname is the last name, extended left over a particle ("de", "dela",
 * "van", …); the given name is the first; what is between them is kept **as
 * it is written** — a middle name is not shortened to an initial
 * ("Maria Lourdes Santos" → "Santos, Maria Lourdes"), and an initial that is
 * already one stays one ("Juan B. Dela Cruz" → "Dela Cruz, Juan B.").
 */
export function formatFacultyName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim()
  if (!trimmed) return ""
  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 1) return tokens[0]

  // The surname: the last token, plus the particles in front of it.
  let surnameStart = tokens.length - 1
  while (surnameStart > 1 && NAME_PARTICLES.has(tokens[surnameStart - 1].toLowerCase().replace(/\.$/, ""))) {
    surnameStart -= 1
  }
  const surname = tokens.slice(surnameStart).join(" ")
  const given = tokens[0]
  const middles = tokens.slice(1, surnameStart)
  if (!surname || !given) return trimmed

  return `${surname}, ${given}${middles.length ? ` ${middles.join(" ")}` : ""}`
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
  return aggregatePooledAverages(computeCategoryAverages(ratings), computeSentimentScore(comments))
}

/** The pooled figures from the category averages — the same chain the raw rows
 * take, for a pool the database already grouped. Every rule (the general
 * rating, the remarks, the columns, the highest and lowest rubrics) is the
 * one it always was; only the input is a set of averages now.
 */
export function aggregatePooledAverages(
  catAverages: CategoryAverages,
  sentimentScore: number | null,
): PooledAggregate {
  const general = computeGeneralRating(catAverages)
  const catColumns = mapCategoryAveragesToColumns(catAverages)
  const rubrics = findHighestLowestRubrics(catColumns)
  return {
    avgRating: general,
    remarks: getRemark(general),
    catColumns,
    highestRubrics: rubrics.highest,
    lowestRubrics: rubrics.lowest,
    sentimentScore,
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
 * (aggregatePooledResults), so a faculty headline equals the detail page's
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

export interface DeptResolutionContext extends SubjectResolutionContext {
  facultySubjects: { faculty_id: string; section_id: string | null; semesterId: string | null }[]
  semesterId: string | null
}

/**
 * The faculty-level department rule: the user's home department, else the
 * teaching chain.
 *
 * SUPERSEDED for the results surfaces by `resolveSubjectDepartment`, which
 * resolves the department of an evaluated subject by its teacher's own
 * department. Kept for callers that need a person's department rather than a
 * subject's — do not use it to decide which department owns an evaluation.
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
 * The department that owns the subject's SECTION — no home-department
 * fallback. Null when the section cannot be resolved.
 */
export function resolveSectionDepartment(
  subject: { section_id: string | null },
  ctx: { sections: Map<string, string | null>; departmentCourses: Map<string, string | null> },
): string | null {
  if (!subject.section_id) return null
  const dcId = ctx.sections.get(subject.section_id)
  if (!dcId) return null
  return ctx.departmentCourses.get(dcId) ?? null
}

/**
 * The department that owns an evaluated subject: the TEACHER's own
 * department, always.
 *
 * A department's teaching is the teaching of the faculty homed in it
 * (contract §3.15), so the home department is the whole rule. The section's
 * department (section -> department_course -> department) is no longer a
 * fallback: a teacher with no home department has no department, and their
 * subject is unattributed — an integrity condition the coverage page's
 * "Unresolved" group and the results list's warning surface — rather than
 * filed under whoever owns the section.
 *
 * The old gate ("the home must own a course") existed to stop the
 * placeholder buckets ("Unassigned", "Admin") from accumulating everyone's
 * subjects. The membership rule does that on its own: a bucket holds the
 * teaching of the faculty homed in it, and nobody else's.
 */
export function resolveSubjectDepartment(
  subject: SubjectDepartmentInput,
  ctx: SubjectResolutionContext,
): string | null {
  return ctx.userDept.get(subject.faculty_id) ?? null
}

/**
 * Does this subject belong to this department? The teacher's HOME department
 * decides, through the one resolver (contract §3.1 — the home is the only
 * rule; the section's department is not a fallback).
 *
 * The subject pages use it as a guard: the department's drill-down is the only
 * thing that scopes a subject today, so the URL is a way around it (D9).
 */
export function isSubjectInDepartment(
  teacher: { id: string; departmentId: string | null } | null | undefined,
  departmentId: string,
): boolean {
  if (!teacher) return false
  const ctx: SubjectResolutionContext = {
    userDept: new Map([[teacher.id, teacher.departmentId]]),
    sections: new Map(),
    departmentCourses: new Map(),
  }
  return resolveSubjectDepartment({ faculty_id: teacher.id, section_id: null }, ctx) === departmentId
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
