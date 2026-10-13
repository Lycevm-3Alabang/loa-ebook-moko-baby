import Link from "next/link"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { hasRole } from "@/lib/utils/roles"
import { getDeanEvalReportData, getDeanDashboardData } from "@/features/evaluations/evaluation-report.service"
import { semesterRepository, evaluationPeriodRepository } from "@/lib/repositories/factory"
import EvaluationReportContent from "@/features/evaluations/components/EvaluationReportContent"

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
        <div className="bg-white rounded-xl border p-12 text-center">
          <p className="text-sm text-tertiary">No data for this semester / period.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border p-4"><p className="text-[10px] text-tertiary">General</p><p className="text-2xl font-bold">{dashboard.kpis.general?.toFixed(2) ?? "—"}</p><p className="text-xs">{dashboard.kpis.remark ?? ""}</p></div>
            <div className="bg-white rounded-xl border p-4"><p className="text-[10px] text-tertiary">Response</p><p className="text-2xl font-bold">{dashboard.kpis.responsePct ?? "—"}</p><p className="text-xs">{dashboard.kpis.actual} responses</p></div>
            <div className="bg-white rounded-xl border p-4"><p className="text-[10px] text-tertiary">Faculty</p><p className="text-2xl font-bold">{dashboard.kpis.facultyEvaluated}/{dashboard.kpis.facultyAssigned}</p></div>
            <div className="bg-white rounded-xl border p-4"><p className="text-[10px] text-tertiary">Risk</p><p className="text-2xl font-bold">{dashboard.kpis.atRisk} at-risk</p><p className="text-xs">{dashboard.kpis.outstanding} outstanding</p></div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="bg-white rounded-xl border p-4"><p className="text-xs font-bold mb-2">Trend</p>
              {dashboard.trend.map((t) => <p key={t.semesterId} className="text-xs">{t.title || t.semesterId}: {t.general?.toFixed(2) ?? "—"}{t.rubricChanged ? " ⚠ rubric changed" : ""}</p>)}
            </div>
            <div className="bg-white rounded-xl border p-4"><p className="text-xs font-bold mb-2">Remarks</p>
              {dashboard.remarkMix.map((r) => <p key={r.remark} className="text-xs">{r.remark}: {r.count}</p>)}
            </div>
          </div>

          <div className="bg-white rounded-xl border p-4"><p className="text-xs font-bold mb-2">Categories</p>
            {dashboard.categories.map((c) => (
              <div key={c.key} className="flex items-center gap-3 py-1">
                <span className="text-xs w-40">{c.key}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${c.value !== null ? (c.value / 5) * 100 : 0}%` }} /></div>
                <span className="text-xs w-10 text-right">{c.value?.toFixed(2) ?? "—"}</span>
                <span className="text-xs w-12 text-right">{c.delta === null ? "" : c.delta > 0 ? `▲${c.delta}` : `▼${c.delta}`}</span>
              </div>
            ))}
          </div>

          {dashboard.lowResponse.length > 0 && (
            <div className="bg-white rounded-xl border p-4"><p className="text-xs font-bold mb-2">Response health</p>
              {dashboard.lowResponse.map((r) => <p key={r.facultyId} className="text-xs">⚠ {r.facultyName}: {r.actual} responses</p>)}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="bg-white rounded-xl border p-4"><p className="text-xs font-bold mb-2">Bottom 5</p>
              {dashboard.bottom5.map((f, i) => <p key={f.facultyId} className="text-xs">{i + 1}. <Link className="underline" href={`/dean/evaluations/results/${deptId}?evaluationPeriodId=${periodId}&search=${encodeURIComponent(f.facultyName)}`}>{f.facultyName}</Link> — {f.generalRating?.toFixed(2) ?? "—"}</p>)}
            </div>
            <div className="bg-white rounded-xl border p-4"><p className="text-xs font-bold mb-2">Top 5</p>
              {dashboard.top5.map((f, i) => <p key={f.facultyId} className="text-xs">{i + 1}. <Link className="underline" href={`/dean/evaluations/results/${deptId}?evaluationPeriodId=${periodId}&search=${encodeURIComponent(f.facultyName)}`}>{f.facultyName}</Link> — {f.generalRating?.toFixed(2) ?? "—"}</p>)}
            </div>
          </div>
        </>
      )}

      <EvaluationReportContent role="dean" evaluationPeriodId={periodId} initialData={base} />
    </div>
  )
}
