import { supabase } from "@/lib/db"
import { fetchRatingsWithCategories } from "@/lib/db/common"
import {
  computeCategoryAverages,
  computeCategoryTotals,
  computeGeneralRating,
  computeSentimentScore,
  findHighestLowestRubrics,
  getRemark,
  mapCategoryAveragesToColumns,
  classifyWarningAssignments,
  resolveSubjectDepartment,
  UNASSIGNED_FACULTY_EMAIL,
  type WarningAssignment,
} from "@/lib/evaluation-utils"
import type {
  IEvaluationResultRepository,
  DepartmentFigures,
  DepartmentResponseSet,
  FacultyFigures,
  PeriodDepartmentFigure,
  PeriodFigures,
  StudentBreakdownItem,
  EvaluationVisibilityRow,
  EvaluationAssignment,
  AttributionWarnings,
  SubjectResolutionContext,
} from "@/lib/types"
import { semesterRepository, userRepository } from "@/lib/repositories/factory"

export class EvaluationPeriodInactiveError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// PostgREST caps URL length (~8KB). Chunk large .in() lists to stay under it.
const IN_CHUNK_SIZE = 100

// PostgREST's db-max-rows (1,000) truncates an unbounded read with HTTP 200
// and no error. Reads that ask for "every evaluation of the period" must page
// past it.
const PAGE_SIZE = 1000

function chunkStrIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

interface SemesterRoster {
  rows: FacultySubjectRow[]
  /** The department that owns each assignment's section. */
  departmentOf: Map<string, string | null>
  users: Map<string, { id: string; name: string; email: string }>
}

/**
 * The term's assignments and the department each one counts under. The
 * department is the teacher's own when it owns a course, else the section's.
 */
async function loadSemesterAssignments(semesterId: string): Promise<{ rows: FacultySubjectRow[]; departmentOf: Map<string, string | null> }> {
  const { data, error } = await supabase
    .from("faculty_subjects")
    .select("id, faculty_id, subject_id, section_id, semesterId")
    .eq("semesterId", semesterId)
  if (error) throw error

  const rows: FacultySubjectRow[] = (data || []).map((r) => ({
    id: r.id as string,
    faculty_id: r.faculty_id as string,
    subject_id: r.subject_id as string,
    section_id: (r.section_id as string | null) ?? null,
    semesterId: (r.semesterId as string | null) ?? null,
  }))

  const ctx = await buildSubjectContext(rows)
  const departmentOf = new Map<string, string | null>()
  for (const r of rows) departmentOf.set(r.id, resolveSubjectDepartment(r, ctx))
  return { rows, departmentOf }
}

/**
 * The term's teaching roster: every assignment in the semester, the
 * department it counts under, and the people behind them. The dummy account
 * is left out — it owns assignments, but it is a placeholder, not a person.
 */
async function loadSemesterRoster(semesterId: string): Promise<SemesterRoster> {
  const { rows, departmentOf } = await loadSemesterAssignments(semesterId)
  const users = await loadUserNames(rows.map((r) => r.faculty_id))

  return { rows, departmentOf, users }
}

/** The people who teach in a department in the given term, per department. */
function rosterByDepartment(
  roster: SemesterRoster,
): Record<string, { id: string; name: string; email: string }[]> {
  const out: Record<string, { id: string; name: string; email: string }[]> = {}
  for (const r of roster.rows) {
    const deptId = roster.departmentOf.get(r.id)
    if (!deptId) continue
    const user = roster.users.get(r.faculty_id)
    if (!user || user.email === UNASSIGNED_FACULTY_EMAIL) continue
    const list = out[deptId] ?? (out[deptId] = [])
    if (!list.some((f) => f.id === user.id)) list.push(user)
  }
  return out
}

/** The lookups a department decision needs, for a set of assignments. */
async function buildSubjectContext(
  assignments: { faculty_id: string; section_id: string | null }[],
): Promise<SubjectResolutionContext> {
  const [userDept, maps] = await Promise.all([
    loadUserDepartments(assignments.map((a) => a.faculty_id)),
    loadSectionMaps(),
  ])
  return { userDept, sections: maps.sections, departmentCourses: maps.departmentCourses }
}

/** The period's submitted, enabled evaluations — the candidate faculty set. */
async function listSubmittedEvaluates(evaluationPeriodId: string): Promise<{ id: string; evaluateeId: string; facultySubjectId: string | null }[]> {
  // Paged .range(): this asks for the period's submitted evaluations across
  // EVERY department, so the row count is unbounded and PostgREST's
  // db-max-rows (1,000) would truncate it with HTTP 200 and no error.
  // Ordered by id (the primary key, so a total order) to keep the pages from
  // overlapping.
  const rows: { id: string; evaluateeId: string; facultySubjectId: string | null }[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from("evaluations")
      .select("id, evaluateeId, facultySubjectId")
      .eq("evaluation_period_id", evaluationPeriodId)
      .eq("status", "SUBMITTED")
      .eq("isDisabled", false)
      .not("facultySubjectId", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data || []) as { id: string; evaluateeId: string; facultySubjectId: string | null }[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return rows
}

interface FacultySubjectRow {
  id: string
  faculty_id: string
  subject_id: string
  section_id: string | null
  semesterId: string | null
}

/** faculty id -> name and email. Chunked, and soft-deleted users included. */
async function loadUserNames(facultyIds: string[]): Promise<Map<string, { id: string; name: string; email: string }>> {
  const names = new Map<string, { id: string; name: string; email: string }>()
  if (facultyIds.length === 0) return names
  const results = await Promise.all(
    chunkStrIds([...new Set(facultyIds)], IN_CHUNK_SIZE).map((ids) =>
      supabase.from("users").select("id, name, email").in("id", ids),
    ),
  )
  for (const res of results) {
    if (res.error) throw res.error
  }
  for (const res of results) {
    for (const u of res.data || []) {
      names.set(u.id as string, {
        id: u.id as string,
        name: (u.name as string | null) ?? "Unknown",
        email: (u.email as string | null) ?? "",
      })
    }
  }
  return names
}

/** faculty id -> users.departmentId. Chunked: a department's faculty list overflows PostgREST's URL cap. */
async function loadUserDepartments(facultyIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  if (facultyIds.length === 0) return map
  const results = await Promise.all(
    chunkStrIds([...new Set(facultyIds)], IN_CHUNK_SIZE).map((ids) =>
      supabase.from("users").select("id, departmentId").in("id", ids),
    ),
  )
  for (const res of results) {
    if (res.error) throw res.error
  }
  for (const res of results) {
    for (const u of res.data || []) map.set(u.id as string, (u.departmentId as string | null) ?? null)
  }
  return map
}

/**
 * The section -> department_course -> department chain. Both tables are small
 * (one row per section, one per department course), so they are read whole
 * and mapped in memory rather than filtered per query.
 */
async function loadSectionMaps(): Promise<{
  sections: Map<string, string | null>
  departmentCourses: Map<string, string | null>
}> {
  const [sectionsRes, coursesRes] = await Promise.all([
    supabase.from("sections").select("id, departmentCourseId"),
    supabase.from("department_courses").select("id, departmentId"),
  ])
  if (sectionsRes.error) throw sectionsRes.error
  if (coursesRes.error) throw coursesRes.error

  const sections = new Map<string, string | null>()
  for (const s of sectionsRes.data || []) sections.set(s.id as string, (s.departmentCourseId as string | null) ?? null)
  const departmentCourses = new Map<string, string | null>()
  for (const c of coursesRes.data || []) departmentCourses.set(c.id as string, (c.departmentId as string | null) ?? null)
  return { sections, departmentCourses }
}

/** The assignment rows for the given ids. Chunked — PostgREST caps the URL. */
async function loadAssignmentRows(ids: string[]): Promise<FacultySubjectRow[]> {
  if (ids.length === 0) return []
  const rows: FacultySubjectRow[] = []
  for (const chunk of chunkStrIds([...new Set(ids)], IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("faculty_subjects")
      .select("id, faculty_id, subject_id, section_id, semesterId")
      .in("id", chunk)
    if (error) throw error
    for (const r of data || []) {
      rows.push({
        id: r.id as string,
        faculty_id: r.faculty_id as string,
        subject_id: r.subject_id as string,
        section_id: (r.section_id as string | null) ?? null,
        semesterId: (r.semesterId as string | null) ?? null,
      })
    }
  }
  return rows
}

interface PeriodAssignments {
  /** faculty_subject id -> the assignment with its owning department. */
  assignments: Map<string, EvaluationAssignment>
  /** The evaluations whose assignment still belongs to their evaluatee. */
  liveEvals: { id: string; evaluateeId: string; facultySubjectId: string | null }[]
}

/**
 * The period's evaluated assignments, each resolved to the department it
 * counts under — the teacher's own department — plus the evaluations that
 * still match their assignment's faculty.
 */
async function loadPeriodAssignments(evaluationPeriodId: string): Promise<PeriodAssignments | null> {
  const evals = await listSubmittedEvaluates(evaluationPeriodId)
  if (evals.length === 0) return null

  const fsIds = [...new Set(evals.map((e) => e.facultySubjectId).filter(Boolean))] as string[]
  const rows = await loadAssignmentRows(fsIds)
  const ctx = await buildSubjectContext(rows)

  const assignments = new Map<string, EvaluationAssignment>()
  for (const row of rows) {
    assignments.set(row.id, { ...row, departmentId: resolveSubjectDepartment(row, ctx) })
  }

  // The detail page's rule: an evaluation counts for the faculty the assignment
  // actually has. A reassigned assignment leaves the old evaluation behind -
  // drop it here too, so every live surface agrees.
  const liveEvals = evals.filter(
    (e) => !!e.facultySubjectId && assignments.get(e.facultySubjectId)?.faculty_id === e.evaluateeId,
  )
  if (liveEvals.length === 0) return null

  return { assignments, liveEvals }
}

/**
 * The facts a period's figures and warnings are read from: the period's
 * submitted and enabled evaluations, the assignments they point at, the
 * teachers' home departments, and the period's own semester.
 *
 * One read of each, shared by the figures and the warnings — so the two
 * surfaces cannot disagree, and the list pays for the reads once.
 */
interface PeriodFacts {
  evaluations: { id: string; evaluateeId: string; facultySubjectId: string | null }[]
  /** The assignments the period's evaluations point at, by id. */
  assignments: Map<string, FacultySubjectRow>
  /**
   * faculty id -> the department they are homed in. The id is absent when the
   * account is missing; the value is null when the account has no home.
   */
  departmentOfFaculty: Map<string, string | null>
  periodSemesterId: string | null
}

async function loadPeriodFacts(evaluationPeriodId: string): Promise<PeriodFacts> {
  const [evaluations, period] = await Promise.all([
    listSubmittedEvaluates(evaluationPeriodId),
    supabase
      .from("evaluation_periods")
      .select("semesterId")
      .eq("id", evaluationPeriodId)
      .single(),
  ])
  if (period.error && period.error.code !== "PGRST116") throw period.error

  const fsIds = [...new Set(evaluations.map((e) => e.facultySubjectId).filter(Boolean))] as string[]
  const rows = await loadAssignmentRows(fsIds)
  const assignments = new Map(rows.map((r) => [r.id, r]))
  const departmentOfFaculty = await loadUserDepartments(rows.map((r) => r.faculty_id))

  return {
    evaluations,
    assignments,
    departmentOfFaculty,
    periodSemesterId: (period.data?.semesterId as string | null) ?? null,
  }
}

/**
 * The integrity conditions in a period's facts: the assignments whose teacher
 * has no home department, and the ones that belong to another semester than
 * the period. The classification is the existing pure rule; the facts are the
 * app's own reads.
 */
async function buildAttributionWarnings(
  facts: PeriodFacts,
  scopeDepartmentId?: string,
): Promise<AttributionWarnings> {
  const empty: AttributionWarnings = {
    unattributed: { count: 0, faculty: [] },
    offSemester: { count: 0, faculty: [] },
  }

  // The assignments with an evaluation in the period — one row per assignment.
  const byId = new Map<string, WarningAssignment>()
  for (const e of facts.evaluations) {
    const fsId = e.facultySubjectId
    if (!fsId) continue
    const assignment = facts.assignments.get(fsId)
    if (!assignment) continue
    // An assignment whose teacher has no account is not a department
    // condition — there is nobody to report.
    if (!facts.departmentOfFaculty.has(assignment.faculty_id)) continue
    byId.set(fsId, {
      faculty_id: assignment.faculty_id,
      section_id: null,
      semesterId: assignment.semesterId,
    })
  }
  if (byId.size === 0) return empty

  const assignments = [...byId.values()]
  const departmentOf = (a: WarningAssignment) => facts.departmentOfFaculty.get(a.faculty_id) ?? null

  const { unattributed, offSemester } = classifyWarningAssignments(
    assignments,
    departmentOf,
    facts.periodSemesterId,
    scopeDepartmentId,
  )

  const facultyIds = [...new Set([...unattributed, ...offSemester].map((r) => r.faculty_id))]
  const users = await loadUserNames(facultyIds)
  const named = (list: WarningAssignment[]) =>
    [...new Set(list.map((r) => r.faculty_id))].map((id) => ({ id, name: users.get(id)?.name ?? "Unknown" }))

  return {
    unattributed: { count: unattributed.length, faculty: named(unattributed) },
    offSemester: { count: offSemester.length, faculty: named(offSemester) },
  }
}

/**
 * The period's submitted and enabled evaluations for a set of faculty.
 * Chunked (the URL cap) and paged (the row cap), ordered by id — the primary
 * key, so a total order.
 */
async function listSubmittedEvaluatesForFaculty(
  evaluationPeriodId: string,
  facultyIds: string[],
): Promise<{ id: string; evaluateeId: string; facultySubjectId: string | null }[]> {
  if (facultyIds.length === 0) return []
  const results = await Promise.all(
    chunkStrIds([...new Set(facultyIds)], IN_CHUNK_SIZE).map(async (ids) => {
      const rows: { id: string; evaluateeId: string; facultySubjectId: string | null }[] = []
      let offset = 0
      for (;;) {
        const { data, error } = await supabase
          .from("evaluations")
          .select("id, evaluateeId, facultySubjectId")
          .eq("evaluation_period_id", evaluationPeriodId)
          .eq("status", "SUBMITTED")
          .eq("isDisabled", false)
          .in("evaluateeId", ids)
          .order("id", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)
        if (error) throw error
        const page = (data || []) as { id: string; evaluateeId: string; facultySubjectId: string | null }[]
        rows.push(...page)
        if (page.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }
      return rows
    }),
  )
  return results.flat()
}

/**
 * A department's live response set for a period: the period's submitted and
 * enabled evaluations by the faculty homed in the department, minus the ones
 * whose assignment no longer belongs to their evaluatee (the live-eval rule).
 *
 * The ONE place the set is decided. The results list's figure
 * (`listDepartmentFigures`) and the department page's rows read it, so the two
 * pages cannot drift apart — the parity the attribution contract asks for
 * (§3.18) becomes structural instead of coincidental.
 */
async function loadDepartmentResponseSet(
  departmentId: string,
  evaluationPeriodId: string,
): Promise<DepartmentResponseSet> {
  // The department's own faculty — the accounts homed in it. The role and the
  // department are both filters in the query, so the department's students
  // never cross the wire.
  const members = await userRepository.listFacultyByDepartment(departmentId)
  if (members.length === 0) return { members: [], evaluations: [], assignments: new Map() }

  // The period's submitted and enabled evaluations for them.
  const evaluations = await listSubmittedEvaluatesForFaculty(evaluationPeriodId, members.map((m) => m.id))
  if (evaluations.length === 0) return { members, evaluations: [], assignments: new Map() }

  // The assignments they point at, and the live-eval rule: an evaluation
  // counts for the faculty the assignment actually has. A reassigned
  // assignment leaves the old evaluation behind.
  const fsIds = [...new Set(evaluations.map((e) => e.facultySubjectId).filter(Boolean))] as string[]
  const rowById = new Map((await loadAssignmentRows(fsIds)).map((r) => [r.id, r]))
  const live = evaluations.filter(
    (e) => !!e.facultySubjectId && rowById.get(e.facultySubjectId)?.faculty_id === e.evaluateeId,
  )

  // The assignments the live evaluations point at. Their teacher IS the
  // evaluatee, so their teacher is homed in this department — the assignment
  // counts under it.
  const assignments = new Map<string, EvaluationAssignment>()
  for (const e of live) {
    const row = e.facultySubjectId ? rowById.get(e.facultySubjectId) : undefined
    if (!row) continue
    assignments.set(row.id, {
      id: row.id,
      faculty_id: row.faculty_id,
      subject_id: row.subject_id,
      section_id: row.section_id,
      departmentId,
    })
  }
  return { members, evaluations: live, assignments }
}

/**
 * The comment sentiment scores of a set of evaluations. Chunked: the URL cap.
 * A chunk of 100 evaluation ids holds at most a few hundred comments, so the
 * 1,000-row cap cannot bite here.
 */
async function listCommentScores(evaluationIds: string[]): Promise<{ sentimentScore: number | null }[]> {
  if (evaluationIds.length === 0) return []
  const results = await Promise.all(
    chunkStrIds([...new Set(evaluationIds)], IN_CHUNK_SIZE).map((ids) =>
      supabase.from("evaluation_comments").select("sentimentScore").in("evaluationId", ids),
    ),
  )
  for (const res of results) {
    if (res.error) throw res.error
  }
  return results.flatMap((res) => (res.data || []) as { sentimentScore: number | null }[])
}

export const evaluationResultRepository: IEvaluationResultRepository = {
  /**
   * A department's live response set for a period — the one place the set is
   * decided (contract §3.21: the period scopes the responses).
   */
  async listDepartmentResponseSet(departmentId: string, evaluationPeriodId: string): Promise<DepartmentResponseSet> {
    return loadDepartmentResponseSet(departmentId, evaluationPeriodId)
  },

  /**
   * One department's figures for a period: the response count, the pooled
   * rating and its remark, the highest and lowest rubrics, and the comment
   * sentiment — read from the app's own reads, with no direct database
   * connection.
   *
   * The rules are the app's own: the period's submitted and enabled
   * evaluations, the live-eval rule (an evaluation whose assignment no longer
   * belongs to its evaluatee does not count) and the teacher's home
   * department. A teacher homed elsewhere is not this department's.
   */
  async listDepartmentFigures(departmentId: string, evaluationPeriodId: string): Promise<DepartmentFigures> {
    const empty: DepartmentFigures = {
      departmentId,
      totalRespondents: 0,
      avgRating: null,
      remarks: null,
      highestRubrics: [],
      lowestRubrics: [],
      sentimentScore: null,
    }

    // The department's live response set — the same set the department page's
    // rows are built from, so the two pages print the same number.
    const { evaluations } = await loadDepartmentResponseSet(departmentId, evaluationPeriodId)
    if (evaluations.length === 0) return empty
    const liveEvalIds = evaluations.map((e) => e.id)

    const [ratings, comments] = await Promise.all([
      fetchRatingsWithCategories(supabase, liveEvalIds),
      listCommentScores(liveEvalIds),
    ])

    const catAverages = computeCategoryAverages(ratings)
    const general = computeGeneralRating(catAverages)
    const catColumns = mapCategoryAveragesToColumns(catAverages)
    const { highest, lowest } = findHighestLowestRubrics(catColumns)

    return {
      departmentId,
      totalRespondents: liveEvalIds.length,
      avgRating: general,
      remarks: getRemark(general),
      highestRubrics: highest,
      lowestRubrics: lowest,
      sentimentScore: computeSentimentScore(comments),
    }
  },

  /**
   * One faculty's figures for a period: the pooled rating, its remark, the
   * eight criterion averages, the highest and lowest rubrics, the comment
   * sentiment — and the per-category totals they pool from.
   *
   * The rules are the app's own: the period's submitted and enabled
   * evaluations, and the live-eval rule (an evaluation whose assignment no
   * longer belongs to its evaluatee does not count).
   *
   * The totals are the weights — a department's figure is the pool of its
   * faculty's totals, so the two grains come from one read over the rows.
   */
  async listFacultyFigures(facultyId: string, evaluationPeriodId: string): Promise<FacultyFigures> {
    const empty: FacultyFigures = {
      facultyId,
      totalRespondents: 0,
      avgRating: null,
      remarks: null,
      catColumns: mapCategoryAveragesToColumns({}),
      catTotals: {},
      highestRubrics: [],
      lowestRubrics: [],
      sentimentScore: null,
    }

    // The faculty's submitted and enabled evaluations in the period.
    const evaluations = await listSubmittedEvaluatesForFaculty(evaluationPeriodId, [facultyId])
    if (evaluations.length === 0) return empty

    // The assignments they point at, and the live-eval rule: an evaluation
    // counts for the faculty the assignment actually has.
    const fsIds = [...new Set(evaluations.map((e) => e.facultySubjectId).filter(Boolean))] as string[]
    const assignments = new Map((await loadAssignmentRows(fsIds)).map((r) => [r.id, r]))
    const liveEvalIds = evaluations
      .filter((e) => !!e.facultySubjectId && assignments.get(e.facultySubjectId)?.faculty_id === e.evaluateeId)
      .map((e) => e.id)
    if (liveEvalIds.length === 0) return empty

    const [ratings, comments] = await Promise.all([
      fetchRatingsWithCategories(supabase, liveEvalIds),
      listCommentScores(liveEvalIds),
    ])

    const catAverages = computeCategoryAverages(ratings)
    const general = computeGeneralRating(catAverages)
    const catColumns = mapCategoryAveragesToColumns(catAverages)
    const { highest, lowest } = findHighestLowestRubrics(catColumns)

    return {
      facultyId,
      totalRespondents: liveEvalIds.length,
      avgRating: general,
      remarks: getRemark(general),
      catColumns,
      catTotals: computeCategoryTotals(ratings),
      highestRubrics: highest,
      lowestRubrics: lowest,
      sentimentScore: computeSentimentScore(comments),
    }
  },

  /**
   * The period's departments and their response counts, with the attribution
   * warnings read from the same facts.
   *
   * The rules are the app's own: the period's submitted and enabled
   * evaluations, the live-eval rule (an evaluation whose assignment no longer
   * belongs to its evaluatee does not count) and the teacher's home
   * department. A teacher with no home department is an integrity warning, not
   * a row.
   */
  async listPeriodFigures(evaluationPeriodId: string, departmentId?: string): Promise<PeriodFigures> {
    const facts = await loadPeriodFacts(evaluationPeriodId)

    const groups = new Map<string, { totalRespondents: number; facultyIds: Set<string> }>()
    for (const e of facts.evaluations) {
      const fsId = e.facultySubjectId
      if (!fsId) continue
      const assignment = facts.assignments.get(fsId)
      if (!assignment) continue
      // The live-eval rule: the evaluation counts for the faculty the
      // assignment actually has. A reassigned assignment leaves the old
      // evaluation behind — drop it here too, so every surface agrees.
      if (assignment.faculty_id !== e.evaluateeId) continue
      const deptId = facts.departmentOfFaculty.get(assignment.faculty_id) ?? null
      if (!deptId) continue
      const group = groups.get(deptId) ?? { totalRespondents: 0, facultyIds: new Set<string>() }
      group.totalRespondents += 1
      group.facultyIds.add(assignment.faculty_id)
      groups.set(deptId, group)
    }

    const departments: PeriodDepartmentFigure[] = [...groups.entries()]
      .map(([deptId, group]) => ({
        departmentId: deptId,
        totalRespondents: group.totalRespondents,
        facultyIds: [...group.facultyIds],
      }))
      .sort((a, b) => a.departmentId.localeCompare(b.departmentId))

    return { departments, warnings: await buildAttributionWarnings(facts, departmentId) }
  },

  /**
   * The evaluated assignments of one department: the department's own
   * subjects, by the teacher's own department. The top-level page
   * groups the same assignments, so both surfaces cover the same rows and
   * print the same pooled numbers.
   */
  async listDepartmentAssignments(departmentId: string, evaluationPeriodId: string): Promise<EvaluationAssignment[]> {
    const live = await loadPeriodAssignments(evaluationPeriodId)
    if (!live) return []
    const out: EvaluationAssignment[] = []
    for (const assignment of live.assignments.values()) {
      if (assignment.departmentId === departmentId) out.push(assignment)
    }
    return out
  },

  /**
   * The department's assignments in the term: every subject that counts
   * under it, evaluated or not. The same rule as
   * `listDepartmentAssignments` (the teacher's own department, else the
   * section's), over the term's whole roster instead of only the evaluated
   * ones.
   */
  async listDepartmentTeachingAssignments(departmentId: string, semesterId: string): Promise<EvaluationAssignment[]> {
    const { rows, departmentOf } = await loadSemesterAssignments(semesterId)
    return rows
      .filter((r) => departmentOf.get(r.id) === departmentId)
      .map((r) => ({
        id: r.id,
        faculty_id: r.faculty_id,
        subject_id: r.subject_id,
        section_id: r.section_id,
        departmentId,
      }))
  },

  /** The lookups a department decision needs, for a set of assignments. */
  async buildSubjectContext(assignments: { faculty_id: string; section_id: string | null }[]): Promise<SubjectResolutionContext> {
    return buildSubjectContext(assignments)
  },

  /**
   * The people who teach in each department in the given term — the same rule
   * the results pages use: an assignment counts under the teacher's own
   * department.
   */
  async listSemesterRoster(
    semesterId: string,
  ): Promise<Record<string, { id: string; name: string; email: string }[]>> {
    if (!semesterId) return {}
    const roster = await loadSemesterRoster(semesterId)
    return rosterByDepartment(roster)
  },

  /**
   * The evaluations that could not be attributed cleanly: an assignment whose
   * department cannot be resolved, and an assignment that belongs to another
   * semester than the period. Both are integrity conditions, not people.
   *
   * With a `departmentId`, only that department's conditions are returned —
   * the counts and the names are computed after the filter, so another
   * department's faculty never reaches a scoped caller's payload.
   */
  async listAttributionWarnings(
    evaluationPeriodId: string,
    departmentId?: string,
  ): Promise<AttributionWarnings> {
    // The assignments with an evaluation in the period, and where they count —
    // read from the app's own reads. The classification below is the same
    // rule it always was.
    const facts = await loadPeriodFacts(evaluationPeriodId)
    return buildAttributionWarnings(facts, departmentId)
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

/** A comment row, as the student breakdown reads it. */
interface CommentRow {
  id: string
  evaluationId: string
  comment: string
  sentimentLabel: string | null
  sentimentScore: number | null
}

/**
 * The comments of a set of evaluations, chunked.
 *
 * A chunk of 100 evaluation ids holds at most a few hundred comments, so the
 * `.in()` stays within PostgREST's URL budget and the 1,000-row cap cannot
 * bite either. One oversized `.in()` over every evaluation id overflows the
 * URL, PostgREST answers 400, and the route turns it into a 500.
 */
async function fetchCommentsByEvaluationIds(evaluationIds: string[]): Promise<CommentRow[]> {
  if (evaluationIds.length === 0) return []
  const rows: CommentRow[] = []
  for (const chunk of chunkStrIds([...new Set(evaluationIds)], IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("evaluation_comments")
      .select("id, evaluationId, comment, sentimentLabel, sentimentScore")
      .in("evaluationId", chunk)
    if (error) throw error
    for (const c of (data || []) as CommentRow[]) rows.push(c)
  }
  return rows
}

async function getStudentBreakdownsForFaculties(
  evaluationPeriodId: string,
  facultyIds: string[],
): Promise<Map<string, StudentBreakdownItem[]>> {
  if (facultyIds.length === 0) return new Map()

  // The faculty's submitted and enabled evaluations in the period. Paged
  // .range(): the 1,000-row cap — a faculty's responses (one per student per
  // subject) pass 1,000, and PostgREST truncates the read with HTTP 200 and
  // no error. Ordered by id (the primary key, so a total order).
  const evals: { id: string; evaluateeId: string }[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from("evaluations")
      .select(`id, evaluateeId`)
      .eq("evaluation_period_id", evaluationPeriodId)
      .in("evaluateeId", facultyIds)
      .eq("status", "SUBMITTED")
      .eq("isDisabled", false)
      .not("facultySubjectId", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data || []) as { id: string; evaluateeId: string }[]
    evals.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  if (evals.length === 0) return new Map()

  const allEvalIds = evals.map((e) => e.id)

  const [allRatings, commentRows] = await Promise.all([
    fetchRatingsWithCategories(supabase, allEvalIds),
    fetchCommentsByEvaluationIds(allEvalIds),
  ])

  const commentsByEval = new Map<string, Array<{ comment: string; sentimentLabel: string | null; sentimentScore: number | null }>>()
  for (const c of commentRows) {
    if (!commentsByEval.has(c.evaluationId)) commentsByEval.set(c.evaluationId, [])
    commentsByEval.get(c.evaluationId)!.push({
      comment: c.comment,
      sentimentLabel: c.sentimentLabel,
      sentimentScore: c.sentimentScore,
    })
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
