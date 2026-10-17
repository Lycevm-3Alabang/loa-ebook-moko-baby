"use client"

import { useEffect, useMemo, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import { useApiGet, dispatchToast, downloadFromApi } from "@/lib/api/client"
import { formatPeriodLabel } from "@/lib/evaluation-utils"

interface Period {
  id: string
  title?: string
  name?: string
  semesterTitle?: string
}

export default function DeanEvaluationResultsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId")
  const redirectedRef = useRef(false)

  const { data: periodsData } = useApiGet<{ periods: Period[] }>("/api/evaluation-periods")
  const { data: deptData } = useApiGet<{ departmentId: string | null }>("/api/dean/evaluation-results/department")
  const periods = useMemo(() => (Array.isArray(periodsData?.periods) ? periodsData.periods : Array.isArray(periodsData) ? periodsData : []) as Period[], [periodsData])
  const deptId = deptData?.departmentId ?? null
  const loading = deptData === undefined

  useEffect(() => {
    if (evaluationPeriodId && deptId && !redirectedRef.current) {
      redirectedRef.current = true
      router.replace(`/dean/evaluations/results/${deptId}?evaluationPeriodId=${encodeURIComponent(evaluationPeriodId)}`)
    }
  }, [evaluationPeriodId, deptId, router])

  const handleSelect = (id: string) => {
    if (deptId) {
      router.replace(`/dean/evaluations/results/${deptId}?evaluationPeriodId=${encodeURIComponent(id)}`)
    }
  }

  const exportZip = () => {
    const period = evaluationPeriodId || (periods.length > 0 ? periods[0].id : "")
    if (!period) {
      dispatchToast("Select an evaluation period before exporting.")
      return
    }
    void downloadFromApi(
      `/api/dean/evaluation-results/export?evaluationPeriodId=${encodeURIComponent(period)}`,
      `evaluation-results-${period}.zip`,
    )
  }

  if (loading) {
    return (
      <div className="w-full space-y-4 pb-12">
        <Skeleton variant="text" />
        <Skeleton variant="table-row" />
      </div>
    )
  }

  if (!deptId) {
    return (
      <div className="w-full space-y-6 pb-12">
        <h1 className="text-2xl font-bold text-primary">Evaluation Results</h1>
        <div className="card p-12 sm:p-16 bg-surface text-center animate-fade-in">
          <div className="w-16 h-16 bg-gold-50 border border-gold-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">🏛️</span>
          </div>
          <h2 className="text-lg font-bold text-primary mb-2">No department association found for your account</h2>
          <p className="text-sm text-tertiary max-w-md mx-auto">
            Your dean account isn&apos;t linked to a department yet. Ask an administrator to
            assign your account as dean of your department, then reload this page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 pb-12">
      <h1 className="text-2xl font-bold text-primary">Evaluation Results</h1>
      <p className="text-xs text-tertiary">Select a period to view your department&apos;s evaluation results.</p>

      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-secondary">Period</label>
        <select
          value={evaluationPeriodId ?? ""}
          onChange={(e) => handleSelect(e.target.value)}
          className="input text-xs px-3 py-2 rounded-lg border border-strong bg-surface"
        >
          <option value="">Select a period...</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{formatPeriodLabel(p)}</option>
          ))}
        </select>
        <button
          onClick={exportZip}
          title="Download your department's results as a ZIP of CSVs"
          className="rounded-xl border border-default bg-surface px-3 py-2 text-sm text-secondary shadow-sm transition-colors focus:border-slate-400 focus:outline-none"
        >
          Export (ZIP)
        </button>
      </div>
    </div>
  )
}
