"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { cleanCell, parseCsvRows } from "@/lib/csv-utils"

interface DeptCourseCsvRow {
  row: number
  departmentCode: string
  departmentName: string
  courseCode: string
  courseName: string
}

interface PreviewRow extends DeptCourseCsvRow {
  isNewDepartment: boolean
  isNewCourse: boolean
}

interface ImportResult {
  departmentsCreated: number
  departmentsSkipped: number
  coursesCreated: number
  coursesSkipped: number
  errors: { row: number; departmentCode: string; courseCode: string; message: string }[]
  totalRows: number
}

const TEMPLATE_HEADERS = "department code, department name, course code, course name"
const TEMPLATE_SAMPLE = "CCS, College of Computer Science, BSIT, Bachelor of Science in Information Technology\nCCS, College of Computer Science, BSCS, Bachelor of Computer Science"

function downloadBlob(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function parseClientCsv(text: string): { rows: DeptCourseCsvRow[]; error?: string } {
  const allRows = parseCsvRows(text)
  if (allRows.length < 2) return { rows: [], error: "CSV file is empty" }

  const headers = allRows[0].map((h) => h.trim().toLowerCase())
  const expected = ["department code", "department name", "course code", "course name"]

  if (headers.length < expected.length) {
    return { rows: [], error: `Expected headers: ${expected.join(", ")}` }
  }
  for (let i = 0; i < expected.length; i++) {
    if (headers[i] !== expected[i]) {
      return { rows: [], error: `Expected header "${expected[i]}" at column ${i + 1}, got "${headers[i]}"` }
    }
  }

  const rows: DeptCourseCsvRow[] = []
  for (let i = 1; i < allRows.length; i++) {
    const cols = allRows[i].map((c) => cleanCell(c))
    if (cols.length < 4) continue
    rows.push({
      row: i + 1,
      departmentCode: cols[0].toUpperCase(),
      departmentName: cols[1],
      courseCode: cols[2].toUpperCase(),
      courseName: cols[3],
    })
  }
  return { rows }
}

const PREVIEW_PAGE_SIZE = 50

export default function BulkDepartmentsCoursesImport({ previewOnly, onImportComplete }: { previewOnly?: boolean; onImportComplete?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [previewError, setPreviewError] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [problemFilter, setProblemFilter] = useState(false)
  const [removedRows, setRemovedRows] = useState<DeptCourseCsvRow[]>([])

  const [departments, setDepartments] = useState<{ id: string; code: string }[]>([])
  const [courses, setCourses] = useState<{ id: string; departmentId: string; code: string }[]>([])

  const fetchReferenceData = useCallback(async () => {
    try {
      const res = await fetch("/api/import/departments-courses/reference")
      if (!res.ok) return
      const d = await res.json()
      setDepartments((d.departments || []).map((x: { id: string; code: string }) => ({ id: x.id, code: x.code })))
      setCourses((d.departmentCourses || []).map((x: { id: string; departmentId: string; code: string }) => ({ id: x.id, departmentId: x.departmentId, code: x.code })))
    } catch { /* silent */ }
  }, [])

  useEffect(() => { Promise.resolve().then(() => fetchReferenceData()) }, [fetchReferenceData])

  const problemRows = useMemo(() => {
    if (!previewRows) return []
    return previewRows.filter((r) => r.isNewDepartment || r.isNewCourse)
  }, [previewRows])

  const visibleRows = problemFilter ? problemRows : previewRows ?? []
  const paginatedRows = visibleRows.slice(previewPage * PREVIEW_PAGE_SIZE, (previewPage + 1) * PREVIEW_PAGE_SIZE)
  const totalPreviewPages = Math.ceil(visibleRows.length / PREVIEW_PAGE_SIZE)

  const resolveRow = useCallback((r: DeptCourseCsvRow) => {
    const dept = departments.find((d) => d.code === r.departmentCode)
    const isNewDepartment = !dept
    const course = dept ? courses.find((c) => c.code === r.courseCode && c.departmentId === dept.id) : null
    return {
      ...r,
      isNewDepartment,
      isNewCourse: !dept || !course,
    }
  }, [departments, courses])

  const handlePreview = async () => {
    setPreviewError("")
    setError("")
    const file = fileRef.current?.files?.[0]
    if (!file) { setPreviewError("Please select a CSV file"); return }
    const text = await file.text()
    const { rows, error: parseError } = parseClientCsv(text)
    if (parseError) { setPreviewError(parseError); return }
    if (rows.length === 0) { setPreviewError("No valid rows found in CSV"); return }
    const withFlags: PreviewRow[] = rows.map((r) => resolveRow(r))
    setPreviewRows(withFlags)
    setPreviewPage(0)
  }

  const handleFieldChange = (index: number, field: "departmentCode" | "departmentName" | "courseCode" | "courseName", value: string) => {
    if (!previewRows) return
    const next = [...previewRows]
    const updated = { ...next[index], [field]: field === "courseCode" || field === "departmentCode" ? value.toUpperCase() : value }
    if (field === "departmentCode" || field === "courseCode") {
      const resolved = resolveRow(updated)
      Object.assign(updated, {
        isNewDepartment: resolved.isNewDepartment,
        isNewCourse: resolved.isNewCourse,
      })
    }
    next[index] = updated
    setPreviewRows(next)
  }

  const handleRemoveRow = (index: number) => {
    if (!previewRows) return
    const removed = previewRows[index]
    setRemovedRows((prev) => [...prev, { row: removed.row, departmentCode: removed.departmentCode, departmentName: removed.departmentName, courseCode: removed.courseCode, courseName: removed.courseName }])
    const next = previewRows.filter((_, i) => i !== index)
    if (next.length === 0) {
      setRemovedRows([])
    } else {
      setPreviewRows(next)
      if (Math.ceil(next.length / PREVIEW_PAGE_SIZE) <= previewPage) {
        setPreviewPage(Math.max(0, previewPage - 1))
      }
    }
  }

  const handleConfirm = async () => {
    if (!previewRows || loading) return
    setError("")
    setImporting(true)
    setLoading(true)

    try {
      const res = await fetch("/api/import/departments-courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: previewRows.map((r) => ({
            departmentCode: r.departmentCode,
            departmentName: r.departmentName,
            courseCode: r.courseCode,
            courseName: r.courseName,
          })),
        }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(d.error || `HTTP ${res.status}`)
      }

      const data: ImportResult = await res.json()
      data.totalRows = previewRows.length
      setImportResult(data)
      setPreviewRows(null)
      onImportComplete?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
      setImporting(false)
    }
  }

  const handleReset = () => {
    setImportResult(null)
    setPreviewRows(null)
    setPreviewPage(0)
    setPreviewError("")
    setError("")
    if (fileRef.current) fileRef.current.value = ""
  }

  const totalErrors = importResult ? importResult.errors.length : 0

  return (
    <>
      {importing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white dark:bg-surface-dim rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-10 h-10 border-4 border-gold-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-secondary">Importing departments & courses...</p>
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
            onClick={() => downloadBlob(`${TEMPLATE_HEADERS}\n${TEMPLATE_SAMPLE}`, "departments-courses-import-template.csv")}
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
          >
            <svg className="w-4 h-4 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Sample Template (.csv)
          </button>

          {previewError && <p className="text-sm font-medium text-red-600 text-center">{previewError}</p>}
        </div>
      )}

      {previewRows && (
        <div className="flex flex-col h-full min-h-[24rem]">
          <div className="flex-1 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-secondary">
                {visibleRows.length} row{visibleRows.length !== 1 ? "s" : ""}
                {problemFilter && ` (filtered)`}
              </h4>
              <span className="text-[11px] text-tertiary">{TEMPLATE_HEADERS}</span>
            </div>

            <div className="flex items-center gap-3">
              <p className="text-[11px] text-tertiary/70 italic">
                <span className="badge-red not-italic">Red</span> must fix — department or course not found.
                <span className="badge-amber not-italic ml-1">Amber</span> new item will be created.
              </p>
              <div className="ml-auto">
                {problemRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setProblemFilter((p) => !p); setPreviewPage(0) }}
                    className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${
                      problemFilter
                        ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
                        : "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                    }`}
                  >
                    {problemFilter ? "Show all rows" : `Show problems only`}
                  </button>
                )}
              </div>
            </div>

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}

            <div className="max-h-72 overflow-y-auto tbl-container tbl">
              <table>
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Dept Code</th>
                    <th>Dept Name</th>
                    <th>Course Code</th>
                    <th>Course Name</th>
                    <th>Status</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((r, i) => {
                    const absIdx = previewPage * PREVIEW_PAGE_SIZE + i
                    return (
                      <tr key={`${previewPage}-${i}`}>
                        <td className="text-tertiary">{previewPage * PREVIEW_PAGE_SIZE + i + 1}</td>
                        <td>
                          <input
                            value={r.departmentCode}
                            onChange={(e) => handleFieldChange(absIdx, "departmentCode", e.target.value)}
                            className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                          />
                        </td>
                        <td>
                          <input
                            value={r.departmentName}
                            onChange={(e) => handleFieldChange(absIdx, "departmentName", e.target.value)}
                            className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                          />
                        </td>
                        <td>
                          <input
                            value={r.courseCode}
                            onChange={(e) => handleFieldChange(absIdx, "courseCode", e.target.value)}
                            className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                          />
                        </td>
                        <td>
                          <input
                            value={r.courseName}
                            onChange={(e) => handleFieldChange(absIdx, "courseName", e.target.value)}
                            className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                          />
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {r.isNewDepartment && <span className="badge-red text-[10px]">New Dept</span>}
                            {!r.isNewDepartment && r.isNewCourse && <span className="badge-amber text-[10px]">New Course</span>}
                            {!r.isNewDepartment && !r.isNewCourse && (
                              <span className="badge-emerald text-[10px]">Exists</span>
                            )}
                          </div>
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(absIdx)}
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
                disabled={loading || previewRows.length === 0}
                onClick={handleConfirm}
                className={`flex-1 text-sm font-semibold px-4 py-3 rounded-xl transition-colors ${
                  loading
                    ? "bg-gold-400 text-white cursor-not-allowed"
                    : "bg-gold-600 text-white hover:bg-gold-700 disabled:opacity-40"
                }`}
              >
                {loading
                  ? "Importing..."
                  : `Import ${previewRows.length} Row${previewRows.length !== 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        </div>
      )}

      {removedRows.length > 0 && (
        <div className="space-y-5">
          <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl px-5 py-4 space-y-2">
            <p className="text-sm font-semibold text-secondary">{removedRows.length} row{removedRows.length !== 1 ? "s" : ""} removed — you can download them to correct and re-upload.</p>
            <button
              type="button"
              onClick={() => {
                const csv = [TEMPLATE_HEADERS, ...removedRows.map((r) => [r.departmentCode, r.departmentName, r.courseCode, r.courseName].map((v) => `"${v}"`).join(","))].join("\n")
                downloadBlob(csv, "removed-rows.csv")
              }}
              className="flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
            >
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Removed (.csv)
            </button>
          </div>
        </div>
      )}

      {importResult && !previewOnly && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-emerald-600">{importResult.departmentsCreated}</p>
              <p className="text-[11px] font-semibold text-emerald-700/70 dark:text-emerald-300/70">Departments Created</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-emerald-600">{importResult.coursesCreated}</p>
              <p className="text-[11px] font-semibold text-emerald-700/70 dark:text-emerald-300/70">Courses Created</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-blue-600">{importResult.departmentsSkipped}</p>
              <p className="text-[11px] font-semibold text-blue-700/70 dark:text-blue-300/70">Departments Skipped (exist)</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-blue-600">{importResult.coursesSkipped}</p>
              <p className="text-[11px] font-semibold text-blue-700/70 dark:text-blue-300/70">Courses Skipped (exist)</p>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-100 dark:border-amber-800/30">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{importResult.errors.length} Error{importResult.errors.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="px-5 py-3 space-y-2 max-h-40 overflow-y-auto">
                {importResult.errors.map((e, i) => (
                  <p key={`e-${i}`} className="text-xs text-amber-700 dark:text-amber-400">Row {e.row}: {e.departmentCode}/{e.courseCode} — {e.message}</p>
                ))}
              </div>
            </div>
          )}

          {totalErrors === 0 && importResult.departmentsCreated + importResult.coursesCreated > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-200 dark:bg-emerald-700 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-700 dark:text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">All {importResult.totalRows} rows processed successfully.</p>
            </div>
          )}

          <button type="button" onClick={handleReset} className="w-full text-sm font-semibold px-4 py-3 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors">
            Import Another File
          </button>
        </div>
      )}
    </>
  )
}
