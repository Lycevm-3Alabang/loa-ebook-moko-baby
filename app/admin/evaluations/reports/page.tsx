import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { hasRole } from "@/lib/utils/roles"
import type { AdminDashboardData, DeanDashboardData } from "@/features/evaluations/evaluation-report.service"
import { departmentRepository, semesterRepository, evaluationPeriodRepository } from "@/lib/repositories/factory"
import { KpiCards, TrendLine, RemarkStack, CategoryBars, ResponseStrip, AttentionCards, DeptBars, DashboardEmpty } from "@/features/evaluations/components/dashboard/DashboardVisuals"

export default async function AdminEvalReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ departmentId?: string; semesterId?: string; evaluationPeriodId?: string }>
}) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "ADMIN"))
    redirect("/login")

  const sp = await searchParams
  const [allDepts, semesters] = await Promise.all([departmentRepository.listAll(), semesterRepository.list()])
  const activeSem = semesters.find((s) => s.isActive) ?? semesters[0]
  const semesterId = sp.semesterId ?? activeSem?.id ?? ""
  const periods = semesterId ? await evaluationPeriodRepository.findBySemester(semesterId) : []
  const evaluationPeriodId = sp.evaluationPeriodId ?? periods.find((p) => p.isActive)?.id ?? periods[0]?.id ?? ""
  const deptId = sp.departmentId ?? allDepts[0]?.id ?? ""
  const previewSelected: DeanDashboardData = {
    semesterId,
    evaluationPeriodId,
    rubricGroupName: "Preview Rubric",
    kpis: { general: 4.2, remark: "Very Satisfactory", actual: 87, expected: 100, responsePct: 87, facultyEvaluated: 22, facultyAssigned: 24, atRisk: 2, outstanding: 6 },
    trend: [
      { semesterId, title: "Sem 0 — Final", general: 3.4, rubricChanged: false },
      { semesterId, title: "Sem 1 — Prelim", general: 3.6, rubricChanged: false },
      { semesterId, title: "Sem 1 — Midterm", general: 3.9, rubricChanged: true },
      { semesterId, title: "Sem 1 — Final", general: 4.2, rubricChanged: false },
    ],
    remarkMix: [
      { remark: "Outstanding", count: 6 },
      { remark: "Very Satisfactory", count: 11 },
      { remark: "Satisfactory", count: 4 },
      { remark: "Unsatisfactory", count: 2 },
      { remark: "Poor", count: 1 },
    ],
    categories: [
      { key: "professionalManner", value: 4.35, delta: 0.12 },
      { key: "communicationWithStudent", value: 4.28, delta: -0.04 },
      { key: "studentEngagement", value: 4.1, delta: 0.2 },
      { key: "learningMaterials", value: 4.05, delta: 0 },
      { key: "timeManagement", value: 3.62, delta: -0.15 },
      { key: "experientialLearning", value: 3.9, delta: 0.08 },
      { key: "respectUniqueness", value: 4.22, delta: 0.05 },
      { key: "assessmentAndFeedback", value: 3.71, delta: -0.06 },
    ],
    lowResponse: [{ facultyId: "preview-f1", facultyName: "Preview Faculty", actual: 3, expected: 28 }],
    bottom5: [
      { facultyId: "preview-f1", facultyName: "Preview Faculty", totalRespondents: 12, professionalManner: 2.4, communicationWithStudent: 2.3, studentEngagement: 2.2, learningMaterials: 2.4, timeManagement: 1.9, experientialLearning: 2.1, respectUniqueness: 2.5, assessmentAndFeedback: 2.0, generalRating: 2.31, remarks: "Unsatisfactory" },
      { facultyId: "preview-f2", facultyName: "Sample Lecturer", totalRespondents: 30, professionalManner: 2.9, communicationWithStudent: 2.8, studentEngagement: 2.7, learningMaterials: 2.9, timeManagement: 2.6, experientialLearning: 2.8, respectUniqueness: 3.0, assessmentAndFeedback: 2.7, generalRating: 2.78, remarks: "Satisfactory" },
    ],
    top5: [
      { facultyId: "preview-f3", facultyName: "Demo Professor", totalRespondents: 44, professionalManner: 4.4, communicationWithStudent: 4.3, studentEngagement: 4.2, learningMaterials: 4.3, timeManagement: 4.1, experientialLearning: 4.2, respectUniqueness: 4.4, assessmentAndFeedback: 4.0, generalRating: 4.32, remarks: "Very Satisfactory" },
    ],
  }
  const previewAdmin: AdminDashboardData = {
    evaluationPeriodId,
    departments: [
      { departmentId: "preview-ccs", departmentName: "Preview Dept A", general: 3.62, remark: "Very Satisfactory", respondents: 412 },
      { departmentId: "preview-coe", departmentName: "Preview Dept B", general: 3.41, remark: "Satisfactory", respondents: 388 },
      { departmentId: "preview-cba", departmentName: "Preview Dept C", general: 3.85, remark: "Very Satisfactory", respondents: 301 },
    ],
    selected: previewSelected,
  }
  const data: AdminDashboardData | null = previewAdmin
  const dashboard = data?.selected ?? null
  const facultyLink = (name: string) => `/admin/evaluations/results/${deptId}?evaluationPeriodId=${evaluationPeriodId}&search=${encodeURIComponent(name)}`

  return (
    <div className="w-full space-y-6 pb-12">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-xs">Department
          <select name="departmentId" defaultValue={deptId} className="ml-2 border rounded-lg px-2 py-1.5">
            {allDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="text-xs">Semester
          <select name="semesterId" defaultValue={semesterId} className="ml-2 border rounded-lg px-2 py-1.5">
            {semesters.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
        <label className="text-xs">Period
          <select name="evaluationPeriodId" defaultValue={evaluationPeriodId} className="ml-2 border rounded-lg px-2 py-1.5">
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button type="submit" className="text-xs px-3 py-1.5 rounded-lg border">Apply</button>
        {dashboard?.rubricGroupName && <span className="text-xs text-tertiary">Rubric: {dashboard.rubricGroupName}</span>}
      </form>

      {data && <DeptBars departments={data.departments} linkFor={(id) => `/admin/evaluations/reports?evaluationPeriodId=${evaluationPeriodId}&departmentId=${id}`} placeholder />}

      {!dashboard ? <DashboardEmpty /> : (
        <>
          <KpiCards dashboard={dashboard} placeholder />
          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-7"><TrendLine trend={dashboard.trend} placeholder /></div>
            <div className="md:col-span-5"><RemarkStack mix={dashboard.remarkMix} placeholder /></div>
          </div>
          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-7"><CategoryBars categories={dashboard.categories} placeholder /></div>
            <div className="md:col-span-5"><ResponseStrip dashboard={dashboard} placeholder /></div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <AttentionCards title="Attention" items={dashboard.bottom5} tone="risk" linkFor={facultyLink} placeholder />
            <AttentionCards title="Recognition" items={dashboard.top5} tone="praise" linkFor={facultyLink} placeholder />
          </div>
        </>
      )}
    </div>
  )
}
