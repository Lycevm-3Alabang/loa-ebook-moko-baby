"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useApiGet, fetcher, dispatchToast } from "@/lib/api/client"
import IosButton from "@/components/ui/IosButton"
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

function readResultsCache(periodId: string): DepartmentResultsData | null {
  if (typeof window === "undefined" || !periodId) return null
  try {
    const stored = window.localStorage.getItem(getResultsCacheKey(periodId))
    if (!stored) return null
    const parsed: unknown = JSON.parse(stored)
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("departments" in parsed) ||
      !Array.isArray(parsed.departments)
    ) {
      return null
    }
    return parsed as DepartmentResultsData
  } catch {
    return null
  }
}

function writeResultsCache(periodId: string, data: DepartmentResultsData) {
  if (typeof window === "undefined" || !periodId) return
  try {
    window.localStorage.setItem(getResultsCacheKey(periodId), JSON.stringify(data))
  } catch {
    // Keep the current view usable if browser storage is unavailable.
  }
}

function clearResultsCache(periodId: string) {
  if (typeof window === "undefined" || !periodId) return
  try {
    window.localStorage.removeItem(getResultsCacheKey(periodId))
  } catch {
    // Keep the current view usable if browser storage is unavailable.
  }
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

const FIGURES_CACHE_KEY = "admin-evaluation-results-figures"
const RESULTS_CACHE_KEY = "admin-evaluation-results"

function getFiguresCacheKey(periodId: string) {
  return `${FIGURES_CACHE_KEY}:${periodId}`
}

function getResultsCacheKey(periodId: string) {
  return `${RESULTS_CACHE_KEY}:${periodId}`
}

function getLastManualRefreshKey(periodId: string) {
  return `${FIGURES_CACHE_KEY}:last-manual-refresh:${periodId}`
}

function readFiguresCache(periodId: string): Record<string, DepartmentFigures> {
  if (typeof window === "undefined" || !periodId) return {}
  try {
    const cached = window.localStorage.getItem(getFiguresCacheKey(periodId))
    if (!cached) return {}
    const parsed = JSON.parse(cached)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, DepartmentFigures>) : {}
  } catch {
    return {}
  }
}

function readLastManualRefresh(periodId: string): string | null {
  if (typeof window === "undefined" || !periodId) return null
  try {
    return window.localStorage.getItem(getLastManualRefreshKey(periodId))
  } catch {
    return null
  }
}

function writeLastManualRefresh(periodId: string, refreshedAt: string) {
  if (typeof window === "undefined" || !periodId) return
  try {
    window.localStorage.setItem(getLastManualRefreshKey(periodId), refreshedAt)
  } catch {
    // Keep the current view usable if browser storage is unavailable.
  }
}

function writeFiguresCache(periodId: string, figuresByDept: Record<string, DepartmentFigures>) {
  if (typeof window === "undefined" || !periodId) return
  try {
    window.localStorage.setItem(getFiguresCacheKey(periodId), JSON.stringify(figuresByDept))
  } catch {
    // Ignore storage failures: the in-memory view still works and the page can
    // continue without persisting the figures snapshot.
  }
}

function clearFiguresCache(periodId: string) {
  if (typeof window === "undefined" || !periodId) return
  try {
    window.localStorage.removeItem(getFiguresCacheKey(periodId))
  } catch {
    // Keep the current view usable if browser storage is unavailable.
  }
}

interface IntegrityWarnings {
  unattributed: { count: number; faculty: { id: string; name: string }[] }
}

interface DepartmentResultsData {
  departments: DepartmentRow[]
  warnings?: IntegrityWarnings
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

  const [resultsSnapshot, setResultsSnapshot] = useState<{
    periodId: string
    data: DepartmentResultsData
  } | null>(null)
  const [resultsError, setResultsError] = useState<Error | null>(null)
  const currentResults = resultsSnapshot?.periodId === selectedPeriod ? resultsSnapshot.data : null
  const departments = useMemo(() => currentResults?.departments ?? [], [currentResults])
  const warnings = currentResults?.warnings ?? null
  const error = resultsError?.message || ""
  const loading = !!selectedPeriod && !currentResults && !resultsError

  useEffect(() => {
    if (!selectedPeriod) return
    let cancelled = false
    const cached = readResultsCache(selectedPeriod)
    if (cached) {
      Promise.resolve().then(() => {
        if (cancelled) return
        setResultsSnapshot({ periodId: selectedPeriod, data: cached })
        setResultsError(null)
      })
    } else {
      void fetcher<DepartmentResultsData>(
        `/api/admin/evaluation-results?evaluationPeriodId=${encodeURIComponent(selectedPeriod)}`,
      ).then((data) => {
        if (cancelled) return
        writeResultsCache(selectedPeriod, data)
        setResultsSnapshot({ periodId: selectedPeriod, data })
        setResultsError(null)
      }).catch((fetchError: unknown) => {
        if (cancelled) return
        setResultsError(fetchError instanceof Error ? fetchError : new Error("Could not load evaluation results"))
      })
    }
    return () => {
      cancelled = true
    }
  }, [selectedPeriod])

  // Each department's figures, read on their own so a row fills as soon as
  // its numbers arrive. The list reads the departments first, so the table is
  // on screen while the ratings are still being read.
  const [figures, setFigures] = useState<Record<string, DepartmentFigures>>({})
  const [figuresFailed, setFiguresFailed] = useState<Record<string, boolean>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState<string | null>(null)
  const figuresRequestIdRef = useRef(0)

  // The set of departments, as a string: the effect below must not re-run
  // every time the list is revalidated, or it would re-read every figure.
  const departmentIds = useMemo(() => departments.map((d) => d.departmentId).join(","), [departments])

  useEffect(() => {
    if (!selectedPeriod) {
      Promise.resolve().then(() => {
        setFigures({})
        setFiguresFailed({})
        setLastManualRefreshAt(null)
      })
      return
    }
    Promise.resolve().then(() => {
      setFigures(readFiguresCache(selectedPeriod))
      setFiguresFailed({})
      setLastManualRefreshAt(readLastManualRefresh(selectedPeriod))
    })
  }, [selectedPeriod])

  const fetchFigures = useCallback(async (forceRefresh: boolean) => {
    if (!selectedPeriod || departmentIds.length === 0) return false
    const requestId = ++figuresRequestIdRef.current
    const ids = departmentIds.split(",").filter(Boolean)
    const cached = readFiguresCache(selectedPeriod)
    const targets = forceRefresh ? ids : ids.filter((id) => !cached[id])
    if (targets.length === 0) return !forceRefresh
    let succeeded = true
    const refreshedFigures: Record<string, DepartmentFigures> = {}

    for (let i = 0; i < targets.length; i += FIGURE_CONCURRENCY) {
      if (requestId !== figuresRequestIdRef.current) return false
      const batch = targets.slice(i, i + FIGURE_CONCURRENCY)
      await Promise.all(batch.map(async (id) => {
        if (requestId !== figuresRequestIdRef.current) {
          succeeded = false
          return
        }
        try {
          const data = await fetcher<DepartmentFigures>(
            `/api/admin/evaluation-results/figures?evaluationPeriodId=${encodeURIComponent(selectedPeriod)}&departmentId=${encodeURIComponent(id)}${forceRefresh ? "&refresh=1" : ""}`,
          )
          if (requestId !== figuresRequestIdRef.current) {
            succeeded = false
            return
          }
          if (forceRefresh) {
            refreshedFigures[id] = data
          } else {
            writeFiguresCache(selectedPeriod, { ...readFiguresCache(selectedPeriod), [id]: data })
            setFigures((prev) => ({ ...prev, [id]: data }))
            setFiguresFailed((prev) => ({ ...prev, [id]: false }))
          }
        } catch (error) {
          succeeded = false
          if (requestId !== figuresRequestIdRef.current) return
          setFiguresFailed((prev) => ({ ...prev, [id]: true }))
          if (forceRefresh) {
            const message = error instanceof Error ? error.message : "Request failed"
            dispatchToast(`Figures refresh failed: ${message}`)
          }
        }
      }))
    }
    if (!succeeded || requestId !== figuresRequestIdRef.current) return false
    if (forceRefresh) {
      writeFiguresCache(selectedPeriod, refreshedFigures)
      setFigures((prev) => ({ ...prev, ...refreshedFigures }))
      setFiguresFailed((prev) => {
        const next = { ...prev }
        for (const id of ids) next[id] = false
        return next
      })
    }
    return true
  }, [departmentIds, selectedPeriod])

  useEffect(() => {
    if (!selectedPeriod || departmentIds.length === 0 || refreshing) return

    const cached = readFiguresCache(selectedPeriod)
    const ids = departmentIds.split(",").filter(Boolean)
    const missingIds = ids.filter((id) => !cached[id])

    Promise.resolve().then(() => {
      setFigures(cached)
      setFiguresFailed({})
    })

    if (missingIds.length > 0) void fetchFigures(false)
  }, [departmentIds, fetchFigures, refreshing, selectedPeriod])

  const refreshNow = useCallback(async () => {
    if (!selectedPeriod || departmentIds.length === 0) return
    const previousCache = readFiguresCache(selectedPeriod)
    const previousResults = readResultsCache(selectedPeriod)
    clearFiguresCache(selectedPeriod)
    clearResultsCache(selectedPeriod)
    setRefreshing(true)
    try {
      const [succeeded] = await Promise.all([
        fetchFigures(true),
        fetcher<DepartmentResultsData>(
          `/api/admin/evaluation-results?evaluationPeriodId=${encodeURIComponent(selectedPeriod)}`,
        ).then((data) => {
          writeResultsCache(selectedPeriod, data)
          setResultsSnapshot({ periodId: selectedPeriod, data })
          setResultsError(null)
        }).catch((error: unknown) => {
          if (previousResults) writeResultsCache(selectedPeriod, previousResults)
          const message = error instanceof Error ? error.message : "Request failed"
          dispatchToast(`Evaluation results refresh failed: ${message}`)
        }),
      ])
      if (succeeded) {
        const refreshedAt = new Date().toISOString()
        writeLastManualRefresh(selectedPeriod, refreshedAt)
        setLastManualRefreshAt(refreshedAt)
      } else {
        writeFiguresCache(selectedPeriod, previousCache)
      }
    } catch (error) {
      writeFiguresCache(selectedPeriod, previousCache)
      if (previousResults) writeResultsCache(selectedPeriod, previousResults)
      const message = error instanceof Error ? error.message : "Request failed"
      dispatchToast(`Figures refresh failed: ${message}`)
    } finally {
      setRefreshing(false)
    }
  }, [departmentIds, fetchFigures, selectedPeriod])

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
      </div>

      {/* Cached figures are stale by design; the manual Refresh action is the only refresh path. */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3">
          <span className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
            Displayed figures are cached and may be stale. Click Refresh to fetch current figures.
          </span>
          <span className="text-[11px] text-amber-700 dark:text-amber-300">
            {lastManualRefreshAt
              ? `Last button refresh: ${new Date(lastManualRefreshAt).toLocaleString()}`
              : "Not manually refreshed yet"}
          </span>
          <IosButton
            variant="primary"
            size="sm"
            onClick={refreshNow}
            loading={refreshing}
            title="Fetch the latest figures for this period"
            className="ml-auto shrink-0 shadow-sm"
          >
            Refresh
          </IosButton>
          {!allLoaded && (
            <span className="text-[11px] text-amber-800 dark:text-amber-300">
              Some rows are still loading — sorting by a column header is paused until they land.
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
                    <div>{departmentLabel(dept.departmentName, dept.departmentCode)}</div>
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
