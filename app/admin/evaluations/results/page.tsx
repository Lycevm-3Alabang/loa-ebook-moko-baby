"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useApiGet, dispatchToast, downloadFromApi, fetcher } from "@/lib/api/client"
import IosButton from "@/components/ui/IosButton"
import { getRemarkColor, formatPeriodLabel, departmentLabel } from "@/lib/evaluation-utils"

interface DepartmentRow {
  departmentId: string
  departmentName: string
  departmentCode: string
  facultyCount: number
  avgRating: number | null
  remarks: string | null
  highestRubrics: { key: string; label: string; score: number }[]
  lowestRubrics: { key: string; label: string; score: number }[]
}

/** One department's figures, read on their own so a row can fill early. */
interface DepartmentFigures {
  totalRespondents: number
  avgRating: number | null
  remarks: string | null
  highestRubrics: { key: string; label: string; score: number }[]
  lowestRubrics: { key: string; label: string; score: number }[]
  sentimentScore: number | null
  /** When the numbers were read from the database. */
  cachedAt?: string
}

/** How many departments' figures are read at once. */
const FIGURE_CONCURRENCY = 3

/** How often the figures are read again. */
const FIGURES_REFRESH_MS = 5 * 60 * 1000

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

type SortKey = "departmentName" | "avgRating" | "facultyCount"

export default function AdminEvaluationResultsPage() {
  const router = useRouter()
  const [selectedPeriod, setSelectedPeriod] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("avgRating")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

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

  // Each department's figures, read on their own so a row fills as soon as
  // its numbers arrive. The list reads the departments first, so the table is
  // on screen while the ratings are still being read.
  const [figures, setFigures] = useState<Record<string, DepartmentFigures>>({})
  const [figuresFailed, setFiguresFailed] = useState<Record<string, boolean>>({})
  const [refreshTick, setRefreshTick] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  // The next read ignores the cache — the manual refresh.
  const forceNextRead = useRef(false)

  // The set of departments, as a string: the effect below must not re-run
  // every time the list is revalidated, or it would re-read every figure.
  const departmentIds = useMemo(() => departments.map((d) => d.departmentId).join(","), [departments])

  useEffect(() => {
    Promise.resolve().then(() => {
      setFigures({})
      setFiguresFailed({})
    })
  }, [selectedPeriod])

  useEffect(() => {
    if (!selectedPeriod || departmentIds.length === 0) return
    let cancelled = false
    const ids = departmentIds.split(",")
    const force = forceNextRead.current
    forceNextRead.current = false
    // Three at a time: the reads are the database's work, and a burst of
    // eleven would queue behind each other anyway.
    Promise.resolve().then(async () => {
      for (let i = 0; i < ids.length; i += FIGURE_CONCURRENCY) {
        if (cancelled) return
        const batch = ids.slice(i, i + FIGURE_CONCURRENCY)
        await Promise.all(batch.map(async (id) => {
          try {
            const data = await fetcher<DepartmentFigures>(
              `/api/admin/evaluation-results/figures?evaluationPeriodId=${encodeURIComponent(selectedPeriod)}&departmentId=${encodeURIComponent(id)}${force ? "&refresh=1" : ""}`,
            )
            if (!cancelled) setFigures((prev) => ({ ...prev, [id]: data }))
          } catch {
            if (!cancelled) setFiguresFailed((prev) => ({ ...prev, [id]: true }))
          }
        }))
      }
      if (!cancelled) setRefreshing(false)
    })
    return () => { cancelled = true }
  }, [selectedPeriod, departmentIds, refreshTick])

  // The figures are read again every five minutes. The server keeps them for
  // five minutes, so this is cheap until the window passes.
  useEffect(() => {
    if (!selectedPeriod || departmentIds.length === 0) return
    const timer = setInterval(() => {
      Promise.resolve().then(() => setRefreshTick((t) => t + 1))
    }, FIGURES_REFRESH_MS)
    return () => clearInterval(timer)
  }, [selectedPeriod, departmentIds])

  const refreshNow = useCallback(() => {
    forceNextRead.current = true
    setRefreshing(true)
    setRefreshTick((t) => t + 1)
  }, [])

  // The rows with the figures that have landed merged in.
  const rows = useMemo(
    () => departments.map((d) => ({ ...d, ...(figures[d.departmentId] ?? {}) })),
    [departments, figures],
  )
  const allLoaded = rows.length > 0 && rows.every((r) => !!figures[r.departmentId])

  // The least fresh of the figures on screen — what the banner says.
  const oldestReadAt = useMemo(() => {
    const stamps = Object.values(figures)
      .map((f) => f.cachedAt)
      .filter((s): s is string => !!s)
      .sort()
    return stamps[0] ?? null
  }, [figures])

  const sortedDepartments = useMemo(() => {
    // While the figures are still landing the rows keep the order the
    // departments came in: a table that re-sorts under the reader is worse
    // than one that sorts a moment later.
    if (!allLoaded) return rows
    const sorted = [...rows]
    sorted.sort((a, b) => {
      let aVal: number | string = a[sortKey] ?? ""
      let bVal: number | string = b[sortKey] ?? ""
      if (sortKey === "avgRating") {
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
  }, [rows, allLoaded, sortKey, sortDir])

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

  const exportZip = async () => {
    const period = selectedPeriod || (periods.length > 0 ? periods[0].id : "")
    if (!period) {
      dispatchToast("Select an evaluation period before exporting.")
      return
    }
    // The export walks every department's ratings: it is a download, and it
    // takes a while. The button says so.
    setExporting(true)
    try {
      await downloadFromApi(
        `/api/admin/evaluation-results/export?evaluationPeriodId=${encodeURIComponent(period)}`,
        `evaluation-results-${period}.zip`,
      )
    } finally {
      setExporting(false)
    }
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
          onClick={() => { void exportZip() }}
          loading={exporting}
          title="Download all departments as a ZIP of CSVs"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export
        </IosButton>
      </div>

      {/* How fresh the numbers are, and how to refresh them. */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-default bg-surface px-4 py-2">
          <span className="text-[11px] font-semibold text-secondary">
            {oldestReadAt
              ? `Figures as of ${new Date(oldestReadAt).toLocaleString()}`
              : "Reading the figures..."}
          </span>
          <span className="text-[11px] text-tertiary">refreshes every 5 minutes</span>
          <IosButton
            variant="plain"
            size="xs"
            onClick={refreshNow}
            loading={refreshing}
            title="Read the figures again now"
          >
            Refresh
          </IosButton>
          {!allLoaded && (
            <span className="text-[11px] text-tertiary">
              some rows are still loading — sorting by a column header is paused until they land
            </span>
          )}
        </div>
      )}

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
                <th className="pb-3 pr-4 cursor-pointer hover:text-secondary text-right" onClick={() => toggleSort("facultyCount")}>
                  Faculty{sortArrow("facultyCount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedDepartments.map((dept) => {
                const pending = !figures[dept.departmentId] && !figuresFailed[dept.departmentId]
                return (
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
                    {pending ? (
                      <div className="ml-auto w-20"><Skeleton variant="text" /></div>
                    ) : (
                      <>
                        <span className="text-sm font-bold">{formatScore(dept.avgRating)}</span>
                        {dept.remarks && (
                          <span className={`ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${getRemarkColor(dept.remarks)}`}>
                            {dept.remarks}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {pending ? (
                      <div className="ml-auto w-28"><Skeleton variant="text" /></div>
                    ) : (
                      dept.highestRubrics.length > 0 && (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                          {dept.highestRubrics[0].label} ({formatScore(dept.highestRubrics[0].score)})
                        </span>
                      )
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {pending ? (
                      <div className="ml-auto w-28"><Skeleton variant="text" /></div>
                    ) : (
                      dept.lowestRubrics.length > 0 && (
                        <span className="text-[11px] text-red-600 dark:text-red-400">
                          {dept.lowestRubrics[0].label} ({formatScore(dept.lowestRubrics[0].score)})
                        </span>
                      )
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right text-sm text-secondary">{dept.facultyCount}</td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
