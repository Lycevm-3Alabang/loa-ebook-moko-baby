import { supabase } from "@/lib/db"
import { fetchRatingsWithCategories } from "@/lib/db/common"
import {
  buildLiveDeptAverages,
  buildFacultySummary,
  classifyWarningAssignments,
  getRemark,
  resolveSubjectDepartment,
  UNASSIGNED_FACULTY_EMAIL,
  type FacultyDeptInput,
  type RatingRow,
} from "@/lib/evaluation-utils"
import type {
  IEvaluationResultRepository,
  LiveDeptAverage,
  LiveFacultyResult,
  StudentBreakdownItem,
  EvaluationVisibilityRow,
  EvaluationAssignment,
  AttributionWarnings,
  SubjectResolutionContext,
} from "@/lib/types"
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

/**
 * The pseudo-department for an assignment whose department cannot be
 * resolved. Under the section-first rule this is an integrity condition
 * (the assignment points outside the period), not a bucket of people.
 */
const UNKNOWN_DEPARTMENT = "__unknown__"

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
 * The term's teaching roster: every assignment in the semester, the
 * department that owns it, and the people behind them. The dummy account is
 * left out — it owns assignments, but it is a placeholder, not a person.
 */
async function loadSemesterRoster(semesterId: string): Promise<SemesterRoster> {
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
  const { data, error } = await supabase
    .from("evaluations")
    .select("id, evaluateeId, facultySubjectId")
    .eq("evaluation_period_id", evaluationPeriodId)
    .eq("status", "SUBMITTED")
    .eq("isDisabled", false)
    .not("facultySubjectId", "is", null)
  if (error) throw error
  return data || []
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
 * The period's evaluated assignments, each resolved to the department that
 * owns its section, plus the evaluations that still match their assignment's
 * faculty.
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

/** The ratings of the given evaluations, indexed by evaluation. */
async function loadRatingsByEval(evalIds: string[]): Promise<Map<string, RatingRow[]>> {
  const ratingsByEval = new Map<string, RatingRow[]>()
  if (evalIds.length === 0) return ratingsByEval
  const ratings = await fetchRatingsWithCategories(supabase, evalIds)
  for (const r of ratings) {
    const list = ratingsByEval.get(r.evaluationId)
    if (list) list.push(r)
    else ratingsByEval.set(r.evaluationId, [r])
  }
  return ratingsByEval
}

/** The evaluations of a period, grouped by the assignment they belong to. */
function groupEvalsByAssignment(
  evals: { id: string; facultySubjectId: string | null }[],
): Map<string, string[]> {
  const byAssignment = new Map<string, string[]>()
  for (const ev of evals) {
    if (!ev.facultySubjectId) continue
    const list = byAssignment.get(ev.facultySubjectId)
    if (list) list.push(ev.id)
    else byAssignment.set(ev.facultySubjectId, [ev.id])
  }
  return byAssignment
}

export const evaluationResultRepository: IEvaluationResultRepository = {
  async listLiveDeptAverages(evaluationPeriodId): Promise<LiveDeptAverage[]> {
    const live = await loadPeriodAssignments(evaluationPeriodId)
    if (!live) return []
    const ratingsByEval = await loadRatingsByEval(live.liveEvals.map((e) => e.id))
    const byAssignment = groupEvalsByAssignment(live.liveEvals)

    // Pooled per assignment, then grouped by the department that owns the
    // assignment's section. A faculty teaching in two departments contributes
    // each subject to the department that owns it.
    const inputs: FacultyDeptInput[] = []
    for (const [fsId, evalIds] of byAssignment) {
      const assignment = live.assignments.get(fsId)
      if (!assignment) continue
      const groupRatings = evalIds.flatMap((eid) => ratingsByEval.get(eid) ?? [])
      inputs.push({
        facultyId: assignment.faculty_id,
        deptId: assignment.departmentId ?? UNKNOWN_DEPARTMENT,
        evalCount: evalIds.length,
        ratings: groupRatings,
      })
    }

    const groups = new Map<string, LiveDeptAverage>(
      buildLiveDeptAverages(inputs).map((d) => [d.departmentId, { ...d }]),
    )

    // The department page shows a row for every faculty with an evaluation —
    // including one whose evaluation carries no rating rows, which the
    // pooling above skips. Count those here, so the list's faculty count and
    // the department's table agree.
    for (const [fsId, evalIds] of byAssignment) {
      const assignment = live.assignments.get(fsId)
      if (!assignment) continue
      const groupRatings = evalIds.flatMap((eid) => ratingsByEval.get(eid) ?? [])
      const deptId = assignment.departmentId ?? UNKNOWN_DEPARTMENT
      let group = groups.get(deptId)
      if (!group) {
        group = {
          departmentId: deptId,
          facultyIds: [],
          totalRespondents: 0,
          avgRating: null,
          remarks: null,
          catAverages: {},
          highestRubrics: [],
          lowestRubrics: [],
        }
        groups.set(deptId, group)
      }
      if (!group.facultyIds.includes(assignment.faculty_id)) group.facultyIds.push(assignment.faculty_id)
      if (groupRatings.length === 0) group.totalRespondents += evalIds.length
    }

    return [...groups.values()]
  },

  /**
   * Per-faculty live results, pooled over that faculty's rating rows with the
   * same chain the detail page uses. The row shape matches the cached rows the
   * report service used to read, so it is a source swap, not a rewrite.
   */
  async listLiveFacultyResults(evaluationPeriodId: string): Promise<LiveFacultyResult[]> {
    const live = await loadPeriodAssignments(evaluationPeriodId)
    if (!live) return []
    const ratingsByEval = await loadRatingsByEval(live.liveEvals.map((e) => e.id))

    const evalIdsByFaculty = new Map<string, string[]>()
    for (const ev of live.liveEvals) {
      const list = evalIdsByFaculty.get(ev.evaluateeId)
      if (list) list.push(ev.id)
      else evalIdsByFaculty.set(ev.evaluateeId, [ev.id])
    }

    const out: LiveFacultyResult[] = []
    for (const [facultyId, eids] of evalIdsByFaculty) {
      const facRatings = eids.flatMap((eid) => ratingsByEval.get(eid) ?? [])
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
   * The evaluated assignments of one department: the department's own
   * subjects, by the department that owns the section. The top-level page
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

  /** The lookups a department decision needs, for a set of assignments. */
  async buildSubjectContext(assignments: { faculty_id: string; section_id: string | null }[]): Promise<SubjectResolutionContext> {
    return buildSubjectContext(assignments)
  },

  /**
   * The faculty who were assigned to teach in this period and received
   * nothing, per department. The roster is the period's semester assignments
   * — the same roster the coverage page uses — minus the assignments that
   * have a submitted evaluation.
   */
  async listDepartmentRosters(evaluationPeriodId: string): Promise<Record<string, { id: string; name: string }[]>> {
    const out: Record<string, { id: string; name: string }[]> = {}

    const { data: period } = await supabase
      .from("evaluation_periods")
      .select("semesterId")
      .eq("id", evaluationPeriodId)
      .single()
    const semesterId = (period?.semesterId as string | null) ?? null
    if (!semesterId) return out

    const roster = await loadSemesterRoster(semesterId)
    if (roster.rows.length === 0) return out

    const evals = await listSubmittedEvaluates(evaluationPeriodId)
    const evaluated = new Set(evals.map((e) => e.facultySubjectId).filter(Boolean))

    for (const r of roster.rows) {
      if (evaluated.has(r.id)) continue
      const deptId = roster.departmentOf.get(r.id)
      if (!deptId) continue
      const user = roster.users.get(r.faculty_id)
      if (!user || user.email === UNASSIGNED_FACULTY_EMAIL) continue
      const list = out[deptId] ?? (out[deptId] = [])
      if (!list.some((f) => f.id === user.id)) list.push({ id: user.id, name: user.name })
    }

    return out
  },

  /**
   * The people who teach in each department in the given term — the same rule
   * the results pages use: an assignment belongs to the department that owns
   * its section.
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
    const empty: AttributionWarnings = {
      unattributed: { count: 0, faculty: [] },
      offSemester: { count: 0, faculty: [] },
    }
    const evals = await listSubmittedEvaluates(evaluationPeriodId)
    if (evals.length === 0) return empty

    const { data: period } = await supabase
      .from("evaluation_periods")
      .select("semesterId")
      .eq("id", evaluationPeriodId)
      .single()
    const periodSemesterId = (period?.semesterId as string | null) ?? null

    const fsIds = [...new Set(evals.map((e) => e.facultySubjectId).filter(Boolean))] as string[]
    const rows = await loadAssignmentRows(fsIds)
    const ctx = await buildSubjectContext(rows)

    const { unattributed, offSemester } = classifyWarningAssignments(
      rows,
      (a) => resolveSubjectDepartment(a, ctx),
      periodSemesterId,
      departmentId,
    )

    const facultyIds = [...new Set([...unattributed, ...offSemester].map((r) => r.faculty_id))]
    const users = await loadUserNames(facultyIds)
    const named = (list: { faculty_id: string }[]) =>
      [...new Set(list.map((r) => r.faculty_id))].map((id) => ({ id, name: users.get(id)?.name ?? "Unknown" }))

    return {
      unattributed: { count: unattributed.length, faculty: named(unattributed) },
      offSemester: { count: offSemester.length, faculty: named(offSemester) },
    }
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
