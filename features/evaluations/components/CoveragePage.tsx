"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import IosButton from "@/components/ui/IosButton"
import CachedDataRefreshBanner from "@/components/ui/CachedDataRefreshBanner"
import { useApiGet, fetcher, dispatchToast } from "@/lib/api/client"
import { formatPeriodLabel, sectionLabel, departmentLabel, formatFacultyName, UNASSIGNED_FACULTY_EMAIL } from "@/lib/evaluation-utils"
import CoverageDetailModal from "./CoverageDetailModal"
import { downloadBlob } from "@/lib/zip"

interface DepartmentRow {
  departmentId: string
  departmentName: string
  departmentCode: string
  subjectsEvaluated: number
  subjectsTotal: number
  submitted: number
  expected: number
  pct: number | null
  facultyCount: number
  uniqueStudents: number
  participated: number
  disputed: number
  inProgress: number
  notParticipated: number
  completion: number | null
}

interface SubjectRow {
  facultySubjectId: string
  departmentId: string
  subjectCode: string
  subjectName: string
  sectionProgram: string | null
  sectionName: string | null
  /** The department that owns the subject's section, when it is not this row's department. */
  sectionDepartment: string | null
  facultyId: string
  facultyName: string
  facultyEmail: string
  submitted: number
  expected: number
  pct: number | null
  evaluated: boolean
  enrolled: number
  participated: number
  disputed: number
  inProgress: number
  notParticipated: number
}

interface FacultyCoverageAggregate {
  subjects: number
  students: number
  participated: number
  disputed: number
  inProgress: number
  notParticipated: number
  completion: number | null
}

interface Period {
  id: string
  title?: string
  name?: string
  semesterTitle?: string
  isActive?: boolean
}

export interface Student { id: string; name: string; email: string }

export interface SubjectDetail {
  participated: Student[]
  notParticipated: Student[]
  disputed: Student[]
  inProgress: Student[]
}

interface AttributionWarnings {
  unattributed: { count: number; faculty: { id: string; name: string }[] }
  offSemester: { count: number; faculty: { id: string; name: string }[] }
}

// A subject whose department cannot be resolved. Named apart from a real
// "Unassigned" department, which is a legitimate department with its own id.
const UNRESOLVED = "__unknown__"

function formatPct(v: number | null) {
  return v === null ? "-" : `${v.toFixed(1)}%`
}

const COVERAGE_CACHE_PREFIX = "evaluation-coverage-status"

function getCoverageCacheKey(periodId: string, scopeKey: string) {
  return `${COVERAGE_CACHE_PREFIX}:${scopeKey}:${periodId}`
}

function getLastManualRefreshKey(periodId: string, scopeKey: string) {
  return `${COVERAGE_CACHE_PREFIX}:last-manual-refresh:${scopeKey}:${periodId}`
}

function readCoverageCache(periodId: string, scopeKey: string) {
  if (typeof window === "undefined" || !periodId || !scopeKey) return null
  try {
    const stored = window.localStorage.getItem(getCoverageCacheKey(periodId, scopeKey))
    if (!stored) return null
    const parsed = JSON.parse(stored)
    if (!parsed || typeof parsed !== "object") return null
    return parsed as {
      departments: DepartmentRow[]
      subjects: SubjectRow[]
      facultyAggregates?: Record<string, Record<string, FacultyCoverageAggregate>>
      warnings?: AttributionWarnings
    }
  } catch {
    return null
  }
}

function writeCoverageCache(periodId: string, scopeKey: string, data: unknown) {
  if (typeof window === "undefined" || !periodId || !scopeKey) return
  try {
    window.localStorage.setItem(getCoverageCacheKey(periodId, scopeKey), JSON.stringify(data))
  } catch {
    dispatchToast("Coverage cache could not be saved in this browser.")
  }
}

function clearCoverageCache(periodId: string, scopeKey: string) {
  if (typeof window === "undefined" || !periodId || !scopeKey) return
  try {
    window.localStorage.removeItem(getCoverageCacheKey(periodId, scopeKey))
  } catch {
    // ignore storage errors and keep the current view usable
  }
}

function readLastManualRefresh(periodId: string, scopeKey: string): string | null {
  if (typeof window === "undefined" || !periodId || !scopeKey) return null
  try {
    return window.localStorage.getItem(getLastManualRefreshKey(periodId, scopeKey))
  } catch {
    return null
  }
}

function writeLastManualRefresh(periodId: string, scopeKey: string, refreshedAt: string) {
  if (typeof window === "undefined" || !periodId || !scopeKey) return
  try {
    window.localStorage.setItem(getLastManualRefreshKey(periodId, scopeKey), refreshedAt)
  } catch {
    // ignore storage errors and keep the current view usable
  }
}

export default function CoveragePage({
  statusBase,
  departmentId = null,
}: {
  statusBase: string
  /** When set, the page opens on this department and offers no department list. */
  departmentId?: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [selectedPeriod, setSelectedPeriod] = useState("")
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<"departmentName" | "completion" | "subjectsTotal" | "submitted">("completion")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [facultySortDir, setFacultySortDir] = useState<"asc" | "desc">("asc")
  const [deptFromUrl, setDeptFromUrl] = useState<string | null>(() => searchParams.get("dept"))
  const [expandedFaculty, setExpandedFaculty] = useState<Set<string>>(() => new Set())
  const [modalSubject, setModalSubject] = useState<SubjectRow | null>(null)
  const [modalDetail, setModalDetail] = useState<SubjectDetail | "loading" | "error" | null>(null)
  const [statusSnapshot, setStatusSnapshot] = useState<{ periodId: string; scope: string; data: {
    departments: DepartmentRow[]
    subjects: SubjectRow[]
    facultyAggregates?: Record<string, Record<string, FacultyCoverageAggregate>>
    warnings?: AttributionWarnings
  } } | null>(null)
  const [statusError, setStatusError] = useState<Error | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState<string | null>(null)

  const scopeKey = departmentId ? `department:${departmentId}` : statusBase
  const statusScopeLabel = departmentId ? "department scope" : "admin scope"
  const { data: periodsData } = useApiGet<{ periods: Period[] }>("/api/evaluation-periods")
  const periods = useMemo(() => periodsData?.periods ?? [], [periodsData])

  useEffect(() => {
    if (periods.length > 0 && !selectedPeriod) {
      const active = periods.find((p) => p.isActive)
      if (active) Promise.resolve().then(() => setSelectedPeriod(active.id))
    }
  }, [periods, selectedPeriod])

  useEffect(() => {
    if (!selectedPeriod) return
    let cancelled = false
    const cached = readCoverageCache(selectedPeriod, scopeKey)
    const cachedRefresh = readLastManualRefresh(selectedPeriod, scopeKey)
    if (cached) {
      Promise.resolve().then(() => {
        if (cancelled) return
        setLastManualRefreshAt(cachedRefresh)
        setStatusSnapshot({ periodId: selectedPeriod, scope: scopeKey, data: cached })
        setStatusError(null)
      })
      return () => {
        cancelled = true
      }
    }

    Promise.resolve().then(() => {
      if (!cancelled) setLastManualRefreshAt(cachedRefresh)
    })

    void fetcher<{
      departments: DepartmentRow[]
      subjects: SubjectRow[]
      facultyAggregates?: Record<string, Record<string, FacultyCoverageAggregate>>
      warnings?: AttributionWarnings
    }>(`${statusBase}?evaluationPeriodId=${encodeURIComponent(selectedPeriod)}`)
      .then((data) => {
        if (cancelled) return
        writeCoverageCache(selectedPeriod, scopeKey, data)
        setStatusSnapshot({ periodId: selectedPeriod, scope: scopeKey, data })
        setStatusError(null)
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return
        setStatusError(fetchError instanceof Error ? fetchError : new Error("Could not load evaluation coverage"))
      })

    return () => {
      cancelled = true
    }
  }, [scopeKey, selectedPeriod, statusBase])

  const statusData = statusSnapshot && statusSnapshot.periodId === selectedPeriod && statusSnapshot.scope === scopeKey
    ? statusSnapshot.data
    : null
  const error = statusError?.message || ""
  const loading = !!selectedPeriod && !statusData && !statusError

  const refreshCoverage = useCallback(async () => {
    if (!selectedPeriod) return
    const snapshot = statusData
    const refreshedAt = new Date().toISOString()
    setIsRefreshing(true)
    setStatusError(null)
    clearCoverageCache(selectedPeriod, scopeKey)
    try {
      const data = await fetcher<{
        departments: DepartmentRow[]
        subjects: SubjectRow[]
        facultyAggregates?: Record<string, Record<string, FacultyCoverageAggregate>>
        warnings?: AttributionWarnings
      }>(`${statusBase}?evaluationPeriodId=${encodeURIComponent(selectedPeriod)}`)
      writeCoverageCache(selectedPeriod, scopeKey, data)
      writeLastManualRefresh(selectedPeriod, scopeKey, refreshedAt)
      setStatusSnapshot({ periodId: selectedPeriod, scope: scopeKey, data })
      setLastManualRefreshAt(refreshedAt)
    } catch (fetchError: unknown) {
      if (snapshot) {
        writeCoverageCache(selectedPeriod, scopeKey, snapshot)
        setStatusSnapshot({ periodId: selectedPeriod, scope: scopeKey, data: snapshot })
      } else {
        setStatusError(fetchError instanceof Error ? fetchError : new Error("Could not refresh evaluation coverage"))
      }
      dispatchToast("Refresh failed. Showing the last successful snapshot.")
    } finally {
      setIsRefreshing(false)
    }
  }, [scopeKey, selectedPeriod, statusBase, statusData])

  const q = search.trim().toLowerCase()
  const filteredDepts = useMemo(() => {
    const depts = statusData?.departments ?? []
    const subjects = statusData?.subjects ?? []
    const withUnassigned = [...depts]
    const unassigned = subjects.filter((s) => !s.departmentId)
    if (unassigned.length > 0) {
      withUnassigned.push({
        departmentId: UNRESOLVED,
        departmentName: "Unresolved",
        departmentCode: "",
        subjectsEvaluated: unassigned.filter((x) => x.evaluated).length,
        subjectsTotal: unassigned.length,
        submitted: unassigned.reduce((a, x) => a + x.submitted, 0),
        expected: unassigned.reduce((a, x) => a + x.expected, 0),
        pct: null,
        facultyCount: new Set(unassigned.map((x) => x.facultyName)).size,
        uniqueStudents: unassigned.reduce((a, x) => a + x.enrolled, 0),
        participated: unassigned.reduce((a, x) => a + x.participated, 0),
        disputed: unassigned.reduce((a, x) => a + x.disputed, 0),
        inProgress: unassigned.reduce((a, x) => a + x.inProgress, 0),
        notParticipated: unassigned.reduce((a, x) => a + x.notParticipated, 0),
        completion: null,
      })
    }
    if (!q) return withUnassigned
    return withUnassigned.filter((d) => {
      if (`${d.departmentName} ${d.departmentCode}`.toLowerCase().includes(q)) return true
      const key = d.departmentId === UNRESOLVED ? "" : d.departmentId
      return subjects.some(
        (s) => s.departmentId === key &&
          `${s.subjectCode} ${s.subjectName} ${s.facultyName}`.toLowerCase().includes(q),
      )
    })
  }, [statusData, q])

  const sortedDepts = useMemo(() => {
    const sorted = [...filteredDepts]
    sorted.sort((a, b) => {
      if (sortKey === "departmentName") {
        return sortDir === "desc"
          ? b.departmentName.localeCompare(a.departmentName)
          : a.departmentName.localeCompare(b.departmentName)
      }
      const aVal = (sortKey === "completion" ? (a.completion ?? -1) : a[sortKey]) as number
      const bVal = (sortKey === "completion" ? (b.completion ?? -1) : b[sortKey]) as number
      return sortDir === "desc" ? bVal - aVal : aVal - bVal
    })
    return sorted
  }, [filteredDepts, sortKey, sortDir])

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    else { setSortKey(key); setSortDir(key === "departmentName" ? "asc" : "desc") }
  }
  const sortArrow = (key: typeof sortKey) => sortKey !== key ? "" : sortDir === "desc" ? " v" : " ^"

  const kpis = useMemo(() => {
    const depts = filteredDepts.filter((d) => d.departmentId !== UNRESOLVED)
    const reporting = depts.filter((d) => d.subjectsEvaluated > 0).length
    // Each faculty is homed in exactly one department, so the departments'
    // headcounts add up to the school's faculty count — no double counting.
    const facultyCount = depts.reduce((a, d) => a + d.facultyCount, 0)
    const uniqueStudents = depts.reduce((a, d) => a + d.uniqueStudents, 0)
    const participated = depts.reduce((a, d) => a + d.participated, 0)
    const disputed = depts.reduce((a, d) => a + d.disputed, 0)
    const inProgress = depts.reduce((a, d) => a + d.inProgress, 0)
    const notParticipated = depts.reduce((a, d) => a + d.notParticipated, 0)
    return { reporting, deptTotal: depts.length, facultyCount, uniqueStudents, participated, disputed, inProgress, notParticipated }
  }, [filteredDepts])
  const completion = kpis.uniqueStudents > 0 ? (kpis.participated / kpis.uniqueStudents) * 100 : null

  // A caller that names a department gets that department's coverage, not a list.
  const selectedDept = departmentId ?? deptFromUrl

  const activeDept = sortedDepts.find((d) => d.departmentId === selectedDept) ?? null

  const allDeptSubjects = useMemo(() => {
    if (!selectedDept) return []
    const key = selectedDept === UNRESOLVED ? "" : selectedDept
    return (statusData?.subjects ?? []).filter((s) => s.departmentId === key)
  }, [statusData, selectedDept])

  const deptSubjects = useMemo(() => {
    if (!q) return allDeptSubjects
    return allDeptSubjects.filter((s) =>
      [
        s.facultyName,
        formatFacultyName(s.facultyName),
        s.facultyEmail,
        s.subjectCode,
        s.subjectName,
        sectionLabel(s.sectionProgram, s.sectionName),
      ].some((value) => value.toLowerCase().includes(q)),
    )
  }, [allDeptSubjects, q])

  const facultyAggregates = useMemo(() => statusData?.facultyAggregates ?? {}, [statusData?.facultyAggregates])

  const facultyGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; email: string; subjects: SubjectRow[] }>()
    for (const s of deptSubjects) {
      const g = groups.get(s.facultyId) ?? { id: s.facultyId, name: s.facultyName, email: s.facultyEmail, subjects: [] }
      g.subjects.push(s)
      groups.set(s.facultyId, g)
    }
    return [...groups.values()].filter((g) => g.email !== UNASSIGNED_FACULTY_EMAIL)
  }, [deptSubjects])

  const sortedFacultyGroups = useMemo(() => {
    return [...facultyGroups].sort((a, b) => {
      const comparison = formatFacultyName(a.name).localeCompare(
        formatFacultyName(b.name),
        undefined,
        { sensitivity: "base" },
      )
      return facultySortDir === "asc" ? comparison : -comparison
    })
  }, [facultyGroups, facultySortDir])

  const missingFacultyAggregateNames = useMemo(() => {
    if (!selectedDept || selectedDept === UNRESOLVED) return []
    const allFaculty = new Map<string, string>()
    for (const subject of allDeptSubjects) {
      if (subject.facultyEmail !== UNASSIGNED_FACULTY_EMAIL) {
        allFaculty.set(subject.facultyId, subject.facultyName)
      }
    }
    return [...allFaculty]
      .filter(([facultyId]) => facultyAggregates[selectedDept]?.[facultyId] === undefined)
      .map(([, name]) => name)
  }, [allDeptSubjects, facultyAggregates, selectedDept])

  const allVisibleFacultyExpanded =
    sortedFacultyGroups.length > 0 && sortedFacultyGroups.every((group) => expandedFaculty.has(group.id))

  const toggleFaculty = (facultyId: string) => {
    setExpandedFaculty((current) => {
      const next = new Set(current)
      if (next.has(facultyId)) next.delete(facultyId)
      else next.add(facultyId)
      return next
    })
  }

  const toggleAllVisibleFaculty = () => {
    const shouldExpand = !allVisibleFacultyExpanded
    setExpandedFaculty((current) => {
      const next = new Set(current)
      for (const group of sortedFacultyGroups) {
        if (shouldExpand) next.add(group.id)
        else next.delete(group.id)
      }
      return next
    })
  }

  const selectDept = (id: string) => { setDeptFromUrl(id); router.replace(`${pathname}?dept=${encodeURIComponent(id)}`) }
  const clearDept = () => { setDeptFromUrl(null); router.replace(pathname) }

  const exportCsv = () => {
    const subjects = statusData?.subjects ?? []
    if (subjects.length === 0) return
    const headers = ["Department", "Subject Code", "Subject", "Faculty", "Enrolled", "Participated", "Disputed", "In-progress", "Not Participated", "Completion %"]
    const rows = subjects.map((s) => {
      const dept = filteredDepts.find((d) => d.departmentId === (s.departmentId || UNRESOLVED))
      const completionPct = s.enrolled > 0 ? (s.participated / s.enrolled) * 100 : null
      return [
        dept?.departmentName ?? (s.departmentId || "Unassigned"),
        s.subjectCode,
        s.subjectName,
        s.facultyName,
        String(s.enrolled),
        String(s.participated),
        String(s.disputed),
        String(s.inProgress),
        String(s.notParticipated),
        completionPct === null ? "" : completionPct.toFixed(1),
      ]
    })
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))].join("\n")
    const periodLabel = periods.find((p) => p.id === selectedPeriod)?.name || selectedPeriod || "period"
    downloadBlob(csv, `coverage-${periodLabel}.csv`, "text/csv;charset=utf-8")
  }

  const openDetail = (s: SubjectRow) => {
    setModalSubject(s)
    setModalDetail("loading")
    fetch(`${statusBase}?evaluationPeriodId=${encodeURIComponent(selectedPeriod)}&facultySubjectId=${encodeURIComponent(s.facultySubjectId)}`)
      .then((r) => r.json())
      .then((json) => setModalDetail(json))
      .catch(() => setModalDetail("error"))
  }
  const closeDetail = () => { setModalSubject(null); setModalDetail(null) }

  return (
    <div className="w-full space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-primary">Evaluation Coverage</h1>
        <p className="text-xs text-tertiary mt-1">
          Completion tracking per subject - who participated, who did not, disputes, and in-progress drafts.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-secondary">Period</label>
        <select
          value={selectedPeriod}
          onChange={(e) => { setSelectedPeriod(e.target.value); clearDept() }}
          className="input text-xs px-3 py-2 rounded-lg border border-strong bg-surface"
        >
          <option value="">Select a period...</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{formatPeriodLabel(p)}</option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={selectedDept ? "Search faculty, subject, or section..." : "Search department or subject..."}
          className="rounded-xl border border-default bg-surface px-3 py-2 text-sm text-secondary shadow-sm transition-colors focus:border-slate-400 focus:outline-none"
        />
        <IosButton variant="gray" size="sm" onClick={() => { setSearch("") }}>Clear</IosButton>
        <IosButton
          variant="tinted"
          size="sm"
          onClick={exportCsv}
          disabled={!statusData || (statusData.subjects?.length ?? 0) === 0}
          title="Download coverage as CSV"
        >
          Export CSV
        </IosButton>
      </div>

      {statusData && (
        <CachedDataRefreshBanner
          lastManualRefreshAt={lastManualRefreshAt}
          isRefreshing={isRefreshing}
          onRefresh={refreshCoverage}
          contextLabel={statusScopeLabel}
        />
      )}

      {error && <ErrorState message={error} onRetry={() => window.location.reload()} />}

      {statusData?.warnings &&
        (statusData.warnings.unattributed.count > 0 || statusData.warnings.offSemester.count > 0) && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 space-y-1">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              Some evaluations could not be attributed to a department
            </p>
            {statusData.warnings.unattributed.count > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {statusData.warnings.unattributed.count} evaluation(s) point at a subject whose department could not be resolved
                {statusData.warnings.unattributed.faculty.length > 0 && (
                  <> — {statusData.warnings.unattributed.faculty.map((f) => f.name).join(", ")}</>
                )}
              </p>
            )}
            {statusData.warnings.offSemester.count > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {statusData.warnings.offSemester.count} evaluation(s) point at a subject from another semester
                {statusData.warnings.offSemester.faculty.length > 0 && (
                  <> — {statusData.warnings.offSemester.faculty.map((f) => f.name).join(", ")}</>
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

      {!loading && !error && selectedPeriod && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="rounded-xl border border-default bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">Depts reporting</p>
              <p className="text-xl font-bold text-primary mt-1">{kpis.reporting} / {kpis.deptTotal}</p>
            </div>
            <div className="rounded-xl border border-default bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">Faculties</p>
              <p className="text-xl font-bold text-primary mt-1">{kpis.facultyCount}</p>
            </div>
            <div className="rounded-xl border border-default bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">Unique students</p>
              <p className="text-xl font-bold text-primary mt-1">{kpis.uniqueStudents.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-default bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">Participated</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{kpis.participated.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-default bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">Disputed</p>
              <p className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">{kpis.disputed.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-default bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">In-progress</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">{kpis.inProgress.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-default bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">Not participated</p>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{kpis.notParticipated.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-default bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">Completion</p>
              <p className="text-xl font-bold text-primary mt-1">{completion === null ? "-" : `${completion.toFixed(1)}%`}</p>
            </div>
          </div>

          {!selectedDept && sortedDepts.length === 0 && (
            <p className="text-sm text-tertiary text-center py-8">No evaluation data found for this period.</p>
          )}

          {!selectedDept && sortedDepts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-tertiary border-b border-default">
                    <th className="pb-3 pr-4 cursor-pointer hover:text-secondary" onClick={() => toggleSort("departmentName")}>Department{sortArrow("departmentName")}</th>
                    <th className="pb-3 pr-4 text-right">Faculties</th>
                    <th className="pb-3 pr-4 text-right">Subjects</th>
                    <th className="pb-3 pr-4 text-right">Students</th>
                    <th className="pb-3 pr-4 text-right">Participated</th>
                    <th className="pb-3 pr-4 text-right">Disputed</th>
                    <th className="pb-3 pr-4 text-right">In-prog.</th>
                    <th className="pb-3 pr-4 text-right">Not part.</th>
                    <th className="pb-3 pr-4 cursor-pointer hover:text-secondary text-right" onClick={() => toggleSort("completion")}>Completion{sortArrow("completion")}</th>
                    <th className="pb-3 pr-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDepts.map((d) => (
                    <tr key={d.departmentId} onClick={() => selectDept(d.departmentId)} className="border-b border-default hover:bg-surface-hover cursor-pointer transition-colors">
                      <td className="py-3 pr-4">
                        <span className="text-sm font-semibold text-primary">{departmentLabel(d.departmentName, d.departmentCode)}</span>
                      </td>
                      <td className="py-3 pr-4 text-right text-sm text-secondary">{d.facultyCount}</td>
                      <td className="py-3 pr-4 text-right text-sm text-secondary">{d.subjectsEvaluated} / {d.subjectsTotal}</td>
                      <td className="py-3 pr-4 text-right text-sm text-secondary">{d.uniqueStudents.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right text-sm text-emerald-600 dark:text-emerald-400">{d.participated.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right text-sm text-rose-600 dark:text-rose-400">{d.disputed.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right text-sm text-blue-600 dark:text-blue-400">{d.inProgress.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right text-sm text-amber-600 dark:text-amber-400">{d.notParticipated.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right text-sm font-bold">{formatPct(d.completion)}</td>
                      <td className="py-3 pr-4 text-right">{coveragePill(d.completion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedDept && (
            <div className="space-y-4">
              {!departmentId && (
                <IosButton variant="plain" size="xs" onClick={clearDept}>Back to departments</IosButton>
              )}
              <div>
                <h2 className="text-lg font-bold text-primary">
                  {activeDept ? departmentLabel(activeDept.departmentName, activeDept.departmentCode) : "Department"}
                </h2>
                <p className="text-xs text-tertiary mt-1">
                  {activeDept ? `${activeDept.subjectsEvaluated} of ${activeDept.subjectsTotal} subjects evaluated - ${activeDept.submitted}/${activeDept.expected} responses` : ""}
                </p>
              </div>

              {missingFacultyAggregateNames.length > 0 && (
                <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                  Coverage totals are unavailable for {missingFacultyAggregateNames.length} faculty member(s):{" "}
                  {missingFacultyAggregateNames.join(", ")}. Refresh the coverage snapshot to try again.
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[10px] text-tertiary">
                  {facultyGroups.length} facult{facultyGroups.length !== 1 ? "ies" : "y"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <IosButton
                    variant="gray"
                    size="sm"
                    onClick={() => setFacultySortDir((direction) => direction === "asc" ? "desc" : "asc")}
                    title={facultySortDir === "asc" ? "Sorted by surname A–Z — click for Z–A" : "Sorted by surname Z–A — click for A–Z"}
                  >
                    Name {facultySortDir === "asc" ? "↑" : "↓"}
                  </IosButton>
                  <IosButton variant="gray" size="sm" allowRapidClick onClick={toggleAllVisibleFaculty}>
                    {allVisibleFacultyExpanded ? "Collapse all" : "Expand all"}
                  </IosButton>
                </div>
              </div>

              <div className="space-y-3">
                {deptSubjects.length === 0 ? (
                  <p className="text-sm text-tertiary text-center py-8">
                    {q ? "No subjects match this search." : "No evaluated subjects found."}
                  </p>
                ) : facultyGroups.length === 0 ? (
                  <p className="text-sm text-tertiary text-center py-8">No faculty coverage found for this selection.</p>
                ) : (
                  sortedFacultyGroups.map((group) => {
                    const agg = facultyAggregates[selectedDept]?.[group.id]
                    const isExpanded = expandedFaculty.has(group.id)
                    return (
                      <div key={group.id} className="card p-4 space-y-2">
                        <div
                          onClick={() => toggleFaculty(group.id)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFaculty(group.id) } }}
                          role="button"
                          tabIndex={0}
                          className="w-full flex items-center justify-between text-left cursor-pointer"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-primary">{group.name}</span>
                            <span className="text-[10px] text-tertiary">{group.email}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right text-xs text-tertiary">
                              <div>{agg ? `${agg.subjects} ${agg.subjects === 1 ? "subject" : "subjects"}` : "Subjects unavailable"}</div>
                              <div>{agg ? `${agg.students} ${agg.students === 1 ? "student" : "students"}` : "Students unavailable"}</div>
                            </div>
                            {agg && coveragePill(agg.completion)}
                            <span className="text-tertiary text-xs">{isExpanded ? "▲" : "▼"}</span>
                          </div>
                        </div>

                        {agg ? (
                          <div className="grid grid-cols-2 gap-2 border-t border-default pt-3 sm:grid-cols-4">
                            <CoverageCount label="Participated" count={agg.participated} tone="text-emerald-600 dark:text-emerald-400" />
                            <CoverageCount label="Not participated" count={agg.notParticipated} tone="text-amber-600 dark:text-amber-400" />
                            <CoverageCount label="In-progress" count={agg.inProgress} tone="text-blue-600 dark:text-blue-400" />
                            <CoverageCount label="Disputed" count={agg.disputed} tone="text-rose-600 dark:text-rose-400" />
                          </div>
                        ) : (
                          <p className="border-t border-default pt-3 text-xs text-rose-700 dark:text-rose-300">
                            Coverage status counts unavailable.
                          </p>
                        )}

                        {isExpanded && (
                          <div className="border-t border-default pt-3">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="text-[10px] font-semibold uppercase tracking-wider text-tertiary border-b border-default">
                                  <th className="pb-2 pr-3">Subject</th>
                                  <th className="pb-2 pr-3">Section</th>
                                  <th className="pb-2 pr-3 text-right">Enrolled</th>
                                  <th className="pb-2 pr-3 text-right">Participated</th>
                                  <th className="pb-2 pr-3 text-right">Disputed</th>
                                  <th className="pb-2 pr-3 text-right">In-prog.</th>
                                  <th className="pb-2 pr-3 text-right">Not part.</th>
                                  <th className="pb-2 pr-3 text-right">Completion</th>
                                  <th className="pb-2 text-right">Details</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.subjects.map((s) => (
                                  <tr key={s.facultySubjectId} className="border-b border-default align-top">
                                    <td className="py-2 pr-3 text-xs text-secondary">{s.subjectCode} {s.subjectName}</td>
                                    <td className="py-2 pr-3 text-xs text-secondary">
                                      {sectionLabel(s.sectionProgram, s.sectionName)}
                                      {s.sectionDepartment && (
                                        <span className="ml-2 text-[10px] text-tertiary">{s.sectionDepartment} section</span>
                                      )}
                                    </td>
                                    <td className="py-2 pr-3 text-right text-xs text-secondary">{s.enrolled}</td>
                                    <td className="py-2 pr-3 text-right text-xs text-emerald-600 dark:text-emerald-400">{s.participated}</td>
                                    <td className="py-2 pr-3 text-right text-xs text-rose-600 dark:text-rose-400">{s.disputed}</td>
                                    <td className="py-2 pr-3 text-right text-xs text-blue-600 dark:text-blue-400">{s.inProgress}</td>
                                    <td className="py-2 pr-3 text-right text-xs text-amber-600 dark:text-amber-400">{s.notParticipated}</td>
                                    <td className="py-2 pr-3 text-right text-xs font-semibold">
                                      {formatPct(s.enrolled > 0 ? (s.participated / s.enrolled) * 100 : null)}
                                    </td>
                                    <td className="py-2 text-right">
                                      <IosButton
                                        variant="plain"
                                        size="xs"
                                        onClick={() => openDetail(s)}
                                        title={`View student breakdown for ${s.subjectCode ?? s.subjectName ?? "subject"}`}
                                      >
                                        Details
                                      </IosButton>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
              <CoverageDetailModal
                open={modalSubject !== null}
                title={modalSubject ? `${modalSubject.subjectCode} - ${modalSubject.subjectName} - ${modalSubject.facultyName}` : ""}
                detail={modalDetail}
                onClose={closeDetail}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CoverageCount({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <div className="rounded-lg bg-surface p-2 text-right" title="Distinct students with this status in at least one subject">
      <div className="text-[10px] text-tertiary">{label}</div>
      <div className={`text-sm font-semibold ${tone}`}>{count.toLocaleString()}</div>
    </div>
  )
}

function coveragePill(pct: number | null) {
  let label = "No data"
  let cls = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
  if (pct !== null) {
    if (pct >= 100) { label = "Complete"; cls = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
    else if (pct >= 70) { label = "On track"; cls = "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" }
    else if (pct > 0) { label = "Lagging"; cls = "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" }
    else { label = "Not started"; cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" }
  }
  return <span className={`ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{label}</span>
}
