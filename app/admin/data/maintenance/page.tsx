"use client"

import { useState, useEffect } from "react"
import LockedTab from "@/components/ui/LockedTab"
import ErrorState from "@/components/ui/ErrorState"
import ErrorBoundary from "@/components/ui/ErrorBoundary"
import SubmitButton from "@/components/ui/SubmitButton"
import { useApiGet } from "@/lib/api/client"
import type { SemesterData } from "@/lib/types"
import type { DepartmentData } from "@/lib/types"

type ModalType = "consultations" | "students" | "loading" | "evaluations" | "soft-users" | "hard-faculty" | null

const SOFT_DELETE_ROLES = ["STUDENT", "DEAN", "FACULTY"]

export default function DataManagementPage() {
  const [modalType, setModalType] = useState<ModalType>(null)
  const [confirmInput, setConfirmInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [lockedEndpoint, setLockedEndpoint] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [clearSemester, setClearSemester] = useState("ALL")
  const [studentMode, setStudentMode] = useState<"enrolments" | "hard">("enrolments")
  const [softRoles, setSoftRoles] = useState<string[]>(["STUDENT"])
  const [hardAllDepts, setHardAllDepts] = useState(true)
  const [hardDepts, setHardDepts] = useState<string[]>([])
  const [clearPreview, setClearPreview] = useState<{ studentIds: string[]; enrollments: unknown[]; consultations: unknown[]; evaluations: unknown[] } | null>(null)

  const { data: semestersData } = useApiGet<{ data: SemesterData[] }>("/api/semesters")
  const semesters = semestersData?.data ?? []
  const { data: adminData } = useApiGet<{ users: unknown[]; departments: DepartmentData[] }>("/api/admin/users")
  const departments = adminData?.departments ?? []

  const closeModal = () => {
    if (loading) return
    setModalType(null)
    setConfirmInput("")
    setClearSemester("ALL")
    setStudentMode("enrolments")
    setSoftRoles(["STUDENT"])
    setHardAllDepts(true)
    setHardDepts([])
    setClearPreview(null)
  }

  const toggleSoftRole = (role: string) => {
    setSoftRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role])
  }

  const toggleHardDept = (id: string) => {
    setHardAllDepts(false)
    setHardDepts((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id])
  }

  // Hard-mode cascade counts for the are-you-sure prompt (deletes nothing).
  useEffect(() => {
    let cancelled = false
    if (modalType !== "students" || studentMode !== "hard") {
      Promise.resolve().then(() => { if (!cancelled) setClearPreview(null) })
    } else {
      fetch("/api/admin/data/clear-students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semesterId: clearSemester, mode: "hard", preview: true }),
      })
        .then((r) => r.json())
        .then((d) => { if (!cancelled && !d.error) setClearPreview(d) })
        .catch(() => {})
    }
    return () => { cancelled = true }
  }, [modalType, studentMode, clearSemester])

  const handleExportAndDelete = async () => {
    if (!modalType) return
    setLoading(true)
    setResult(null)

    const isStudents = modalType === "students"
    const isLoading = modalType === "loading"
    const isEvaluations = modalType === "evaluations"
    const isSoftUsers = modalType === "soft-users"
    const isHardFaculty = modalType === "hard-faculty"
    const endpoint = isStudents
      ? "/api/admin/data/clear-students"
      : isLoading
        ? "/api/admin/data/clear-loading"
        : isEvaluations
          ? "/api/admin/data/clear-evaluations"
          : isSoftUsers
            ? "/api/admin/data/soft-delete-users"
            : isHardFaculty
              ? "/api/admin/data/hard-delete-faculty"
              : "/api/admin/data/export-consultations"
    const label = isStudents ? "student" : isLoading ? "loading" : isEvaluations ? "evaluation" : isSoftUsers ? "user" : isHardFaculty ? "faculty" : "consultation"
    const requestBody = isStudents
      ? { semesterId: clearSemester, mode: studentMode }
      : isLoading || isEvaluations
        ? { semesterId: clearSemester }
        : isSoftUsers
          ? { roles: softRoles }
          : isHardFaculty
            ? { departmentIds: hardAllDepts ? "ALL" : hardDepts }
            : undefined

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        ...(requestBody ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) } : {}),
      })
      if (res.status === 403) { setLockedEndpoint(endpoint); return }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to export and delete ${label} records`)
      }

      const text = await res.text()
      const data = JSON.parse(text)
      const count = isStudents
        ? (data.studentIds || []).length
        : isLoading
          ? (data.enrollments || []).length + (data.facultySubjects || []).length
          : isEvaluations
            ? (data.evaluations || []).length
            : isSoftUsers || isHardFaculty
              ? (data.userIds || []).length
              : (data.appointments || []).length

      const disposition = res.headers.get("Content-Disposition")
      const dateStr = new Date().toISOString().slice(0, 10)
      let filename = isStudents
        ? `students-clear-${dateStr}.json`
        : isLoading
          ? `loading-export-${dateStr}.json`
          : isEvaluations
            ? `evaluations-export-${dateStr}.json`
            : isSoftUsers
              ? `users-soft-delete-${dateStr}.json`
              : isHardFaculty
                ? `faculty-hard-delete-${dateStr}.json`
                : `consultations-export-${dateStr}.json`
      if (disposition) {
        const match = disposition.match(/filename="?(.+?)"?$/)
        if (match) filename = match[1]
      }

      const blob = new Blob([text], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setResult({
        type: "success",
        message: isStudents && studentMode === "enrolments"
          ? `Successfully exported and cleared ${(data.enrollments || []).length} enrollment(s) and soft-deleted ${(data.studentIds || []).length} student(s) for ${clearSemester === "ALL" ? "all semesters" : "the selected semester"}. Accounts are restorable from Deleted Users.`
          : isStudents
            ? `Successfully exported and hard-deleted ${(data.studentIds || []).length} student(s), ${(data.enrollments || []).length} enrollment(s), ${(data.consultations || []).length} consultation(s) and ${(data.evaluations || []).length} evaluation(s).`
            : isSoftUsers
              ? `Successfully exported and soft-deleted ${(data.userIds || []).length} user(s) (${(data.roles || []).join(", ")}). Restorable from Deleted Users.`
              : isHardFaculty
                ? `Successfully exported and hard-deleted ${(data.userIds || []).length} faculties, ${(data.facultySubjects || []).length} mapping(s), ${(data.enrollments || []).length} enrollment(s), ${(data.appointments || []).length} consultation(s) and ${(data.evaluations || []).length} evaluation(s).`
                : isLoading
          ? `Successfully exported and cleared ${(data.enrollments || []).length} enrollment(s) and ${(data.facultySubjects || []).length} mapping(s) for ${clearSemester === "ALL" ? "all semesters" : "the selected semester"}.`
          : isEvaluations
            ? `Successfully exported and cleared ${(data.evaluations || []).length} evaluation(s), ${(data.ratings || []).length} rating(s), ${(data.comments || []).length} comment(s) and ${(data.results || []).length} result(s) across ${(data.evaluationPeriodIds || []).length} period(s) for ${clearSemester === "ALL" ? "all semesters" : "the selected semester"}.`
            : `Successfully exported and deleted ${count} ${label} record${count !== 1 ? "s" : ""}.`,
      })
      closeModal()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = () => handleExportAndDelete()

  const isStudents = modalType === "students"
  const isSoftUsers = modalType === "soft-users"
  const isHardFaculty = modalType === "hard-faculty"
  if (lockedEndpoint) {
    return (
      <div className="w-full space-y-8 pb-12">
        <LockedTab endpoint={lockedEndpoint} />
      </div>
    )
  }

  return (
    <ErrorBoundary>
    {errorMessage ? (
      <ErrorState message={errorMessage} onRetry={() => { setErrorMessage(""); window.location.reload() }} />
    ) : (
    <div className="w-full space-y-8 pb-12">
      <h1 className="text-2xl font-bold text-primary">Data Management</h1>

      {result && (
        <div className={`rounded-xl border p-4 text-sm font-medium ${
          result.type === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          <div className="flex items-center justify-between">
            <span>{result.message}</span>
            <button onClick={() => setResult(null)} className="ml-3 text-current opacity-60 hover:opacity-100">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-red-200 bg-surface shadow-sm p-6">
        <h2 className="text-lg font-bold text-primary mb-2">Consultation Records</h2>
        <p className="text-sm text-tertiary mb-5">
          This will permanently delete all consultation records including appointments, attendee data, time slots, and
          uploaded files. A JSON export will be downloaded before deletion.
        </p>
        <button
          onClick={() => setModalType("consultations")}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
        >
          Export & Clear All Consultations
        </button>
      </div>

      <div className="rounded-2xl border border-red-200 bg-surface shadow-sm p-6">
        <h2 className="text-lg font-bold text-primary mb-2">Faculty Loading & Enrollments</h2>
        <p className="text-sm text-tertiary mb-5">
          This will permanently delete student enrollments and faculty-subject mappings for the selected semester
          (or all semesters). Student and faculty accounts are never touched. Mappings that still have evaluations
          are kept — clear evaluations first. A JSON export will be downloaded before deletion.
        </p>
        <button
          onClick={() => setModalType("loading")}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
        >
          Export & Clear Loading
        </button>
      </div>

      <div className="rounded-2xl border border-red-200 bg-surface shadow-sm p-6">
        <h2 className="text-lg font-bold text-primary mb-2">Evaluation Records</h2>
        <p className="text-sm text-tertiary mb-5">
          This will permanently delete evaluations, ratings, comments and computed results for the selected semester
          (or all semesters). A JSON export will be downloaded before deletion.
        </p>
        <button
          onClick={() => setModalType("evaluations")}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
        >
          Export & Clear Evaluations
        </button>
      </div>

      <div className="rounded-2xl border border-red-200 bg-surface shadow-sm p-6">
        <h2 className="text-lg font-bold text-primary mb-2">Student Records</h2>
        <p className="text-sm text-tertiary mb-5">
          Clear student enrollments for the selected semester (or all semesters). Choose enrolments-only to
          soft-delete accounts (restorable from Deleted Users), or hard-delete to permanently remove accounts
          along with their consultations and evaluations. A JSON export will be downloaded before deletion.
        </p>
        <button
          onClick={() => setModalType("students")}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
        >
          Export & Clear Students
        </button>
      </div>

      <div className="rounded-2xl border border-red-200 bg-surface shadow-sm p-6">
        <h2 className="text-lg font-bold text-primary mb-2">Soft-Delete Users</h2>
        <p className="text-sm text-tertiary mb-5">
          Soft-delete user accounts by role so they disappear from pickers and cannot log in. Soft-deleted users
          are listed under Deleted Users and can be restored. ADMIN accounts are never included. A JSON export
          will be downloaded before deletion.
        </p>
        <button
          onClick={() => setModalType("soft-users")}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
        >
          Soft-Delete Users by Role
        </button>
      </div>

      <div className="rounded-2xl border border-red-200 bg-surface shadow-sm p-6">
        <h2 className="text-lg font-bold text-primary mb-2">Hard-Delete Faculty</h2>
        <p className="text-sm text-tertiary mb-5">
          Permanently delete faculty accounts for the selected departments (or all departments), along with their
          mappings, enrollments on those mappings, consultations and evaluations. A JSON export will be downloaded
          before deletion.
        </p>
        <button
          onClick={() => setModalType("hard-faculty")}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
        >
          Hard-Delete Faculty
        </button>
      </div>

      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={closeModal}>
          <div className="bg-surface rounded-xl shadow-xl p-6 w-full max-w-md mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary">
              {isStudents ? "Confirm Export & Clear Students" : modalType === "loading" ? "Confirm Export & Clear Loading" : modalType === "evaluations" ? "Confirm Export & Clear Evaluations" : isSoftUsers ? "Confirm Soft-Delete Users" : isHardFaculty ? "Confirm Hard-Delete Faculty" : "Confirm Export & Clear"}
            </h2>
            <p className="text-sm text-red-600 font-semibold">
              {isStudents
                ? studentMode === "hard"
                  ? "This will PERMANENTLY delete student accounts along with their consultations and evaluations. This action CANNOT be undone."
                  : "This will delete enrollments in scope and soft-delete student accounts (restorable from Deleted Users). This action CANNOT be undone."
                : modalType === "loading"
                  ? "This will permanently delete enrollments and faculty-subject mappings in the selected scope. Accounts are never touched. This action CANNOT be undone."
                  : modalType === "evaluations"
                    ? "This will permanently delete evaluations, ratings, comments and computed results in the selected scope. This action CANNOT be undone."
                    : isSoftUsers
                      ? "This will soft-delete the selected user accounts. They can be restored from Deleted Users. ADMIN accounts are never included. This action CANNOT be undone."
                      : isHardFaculty
                        ? "This will PERMANENTLY delete faculty accounts in scope along with their mappings, enrollments, consultations and evaluations. This action CANNOT be undone."
                        : "This will permanently delete ALL consultation records. This action CANNOT be undone."}
            </p>
            {isSoftUsers && (
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Roles to soft-delete (ADMIN never included)
                </label>
                <div className="flex gap-2">
                  {SOFT_DELETE_ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleSoftRole(r)}
                      className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
                        softRoles.includes(r)
                          ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                          : "border-default text-tertiary hover:bg-surface-hover"
                      }`}
                    >
                      {r.charAt(0) + r.slice(1).toLowerCase() + "s"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isHardFaculty && (
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Departments
                </label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  <label className="flex items-center gap-2 text-xs font-semibold text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hardAllDepts}
                      onChange={() => { setHardAllDepts(true); setHardDepts([]) }}
                      className="rounded border-strong text-amber-600"
                    />
                    All departments
                  </label>
                  {departments.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hardAllDepts || hardDepts.includes(d.id)}
                        onChange={() => toggleHardDept(d.id)}
                        className="rounded border-strong text-amber-600"
                      />
                      {d.name} <span className="text-tertiary font-mono">({d.code})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {(modalType === "loading" || modalType === "evaluations" || modalType === "students") && (
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Semester scope
                </label>
                <select
                  value={clearSemester}
                  onChange={(e) => setClearSemester(e.target.value)}
                  className="input text-sm w-full px-3 py-2 rounded-lg border border-strong bg-surface"
                >
                  <option value="ALL">All semesters</option>
                  {semesters.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>
            )}
            {modalType === "students" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">
                    Clear mode
                  </label>
                  <div className="flex gap-2">
                    {(["enrolments", "hard"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setStudentMode(m)}
                        className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
                          studentMode === m
                            ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                            : "border-default text-tertiary hover:bg-surface-hover"
                        }`}
                      >
                        {m === "enrolments" ? "Enrolments only + soft-delete" : "Hard-delete accounts"}
                      </button>
                    ))}
                  </div>
                </div>
                {studentMode === "hard" && (
                  <p className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                    {clearPreview
                      ? `Are you sure? This will permanently delete ${clearPreview.studentIds.length} student account(s), ${clearPreview.enrollments.length} enrollment(s), ${clearPreview.consultations.length} consultation(s) and ${clearPreview.evaluations.length} evaluation(s).`
                      : "Loading cascade counts..."}
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                Type <span className="font-bold">CONFIRM</span> to proceed
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="CONFIRM"
                className="input text-sm w-full"
              />
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <button
                onClick={closeModal}
                disabled={loading}
                className="text-xs font-semibold px-4 py-3 sm:py-2 rounded-lg border border-default hover:bg-surface-hover disabled:opacity-50 cursor-pointer w-full sm:w-auto"
              >
                Cancel
              </button>
              <SubmitButton
                onClick={handleConfirm}
                disabled={confirmInput !== "CONFIRM" || loading || (isSoftUsers && softRoles.length === 0) || (isHardFaculty && !hardAllDepts && hardDepts.length === 0)}
                variant="primary"
                className="text-xs font-semibold px-4 py-3 sm:py-2 rounded-lg w-full sm:w-auto"
              >
                {loading ? "Exporting & Deleting..." : "Export & Delete"}
              </SubmitButton>
            </div>
          </div>
        </div>
      )}
    </div>
    )}
    </ErrorBoundary>
  )
}
