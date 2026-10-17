"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useApiGet } from "@/lib/api/client"
import { usePagination, Paginator } from "@/components/ui/Paginator"
import { formatPeriodLabel } from "@/lib/evaluation-utils"
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
}

interface SubjectRow {
  facultySubjectId: string
  departmentId: string
  subjectCode: string
  subjectName: string
  facultyName: string
  submitted: number
  expected: number
  pct: number | null
  evaluated: boolean
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

const UNASSIGNED = "__unknown__"

function formatPct(v: number | null) {
  return v === null ? "-" : `${v.toFixed(1)}%`
}

export default function CoveragePage({ statusBase }: { statusBase: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedPeriod, setSelectedPeriod] = useState("")
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<"departmentName" | "pct" | "subjectsTotal" | "submitted">("pct")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [selectedDept, setSelectedDept] = useState<string | null>(() => searchParams.get("dept"))
  const [modalSubject, setModalSubject] = useState<SubjectRow | null>(null)
  const [modalDetail, setModalDetail] = useState<SubjectDetail | "loading" | "error" | null>(null)

  const { data: periodsData } = useApiGet<{ periods: Period[] }>("/api/evaluation-periods")
  const periods = useMemo(() => periodsData?.periods ?? [], [periodsData])

  useEffect(() => {
    if (periods.length > 0 && !selectedPeriod) {
      const active = periods.find((p) => p.isActive)
      if (active) Promise.resolve().then(() => setSelectedPeriod(active.id))
    }
  }, [periods, selectedPeriod])

  const { data: statusData, error: statusError } = useApiGet<{ departments: DepartmentRow[]; subjects: SubjectRow[] }>(
    selectedPeriod ? `${statusBase}?evaluationPeriodId=${encodeURIComponent(selectedPeriod)}` : null,
  )
  const error = statusError?.message || ""
  const loading = !statusData && !statusError && !!selectedPeriod

  const q = search.trim().toLowerCase()
  const filteredDepts = useMemo(() => {
    const depts = statusData?.departments ?? []
    const subjects = statusData?.subjects ?? []
    const withUnassigned = [...depts]
    const unassigned = subjects.filter((s) => !s.departmentId)
    if (unassigned.length > 0) {
      withUnassigned.push({
        departmentId: UNASSIGNED,
        departmentName: "Unassigned",
        departmentCode: "",
        subjectsEvaluated: unassigned.filter((x) => x.evaluated).length,
        subjectsTotal: unassigned.length,
        submitted: unassigned.reduce((a, x) => a + x.submitted, 0),
        expected: unassigned.reduce((a, x) => a + x.expected, 0),
        pct: null,
      })
    }
    if (!q) return withUnassigned
    return withUnassigned.filter((d) => {
      if (`${d.departmentName} ${d.departmentCode}`.toLowerCase().includes(q)) return true
      const key = d.departmentId === UNASSIGNED ? "" : d.departmentId
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
      const aVal = (sortKey === "pct" ? (a.pct ?? -1) : a[sortKey]) as number
      const bVal = (sortKey === "pct" ? (b.pct ?? -1) : b[sortKey]) as number
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
    const depts = filteredDepts.filter((d) => d.departmentId !== UNASSIGNED)
    const reporting = depts.filter((d) => d.subjectsEvaluated > 0).length
    const subjEval = depts.reduce((a, d) => a + d.subjectsEvaluated, 0)
    const subjTotal = depts.reduce((a, d) => a + d.subjectsTotal, 0)
    const submitted = depts.reduce((a, d) => a + d.submitted, 0)
    const expected = depts.reduce((a, d) => a + d.expected, 0)
    return { reporting, deptTotal: depts.length, subjEval, subjTotal, submitted, expected }
  }, [filteredDepts])
  const completion = kpis.expected > 0 ? (kpis.submitted / kpis.expected) * 100 : null

  const activeDept = sortedDepts.find((d) => d.departmentId === selectedDept) ?? null
  const deptSubjects = useMemo(() => {
    if (!selectedDept) return []
    const key = selectedDept === UNASSIGNED ? "" : selectedDept
    return (statusData?.subjects ?? []).filter(
      (s) => s.departmentId === key &&
        (!q || `${s.subjectCode} ${s.subjectName} ${s.facultyName}`.toLowerCase().includes(q)),
    )
  }, [statusData, selectedDept, q])

  const subjectPager = usePagination(deptSubjects, 25)

  const selectDept = (id: string) => { setSelectedDept(id); subjectPager.setPage(0); router.replace(`/admin/evaluations/coverage?dept=${encodeURIComponent(id)}`) }
  const clearDept = () => { setSelectedDept(null); subjectPager.setPage(0); router.replace("/admin/evaluations/coverage") }

  const exportCsv = () => {
    const subjects = statusData?.subjects ?? []
    if (subjects.length === 0) return
    const headers = ["Department", "Subject Code", "Subject", "Faculty", "Submitted", "Expected", "Completion %", "Evaluated"]
    const rows = subjects.map((s) => {
      const dept = filteredDepts.find((d) => d.departmentId === (s.departmentId || UNASSIGNED))
      return [
        dept?.departmentName ?? (s.departmentId || "Unassigned"),
        s.subjectCode,
        s.subjectName,
        s.facultyName,
        String(s.submitted),
        String(s.expected),
        s.pct === null ? "" : s.pct.toFixed(1),
        s.evaluated ? "Yes" : "No",
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
          onChange={(e) => { setSearch(e.target.value); subjectPager.setPage(0) }}
          placeholder="Search department or subject..."
          className="rounded-xl border border-default bg-surface px-3 py-2 text-sm text-secondary shadow-sm transition-colors focus:border-slate-400 focus:outline-none"
        />
        <button onClick={() => { setSearch("") }} className="rounded-xl border border-default bg-surface px-3 py-2 text-sm text-secondary">Clear</button>
        <button onClick={exportCsv} disabled={!statusData || (statusData.subjects?.length ?? 0) === 0} className="rounded-xl border border-default bg-surface px-3 py-2 text-sm text-secondary disabled:opacity-50">Export CSV</button>
      </div>

      {error && <ErrorState message={error} onRetry={() => window.location.reload()} />}

      {loading && (
        <div className="space-y-4">
          <Skeleton variant="table-row" />
          <Skeleton variant="table-row" />
          <Skeleton variant="table-row" />
        </div>
      )}

      {!loading && !error && selectedPeriod && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-default bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">Depts reporting</p>
              <p className="text-xl font-bold text-primary mt-1">{kpis.reporting} / {kpis.deptTotal}</p>
            </div>
            <div className="rounded-xl border border-default bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">Subjects evaluated</p>
              <p className="text-xl font-bold text-primary mt-1">{kpis.subjEval} / {kpis.subjTotal}</p>
            </div>
            <div className="rounded-xl border border-default bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">Responses</p>
              <p className="text-xl font-bold text-primary mt-1">{kpis.submitted.toLocaleString()} / {kpis.expected.toLocaleString()}</p>
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
                    <th className="pb-3 pr-4 text-right">Subjects</th>
                    <th className="pb-3 pr-4 cursor-pointer hover:text-secondary text-right" onClick={() => toggleSort("pct")}>Completion{sortArrow("pct")}</th>
                    <th className="pb-3 pr-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDepts.map((d) => (
                    <tr key={d.departmentId} onClick={() => selectDept(d.departmentId)} className="border-b border-default hover:bg-surface-hover cursor-pointer transition-colors">
                      <td className="py-3 pr-4">
                        <span className="text-sm font-semibold text-primary">{d.departmentName}</span>
                        {d.departmentCode && <span className="text-[10px] text-tertiary ml-2">({d.departmentCode})</span>}
                      </td>
                      <td className="py-3 pr-4 text-right text-sm text-secondary">{d.subjectsEvaluated} / {d.subjectsTotal}</td>
                      <td className="py-3 pr-4 text-right text-sm font-bold">{formatPct(d.pct)}</td>
                      <td className="py-3 pr-4 text-right">{coveragePill(d.pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedDept && (
            <div className="space-y-4">
              <button onClick={clearDept} className="text-xs font-semibold text-secondary hover:text-primary">Back to departments</button>
              <div>
                <h2 className="text-lg font-bold text-primary">{activeDept?.departmentName ?? "Department"}</h2>
                <p className="text-xs text-tertiary mt-1">
                  {activeDept ? `${activeDept.subjectsEvaluated} of ${activeDept.subjectsTotal} subjects evaluated - ${activeDept.submitted}/${activeDept.expected} responses` : ""}
                </p>
              </div>
              {deptSubjects.length === 0 ? (
                <p className="text-sm text-tertiary text-center py-8">No evaluated subjects found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-semibold uppercase tracking-wider text-tertiary border-b border-default">
                        <th className="pb-3 pr-4">Subject</th>
                        <th className="pb-3 pr-4">Faculty</th>
                        <th className="pb-3 pr-4 text-right">Responses</th>
                        <th className="pb-3 pr-4 text-right">Completion</th>
                        <th className="pb-3 pr-4 text-right">Status</th>
                        <th className="pb-3 text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjectPager.paginatedItems.map((s) => {
                        return (
                          <tr key={s.facultySubjectId} className="border-b border-default align-top">
                            <td className="py-3 pr-4">
                              <span className="text-sm font-semibold text-primary">{s.subjectCode}</span>
                              <span className="text-xs text-tertiary ml-2">{s.subjectName}</span>
                            </td>
                            <td className="py-3 pr-4 text-sm text-secondary">{s.facultyName}</td>
                            <td className="py-3 pr-4 text-right text-sm text-secondary">{s.submitted} / {s.expected}</td>
                            <td className="py-3 pr-4 text-right text-sm font-bold">{formatPct(s.pct)}</td>
                            <td className="py-3 pr-4 text-right">{coveragePill(s.pct)}</td>
                            <td className="py-3 text-right">
                              <button
                                onClick={() => openDetail(s)}
                                className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <CoverageDetailModal
                    open={modalSubject !== null}
                    title={modalSubject ? `${modalSubject.subjectCode} - ${modalSubject.subjectName} - ${modalSubject.facultyName}` : ""}
                    detail={modalDetail}
                    onClose={closeDetail}
                  />
                </div>
              )}
              {deptSubjects.length > 0 && (
                <Paginator
                  page={subjectPager.page}
                  totalPages={subjectPager.totalPages}
                  pageSize={subjectPager.pageSize}
                  totalItems={deptSubjects.length}
                  setPage={subjectPager.setPage}
                  setPageSize={subjectPager.setPageSize}
                />
              )}
            </div>
          )}
        </>
      )}
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


