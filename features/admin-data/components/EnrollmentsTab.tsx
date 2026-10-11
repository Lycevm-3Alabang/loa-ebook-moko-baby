"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useApiGet } from "@/lib/api/client"
import { usePagination, Paginator } from "@/components/ui/Paginator"
import { SkeletonTable } from "@/components/ui/Skeleton"
import IosButton from "@/components/ui/IosButton"
import LockedTab from "@/components/ui/LockedTab"
import { SearchInput } from "./shared"
import type { FacultyMapping, Enrollment } from "./types"
import type { SemesterData } from "@/lib/types"

export function EnrollmentsTab() {
  const [data, setData] = useState<Enrollment[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [locked, setLocked] = useState("")
  const [search, setSearch] = useState("")

  // Table-first slice P2 — role-tree base for the import link. This one
  // component serves /admin/… and /dean/…; the pathname is the tree.
  const pathname = usePathname()
  const roleBase = pathname.startsWith("/dean") ? "/dean" : "/admin"
  // Table-first slice C — collapse the main table while working an import.
  // Default open: first paint is identical to today.
  const [showTable, setShowTable] = useState(true)

  // ── Quick Add state ──────────────────────────────────────
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [formFsId, setFormFsId] = useState("")
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [formSuccess, setFormSuccess] = useState("")

  const fetchData = useCallback(async (isRefresh?: boolean) => {
    if (isRefresh) { setLoading(true); setError("") }
    try {
      const res = await fetch("/api/data/evaluation-mappings?type=student")
      if (res.status === 403) { setLocked("/api/data/evaluation-mappings?type=student"); return }
      if (!res.ok) throw new Error("Failed to load student enrollments")
      const json = await res.json()
      setData(json.data)
    } catch (err) { setError(err instanceof Error ? err.message : "Unknown error") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { Promise.resolve().then(() => fetchData()) }, [fetchData])

  const { data: semestersData } = useApiGet<{ data: SemesterData[] }>("/api/semesters")
  const activeSemesterId = useMemo(() => semestersData?.data?.find((s) => s.isActive)?.id ?? "", [semestersData])

  const { data: fsData } = useApiGet<{ data: FacultyMapping[] }>("/api/data/evaluation-mappings?type=faculty")
  const facultySubjects = fsData?.data ?? []

  // ── Quick Add handlers ───────────────────────────────────

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName || !formEmail || !formFsId) return
    setFormSaving(true); setFormError(""); setFormSuccess("")
    try {
      const res = await fetch("/api/admin/student-enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, email: formEmail, faculty_subject_id: formFsId, semesterId: activeSemesterId || null }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to add enrollment") }
      setFormName(""); setFormEmail(""); setShowQuickAdd(false)
      setFormSuccess("Enrollment added!")
      setTimeout(() => setFormSuccess(""), 3000)
      fetchData(true)
    } catch (err) { setFormError((err as Error).message) }
    finally { setFormSaving(false) }
  }

  const filtered = data?.filter((m) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      m.student.name.toLowerCase().includes(q) ||
      m.student.email.toLowerCase().includes(q) ||
      `${m.section.program}-${m.section.name}`.toLowerCase().includes(q) ||
      (m.faculty_subject?.subject.code ?? "").toLowerCase().includes(q) ||
      (m.faculty_subject?.subject.name ?? "").toLowerCase().includes(q) ||
      (m.faculty_subject?.faculty.name ?? "").toLowerCase().includes(q)
    )
  })

  const groupedStudents = useMemo(() => {
    const map = new Map<string, { student: Enrollment["student"]; enrollments: Enrollment[] }>()
    for (const e of filtered ?? []) {
      if (!map.has(e.student.id)) {
        map.set(e.student.id, { student: e.student, enrollments: [] })
      }
      map.get(e.student.id)!.enrollments.push(e)
    }
    return Array.from(map.values())
  }, [filtered])

  const { page, totalPages, pageSize, paginatedItems, setPage, setPageSize } = usePagination(groupedStudents, 25)

  const [selectedStudentEnrollments, setSelectedStudentEnrollments] = useState<Enrollment[] | null>(null)
  const enrolledPagination = usePagination(selectedStudentEnrollments ?? [], 25)

  const hasNullSemesterId = data?.some((e) => !e.semesterId) ?? false

  return (
    <div className="space-y-6">
      {locked && <LockedTab endpoint={locked} />}
      {!locked && error && <p className="text-xs font-medium text-red-600">{error}</p>}

      {/* Import lives on its own page — this card is the doorway. */}
      <Link
        href={`${roleBase}/data/student-import`}
        className="flex items-center justify-between border border-default rounded-lg px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-dim/40 transition-colors"
      >
        <span>Importer: Students — open the import workspace</span>
        <span className="text-tertiary">→</span>
      </Link>

      {!activeSemesterId && (
        <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5">
          <span>⚠️</span>
          <span>No active semester. Set one as active before adding enrollments.</span>
        </div>
      )}

      {/* ── Quick Add — modal (form lives below, beside the subjects modal) ── */}
      <IosButton variant="primary" onClick={() => setShowQuickAdd(true)}>+ Quick Add Single Student</IosButton>

      {/* ═══════════════════════════════════════════════════
          ENROLLMENT TABLE
         ═══════════════════════════════════════════════════ */}
      <div className="border border-default rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTable((s) => !s)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-dim/40 transition-colors"
        >
          <span>Enrollments</span>
          <span className="text-tertiary">{showTable ? "▲" : "▼"}</span>
        </button>
        {showTable && (
          <div className="border-t border-gray-200 dark:border-gray-800 px-4 pb-4 space-y-4">
        {hasNullSemesterId && (
          <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5">
            <span>⚠️</span>
            <span>Some enrollments are missing semesterId — affected students won&rsquo;t see faculty to evaluate.</span>
          </div>
        )}
        <SearchInput value={search} onChange={setSearch} placeholder="Search by student name, email, section, subject, or faculty..." />
        {loading && !data ? (
          <SkeletonTable rows={4} cols={3} />
        ) : groupedStudents.length === 0 ? (
          <p className="text-xs text-tertiary text-center py-8">No enrollments found.</p>
        ) : (
          <>
            <div className="desktop-only max-h-96 overflow-y-auto tbl-container tbl">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Email</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((group) => (
                    <tr key={group.student.id}>
                      <td className="font-medium text-secondary">{group.student.name}</td>
                      <td className="text-tertiary">{group.student.email}</td>
                      <td>
                         <IosButton variant="plain" size="xs" onClick={() => setSelectedStudentEnrollments(group.enrollments)}>View Enrolled Subjects</IosButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-only space-y-2">
              {paginatedItems.map((group) => (
                <div key={group.student.id} className="p-4 rounded-xl bg-surface border border-default space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-primary truncate">{group.student.name}</p>
                      <p className="text-xs text-tertiary truncate">{group.student.email}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs font-semibold text-secondary">{group.enrollments.length} Subject{group.enrollments.length !== 1 ? "s" : ""}</span>
                      <IosButton variant="plain" size="xs" onClick={() => setSelectedStudentEnrollments(group.enrollments)}>(View)</IosButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Paginator page={page} totalPages={totalPages} pageSize={pageSize} totalItems={groupedStudents.length} setPage={setPage} setPageSize={setPageSize} />
          </>
        )}
        {data && <p className="text-xs text-tertiary">{groupedStudents.length} student{groupedStudents.length !== 1 ? "s" : ""} ({data.length} enrollment{data.length !== 1 ? "s" : ""})</p>}
          </div>
        )}
      </div>

      {/* ── Enrolled Subjects Modal ─────────────────────────── */}
      {selectedStudentEnrollments && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 bg-black/60" onClick={() => setSelectedStudentEnrollments(null)}>
          <div className="bg-white dark:bg-surface-dim rounded-2xl w-full max-w-2xl mx-4 shadow-2xl border border-default overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-default">
              <div className="min-w-0">
                <p className="text-sm font-bold text-secondary truncate">{selectedStudentEnrollments[0].student.name}</p>
                <p className="text-xs text-tertiary truncate">{selectedStudentEnrollments.length} enrolled subject{selectedStudentEnrollments.length !== 1 ? "s" : ""}</p>
              </div>
              <IosButton variant="gray" size="xs" onClick={() => setSelectedStudentEnrollments(null)}>
                <svg className="w-4 h-4 text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </IosButton>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto tbl">
              <table className="desktop-only">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Section</th>
                    <th>Subject</th>
                    <th>Faculty</th>
                  </tr>
                </thead>
                <tbody>
                  {enrolledPagination.paginatedItems.map((enr, i) => (
                    <tr key={enr.id}>
                      <td className="text-tertiary">{i + 1}</td>
                      <td className="text-secondary">
                        {enr.section.program}-{enr.section.name}
                        {!enr.semesterId && <span className="ml-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">no semester</span>}
                      </td>
                      <td>
                        {enr.faculty_subject ? (
                          <span className="font-medium text-secondary">{enr.faculty_subject.subject.code} - {enr.faculty_subject.subject.name}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            No mapping
                          </span>
                        )}
                      </td>
                      <td className="text-secondary">{enr.faculty_subject?.faculty.name ?? <span className="text-tertiary italic">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mobile-only space-y-1.5">
                {enrolledPagination.paginatedItems.map((enr, i) => (
                  <div key={enr.id} className="flex items-center gap-3 px-2 py-2 rounded-lg bg-surface-hover/50 text-xs">
                    <span className="text-tertiary font-mono w-5 shrink-0 text-right">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-secondary truncate">{enr.section.program}-{enr.section.name}{!enr.semesterId && <span className="ml-1.5 text-[10px] font-semibold text-amber-600">⚠️</span>}</p>
                      <p className="text-tertiary truncate">
                        {enr.faculty_subject ? (
                          <>{enr.faculty_subject.subject.code} - {enr.faculty_subject.subject.name} · {enr.faculty_subject.faculty.name}</>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            No mapping
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-3 border-t border-default bg-surface-dim text-xs text-tertiary">
              <span>{selectedStudentEnrollments.length} enrolled subject{selectedStudentEnrollments.length !== 1 ? "s" : ""}</span>
              <Paginator page={enrolledPagination.page} totalPages={enrolledPagination.totalPages} pageSize={enrolledPagination.pageSize} totalItems={selectedStudentEnrollments.length} setPage={enrolledPagination.setPage} setPageSize={enrolledPagination.setPageSize} showSizeSelector={false} />
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Add Modal ─────────────────────────── */}
      {showQuickAdd && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 bg-black/60" onClick={() => setShowQuickAdd(false)}>
          <div className="bg-white dark:bg-surface-dim rounded-2xl w-full max-w-2xl mx-4 shadow-2xl border border-default overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-default">
              <p className="text-sm font-bold text-secondary">Quick Add Single Student</p>
              <IosButton variant="gray" size="xs" onClick={() => setShowQuickAdd(false)}>
                <svg className="w-4 h-4 text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </IosButton>
            </div>
            <div className="px-6 py-4 space-y-4">
              {formError && <p className="text-xs font-medium text-red-600 bg-red-50 p-2 rounded">{formError}</p>}
              {formSuccess && <p className="text-xs font-medium text-green-600 bg-green-50 p-2 rounded">{formSuccess}</p>}
              <form onSubmit={handleQuickAdd} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-tertiary mb-1">Faculty-Subject</label>
                  <select
                    value={formFsId}
                    onChange={(e) => setFormFsId(e.target.value)}
                    className="w-full text-sm bg-surface border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    required
                  >
                    <option value="">Select subject...</option>
                    {facultySubjects.map((fs) => (
                      <option key={fs.id} value={fs.id}>
                        {fs.section.program} {fs.section.name} - {fs.subject.code} : {fs.subject.name} ({fs.faculty.name})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-tertiary mb-1">Student Name</label>
                    <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Juan Dela Cruz" className="w-full text-sm bg-surface border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-tertiary mb-1">Student Email</label>
                    <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="e.g. juan@example.com" className="w-full text-sm bg-surface border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" required />
                  </div>
                </div>
                <IosButton type="submit" loading={formSaving} disabled={!activeSemesterId} variant="primary">Add Enrollment</IosButton>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
