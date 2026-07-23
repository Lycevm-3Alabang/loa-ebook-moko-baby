"use client"

import { useState, useRef, useEffect } from "react"

interface FacultyCsvRow {
  row: number
  email: string
  name: string
  subjectCode: string
  subjectName: string
  section: string
}

interface CsvRowWithFlags extends FacultyCsvRow {
  isNewSubject: boolean
  isNewSection: boolean
  isNewTeacher: boolean
}

interface FacultyImportResult {
  matched: number
  errors: { row: number; email?: string; message: string }[]
  createdSubjects?: number
  createdSections: number
  parseErrors?: { row: number; message: string }[]
}

const TEMPLATE_HEADERS = "faculty email, name, section, subject code, subject name"
const TEMPLATE_SAMPLE = "juan.delacruz@lyceumalabang.edu.ph, Juan Dela Cruz, BSIT-32A3, CS101, Introduction to Computer Science\nmaria.santos@lyceumalabang.edu.ph, Maria Santos, BSCS-21B, MATH201, Calculus II"

function downloadBlob(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function parseClientCsv(text: string): { rows: FacultyCsvRow[]; error?: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], error: "CSV file is empty" }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const expected = ["faculty email", "name", "section", "subject code", "subject name"]
  if (headers.length < expected.length) {
    return { rows: [], error: `Expected headers: ${expected.join(", ")}` }
  }
  for (let i = 0; i < expected.length; i++) {
    if (headers[i] !== expected[i]) {
      return { rows: [], error: `Expected header "${expected[i]}" at column ${i + 1}, got "${headers[i]}"` }
    }
  }

  const rows: FacultyCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim())
    if (cols.length < 5) continue
    rows.push({
      row: i + 1,
      email: cols[0],
      name: cols[1],
      subjectCode: cols[3],
      section: cols[2],
      subjectName: cols[4],
    })
  }
  return { rows }
}

const PREVIEW_PAGE_SIZE = 50

export default function BulkFacultyImport({ departmentId, semesterId }: { departmentId?: string | null; semesterId?: string | null }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [previewRows, setPreviewRows] = useState<CsvRowWithFlags[] | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [previewError, setPreviewError] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [importResult, setImportResult] = useState<FacultyImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [removedRows, setRemovedRows] = useState<FacultyCsvRow[]>([])

  const [existingSubjects, setExistingSubjects] = useState<{ code: string }[]>([])
  const [existingSections, setExistingSections] = useState<{ name: string; program: string }[]>([])
  const [existingFacultyEmails, setExistingFacultyEmails] = useState<string[]>([])

  useEffect(() => {
    fetch("/api/import/faculties/reference")
      .then((r) => r.json())
      .then((d) => {
        setExistingSubjects((d.subjects || []).map((s: { code: string }) => ({ code: s.code })))
        setExistingSections((d.sections || []).map((s: { name: string; program: string }) => ({ name: s.name, program: s.program })))
        const faculties = (d.users || []).filter(
          (u: { role: string }) => u.role && (u.role.includes("FACULTY") || u.role.includes("DEAN")),
        )
        setExistingFacultyEmails(faculties.map((f: { email: string }) => f.email.toLowerCase()))
      })
      .catch(() => {})
  }, [])

  const paginatedRows = previewRows
    ? previewRows.slice(previewPage * PREVIEW_PAGE_SIZE, (previewPage + 1) * PREVIEW_PAGE_SIZE)
    : []
  const totalPreviewPages = previewRows ? Math.ceil(previewRows.length / PREVIEW_PAGE_SIZE) : 0

  const handlePreview = async () => {
    setPreviewError("")
    setError("")
    const file = fileRef.current?.files?.[0]
    if (!file) { setPreviewError("Please select a CSV file"); return }
    const text = await file.text()
    const { rows, error: parseError } = parseClientCsv(text)
    if (parseError) { setPreviewError(parseError); return }
    if (rows.length === 0) { setPreviewError("No valid rows found in CSV"); return }
    const withFlags: CsvRowWithFlags[] = rows.map((r) => {
      const dashIdx = r.section.indexOf("-")
      const spaceIdx = r.section.indexOf(" ")
      const idx = dashIdx !== -1 ? dashIdx : spaceIdx
      const sectionProgram = idx === -1 ? "" : r.section.slice(0, idx).trim()
      const sectionName = idx === -1 ? r.section : r.section.slice(idx + 1).trim()
      return {
        ...r,
        isNewSubject: !existingSubjects.some((s) => s.code === r.subjectCode),
        isNewSection: !existingSections.some((s) => s.name === sectionName && s.program === sectionProgram),
        isNewTeacher: !existingFacultyEmails.some((e) => e === r.email.toLowerCase()),
      }
    })
    setPreviewRows(withFlags)
    setPreviewPage(0)
  }

  const handleFieldChange = (index: number, field: "name" | "subjectCode" | "subjectName" | "section", value: string) => {
    if (!previewRows) return
    const next = [...previewRows]
    const updated = { ...next[index], [field]: value }
    if (field === "subjectCode") {
      updated.isNewSubject = !existingSubjects.some((s) => s.code === value)
    } else if (field === "section") {
      const dashIdx = value.indexOf("-")
      const spaceIdx = value.indexOf(" ")
      const idx = dashIdx !== -1 ? dashIdx : spaceIdx
      const sectionProgram = idx === -1 ? "" : value.slice(0, idx).trim()
      const sectionName = idx === -1 ? value : value.slice(idx + 1).trim()
      updated.isNewSection = !existingSections.some((s) => s.name === sectionName && s.program === sectionProgram)
    }
    next[index] = updated
    setPreviewRows(next)
  }

  const handleRemoveRow = (index: number) => {
    if (!previewRows) return
    const removed = previewRows[index]
    setRemovedRows((prev) => [...prev, { row: removed.row, email: removed.email, name: removed.name, subjectCode: removed.subjectCode, subjectName: removed.subjectName, section: removed.section }])
    const next = previewRows.filter((_, i) => i !== index)
    if (next.length === 0) {
      setPreviewRows(null)
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
      console.log("Importing rows:", previewRows, "/api/import/faculties with departmentId:", departmentId)
      const res = await fetch("/api/import/faculties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId,
          semesterId,
          rows: previewRows.map((r) => ({
            email: r.email,
            name: r.name,
            subjectCode: r.subjectCode,
            section: r.section,
            subjectName: r.subjectName,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Import failed"); setImporting(false); return }
      setImportResult(data as FacultyImportResult)
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
    ? (importResult.errors?.length || 0) + (importResult.parseErrors?.length || 0)
    : 0

  return (
    <>
      {importing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white dark:bg-surface-dim rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-10 h-10 border-4 border-gold-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-secondary">Importing faculty-subject mappings...</p>
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
              <li><strong>Subject code</strong> must match an existing subject or a new one will be created.</li>
              <li>Faculty email must be a valid, existing user account.</li>
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
            onClick={() => downloadBlob(`${TEMPLATE_HEADERS}\n${TEMPLATE_SAMPLE}`, "faculty-import-template.csv")}
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
                {previewRows.length} row{previewRows.length !== 1 ? "s" : ""}
              </h4>
              <span className="text-[11px] text-tertiary">{TEMPLATE_HEADERS}</span>
            </div>

            <p className="text-[11px] text-tertiary/70 italic">
              Items marked <span className="badge-amber not-italic">amber</span> will be newly created;
              existing subjects, sections, and faculty are reused as-is.
            </p>

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}

            <div className="max-h-72 overflow-y-auto tbl-container tbl">
              <table>
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Subject Code</th>
                    <th>Subject Name</th>
                    <th>Section</th>
                    <th>Will Create</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((r, i) => {
                    const absIdx = previewPage * PREVIEW_PAGE_SIZE + i
                    return (
                      <tr key={`${previewPage}-${i}`}>
                        <td className="text-tertiary">{r.row}</td>
                        <td className="text-secondary">{r.email}</td>
                        <td>
                          <input
                            value={r.name}
                            onChange={(e) => handleFieldChange(absIdx, "name", e.target.value)}
                            className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                          />
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
                            value={r.subjectName}
                            onChange={(e) => handleFieldChange(absIdx, "subjectName", e.target.value)}
                            disabled={!r.isNewSubject}
                            className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px] disabled:opacity-60"
                            title={!r.isNewSubject ? "Subject exists — name is read-only" : undefined}
                          />
                        </td>
                        <td>
                          <input
                            value={r.section}
                            onChange={(e) => handleFieldChange(absIdx, "section", e.target.value)}
                            className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                          />
                        </td>
                        <td className="whitespace-nowrap">
                          <div className="flex flex-wrap gap-1">
                            {r.isNewSubject && <span className="badge-amber">Subject</span>}
                            {r.isNewSection && <span className="badge-amber">Section</span>}
                            {r.isNewTeacher && <span className="badge-amber">Teacher</span>}
                            {!r.isNewSubject && !r.isNewSection && !r.isNewTeacher && <span className="badge-emerald">Faculty Loading Only</span>}
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
              className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading || previewRows.length === 0}
              onClick={handleConfirm}
              className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl bg-gold-600 text-white hover:bg-gold-700 disabled:opacity-40 transition-colors"
            >
              {loading ? "Importing..." : `Import ${previewRows.length} Row${previewRows.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {importResult && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-emerald-600">{importResult.matched}</p>
              <p className="text-[11px] font-semibold text-emerald-700/70 dark:text-emerald-300/70">Mappings Matched</p>
            </div>
            <div className="bg-gold-50 dark:bg-gold-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-gold-600">{importResult.createdSections}</p>
              <p className="text-[11px] font-semibold text-amber-700/70 dark:text-amber-300/70">New Sections</p>
            </div>
          </div>

          {(importResult.createdSubjects ?? 0) > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 text-center">
              <p className="text-lg font-bold text-blue-600">{importResult.createdSubjects} new subject{importResult.createdSubjects !== 1 ? "s" : ""} created</p>
            </div>
          )}

          {importResult.parseErrors && importResult.parseErrors.length > 0 && (
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

          {importResult.errors && importResult.errors.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-100 dark:border-amber-800/30">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{importResult.errors.length} Import Error{importResult.errors.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="px-5 py-3 space-y-2 max-h-40 overflow-y-auto">
                {importResult.errors.map((e, i) => (
                  <p key={`e-${i}`} className="text-xs text-amber-700 dark:text-amber-400">Row {e.row}: {e.email ? `${e.email} — ` : ""}{e.message}</p>
                ))}
              </div>
            </div>
          )}

          {totalErrors === 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-200 dark:bg-emerald-700 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-700 dark:text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">All {importResult.matched} row{importResult.matched !== 1 ? "s" : ""} imported successfully.</p>
            </div>
          )}

          {removedRows.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const headers = ["faculty email", "name", "section", "subject code", "subject name"]
                const csv = [headers.join(","), ...removedRows.map((r) => [r.email, r.name, r.section, r.subjectCode, r.subjectName].map((v) => `"${v}"`).join(","))].join("\n")
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

          <button type="button" onClick={handleReset} className="w-full text-sm font-semibold px-4 py-3 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors">
            Import Another File
          </button>
        </div>
      )}
    </>
  )
}
