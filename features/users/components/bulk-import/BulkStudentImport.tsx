"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"

interface StudentCsvRow {
  row: number
  email: string
  name: string
  subjectCode: string
  section: string
  facultyEmail: string
  departmentCode: string
}

interface PreviewRow extends StudentCsvRow {
  isNewSubject: boolean
  isNewSection: boolean
  isNewFaculty: boolean
  facultyNotAssigned: boolean
  isNewStudent: boolean
  isInvalidDepartment: boolean
  resolvedDepartmentId: string | null
}

interface ImportResult {
  created: { name: string; email: string; role: string }[]
  enrolled: number
  failed: { row: number; email: string; subjectCode: string; section: string; remark: string }[]
  parseErrors: { row: number; message: string }[]
  successCsv: string
  failureCsv: string
  totalRows: number
}

const TEMPLATE_HEADERS = "name, email, subject code, section, faculty email, department code"
const TEMPLATE_SAMPLE = "Alice Student, alice.student@itmlyceumalabang.onmicrosoft.com, CS101, BSIT-32A3, juan.delacruz@lyceumalabang.edu.ph, CCS\nBob Martinez, bob.martinez@itmlyceumalabang.onmicrosoft.com, MATH201, BSCS-21B, maria.santos@lyceumalabang.edu.ph, CCS"

function downloadBlob(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function parseClientCsv(text: string): { rows: StudentCsvRow[]; error?: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], error: "CSV file is empty" }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const expected = ["name", "email", "subject code", "section", "faculty email", "department code"]

  if (headers.length < expected.length - 1) {
    return { rows: [], error: `Expected headers: ${expected.join(", ")}` }
  }
  for (let i = 0; i < Math.min(headers.length, expected.length); i++) {
    if (headers[i] !== expected[i]) {
      return { rows: [], error: `Expected header "${expected[i]}" at column ${i + 1}, got "${headers[i]}"` }
    }
  }

  const rows: StudentCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim())
    if (cols.length < 5) continue
    rows.push({
      row: i + 1,
      name: cols[0],
      email: cols[1],
      subjectCode: cols[2],
      section: cols[3],
      facultyEmail: cols[4],
      departmentCode: cols[5]?.toUpperCase().trim() || "",
    })
  }
  return { rows }
}

const PREVIEW_PAGE_SIZE = 50

export default function BulkStudentImport({ departmentId: _departmentId, semesterId, previewOnly }: { departmentId?: string | null; semesterId?: string | null; previewOnly?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [previewError, setPreviewError] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [problemFilter, setProblemFilter] = useState(false)
  const [removedRows, setRemovedRows] = useState<StudentCsvRow[]>([])

  const [existingSubjects, setExistingSubjects] = useState<{ code: string; id: string }[]>([])
  const [existingSections, setExistingSections] = useState<{ name: string; departmentCourseId: string; id: string }[]>([])
  const [existingUsers, setExistingUsers] = useState<{ email: string }[]>([])
  const [existingFacultyUsers, setExistingFacultyUsers] = useState<{ email: string; id: string }[]>([])
  const [existingFacultySubjects, setExistingFacultySubjects] = useState<{ subject_id: string; section_id: string; faculty_id: string; id: string }[]>([])
  const [existingDCourses, setExistingDCourses] = useState<{ code: string; id: string }[]>([])
  const [existingDepartments, setExistingDepartments] = useState<{ code: string; id: string }[]>([])

  const fetchReferenceData = useCallback(async () => {
    try {
      const res = await fetch("/api/import/students/reference")
      if (!res.ok) return
      const d = await res.json()
      setExistingSubjects(d.subjects || [])
      setExistingSections(d.sections || [])
      const allUsers: { email: string; role: string; id: string }[] = d.users || []
      setExistingUsers(allUsers.map((u) => ({ email: u.email })))
      setExistingFacultyUsers(
        allUsers
          .filter((u) => u.role && (u.role.includes("FACULTY") || u.role.includes("DEAN")))
          .map((u) => ({ email: u.email, id: u.id })),
      )
      setExistingFacultySubjects(d.facultySubjects || [])
      setExistingDCourses((d.departmentCourses || []).map((c: { code: string; id: string }) => ({ code: c.code, id: c.id })))
      setExistingDepartments((d.departments || []).map((c: { code: string; id: string }) => ({ code: c.code, id: c.id })))
    } catch { /* silent */ }
  }, [])

  useEffect(() => { Promise.resolve().then(() => fetchReferenceData()) }, [fetchReferenceData])

  const blockedRows = useMemo(() => {
    if (!previewRows) return []
    return previewRows.filter((r) => r.isNewSubject || r.isNewSection || r.isNewFaculty || r.facultyNotAssigned || r.isInvalidDepartment)
  }, [previewRows])

  const problemRows = useMemo(() => {
    if (!previewRows) return []
    return previewRows.filter((r) => r.isNewSubject || r.isNewSection || r.isNewFaculty || r.facultyNotAssigned || r.isNewStudent || r.isInvalidDepartment)
  }, [previewRows])

  const visibleRows = problemFilter ? problemRows : previewRows ?? []
  const paginatedRows = visibleRows.slice(previewPage * PREVIEW_PAGE_SIZE, (previewPage + 1) * PREVIEW_PAGE_SIZE)
  const totalPreviewPages = Math.ceil(visibleRows.length / PREVIEW_PAGE_SIZE)

  const resolveSection = useCallback((raw: string) => {
    const dashIdx = raw.indexOf("-")
    const spaceIdx = raw.indexOf(" ")
    const idx = dashIdx !== -1 ? dashIdx : spaceIdx
    const courseCode = idx === -1 ? "" : raw.slice(0, idx).trim()
    const sectionName = idx === -1 ? raw : raw.slice(idx + 1).trim()
    const dCourse = existingDCourses.find((dc) => dc.code === courseCode)
    const section = dCourse
      ? existingSections.find((s) => s.name === sectionName && s.departmentCourseId === dCourse.id)
      : null
    return { section: section ?? null, isNewSection: !dCourse || !section }
  }, [existingDCourses, existingSections])

  const resolveDepartment = useCallback((code: string) => {
    if (!code) return { departmentId: null, isInvalid: true }
    const dept = existingDepartments.find((d) => d.code === code.toUpperCase().trim())
    return { departmentId: dept?.id ?? null, isInvalid: !dept }
  }, [existingDepartments])

  const handlePreview = async () => {
    setPreviewError("")
    setError("")
    const file = fileRef.current?.files?.[0]
    if (!file) { setPreviewError("Please select a CSV file"); return }
    const text = await file.text()
    const { rows, error: parseError } = parseClientCsv(text)
    if (parseError) { setPreviewError(parseError); return }
    if (rows.length === 0) { setPreviewError("No valid rows found in CSV"); return }
    const withFlags: PreviewRow[] = rows.map((r) => {
      const { section: sec, isNewSection } = resolveSection(r.section)
      const isNewSubject = !existingSubjects.some((s) => s.code === r.subjectCode)
      const fe = r.facultyEmail.toLowerCase().trim()
      const isNewFaculty = !existingFacultyUsers.some((u) => u.email === fe)
      const isNewStudent = !existingUsers.some((u) => u.email === r.email.toLowerCase().trim())
      const { departmentId: resolvedDepartmentId, isInvalid: isInvalidDepartment } = resolveDepartment(r.departmentCode)
      let facultyNotAssigned = false
      if (!isNewSubject && !isNewSection && !isNewFaculty) {
        const sub = existingSubjects.find((s) => s.code === r.subjectCode)
        const fac = existingFacultyUsers.find((u) => u.email === fe)
        if (sub && sec && fac) {
          facultyNotAssigned = !existingFacultySubjects.some(
            (fs) => fs.subject_id === sub.id && fs.section_id === sec.id && fs.faculty_id === fac.id,
          )
        }
      }
      return { ...r, isNewSubject, isNewSection, isNewFaculty, facultyNotAssigned, isNewStudent, isInvalidDepartment, resolvedDepartmentId }
    })
    setPreviewRows(withFlags)
    setPreviewPage(0)
  }

  const handleFieldChange = (index: number, field: "name" | "subjectCode" | "section" | "facultyEmail" | "departmentCode", value: string) => {
    if (!previewRows) return
    const next = [...previewRows]
    const updated = { ...next[index], [field]: value }
    if (field === "subjectCode" || field === "section" || field === "facultyEmail" || field === "departmentCode") {
      const { section: sec, isNewSection } = resolveSection(updated.section)
      updated.isNewSubject = !existingSubjects.some((s) => s.code === updated.subjectCode)
      updated.isNewSection = isNewSection
      const fe = updated.facultyEmail.toLowerCase().trim()
      updated.isNewFaculty = !existingFacultyUsers.some((u) => u.email === fe)
      updated.isNewStudent = !existingUsers.some((u) => u.email === updated.email.toLowerCase().trim())
      const dept = resolveDepartment(updated.departmentCode)
      updated.isInvalidDepartment = dept.isInvalid
      updated.resolvedDepartmentId = dept.departmentId
      updated.facultyNotAssigned = false
      if (!updated.isNewSubject && !updated.isNewSection && !updated.isNewFaculty) {
        const sub = existingSubjects.find((s) => s.code === updated.subjectCode)
        const fac = existingFacultyUsers.find((u) => u.email === fe)
        if (sub && sec && fac) {
          updated.facultyNotAssigned = !existingFacultySubjects.some(
            (fs) => fs.subject_id === sub.id && fs.section_id === sec.id && fs.faculty_id === fac.id,
          )
        }
      }
    }
    next[index] = updated
    setPreviewRows(next)
  }

  const handleRemoveRow = (index: number) => {
    if (!previewRows) return
    const removed = previewRows[index]
    setRemovedRows((prev) => [...prev, { row: removed.row, email: removed.email, name: removed.name, subjectCode: removed.subjectCode, section: removed.section, facultyEmail: removed.facultyEmail, departmentCode: removed.departmentCode }])
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
      const res = await fetch("/api/import/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          semesterId,
          rows: previewRows.map((r) => ({
            email: r.email,
            name: r.name,
            subjectCode: r.subjectCode,
            section: r.section,
            facultyEmail: r.facultyEmail || undefined,
            departmentId: r.resolvedDepartmentId || undefined,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Import failed"); setImporting(false); return }
      setImportResult(data as ImportResult)
      setPreviewRows(null)
    } catch {
      setError("Network error")
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

  const totalErrors = importResult
    ? importResult.failed.length + importResult.parseErrors.length
    : 0

  return (
    <>
      {importing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white dark:bg-surface-dim rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-10 h-10 border-4 border-gold-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-secondary">Importing student enrollments...</p>
            <p className="text-xs text-tertiary">Please wait while we process your data.</p>
          </div>
        </div>
      )}

      {!previewRows && !importResult && (
        <div className="space-y-5">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">CSV Format Hints</p>
            <ul className="text-[11px] text-blue-600/80 dark:text-blue-300/70 space-y-0.5">
              <li><strong>Section</strong> column must use format: <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">PROGRAM-SECTION</code> or <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">PROGRAM SECTION</code> (e.g., <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">BSIT-32A3</code> or <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">BSIT 32A3</code>)</li>
              <li><strong>Subject code</strong> must match an existing subject — unknown codes will block the row.</li>
              <li><strong>Faculty email</strong> must be an existing faculty/dean user assigned to that subject+section.</li>
              <li><strong>Department code</strong> must match an existing department (e.g., <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">CCS</code>).</li>
            </ul>
          </div>

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
            onClick={() => downloadBlob(`${TEMPLATE_HEADERS}\n${TEMPLATE_SAMPLE}`, "student-import-template.csv")}
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
                <span className="badge-red not-italic">Red</span> must fix — remove those rows.
                <span className="badge-amber not-italic ml-1">Amber</span> student account will be created.
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
                    {problemFilter ? "Show all rows" : `Show ${blockedRows.length} blocked only`}
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
                    <th>Student</th>
                    <th>Subject Code</th>
                    <th>Section</th>
                    <th>Faculty Email</th>
                    <th>Dept</th>
                    <th>Will Create</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((r, i) => {
                    const absIdx = previewPage * PREVIEW_PAGE_SIZE + i
                    return (
                      <tr key={`${previewPage}-${i}`}>
                        <td className="text-tertiary">{previewPage * PREVIEW_PAGE_SIZE + i + 1}</td>
                        <td className="text-secondary text-[13px] whitespace-nowrap">
                          {r.name} <span className="text-tertiary">({r.email})</span>
                        </td>
                        <td>
                          <input
                            value={r.subjectCode}
                            onChange={(e) => handleFieldChange(absIdx, "subjectCode", e.target.value)}
                            className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                          />
                        </td>
                        <td>
                          <input
                            value={r.section}
                            onChange={(e) => handleFieldChange(absIdx, "section", e.target.value)}
                            className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                          />
                        </td>
                        <td>
                          <input
                            value={r.facultyEmail}
                            onChange={(e) => handleFieldChange(absIdx, "facultyEmail", e.target.value)}
                            className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                          />
                        </td>
                        <td>
                          <input
                            value={r.departmentCode}
                            onChange={(e) => handleFieldChange(absIdx, "departmentCode", e.target.value.toUpperCase())}
                            className={`w-16 bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px] uppercase ${r.isInvalidDepartment ? "text-red-600" : ""}`}
                          />
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {r.isInvalidDepartment && <span className="badge-red text-[10px]">Dept code</span>}
                            {!r.isInvalidDepartment && r.isNewSubject && <span className="badge-red text-[10px]">Subject not found</span>}
                            {!r.isInvalidDepartment && r.isNewSection && <span className="badge-red text-[10px]">Section not found</span>}
                            {!r.isInvalidDepartment && r.isNewFaculty && <span className="badge-red text-[10px]">Faculty not found</span>}
                            {!r.isInvalidDepartment && r.facultyNotAssigned && <span className="badge-red text-[10px]">Faculty Loading Mismatch</span>}
                            {!r.isInvalidDepartment && r.isNewStudent && !r.isNewSubject && !r.isNewSection && !r.isNewFaculty && !r.facultyNotAssigned && (
                              <span className="badge-amber text-[10px]">New Student</span>
                            )}
                            {!r.isInvalidDepartment && !r.isNewSubject && !r.isNewSection && !r.isNewFaculty && !r.facultyNotAssigned && !r.isNewStudent && (
                              <span className="badge-emerald text-[10px]">Ready</span>
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
                disabled={loading || previewRows.length === 0 || blockedRows.length > 0}
                onClick={handleConfirm}
                className={`flex-1 text-sm font-semibold px-4 py-3 rounded-xl transition-colors ${
                  blockedRows.length > 0
                    ? "bg-red-400 text-white cursor-not-allowed"
                    : "bg-gold-600 text-white hover:bg-gold-700 disabled:opacity-40"
                }`}
              >
                {loading
                  ? "Importing..."
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
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-emerald-600">{importResult.created.length}</p>
              <p className="text-[11px] font-semibold text-emerald-700/70 dark:text-emerald-300/70">Users Created</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-blue-600">{importResult.enrolled}</p>
              <p className="text-[11px] font-semibold text-blue-700/70 dark:text-blue-300/70">Enrollments</p>
            </div>
          </div>

          {importResult.parseErrors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-red-100 dark:border-red-800/30">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">{importResult.parseErrors.length} Parse Error{importResult.parseErrors.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="px-5 py-3 space-y-2 max-h-40 overflow-y-auto">
                {importResult.parseErrors.map((e, i) => (
                  <p key={`pe-${i}`} className="text-xs text-red-600 dark:text-red-400">Row {e.row}: {e.message}</p>
                ))}
              </div>
            </div>
          )}

          {importResult.failed.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-100 dark:border-amber-800/30">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{importResult.failed.length} Import Failure{importResult.failed.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="px-5 py-3 space-y-2 max-h-40 overflow-y-auto">
                {importResult.failed.map((f, i) => (
                  <p key={`f-${i}`} className="text-xs text-amber-700 dark:text-amber-400">Row {f.row}: {f.email} — {f.remark}</p>
                ))}
              </div>
            </div>
          )}

          {totalErrors === 0 && importResult.enrolled > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-200 dark:bg-emerald-700 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-700 dark:text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">All {importResult.totalRows} rows processed successfully.</p>
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
            {removedRows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const headers = ["name", "email", "subject code", "section", "faculty email", "department code"]
                  const csv = [headers.join(","), ...removedRows.map((r) => [r.name, r.email, r.subjectCode, r.section, r.facultyEmail, r.departmentCode].map((v) => `"${v}"`).join(","))].join("\n")
                  downloadBlob(csv, "removed-rows.csv")
                }}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-3 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
              >
                <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Removed (.csv)
              </button>
            )}
            {importResult.failureCsv && (
              <button
                type="button"
                onClick={() => downloadBlob(importResult.failureCsv, "import-failures.csv")}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-3 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
              >
                <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Failures (.csv)
              </button>
            )}
          </div>

          <button type="button" onClick={handleReset} className="w-full text-sm font-semibold px-4 py-3 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors">
            Import Another File
          </button>
        </div>
      )}
    </>
  )
}
