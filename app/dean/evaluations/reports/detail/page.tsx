import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { hasRole } from "@/lib/utils/roles"
import { getDeanEvalReportData, getDeanDashboardData } from "@/features/evaluations/evaluation-report.service"
import { semesterRepository, evaluationPeriodRepository } from "@/lib/repositories/factory"
import EvaluationReportContent from "@/features/evaluations/components/EvaluationReportContent"
import { KpiCards, TrendLine, RemarkStack, CategoryBars, ResponseStrip, AttentionCards, DashboardEmpty } from "@/features/evaluations/components/dashboard/DashboardVisuals"

export default async function DeanEvalReportDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ semesterId?: string; evaluationPeriodId?: string }>
}) {
  const session = await auth()
  if (!session?.user || !hasRole((session.user as Record<string, unknown>).role as string, "DEAN"))
    redirect("/login")

  const userId = (session.user as Record<string, unknown>).id as string
  const sp = await searchParams
  const semesters = await semesterRepository.list()
  const activeSem = semesters.find((s) => s.isActive) ?? semesters[0]
  const semesterId = sp.semesterId ?? activeSem?.id ?? ""
  const periods = semesterId ? await evaluationPeriodRepository.findBySemester(semesterId) : []
  const evaluationPeriodId = sp.evaluationPeriodId ?? periods.find((p) => p.isActive)?.id ?? periods[0]?.id ?? ""

  const [base, dashboard] = await Promise.all([
    evaluationPeriodId ? getDeanEvalReportData(userId, evaluationPeriodId) : getDeanEvalReportData(userId),
    getDeanDashboardData(userId, semesterId || undefined, evaluationPeriodId || undefined),
  ])
  const periodId = dashboard?.evaluationPeriodId ?? base.evaluationPeriodId
  const deptId = base.departments[0]?.departmentId ?? ""
  const facultyLink = (name: string) => `/dean/evaluations/results/${deptId}?evaluationPeriodId=${periodId}&search=${encodeURIComponent(name)}`

  return (
    <div className="w-full space-y-6 pb-12">
      <form method="get" className="flex flex-wrap items-end gap-3">
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

      {!dashboard ? (
        <DashboardEmpty />
      ) : (
        <>
          <KpiCards dashboard={dashboard} />
          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-7"><TrendLine trend={dashboard.trend} /></div>
            <div className="md:col-span-5"><RemarkStack mix={dashboard.remarkMix} /></div>
          </div>
          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-7"><CategoryBars categories={dashboard.categories} /></div>
            <div className="md:col-span-5"><ResponseStrip dashboard={dashboard} /></div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <AttentionCards title="Attention" items={dashboard.bottom5} tone="risk" linkFor={facultyLink} />
            <AttentionCards title="Recognition" items={dashboard.top5} tone="praise" linkFor={facultyLink} />
          </div>
        </>
      )}

      <EvaluationReportContent role="dean" evaluationPeriodId={periodId} initialData={base} />
    </div>
  )
}
