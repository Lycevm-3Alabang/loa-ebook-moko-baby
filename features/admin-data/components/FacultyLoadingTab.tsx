"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import Link from "next/link"
import { useApiGet } from "@/lib/api/client"
import { usePagination, Paginator } from "@/components/ui/Paginator"
import { SkeletonTable } from "@/components/ui/Skeleton"
import IosButton from "@/components/ui/IosButton"
import LockedTab from "@/components/ui/LockedTab"
import { SegmentedControl, SearchInput } from "./shared"
import { EnrollmentsTab } from "./EnrollmentsTab"
import { FacultySubjectDetail } from "./FacultySubjectDetail"
import type { DepartmentData, SemesterData } from "@/lib/types"
import type { FacEnrollTab, FacViewTab, Subject, Section, FacultyMapping, Enrollment } from "./types"
import { deriveCsvFlags, type CsvRow, type CsvRowWithFlags } from "./csv-helpers"
import { useChunkedImport, decodeCsvFile, type ChunkMeta } from "./useChunkedImport"

export function FacultyLoadingTab() {
  const [facEnrollTab, setFacEnrollTab] = useState<FacEnrollTab>("faculty")
  return (
    <div className="space-y-6">
      <SegmentedControl
        options={[{ key: "faculty" as const, label: "Faculty Loading" }, { key: "enrollments" as const, label: "Student Enrollments" }]}
        selected={facEnrollTab}
        onSelect={(key) => setFacEnrollTab(key)}
      />
      {facEnrollTab === "faculty" && <FacultyTab />}
      {facEnrollTab === "enrollments" && <EnrollmentsTab />}
    </div>
  )
}

// ═══ FACULTY LOADING TAB ══════════════════════════════════════════════════════

function FacultyTab() {
  const [data, setData] = useState<FacultyMapping[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [locked, setLocked] = useState("")
  const [search, setSearch] = useState("")

  const [formFaculty, setFormFaculty] = useState("")
  const [formSubject, setFormSubject] = useState("")
  const [formSection, setFormSection] = useState("")
  const [formDept, setFormDept] = useState("all")
  const [facultySearch, setFacultySearch] = useState("")
  const [facultyDropdownOpen, setFacultyDropdownOpen] = useState(false)
  const facultyDropdownRef = useRef<HTMLDivElement>(null)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [formSuccess, setFormSuccess] = useState("")

  const tableRef = useRef<HTMLDivElement>(null)
  const [showImport, setShowImport] = useState(false)
  const [showAddForm, setShowAddForm] = useState(true)

  // ── CSV Import state ──────────────────────────────────────
  const csvFileRef = useRef<HTMLInputElement>(null)
  const [csvRows, setCsvRows] = useState<CsvRowWithFlags[] | null>(null)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvImportResult, setCsvImportResult] = useState<{
    matched: number
    errors: { row: number; email?: string; message: string }[]
    createdSubjects: number
    createdSections: number
    parseErrors?: { row: number; message: string }[]
  } | null>(null)
  const [csvError, setCsvError] = useState("")
  const [csvPreviewPage, setCsvPreviewPage] = useState(0)
  const [lastImportTotal, setLastImportTotal] = useState(0)
  const [lastImportChunks, setLastImportChunks] = useState(0)
  const [wrongCsv, setWrongCsv] = useState("")
  const [csvProblemFilter, setCsvProblemFilter] = useState(false)
  const [csvBlockedFilter, setCsvBlockedFilter] = useState(false)
  const [csvInvalidDeptFilter, setCsvInvalidDeptFilter] = useState(false)
  const PREVIEW_PAGE_SIZE = 50
  interface FacultyChunkResult {
    matched: number
    errors: { row: number; email?: string; message: string }[]
    createdSubjects: number
    createdSections: number
    parseErrors?: { row: number; message: string }[]
  }
  const FACULTY_CHUNK_SIZE = 500
  const { isRunning: chunkRunning, progress: chunkProgress, run: runChunks, cancel: cancelChunks } =
    useChunkedImport<CsvRow, FacultyChunkResult>()

  const csvProblemRows = useMemo(() => {
    if (!csvRows) return []
    return csvRows.filter((r) => r.isNewSubject || r.isNewSection || r.isNewTeacher || r.isInvalidDept)
  }, [csvRows])

  const blockedCsvRows = useMemo(() => {
    if (!csvRows) return []
    return csvRows.filter((r) => r.isExistingMapping)
  }, [csvRows])

  const invalidDeptRows = useMemo(() => {
    if (!csvRows) return []
    return csvRows.filter((r) => r.isInvalidDept)
  }, [csvRows])

  const csvVisibleRows = csvRows
    ? csvRows.filter((r) => {
        if (csvInvalidDeptFilter) return r.isInvalidDept
        if (csvProblemFilter && csvBlockedFilter) return r.isNewSubject || r.isNewSection || r.isNewTeacher || r.isInvalidDept || r.isExistingMapping
        if (csvProblemFilter) return r.isNewSubject || r.isNewSection || r.isNewTeacher || r.isInvalidDept
        if (csvBlockedFilter) return r.isExistingMapping
        return true
      })
    : []

  const TEMPLATE_HEADERS = "faculty email, name, section, subject code, subject name, department code"
  const TEMPLATE_SAMPLE = "juan.delacruz@lyceumalabang.edu.ph, Juan Dela Cruz, BSIT-32A3, CS101, Introduction to Computer Science, CCS\nmaria.santos@lyceumalabang.edu.ph, Maria Santos, BSCS-21B, MATH201, Calculus II, CCS"

  // ── Department filter ────────────────────────────────────
  const [deptFilter, setDeptFilter] = useState("all")
  const [currentUserDept, setCurrentUserDept] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const fetchData = useCallback(async (isRefresh?: boolean) => {
    if (isRefresh) { setLoading(true); setError("") }
    try {
      const res = await fetch("/api/data/evaluation-mappings?type=faculty")
      if (res.status === 403) { setLocked("/api/data/evaluation-mappings?type=faculty"); return }
      if (!res.ok) throw new Error("Failed to load faculty-subject mappings")
      const json = await res.json()
      setData(json.data)
    } catch (err) { setError(err instanceof Error ? err.message : "Unknown error") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { Promise.resolve().then(() => fetchData()) }, [fetchData])

  const { data: semestersData } = useApiGet<{ data: SemesterData[] }>("/api/semesters")
  const activeSemesterId = useMemo(() => semestersData?.data?.find((s) => s.isActive)?.id ?? "", [semestersData])

  // Get current user info for department restriction
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        if (j.user) {
          const isAdm = j.user.role?.split("|").includes("ADMIN")
          setIsAdmin(isAdm)
          if (!isAdm && j.user.departmentId) {
            setCurrentUserDept(j.user.departmentId)
            setDeptFilter(j.user.departmentId)
          }
        }
      })
      .catch(() => { })
  }, [])

  const { data: allUsers } = useApiGet<{ users: { id: string; name: string; email: string; role: string; departmentId: string | null }[]; departments: DepartmentData[] }>("/api/admin/users")
  const { data: subjectsData } = useApiGet<{ data: Subject[] }>("/api/data/evaluation-mappings?type=subjects")
  const { data: sectionsData } = useApiGet<{ data: Section[] }>("/api/data/evaluation-mappings?type=sections")

  const { data: enrollmentsData } = useApiGet<{ data: Enrollment[] }>("/api/data/evaluation-mappings?type=student")

  const faculties = (allUsers?.users ?? []).filter((u) => (u.role.includes("FACULTY") || u.role.includes("DEAN")) && u.id !== "a0000000-0000-0000-0000-000000000001")
  const subjects = subjectsData?.data ?? []
  const sections = sectionsData?.data ?? []
  const departments = allUsers?.departments ?? []

  const facultiesByDept = useMemo(() => {
    return formDept === "all" ? faculties : faculties.filter((f) => f.departmentId === formDept)
  }, [faculties, formDept])

  const filteredFaculties = useMemo(() => {
    if (!facultySearch) return facultiesByDept
    const q = facultySearch.toLowerCase()
    return facultiesByDept.filter((f) => f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q))
  }, [facultiesByDept, facultySearch])

  const selectedFacultyName = formFaculty
    ? faculties.find((f) => f.id === formFaculty)?.name ?? ""
    : ""

  const enrollmentCountByFsId = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of enrollmentsData?.data ?? []) {
      if (e.faculty_subject_id) {
        map.set(e.faculty_subject_id, (map.get(e.faculty_subject_id) ?? 0) + 1)
      }
    }
    return map
  }, [enrollmentsData])

  const [selectedSsMapping, setSelectedSsMapping] = useState<FacultyMapping | null>(null)

  const closeSubjectSectionModal = () => {
    setSelectedSsMapping(null)
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (facultyDropdownRef.current && !facultyDropdownRef.current.contains(e.target as Node)) {
        setFacultyDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formFaculty || !formSubject || !formSection) return
    const existing = data?.find(
      (m) => m.faculty.id === formFaculty && m.subject.id === formSubject && m.section.id === formSection
    )
    if (existing) {
      setFormError(`This faculty already handles "${existing.subject.code} - ${existing.subject.name}" for section ${existing.section.program}-${existing.section.name}.`)
      setTimeout(() => {
        tableRef.current?.querySelector(`[data-id="${existing.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })
      }, 100)
      return
    }
    setFormSaving(true); setFormError(""); setFormSuccess("")
    try {
      const res = await fetch("/api/admin/faculty-subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faculty_id: formFaculty, subject_id: formSubject, section_id: formSection, semesterId: activeSemesterId || null }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to add mapping") }
      setFormFaculty(""); setFormSubject(""); setFormSection("")
      setFormSuccess("Mapping added!")
      setTimeout(() => setFormSuccess(""), 3000)
      fetchData(true)
    } catch (err) { setFormError((err as Error).message) }
    finally { setFormSaving(false) }
  }

  // ── CSV Import handlers ──────────────────────────────────

  function downloadBlob(csv: string, filename: string) {
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function parseFacultyCsv(text: string): { rows: CsvRow[]; error?: string } {
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2) return { rows: [], error: "CSV file is empty" }
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
    const expected = ["faculty email", "name", "section", "subject code", "subject name", "department code"]
    if (headers.length < expected.length || headers.join(",") !== expected.join(",")) {
      return { rows: [], error: `Expected headers: ${expected.join(", ")}` }
    }
    const rows: CsvRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim())
      if (cols.length < 6) continue
      rows.push({
        email: cols[0].toLowerCase().trim(),
        name: cols[1],
        subjectCode: cols[3],
        section: cols[2],
        subjectName: cols[4],
        departmentCode: cols[5].toUpperCase().trim(),
      })
    }
    return { rows }
  }

  const handleCsvFile = async (file: File) => {
    setCsvImportResult(null)
    setCsvError("")
    try {
      const text = await decodeCsvFile(file)
      const { rows, error } = parseFacultyCsv(text)
      if (error) { setCsvError(error); return }
      if (rows.length === 0) { setCsvError("No valid rows found"); return }
      setCsvRows(deriveCsvFlags(rows, {
        existingMappings: data ?? [],
        validDeptCodes: departments.map((d) => d.code),
        subjectCodes: subjects.map((s) => s.code),
        sectionPairs: sections.map((s) => ({ name: s.name, program: s.program })),
        facultyEmails: faculties.map((f) => f.email),
      }))
      setCsvPreviewPage(0)
    } catch {
      setCsvError("Could not read CSV file")
    }
  }

  const handleCsvImport = async () => {
    if (!csvRows || csvRows.length === 0) return
    setCsvImporting(true); setCsvImportResult(null); setCsvError(""); setWrongCsv("")
    setLastImportTotal(csvRows.length); setLastImportChunks(Math.ceil(csvRows.length / FACULTY_CHUNK_SIZE))
    try {
      const postChunk = async (chunk: CsvRow[], meta: ChunkMeta, signal: AbortSignal) => {
        const res = await fetch("/api/import/faculties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            semesterId: activeSemesterId || null,
            rows: chunk,
            chunkIndex: meta.chunkIndex,
            totalChunks: meta.totalChunks,
            fileId: meta.fileId,
            isLast: meta.isLast,
          }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error((d as { error?: string }).error || `Chunk ${meta.chunkIndex + 1} failed`)
        }
        return (await res.json()) as FacultyChunkResult
      }
      const { results, cancelled } = await runChunks(csvRows, { chunkSize: FACULTY_CHUNK_SIZE, postChunk })
      if (cancelled) { setCsvError(`Import cancelled after ${results.length} chunks — no partial state hidden, retry to resume`); return }
      const offsetRows = <T extends { row: number }>(list: T[], ci: number): T[] =>
        list.map((e) => (e.row === 0 ? e : { ...e, row: e.row + ci * FACULTY_CHUNK_SIZE }))
      const aggregated: FacultyChunkResult = {
        matched: results.reduce((s, r) => s + (r.matched ?? 0), 0),
        createdSubjects: results.reduce((s, r) => s + (r.createdSubjects ?? 0), 0),
        createdSections: results.reduce((s, r) => s + (r.createdSections ?? 0), 0),
        errors: results.flatMap((r, ci) => offsetRows(r.errors ?? [], ci)),
        parseErrors: results.flatMap((r, ci) => offsetRows(r.parseErrors ?? [], ci)),
      }
      setCsvImportResult(aggregated)
      const escapeWrongCell = (v: string) => (v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v)
      const wrongHead = ["row", "name", "email", "subject code", "subject name", "section", "department code", "reason"]
      const wrongLines = aggregated.errors.map((e) => {
        const src = e.row > 0 ? csvRows[e.row - 1] : undefined
        return [e.row > 0 ? String(e.row) : "", src?.name ?? "", e.email ?? src?.email ?? "", src?.subjectCode ?? "", src?.subjectName ?? "", src?.section ?? "", src?.departmentCode ?? "", e.message].map(escapeWrongCell).join(",")
      })
      for (const pe of aggregated.parseErrors ?? []) {
        wrongLines.push([String(pe.row), "", "", "", "", "", "", pe.message].map(escapeWrongCell).join(","))
      }
      setWrongCsv([wrongHead.map(escapeWrongCell).join(","), ...wrongLines].join("\n"))
      const rowErrorCount =
        aggregated.errors.filter((e) => e.row > 0).length +
        (aggregated.parseErrors?.length ?? 0)
      const unaccounted = csvRows.length - aggregated.matched - rowErrorCount
      if (unaccounted !== 0) {
        setCsvError(`Import incomplete: ${unaccounted} of ${csvRows.length} CSV rows are unaccounted for (not mapped and not reported as errors). Retry the import — completed chunks are idempotent.`)
        return
      }
      if (aggregated.matched > 0) { setCsvRows(null); fetchData(true) }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setCsvError("Import cancelled — retry to resume remaining chunks")
      } else {
        setCsvError((err as Error).message)
      }
    } finally { setCsvImporting(false) }
  }

  const handleCsvFieldChange = (index: number, field: "name" | "subjectCode" | "subjectName" | "section" | "departmentCode", value: string) => {
    if (!csvRows) return
    const existingKeys = new Set(
      (data ?? []).map((m) => `${m.faculty.email}|${m.subject.code}|${m.section.program}-${m.section.name}`)
    )
    const next = [...csvRows]
    const updated = { ...next[index], [field]: value }
    if (field === "subjectCode") {
      updated.isNewSubject = !subjects.some((s) => s.code === value)
      updated.isExistingMapping = false
    } else if (field === "section") {
      const dashIdx = value.indexOf("-")
      const spaceIdx = value.indexOf(" ")
      const idx = dashIdx !== -1 ? dashIdx : spaceIdx
      const sectionProgram = idx === -1 ? "" : value.slice(0, idx).trim()
      const sectionName = idx === -1 ? value : value.slice(idx + 1).trim()
      updated.isNewSection = !sections.some((s) => s.name === sectionName && s.program === sectionProgram)
    } else if (field === "departmentCode") {
      const validDeptCodes = new Set(departments.map((d) => d.code))
      updated.isInvalidDept = !validDeptCodes.has(value.toUpperCase().trim())
    }
    const row = updated as CsvRowWithFlags
    updated.isExistingMapping = existingKeys.has(`${row.email}|${row.subjectCode}|${row.section}`)
    next[index] = updated
    setCsvRows(next)
  }

  const handleCsvRowRemove = (index: number) => {
    if (!csvRows) return
    const next = csvRows.filter((_, i) => i !== index)
    if (next.length === 0) {
      handleCsvReset()
    } else {
      setCsvRows(next)
      if (Math.ceil(next.length / PREVIEW_PAGE_SIZE) <= csvPreviewPage) {
        setCsvPreviewPage(Math.max(0, csvPreviewPage - 1))
      }
    }
  }

  const handleCsvReset = () => {
    setCsvRows(null)
    setCsvImportResult(null)
    setWrongCsv(""); setLastImportTotal(0); setLastImportChunks(0)
    setCsvPreviewPage(0)
    setCsvProblemFilter(false)
    setCsvBlockedFilter(false)
    setCsvInvalidDeptFilter(false)
    setCsvError("")
    if (csvFileRef.current) csvFileRef.current.value = ""
  }

  const hasNullSemesterId = data?.some((m) => !m.semesterId) ?? false

  const byDept = data?.filter((m) => {
    if (deptFilter === "all") return true
    return m.faculty.departmentId === deptFilter
  }) ?? []

  const filtered = byDept.filter((m) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      m.faculty.name.toLowerCase().includes(q) ||
      m.faculty.email.toLowerCase().includes(q) ||
      m.subject.code.toLowerCase().includes(q) ||
      m.subject.name.toLowerCase().includes(q) ||
      `${m.section.program}-${m.section.name}`.toLowerCase().includes(q)
    )
  })

  const [viewTab, setViewTab] = useState<FacViewTab>("by_faculty")

  const groupedFaculty = useMemo(() => {
    const map = new Map<string, { faculty: FacultyMapping["faculty"]; mappings: FacultyMapping[] }>()
    for (const m of filtered) {
      if (!map.has(m.faculty.id)) {
        map.set(m.faculty.id, { faculty: m.faculty, mappings: [] })
      }
      map.get(m.faculty.id)!.mappings.push(m)
    }
    return Array.from(map.values())
  }, [filtered])

  const flatData = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const c = a.subject.code.localeCompare(b.subject.code)
      if (c !== 0) return c
      const secA = `${a.section.program}-${a.section.name}`
      const secB = `${b.section.program}-${b.section.name}`
      return secA.localeCompare(secB)
    })
  }, [filtered])

  const { page, totalPages, pageSize, paginatedItems, setPage, setPageSize } = usePagination(groupedFaculty, 25)
  const ssPagination = usePagination(flatData, 25)

  const [selectedFacultyLoad, setSelectedFacultyLoad] = useState<FacultyMapping[] | null>(null)
  const facultyLoadPagination = usePagination(selectedFacultyLoad ?? [], 25)

  const deptPills = [
    { id: "all", label: "All" },
    ...departments.map((d) => ({ id: d.id, label: d.name })),
  ]

  return (
    <div className="space-y-6">
      {locked && <LockedTab endpoint={locked} />}
      {!locked && error && <p className="text-xs font-medium text-red-600">{error}</p>}

      {/* Collapsible Import */}
      <div className="border border-default rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowImport((s) => !s)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-dim/40 transition-colors"
        >
          <span>Importer: Faculty Loading</span>
          <span className="text-tertiary">{showImport ? "▲" : "▼"}</span>
        </button>
      {showImport && (
          <div className="border-t border-gray-200 dark:border-gray-800 px-4 pb-4 space-y-4">
            {!activeSemesterId && (
              <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5">
                <span>⚠️</span>
                <span>No active semester. Set one as active before importing.</span>
              </div>
            )}
            <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-secondary">Upload CSV</h3>
              {!csvRows && !csvImportResult && (
                <button type="button" onClick={() => downloadBlob(`${TEMPLATE_HEADERS}\n${TEMPLATE_SAMPLE}`, "faculty-import-template.csv")}
                  className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
                >
                  <svg className="w-4 h-4 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Template
                </button>
              )}
            </div>
            {!csvRows && !csvImportResult && (
              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">CSV Format Hints</p>
                  <ul className="text-[11px] text-blue-600/80 dark:text-blue-300/70 space-y-0.5">
                    <li><strong>Section</strong> column must use format: <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">PROGRAM-SECTION</code> or <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">PROGRAM SECTION</code> (e.g., <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">BSIT-32A3</code> or <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">BSIT 32A3</code>)</li>
                    <li><strong>Subject code</strong> must match an existing subject or a new one will be created.</li>
                    <li><strong>Department code</strong> must match an existing department (e.g., <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">CCS</code>).</li>
                  </ul>
                </div>
                <div
                  onClick={() => csvFileRef.current?.click()}
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
                    ref={csvFileRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f) }}
                  />
                </div>
                {csvError && <p className="text-xs font-medium text-red-600 text-center">{csvError}</p>}
              </div>
            )}
            {csvRows && csvRows.length > 0 && (
              <div className="flex flex-col h-full min-h-[24rem]">
                {csvImporting && (
                  <div className="mb-3 space-y-1.5">
                    <div className="w-full bg-slate-200 rounded-full h-2.5">
                      <div className="bg-gold-500 h-2.5 rounded-full transition-all" style={{ width: `${chunkProgress.totalRows > 0 ? Math.round((chunkProgress.doneRows / chunkProgress.totalRows) * 100) : 0}%` }} />
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <p className="text-[11px] text-tertiary text-center">
                        Importing faculty mappings... {chunkProgress.doneRows}/{chunkProgress.totalRows} rows ({chunkProgress.doneChunks}/{chunkProgress.totalChunks} chunks)
                      </p>
                      {chunkRunning && (
                        <button type="button" onClick={() => cancelChunks()} className="text-[11px] font-semibold text-red-600 hover:underline">Cancel</button>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex-1 space-y-3 overflow-hidden">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-secondary">
                      {csvVisibleRows.length} row{csvVisibleRows.length !== 1 ? "s" : ""}
                      {csvProblemFilter && ` (filtered)`}
                    </h4>
                    <span className="text-[11px] text-tertiary">{TEMPLATE_HEADERS}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-[11px] text-tertiary/70 italic">
                      <span className="badge-red not-italic">Red</span> items block import — remove those rows first.
                      <span className="badge-amber not-italic ml-1">Amber</span> items will be newly created.
                    </p>
                    <div className="ml-auto flex items-center gap-2">
                      {blockedCsvRows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setCsvBlockedFilter((p) => !p); setCsvPreviewPage(0) }}
                          className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${
                            csvBlockedFilter
                              ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
                              : "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                          }`}
                        >
                          {csvBlockedFilter ? "Show all rows" : `Show ${blockedCsvRows.length} blocked only`}
                        </button>
                      )}
                      {csvProblemRows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setCsvProblemFilter((p) => !p); setCsvPreviewPage(0) }}
                          className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${
                            csvProblemFilter
                              ? "bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
                              : "border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {csvProblemFilter ? "Show all rows" : `Show ${csvProblemRows.length} flagged only`}
                        </button>
                      )}
                      {invalidDeptRows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setCsvInvalidDeptFilter((p) => !p); setCsvPreviewPage(0) }}
                          className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${
                            csvInvalidDeptFilter
                              ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
                              : "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                          }`}
                        >
                          {csvInvalidDeptFilter ? "Show all rows" : `Show ${invalidDeptRows.length} invalid dept only`}
                        </button>
                      )}
                    </div>
                  </div>
                  {csvError && <p className="text-xs font-medium text-red-600">{csvError}</p>}
                  <div className="max-h-72 overflow-y-auto tbl-container tbl">
                    <table>
                      <thead>
                        <tr>
                          <th className="w-8">#</th>
                          <th>Faculty</th>
                          <th>Subject</th>
                          <th>Section</th>
                          <th>Dept</th>
                          <th>Will Create</th>
                          <th className="w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(csvVisibleRows.slice(csvPreviewPage * PREVIEW_PAGE_SIZE, (csvPreviewPage + 1) * PREVIEW_PAGE_SIZE)).map((row, i) => {
                          const absIdx = csvPreviewPage * PREVIEW_PAGE_SIZE + i
                          return (
                            <tr key={`${csvPreviewPage}-${i}`}>
                              <td className="text-tertiary">{absIdx + 1}</td>
                              <td className="text-secondary text-[13px] whitespace-nowrap">
                                {row.name} <span className="text-tertiary">({row.email})</span>
                              </td>
                              <td className="text-secondary text-[13px] whitespace-nowrap">
                                {row.subjectName} <span className="text-tertiary">({row.subjectCode})</span>
                              </td>
                              <td>
                                <input
                                  value={row.section}
                                  onChange={(e) => handleCsvFieldChange(absIdx, "section", e.target.value)}
                                  disabled={csvImporting}
                                  className="w-full bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px] disabled:opacity-60"
                                />
                              </td>
                              <td>
                                <input
                                  value={row.departmentCode}
                                  onChange={(e) => handleCsvFieldChange(absIdx, "departmentCode", e.target.value)}
                                  disabled={csvImporting}
                                  className={`w-16 bg-surface-dim/50 border border-transparent focus:border-gold-400 rounded-lg px-2 py-1.5 outline-none text-[13px] uppercase disabled:opacity-60 ${row.isInvalidDept ? "text-red-600" : ""}`}
                                />
                              </td>
                              <td className="whitespace-nowrap">
                                <div className="flex flex-wrap gap-1">
                                  {row.isInvalidDept && <span className="badge-red">Dept code</span>}
                                  {!row.isInvalidDept && row.isNewSubject && <span className="badge-amber">Subject</span>}
                                  {!row.isInvalidDept && row.isNewSection && <span className="badge-amber">Section</span>}
                                  {!row.isInvalidDept && row.isNewTeacher && <span className="badge-amber">Teacher</span>}
                                  {!row.isInvalidDept && row.isUnassignedFaculty && <span className="badge-amber">Unassigned</span>}
                                  {!row.isNewSubject && !row.isNewSection && !row.isNewTeacher && !row.isUnassignedFaculty && !row.isInvalidDept && row.isExistingMapping && <span className="badge-red">Already loaded</span>}
                                  {!row.isNewSubject && !row.isNewSection && !row.isNewTeacher && !row.isUnassignedFaculty && !row.isInvalidDept && !row.isExistingMapping && <span className="badge-emerald">Faculty Loading Only</span>}
                                </div>
                              </td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  disabled={csvImporting}
                                  onClick={() => handleCsvRowRemove(absIdx)}
                                  className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                  {Math.ceil(csvVisibleRows.length / PREVIEW_PAGE_SIZE) > 1 && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-tertiary">
                        Page {csvPreviewPage + 1} of {Math.ceil(csvVisibleRows.length / PREVIEW_PAGE_SIZE)}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={csvPreviewPage === 0 || csvImporting}
                          onClick={() => setCsvPreviewPage((p) => p - 1)}
                          className="px-4 py-1.5 bg-surface-dim text-secondary rounded-full text-xs font-semibold hover:bg-surface-dim/70 disabled:opacity-40 transition-colors"
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          disabled={(csvPreviewPage >= Math.ceil(csvVisibleRows.length / PREVIEW_PAGE_SIZE) - 1) || csvImporting}
                          onClick={() => setCsvPreviewPage((p) => p + 1)}
                          className="px-4 py-1.5 bg-surface-dim text-secondary rounded-full text-xs font-semibold hover:bg-surface-dim/70 disabled:opacity-40 transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="sticky bottom-0 pt-4 pb-1 bg-white dark:bg-surface-dim flex items-center gap-3">
                  <IosButton variant="gray" type="button" disabled={csvImporting} onClick={handleCsvReset} className="flex-1">Cancel</IosButton>
                  <IosButton variant="primary" type="button" disabled={!activeSemesterId || csvImporting || csvRows.length === 0 || blockedCsvRows.length > 0 || invalidDeptRows.length > 0} onClick={handleCsvImport} className={`flex-1 ${blockedCsvRows.length > 0 || invalidDeptRows.length > 0 ? "!bg-red-400 !text-white" : ""}`}>
                    {csvImporting ? "Importing..." : blockedCsvRows.length > 0 ? `${blockedCsvRows.length} Already loaded — Remove to import` : invalidDeptRows.length > 0 ? `${invalidDeptRows.length} Invalid dept code — Fix to import` : `Import ${csvRows.length} Row${csvRows.length !== 1 ? "s" : ""}`}
                  </IosButton>
                </div>
              </div>
            )}
            {csvImportResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-5 text-center">
                    <p className="text-2xl font-bold text-emerald-600">{csvImportResult.matched}</p>
                    <p className="text-[11px] font-semibold text-emerald-700/70 dark:text-emerald-300/70">Mappings Matched</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-5 text-center">
                    <p className="text-2xl font-bold text-blue-600">{csvImportResult.createdSubjects}</p>
                    <p className="text-[11px] font-semibold text-blue-700/70 dark:text-blue-300/70">Subjects Created</p>
                  </div>
                  <div className="bg-gold-50 dark:bg-gold-900/20 rounded-2xl p-5 text-center">
                    <p className="text-2xl font-bold text-gold-600">{csvImportResult.createdSections}</p>
                    <p className="text-[11px] font-semibold text-amber-700/70 dark:text-amber-300/70">Sections Created</p>
                  </div>
                </div>
                {lastImportTotal > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl px-5 py-3 space-y-1">
                    <p className="text-xs font-semibold text-secondary">
                      {lastImportTotal} rows sent in {lastImportChunks} chunks · {csvImportResult.matched} mapped · {csvImportResult.errors.length} errors
                    </p>
                    <p className="text-[11px] text-tertiary">
                      Seed 2026-1 reference: 903 loadings · 21,989 enrollments · exactly 1 active semester. Re-running this file should map 0 new rows (idempotent).
                    </p>
                    {(() => {
                      const boxUnaccounted =
                        lastImportTotal -
                        csvImportResult.matched -
                        csvImportResult.errors.filter((e) => e.row > 0).length -
                        (csvImportResult.parseErrors?.length ?? 0)
                      return (
                        <p className={`text-[11px] font-semibold ${boxUnaccounted !== 0 ? "text-red-600" : "text-emerald-600 dark:text-emerald-300"}`}>
                          {boxUnaccounted === 0 ? "All rows accounted for." : `${boxUnaccounted} of ${lastImportTotal} CSV rows unaccounted — retry remaining chunks.`}
                        </p>
                      )
                    })()}
                  </div>
                )}
                {wrongCsv.split("\n").length > 1 && (
                  <button
                    type="button"
                    onClick={() => downloadBlob(wrongCsv, "faculty-wrong-uploads.csv")}
                    className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
                  >
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m4 4V4" />
                    </svg>
                    Download Wrong Uploads (.csv)
                  </button>
                )}
                {csvImportResult.parseErrors && csvImportResult.parseErrors.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-red-100 dark:border-red-800/30">
                      <p className="text-sm font-semibold text-red-700 dark:text-red-300">{csvImportResult.parseErrors.length} Parse Error{csvImportResult.parseErrors.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="px-5 py-3 space-y-2 max-h-40 overflow-y-auto">
                      {csvImportResult.parseErrors.map((e, i) => (
                        <p key={`pe-${i}`} className="text-xs text-red-600 dark:text-red-400">Row {e.row}: {e.message}</p>
                      ))}
                    </div>
                  </div>
                )}
                {csvImportResult.errors && csvImportResult.errors.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-amber-100 dark:border-amber-800/30">
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{csvImportResult.errors.length} Import Error{csvImportResult.errors.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="px-5 py-3 space-y-2 max-h-40 overflow-y-auto">
                      {csvImportResult.errors.map((e, i) => (
                        <p key={`e-${i}`} className="text-xs text-amber-700 dark:text-amber-400">Row {e.row}: {e.email ? `${e.email} — ` : ""}{e.message}</p>
                      ))}
                    </div>
                  </div>
                )}
                {(!csvImportResult.errors || csvImportResult.errors.length === 0) && csvImportResult.matched > 0 && (
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl px-5 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-200 dark:bg-emerald-700 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-emerald-700 dark:text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">All rows processed successfully.</p>
                  </div>
                )}
                <IosButton variant="gray" type="button" onClick={handleCsvReset} className="w-full">Import Another File</IosButton>
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      <div className="border border-default rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAddForm((s) => !s)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-dim/40 transition-colors"
        >
          <span>Faculty Loading</span>
          <span className="text-tertiary">{showAddForm ? "▲" : "▼"}</span>
        </button>
        {showAddForm && (
        <div className="border-t border-default px-3 pb-3">
          <form onSubmit={handleAdd} className="space-y-4 pt-3">
            {formError && <p className="text-xs font-medium text-red-600 bg-red-50 p-2 rounded">{formError}</p>}
            {formSuccess && <p className="text-xs font-medium text-green-600 bg-green-50 p-2 rounded">{formSuccess}</p>}
            {!activeSemesterId && <p className="text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded flex items-center gap-2"><span>⚠️</span> No active semester. Set one as active before adding faculty load entries.</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-tertiary mb-1">Department</label>
                <select value={formDept} onChange={(e) => { setFormDept(e.target.value); setFormFaculty(""); setFacultySearch("") }} className="w-full text-sm bg-surface border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="all">All Departments</option>
                  {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                </select>
              </div>
              <div className="relative">
                <label className="block text-xs font-semibold text-tertiary mb-1">Faculty</label>
                <input
                  value={facultySearch || selectedFacultyName}
                  onChange={(e) => { setFacultySearch(e.target.value); setFormFaculty(""); setFacultyDropdownOpen(true) }}
                  onFocus={() => setFacultyDropdownOpen(true)}
                  placeholder="Search faculty..."
                  className="w-full text-sm bg-surface border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                  autoComplete="off"
                />
                {facultyDropdownOpen && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-surface border border-strong rounded-lg shadow-xl max-h-52 overflow-y-auto">
                    {filteredFaculties.length === 0 ? (
                      <p className="text-xs text-tertiary text-center py-4">No faculty found</p>
                    ) : (
                      filteredFaculties.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => { setFormFaculty(f.id); setFacultySearch(""); setFacultyDropdownOpen(false) }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-hover transition-colors ${formFaculty === f.id ? "bg-amber-50 dark:bg-amber-900/20 font-semibold" : ""}`}
                        >
                          <span className="text-primary">{f.name}</span>
                          <span className="text-tertiary ml-1 text-xs">{f.email}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-tertiary mb-1">Subject</label>
                <select value={formSubject} onChange={(e) => { setFormSubject(e.target.value) }} className="w-full text-sm bg-surface border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" required>
                  <option value="">Select subject...</option>
                  {subjects.map((s) => (<option key={s.id} value={s.id}>{s.code} - {s.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-tertiary mb-1">Section</label>
                <select value={formSection} onChange={(e) => { setFormSection(e.target.value) }} className="w-full text-sm bg-surface border border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400" required>
                  <option value="">Select section...</option>
                  {sections.map((s) => (<option key={s.id} value={s.id}>{s.program} - {s.name}</option>))}
                </select>
              </div>
            </div>
            <div className="pt-2"><IosButton type="submit" loading={formSaving} disabled={!activeSemesterId} variant="primary">Create Faculty Load Entry</IosButton></div>
          </form>
        </div>
        )}
      </div>

      {/* Department Filter */}
      <div className="card p-4 sm:p-6 bg-surface space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {deptPills.map((pill) => {
            const active = deptFilter === pill.id
            return (
              <button
                key={pill.id}
                onClick={() => {
                  if (!isAdmin && pill.id !== currentUserDept) return
                  setDeptFilter(pill.id)
                }}
                disabled={!isAdmin && pill.id !== currentUserDept}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${active
                    ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                    : "bg-surface text-tertiary border-default hover:border-amber-300 hover:text-secondary"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {pill.label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          {[
            { key: "by_faculty" as FacViewTab, label: "By Faculty" },
            { key: "by_subject_section" as FacViewTab, label: "By Subject & Section" },
          ].map((pill) => {
            const active = viewTab === pill.key
            return (
              <button
                key={pill.key}
                onClick={() => setViewTab(pill.key)}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                  active
                    ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                    : "bg-surface text-tertiary border-default hover:border-amber-300 hover:text-secondary"
                }`}
              >
                {pill.label}
              </button>
            )
          })}
        </div>

        {hasNullSemesterId && (
          <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5">
            <span>⚠️</span>
            <span>Some mappings are missing semesterId — affected faculty will not appear in student evaluations.</span>
          </div>
        )}
        <SearchInput value={search} onChange={(v) => { setSearch(v) }} placeholder={viewTab === "by_faculty" ? "Search by faculty name, email, subject code, or section..." : "Search by subject code, subject name, section, or faculty..."} />
        {loading && !data ? (
          <SkeletonTable rows={4} cols={viewTab === "by_faculty" ? 4 : 6} />
        ) : filtered.length === 0 ? (
          <p className="text-xs text-tertiary text-center py-8">No mappings found.</p>
        ) : viewTab === "by_faculty" ? (
          <>
            <div ref={tableRef} className="desktop-only max-h-96 overflow-y-auto tbl-container tbl">
              <table>
                <thead>
                  <tr>
                    <th>Faculty</th>
                    <th>Email</th>
                  
                    <th>Headcount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((group) => {
                    const headcount = group.mappings.reduce((sum, m) => sum + (enrollmentCountByFsId.get(m.id) ?? 0), 0)
                    return (
                      <tr key={group.faculty.id}>
                        <td className="font-medium text-secondary">{group.faculty.name}</td>
                        <td className="text-tertiary">{group.faculty.email}</td>
        
                        <td>
                          <span className="font-semibold text-secondary">{headcount}</span>
                        </td>
                        <td>
                          <IosButton variant="plain" size="xs" onClick={() => setSelectedFacultyLoad(group.mappings)}>View Class Load</IosButton>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mobile-only space-y-2">
              {paginatedItems.map((group) => {
                const headcount = group.mappings.reduce((sum, m) => sum + (enrollmentCountByFsId.get(m.id) ?? 0), 0)
                return (
                  <div key={group.faculty.id} className="p-4 rounded-xl bg-surface border border-default space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-primary truncate">{group.faculty.name}</p>
                        <p className="text-xs text-tertiary truncate">{group.faculty.email}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-xs font-semibold text-secondary">{group.mappings.length} Subject{group.mappings.length !== 1 ? "s" : ""}</span>
                        <span className="block text-xs text-tertiary">{headcount} Student{headcount !== 1 ? "s" : ""}</span>
                        <IosButton variant="plain" size="xs" onClick={() => setSelectedFacultyLoad(group.mappings)}>View</IosButton>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <Paginator page={page} totalPages={totalPages} pageSize={pageSize} totalItems={groupedFaculty.length} setPage={setPage} setPageSize={setPageSize} />
          </>
        ) : (
          <>
            <div className="desktop-only max-h-96 overflow-y-auto tbl-container tbl">
              <table>
                <thead>
                  <tr>
                    <th>Subject Code</th>
                    <th>Subject Name</th>
                    <th>Section</th>
                    <th>Faculty</th>
                    <th>Email</th>
                    <th className="text-center">Headcount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ssPagination.paginatedItems.map((m) => {
                    const hc = enrollmentCountByFsId.get(m.id) ?? 0
                    return (
                      <tr key={m.id}>
                        <td className="font-mono text-xs font-semibold text-secondary">{m.subject.code}</td>
                        <td className="text-secondary">{m.subject.name}</td>
                        <td className="text-secondary">{m.section.program}-{m.section.name}</td>
                        <td className="font-medium text-secondary">{m.faculty.name}</td>
                        <td className="text-tertiary">{m.faculty.email}</td>
                        <td className="text-center font-semibold text-secondary">{hc}</td>
                        <td>
                          <IosButton variant="plain" size="xs" onClick={() => setSelectedSsMapping(m)}>Edit</IosButton>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mobile-only space-y-2">
              {ssPagination.paginatedItems.map((m) => {
                const hc = enrollmentCountByFsId.get(m.id) ?? 0
                return (
                  <div key={m.id} className="p-4 rounded-xl bg-surface border border-default">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-primary truncate">{m.subject.code} - {m.subject.name}</p>
                        <p className="text-xs text-tertiary truncate">{m.section.program}-{m.section.name}</p>
                        <p className="text-xs text-secondary truncate mt-1">{m.faculty.name}</p>
                        <p className="text-xs text-tertiary truncate">{m.faculty.email}</p>
                      </div>
                      <div className="shrink-0 text-right flex flex-col items-end gap-1">
                        <span className="text-xs font-semibold text-secondary">{hc} student{hc !== 1 ? "s" : ""}</span>
                        <IosButton variant="plain" size="xs" onClick={() => setSelectedSsMapping(m)}>Edit</IosButton>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <Paginator page={ssPagination.page} totalPages={ssPagination.totalPages} pageSize={ssPagination.pageSize} totalItems={flatData.length} setPage={ssPagination.setPage} setPageSize={ssPagination.setPageSize} />
          </>
        )}
        {data && (
          <p className="text-xs text-tertiary">
            {viewTab === "by_faculty"
              ? `${groupedFaculty.length} facult${groupedFaculty.length !== 1 ? "ies" : "y"} (${filtered.length} mapping${filtered.length !== 1 ? "s" : ""})`
              : `${flatData.length} record${flatData.length !== 1 ? "s" : ""}`
            }
            {deptFilter !== "all" ? ` (${byDept.length} in department)` : ""}
          </p>
        )}
      </div>

      {/* ── Subject-Section Detail Modal ────────────────────── */}
      {selectedSsMapping && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-12 bg-black/60" onClick={closeSubjectSectionModal}>
          <div className="bg-white dark:bg-surface-dim rounded-2xl w-full max-w-4xl mx-4 shadow-2xl border border-default overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-default">
              <div className="min-w-0">
                <p className="text-sm font-bold text-secondary truncate">{selectedSsMapping.subject.code} - {selectedSsMapping.subject.name}</p>
                <p className="text-xs text-tertiary truncate">{selectedSsMapping.section.program}-{selectedSsMapping.section.name} · {selectedSsMapping.faculty.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/data/academic-infrastructure/faculty-enroll/${selectedSsMapping.id}`}
                  className="text-xs text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Edit in page
                </Link>
                <IosButton variant="gray" size="xs" onClick={closeSubjectSectionModal}>
                  <svg className="w-4 h-4 text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </IosButton>
              </div>
            </div>
            <div className="p-4 max-h-[80vh] overflow-y-auto">
              <FacultySubjectDetail mapping={selectedSsMapping} onClose={() => { setSelectedSsMapping(null); fetchData(true) }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Faculty Load Modal ─────────────────────────────── */}
      {selectedFacultyLoad && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 bg-black/60" onClick={() => setSelectedFacultyLoad(null)}>
          <div className="bg-white dark:bg-surface-dim rounded-2xl w-full max-w-2xl mx-4 shadow-2xl border border-default overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-default">
              <div className="min-w-0">
                <p className="text-sm font-bold text-secondary truncate">{selectedFacultyLoad[0].faculty.name}</p>
                <p className="text-xs text-tertiary truncate">{selectedFacultyLoad.length} subject load{selectedFacultyLoad.length !== 1 ? "s" : ""}</p>
              </div>
              <IosButton variant="gray" size="xs" onClick={() => setSelectedFacultyLoad(null)}>
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
                    <th>Subject</th>
                    <th>Section</th>
                    <th className="text-center">HeadCount</th>
                    <th className="w-20 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {facultyLoadPagination.paginatedItems.map((m, i) => {
                    const hc = enrollmentCountByFsId.get(m.id) ?? 0
                    return (
                      <tr key={m.id}>
                        <td className="text-tertiary">{i + 1}</td>
                        <td>
                          <span className="font-medium text-secondary">{m.subject.code}</span>
                          <span className="text-tertiary ml-1">- {m.subject.name}</span>
                        </td>
                        <td className="text-secondary">{m.section.program}-{m.section.name}</td>
                        <td className="text-center font-semibold text-secondary">
                          {hc}
                          {!m.semesterId && <span className="ml-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">no semester</span>}
                        </td>
                        <td className="text-center">
                          <Link href={`/admin/data/academic-infrastructure/faculty-enroll/${m.id}`} className="text-xs text-amber-600 hover:text-amber-700 font-semibold">Edit</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="mobile-only space-y-1.5">
                {facultyLoadPagination.paginatedItems.map((m, i) => {
                  const hc = enrollmentCountByFsId.get(m.id) ?? 0
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-2 py-2 rounded-lg bg-surface-hover/50 text-xs">
                      <span className="text-tertiary font-mono w-5 shrink-0 text-right">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-secondary truncate">{m.subject.code} - {m.subject.name}</p>
                        <p className="text-tertiary truncate">{m.section.program}-{m.section.name}</p>
                      </div>
                        <span className="shrink-0 text-right text-xs font-semibold text-secondary">{hc} student{hc !== 1 ? "s" : ""}{!m.semesterId && <span className="ml-1 text-[10px] font-semibold text-amber-600">⚠️</span>}</span>
                        <Link href={`/admin/data/academic-infrastructure/faculty-enroll/${m.id}`} className="shrink-0 text-xs text-amber-600 hover:text-amber-700 font-semibold ml-1">Edit</Link>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-3 border-t border-default bg-surface-dim text-xs text-tertiary">
              <span>{selectedFacultyLoad.length} subject load{selectedFacultyLoad.length !== 1 ? "s" : ""}</span>
              <Paginator page={facultyLoadPagination.page} totalPages={facultyLoadPagination.totalPages} pageSize={facultyLoadPagination.pageSize} totalItems={selectedFacultyLoad.length} setPage={facultyLoadPagination.setPage} setPageSize={facultyLoadPagination.setPageSize} showSizeSelector={false} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
