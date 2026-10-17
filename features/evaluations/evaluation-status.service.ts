import {
  departmentRepository,
  evaluationPeriodRepository,
  evaluationRepository,
  facultySubjectRepository,
  studentEnrollmentRepository,
  subjectRepository,
  userRepository,
} from "@/lib/repositories/factory"
import type { EvaluationStatusItem } from "@/lib/types"
import { STATUS_ON_TRACK_PCT } from "./constants"

export interface SubjectStatusRow {
  facultySubjectId: string
  departmentId: string
  subjectCode: string
  subjectName: string
  facultyName: string
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

export async function getEvaluationStatus(evaluationPeriodId: string, search?: string) {
  const period = await evaluationPeriodRepository.findById(evaluationPeriodId)
  if (!period) throw new Error("Evaluation period not found")
  const semesterId = period.semesterId

  const [departments, mappings] = await Promise.all([
    departmentRepository.listAll(),
    facultySubjectRepository.list({ semesterId }),
  ])
  if (mappings.length === 0) return { departments: [], subjects: [] as SubjectStatusRow[] }

  const fsIds = mappings.map((m) => m.id)

  const [submittedCounts, expectedByFs, subjects, enrolledByFs, statusRows, ...deptFacultyPages] = await Promise.all([
    evaluationRepository.countSubmittedByFacultySubjectIds(evaluationPeriodId, fsIds),
    studentEnrollmentRepository.countByFacultySubjectIdsPaged(fsIds, semesterId),
    subjectRepository.findByIds([...new Set(mappings.map((m) => m.subject_id))]),
    studentEnrollmentRepository.listStudentIdsByFacultySubjectIds(fsIds, semesterId ?? undefined),
    evaluationRepository.listStatusByPeriodAndFacultySubjectIds(evaluationPeriodId, fsIds),
    ...departments.map((d) => userRepository.listByDepartment(d.id)),
  ])

  const subjMap = new Map(subjects.map((s) => [s.id, s]))
  const facName = new Map<string, string>()
  const facDept = new Map<string, string>()
  deptFacultyPages.flat().forEach((u) => {
    facName.set(u.id, u.name)
    if (u.departmentId) facDept.set(u.id, u.departmentId)
  })

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
    const agg = aggByFs.get(m.id)
    subjectRows.push({
      facultySubjectId: m.id,
      departmentId: facDept.get(m.faculty_id) ?? "",
      subjectCode: code,
      subjectName: name,
      facultyName,
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
  for (const d of departments) {
    const deptSubjects = subjectRows.filter((r) => r.departmentId === d.id)
    const deptNameHit = `${d.name} ${d.code ?? ""}`.toLowerCase().includes(q)
    if (q && deptSubjects.length === 0 && !deptNameHit) continue
    // Unsearched (q empty): include every department, even with zero mappings.
    let evaluated = 0
    let submitted = 0
    let expected = 0
    const deptMappings = mappings.filter((m) => facDept.get(m.faculty_id) === d.id)

    // Distinct student sets across the department's subjects
    const uniqStudents = new Set<string>()
    const dParticipated = new Set<string>()
    const dDisputed = new Set<string>()
    const dInProgress = new Set<string>()
    const dNotParticipated = new Set<string>()
    const deptFacultyIds = new Set<string>()
    for (const m of deptMappings) {
      const s = submittedCounts[m.id] ?? 0
      if (s > 0) evaluated += 1
      submitted += s
      expected += expectedByFs[m.id] ?? 0
      deptFacultyIds.add(m.faculty_id)
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
      facultyCount: deptFacultyIds.size,
      uniqueStudents: uniqStudents.size,
      participated: dParticipated.size,
      disputed: dDisputed.size,
      inProgress: dInProgress.size,
      notParticipated: dNotParticipated.size,
      completion: pctOf(dParticipated.size, uniqStudents.size),
    })
  }

  return { departments: deptRows, subjects: subjectRows }
}
