"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { parseCsvRows } from "@/lib/csv-utils"

interface UserCsvRow {
  row: number
  name: string
  email: string
  role: string
  departmentCode: string
  programCode: string
  employeeNo: string
}

interface PreviewRow extends UserCsvRow {
  isNewUser: boolean
  invalidDept: boolean
  invalidProgram: boolean
  duplicateEmail: boolean
}

interface ImportResult {
  created: number
  updated: number
  failed: number
  failures: { name: string; email: string; role: string; department: string; program: string; employeeNo: string; remark: string }[]
  successCsv: string
}

interface DeptCourse {
  id: string
  departmentId: string
  code: string
  name: string
  department: { id: string; name: string; code: string }
}

const TEMPLATE_HEADERS = "name,email,role,department_code,program_code,employee_no"
const TEMPLATE_SAMPLE = "Alice Student,alice.student@itmlyceumalabang.onmicrosoft.com,STUDENT,CCS,BSIT,\nBob Faculty,bob.faculty@lyceumalabang.edu.ph,FACULTY,CCS,,EMP001"

function decodeCsvText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer)
  } catch {
    const bytes = new Uint8Array(buffer)
    let result = ""
    for (let i = 0; i < bytes.length; i++) {
      result += String.fromCharCode(bytes[i])
    }
    return result
  }
}

function downloadBlob(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function parseClientCsv(text: string): { rows: UserCsvRow[]; error?: string } {
  const allRows = parseCsvRows(text)
  if (allRows.length < 2) return { rows: [], error: "CSV file is empty" }

  const headers = allRows[0].map((h) => h.trim().toLowerCase())
  const expected5 = ["name", "email", "role", "department_code", "program_code"]
  const expected6 = ["name", "email", "role", "department_code", "program_code", "employee_no"]

  const is5Col = headers.length === 5 && headers.every((h, i) => h === expected5[i])
  const is6Col = headers.length === 6 && headers.every((h, i) => h === expected6[i])

  if (!is5Col && !is6Col) {
    const expected = "name, email, role, department_code, program_code" + (headers.length >= 6 ? ", employee_no" : "")
    return { rows: [], error: `Expected headers: ${expected}` }
  }

  const rows: UserCsvRow[] = []
  for (let i = 1; i < allRows.length; i++) {
    const cols = allRows[i]
    if (is6Col && cols.length < 6) continue
    if (is5Col && cols.length < 5) continue
    rows.push({
      row: i + 1,
      name: cols[0].trim(),
      email: cols[1].trim(),
      role: cols[2].trim(),
      departmentCode: cols[3].trim(),
      programCode: cols[4].trim(),
      employeeNo: is6Col ? (cols[5] || "").trim() : "",
    })
  }
  return { rows }
}

function dispatchToast(message: string, type?: "success" | "error") {
  window.dispatchEvent(
    new CustomEvent("app:toast", {
      detail: { message, path: "", method: type === "error" ? "POST" : "POST" },
    })
  )
}

const PREVIEW_PAGE_SIZE = 50

export default function BulkUserImport({
  previewOnly,
  onImportComplete,
}: {
  previewOnly?: boolean
  onImportComplete?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [previewError, setPreviewError] = useState("")
  const [error, setError] = useState("")
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [removedRows, setRemovedRows] = useState<UserCsvRow[]>([])
  const [uploading, setUploading] = useState(false)

  const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set())
  const [deptMap, setDeptMap] = useState<Map<string, string>>(new Map())
  const [deptCourses, setDeptCourses] = useState<DeptCourse[]>([])
  const [refError, setRefError] = useState("")

  const fetchReferenceData = useCallback(async () => {
    try {
      const res = await fetch("/api/import/users/reference")
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setRefError(d.error || "Failed to load reference data. Department codes may not validate correctly.")
        return
      }
      const d = await res.json()
      setRefError("")
      if (d.users) {
        setExistingEmails(new Set((d.users as { email: string }[]).map((u) => u.email.toLowerCase())))
      }
      if (d.departments) {
        const map = new Map<string, string>()
        for (const dept of d.departments as { code: string; id: string }[]) {
          map.set(dept.code.toUpperCase(), dept.id)
        }
        setDeptMap(map)
      }
      if (Array.isArray(d.departmentCourses)) {
        setDeptCourses(d.departmentCourses as DeptCourse[])
      }
    } catch {
      setRefError("Could not connect to server. Department codes may not validate correctly.")
    }
  }, [])

  useEffect(() => { Promise.resolve().then(() => fetchReferenceData()) }, [fetchReferenceData])

  const [filterIssue, setFilterIssue] = useState<"all" | "duplicate" | "invalid">("all")

  const blockedRows = useMemo(() => {
    if (!previewRows) return []
    return previewRows.filter((r) => r.invalidDept || r.invalidProgram || r.duplicateEmail)
  }, [previewRows])

  const filteredRows = useMemo(() => {
    if (!previewRows) return []
    if (filterIssue === "duplicate") return previewRows.filter((r) => r.duplicateEmail)
    if (filterIssue === "invalid") return previewRows.filter((r) => r.invalidDept || r.invalidProgram)
    return previewRows
  }, [previewRows, filterIssue])

  const visibleRows = filteredRows
  const paginatedRows = visibleRows.slice(previewPage * PREVIEW_PAGE_SIZE, (previewPage + 1) * PREVIEW_PAGE_SIZE)
  const totalPreviewPages = Math.ceil(visibleRows.length / PREVIEW_PAGE_SIZE)

  useEffect(() => { Promise.resolve().then(() => setPreviewPage(0)) }, [filterIssue])

  const isFaculty = (role: string) => role.toUpperCase().includes("FACULTY")

  const handlePreview = async () => {
    setPreviewError("")
    setError("")
    const file = fileRef.current?.files?.[0]
    if (!file) { setPreviewError("Please select a CSV file"); return }
    const text = decodeCsvText(await file.arrayBuffer())
    const { rows, error: parseError } = parseClientCsv(text)
    if (parseError) { setPreviewError(parseError); return }
    if (rows.length === 0) { setPreviewError("No valid rows found in CSV"); return }

    const emailCounts = new Map<string, number>()
    for (const r of rows) {
      const email = r.email.toLowerCase().trim()
      emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1)
    }

    const withFlags: PreviewRow[] = rows.map((r) => {
      const deptId = deptMap.get(r.departmentCode.trim().toUpperCase())
      const progCode = r.programCode.trim().toUpperCase()
      const course = deptCourses.find((dc) => dc.code.toUpperCase() === progCode)
      const isStudent = r.role.toUpperCase().includes("STUDENT")
      const email = r.email.toLowerCase().trim()

      let invalidDept = !deptId
      let invalidProgram = false
      const programIssue = isStudent && progCode && (!course || (deptId && course.departmentId !== deptId))
      if (programIssue) {
        invalidDept = true
        invalidProgram = true
      }

      return {
        ...r,
        isNewUser: !existingEmails.has(email),
        invalidDept,
        invalidProgram,
        duplicateEmail: (emailCounts.get(email) ?? 0) > 1,
      }
    })
    setPreviewRows(withFlags)
    setPreviewPage(0)
  }

  const handleFieldChange = (index: number, field: keyof Omit<UserCsvRow, "row">, value: string) => {
    if (!previewRows) return
    const next = [...previewRows]
    const updated = { ...next[index], [field]: value }

    if (field === "email") {
      updated.isNewUser = !existingEmails.has(value.toLowerCase().trim())
    }
    if (field === "departmentCode") {
      const deptId = deptMap.get(value.trim().toUpperCase())
      const isStudent = updated.role.toUpperCase().includes("STUDENT")
      updated.invalidDept = !deptId
      if (isStudent && updated.programCode.trim()) {
        const progCode = updated.programCode.trim().toUpperCase()
        const course = deptCourses.find((dc) => dc.code.toUpperCase() === progCode)
        if (course && deptId && course.departmentId !== deptId) {
          updated.invalidDept = true
          updated.invalidProgram = true
        } else if (!course) {
          updated.invalidDept = true
          updated.invalidProgram = true
        } else {
          updated.invalidProgram = false
        }
      }
    }
    if (field === "programCode") {
      const isStudent = updated.role.toUpperCase().includes("STUDENT")
      if (isStudent) {
        const progCode = value.trim().toUpperCase()
        const course = deptCourses.find((dc) => dc.code.toUpperCase() === progCode)
        const deptId = deptMap.get(updated.departmentCode.trim().toUpperCase())
        if (course && deptId && course.departmentId !== deptId) {
          updated.invalidDept = true
          updated.invalidProgram = true
        } else if (progCode && !course) {
          updated.invalidDept = true
          updated.invalidProgram = true
        } else {
          updated.invalidDept = !deptId
          updated.invalidProgram = false
        }
      }
    }
    if (field === "role") {
      const isStudent = value.toUpperCase().includes("STUDENT")
      if (isStudent) {
        const progCode = updated.programCode.trim().toUpperCase()
        const course = deptCourses.find((dc) => dc.code.toUpperCase() === progCode)
        const deptId = deptMap.get(updated.departmentCode.trim().toUpperCase())
        if (course && deptId && course.departmentId !== deptId) {
          updated.invalidDept = true
          updated.invalidProgram = true
        } else if (progCode && !course) {
          updated.invalidDept = true
          updated.invalidProgram = true
        } else {
          updated.invalidDept = !deptId
          updated.invalidProgram = false
        }
      } else {
        updated.invalidDept = !deptMap.get(updated.departmentCode.trim().toUpperCase())
        updated.invalidProgram = false
      }
    }

    next[index] = updated
    setPreviewRows(next)
  }

  const handleRemoveRow = (index: number) => {
    if (!previewRows) return
    const removed = previewRows[index]
    setRemovedRows((prev) => [
      ...prev,
      {
        row: removed.row,
        name: removed.name,
        email: removed.email,
        role: removed.role,
        departmentCode: removed.departmentCode,
        programCode: removed.programCode,
        employeeNo: removed.employeeNo,
      },
    ])
    const next = previewRows.filter((_, i) => i !== index)
    setPreviewRows(next)
    if (next.length === 0) {
      setRemovedRows([])
    } else if (Math.ceil(next.length / PREVIEW_PAGE_SIZE) <= previewPage) {
      setPreviewPage(Math.max(0, previewPage - 1))
    }
  }

  const handleConfirm = async () => {
    if (!previewRows || uploading) return
    setError("")
    setUploading(true)

    const submittedRows = previewRows.map((r) => ({
      name: r.name,
      email: r.email,
      role: r.role,
      department: r.departmentCode,
      program: r.programCode,
      employeeNo: r.employeeNo,
    }))

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: submittedRows }),
      })
      let data: Record<string, unknown>
      try {
        data = await res.json()
      } catch {
        const msg = `Upload failed — server returned an invalid response (${res.status})`
        setError(msg)
        dispatchToast(msg, "error")
        setUploading(false)
        return
      }
      if (!res.ok) {
        const errObj = data.error
        let serverMsg = ""
        if (typeof errObj === "string") {
          serverMsg = errObj
        } else if (errObj && typeof errObj === "object" && "message" in errObj) {
          const msg = String((errObj as { message: unknown }).message)
          const code = (errObj as { code?: string }).code
          const details = (errObj as { details?: string }).details
          const hint = (errObj as { hint?: string }).hint
          const parts = [msg]
          if (code) parts.push(`[${code}]`)
          if (details) parts.push(details)
          if (hint) parts.push(`Hint: ${hint}`)
          serverMsg = parts.join(" ")
        }
        setError(serverMsg || `Upload failed (HTTP ${res.status})`)
        dispatchToast(serverMsg || `Upload failed (HTTP ${res.status})`, "error")
        setUploading(false)
        return
      }
      const result = data as unknown as ImportResult
      setImportResult(result)
      setPreviewRows(null)
      dispatchToast(`Import complete — ${result.created} created, ${result.updated} updated, ${result.failed} failed`, "success")
      fetchReferenceData()
      onImportComplete?.()
    } catch {
      const msg = "Could not reach the server. Please check your connection and try again."
      setError(msg)
      dispatchToast(msg, "error")
    } finally {
      setUploading(false)
    }
  }

  const handleDownloadMergedFailures = () => {
    if (!importResult) return
    const csvHeaders = "name,email,role,department_code,program_code,employee_no,remarks"
    const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`

    const backendFailures = (importResult.failures || []).map(
      (f) => `${csvCell(f.name)},${csvCell(f.email)},${csvCell(f.role)},${csvCell(f.department)},${csvCell(f.program)},${csvCell(f.employeeNo)},${csvCell(f.remark)}`,
    )

    const removed = removedRows.map(
      (r) => `${csvCell(r.name)},${csvCell(r.email)},${csvCell(r.role)},${csvCell(r.departmentCode)},${csvCell(r.programCode)},${csvCell(r.employeeNo)},Removed by user`,
    )

    const all = [csvHeaders, ...backendFailures, ...removed]
    downloadBlob(all.join("\n"), "import-failures.csv")
  }

  const handleReset = () => {
    setImportResult(null)
    setRemovedRows([])
    setPreviewRows(null)
    setPreviewPage(0)
    setPreviewError("")
    setError("")
    if (fileRef.current) fileRef.current.value = ""
    fetchReferenceData()
  }

  const totalProcessed = importResult
    ? importResult.created + importResult.updated + importResult.failed
    : 0

  return (
    <>
      {uploading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white dark:bg-surface-dim rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-10 h-10 border-4 border-gold-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-secondary">Importing users...</p>
            <p className="text-xs text-tertiary">Please wait while we process your data.</p>
          </div>
        </div>
      )}

      {!previewRows && !importResult && (
        <div className="space-y-5">
          <div
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl bg-surface-dim/30 hover:bg-surface-dim/60 cursor-pointer transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-gold-100 dark:bg-gold-900/40 flex items-center justify-center">
              <svg className="w-6 h-6 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-secondary">Tap to choose a CSV file</p>
            <p className="text-xs text-tertiary">Headers: <code className="bg-surface-dim px-1.5 py-0.5 rounded text-[10px]">{TEMPLATE_HEADERS}</code></p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handlePreview}
            />
          </div>

          <button
            type="button"
            onClick={() => downloadBlob(`${TEMPLATE_HEADERS}\n${TEMPLATE_SAMPLE}`, "user-import-template.csv")}
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
          >
            <svg className="w-4 h-4 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Sample Template (.csv)
          </button>

          {previewError && <p className="text-sm font-medium text-red-600 text-center">{previewError}</p>}

          {refError && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{refError}</p>
            </div>
          )}
        </div>
      )}

      {previewRows && (
        <div className="flex flex-col h-full min-h-[24rem]">
          <div className="flex-1 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-secondary">
                {visibleRows.length} row{visibleRows.length !== 1 ? "s" : ""}
              </h4>
              <span className="text-[11px] text-tertiary">{TEMPLATE_HEADERS}</span>
            </div>

             <p className="text-[11px] text-tertiary/70 italic">
               <span className="badge-red not-italic">Red</span> must fix — remove those rows.
               <span className="badge-amber not-italic ml-1">Amber</span> new account will be created.
               <span className="badge-emerald not-italic ml-1">Green</span> existing user — will update.
             </p>

             {previewRows.length > 0 && (
             <div className="flex gap-2">
               <button
                 type="button"
                 onClick={() => setFilterIssue("all")}
                 className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${filterIssue === "all" ? "bg-gold-600 text-white border-gold-600" : "bg-surface-dim text-secondary border-default hover:bg-surface-dim/70"}`}
               >
                 All ({previewRows.length})
               </button>
               <button
                 type="button"
                 onClick={() => setFilterIssue("duplicate")}
                 className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${filterIssue === "duplicate" ? "bg-red-600 text-white border-red-600" : "bg-surface-dim text-secondary border-default hover:bg-surface-dim/70"}`}
               >
                 Duplicates ({previewRows.filter((r) => r.duplicateEmail).length})
               </button>
               <button
                 type="button"
                 onClick={() => setFilterIssue("invalid")}
                 className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${filterIssue === "invalid" ? "bg-red-600 text-white border-red-600" : "bg-surface-dim text-secondary border-default hover:bg-surface-dim/70"}`}
               >
                 Issues ({previewRows.filter((r) => r.invalidDept || r.invalidProgram).length})
               </button>
             </div>
             )}

             {error && <p className="text-xs font-medium text-red-600">{error}</p>}

            <div className="max-h-72 overflow-y-auto tbl-container tbl">
              <table>
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Dept Code</th>
                    <th>Program</th>
                    <th>Emp No</th>
                    <th>Status</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                   {paginatedRows.map((r) => {
                     const rowIdx = previewRows.indexOf(r)
                     const showEmpNo = isFaculty(r.role)
                     return (
                       <tr key={`${previewPage}-${r.row}`}>
                         <td className="text-tertiary">{r.row}</td>
                         <td>
                           <input
                             value={r.name}
                             onChange={(e) => handleFieldChange(rowIdx, "name", e.target.value)}
                             className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                           />
                         </td>
                         <td className="text-secondary text-[13px]">{r.email}</td>
                         <td>
                           <span className="inline-flex items-center px-2 py-1 rounded-full text-[12px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">{r.role}</span>
                         </td>
                         <td>
                           <input
                             value={r.departmentCode}
                             onChange={(e) => handleFieldChange(rowIdx, "departmentCode", e.target.value)}
                             className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                           />
                         </td>
                         <td>
                           {r.role.toUpperCase().includes("STUDENT") ? (
                             <input
                               value={r.programCode}
                               onChange={(e) => handleFieldChange(rowIdx, "programCode", e.target.value)}
                               className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                             />
                           ) : (
                             <span className="text-secondary text-[13px]">{r.programCode || "—"}</span>
                           )}
                         </td>
                         <td>
                           {showEmpNo ? (
                             <input
                               value={r.employeeNo}
                               onChange={(e) => handleFieldChange(rowIdx, "employeeNo", e.target.value)}
                               className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                             />
                           ) : (
                             <span className="text-tertiary text-[11px]">—</span>
                           )}
                         </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                          {r.invalidDept && <span className="badge-red text-[10px]">Incorrect Department Code</span>}
                          {r.invalidProgram && <span className="badge-red text-[10px]">Incorrect Program</span>}
                          {r.duplicateEmail && <span className="badge-red text-[10px]">Duplicate Email</span>}
                            {!r.invalidDept && !r.invalidProgram && r.isNewUser && (
                              <span className="badge-amber text-[10px]">New User</span>
                            )}
                            {!r.invalidDept && !r.invalidProgram && !r.isNewUser && (
                              <span className="badge-emerald text-[10px]">Will Update</span>
                            )}
                          </div>
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(rowIdx)}
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                            title="Remove row"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPreviewPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-tertiary">
                  Page {previewPage + 1} of {totalPreviewPages}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={previewPage === 0}
                    onClick={() => setPreviewPage((p) => p - 1)}
                    className="px-4 py-1.5 bg-surface-dim text-secondary rounded-full text-xs font-semibold hover:bg-surface-dim/70 disabled:opacity-40 transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={previewPage >= totalPreviewPages - 1}
                    onClick={() => setPreviewPage((p) => p + 1)}
                    className="px-4 py-1.5 bg-surface-dim text-secondary rounded-full text-xs font-semibold hover:bg-surface-dim/70 disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 pt-4 pb-1 bg-white dark:bg-surface-dim flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              className={`text-sm font-semibold px-4 py-3 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors ${previewOnly ? "w-full" : "flex-1"}`}
            >
              Cancel
            </button>
            {!previewOnly && (
              <button
                type="button"
                disabled={uploading || previewRows.length === 0 || blockedRows.length > 0}
                onClick={handleConfirm}
                className={`flex-1 text-sm font-semibold px-4 py-3 rounded-xl transition-colors ${
                  blockedRows.length > 0
                    ? "bg-red-400 text-white cursor-not-allowed"
                    : "bg-gold-600 text-white hover:bg-gold-700 disabled:opacity-40"
                }`}
              >
                {uploading
                  ? "Uploading..."
                  : blockedRows.length > 0
                    ? `${blockedRows.length} Error${blockedRows.length !== 1 ? "s" : ""} — Fix to import`
                    : `Import ${previewRows.length} Row${previewRows.length !== 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        </div>
      )}

      {importResult && !previewOnly && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-emerald-600">{importResult.created}</p>
              <p className="text-[11px] font-semibold text-emerald-700/70 dark:text-emerald-300/70">Users Created</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
              <p className="text-[11px] font-semibold text-blue-700/70 dark:text-blue-300/70">Users Updated</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-amber-600">{importResult.failed}</p>
              <p className="text-[11px] font-semibold text-amber-700/70 dark:text-amber-300/70">Failed</p>
            </div>
          </div>

          {(importResult.failed > 0 || removedRows.length > 0) && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-100 dark:border-amber-800/30">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  {importResult.failed + removedRows.length} Unprocessed Row{importResult.failed + removedRows.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="px-5 py-3 space-y-2 max-h-40 overflow-y-auto">
                {importResult.failures.map((f, i) => (
                  <p key={`bf-${i}`} className="text-xs text-amber-700 dark:text-amber-400">{f.email} — {f.remark}</p>
                ))}
                {removedRows.map((r, i) => (
                  <p key={`rr-${i}`} className="text-xs text-amber-700 dark:text-amber-400">{r.email} — Removed by user</p>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-amber-100 dark:border-amber-800/30">
                <button
                  type="button"
                  onClick={handleDownloadMergedFailures}
                  className="flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-300 transition-colors w-full"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Unprocessed Rows (.csv)
                </button>
              </div>
            </div>
          )}

          {importResult.failed === 0 && removedRows.length === 0 && totalProcessed > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-200 dark:bg-emerald-700 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-700 dark:text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">All {totalProcessed} rows processed successfully.</p>
            </div>
          )}

          <div className="space-y-2">
            {importResult.successCsv && (
              <button
                type="button"
                onClick={() => downloadBlob(importResult.successCsv, "import-successes.csv")}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-3 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
              >
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Successes (.csv)
              </button>
            )}
          </div>

          <button type="button" onClick={handleReset} className="w-full text-sm font-semibold px-4 py-3 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors">
            Clear
          </button>
        </div>
      )}
    </>
  )
}
