import { supabase } from "@/lib/supabase"
import { departmentRepository, evaluationPeriodRepository, evaluationResultRepository, userRepository, facultySubjectRepository, studentEnrollmentRepository, rubricGroupRepository } from "@/lib/repositories/factory"

export interface EvalReportFaculty {
  facultyId: string
  facultyName: string
  totalRespondents: number
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  generalRating: number | null
  remarks: string | null
}

export interface EvalReportDepartment {
  departmentId: string
  departmentName: string
  facultyCount: number
  totalRespondents: number
  avgProfessionalManner: number | null
  avgCommunicationWithStudent: number | null
  avgStudentEngagement: number | null
  avgLearningMaterials: number | null
  avgTimeManagement: number | null
  avgExperientialLearning: number | null
  avgRespectUniqueness: number | null
  avgAssessmentAndFeedback: number | null
  avgGeneralRating: number | null
}

export interface EvalReportData {
  evaluationPeriodId: string
  departments: EvalReportDepartment[]
  facultyResults: EvalReportFaculty[]
}

const CATEGORY_KEYS: (keyof EvalReportFaculty)[] = [
  "professionalManner",
  "communicationWithStudent",
  "studentEngagement",
  "learningMaterials",
  "timeManagement",
  "experientialLearning",
  "respectUniqueness",
  "assessmentAndFeedback",
]

async function getActiveEvaluationPeriodId(): Promise<string | null> {
  const active = await evaluationPeriodRepository.findActive()
  return active?.id ?? null
}

async function getDepartments(): Promise<{ id: string; name: string; deanId: string | null }[]> {
  const departments = await departmentRepository.listAll()
  return departments.map((d) => ({ id: d.id, name: d.name, deanId: d.deanId ?? null }))
}

async function getDepartmentNameMap(): Promise<Map<string, string>> {
  const depts = await getDepartments()
  return new Map(depts.map((d) => [d.id, d.name]))
}

function avg(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null)
  if (valid.length === 0) return null
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100
}

export async function getAdminEvalReportData(evaluationPeriodId?: string): Promise<EvalReportData> {
  const activePeriodId = evaluationPeriodId ?? (await getActiveEvaluationPeriodId())
  if (!activePeriodId) return { evaluationPeriodId: "", departments: [], facultyResults: [] }

  const { data: results } = await supabase
    .from("evaluation_results")
    .select("*")
    .eq("evaluation_period_id", activePeriodId)
  const rows = (results ?? []) as Array<Record<string, unknown>>

  const facultyIds = [...new Set(rows.map((r) => r.facultyId as string))]
  const { data: users } = await supabase
    .from("users")
    .select("id, name, departmentId")
    .in("id", facultyIds)
  const userMap = new Map((users ?? []).map((u: Record<string, unknown>) => [u.id, u as { id: string; name: string; departmentId: string | null }]))

  const deptNameMap = await getDepartmentNameMap()

  const deptMap = new Map<string, EvalReportFaculty[]>()
  for (const r of rows) {
    const facultyId = r.facultyId as string
    const user = userMap.get(facultyId)
    // Live home department — do not use evaluation_results.departmentId (stale snapshot).
    const deptId = user?.departmentId ?? "unassigned"
    if (!deptMap.has(deptId)) deptMap.set(deptId, [])
    deptMap.get(deptId)!.push({
      facultyId,
      facultyName: user?.name ?? facultyId,
      totalRespondents: (r.totalRespondents as number) ?? 0,
      professionalManner: r.professionalManner as number | null,
      communicationWithStudent: r.communicationWithStudent as number | null,
      studentEngagement: r.studentEngagement as number | null,
      learningMaterials: r.learningMaterials as number | null,
      timeManagement: r.timeManagement as number | null,
      experientialLearning: r.experientialLearning as number | null,
      respectUniqueness: r.respectUniqueness as number | null,
      assessmentAndFeedback: r.assessmentAndFeedback as number | null,
      generalRating: r.generalRating as number | null,
      remarks: r.remarks as string | null,
    })
  }

  const departments: EvalReportDepartment[] = []
  for (const [deptId, facultyList] of deptMap) {
    departments.push({
      departmentId: deptId,
      departmentName: deptNameMap.get(deptId) ?? deptId,
      facultyCount: facultyList.length,
      totalRespondents: facultyList.reduce((s, f) => s + f.totalRespondents, 0),
      avgProfessionalManner: avg(facultyList.map((f) => f.professionalManner)),
      avgCommunicationWithStudent: avg(facultyList.map((f) => f.communicationWithStudent)),
      avgStudentEngagement: avg(facultyList.map((f) => f.studentEngagement)),
      avgLearningMaterials: avg(facultyList.map((f) => f.learningMaterials)),
      avgTimeManagement: avg(facultyList.map((f) => f.timeManagement)),
      avgExperientialLearning: avg(facultyList.map((f) => f.experientialLearning)),
      avgRespectUniqueness: avg(facultyList.map((f) => f.respectUniqueness)),
      avgAssessmentAndFeedback: avg(facultyList.map((f) => f.assessmentAndFeedback)),
      avgGeneralRating: avg(facultyList.map((f) => f.generalRating)),
    })
  }

  departments.sort((a, b) => (b.avgGeneralRating ?? 0) - (a.avgGeneralRating ?? 0))

  return {
    evaluationPeriodId: activePeriodId,
    departments,
    facultyResults: rows.map((r) => {
      const facultyId = r.facultyId as string
      const user = userMap.get(facultyId)
      return {
        facultyId,
        facultyName: user?.name ?? facultyId,
        totalRespondents: (r.totalRespondents as number) ?? 0,
        professionalManner: r.professionalManner as number | null,
        communicationWithStudent: r.communicationWithStudent as number | null,
        studentEngagement: r.studentEngagement as number | null,
        learningMaterials: r.learningMaterials as number | null,
        timeManagement: r.timeManagement as number | null,
        experientialLearning: r.experientialLearning as number | null,
        respectUniqueness: r.respectUniqueness as number | null,
        assessmentAndFeedback: r.assessmentAndFeedback as number | null,
        generalRating: r.generalRating as number | null,
        remarks: r.remarks as string | null,
      }
    }),
  }
}

export async function getDeanEvalReportData(deanId: string, evaluationPeriodId?: string): Promise<EvalReportData> {
  const activePeriodId = evaluationPeriodId ?? (await getActiveEvaluationPeriodId())
  if (!activePeriodId) return { evaluationPeriodId: "", departments: [], facultyResults: [] }

  const dept = await departmentRepository.findByDeanId(deanId)
  if (!dept) return { evaluationPeriodId: "", departments: [], facultyResults: [] }

  // Live home department — do not filter by evaluation_results.departmentId (stale snapshot).
  const resultRows = await evaluationResultRepository.list(activePeriodId)
  const allRows = ((resultRows ?? []) as unknown) as Array<Record<string, unknown>>

  const allFacIds = [...new Set(allRows.map((r) => r.facultyId as string))]
  const allUsers = allFacIds.length > 0 ? await userRepository.listByIds(allFacIds) : []
  const liveDept = new Map(
    (allUsers ?? []).map((u) => [u.id, (u as { id: string; departmentId: string | null }).departmentId ?? null]),
  )
  const rows = allRows.filter((r) => liveDept.get(r.facultyId as string) === dept.id)

  const facultyIds = [...new Set(rows.map((r) => r.facultyId as string))]
  const users = facultyIds.length > 0 ? await userRepository.listByIds(facultyIds) : []
  const userMap = new Map(users.map((u) => [u.id, (u as { id: string; name: string }).name]))

  const facultyResults: EvalReportFaculty[] = rows.map((r) => {
    const facultyId = r.facultyId as string
    return {
      facultyId,
      facultyName: userMap.get(facultyId) ?? facultyId,
      totalRespondents: (r.totalRespondents as number) ?? 0,
      professionalManner: r.professionalManner as number | null,
      communicationWithStudent: r.communicationWithStudent as number | null,
      studentEngagement: r.studentEngagement as number | null,
      learningMaterials: r.learningMaterials as number | null,
      timeManagement: r.timeManagement as number | null,
      experientialLearning: r.experientialLearning as number | null,
      respectUniqueness: r.respectUniqueness as number | null,
      assessmentAndFeedback: r.assessmentAndFeedback as number | null,
      generalRating: r.generalRating as number | null,
      remarks: r.remarks as string | null,
    }
  })

  return {
    evaluationPeriodId: activePeriodId,
    departments: [{
      departmentId: dept.id,
      departmentName: dept.name,
      facultyCount: facultyResults.length,
      totalRespondents: facultyResults.reduce((s, f) => s + f.totalRespondents, 0),
      avgProfessionalManner: avg(facultyResults.map((f) => f.professionalManner)),
      avgCommunicationWithStudent: avg(facultyResults.map((f) => f.communicationWithStudent)),
      avgStudentEngagement: avg(facultyResults.map((f) => f.studentEngagement)),
      avgLearningMaterials: avg(facultyResults.map((f) => f.learningMaterials)),
      avgTimeManagement: avg(facultyResults.map((f) => f.timeManagement)),
      avgExperientialLearning: avg(facultyResults.map((f) => f.experientialLearning)),
      avgRespectUniqueness: avg(facultyResults.map((f) => f.respectUniqueness)),
      avgAssessmentAndFeedback: avg(facultyResults.map((f) => f.assessmentAndFeedback)),
      avgGeneralRating: avg(facultyResults.map((f) => f.generalRating)),
    }],
    facultyResults,
  }
}

export async function getFacultyEvalReportData(facultyId: string, evaluationPeriodId?: string): Promise<EvalReportData> {
  const activePeriodId = evaluationPeriodId ?? (await getActiveEvaluationPeriodId())
  if (!activePeriodId) return { evaluationPeriodId: "", departments: [], facultyResults: [] }

  const { data: results } = await supabase
    .from("evaluation_results")
    .select("*")
    .eq("evaluation_period_id", activePeriodId)
    .eq("facultyId", facultyId)
  const rows = (results ?? []) as Array<Record<string, unknown>>

  const { data: user } = await supabase
    .from("users")
    .select("name, departmentId")
    .eq("id", facultyId)
    .single()
  const deptNameMap = await getDepartmentNameMap()
  const deptId = (user as Record<string, unknown>)?.departmentId as string | null

  const facultyResults: EvalReportFaculty[] = rows.map((r) => ({
    facultyId,
    facultyName: (user as Record<string, unknown>)?.name as string ?? facultyId,
    totalRespondents: (r.totalRespondents as number) ?? 0,
    professionalManner: r.professionalManner as number | null,
    communicationWithStudent: r.communicationWithStudent as number | null,
    studentEngagement: r.studentEngagement as number | null,
    learningMaterials: r.learningMaterials as number | null,
    timeManagement: r.timeManagement as number | null,
    experientialLearning: r.experientialLearning as number | null,
    respectUniqueness: r.respectUniqueness as number | null,
    assessmentAndFeedback: r.assessmentAndFeedback as number | null,
    generalRating: r.generalRating as number | null,
    remarks: r.remarks as string | null,
  }))

  return {
    evaluationPeriodId: activePeriodId,
    departments: deptId ? [{
      departmentId: deptId,
      departmentName: deptNameMap.get(deptId) ?? deptId,
      facultyCount: 1,
      totalRespondents: facultyResults.reduce((s, f) => s + f.totalRespondents, 0),
      avgProfessionalManner: avg(facultyResults.map((f) => f.professionalManner)),
      avgCommunicationWithStudent: avg(facultyResults.map((f) => f.communicationWithStudent)),
      avgStudentEngagement: avg(facultyResults.map((f) => f.studentEngagement)),
      avgLearningMaterials: avg(facultyResults.map((f) => f.learningMaterials)),
      avgTimeManagement: avg(facultyResults.map((f) => f.timeManagement)),
      avgExperientialLearning: avg(facultyResults.map((f) => f.experientialLearning)),
      avgRespectUniqueness: avg(facultyResults.map((f) => f.respectUniqueness)),
      avgAssessmentAndFeedback: avg(facultyResults.map((f) => f.assessmentAndFeedback)),
      avgGeneralRating: avg(facultyResults.map((f) => f.generalRating)),
    }] : [],
    facultyResults,
  }
}

export { CATEGORY_KEYS }

export interface DeanDashboardKpis {
  general: number | null; remark: string | null;
  actual: number; expected: number | null; responsePct: number | null;
  facultyEvaluated: number; facultyAssigned: number;
  atRisk: number; outstanding: number;
}
export interface DeanDashboardData {
  semesterId: string; evaluationPeriodId: string; rubricGroupName: string | null;
  kpis: DeanDashboardKpis;
  trend: { semesterId: string; title: string; general: number | null; rubricChanged: boolean }[];
  remarkMix: { remark: string; count: number }[];
  categories: { key: string; value: number | null; delta: number | null }[];
  lowResponse: { facultyId: string; facultyName: string; actual: number; expected: number | null }[];
  bottom5: EvalReportFaculty[]; top5: EvalReportFaculty[];
}
function remarkOf(g: number | null): string | null {
  return g === null ? null : g >= 4.5 ? "Outstanding" : g >= 3.5 ? "Very Satisfactory" : g >= 2.5 ? "Satisfactory" : g >= 1.5 ? "Unsatisfactory" : "Poor"
}

// Additive dashboard internals — existing report functions above are untouched.
async function facultyGrainForDept(departmentId: string, periodId: string): Promise<EvalReportFaculty[]> {
  const resultRows = await evaluationResultRepository.list(periodId)
  const allRows = ((resultRows ?? []) as unknown) as Array<Record<string, unknown>>
  const allFacIds = [...new Set(allRows.map((r) => r.facultyId as string))]
  const allUsers = allFacIds.length > 0 ? await userRepository.listByIds(allFacIds) : []
  const liveDept = new Map(allUsers.map((u) => [u.id, (u as { id: string; departmentId: string | null }).departmentId ?? null]))
  const rows = allRows.filter((r) => liveDept.get(r.facultyId as string) === departmentId)
  const facultyIds = [...new Set(rows.map((r) => r.facultyId as string))]
  const users = facultyIds.length > 0 ? await userRepository.listByIds(facultyIds) : []
  const userMap = new Map(users.map((u) => [u.id, (u as { id: string; name: string }).name]))
  return rows.map((r) => {
    const facultyId = r.facultyId as string
    return {
      facultyId,
      facultyName: userMap.get(facultyId) ?? facultyId,
      totalRespondents: (r.totalRespondents as number) ?? 0,
      professionalManner: r.professionalManner as number | null,
      communicationWithStudent: r.communicationWithStudent as number | null,
      studentEngagement: r.studentEngagement as number | null,
      learningMaterials: r.learningMaterials as number | null,
      timeManagement: r.timeManagement as number | null,
      experientialLearning: r.experientialLearning as number | null,
      respectUniqueness: r.respectUniqueness as number | null,
      assessmentAndFeedback: r.assessmentAndFeedback as number | null,
      generalRating: r.generalRating as number | null,
      remarks: r.remarks as string | null,
    }
  })
}

async function deptPeriodAverages(departmentId: string, periodId: string) {
  const resultRows = await evaluationResultRepository.list(periodId)
  const allRows = ((resultRows ?? []) as unknown) as Array<Record<string, unknown>>
  const facIds = [...new Set(allRows.map((r) => r.facultyId as string))]
  const users = facIds.length > 0 ? await userRepository.listByIds(facIds) : []
  const liveDept = new Map(users.map((u) => [u.id, (u as { id: string; departmentId: string | null }).departmentId ?? null]))
  const rows = allRows.filter((r) => liveDept.get(r.facultyId as string) === departmentId)
  const cats: Record<string, number | null> = {}
  for (const key of CATEGORY_KEYS) cats[key] = avg(rows.map((r) => (r[key] as number | null) ?? null))
  return {
    general: avg(rows.map((r) => (r.generalRating as number | null) ?? null)),
    cats,
    respondents: rows.reduce((s, r) => s + ((r.totalRespondents as number) ?? 0), 0),
    facultyIds: [...new Set(rows.map((r) => r.facultyId as string))],
  }
}

async function deptExpectedCounts(departmentId: string, semesterId: string | null) {
  if (!semesterId) return { total: 0, byFaculty: new Map<string, number>() }
  const allFS = await facultySubjectRepository.listAllWithEmbeds({ semesterId })
  const mine = allFS.filter((fs) => fs.faculty?.departmentId === departmentId)
  const ids = mine.map((fs) => fs.id)
  const counts = ids.length > 0 ? await studentEnrollmentRepository.countByFacultySubjectIds(ids, semesterId) : {}
  const byFaculty = new Map<string, number>()
  for (const fs of mine) byFaculty.set(fs.faculty_id, (byFaculty.get(fs.faculty_id) ?? 0) + (counts[fs.id] ?? 0))
  return { total: [...byFaculty.values()].reduce((a, b) => a + b, 0), byFaculty }
}

async function buildDeptDashboard(dept: { id: string; name: string }, periodId: string): Promise<DeanDashboardData> {
  const [grain, cur, period, descList] = await Promise.all([
    facultyGrainForDept(dept.id, periodId),
    deptPeriodAverages(dept.id, periodId),
    evaluationPeriodRepository.findById(periodId),
    evaluationPeriodRepository.list(),
  ])
  let rubricGroupName: string | null = null
  if (period?.rubricGroupId) rubricGroupName = (await rubricGroupRepository.findById(period.rubricGroupId))?.name ?? null
  const idx = descList.findIndex((p) => p.id === periodId)
  const prev = idx >= 0 ? (descList[idx + 1] ?? null) : null
  const prevAvg = prev ? await deptPeriodAverages(dept.id, prev.id) : null
  const deltaFor = (key: string, v: number | null) =>
    v === null || !prevAvg || prevAvg.cats[key] == null ? null : Math.round((v - (prevAvg.cats[key] as number)) * 100) / 100
  const trend = []
  for (const p of descList.slice(0, 4).reverse()) {
    const a = p.id === periodId ? cur : await deptPeriodAverages(dept.id, p.id)
    trend.push({
      semesterId: p.semesterId,
      title: [p.semesterTitle, p.name].filter(Boolean).join(" — "),
      general: a.general,
      rubricChanged: (p.rubricGroupId ?? null) !== (period?.rubricGroupId ?? null),
    })
  }
  const { total: expected, byFaculty } = await deptExpectedCounts(dept.id, period?.semesterId ?? null)
  const responsePct = expected > 0 ? Math.round((cur.respondents / expected) * 100) : null
  const rows = grain.filter((f) => (f.totalRespondents ?? 0) >= 5)
  const sorted = [...rows].sort((a, b) => (b.generalRating ?? -1) - (a.generalRating ?? -1))
  return {
    semesterId: period?.semesterId ?? periodId,
    evaluationPeriodId: periodId,
    rubricGroupName,
    kpis: {
      general: cur.general, remark: remarkOf(cur.general),
      actual: cur.respondents, expected, responsePct,
      facultyEvaluated: rows.length, facultyAssigned: grain.length,
      atRisk: rows.filter((f) => (f.generalRating ?? 5) < 2.5).length,
      outstanding: rows.filter((f) => (f.generalRating ?? 0) >= 4.5).length,
    },
    trend,
    remarkMix: ["Outstanding", "Very Satisfactory", "Satisfactory", "Unsatisfactory", "Poor"].map((remark) => ({
      remark, count: rows.filter((f) => remarkOf(f.generalRating) === remark).length,
    })),
    categories: CATEGORY_KEYS.map((key) => ({ key, value: cur.cats[key], delta: deltaFor(key, cur.cats[key]) })),
    lowResponse: grain.filter((f) => f.totalRespondents < 5).map((f) => ({ facultyId: f.facultyId, facultyName: f.facultyName, actual: f.totalRespondents, expected: byFaculty.get(f.facultyId) ?? null })),
    bottom5: [...rows].sort((a, b) => (a.generalRating ?? 9) - (b.generalRating ?? 9)).slice(0, 5),
    top5: sorted.slice(0, 5),
  }
}

export async function getDeanDashboardData(deanId: string, semesterId?: string, evaluationPeriodId?: string): Promise<DeanDashboardData | null> {
  const dept = await departmentRepository.findByDeanId(deanId)
  if (!dept) return null
  let periodId = evaluationPeriodId ?? null
  if (!periodId && semesterId) {
    const options = await evaluationPeriodRepository.findBySemester(semesterId)
    periodId = options.find((p) => p.isActive)?.id ?? options[0]?.id ?? null
  }
  if (!periodId) periodId = await getActiveEvaluationPeriodId()
  if (!periodId) return null
  return buildDeptDashboard({ id: dept.id, name: dept.name }, periodId)
}

export interface AdminDeptBar { departmentId: string; departmentName: string; general: number | null; remark: string | null; respondents: number }
export interface AdminDashboardData { evaluationPeriodId: string; departments: AdminDeptBar[]; selected: DeanDashboardData | null }
export async function getAdminDashboardData(evaluationPeriodId?: string, departmentId?: string): Promise<AdminDashboardData | null> {
  const periodId = evaluationPeriodId ?? await getActiveEvaluationPeriodId()
  if (!periodId) return null
  const depts = await departmentRepository.listAll()
  const departments: AdminDeptBar[] = []
  for (const d of depts) {
    const a = await deptPeriodAverages(d.id, periodId)
    departments.push({ departmentId: d.id, departmentName: d.name, general: a.general, remark: remarkOf(a.general), respondents: a.respondents })
  }
  departments.sort((a, b) => (b.general ?? -1) - (a.general ?? -1))
  let selected: DeanDashboardData | null = null
  if (departmentId) {
    const dept = await departmentRepository.findById(departmentId)
    if (dept) selected = await buildDeptDashboard({ id: dept.id, name: dept.name }, periodId)
  }
  return { evaluationPeriodId: periodId, departments, selected }
}
