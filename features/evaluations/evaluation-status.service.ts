import {
  departmentRepository,
  evaluationPeriodRepository,
  evaluationRepository,
  facultySubjectRepository,
  studentEnrollmentRepository,
  subjectRepository,
  userRepository,
} from "@/lib/repositories/factory"

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
}

// PostgREST caps URL length (~8KB) — chunk large .in() lists like the
// evaluation repositories do.
const IN_CHUNK = 100

export const STATUS_ON_TRACK_PCT = 70

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

function pctOf(submitted: number, expected: number): number | null {
  if (expected <= 0) return null
  return Math.round((submitted / expected) * 1000) / 10
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
  const chunks = chunkIds(fsIds, IN_CHUNK)

  const [submittedPages, expectedByFs, subjects, ...deptFacultyPages] = await Promise.all([
    Promise.all(
      chunks.map((c) => evaluationRepository.listSubmittedByPeriodAndFacultySubjectIds(evaluationPeriodId, c)),
    ),
    studentEnrollmentRepository.countByFacultySubjectIds(fsIds, semesterId),
    subjectRepository.findByIds([...new Set(mappings.map((m) => m.subject_id))]),
    ...departments.map((d) => userRepository.listByDepartment(d.id)),
  ])

  const submittedRows = submittedPages.flat()
  const submittedByFs = new Map<string, Set<string>>()
  for (const row of submittedRows) {
    if (!row.facultySubjectId) continue
    if (!submittedByFs.has(row.facultySubjectId)) submittedByFs.set(row.facultySubjectId, new Set())
    submittedByFs.get(row.facultySubjectId)!.add(row.evaluatorId)
  }

  const subjMap = new Map(subjects.map((s) => [s.id, s]))
  const facName = new Map<string, string>()
  const facDept = new Map<string, string>()
  deptFacultyPages.flat().forEach((u) => {
    facName.set(u.id, u.name)
    if (u.departmentId) facDept.set(u.id, u.departmentId)
  })

  const q = (search ?? "").trim().toLowerCase()
  const subjectRows: SubjectStatusRow[] = []
  for (const m of mappings) {
    const submitted = submittedByFs.get(m.id)?.size ?? 0
    const expected = expectedByFs[m.id] ?? 0
    const subj = subjMap.get(m.subject_id)
    const facultyName = facName.get(m.faculty_id) ?? m.faculty_id
    const code = subj?.code ?? ""
    const name = subj?.name ?? m.id
    if (q && !`${code} ${name} ${facultyName}`.toLowerCase().includes(q)) continue
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
    for (const m of deptMappings) {
      const s = submittedByFs.get(m.id)?.size ?? 0
      if (s > 0) evaluated += 1
      submitted += s
      expected += expectedByFs[m.id] ?? 0
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
    })
  }

  return { departments: deptRows, subjects: subjectRows }
}
