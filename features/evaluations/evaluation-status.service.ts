import {
  departmentRepository,
  evaluationPeriodRepository,
  evaluationRepository,
  evaluationResultRepository,
  facultySubjectRepository,
  sectionRepository,
  studentEnrollmentRepository,
  subjectRepository,
  userRepository,
} from "@/lib/repositories/factory"
import { resolveSectionDepartment, resolveSubjectDepartment, UNASSIGNED_FACULTY_EMAIL } from "@/lib/evaluation-utils"
import { getFacultyCountsByDepartment } from "@/features/users/users.service"
import type { EvaluationStatusItem } from "@/lib/types"
import { STATUS_ON_TRACK_PCT } from "./constants"

export interface SubjectStatusRow {
  facultySubjectId: string
  departmentId: string
  subjectCode: string
  subjectName: string
  sectionProgram: string | null
  sectionName: string | null
  /** The department that owns the subject's section, when it is not this row's department. */
  sectionDepartment: string | null
  facultyId: string
  facultyName: string
  facultyEmail: string
  submitted: number
  expected: number
  pct: number | null
  evaluated: boolean
  enrolled: number
  participated: number
  disputed: number
  inProgress: number
  notParticipated: number
}

/** One teacher's coverage inside one department. */
export interface FacultyCoverageAggregate {
  subjects: number
  students: number
  participated: number
  disputed: number
  inProgress: number
  notParticipated: number
  completion: number | null
}

export interface DeptStatusRow {
  departmentId: string
  departmentName: string
  departmentCode: string
  subjectsEvaluated: number
  subjectsTotal: number
  submitted: number
  expected: number
  pct: number | null
  facultyCount: number
  uniqueStudents: number
  participated: number
  disputed: number
  inProgress: number
  notParticipated: number
  completion: number | null
}

export { STATUS_ON_TRACK_PCT }

export interface StatusStudent {
  id: string
  name: string
  email: string
}

export interface FacultySubjectStatusDetail {
  facultySubjectId: string
  participated: StatusStudent[]
  notParticipated: StatusStudent[]
  disputed: StatusStudent[]
  inProgress: StatusStudent[]
}

export async function getEvaluationStatusDetail(
  evaluationPeriodId: string,
  facultySubjectId: string,
): Promise<FacultySubjectStatusDetail> {
  const period = await evaluationPeriodRepository.findById(evaluationPeriodId)
  if (!period) throw new Error("Evaluation period not found")
  const semesterId = period.semesterId

  const [enrollments, evalRows] = await Promise.all([
    studentEnrollmentRepository.listByFacultySubject(facultySubjectId, semesterId ?? undefined),
    evaluationRepository.listStatusByPeriodAndFacultySubjectIds(evaluationPeriodId, [facultySubjectId]),
  ])

  const byEvaluator = new Map<string, typeof evalRows>()
  for (const e of evalRows) {
    if (!byEvaluator.has(e.evaluatorId)) byEvaluator.set(e.evaluatorId, [])
    byEvaluator.get(e.evaluatorId)!.push(e)
  }

  const participated: StatusStudent[] = []
  const notParticipated: StatusStudent[] = []
  const disputed: StatusStudent[] = []
  const inProgress: StatusStudent[] = []

  for (const enr of enrollments) {
    const student = enr.student
    if (!student) continue
    const rows = byEvaluator.get(student.id) ?? []
    const entry: StatusStudent = { id: student.id, name: student.name, email: student.email }
    let bucket: "participated" | "disputed" | "inProgress" | "notParticipated" = "notParticipated"
    if (rows.some((r) => r.status === "SUBMITTED" && !r.isDisabled)) bucket = "participated"
    else if (rows.some((r) => r.status === "INVALID" || (r.status === "SUBMITTED" && r.isDisabled))) bucket = "disputed"
    else if (rows.some((r) => r.status === "DRAFT")) bucket = "inProgress"
    else bucket = "notParticipated"

    if (bucket === "participated") participated.push(entry)
    else if (bucket === "disputed") disputed.push(entry)
    else if (bucket === "inProgress") inProgress.push(entry)
    else notParticipated.push(entry)
  }

  return { facultySubjectId, participated, notParticipated, disputed, inProgress }
}

function pctOf(submitted: number, expected: number): number | null {
  if (expected <= 0) return null
  return Math.round((submitted / expected) * 1000) / 10
}

type Bucket = "participated" | "disputed" | "inProgress" | "notParticipated"

function bucketOf(rows: EvaluationStatusItem[] | undefined): Bucket {
  const rs = rows ?? []
  if (rs.some((r) => r.status === "SUBMITTED" && !r.isDisabled)) return "participated"
  if (rs.some((r) => r.status === "INVALID" || (r.status === "SUBMITTED" && r.isDisabled))) return "disputed"
  if (rs.some((r) => r.status === "DRAFT")) return "inProgress"
  return "notParticipated"
}

export async function getEvaluationStatus(evaluationPeriodId: string, search?: string, departmentId?: string) {
  const period = await evaluationPeriodRepository.findById(evaluationPeriodId)
  if (!period) throw new Error("Evaluation period not found")
  const semesterId = period.semesterId

  const [departments, mappings] = await Promise.all([
    departmentRepository.listAll(),
    facultySubjectRepository.list({ semesterId }),
  ])
  if (mappings.length === 0) {
    return {
      departments: [],
      subjects: [] as SubjectStatusRow[],
      facultyAggregates: {} as Record<string, Record<string, FacultyCoverageAggregate>>,
      warnings: { unattributed: { count: 0, faculty: [] }, offSemester: { count: 0, faculty: [] } },
    }
  }

  const fsIds = mappings.map((m) => m.id)
  const facultyIds = [...new Set(mappings.map((m) => m.faculty_id))]

  const [submittedCounts, expectedByFs, subjects, enrolledByFs, statusRows, facUsers, subjectCtx, allSections, facultyCounts] = await Promise.all([
    evaluationRepository.countSubmittedByFacultySubjectIds(evaluationPeriodId, fsIds),
    studentEnrollmentRepository.countByFacultySubjectIdsPaged(fsIds, semesterId),
    subjectRepository.findByIds([...new Set(mappings.map((m) => m.subject_id))]),
    studentEnrollmentRepository.listStudentIdsByFacultySubjectIds(fsIds, semesterId ?? undefined),
    evaluationRepository.listStatusByPeriodAndFacultySubjectIds(evaluationPeriodId, fsIds),
    userRepository.listByIds(facultyIds, { includeDeleted: true }),
    evaluationResultRepository.buildSubjectContext(mappings),
    sectionRepository.list(),
    getFacultyCountsByDepartment(),
  ])

  const subjMap = new Map(subjects.map((s) => [s.id, s]))
  const facName = new Map<string, string>()
  const facEmail = new Map<string, string>()
  for (const u of facUsers) {
    facName.set(u.id, u.name)
    facEmail.set(u.id, u.email ?? "")
  }
  const deptNameById = new Map(departments.map((d) => [d.id, d.name]))
  // Sections are few — one lookup for each row's OWN section.
  const sectionById = new Map(allSections.map((s) => [s.id, s]))

  // The dummy account owns assignments but is a placeholder, not a person:
  // its subjects stay in the coverage, but it is not a teacher.
  const placeholderIds = new Set(
    facUsers.filter((u) => u.email === UNASSIGNED_FACULTY_EMAIL).map((u) => u.id),
  )

  // The coverage page is faculty-driven: a teacher's coverage belongs to
  // THEIR department. The faculty-subject's (section's) department takes
  // priority only when the teacher is based somewhere that cannot own
  // coverage — no home department, or a home with no courses of its own
  // (the "Unassigned"/"Admin" placeholder buckets). The shared resolver
  // holds that rule, so the results pages resolve a department the same way.
  const sectionDeptOf = new Map<string, string | null>()
  const coverageDeptOf = new Map<string, string | null>()
  for (const m of mappings) {
    sectionDeptOf.set(m.id, resolveSectionDepartment(m, subjectCtx))
    coverageDeptOf.set(m.id, resolveSubjectDepartment(m, subjectCtx))
  }

  // Index eval status rows by (facultySubjectId, evaluatorId)
  const statusByKey = new Map<string, EvaluationStatusItem[]>()
  for (const r of statusRows) {
    if (!r.facultySubjectId) continue
    const key = `${r.facultySubjectId}|${r.evaluatorId}`
    if (!statusByKey.has(key)) statusByKey.set(key, [])
    statusByKey.get(key)!.push(r)
  }

  // Per-subject bucket counts + enrolled student id set
  interface SubjectAgg {
    enrolled: number
    participated: number
    disputed: number
    inProgress: number
    notParticipated: number
    studentIds: Set<string>
    bucketed: Record<Bucket, Set<string>>
  }
  const aggByFs = new Map<string, SubjectAgg>()
  for (const fsId of fsIds) {
    const ids = enrolledByFs.get(fsId) ?? []
    const bucketed: Record<Bucket, Set<string>> = {
      participated: new Set(),
      disputed: new Set(),
      inProgress: new Set(),
      notParticipated: new Set(),
    }
    for (const sid of ids) {
      const b = bucketOf(statusByKey.get(`${fsId}|${sid}`))
      bucketed[b].add(sid)
    }
    aggByFs.set(fsId, {
      enrolled: ids.length,
      participated: bucketed.participated.size,
      disputed: bucketed.disputed.size,
      inProgress: bucketed.inProgress.size,
      notParticipated: bucketed.notParticipated.size,
      studentIds: new Set(ids),
      bucketed,
    })
  }

  const q = (search ?? "").trim().toLowerCase()
  const subjectRows: SubjectStatusRow[] = []
  for (const m of mappings) {
    const submitted = submittedCounts[m.id] ?? 0
    const expected = expectedByFs[m.id] ?? 0
    const subj = subjMap.get(m.subject_id)
    const facultyName = facName.get(m.faculty_id) ?? m.faculty_id
    const code = subj?.code ?? ""
    const name = subj?.name ?? m.id
    if (q && !`${code} ${name} ${facultyName}`.toLowerCase().includes(q)) continue
    const rowDepartmentId = coverageDeptOf.get(m.id) ?? ""
    // A scoped view shows one department's subjects. The department-less rows
    // belong to no department, so they fall outside the scope.
    if (departmentId && rowDepartmentId !== departmentId) continue
    const agg = aggByFs.get(m.id)
    const section = m.section_id ? sectionById.get(m.section_id) : undefined
    const sectionDeptId = sectionDeptOf.get(m.id) ?? null
    const sectionDepartment =
      sectionDeptId && sectionDeptId !== rowDepartmentId ? (deptNameById.get(sectionDeptId) ?? null) : null
    subjectRows.push({
      facultySubjectId: m.id,
      departmentId: rowDepartmentId,
      subjectCode: code,
      subjectName: name,
      sectionProgram: section?.program ?? null,
      sectionName: section?.name ?? null,
      sectionDepartment,
      facultyId: m.faculty_id,
      facultyName,
      facultyEmail: facEmail.get(m.faculty_id) ?? "",
      submitted,
      expected,
      pct: pctOf(submitted, expected),
      evaluated: submitted > 0,
      enrolled: agg?.enrolled ?? 0,
      participated: agg?.participated ?? 0,
      disputed: agg?.disputed ?? 0,
      inProgress: agg?.inProgress ?? 0,
      notParticipated: agg?.notParticipated ?? 0,
    })
  }

  const deptRows: DeptStatusRow[] = []
  const facultyAggregates: Record<string, Record<string, FacultyCoverageAggregate>> = {}
  for (const d of departments) {
    if (departmentId && d.id !== departmentId) continue
    const deptSubjects = subjectRows.filter((r) => r.departmentId === d.id)
    const deptNameHit = `${d.name} ${d.code ?? ""}`.toLowerCase().includes(q)
    if (q && deptSubjects.length === 0 && !deptNameHit) continue
    // Unsearched (q empty): include every department, even with zero mappings.
    let evaluated = 0
    let submitted = 0
    let expected = 0
    const deptMappings = mappings.filter((m) => coverageDeptOf.get(m.id) === d.id)

    // Distinct student sets across the department's subjects
    const uniqStudents = new Set<string>()
    const dParticipated = new Set<string>()
    const dDisputed = new Set<string>()
    const dInProgress = new Set<string>()
    const dNotParticipated = new Set<string>()
    for (const m of deptMappings) {
      const s = submittedCounts[m.id] ?? 0
      if (s > 0) evaluated += 1
      submitted += s
      expected += expectedByFs[m.id] ?? 0
      const agg = aggByFs.get(m.id)
      if (!agg) continue
      for (const sid of agg.studentIds) uniqStudents.add(sid)
      for (const sid of agg.bucketed.participated) dParticipated.add(sid)
      for (const sid of agg.bucketed.disputed) dDisputed.add(sid)
      for (const sid of agg.bucketed.inProgress) dInProgress.add(sid)
      for (const sid of agg.bucketed.notParticipated) dNotParticipated.add(sid)
    }

    deptRows.push({
      departmentId: d.id,
      departmentName: d.name,
      departmentCode: d.code ?? "",
      subjectsEvaluated: evaluated,
      subjectsTotal: deptMappings.length,
      submitted,
      expected,
      pct: pctOf(submitted, expected),
      // The department's own faculty, the same headcount the results list and
      // the admin dashboard show. The teachers who happen to teach its
      // subjects are a different set (a teacher homed elsewhere lands in their
      // own department), so they are not counted here.
      facultyCount: facultyCounts[d.id] ?? 0,
      uniqueStudents: uniqStudents.size,
      participated: dParticipated.size,
      disputed: dDisputed.size,
      inProgress: dInProgress.size,
      notParticipated: dNotParticipated.size,
      completion: pctOf(dParticipated.size, uniqStudents.size),
    })

    // The same union one level down: a teacher's coverage inside this
    // department. Distinct students again — a teacher who teaches three
    // sections of one class has 34 students, not 102.
    const byFaculty = new Map<string, {
      subjects: number
      students: Set<string>
      participated: Set<string>
      disputed: Set<string>
      inProgress: Set<string>
      notParticipated: Set<string>
    }>()
    for (const m of deptMappings) {
      if (placeholderIds.has(m.faculty_id)) continue
      // The department's OWN faculty: a teacher homed elsewhere who teaches a
      // section here is not a member of this department, so they are not one
      // of its faculty. Their subject and its students stay in the coverage
      // (the subject rows are untouched).
      if ((subjectCtx.userDept.get(m.faculty_id) ?? null) !== d.id) continue
      const agg = aggByFs.get(m.id)
      if (!agg) continue
      const g = byFaculty.get(m.faculty_id) ?? {
        subjects: 0,
        students: new Set<string>(),
        participated: new Set<string>(),
        disputed: new Set<string>(),
        inProgress: new Set<string>(),
        notParticipated: new Set<string>(),
      }
      g.subjects += 1
      for (const sid of agg.studentIds) g.students.add(sid)
      for (const sid of agg.bucketed.participated) g.participated.add(sid)
      for (const sid of agg.bucketed.disputed) g.disputed.add(sid)
      for (const sid of agg.bucketed.inProgress) g.inProgress.add(sid)
      for (const sid of agg.bucketed.notParticipated) g.notParticipated.add(sid)
      byFaculty.set(m.faculty_id, g)
    }

    const deptFacultyAggregates: Record<string, FacultyCoverageAggregate> = {}
    for (const [facultyId, g] of byFaculty) {
      deptFacultyAggregates[facultyId] = {
        subjects: g.subjects,
        students: g.students.size,
        participated: g.participated.size,
        disputed: g.disputed.size,
        inProgress: g.inProgress.size,
        notParticipated: g.notParticipated.size,
        completion: pctOf(g.participated.size, g.students.size),
      }
    }
    facultyAggregates[d.id] = deptFacultyAggregates
  }

  // The integrity conditions the roster cannot see: an evaluation pointing at
  // an assignment from another semester is outside the period's roster, so its
  // subject is missing from the coverage and its responses are uncounted.
  const warnings = await evaluationResultRepository.listAttributionWarnings(
    evaluationPeriodId,
    departmentId,
  )

  return { departments: deptRows, subjects: subjectRows, facultyAggregates, warnings }
}
