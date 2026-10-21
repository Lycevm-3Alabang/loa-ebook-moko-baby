import { departmentRepository, evaluationPeriodRepository, userRepository } from "@/lib/repositories/factory"
import { getFacultyCountsByDepartment } from "@/features/users/users.service"
import { getCachedFacultyFigures } from "@/features/evaluation-results/figure-cache"
import { aggregatePooledAverages, computeCategoryAveragesFromTotals, poolCategoryTotals } from "@/lib/evaluation-utils"
import type { FacultyFigures } from "@/lib/types"

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

/** One faculty row of the report: the figures' own numbers. */
function facultyRow(figures: FacultyFigures, facultyId: string, facultyName: string): EvalReportFaculty {
  const c = figures.catColumns
  return {
    facultyId,
    facultyName,
    totalRespondents: figures.totalRespondents,
    professionalManner: c.professionalManner ?? null,
    communicationWithStudent: c.communicationWithStudent ?? null,
    studentEngagement: c.studentEngagement ?? null,
    learningMaterials: c.learningMaterials ?? null,
    timeManagement: c.timeManagement ?? null,
    experientialLearning: c.experientialLearning ?? null,
    respectUniqueness: c.respectUniqueness ?? null,
    assessmentAndFeedback: c.assessmentAndFeedback ?? null,
    generalRating: figures.avgRating,
    remarks: figures.remarks,
  }
}

/** One department row of the report: the POOLED figures of its faculty. */
function departmentRow(
  departmentId: string,
  departmentName: string,
  facultyCount: number,
  totalRespondents: number,
  pooled: { avgRating: number | null; catColumns: Record<string, number | null> },
): EvalReportDepartment {
  const c = pooled.catColumns
  return {
    departmentId,
    departmentName,
    facultyCount,
    totalRespondents,
    avgProfessionalManner: c.professionalManner ?? null,
    avgCommunicationWithStudent: c.communicationWithStudent ?? null,
    avgStudentEngagement: c.studentEngagement ?? null,
    avgLearningMaterials: c.learningMaterials ?? null,
    avgTimeManagement: c.timeManagement ?? null,
    avgExperientialLearning: c.experientialLearning ?? null,
    avgRespectUniqueness: c.respectUniqueness ?? null,
    avgAssessmentAndFeedback: c.assessmentAndFeedback ?? null,
    avgGeneralRating: pooled.avgRating,
  }
}

/**
 * The dean's report: their department's pooled figures and one row per
 * member — the faculty homed in the department.
 *
 * The figures are read per faculty and kept for five minutes, so the report
 * and the results list read the same rows. The department's row is the POOL of
 * its faculty's figures — the mean over the rating rows, not a mean of the
 * faculty's means.
 */
export async function getDeanEvalReportData(deanId: string, evaluationPeriodId?: string): Promise<EvalReportData> {
  const activePeriodId = evaluationPeriodId ?? (await getActiveEvaluationPeriodId())
  if (!activePeriodId) return { evaluationPeriodId: "", departments: [], facultyResults: [] }

  const dept = await departmentRepository.findByDeanId(deanId)
  if (!dept) return { evaluationPeriodId: "", departments: [], facultyResults: [] }

  // The department's own faculty — the accounts homed in it. A teacher homed
  // elsewhere is not this department's.
  const faculty = await userRepository.listByRole("FACULTY")
  const members = faculty.filter((u) => u.departmentId === dept.id)

  // Their figures, one read each, in parallel.
  const figures = await Promise.all(
    members.map((m) => getCachedFacultyFigures(m.id, activePeriodId).then((c) => c.figures)),
  )

  const facultyResults = figures.map((f, i) => facultyRow(f, members[i].id, members[i].name))

  // The department's own figure: the pool of its faculty's totals. The
  // weights travel with the read, so this is the mean over the rating rows.
  const pooled = aggregatePooledAverages(
    computeCategoryAveragesFromTotals(poolCategoryTotals(figures.map((f) => f.catTotals))),
    null,
  )
  const facultyCounts = await getFacultyCountsByDepartment()

  return {
    evaluationPeriodId: activePeriodId,
    departments: [
      departmentRow(
        dept.id,
        dept.name,
        facultyCounts[dept.id] ?? 0,
        figures.reduce((sum, f) => sum + f.totalRespondents, 0),
        pooled,
      ),
    ],
    facultyResults,
  }
}

/**
 * The faculty's own report: their figures for the period, and the row of the
 * department they are homed in.
 */
export async function getFacultyEvalReportData(facultyId: string, evaluationPeriodId?: string): Promise<EvalReportData> {
  const activePeriodId = evaluationPeriodId ?? (await getActiveEvaluationPeriodId())
  if (!activePeriodId) return { evaluationPeriodId: "", departments: [], facultyResults: [] }

  // Their own figures — read once and kept for five minutes.
  const { figures } = await getCachedFacultyFigures(facultyId, activePeriodId)

  // The account, deleted or not: a teacher who has left still has a record
  // here.
  const users = await userRepository.listByIds([facultyId], { includeDeleted: true })
  const user = users[0]
  const deptId = user?.departmentId ?? null

  const facultyResults: EvalReportFaculty[] = [facultyRow(figures, facultyId, user?.name ?? facultyId)]

  if (!deptId) {
    return { evaluationPeriodId: activePeriodId, departments: [], facultyResults }
  }

  const deptNameMap = await getDepartmentNameMap()

  return {
    evaluationPeriodId: activePeriodId,
    departments: [
      departmentRow(
        deptId,
        deptNameMap.get(deptId) ?? deptId,
        1,
        figures.totalRespondents,
        { avgRating: figures.avgRating, catColumns: figures.catColumns },
      ),
    ],
    facultyResults,
  }
}

// The dashboard shapes. The report pages' dashboard blocks are preview data,
// and these are the types they are typed with.

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
export interface AdminDeptBar { departmentId: string; departmentName: string; general: number | null; remark: string | null; respondents: number }
export interface AdminDashboardData { evaluationPeriodId: string; departments: AdminDeptBar[]; selected: DeanDashboardData | null }
