"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import IosButton from "@/components/ui/IosButton"
import Tabs from "@/components/ui/Tabs"
import { useApiGet } from "@/lib/api/client"
import { usePagination, Paginator } from "@/components/ui/Paginator"
import { formatPeriodLabel, sectionLabel, departmentLabel } from "@/lib/evaluation-utils"
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

/** The two groupings, with the results page's names for them. */
const COVERAGE_TABS: { key: "by_subject" | "by_faculty"; label: string }[] = [
  { key: "by_subject", label: "By Subject & Section" },
  { key: "by_faculty", label: "By Faculty" },
]

function formatPct(v: number | null) {
  return v === null ? "-" : `${v.toFixed(1)}%`
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
  const [deptFromUrl, setDeptFromUrl] = useState<string | null>(() => searchParams.get("dept"))
  const [viewTab, setViewTab] = useState<"by_subject" | "by_faculty">("by_subject")
  const [expandedFaculty, setExpandedFaculty] = useState<string | null>(null)
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

  const { data: statusData, error: statusError } = useApiGet<{
    departments: DepartmentRow[]
    subjects: SubjectRow[]
    facultyAggregates?: Record<string, Record<string, FacultyCoverageAggregate>>
    warnings?: AttributionWarnings
  }>(
    selectedPeriod ? `${statusBase}?evaluationPeriodId=${encodeURIComponent(selectedPeriod)}` : null,
    // Freshness: the global SWRConfig sets revalidateOnFocus:false, which leaves
    // this page frozen after mount. Coverage is a live-progress report (students
    // submit/dispute while it is open), so opt this hook back into focus
    // revalidation and a 30s poll. Scoped to this call - other pages untouched.
    { revalidateOnFocus: true, refreshInterval: 30_000 },
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

  const deptSubjects = useMemo(() => {
    if (!selectedDept) return []
    const key = selectedDept === UNRESOLVED ? "" : selectedDept
    return (statusData?.subjects ?? []).filter(
      (s) => s.departmentId === key &&
        (!q || `${s.subjectCode} ${s.subjectName} ${s.facultyName}`.toLowerCase().includes(q)),
    )
  }, [statusData, selectedDept, q])

  const subjectPager = usePagination(deptSubjects, 25)

  const facultyAggregates = useMemo(() => statusData?.facultyAggregates ?? {}, [statusData?.facultyAggregates])

  /** The department's subjects, grouped by their teacher. */
  const facultyGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; email: string; subjects: SubjectRow[] }>()
    for (const s of deptSubjects) {
      const g = groups.get(s.facultyId) ?? { id: s.facultyId, name: s.facultyName, email: s.facultyEmail, subjects: [] }
      g.subjects.push(s)
      groups.set(s.facultyId, g)
    }
    const all = [...groups.values()]
    // The pseudo-department is not a department: it has no membership
    // question, so it keeps every teacher of its subjects.
    if (!selectedDept || selectedDept === UNRESOLVED) return all
    // The department's OWN faculty. The aggregate map is the member list:
    // the service only aggregates the teachers homed here.
    return all.filter((g) => facultyAggregates[selectedDept]?.[g.id] !== undefined)
  }, [deptSubjects, selectedDept, facultyAggregates])

  const selectDept = (id: string) => { setDeptFromUrl(id); subjectPager.setPage(0); router.replace(`${pathname}?dept=${encodeURIComponent(id)}`) }
  const clearDept = () => { setDeptFromUrl(null); subjectPager.setPage(0); router.replace(pathname) }

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
          onChange={(e) => { setSearch(e.target.value); subjectPager.setPage(0) }}
          placeholder="Search department or subject..."
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

              <Tabs tabs={COVERAGE_TABS} active={viewTab} onChange={setViewTab} />

              {deptSubjects.length === 0 ? (
                <p className="text-sm text-tertiary text-center py-8">No evaluated subjects found.</p>
              ) : viewTab === "by_subject" ? (
                <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-semibold uppercase tracking-wider text-tertiary border-b border-default">
                        <th className="pb-3 pr-4">Subject</th>
                        <th className="pb-3 pr-4">Section</th>
                        <th className="pb-3 pr-4">Faculty</th>
                        <th className="pb-3 pr-4 text-right">Enrolled</th>
                        <th className="pb-3 pr-4 text-right">Participated</th>
                        <th className="pb-3 pr-4 text-right">Disputed</th>
                        <th className="pb-3 pr-4 text-right">In-prog.</th>
                        <th className="pb-3 pr-4 text-right">Not part.</th>
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
                            <td className="py-3 pr-4 text-sm text-secondary">
                              {sectionLabel(s.sectionProgram, s.sectionName)}
                              {s.sectionDepartment && (
                                <span className="ml-2 text-[10px] text-tertiary">{s.sectionDepartment} section</span>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-sm text-secondary">{s.facultyName}</td>
                            <td className="py-3 pr-4 text-right text-sm text-secondary">{s.enrolled}</td>
                            <td className="py-3 pr-4 text-right text-sm text-emerald-600 dark:text-emerald-400">{s.participated}</td>
                            <td className="py-3 pr-4 text-right text-sm text-rose-600 dark:text-rose-400">{s.disputed}</td>
                            <td className="py-3 pr-4 text-right text-sm text-blue-600 dark:text-blue-400">{s.inProgress}</td>
                            <td className="py-3 pr-4 text-right text-sm text-amber-600 dark:text-amber-400">{s.notParticipated}</td>
                            <td className="py-3 pr-4 text-right text-sm font-bold">{formatPct(s.enrolled > 0 ? (s.participated / s.enrolled) * 100 : null)}</td>
                            <td className="py-3 pr-4 text-right">{coveragePill(s.enrolled > 0 ? (s.participated / s.enrolled) * 100 : null)}</td>
                            <td className="py-3 text-right">
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
                        )
                      })}
                    </tbody>
                  </table>
                </div>
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
                </>
              ) : (
                <div className="space-y-3">
                  {facultyGroups.map((group) => {
                    const agg = facultyAggregates[selectedDept]?.[group.id]
                    const isExpanded = expandedFaculty === group.id
                    // The card's counts come from the aggregate, like the
                    // department tiles (unfiltered); the list below it is the
                    // searched subset.
                    const subjectCount = agg?.subjects ?? group.subjects.length
                    return (
                      <div key={group.id} className="card p-4 space-y-2">
                        <div
                          onClick={() => setExpandedFaculty(isExpanded ? null : group.id)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedFaculty(isExpanded ? null : group.id) } }}
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
                              <div>{subjectCount} subject{subjectCount !== 1 ? "s" : ""}</div>
                              <div>{agg?.students ?? 0} student{(agg?.students ?? 0) !== 1 ? "s" : ""}</div>
                            </div>
                            {agg && <span className="text-lg font-bold">{formatPct(agg.completion)}</span>}
                            {agg && coveragePill(agg.completion)}
                            <span className="text-tertiary text-xs">{isExpanded ? "\u25B2" : "\u25BC"}</span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-default pt-3">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="text-[10px] font-semibold uppercase tracking-wider text-tertiary border-b border-default">
                                  <th className="pb-2 pr-3">Subject</th>
                                  <th className="pb-2 pr-3">Section</th>
                                  <th className="pb-2 pr-3 text-right">Enrolled</th>
                                  <th className="pb-2 pr-3 text-right">Participated</th>
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
                  })}
                </div>
              )}
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


