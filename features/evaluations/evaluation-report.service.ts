import { supabase } from "@/lib/supabase"
import { departmentRepository, evaluationPeriodRepository } from "@/lib/repositories/factory"

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

  const { data: dept } = await supabase
    .from("departments")
    .select("id, name")
    .eq("deanId", deanId)
    .single()
  if (!dept) return { evaluationPeriodId: "", departments: [], facultyResults: [] }

  // Live home department — do not filter by evaluation_results.departmentId (stale snapshot).
  const { data: results } = await supabase
    .from("evaluation_results")
    .select("*")
    .eq("evaluation_period_id", activePeriodId)
  const allRows = (results ?? []) as Array<Record<string, unknown>>

  const allFacIds = [...new Set(allRows.map((r) => r.facultyId as string))]
  const { data: allUsers } = await supabase
    .from("users")
    .select("id, name, departmentId")
    .in("id", allFacIds)
  const liveDept = new Map(
    (allUsers ?? []).map((u: Record<string, unknown>) => [u.id, u.departmentId as string | null]),
  )
  const rows = allRows.filter((r) => liveDept.get(r.facultyId as string) === dept.id)

  const facultyIds = [...new Set(rows.map((r) => r.facultyId as string))]
  const { data: users } = await supabase
    .from("users")
    .select("id, name")
    .in("id", facultyIds)
  const userMap = new Map((users ?? []).map((u: Record<string, unknown>) => [u.id, (u as { id: string; name: string }).name]))

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
