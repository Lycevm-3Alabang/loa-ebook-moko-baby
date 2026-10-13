import { supabase } from "@/lib/supabase"
import { departmentRepository, evaluationPeriodRepository, evaluationResultRepository, userRepository } from "@/lib/repositories/factory"

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
  const allRows = (resultRows ?? []) as Array<Record<string, unknown>>

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
export async function getDeanDashboardData(deanId: string, semesterId?: string, evaluationPeriodId?: string): Promise<DeanDashboardData | null> {
  const periodId = evaluationPeriodId ?? semesterId ?? await getActiveEvaluationPeriodId();
  if (!periodId) return null;
  const base = await getDeanEvalReportData(deanId, periodId);
  if (base.departments.length === 0) return null;
  const rows = base.facultyResults.filter((f) => (f.totalRespondents ?? 0) >= 5);
  const gen = (f: EvalReportFaculty) => f.generalRating;
  const sorted = [...rows].sort((a, b) => (b.generalRating ?? -1) - (a.generalRating ?? -1));
  const remarkOf = (g: number | null) => g === null ? null : g >= 4.5 ? "Outstanding" : g >= 3.5 ? "Very Satisfactory" : g >= 2.5 ? "Satisfactory" : g >= 1.5 ? "Unsatisfactory" : "Poor";
  const dept = base.departments[0];
  const totalResp = rows.reduce((s, f) => s + f.totalRespondents, 0);
  return {
    semesterId: periodId, evaluationPeriodId: periodId, rubricGroupName: null,
    kpis: {
      general: dept.avgGeneralRating, remark: remarkOf(dept.avgGeneralRating),
      actual: totalResp, expected: null, responsePct: null,
      facultyEvaluated: rows.length, facultyAssigned: base.facultyResults.length,
      atRisk: rows.filter((f) => (f.generalRating ?? 5) < 2.5).length,
      outstanding: rows.filter((f) => (f.generalRating ?? 0) >= 4.5).length,
    },
    trend: [{ semesterId: periodId, title: "", general: dept.avgGeneralRating, rubricChanged: false }],
    remarkMix: ["Outstanding","Very Satisfactory","Satisfactory","Unsatisfactory","Poor"].map((remark) => ({
      remark, count: rows.filter((f) => remarkOf(gen(f)) === remark).length,
    })),
    categories: CATEGORY_KEYS.map((key) => ({ key, value: dept[`avg${key.charAt(0).toUpperCase()}${key.slice(1)}` as keyof EvalReportDepartment] as number | null, delta: null })),
    lowResponse: base.facultyResults.filter((f) => f.totalRespondents < 5).map((f) => ({ facultyId: f.facultyId, facultyName: f.facultyName, actual: f.totalRespondents, expected: null })),
    bottom5: [...rows].sort((a, b) => (a.generalRating ?? 9) - (b.generalRating ?? 9)).slice(0, 5),
    top5: sorted.slice(0, 5),
  };
}
