"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { cleanCell } from "@/lib/csv-utils"

interface SubjectCsvRow {
  row: number
  code: string
  name: string
}

interface PreviewRow extends SubjectCsvRow {
  isNew: boolean
  nameChanged: boolean
}

interface ImportResult {
  created: number
  updated: number
  skipped: number
  failed: { row: number; subjectCode: string; remark: string }[]
  parseErrors: { row: number; message: string }[]
  successCsv: string
  failureCsv: string
  totalRows: number
}

const TEMPLATE_HEADERS = "code, name"
const TEMPLATE_SAMPLE = "CS101, Introduction to Computer Science\nMATH201, Calculus II"

function downloadBlob(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function parseClientCsv(text: string): { rows: SubjectCsvRow[]; error?: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], error: "CSV file is empty" }

  const headers = lines[0].split(",").map((h) => cleanCell(h).toLowerCase())
  const expected = ["code", "name"]

  if (headers.length < expected.length) {
    return { rows: [], error: `Expected headers: ${expected.join(", ")}` }
  }
  for (let i = 0; i < expected.length; i++) {
    if (headers[i] !== expected[i]) {
      return { rows: [], error: `Expected header "${expected[i]}" at column ${i + 1}, got "${headers[i]}"` }
    }
  }

  const rows: SubjectCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => cleanCell(c))
    if (cols.length < 2) continue
    const code = cols[0].toUpperCase()
    const name = cols[1]
    if (!code || !name) continue
    rows.push({ row: i + 1, code, name })
  }
  return { rows }
}

const PREVIEW_PAGE_SIZE = 50

export default function BulkSubjectImport({ previewOnly, onImportComplete }: { previewOnly?: boolean; onImportComplete?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [previewError, setPreviewError] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [problemFilter, setProblemFilter] = useState(false)
  const [removedRows, setRemovedRows] = useState<SubjectCsvRow[]>([])

  const [existingSubjects, setExistingSubjects] = useState<{ id: string; code: string; name: string }[]>([])

  const fetchReferenceData = useCallback(async () => {
    try {
      const res = await fetch("/api/import/subjects/reference")
      if (!res.ok) return
      const d = await res.json()
      setExistingSubjects(d.subjects || [])
    } catch { /* silent */ }
  }, [])

  useEffect(() => { Promise.resolve().then(() => fetchReferenceData()) }, [fetchReferenceData])

  const problemRows = useMemo(() => {
    if (!previewRows) return []
    return previewRows.filter((r) => r.isNew || r.nameChanged)
  }, [previewRows])

  const visibleRows = problemFilter ? problemRows : previewRows ?? []
  const paginatedRows = visibleRows.slice(previewPage * PREVIEW_PAGE_SIZE, (previewPage + 1) * PREVIEW_PAGE_SIZE)
  const totalPreviewPages = Math.ceil(visibleRows.length / PREVIEW_PAGE_SIZE)

  const resolveRow = useCallback((r: SubjectCsvRow) => {
    const existing = existingSubjects.find((s) => s.code === r.code)
    return {
      ...r,
      isNew: !existing,
      nameChanged: existing ? existing.name !== r.name : false,
    }
  }, [existingSubjects])

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

  const handleFieldChange = (index: number, field: "code" | "name", value: string) => {
    if (!previewRows) return
    const next = [...previewRows]
    const updated = { ...next[index], [field]: field === "code" ? value.toUpperCase() : value }
    const resolved = resolveRow(updated)
    Object.assign(updated, {
      isNew: resolved.isNew,
      nameChanged: resolved.nameChanged,
    })
    next[index] = updated
    setPreviewRows(next)
  }

  const handleRemoveRow = (index: number) => {
    if (!previewRows) return
    const removed = previewRows[index]
    setRemovedRows((prev) => [...prev, { row: removed.row, code: removed.code, name: removed.name }])
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

    const actionRows = previewRows.filter((r) => r.isNew || r.nameChanged)
    const skipped = previewRows.length - actionRows.length
    const created: number[] = []
    const updated: number[] = []
    const failed: ImportResult["failed"] = []

    try {
      const results = await Promise.allSettled(
        actionRows.map(async (r) => {
          if (r.isNew) {
            const res = await fetch("/api/admin/subjects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: r.code, name: r.name }),
            })
            if (res.status === 409) return "skipped"
            if (!res.ok) {
              const body = await res.json().catch(() => ({ error: "Unknown error" }))
              throw new Error(body.error || `HTTP ${res.status}`)
            }
            return "created"
          } else {
            const existing = existingSubjects.find((s) => s.code === r.code)
            if (!existing) throw new Error("Subject not found")
            const res = await fetch(`/api/admin/subjects/${existing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: r.code, name: r.name }),
            })
            if (!res.ok) {
              const body = await res.json().catch(() => ({ error: "Unknown error" }))
              throw new Error(body.error || `HTTP ${res.status}`)
            }
            return "updated"
          }
        }),
      )

      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        const row = actionRows[i]
        if (r.status === "fulfilled") {
          if (r.value === "created") created.push(row.row)
          else if (r.value === "updated") updated.push(row.row)
        } else {
          failed.push({ row: row.row, subjectCode: row.code, remark: r.reason?.message || "Network error" })
        }
      }

      const successLines = [...created, ...updated].sort((a, b) => a - b).map((idx) => {
        const r = actionRows.find((nr) => nr.row === idx)
        return r ? [r.code, r.name].map((v) => `"${v}"`).join(",") : ""
      }).filter(Boolean)
      const failureLines = failed.map((f) => `"${f.subjectCode}","${f.remark}"`)

      setImportResult({
        created: created.length,
        updated: updated.length,
        skipped,
        failed,
        parseErrors: [],
        totalRows: previewRows.length,
        successCsv: [TEMPLATE_HEADERS, ...successLines].join("\n"),
        failureCsv: ["code, remark", ...failureLines].join("\n"),
      })
      setPreviewRows(null)
      onImportComplete?.()
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
            <p className="text-sm font-semibold text-secondary">Importing subjects...</p>
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
            onClick={() => downloadBlob(`${TEMPLATE_HEADERS}\n${TEMPLATE_SAMPLE}`, "subject-import-template.csv")}
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
                <span className="badge-amber not-italic">Amber</span> new subject will be created.
                <span className="badge-blue not-italic ml-1">Blue</span> name will be updated.
                <span className="badge-emerald not-italic ml-1">Green</span> already exists.
              </p>
              <div className="ml-auto">
                {problemRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setProblemFilter((p) => !p); setPreviewPage(0) }}
                    className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${
                      problemFilter
                        ? "bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
                        : "border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {problemFilter ? "Show all rows" : `Show ${problemRows.length} action needed`}
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
                    <th>Code</th>
                    <th>Name</th>
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
                            value={r.code}
                            onChange={(e) => handleFieldChange(absIdx, "code", e.target.value)}
                            className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px] font-mono"
                          />
                        </td>
                        <td>
                          <input
                            value={r.name}
                            onChange={(e) => handleFieldChange(absIdx, "name", e.target.value)}
                            className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px]"
                          />
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {r.isNew && <span className="badge-amber text-[10px]">New Subject</span>}
                            {!r.isNew && r.nameChanged && <span className="badge-blue text-[10px]">Name Update</span>}
                            {!r.isNew && !r.nameChanged && <span className="badge-emerald text-[10px]">Exists</span>}
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
                className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl bg-gold-600 text-white hover:bg-gold-700 disabled:opacity-40 transition-colors"
              >
                {loading
                  ? "Importing..."
                  : `Import ${problemRows.length} Row${problemRows.length !== 1 ? "s" : ""}`}
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
              <p className="text-[11px] font-semibold text-emerald-700/70 dark:text-emerald-300/70">Created</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
              <p className="text-[11px] font-semibold text-blue-700/70 dark:text-blue-300/70">Updated</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-secondary">{importResult.skipped}</p>
              <p className="text-[11px] font-semibold text-tertiary">Unchanged</p>
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
                  <p key={`f-${i}`} className="text-xs text-amber-700 dark:text-amber-400">Row {f.row}: {f.subjectCode} — {f.remark}</p>
                ))}
              </div>
            </div>
          )}

          {totalErrors === 0 && (importResult.created > 0 || importResult.updated > 0) && (
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
                  const csv = [TEMPLATE_HEADERS, ...removedRows.map((r) => [r.code, r.name].map((v) => `"${v}"`).join(","))].join("\n")
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
            {importResult.failureCsv && importResult.failed.length > 0 && (
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
