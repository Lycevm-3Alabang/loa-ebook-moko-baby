"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { useApiGet, invalidate } from "@/lib/api/client"
import { usePagination, Paginator } from "@/components/ui/Paginator"
import IosButton from "@/components/ui/IosButton"
import type { FacultyMapping, Enrollment } from "./types"
import type { SemesterData } from "@/lib/types"

interface FacultySubjectDetailProps {
  mapping: FacultyMapping
  onClose?: () => void
}

export function FacultySubjectDetail({ mapping, onClose }: FacultySubjectDetailProps) {
  const { data: allUsers } = useApiGet<{ users: { id: string; name: string; email: string; role: string; departmentId: string | null }[] }>("/api/admin/users")

  const { data: semestersData } = useApiGet<{ data: SemesterData[] }>("/api/semesters")
  const activeSemesterId = useMemo(() => semestersData?.data?.find((s) => s.isActive)?.id ?? "", [semestersData])

  const studentKey = `/api/data/evaluation-mappings?type=student&facultySubjectId=${mapping.id}${activeSemesterId ? `&semesterId=${activeSemesterId}` : ""}`
  const { data: enrollmentsData } = useApiGet<{ data: Enrollment[]; total?: number }>(studentKey)

  const faculties = useMemo(
    () => (allUsers?.users ?? []).filter((u) => (u.role.includes("FACULTY") || u.role.includes("DEAN")) && u.id !== "a0000000-0000-0000-0000-000000000001"),
    [allUsers]
  )

  const enrolledStudentsByFsId = useMemo(() => {
    const map = new Map<string, Enrollment[]>()
    for (const e of enrollmentsData?.data ?? []) {
      if (e.faculty_subject_id) {
        const list = map.get(e.faculty_subject_id)
        if (list) list.push(e)
        else map.set(e.faculty_subject_id, [e])
      }
    }
    return map
  }, [enrollmentsData])

  // ── Re-assign Faculty ──
  const [reassignFacultyId, setReassignFacultyId] = useState("")
  const [reassignFacultySearch, setReassignFacultySearch] = useState("")
  const [reassignDropdownOpen, setReassignDropdownOpen] = useState(false)
  const reassignDropdownRef = useRef<HTMLDivElement>(null)
  const [reassignSaving, setReassignSaving] = useState(false)
  const [reassignError, setReassignError] = useState("")
  const [reassignSuccess, setReassignSuccess] = useState("")

  const reassignFaculties = useMemo(
    () => faculties.filter((f) => f.departmentId === mapping.faculty.departmentId && f.id !== mapping.faculty.id),
    [faculties, mapping]
  )

  const filteredReassignFaculties = useMemo(() => {
    if (!reassignFacultySearch) return reassignFaculties
    const q = reassignFacultySearch.toLowerCase()
    return reassignFaculties.filter((f) => f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q))
  }, [reassignFaculties, reassignFacultySearch])

  const handleReassign = async () => {
    if (!reassignFacultyId) return
    setReassignSaving(true); setReassignError(""); setReassignSuccess("")
    try {
      const res = await fetch("/api/admin/faculty-subjects/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldFacultySubjectId: mapping.id, newFacultyId: reassignFacultyId }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Reassignment failed") }
      setReassignSuccess("Faculty reassigned! Students will see the new faculty on their next page load.")
      setReassignFacultyId(""); setReassignFacultySearch("")
      invalidate(studentKey)
      invalidate("/api/data/evaluation-mappings?type=faculty")
      setTimeout(() => { onClose?.(); setReassignSuccess("") }, 2000)
    } catch (err) { setReassignError((err as Error).message) }
    finally { setReassignSaving(false) }
  }

  // ── Enrolled Students ──
  const [studentFilter, setStudentFilter] = useState("")
  const enrolledStudents = useMemo(
    () => enrolledStudentsByFsId.get(mapping.id) ?? [],
    [enrolledStudentsByFsId, mapping.id]
  )

  const filteredEnrolled = useMemo(() => {
    if (!studentFilter.trim()) return enrolledStudents
    const q = studentFilter.toLowerCase()
    return enrolledStudents.filter((e) =>
      e.student.name.toLowerCase().includes(q) || e.student.email.toLowerCase().includes(q)
    )
  }, [enrolledStudents, studentFilter])

  const enrolledPagination = usePagination(filteredEnrolled, 15)
  const [removingEnrollmentId, setRemovingEnrollmentId] = useState<string | null>(null)
  const [removingEnrollmentIds, setRemovingEnrollmentIds] = useState<Set<string> | null>(null)
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<Set<string>>(new Set())
  const [confirmRemoveEnrollment, setConfirmRemoveEnrollment] = useState<{ ids: string[]; name?: string } | null>(null)

  const toggleSelectEnrollment = (id: string) => {
    setSelectedEnrollmentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedEnrollmentIds.size === filteredEnrolled.length) {
      setSelectedEnrollmentIds(new Set())
    } else {
      setSelectedEnrollmentIds(new Set(filteredEnrolled.map((e) => e.id)))
    }
  }

  const handleRemoveStudent = async (enrollmentId: string) => {
    setRemovingEnrollmentId(enrollmentId)
    setConfirmRemoveEnrollment(null)
    try {
      const res = await fetch(`/api/admin/student-enrollments/${enrollmentId}`, { method: "DELETE" })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to remove student") }
      invalidate(studentKey)
    } catch (err) { alert((err as Error).message) }
    finally { setRemovingEnrollmentId(null) }
  }

  const handleBulkRemove = async () => {
    if (!confirmRemoveEnrollment) return
    const ids = confirmRemoveEnrollment.ids
    setRemovingEnrollmentIds(new Set(ids))
    setConfirmRemoveEnrollment(null)
    try {
      await Promise.all(ids.map((id) =>
        fetch(`/api/admin/student-enrollments/${id}`, { method: "DELETE" }).then((r) => {
          if (!r.ok) throw new Error("Failed to remove enrollment")
        })
      ))
      setSelectedEnrollmentIds(new Set())
      invalidate(studentKey)
    } catch (err) { alert((err as Error).message) }
    finally { setRemovingEnrollmentIds(null) }
  }

  // ── Add Student ──
  const [addStudentQuery, setAddStudentQuery] = useState("")
  const [addStudentId, setAddStudentId] = useState("")
  const [addStudentDropdownOpen, setAddStudentDropdownOpen] = useState(false)
  const addStudentDropdownRef = useRef<HTMLDivElement>(null)
  const [addingStudent, setAddingStudent] = useState(false)
  const [addStudentError, setAddStudentError] = useState("")
  const [addStudentSuccess, setAddStudentSuccess] = useState("")

  const allStudents = useMemo(
    () => (allUsers?.users ?? []).filter((u) => u.role.includes("STUDENT")),
    [allUsers]
  )

  const filteredAddStudents = useMemo(() => {
    if (!addStudentQuery.trim()) return []
    const enrolledIds = new Set(enrolledStudents.map((e) => e.student.id))
    const q = addStudentQuery.toLowerCase()
    return allStudents
      .filter((u) => !enrolledIds.has(u.id) && (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)))
      .slice(0, 20)
  }, [allStudents, addStudentQuery, enrolledStudents])

  const handleAddStudent = async () => {
    if (!addStudentId) return
    setAddingStudent(true); setAddStudentError(""); setAddStudentSuccess("")
    try {
      const res = await fetch("/api/admin/student-enrollments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faculty_subject_id: mapping.id, student_id: addStudentId, semesterId: activeSemesterId || null }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to add student") }
      setAddStudentSuccess("Student added!")
      setAddStudentId(""); setAddStudentQuery("")
      invalidate(studentKey)
      setTimeout(() => setAddStudentSuccess(""), 3000)
    } catch (err) { setAddStudentError((err as Error).message) }
    finally { setAddingStudent(false) }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (reassignDropdownRef.current && !reassignDropdownRef.current.contains(e.target as Node)) {
        setReassignDropdownOpen(false)
      }
      if (addStudentDropdownRef.current && !addStudentDropdownRef.current.contains(e.target as Node)) {
        setAddStudentDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="space-y-4">
      {/* Re-assign Faculty */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-secondary">Re-assign Faculty</h3>
        {reassignError && <p className="text-xs font-medium text-red-600 bg-red-50 p-2 rounded">{reassignError}</p>}
        {reassignSuccess && <p className="text-xs font-medium text-green-600 bg-green-50 p-2 rounded">{reassignSuccess}</p>}
        <div className="relative" ref={reassignDropdownRef}>
          <label className="block text-xs font-semibold text-tertiary mb-1">New Faculty</label>
          <input
            value={reassignFacultySearch || (reassignFacultyId ? reassignFaculties.find((f) => f.id === reassignFacultyId)?.name ?? "" : "")}
            onChange={(e) => { setReassignFacultySearch(e.target.value); setReassignFacultyId(""); setReassignDropdownOpen(true) }}
            onFocus={() => setReassignDropdownOpen(true)}
            placeholder="Search faculty in same department..."
            className="w-full text-sm bg-surface border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            autoComplete="off"
          />
          {reassignDropdownOpen && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-surface border border-strong rounded-lg shadow-xl max-h-52 overflow-y-auto">
              {filteredReassignFaculties.length === 0 ? (
                <p className="text-xs text-tertiary text-center py-4">No other faculty in this department</p>
              ) : (
                filteredReassignFaculties.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => { setReassignFacultyId(f.id); setReassignFacultySearch(""); setReassignDropdownOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-hover transition-colors ${reassignFacultyId === f.id ? "bg-amber-50 dark:bg-amber-900/20 font-semibold" : ""}`}
                  >
                    <span className="text-primary">{f.name}</span>
                    <span className="text-tertiary ml-1 text-xs">{f.email}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {reassignFacultyId && !reassignSuccess && (
          <div className="rounded-lg border border-default bg-surface-dim/50 px-3 py-2.5 space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-tertiary">From:</span>
              <span className="font-medium text-secondary">{mapping.faculty.name}</span>
              <span className="text-tertiary">({mapping.faculty.email})</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-tertiary">To:</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{reassignFaculties.find((f) => f.id === reassignFacultyId)?.name}</span>
              <span className="text-tertiary">({reassignFaculties.find((f) => f.id === reassignFacultyId)?.email})</span>
            </div>
          </div>
        )}
        {reassignFacultyId && !reassignSuccess && (
          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>Proceeding will update which faculty is assigned to this subject-section. Students will see a new pending evaluation for the new faculty, and any existing evaluations for the old faculty will be invalidated. This action cannot be undone.</span>
          </div>
        )}
        <IosButton
          variant="primary"
          type="button"
          loading={reassignSaving}
          disabled={!reassignFacultyId}
          onClick={handleReassign}
        >
          {reassignSaving ? "Re-assigning..." : "Confirm Re-assignment"}
        </IosButton>
      </div>

      <div className="border-t border-default pt-4" />

      {/* Search and Add */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-secondary">Search and Add</h3>
        {addStudentError && <p className="text-xs font-medium text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{addStudentError}</p>}
        {addStudentSuccess && <p className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded">{addStudentSuccess}</p>}

        <div className="relative" ref={addStudentDropdownRef}>
          <input
            type="text"
            value={addStudentQuery}
            onChange={(e) => { setAddStudentQuery(e.target.value); setAddStudentId(""); setAddStudentDropdownOpen(true) }}
            onFocus={() => setAddStudentDropdownOpen(true)}
            placeholder="Search existing students for this semester..."
            className="input text-xs w-full px-3 py-2 rounded-lg border border-strong"
            autoComplete="off"
          />
          {addStudentDropdownOpen && filteredAddStudents.length > 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-surface border border-strong rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {filteredAddStudents.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setAddStudentId(u.id); setAddStudentQuery(u.name); setAddStudentDropdownOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-surface-hover transition-colors ${addStudentId === u.id ? "bg-amber-50 dark:bg-amber-900/20 font-semibold" : ""}`}
                >
                  <span className="font-medium text-primary">{u.name}</span>
                  <span className="text-tertiary ml-1">{u.email}</span>
                </button>
              ))}
            </div>
          )}
          {addStudentDropdownOpen && addStudentQuery.trim() && filteredAddStudents.length === 0 && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-surface border border-strong rounded-lg shadow-xl">
              <p className="text-xs text-tertiary text-center py-3">No students found.</p>
            </div>
          )}
        </div>

        <IosButton
          variant="primary"
          type="button"
          loading={addingStudent}
          disabled={addingStudent || !addStudentId || !activeSemesterId}
          onClick={handleAddStudent}
        >
          {addingStudent ? "Adding..." : "Add Student"}
        </IosButton>
      </div>

      {/* Enrolled Students */}
      <div className="border-t border-default pt-4">
        <h3 className="text-sm font-semibold text-secondary mb-2">
          Enrolled Students ({studentFilter.trim() ? filteredEnrolled.length : (enrollmentsData?.total ?? enrolledStudents.length)})
        </h3>
        {enrolledStudents.length === 0 ? (
          <p className="text-xs text-tertiary text-center py-4">No enrolled students.</p>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={studentFilter}
              onChange={(e) => { setStudentFilter(e.target.value); enrolledPagination.setPage(0) }}
              placeholder="Search students..."
              className="input text-xs w-full px-3 py-2 rounded-lg border border-strong"
            />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-tertiary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filteredEnrolled.length > 0 && selectedEnrollmentIds.size === filteredEnrolled.length}
                  onChange={toggleSelectAll}
                  className="accent-amber-500 w-3.5 h-3.5"
                />
                Select All
              </label>
              {selectedEnrollmentIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRemoveEnrollment({
                      ids: Array.from(selectedEnrollmentIds),
                      name: `${selectedEnrollmentIds.size} student${selectedEnrollmentIds.size !== 1 ? "s" : ""}`,
                    })
                  }}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
                >
                  Remove Selected ({selectedEnrollmentIds.size})
                </button>
              )}
            </div>
            <div className="tbl max-h-48 overflow-y-auto">
              <table>
                <thead>
                  <tr>
                    <th className="w-8">
                      <input
                        type="checkbox"
                        checked={filteredEnrolled.length > 0 && selectedEnrollmentIds.size === filteredEnrolled.length}
                        onChange={toggleSelectAll}
                        className="accent-amber-500 w-3.5 h-3.5"
                      />
                    </th>
                    <th className="w-8">#</th>
                    <th>Student</th>
                    <th>Email</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {enrolledPagination.paginatedItems.map((e, i) => (
                    <tr key={e.id} className={selectedEnrollmentIds.has(e.id) ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedEnrollmentIds.has(e.id)}
                          onChange={() => toggleSelectEnrollment(e.id)}
                          className="accent-amber-500 w-3.5 h-3.5"
                        />
                      </td>
                      <td className="text-tertiary">{enrolledPagination.page * enrolledPagination.pageSize + i + 1}</td>
                      <td className="font-medium text-secondary">{e.student.name}</td>
                      <td className="text-tertiary">{e.student.email}</td>
                      <td className="text-center">
                        <button
                          type="button"
                          disabled={removingEnrollmentId === e.id}
                          onClick={() => setConfirmRemoveEnrollment({ ids: [e.id], name: e.student.name })}
                          className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-40"
                          title="Remove from section"
                        >
                          {removingEnrollmentIds?.has(e.id) ? (
                            <span className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin block" />
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredEnrolled.length === 0 && studentFilter && (
              <p className="text-xs text-tertiary text-center py-2">No students match &ldquo;{studentFilter}&rdquo;</p>
            )}
            {filteredEnrolled.length > 15 && (
              <Paginator page={enrolledPagination.page} totalPages={enrolledPagination.totalPages} pageSize={enrolledPagination.pageSize} totalItems={filteredEnrolled.length} setPage={enrolledPagination.setPage} setPageSize={enrolledPagination.setPageSize} showSizeSelector={false} />
            )}
          </div>
        )}
      </div>

      {/* ── Confirm Remove Enrollment ────────────────────────── */}
      {confirmRemoveEnrollment && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={() => setConfirmRemoveEnrollment(null)}>
          <div className="bg-white dark:bg-surface-dim rounded-2xl w-full max-w-sm mx-4 shadow-2xl border border-default p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-1">
              <p className="text-base font-bold text-primary">Remove Student Enrollment{confirmRemoveEnrollment.ids.length > 1 ? "s" : ""}</p>
              <p className="text-sm text-tertiary">
                {confirmRemoveEnrollment.ids.length === 1 ? (
                  <>Are you sure you want to remove <span className="font-semibold text-secondary">{confirmRemoveEnrollment.name}</span> from this subject-section?</>
                ) : (
                  <>Are you sure you want to remove <span className="font-semibold text-secondary">{confirmRemoveEnrollment.name}</span> from this subject-section?</>
                )}
              </p>
            </div>
            <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>This will unenroll {confirmRemoveEnrollment.ids.length === 1 ? "this student" : "these students"} from this subject-section. The student enrollment record will be deleted. Any associated evaluation records will remain but may be marked invalid. This action cannot be undone.</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <IosButton variant="gray" size="sm" type="button" onClick={() => setConfirmRemoveEnrollment(null)}>
                Cancel
              </IosButton>
              {confirmRemoveEnrollment.ids.length === 1 ? (
                <IosButton
                  variant="destructive"
                  size="sm"
                  type="button"
                  loading={removingEnrollmentId === confirmRemoveEnrollment.ids[0]}
                  onClick={() => handleRemoveStudent(confirmRemoveEnrollment.ids[0])}
                >
                  {removingEnrollmentId === confirmRemoveEnrollment.ids[0] ? "Removing..." : "Yes, Remove"}
                </IosButton>
              ) : (
                <IosButton
                  variant="destructive"
                  size="sm"
                  type="button"
                  loading={removingEnrollmentIds !== null}
                  onClick={handleBulkRemove}
                >
                  {removingEnrollmentIds !== null ? "Removing..." : `Yes, Remove (${confirmRemoveEnrollment.ids.length})`}
                </IosButton>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
