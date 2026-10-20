"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useApiGet, dispatchToast, downloadFromApi } from "@/lib/api/client"
import IosButton from "@/components/ui/IosButton"
import { getRemarkColor, formatPeriodLabel, departmentLabel } from "@/lib/evaluation-utils"

interface DepartmentRow {
  departmentId: string
  departmentName: string
  departmentCode: string
  facultyCount: number
  totalRespondents: number
  avgRating: number | null
  remarks: string | null
  highestRubrics: { key: string; label: string; score: number }[]
  lowestRubrics: { key: string; label: string; score: number }[]
  sentimentScore: number | null
  /** The faculty who were assigned to teach in this period and received nothing. */
  noResponses: { id: string; name: string }[]
}

interface AttributionWarnings {
  unattributed: { count: number; faculty: { id: string; name: string }[] }
  offSemester: { count: number; faculty: { id: string; name: string }[] }
}

interface Period {
  id: string
  title?: string
  name?: string
  semesterTitle?: string
  isActive?: boolean
}

type SortKey = "departmentName" | "avgRating" | "facultyCount" | "totalRespondents" | "sentimentScore"

export default function AdminEvaluationResultsPage() {
  const router = useRouter()
  const [selectedPeriod, setSelectedPeriod] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("avgRating")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [expandedRoster, setExpandedRoster] = useState<Record<string, boolean>>({})

  const { data: periodsData } = useApiGet<{ periods: Period[] }>("/api/evaluation-periods")
  const periods = useMemo(() => periodsData?.periods ?? [], [periodsData])

  useEffect(() => {
    if (periods.length > 0 && !selectedPeriod) {
      const active = periods.find((p) => p.isActive)
      if (active) Promise.resolve().then(() => setSelectedPeriod(active.id))
    }
  }, [periods, selectedPeriod])

  const { data: resultsData, error: resultsError } = useApiGet<{ departments: DepartmentRow[]; warnings?: AttributionWarnings }>(
    selectedPeriod ? `/api/admin/evaluation-results?evaluationPeriodId=${encodeURIComponent(selectedPeriod)}` : null,
  )
  const departments = useMemo(() => resultsData?.departments ?? [], [resultsData])
  const warnings = resultsData?.warnings ?? null
  const error = resultsError?.message || ""
  const loading = !resultsData && !resultsError

  const sortedDepartments = useMemo(() => {
    const sorted = [...departments]
    sorted.sort((a, b) => {
      let aVal: number | string = a[sortKey] ?? ""
      let bVal: number | string = b[sortKey] ?? ""
      if (sortKey === "avgRating" || sortKey === "sentimentScore") {
        aVal = (a[sortKey] as number | null) ?? -1
        bVal = (b[sortKey] as number | null) ?? -1
        return sortDir === "desc" ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number)
      }
      if (typeof aVal === "number") {
        return sortDir === "desc" ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number)
      }
      return sortDir === "desc"
        ? String(bVal).localeCompare(String(aVal))
        : String(aVal).localeCompare(String(bVal))
    })
    return sorted
  }, [departments, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSortKey(key)
      setSortDir(key === "departmentName" ? "asc" : "desc")
    }
  }

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return ""
    return sortDir === "desc" ? " \u25BC" : " \u25B2"
  }

  const exportZip = () => {
    const period = selectedPeriod || (periods.length > 0 ? periods[0].id : "")
    if (!period) {
      dispatchToast("Select an evaluation period before exporting.")
      return
    }
    void downloadFromApi(
      `/api/admin/evaluation-results/export?evaluationPeriodId=${encodeURIComponent(period)}`,
      `evaluation-results-${period}.zip`,
    )
  }

  const formatScore = (v: number | null) => (v !== null ? v.toFixed(2) : "\u2014")

  return (
    <div className="w-full space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-primary">Evaluation Results</h1>
        <p className="text-xs text-tertiary mt-1">
          Department-level evaluation summary. Click a department to drill into per-subject results.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-secondary">Period</label>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="input text-xs px-3 py-2 rounded-lg border border-strong bg-surface"
        >
          <option value="">Select a period...</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{formatPeriodLabel(p)}</option>
          ))}
        </select>
        <IosButton
          variant="tinted"
          size="sm"
          onClick={exportZip}
          title="Download all departments as a ZIP of CSVs"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export
        </IosButton>
      </div>

      {error && <ErrorState message={error} onRetry={() => window.location.reload()} />}

      {warnings && (warnings.unattributed.count > 0 || warnings.offSemester.count > 0) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 space-y-1">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            Some evaluations could not be attributed to a department
          </p>
          {warnings.unattributed.count > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {warnings.unattributed.count} evaluation(s) point at a subject whose department could not be resolved
              {warnings.unattributed.faculty.length > 0 && (
                <> — {warnings.unattributed.faculty.map((f) => f.name).join(", ")}</>
              )}
            </p>
          )}
          {warnings.offSemester.count > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {warnings.offSemester.count} evaluation(s) point at a subject from another semester
              {warnings.offSemester.faculty.length > 0 && (
                <> — {warnings.offSemester.faculty.map((f) => f.name).join(", ")}</>
              )}
            </p>
          )}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <Skeleton variant="table-row" />
          <Skeleton variant="table-row" />
          <Skeleton variant="table-row" />
        </div>
      )}

      {!loading && !error && departments.length === 0 && selectedPeriod && (
        <p className="text-sm text-tertiary text-center py-8">No evaluation data found for this period.</p>
      )}

      {!loading && departments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-tertiary border-b border-default">
                <th className="pb-3 pr-4 cursor-pointer hover:text-secondary" onClick={() => toggleSort("departmentName")}>
                  Department{sortArrow("departmentName")}
                </th>
                <th className="pb-3 pr-4 cursor-pointer hover:text-secondary text-right" onClick={() => toggleSort("avgRating")}>
                  Avg Rating{sortArrow("avgRating")}
                </th>
                <th className="pb-3 pr-4 text-right">Highest Rubric</th>
                <th className="pb-3 pr-4 text-right">Lowest Rubric</th>
                <th className="pb-3 pr-4 cursor-pointer hover:text-secondary text-right" onClick={() => toggleSort("sentimentScore")}>
                  Sentiment{sortArrow("sentimentScore")}
                </th>
                <th className="pb-3 pr-4 cursor-pointer hover:text-secondary text-right" onClick={() => toggleSort("facultyCount")}>
                  Faculty{sortArrow("facultyCount")}
                </th>
                <th className="pb-3 pr-4 text-right">No responses</th>
                <th className="pb-3 pr-4 cursor-pointer hover:text-secondary text-right" onClick={() => toggleSort("totalRespondents")}>
                  Responses{sortArrow("totalRespondents")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedDepartments.map((dept) => (
                <tr
                  key={dept.departmentId}
                  onClick={() => router.push(`/admin/evaluations/results/${dept.departmentId}?evaluationPeriodId=${encodeURIComponent(selectedPeriod)}`)}
                  className="border-b border-default hover:bg-surface-hover cursor-pointer transition-colors"
                >
                  <td className="py-3 pr-4">
                    <div>
                      <span className="text-sm font-semibold text-primary">{departmentLabel(dept.departmentName, dept.departmentCode)}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <span className="text-sm font-bold">{formatScore(dept.avgRating)}</span>
                    {dept.remarks && (
                      <span className={`ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${getRemarkColor(dept.remarks)}`}>
                        {dept.remarks}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {dept.highestRubrics.length > 0 && (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        {dept.highestRubrics[0].label} ({formatScore(dept.highestRubrics[0].score)})
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {dept.lowestRubrics.length > 0 && (
                      <span className="text-[11px] text-red-600 dark:text-red-400">
                        {dept.lowestRubrics[0].label} ({formatScore(dept.lowestRubrics[0].score)})
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {dept.sentimentScore !== null ? (
                      <span className={`text-[11px] font-semibold ${
                        dept.sentimentScore >= 0.05 ? "text-emerald-600 dark:text-emerald-400" :
                        dept.sentimentScore <= -0.05 ? "text-red-600 dark:text-red-400" :
                        "text-amber-600 dark:text-amber-400"
                      }`}>
                        {dept.sentimentScore.toFixed(4)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-tertiary">&mdash;</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right text-sm text-secondary">{dept.facultyCount}</td>
                  <td className="py-3 pr-4 text-right">
                    {dept.noResponses && dept.noResponses.length > 0 ? (
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedRoster((prev) => ({ ...prev, [dept.departmentId]: !prev[dept.departmentId] }))
                        }}
                        className="cursor-pointer"
                      >
                        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          {dept.noResponses.length}
                        </span>
                        {expandedRoster[dept.departmentId] && (
                          <div className="mt-1 text-left text-[10px] text-tertiary space-y-0.5">
                            {dept.noResponses.map((f) => (
                              <div key={f.id}>{f.name}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-tertiary">&mdash;</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right text-sm text-secondary">{dept.totalRespondents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
