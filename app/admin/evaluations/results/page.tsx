"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useApiGet, dispatchToast, downloadFromApi, fetcher } from "@/lib/api/client"
import IosButton from "@/components/ui/IosButton"
import DepartmentZipButton from "@/features/evaluation-results/components/DepartmentZipButton"
import { getRemarkColor, formatPeriodLabel, departmentLabel, findAttentionRubrics } from "@/lib/evaluation-utils"

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

interface IntegrityWarnings {
  unattributed: { count: number; faculty: { id: string; name: string }[] }
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
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([])

  const { data: periodsData } = useApiGet<{ periods: Period[] }>("/api/evaluation-periods")
  const periods = useMemo(() => periodsData?.periods ?? [], [periodsData])

  useEffect(() => {
    if (periods.length > 0 && !selectedPeriod) {
      const active = periods.find((p) => p.isActive)
      if (active) Promise.resolve().then(() => setSelectedPeriod(active.id))
    }
  }, [periods, selectedPeriod])

  const { data: resultsData, error: resultsError } = useApiGet<{ departments: DepartmentRow[]; warnings?: IntegrityWarnings }>(
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
  // The weakest rubric per department - and only where it is critically low.
  // The column disappears when no department needs attention.
  const attentionByDept = useMemo(() => {
    const map: Record<string, { key: string; label: string; score: number }[]> = {}
    for (const r of rows) {
      const attention = findAttentionRubrics(r.lowestRubrics ?? [])
      if (attention.length > 0) map[r.departmentId] = attention
    }
    return map
  }, [rows])
  const anyAttention = Object.keys(attentionByDept).length > 0
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
        <DepartmentZipButton
          evaluationPeriodId={selectedPeriod}
          departmentIds={selectedDepartmentIds}
          totalDepartments={departments.length}
          exportApiBase="/api/admin/evaluation-results/export/excel"
          label="Export"
        />
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
          {selectedDepartmentIds.length > 0 && (
            <IosButton
              variant="plain"
              size="xs"
              onClick={() => setSelectedDepartmentIds([])}
              title="Clear selection"
            >
              Clear
            </IosButton>
          )}
          {!allLoaded && (
            <span className="text-[11px] text-tertiary">
              some rows are still loading — sorting by a column header is paused until they land
            </span>
          )}
        </div>
      )}

      {error && <ErrorState message={error} onRetry={() => window.location.reload()} />}

      {warnings && warnings.unattributed.count > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 space-y-1">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            Some evaluations could not be attributed to a department
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {warnings.unattributed.count} evaluation(s) point at a subject whose department could not be resolved
            {warnings.unattributed.faculty.length > 0 && (
              <> — {warnings.unattributed.faculty.map((f) => f.name).join(", ")}</>
            )}
          </p>
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
        <p className="text-sm text-tertiary text-center py-8">No departments found.</p>
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
                <th className="pb-3 pr-4 text-right">Top Rubric</th>
                {anyAttention && <th className="pb-3 pr-4 text-right">Needs Attention</th>}
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
                      <input
                        type="checkbox"
                        checked={selectedDepartmentIds.includes(dept.departmentId)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDepartmentIds(
                              selectedDepartmentIds.includes(dept.departmentId)
                                ? selectedDepartmentIds.filter((id) => id !== dept.departmentId)
                                : [...selectedDepartmentIds, dept.departmentId]
                            )
                          } else {
                            setSelectedDepartmentIds(
                              selectedDepartmentIds.filter((id) => id !== dept.departmentId)
                            )
                          }
                          // Stop propagation to prevent row navigation
                          e.stopPropagation()
                        }}
                        aria-label={`Select department ${departmentLabel(dept.departmentName, dept.departmentCode)}`}
                        style={{ margin: 0 }}
                      />&nbsp;{departmentLabel(dept.departmentName, dept.departmentCode)}
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
                          {dept.highestRubrics.map((r) => `${r.label} ${formatScore(r.score)}`).join(", ")}
                        </span>
                      )
                    )}
                  </td>
                  {anyAttention && (
                    <td className="py-3 pr-4 text-right">
                      {pending ? (
                        <div className="ml-auto w-28"><Skeleton variant="text" /></div>
                      ) : (
                        attentionByDept[dept.departmentId] && (
                          <span className="text-[11px] text-red-600 dark:text-red-400">
                            {attentionByDept[dept.departmentId].map((r) => `${r.label} ${formatScore(r.score)}`).join(", ")}
                          </span>
                        )
                      )}
                    </td>
                  )}
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
