"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { cleanCell, isExcelErrorCell, parseCsvRows, isAllowedStudentEmail, type ImportReasonCode } from "@/lib/csv-utils"
import { useChunkedImport, decodeCsvFile, withRetryHints, type ChunkMeta } from "@/features/admin-data/components/useChunkedImport"
import { buildImportLedger, assertLedgerClosure, ledgerToCsv, type LedgerRow } from "./import-ledger"
import { computeDepartmentGrouping } from "./department-grouping"
import { buildDepartmentPanels, type DepartmentPanel } from "./department-panels"
import { StepPanel } from "@/features/admin-data/components/FacultyImportStepper"

// Domain rule is shared with the import service via lib/csv-utils — one list,
// one predicate, so the preview cannot disagree with the server.
const isMissingEmail = (v: string) => v.trim().length === 0
const isOffDomainEmail = (v: string) => v.trim().length > 0 && !isAllowedStudentEmail(v)

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
  isInvalidValue: boolean
  resolvedDepartmentId: string | null
}

interface ImportResult {
  created: { name: string; email: string; role: string }[]
  enrolled: number
  // Rows actually written (resolved rows the database already held are NOT
  // counted). A re-run reads enrolled > 0 with inserted === 0.
  inserted: number
  skipped: number
  failed: { row: number; email: string; subjectCode: string; section: string; remark: string; reasonCode: ImportReasonCode }[]
  duplicateRows: { row: number; email: string; subjectCode: string; section: string; reasonCode: ImportReasonCode; remark: string }[]
  alreadyPersisted: { row: number; email: string; subjectCode: string; section: string; reasonCode: ImportReasonCode }[]
  parseErrors: { row: number; message: string }[]
  totalRows: number
  termMismatch?: { mappedTerms: string[]; activeTerm: string | null } | null
}

/** A preview row plus the two tallies the grid needs — what buildDepartmentPanels consumes. */
type PanelRow = PreviewRow & { isBlocked: boolean; isProblem: boolean }

// Blocking = rows the server cannot accept under any resolution. Everything else
// (unknown subject/section/faculty, dept mismatch) is created, resolved, or reported
// per-row by importStudents, so it must NOT gate the whole import.
// Module scope, not component scope: the panels memo depends on these, and a
// predicate re-created on every render would thrash that memo.
const isBlockedPreviewRow = (r: PreviewRow) =>
  isMissingEmail(r.email) || isOffDomainEmail(r.email) || r.isInvalidValue

const isProblemPreviewRow = (r: PreviewRow) =>
  r.isNewSubject || r.isNewSection || r.isNewFaculty || r.facultyNotAssigned ||
  r.isNewStudent || r.isInvalidDepartment || r.isInvalidValue

/**
 * Sum the panels' results into the one whole-file view the result tiles render.
 * Counts add because every input row lives in exactly one panel (guaranteed by
 * `buildDepartmentPanels`); the row lists concatenate because a panel's ledger
 * already keyed them by SOURCE row, so no two panels report the same row twice.
 */
function aggregatePanelResults(results: ImportResult[]): ImportResult | null {
  if (results.length === 0) return null
  return {
    created: results.flatMap((r) => r.created),
    enrolled: results.reduce((s, r) => s + r.enrolled, 0),
    inserted: results.reduce((s, r) => s + r.inserted, 0),
    skipped: results.reduce((s, r) => s + r.skipped, 0),
    failed: results.flatMap((r) => r.failed),
    duplicateRows: results.flatMap((r) => r.duplicateRows),
    alreadyPersisted: results.flatMap((r) => r.alreadyPersisted),
    parseErrors: results.flatMap((r) => r.parseErrors),
    totalRows: results.reduce((s, r) => s + r.totalRows, 0),
    termMismatch: results.find((r) => r.termMismatch)?.termMismatch ?? null,
  }
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
  const allRows = parseCsvRows(text)
  if (allRows.length < 2) return { rows: [], error: "CSV file is empty" }

  const headers = allRows[0].map((h) => h.trim().toLowerCase())
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
  for (let i = 1; i < allRows.length; i++) {
    const cols = allRows[i]
    if (cols.length < 5) continue
    rows.push({
      row: i + 1,
      name: cleanCell(cols[0]),
      email: cleanCell(cols[1]),
      subjectCode: cleanCell(cols[2]),
      section: cleanCell(cols[3]),
      facultyEmail: cleanCell(cols[4]),
      departmentCode: cols[5] ? cleanCell(cols[5]).toUpperCase() : "",
    })
  }
  return { rows }
}

const PREVIEW_PAGE_SIZE = 50

// Rows per request. The student importer resolves the faculty mapping once per row
// (studentImport.ts), so a chunk costs ~N sequential Supabase round trips. The
// function runs in iad1 while admins upload from sin1, so each trip carries
// ~150ms of Pacific latency — 500 rows overran maxDuration=60 and died on 504
// (FUNCTION_INVOCATION_TIMEOUT) after 62.8s. 100 keeps one request near ~15s.
// Trade-off accepted: 5x the requests, each idempotent and independently resumable.
const STUDENT_CHUNK_SIZE = 100

export default function BulkStudentImport({ departmentId: _departmentId, semesterId, previewOnly }: { departmentId?: string | null; semesterId?: string | null; previewOnly?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [previewError, setPreviewError] = useState("")
  const [referenceError, setReferenceError] = useState("")
  const [problemFilter, setProblemFilter] = useState(false)
  const [removedRows, setRemovedRows] = useState<Array<StudentCsvRow & { reason?: ImportReasonCode }>>([])
  // §3.1 — the panel whose run owns the single useChunkedImport instance.
  // Non-null IS the global running guard: every panel's Run button and the preview
  // table read this one value, and it is the only cancel target.
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  // Keyed by panel.id and never overwritten by a sibling's run — partial
  // completion is a NORMAL state, so a finished panel keeps its numbers.
  const [panelResults, setPanelResults] = useState<Record<string, ImportResult>>({})
  const [panelLedgers, setPanelLedgers] = useState<Record<string, LedgerRow[]>>({})
  const [panelErrors, setPanelErrors] = useState<Record<string, string>>({})
  const { isRunning: chunkRunning, progress: chunkProgress, history: chunkHistory, run: runChunks, cancel: cancelChunks } =
    useChunkedImport<PreviewRow, ImportResult>()

  const [existingSubjects, setExistingSubjects] = useState<{ code: string; id: string }[]>([])
  const [existingSections, setExistingSections] = useState<{ name: string; program: string; id: string; departmentCourseId?: string | null }[]>([])
  const [existingUsers, setExistingUsers] = useState<{ email: string }[]>([])
  const [existingFacultyUsers, setExistingFacultyUsers] = useState<{ email: string; id: string }[]>([])
  const [existingFacultySubjects, setExistingFacultySubjects] = useState<{ subject_id: string; section_id: string; faculty_id: string; id: string }[]>([])
  const [existingDepartments, setExistingDepartments] = useState<{ code: string; id: string }[]>([])
  // department_courses is UNIQUE("departmentId", code), so a section's owning
  // department is reached through its course — never through a code lookup.
  const [existingDepartmentCourses, setExistingDepartmentCourses] = useState<Map<string, string>>(new Map())

  // §3.3 — a student's department is their FIRST row in file order. Derived, not
  // stored: previewRows' order IS file order (removals already applied), so an
  // inline department edit or a row removal recomputes this with nothing to
  // re-stamp. Strict §3.3: a null first instance stays null → Unassigned.
  const studentDepartmentByEmail = useMemo(
    () => computeDepartmentGrouping(previewRows ?? []),
    [previewRows],
  )

  // §3.2 — panels group ROWS by their own `department code`, which is a
  // different map from studentDepartmentByEmail above (that one groups
  // STUDENTS, §3.3). Derived, so an inline edit or a row removal re-groups the
  // grid with nothing to re-stamp.
  const panels = useMemo(
    () =>
      buildDepartmentPanels<PanelRow>(
        (previewRows ?? []).map((r) => ({
          ...r,
          isBlocked: isBlockedPreviewRow(r),
          isProblem: isProblemPreviewRow(r),
        })),
        existingDepartments,
      ),
    [previewRows, existingDepartments],
  )

  // The download is the union of the panels that have run, in source-row order.
  // LedgerRow.row IS the source csv row, so merging on it is exact — and a panel
  // the admin never ran contributes nothing, which is why closure is asserted
  // per-panel and never against previewRows.length.
  const mergedLedgerRows = useMemo(
    () => Object.values(panelLedgers).flat().sort((a, b) => a.row - b.row),
    [panelLedgers],
  )
  const mergedLedgerCsv = useMemo(
    () => (mergedLedgerRows.length > 0 ? ledgerToCsv(mergedLedgerRows) : ""),
    [mergedLedgerRows],
  )
  const aggregateResult = useMemo(
    () => aggregatePanelResults(Object.values(panelResults)),
    [panelResults],
  )
  const ranPanelCount = Object.keys(panelLedgers).length

  const fetchReferenceData = useCallback(async () => {
    setReferenceError("")
    try {
      const res = await fetch("/api/import/students/reference")
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string; message?: string }
        setReferenceError(d.message || d.error || "Could not load import reference data.")
        return
      }
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
      setExistingDepartments((d.departments || []).map((c: { code: string; id: string }) => ({ code: c.code, id: c.id })))
      setExistingDepartmentCourses(new Map((d.departmentCourses || []).map((c: { id: string; code: string }) => [c.id, c.code])))
    } catch {
      setReferenceError("Could not load import reference data. Row flags may be inaccurate.")
    }
  }, [])

  useEffect(() => { Promise.resolve().then(() => fetchReferenceData()) }, [fetchReferenceData])

  useEffect(() => {
    if (activePanelId === null) return
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", guard)
    return () => window.removeEventListener("beforeunload", guard)
  }, [activePanelId])

  const blockedRows = useMemo(() => {
    if (!previewRows) return []
    return previewRows.filter(isBlockedPreviewRow)
  }, [previewRows])

  // Drives the §8 roll-up's headline and its per-panel breakdown. Derived — no
  // state that could drift from `panels`.
  const blockedPanels = useMemo(() => panels.filter((p) => p.blockedCount > 0), [panels])

  const problemRows = useMemo(() => {
    if (!previewRows) return []
    return previewRows.filter(isProblemPreviewRow)
  }, [previewRows])

  const visibleRows = problemFilter ? problemRows : previewRows ?? []
  const paginatedRows = visibleRows.slice(previewPage * PREVIEW_PAGE_SIZE, (previewPage + 1) * PREVIEW_PAGE_SIZE)
  const totalPreviewPages = Math.ceil(visibleRows.length / PREVIEW_PAGE_SIZE)

  const resolveSection = useCallback((raw: string) => {
    const dashIdx = raw.indexOf("-")
    const spaceIdx = raw.indexOf(" ")
    const idx = dashIdx !== -1 ? dashIdx : spaceIdx
    const program = idx === -1 ? "" : raw.slice(0, idx).trim()
    const sectionName = idx === -1 ? raw : raw.slice(idx + 1).trim()
    // The student CSV carries no course or department identity — only "BSIE-41M2" —
    // so a course lookup can never be a join key here. Match on the pair the schema
    // actually guarantees: sections is UNIQUE(name, program). Resolving the course by
    // code alone is unsafe because department_courses is UNIQUE("departmentId", code),
    // so BSIE can exist under two departments and Array.find() picks the wrong one.
    const section = existingSections.find((s) => s.name === sectionName && s.program === program) ?? null
    return { section, isNewSection: !section }
  }, [existingSections])

  const resolveDepartment = useCallback((code: string) => {
    if (!code) return { departmentId: null, isInvalid: true }
    const dept = existingDepartments.find((d) => d.code === code.toUpperCase().trim())
    return { departmentId: dept?.id ?? null, isInvalid: !dept }
  }, [existingDepartments])

  const handlePreview = async () => {
    setPreviewError("")
    // A new file is a new grid: no panel from the previous file may survive it.
    setPanelResults({})
    setPanelLedgers({})
    setPanelErrors({})
    setRemovedRows([])
    const file = fileRef.current?.files?.[0]
    if (!file) { setPreviewError("Please select a CSV file"); return }
    const text = await decodeCsvFile(file)
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
      const isInvalidValue = [r.name, r.email, r.subjectCode, r.section, r.facultyEmail, r.departmentCode].some((c) =>
        isExcelErrorCell((c || "").trim()),
      )
      return { ...r, isNewSubject, isNewSection, isNewFaculty, facultyNotAssigned, isNewStudent, isInvalidDepartment, isInvalidValue, resolvedDepartmentId }
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
    updated.isInvalidValue = [updated.name, updated.email, updated.subjectCode, updated.section, updated.facultyEmail, updated.departmentCode].some((c) =>
      isExcelErrorCell((c || "").trim()),
    )
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

  // Removed rows carry their ledger reason, and `removedRows` is what the ledger
  // counts as "removed". Keyed by SOURCE row number: `panels` holds COPIES of the
  // preview rows (the memo adds isBlocked/isProblem), so object identity would
  // match nothing in previewRows.
  //
  // Typed `PreviewRow[]`, not `PanelRow[]`: this reads only the CSV columns and
  // never touches isBlocked/isProblem, so the panel's added fields are noise here.
  // `PanelRow` is assignable to `PreviewRow`; the reverse is not, and the bulk
  // caller below has raw preview rows. The narrower type would have been wrong.
  const removeBlockedRows = (target: PreviewRow[]) => {
    if (!previewRows || target.length === 0) return
    const gone = new Set(target.map((r) => r.row))
    setRemovedRows((prev) => [
      ...prev,
      ...target.map((removed) => ({
        row: removed.row,
        email: removed.email,
        name: removed.name,
        subjectCode: removed.subjectCode,
        section: removed.section,
        facultyEmail: removed.facultyEmail,
        departmentCode: removed.departmentCode,
        reason: "REMOVED_BLOCKED" as const,
      })),
    ])
    setPreviewRows((prev) => prev?.filter((r) => !gone.has(r.row)) ?? prev)
    setProblemFilter(false)
    setPreviewPage(0)
  }

  const handleRemoveBlockedIn = (panel: DepartmentPanel<PanelRow>) =>
    removeBlockedRows(panel.rows.filter((r) => r.isBlocked))

  const handleRemoveAllBlocked = () =>
    removeBlockedRows(previewRows?.filter(isBlockedPreviewRow) ?? [])

  // One panel, one run. The chunk offsets stay panel-local, so buildImportLedger's
  // `payload[meta.rowOffset + i]` still resolves against the rows it was sent.
  const runPanel = async (panel: DepartmentPanel<PanelRow>) => {
    if (!previewRows || activePanelId !== null) return
    // Declared out here, not inside the try: the catch block below reports through
    // it too, and a block-scoped const would be invisible there.
    const fail = (message: string) => setPanelErrors((prev) => ({ ...prev, [panel.id]: message }))
    setActivePanelId(panel.id)
    fail("")
    try {
      const rows = panel.rows
      const payload = rows.map((r) => ({
        email: r.email,
        name: r.name,
        subjectCode: r.subjectCode,
        section: r.section,
        facultyEmail: r.facultyEmail || undefined,
        // §3.3: users.departmentId is the STUDENT's department — first row in
        // file order — never this row's own code. The row's own value stays on
        // resolvedDepartmentId, and it is what grouped this panel (§3.2).
        departmentId: studentDepartmentByEmail.get(r.email.toLowerCase().trim()) ?? undefined,
        _originRow: r.row,
      }))
      const postChunk = async (chunk: typeof payload, meta: ChunkMeta, signal: AbortSignal) => {
        const res = await fetch("/api/import/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            semesterId,
            rows: chunk,
            chunkIndex: meta.chunkIndex,
            totalChunks: meta.totalChunks,
            fileId: meta.fileId,
            isLast: meta.isLast,
          }),
        })
        let data: Record<string, unknown>
        try {
          data = await res.json()
        } catch {
          // Not JSON — never fall back to res.text() (F1: body already consumed,
          // and any readable body would leak markup into the UI). Status-only;
          // the hook mapper renders (2xx-non-JSON maps as 5xx via status).
          throw withRetryHints(Object.assign(new Error("Chunk request failed"), { serverMessage: undefined }), res)
        }
        if (!res.ok) {
          const serverError = (data as { error?: unknown }).error
          const verbatim = typeof serverError === "string" && serverError.trim() !== "" ? serverError : undefined
          // 400 carries the server reason verbatim (F7 guarded by typeof);
          // all other statuses carry status only — never the body.
          throw withRetryHints(Object.assign(new Error(verbatim ?? "Chunk request failed"), { serverMessage: verbatim }), res)
        }
        return data as unknown as ImportResult
      }
      // Success metas in results order (onChunkResult fires once per success,
      // in completion order — parallel to `results`). Merged with failed metas
      // they give exact per-chunk boundaries at any chunk size: no constant.
      const resultMetas: ChunkMeta[] = []
      const { results, cancelled, failedChunks, stoppedEarly } = await runChunks(rows, {
        chunkSize: STUDENT_CHUNK_SIZE,
        postChunk: (chunk, meta, signal) =>
          postChunk(payload.slice(meta.rowOffset, meta.rowOffset + chunk.length), meta, signal),
        onChunkResult: (_r, meta) => { resultMetas.push(meta) },
        summarizeResult: (r) => ({ saved: r.enrolled ?? 0, skipped: r.skipped ?? 0, issues: (r.failed?.length ?? 0) + (r.parseErrors?.length ?? 0) }),
      })
      if (cancelled) { fail(`Import cancelled after ${results.length} chunks — retry this panel to resume`); return }
      // Dead-chunk rows are TRANSPORT_ERROR rows inside the ledger now — the
      // separate window math that used to live here is gone.
      // The ledger is built FIRST — one entry per input CSV row, in source order.
      // The panel's own result then reads from it, so exactly one chunk-relative
      // → source-row conversion exists in the codebase.
      const ledger = buildImportLedger({
        payload: rows.map((r) => ({
          row: r.row,
          name: r.name,
          email: r.email,
          subjectCode: r.subjectCode,
          section: r.section,
          facultyEmail: r.facultyEmail,
          departmentCode: r.departmentCode,
          resolvedDepartmentId: r.resolvedDepartmentId,
          isInvalidDepartment: r.isInvalidDepartment,
        })),
        // Removed rows never resolved, so the department fields are meaningless.
        removed: removedRows.map((r) => ({
          row: r.row,
          name: r.name,
          email: r.email,
          subjectCode: r.subjectCode,
          section: r.section,
          facultyEmail: r.facultyEmail,
          departmentCode: r.departmentCode,
          resolvedDepartmentId: null,
          isInvalidDepartment: false,
          reason: r.reason,
        })),
        // resultMetas were collected once per success, in completion order — so
        // they line up with `results` index for index.
        chunkResults: resultMetas.flatMap((meta, i) => {
          const result = results[i]
          return result ? [{ meta, result }] : []
        }),
        deadChunks: failedChunks,
        sectionDeptCode: (section) => {
          const { section: sec } = resolveSection(section)
          const courseId = sec?.departmentCourseId
          return courseId ? existingDepartmentCourses.get(courseId) ?? null : null
        },
      })
      // Closure is PER PANEL, not whole-file. Asserting against previewRows.length here
      // would fire on every partial run and tell the admin the import is incomplete
      // when one panel of ten has finished — which is a normal state.
      let ledgerClosed = true
      try {
        assertLedgerClosure(ledger, rows.length)
      } catch {
        ledgerClosed = false
      }
      const aggregated: ImportResult = {
        created: results.flatMap((r) => r.created ?? []),
        enrolled: results.reduce((s, r) => s + (r.enrolled ?? 0), 0),
        inserted: results.reduce((s, r) => s + (r.inserted ?? 0), 0),
        skipped: results.reduce((s, r) => s + (r.skipped ?? 0), 0),
        // Derived from the ledger — it already holds every row keyed by source
        // number, so no second chunk-relative conversion exists.
        failed: ledger.flatMap((r) =>
          r.status === "invalid" && r.reasonCode !== ""
            ? [{ row: r.row, email: r.email, subjectCode: r.subjectCode, section: r.section, remark: r.remarks, reasonCode: r.reasonCode }]
            : [],
        ),
        duplicateRows: ledger.flatMap((r) =>
          r.reasonCode === "DUPLICATE_IN_FILE"
            ? [{ row: r.row, email: r.email, subjectCode: r.subjectCode, section: r.section, remark: r.remarks, reasonCode: "DUPLICATE_IN_FILE" as const }]
            : [],
        ),
        alreadyPersisted: ledger.flatMap((r) =>
          r.reasonCode === "ALREADY_PERSISTED"
            ? [{ row: r.row, email: r.email, subjectCode: r.subjectCode, section: r.section, reasonCode: "ALREADY_PERSISTED" as const }]
            : [],
        ),
        parseErrors: results.flatMap((r) => r.parseErrors ?? []),
        totalRows: rows.length,
        // Any chunk reporting a mismatch means this panel's rows are against the wrong term.
        termMismatch: results.find((r) => r.termMismatch)?.termMismatch ?? null,
      }
      setPanelResults((prev) => ({ ...prev, [panel.id]: aggregated }))
      setPanelLedgers((prev) => ({ ...prev, [panel.id]: ledger }))
      if (!ledgerClosed) {
        fail(`Could not account for all ${rows.length} rows of this panel — nothing was lost, ${aggregated.enrolled} rows are already saved. Press Run again to resume.`)
        return
      }
      if (stoppedEarly || failedChunks.length > 0) {
        // Every chunk failing with the SAME message is systematic — a config
        // problem such as "no active semester". Retrying cannot fix it, so the
        // server's own message must replace the "try again" advice.
        const reasons = [...new Set(failedChunks.map((fc) => fc.error))]
        fail(
          reasons.length === 1
            ? `${aggregated.failed.length} row${aggregated.failed.length !== 1 ? "s" : ""} not imported — ${reasons[0]}`
            : `${aggregated.failed.length} rows from failed chunks recorded as failures — nothing was lost, ${aggregated.enrolled} rows are already saved. Press Run again to resume.`
        )
        return
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        fail("Import cancelled — completed chunks are persisted. Press Run again to resume.")
        return
      }
      fail("Could not reach the server. Please check your connection and try again.")
    } finally {
      setActivePanelId(null)
    }
  }

  const handleReset = () => {
    setPanelResults({})
    setPanelLedgers({})
    setPanelErrors({})
    setPreviewRows(null)
    setPreviewPage(0)
    setPreviewError("")
    setReferenceError("")
    if (fileRef.current) fileRef.current.value = ""
  }

  const totalErrors = aggregateResult
    ? aggregateResult.failed.length + aggregateResult.parseErrors.length
    : 0

  return (
    <>
      {activePanelId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white dark:bg-surface-dim rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-10 h-10 border-4 border-gold-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-secondary">
              Importing {panels.find((p) => p.id === activePanelId)?.label ?? "enrollments"}...
            </p>
            <p className="text-xs text-tertiary">
              {chunkProgress.totalRows > 0
                ? `${chunkProgress.doneRows}/${chunkProgress.totalRows} rows (${chunkProgress.doneChunks}/${chunkProgress.totalChunks} chunks)`
                : "Please wait while we process your data."}
            </p>
            <p className="text-[11px] text-tertiary/70">Stay on this page until done — completed chunks resume safely on re-upload.</p>
            {chunkHistory.length > 0 && (
              <div className="w-full max-h-28 overflow-y-auto rounded-lg border border-default px-3 py-2 space-y-0.5 text-left">
                {(() => {
                  const persisted = chunkHistory.reduce((s, h) => s + h.saved + h.skipped, 0)
                  const pct = chunkProgress.totalRows > 0 ? Math.round((persisted / chunkProgress.totalRows) * 100) : 0
                  return (
                    <>
                      <p className="text-[11px] font-semibold text-secondary">Persisted {persisted}/{chunkProgress.totalRows} ({pct}%)</p>
                      {chunkHistory.map((h) => (
                        <p key={h.chunkIndex} className="text-[11px] text-tertiary">
                          {h.ok
                            ? `Chunk ${h.chunkIndex + 1}: ${h.rows} rows → saved ${h.saved}, skipped ${h.skipped} (already persisted or duplicate), issues ${h.issues}`
                            : `Chunk ${h.chunkIndex + 1}: ${h.rows} rows → failed — ${h.error ?? "error"}`}
                        </p>
                      ))}
                    </>
                  )
                })()}
              </div>
            )}
            {chunkRunning && (
              <button type="button" onClick={() => cancelChunks()} className="text-xs font-semibold text-red-600 hover:underline">Cancel</button>
            )}
          </div>
        </div>
      )}

      {!previewRows && !aggregateResult && (
        <div className="space-y-5">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">CSV Format Hints</p>
            <ul className="text-[11px] text-blue-600/80 dark:text-blue-300/70 space-y-0.5">
              <li><strong>Section</strong> column must use format: <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">PROGRAM-SECTION</code> or <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">PROGRAM SECTION</code> (e.g., <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">BSIT-32A3</code> or <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">BSIT 32A3</code>)</li>
              <li><strong>Subject code</strong> must match an existing subject — unknown codes will block the row.</li>
              <li><strong>Faculty email</strong> must be an existing faculty/dean user assigned to that subject+section.</li>
              <li><strong>Department code</strong> must match an existing department (e.g., <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">CCS</code>).</li>
              <li><strong>Student email</strong> must end with <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">...@lyceumalabang.edu.ph</code> or <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">...@itmlyceumalabang.onmicrosoft.com</code> — blank or foreign-domain rows are excluded into Failures.</li>
              <li>Large files upload in <strong>500-row chunks</strong> with progress — stay on this page until done.</li>
              <li>Re-uploading the same file enrolls <strong>0 new rows</strong> (already-enrolled rows are skipped).</li>
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
          {referenceError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300">Reference data unavailable</p>
              <p className="text-[11px] text-red-600/80 dark:text-red-300/70">{referenceError}</p>
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
                {problemFilter && ` (filtered)`}
              </h4>
              <span className="text-[11px] text-tertiary">{TEMPLATE_HEADERS}</span>
            </div>

            <div className="flex items-center gap-3">
              <p className="text-[11px] text-tertiary/70 italic">
                <span className="badge-red not-italic">Red</span> cannot import &mdash; the ledger
                shows the reason. <span className="badge-amber not-italic ml-1">Amber</span> imports,
                but is flagged (unresolved department, new student). An unknown subject, section or
                faculty is <span className="badge-red not-italic">red</span>, not amber &mdash; the
                server rejects it.
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

            {previewRows && previewRows.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-tertiary">
                <span><span className="font-semibold text-secondary">{previewRows.length - blockedRows.length}</span> ready to import</span>
                <span><span className="font-semibold text-amber-600">{problemRows.length}</span> flagged &mdash; imports with a flag; an unknown subject, section or faculty fails that row</span>
                <span><span className="font-semibold text-red-600">{blockedRows.length}</span> blocked (missing email, bad domain, Excel error)</span>
              </div>
            )}

            {/* §8 "Invalid-list volume": StepPanel renders invalid[] in a max-h-32 scroll, so
                per-panel lists alone leave the admin scrolling ten boxes to learn whether
                their file has blocked rows at all. This says BLOCKED — never "remaining" —
                so it cannot be confused with the footer's "N of M panels run". */}
            {blockedRows.length > 0 && (
              <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                      {blockedRows.length} blocked row{blockedRows.length !== 1 ? "s" : ""} across{" "}
                      {blockedPanels.length} panel{blockedPanels.length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[11px] text-red-600/80 dark:text-red-300/70">
                      {blockedPanels.map((p) => `${p.label} ${p.blockedCount}`).join(" · ")} — a
                      blocked row cannot import, whatever the other columns say.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveAllBlocked}
                    className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 transition-colors"
                  >
                    Remove all {blockedRows.length} blocked
                  </button>
                </div>
              </div>
            )}

            {panels.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] text-tertiary/70">
                  {panels.length} department{panels.length !== 1 ? "s" : ""} in this file — run them independently, in any
                  order. A re-run skips rows already saved, so nothing is written twice.
                  {!semesterId && (
                    <span className="text-red-600 font-semibold"> No active semester — every panel is disabled.</span>
                  )}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {panels.map((panel) => {
                    const result = panelResults[panel.id]
                    const panelError = panelErrors[panel.id]
                    const isActive = activePanelId === panel.id
                    const blocked = panel.blockedCount > 0
                    const disabled = !semesterId || blocked || (activePanelId !== null && !isActive)
                    const disabledTitle = !semesterId
                      ? "Set an active semester before importing."
                      : blocked
                        ? `${panel.blockedCount} blocked row${panel.blockedCount !== 1 ? "s" : ""} — remove them, or fix the values in the table below.`
                        : undefined
                    return (
                      <StepPanel
                        key={panel.id}
                        title={`${panel.label} · ${panel.rows.length}`}
                        runLabel="Run"
                        runningLabel="Running…"
                        running={isActive}
                        disabled={disabled}
                        disabledTitle={disabledTitle}
                        onRun={() => runPanel(panel)}
                        summary={
                          <>
                            <p className="text-[11px] text-tertiary">
                              {panel.rows.length - panel.blockedCount} ready · {panel.problemCount} flagged · {panel.blockedCount} blocked
                            </p>
                            {/* Only the Unassigned panel can carry these — the builder
                                routes every null id there (pinned by
                                department-panels.test.ts). §3.4 decision (b): these rows
                                still import; the ledger names the reason, not the UI. */}
                            {panel.unresolvedCount > 0 && (
                              <p className="text-[11px] text-amber-600">
                                {panel.unresolvedCount} unresolved department code
                                {panel.unresolvedCount !== 1 ? "s" : ""}
                                {panel.blankDeptCount > 0 && ` · ${panel.blankDeptCount} blank`} —
                                still imported; the ledger records which.
                              </p>
                            )}
                            {blocked && (
                              <button
                                type="button"
                                onClick={() => handleRemoveBlockedIn(panel)}
                                className="text-[11px] font-semibold text-red-600 hover:underline"
                              >
                                Remove these {panel.blockedCount}
                              </button>
                            )}
                            {result && (
                              <p className="text-[11px] text-secondary">
                                {result.enrolled} resolved · {result.inserted} written · {result.skipped} skipped ·{" "}
                                <span className={result.failed.length > 0 ? "text-amber-600" : "text-emerald-600"}>
                                  {result.failed.length} failed
                                </span>
                              </p>
                            )}
                            {panelError && <p className="text-[11px] text-red-600">{panelError}</p>}
                          </>
                        }
                        invalid={panel.rows
                          .filter((r) => r.isBlocked)
                          .map((r) => ({
                            key: `Row ${r.row}`,
                            reason: isMissingEmail(r.email)
                              ? "email missing"
                              : isOffDomainEmail(r.email)
                                ? "domain not allowed"
                                : "invalid value (Excel error)",
                          }))}
                        invalidKeyPrefix={`blocked-${panel.id}`}
                        confirmTitle={`Import ${panel.rows.length} row${panel.rows.length !== 1 ? "s" : ""} from ${panel.label}?`}
                        confirmMessage="Only this department's rows are sent. Re-running skips rows already saved."
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {aggregateResult?.termMismatch && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                  Faculty mappings are attached to an inactive semester
                </p>
                <p className="text-[11px] text-red-600/80 dark:text-red-300/70">
                  The subjects and sections in this file have no faculty for the active semester
                  {aggregateResult.termMismatch.mappedTerms.length > 0 && (
                    <> &mdash; their mappings sit under {aggregateResult.termMismatch.mappedTerms.length} other
                    semester{aggregateResult.termMismatch.mappedTerms.length !== 1 ? "s" : ""}</>
                  )}
                  . Re-import the faculty CSV while that semester is active, or activate the semester
                  the mappings belong to. Rows below fail with &ldquo;not assigned&rdquo; because of
                  this, not because of a typo.
                </p>
              </div>
            )}

            <div
              aria-busy={activePanelId !== null}
              className={`max-h-72 overflow-y-auto tbl-container tbl transition-opacity ${
                activePanelId !== null ? "pointer-events-none opacity-60" : ""
              }`}
            >
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
                            {r.isInvalidValue && <span className="badge-red text-[10px]">Invalid value</span>}
                            {isMissingEmail(r.email) && <span className="badge-red text-[10px]">Email missing</span>}
                            {isOffDomainEmail(r.email) && <span className="badge-red text-[10px]">Domain not allowed</span>}
                            {r.isNewSubject && <span className="badge-red text-[10px]">Subject not found</span>}
                            {r.isNewSection && <span className="badge-red text-[10px]">Section not found</span>}
                            {r.isNewFaculty && <span className="badge-red text-[10px]">Faculty not found</span>}
                            {r.facultyNotAssigned && <span className="badge-red text-[10px]">Faculty Loading Mismatch</span>}
                            {r.isInvalidDepartment && <span className="badge-amber text-[10px]">Dept code unknown</span>}
                            {!r.isInvalidValue && !isMissingEmail(r.email) && !isOffDomainEmail(r.email) && r.isNewStudent && (
                              <span className="badge-amber text-[10px]">New Student</span>
                            )}
                            {!r.isInvalidValue && !isMissingEmail(r.email) && !isOffDomainEmail(r.email) && !r.isNewSubject && !r.isNewSection && !r.isNewFaculty && !r.facultyNotAssigned && !r.isInvalidDepartment && !r.isNewStudent && (
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
              disabled={activePanelId !== null}
              onClick={handleReset}
              className={`text-sm font-semibold px-4 py-3 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors disabled:opacity-40 ${previewOnly ? "w-full" : "flex-1"}`}
            >
              Cancel
            </button>
            {!previewOnly && ranPanelCount > 0 && (
              <p className="text-[11px] text-tertiary text-right">
                {ranPanelCount} of {panels.length} panel{panels.length !== 1 ? "s" : ""} run
              </p>
            )}
          </div>
        </div>
      )}

      {aggregateResult && !previewOnly && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-emerald-600">{aggregateResult.created.length}</p>
              <p className="text-[11px] font-semibold text-emerald-700/70 dark:text-emerald-300/70">Users Created</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-blue-600">{aggregateResult.enrolled}</p>
              <p className="text-[11px] font-semibold text-blue-700/70 dark:text-blue-300/70">Enrollments Resolved</p>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl px-5 py-3 space-y-1">
            {/* Every number below covers the panels that RAN, not the file. Naming
                the scope is the whole point — a partial run is a normal state. */}
            <p className="text-xs font-semibold text-secondary">
              {ranPanelCount} of {panels.length} panel{panels.length !== 1 ? "s" : ""} run · {aggregateResult.totalRows} rows sent · {aggregateResult.enrolled} resolved · {aggregateResult.inserted} newly written · {aggregateResult.skipped} skipped (already enrolled) · {aggregateResult.failed.length} failed
            </p>
            <p className="text-[11px] text-tertiary">
              Seed 2026-1 reference: 3,302 students · 21,989 enrollments. Re-running a panel should enroll 0 and skip all (idempotent).
            </p>
            {(() => {
              const boxUnaccounted =
                aggregateResult.totalRows -
                aggregateResult.enrolled -
                aggregateResult.skipped -
                aggregateResult.failed.length -
                aggregateResult.parseErrors.length
              const notYetRun = panels.length - ranPanelCount
              return (
                <>
                  <p className={`text-[11px] font-semibold ${boxUnaccounted !== 0 ? "text-red-600" : "text-emerald-600 dark:text-emerald-300"}`}>
                    {boxUnaccounted === 0
                      ? `All ${aggregateResult.totalRows} rows from the panels that ran are accounted for.`
                      : `${boxUnaccounted} of ${aggregateResult.totalRows} CSV rows unaccounted — re-run that panel.`}
                  </p>
                  {notYetRun > 0 && (
                    <p className="text-[11px] text-tertiary">
                      {notYetRun} panel{notYetRun !== 1 ? "s have" : " has"} not run yet — their rows are not in these totals or in the ledger.
                    </p>
                  )}
                </>
              )
            })()}
          </div>

          {aggregateResult.parseErrors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-red-100 dark:border-red-800/30">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">{aggregateResult.parseErrors.length} Parse Error{aggregateResult.parseErrors.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="px-5 py-3 space-y-2 max-h-40 overflow-y-auto">
                {aggregateResult.parseErrors.map((e, i) => (
                  <p key={`pe-${i}`} className="text-xs text-red-600 dark:text-red-400">Row {e.row}: {e.message}</p>
                ))}
              </div>
            </div>
          )}

          {aggregateResult.failed.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-100 dark:border-amber-800/30">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{aggregateResult.failed.length} Import Failure{aggregateResult.failed.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="px-5 py-3 space-y-2 max-h-40 overflow-y-auto">
                {aggregateResult.failed.map((f, i) => (
                  <p key={`f-${i}`} className="text-xs text-amber-700 dark:text-amber-400">Row {f.row}: {f.email} — {f.remark}</p>
                ))}
              </div>
            </div>
          )}

          {/* "Everything succeeded" is only true when every panel ran. A partial
              run with zero failures is a success SO FAR, not a completed import. */}
          {totalErrors === 0 && aggregateResult.enrolled > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl px-5 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-200 dark:bg-emerald-700 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-700 dark:text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {ranPanelCount === panels.length
                  ? `All ${aggregateResult.totalRows} rows processed successfully.`
                  : `Every row from the ${ranPanelCount} panel${ranPanelCount !== 1 ? "s" : ""} that ran processed successfully.`}
              </p>
            </div>
          )}

          {mergedLedgerCsv && (
            <button
              type="button"
              onClick={() => downloadBlob(mergedLedgerCsv, "student-import-ledger.csv")}
              className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-3 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
            >
              <svg className="w-4 h-4 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Import Ledger (.csv) &mdash; {mergedLedgerRows.length} rows from {ranPanelCount} panel{ranPanelCount !== 1 ? "s" : ""}
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
