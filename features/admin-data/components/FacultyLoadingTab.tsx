"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import Link from "next/link"
import { useApiGet } from "@/lib/api/client"
import { usePagination, Paginator } from "@/components/ui/Paginator"
import { SkeletonTable } from "@/components/ui/Skeleton"
import IosButton from "@/components/ui/IosButton"
import LockedTab from "@/components/ui/LockedTab"
import { StepperTrace, StepPanel } from "./FacultyImportStepper"
import { SegmentedControl, SearchInput } from "./shared"
import { EnrollmentsTab } from "./EnrollmentsTab"
import { FacultySubjectDetail } from "./FacultySubjectDetail"
import type { DepartmentData, SemesterData } from "@/lib/types"
import type { FacEnrollTab, FacViewTab, Subject, Section, FacultyMapping, Enrollment } from "./types"
import { deriveCsvFlags, DUMMY_FACULTY_EMAIL_CLIENT, type CsvRow, type CsvRowWithFlags } from "./csv-helpers"
import { cleanSubjectCode, isExcelErrorCell } from "@/lib/csv-utils"
import { useChunkedImport, decodeCsvFile, withRetryHints, type ChunkMeta } from "./useChunkedImport"

const IMPORT_STEPS = [
  { id: "departments", label: "Departments" },
  { id: "courses", label: "Courses" },
  { id: "sections", label: "Sections" },
  { id: "subjects", label: "Subjects" },
  { id: "faculty-users", label: "Faculty users" },
  { id: "mappings", label: "Mappings" },
]

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
  // Synchronous double-click guard: disabled={csvImporting} only applies after
  // re-render, so rapid clicks in the same tick could double-fire the run.
  const csvImportGuardRef = useRef(false)
  const [csvRows, setCsvRows] = useState<CsvRowWithFlags[] | null>(null)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvImportResult, setCsvImportResult] = useState<{
    matched: number
    errors: { row: number; email?: string; message: string }[]
    skipped: { row: number; email?: string; message: string }[] | undefined
    createdSubjects: number
    createdSections: number
    parseErrors?: { row: number; message: string }[]
  } | null>(null)
  const [step2Running, setStep2Running] = useState(false)
  const [step2Result, setStep2Result] = useState<{
    stepId: string
    status: string
    inserted: number
    existing: number
    invalid: { key: string; reason: string }[]
    deptCodeToId: Record<string, string>
  } | null>(null)
  const [step3Running, setStep3Running] = useState(false)
  const [step3Result, setStep3Result] = useState<{
    stepId: string
    status: string
    inserted: number
    existing: number
    invalid: { key: string; reason: string }[]
    programToCourseId: Record<string, string>
  } | null>(null)
  const [step4Running, setStep4Running] = useState(false)
  const [step4Result, setStep4Result] = useState<{
    stepId: string
    status: string
    inserted: number
    existing: number
    invalid: { key: string; reason: string }[]
    sectionKeyToId: Record<string, string>
  } | null>(null)
  const [step5Running, setStep5Running] = useState(false)
  const [step5Result, setStep5Result] = useState<{
    stepId: string
    status: string
    inserted: number
    existing: number
    invalid: { key: string; reason: string }[]
    subjectCodeToId: Record<string, string>
  } | null>(null)
  const [step6Running, setStep6Running] = useState(false)
  const [step6Result, setStep6Result] = useState<{
    stepId: string
    status: string
    inserted: number
    existing: number
    invalid: { key: string; reason: string }[]
    facultyUserMap: Record<string, string>
  } | null>(null)
  const [step7Running, setStep7Running] = useState(false)
  const [step7Result, setStep7Result] = useState<{
    stepId: string
    status: string
    inserted: number
    existing: number
    invalid: { key: string; reason: string }[]
  } | null>(null)
  const [step7Progress, setStep7Progress] = useState<{
    doneChunks: number
    totalChunks: number
    doneRows: number
    totalRows: number
    history: { chunkIndex: number; rows: number; saved: number; skipped: number; issues: number; ok: boolean }[]
  } | null>(null)
  const [csvError, setCsvError] = useState("")
  const [csvPreviewPage, setCsvPreviewPage] = useState(0)
  const [lastImportTotal, setLastImportTotal] = useState(0)
  const [lastImportChunks, setLastImportChunks] = useState(0)
  const [wrongCsv, setWrongCsv] = useState("")
  const [skippedCsv, setSkippedCsv] = useState("")
  const [removedRows, setRemovedRows] = useState<CsvRow[]>([])
  const [csvProblemFilter, setCsvProblemFilter] = useState(false)
  const [csvBlockedFilter, setCsvBlockedFilter] = useState(false)
  const [csvInvalidDeptFilter, setCsvInvalidDeptFilter] = useState(false)
  const [csvInvalidValueFilter, setCsvInvalidValueFilter] = useState(false)
  const PREVIEW_PAGE_SIZE = 50
  interface FacultyChunkResult {
    matched: number
    errors: { row: number; email?: string; message: string }[]
    skipped?: { row: number; email?: string; message: string }[]
    createdSubjects: number
    createdSections: number
    parseErrors?: { row: number; message: string }[]
  }
  const FACULTY_CHUNK_SIZE = 100
  const { isRunning: chunkRunning, progress: chunkProgress, history: chunkHistory, run: runChunks, cancel: cancelChunks } =
    useChunkedImport<CsvRow, FacultyChunkResult>()
  // Eased intra-chunk motion (option A): the transport only reports per chunk,
  // so while a chunk is in flight the bar tweens toward 90% of that chunk's
  // share and snaps on resolve. Counts stay truthful (real done/total); only
  // the bar position is estimated, and it can never reach 100% early.
  const [easedRows, setEasedRows] = useState(0)
  const progDoneRows = chunkProgress.doneRows
  const progTotalRows = chunkProgress.totalRows
  useEffect(() => {
    if (!csvImporting || progTotalRows <= 0) return
    const timer = setInterval(() => {
      setEasedRows((prev) => {
        const cur = Math.min(FACULTY_CHUNK_SIZE, progTotalRows - progDoneRows)
        const ceiling = progDoneRows + 0.9 * cur
        const creep = Math.max((ceiling - prev) * 0.08, progTotalRows * 0.002)
        return Math.min(Math.max(prev + creep, progDoneRows), ceiling)
      })
    }, 150)
    return () => clearInterval(timer)
  }, [csvImporting, progDoneRows, progTotalRows, FACULTY_CHUNK_SIZE])

  // Amber "needs attention" set — includes unassigned, excludes all reds.
  const csvProblemRows = useMemo(() => {
    if (!csvRows) return []
    return csvRows.filter((r) => r.isNewSubject || r.isNewSection || r.isNewTeacher || r.isUnassignedFaculty)
  }, [csvRows])

  const blockedCsvRows = useMemo(() => {
    if (!csvRows) return []
    return csvRows.filter((r) => r.isExistingMapping)
  }, [csvRows])

  const invalidDeptRows = useMemo(() => {
    if (!csvRows) return []
    return csvRows.filter((r) => r.isInvalidDept)
  }, [csvRows])

  const invalidValueRows = useMemo(() => {
    if (!csvRows) return []
    return csvRows.filter((r) => r.isInvalidValue)
  }, [csvRows])

  const unimportableCsvRows = useMemo(() => {
    if (!csvRows) return []
    return csvRows.filter((r) => r.isExistingMapping || r.isInvalidDept || r.isInvalidValue)
  }, [csvRows])

  const unassignedCsvRows = useMemo(() => csvRows?.filter((r) => r.isUnassignedFaculty) ?? [], [csvRows])
  const invalidCsvRows = useMemo(() => csvRows?.filter((r) => r.isInvalidDept || r.isInvalidValue) ?? [], [csvRows])
  const readyCsvRows = useMemo(() => csvRows?.filter((r) => !r.isExistingMapping && !r.isInvalidDept && !r.isInvalidValue) ?? [], [csvRows])

  const escapePreviewCell = (v: string) => (v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v)

  const csvVisibleRows = csvRows
    ? csvRows.filter((r) => {
        if (csvInvalidValueFilter) return r.isInvalidValue
        if (csvInvalidDeptFilter) return r.isInvalidDept
        if (csvProblemFilter && csvBlockedFilter) return r.isNewSubject || r.isNewSection || r.isNewTeacher || r.isUnassignedFaculty || r.isInvalidDept || r.isInvalidValue || r.isExistingMapping
        if (csvProblemFilter) return r.isNewSubject || r.isNewSection || r.isNewTeacher || r.isUnassignedFaculty
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

  useEffect(() => {
    if (!csvImporting) return
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", guard)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("beforeunload", guard)
      document.body.style.overflow = prevOverflow
    }
  }, [csvImporting])

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
        subjectCode: cleanSubjectCode(cols[3]),
        section: cols[2],
        subjectName: cols[4],
        departmentCode: cols[5].toUpperCase().trim(),
      })
    }
    return { rows }
  }

  const handleCsvFile = async (file: File) => {
    setCsvImportResult(null)
    setStep2Result(null)
    setStep3Result(null)
    setStep4Result(null)
    setStep5Result(null)
    setStep6Result(null)
    setStep7Result(null)
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

  const handleStep2Departments = async () => {
    if (!csvRows || csvRows.length === 0 || step2Running) return
    setStep2Running(true)
    try {
      const items = [...new Set(csvRows.map((r) => (r.departmentCode || "").trim().toUpperCase()))]
      const res = await fetch("/api/import/faculties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "departments",
          semesterId: activeSemesterId || null,
          fileId: `step2-${Date.now().toString(36)}`,
          items,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error || "Step 1 failed")
      }
      const json = await res.json()
      setStep2Result({
        stepId: json.stepId ?? "departments",
        status: json.status ?? "done",
        inserted: json.inserted ?? 0,
        existing: json.existing ?? 0,
        invalid: json.invalid ?? [],
        deptCodeToId: json.deptCodeToId ?? {},
      })
    } catch (err) {
      setCsvError((err as Error).message)
    } finally {
      setStep2Running(false)
    }
  }

  const handleStep3Courses = async () => {
    if (!csvRows || csvRows.length === 0 || step3Running) return
    if (!step2Result) { setCsvError("Run Step 1 first — courses need the department map."); return }
    setStep3Running(true)
    try {
      const seen = new Set<string>()
      const pairs: { departmentCode: string; program: string }[] = []
      for (const r of csvRows) {
        const tSection = (r.section || "").trim()
        const dashIdx = tSection.indexOf("-")
        const spaceIdx = tSection.indexOf(" ")
        const idx = dashIdx !== -1 ? dashIdx : spaceIdx
        const program = idx === -1 ? "" : tSection.slice(0, idx).trim()
        if (program.length === 0) continue
        const departmentCode = (r.departmentCode || "").trim().toUpperCase()
        const key = `${departmentCode}|${program}`
        if (seen.has(key)) continue
        seen.add(key)
        pairs.push({ departmentCode, program })
      }
      const res = await fetch("/api/import/faculties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "courses",
          semesterId: activeSemesterId || null,
          fileId: `step3-${Date.now().toString(36)}`,
          pairs,
          deptCodeToId: step2Result.deptCodeToId,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error || "Step 2 failed")
      }
      const json = await res.json()
      setStep3Result({
        stepId: json.stepId ?? "courses",
        status: json.status ?? "done",
        inserted: json.inserted ?? 0,
        existing: json.existing ?? 0,
        invalid: json.invalid ?? [],
        programToCourseId: json.programToCourseId ?? {},
      })
    } catch (err) {
      setCsvError((err as Error).message)
    } finally {
      setStep3Running(false)
    }
  }

  const handleStep4Sections = async () => {
    if (!csvRows || csvRows.length === 0 || step4Running) return
    if (!step3Result) { setCsvError("Run Step 2 first — sections need the course map."); return }
    setStep4Running(true)
    try {
      const seen = new Set<string>()
      const items: { name: string; program: string }[] = []
      for (const r of csvRows) {
        const tSection = (r.section || "").trim()
        const dashIdx = tSection.indexOf("-")
        const spaceIdx = tSection.indexOf(" ")
        const idx = dashIdx !== -1 ? dashIdx : spaceIdx
        // No separator parses to program "" — sent so the server flags it
        // invalid (never inserted), per step-04 edge cases.
        const program = idx === -1 ? "" : tSection.slice(0, idx).trim()
        const name = idx === -1 ? tSection : tSection.slice(idx + 1).trim()
        const key = `${name}|${program}`
        if (seen.has(key)) continue
        seen.add(key)
        items.push({ name, program })
      }
      const res = await fetch("/api/import/faculties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "sections",
          semesterId: activeSemesterId || null,
          fileId: `step4-${Date.now().toString(36)}`,
          items,
          programToCourseId: step3Result.programToCourseId,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error || "Step 3 failed")
      }
      const json = await res.json()
      setStep4Result({
        stepId: json.stepId ?? "sections",
        status: json.status ?? "done",
        inserted: json.inserted ?? 0,
        existing: json.existing ?? 0,
        invalid: json.invalid ?? [],
        sectionKeyToId: json.sectionKeyToId ?? {},
      })
    } catch (err) {
      setCsvError((err as Error).message)
    } finally {
      setStep4Running(false)
    }
  }

  const handleStep5Subjects = async () => {
    if (!csvRows || csvRows.length === 0 || step5Running) return
    if (!step4Result) { setCsvError("Run Step 3 first — subjects follow convention order."); return }
    setStep5Running(true)
    try {
      const items = [...new Set(csvRows.map((r) => (r.subjectCode || "").trim()).filter((c) => c.length > 0))]
      const res = await fetch("/api/import/faculties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "subjects",
          semesterId: activeSemesterId || null,
          fileId: `step5-${Date.now().toString(36)}`,
          items,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error || "Step 4 failed")
      }
      const json = await res.json()
      setStep5Result({
        stepId: json.stepId ?? "subjects",
        status: json.status ?? "done",
        inserted: json.inserted ?? 0,
        existing: json.existing ?? 0,
        invalid: json.invalid ?? [],
        subjectCodeToId: json.subjectCodeToId ?? {},
      })
    } catch (err) {
      setCsvError((err as Error).message)
    } finally {
      setStep5Running(false)
    }
  }

  const handleStep6FacultyUsers = async () => {
    if (!csvRows || csvRows.length === 0 || step6Running) return
    if (!step2Result) { setCsvError("Run Step 1 first — faculty users need the department map."); return }
    if (!step5Result) { setCsvError("Run Step 4 first — faculty users follow convention order."); return }
    setStep6Running(true)
    try {
      // Blank emails collapse onto the dummy BEFORE dedupe (902 blanks → 1);
      // the dummy name is fixed, which subsumes the Excel-error narrow rule.
      const seen = new Set<string>()
      const items: { email: string; name: string; departmentCode: string }[] = []
      for (const r of csvRows) {
        const rawEmail = (r.email || "").toLowerCase().trim()
        const key = rawEmail.length === 0 ? DUMMY_FACULTY_EMAIL_CLIENT : rawEmail
        if (seen.has(key)) continue
        seen.add(key)
        const isDummy = key === DUMMY_FACULTY_EMAIL_CLIENT
        items.push({
          email: key,
          name: isDummy ? "Unassigned Faculty" : (r.name || ""),
          departmentCode: (r.departmentCode || "").trim().toUpperCase(),
        })
      }
      const res = await fetch("/api/import/faculties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "faculty-users",
          semesterId: activeSemesterId || null,
          fileId: `step6-${Date.now().toString(36)}`,
          items,
          deptCodeToId: step2Result.deptCodeToId,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error || "Step 5 failed")
      }
      const json = await res.json()
      setStep6Result({
        stepId: json.stepId ?? "faculty-users",
        status: json.status ?? "done",
        inserted: json.inserted ?? 0,
        existing: json.existing ?? 0,
        invalid: json.invalid ?? [],
        facultyUserMap: json.facultyUserMap ?? {},
      })
    } catch (err) {
      setCsvError((err as Error).message)
    } finally {
      setStep6Running(false)
    }
  }

  const handleStep7Mappings = async () => {
    if (!csvRows || csvRows.length === 0 || step7Running) return
    if (!step4Result) { setCsvError("Run Step 3 first — mappings need the section map."); return }
    if (!step5Result) { setCsvError("Run Step 4 first — mappings need the subject map."); return }
    if (!step6Result) { setCsvError("Run Step 5 first — mappings need the faculty map."); return }
    setStep7Running(true)
    try {
      const seen = new Set<string>()
      const items: { subjectCode: string; sectionName: string; sectionProgram: string; facultyEmail: string }[] = []
      for (const r of csvRows) {
        const tSection = (r.section || "").trim()
        const dashIdx = tSection.indexOf("-")
        const spaceIdx = tSection.indexOf(" ")
        const idx = dashIdx !== -1 ? dashIdx : spaceIdx
        const program = idx === -1 ? "" : tSection.slice(0, idx).trim()
        const name = idx === -1 ? tSection : tSection.slice(idx + 1).trim()
        const subjectCode = (r.subjectCode || "").trim()
        const email = (r.email || "").toLowerCase().trim()
        const key = `${subjectCode}|${name}|${program}|${email}`
        if (seen.has(key)) continue
        seen.add(key)
        items.push({ subjectCode, sectionName: name, sectionProgram: program, facultyEmail: email })
      }

      const CHUNK = 100
      const chunks: typeof items[] = []
      for (let i = 0; i < items.length; i += CHUNK) {
        chunks.push(items.slice(i, i + CHUNK))
      }

      const fileId = `step7-${Date.now().toString(36)}`
      let inserted = 0
      let existing = 0
      const invalid: { key: string; reason: string }[] = []
      const history: { chunkIndex: number; rows: number; saved: number; skipped: number; issues: number; ok: boolean }[] = []

      for (let i = 0; i < chunks.length; i++) {
        setStep7Progress({
          doneChunks: i,
          totalChunks: chunks.length,
          doneRows: i * CHUNK,
          totalRows: items.length,
          history: [...history],
        })
        try {
          const res = await fetch("/api/import/faculties", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              step: "mappings",
              semesterId: activeSemesterId || null,
              fileId,
              chunkIndex: i,
              totalChunks: chunks.length,
              items: chunks[i],
              sectionKeyToId: step4Result.sectionKeyToId,
              subjectCodeToId: step5Result.subjectCodeToId,
              facultyUserMap: step6Result.facultyUserMap,
            }),
          })
          if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            throw new Error((d as { error?: string }).error || `Chunk ${i + 1} failed`)
          }
          const json = await res.json()
          inserted += json.inserted ?? 0
          existing += json.existing ?? 0
          invalid.push(...(json.invalid ?? []))
          history.push({
            chunkIndex: i,
            rows: chunks[i].length,
            saved: json.inserted ?? 0,
            skipped: json.existing ?? 0,
            issues: (json.invalid ?? []).length,
            ok: true,
          })
        } catch (err) {
          history.push({
            chunkIndex: i,
            rows: chunks[i].length,
            saved: 0,
            skipped: 0,
            issues: 0,
            ok: false,
          })
          throw err
        }
      }

      setStep7Progress(null)
      setStep7Result({
        stepId: "mappings",
        status: "done",
        inserted,
        existing,
        invalid,
      })
    } catch (err) {
      setCsvError((err as Error).message)
    } finally {
      setStep7Running(false)
    }
  }

  const handleCsvImport = async () => { // eslint-disable-line @typescript-eslint/no-unused-vars
    if (!csvRows || csvRows.length === 0) return
    if (csvImportGuardRef.current) return
    csvImportGuardRef.current = true
    setCsvImporting(true); setEasedRows(0); setCsvImportResult(null); setCsvError(""); setWrongCsv(""); setSkippedCsv(""); setRemovedRows([])
    setLastImportTotal(csvRows.length); setLastImportChunks(Math.ceil(csvRows.length / 100))
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
          throw withRetryHints(new Error((d as { error?: string }).error || `Chunk ${meta.chunkIndex + 1} failed`), res)
        }
        return (await res.json()) as FacultyChunkResult
      }
      const { results, cancelled, failedChunks, stoppedEarly } = await runChunks(csvRows, {
        // Small batches so the bar and row/chunk counters tick visibly
        // (500-row chunks hid progress for ~1.8%/chunk on a 28k-row file).
        chunkSize: FACULTY_CHUNK_SIZE,
        restMs: 150,
        postChunk,
        summarizeResult: (r) => ({ saved: r.matched ?? 0, skipped: r.skipped?.length ?? 0, issues: (r.errors?.length ?? 0) + (r.parseErrors?.length ?? 0) }),
      })
      if (cancelled) { setCsvError(`Import cancelled after ${results.length} chunks — no partial state hidden, retry to resume`); return }
      const offsetRows = <T extends { row: number }>(list: T[], ci: number): T[] =>
        list.map((e) => (e.row === 0 ? e : { ...e, row: e.row + ci * FACULTY_CHUNK_SIZE }))
      const deadChunkEntries = failedChunks.flatMap((fc) =>
        csvRows.slice(fc.meta.rowOffset, fc.meta.rowOffset + FACULTY_CHUNK_SIZE).map((r, j) => ({
          row: fc.meta.rowOffset + j + 1,
          email: r.email,
          message: `Chunk ${fc.meta.chunkIndex + 1} failed after ${fc.attempts} attempts: ${fc.error}`,
        })),
      )
      const aggregated: FacultyChunkResult = {
        matched: results.reduce((s, r) => s + (r.matched ?? 0), 0),
        createdSubjects: results.reduce((s, r) => s + (r.createdSubjects ?? 0), 0),
        createdSections: results.reduce((s, r) => s + (r.createdSections ?? 0), 0),
        errors: [...results.flatMap((r, ci) => offsetRows(r.errors ?? [], ci)), ...deadChunkEntries],
        skipped: results.flatMap((r, ci) => offsetRows(r.skipped ?? [], ci)),
        parseErrors: results.flatMap((r, ci) => offsetRows(r.parseErrors ?? [], ci)),
      }
      setCsvImportResult({ ...aggregated, skipped: aggregated.skipped ?? [] })
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
      const skippedLines = (aggregated.skipped ?? []).map((e) => {
        const src = e.row > 0 ? csvRows[e.row - 1] : undefined
        return [e.row > 0 ? String(e.row) : "", src?.name ?? "", e.email ?? src?.email ?? "", src?.subjectCode ?? "", src?.subjectName ?? "", src?.section ?? "", src?.departmentCode ?? "", e.message].map(escapeWrongCell).join(",")
      })
      setSkippedCsv([wrongHead.map(escapeWrongCell).join(","), ...skippedLines].join("\n"))
      if (removedRows.length > 0) {
        const removedHead = ["faculty email", "name", "section", "subject code", "subject name", "department code"]
        const removedLines = removedRows.map((r) => [r.email, r.name, r.section, r.subjectCode, r.subjectName, r.departmentCode].map(escapeWrongCell).join(","))
        downloadBlob([removedHead.map(escapeWrongCell).join(","), ...removedLines].join("\n"), "faculty-removed-rows.csv")
      }
      const rowErrorCount =
        aggregated.errors.filter((e) => e.row > 0).length +
        (aggregated.parseErrors?.length ?? 0) +
        (aggregated.skipped?.length ?? 0)
      const unaccounted = csvRows.length - aggregated.matched - rowErrorCount
      if (stoppedEarly) {
        setCsvError("Stopped early after 3 consecutive chunk failures — completed chunks persisted. Retry the rest by pressing Import again.")
        if (aggregated.matched > 0) fetchData(true)
        return
      }
      if (failedChunks.length > 0) {
        setCsvError(`${deadChunkEntries.length} rows from failed chunks recorded as errors — press Import again to retry (completed chunks are idempotent).`)
        if (aggregated.matched > 0) fetchData(true)
        return
      }
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
    } finally { csvImportGuardRef.current = false; setCsvImporting(false) }
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
    updated.isInvalidValue = [updated.email, updated.name, updated.subjectCode, updated.subjectName, updated.section, updated.departmentCode].some((c) =>
      isExcelErrorCell((c || "").trim()),
    )
    const row = updated as CsvRowWithFlags
    updated.isExistingMapping = existingKeys.has(`${row.email}|${row.subjectCode}|${row.section}`)
    next[index] = updated
    setCsvRows(next)
  }

  const handleCsvRowRemove = (index: number) => {
    if (!csvRows) return
    setRemovedRows((prev) => [...prev, csvRows[index]])
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

  const handleCsvRemoveBlocked = () => {
    if (!csvRows) return
    setRemovedRows((prev) => [...prev, ...csvRows.filter((r) => r.isExistingMapping || r.isInvalidDept || r.isInvalidValue)])
    const next = csvRows.filter((r) => !r.isExistingMapping && !r.isInvalidDept && !r.isInvalidValue)
    if (next.length === 0) {
      handleCsvReset()
    } else {
      setCsvRows(next)
      setCsvBlockedFilter(false)
      setCsvInvalidDeptFilter(false)
      setCsvInvalidValueFilter(false)
      setCsvPreviewPage(0)
    }
  }

  const handleCsvReset = () => {
    setCsvRows(null)
    setCsvImportResult(null)
    setStep2Result(null)
    setStep3Result(null)
    setStep4Result(null)
    setStep5Result(null)
    setStep6Result(null)
    setStep7Result(null)
    setWrongCsv(""); setSkippedCsv(""); setLastImportTotal(0); setLastImportChunks(0); setRemovedRows([])
    setCsvPreviewPage(0)
    setCsvProblemFilter(false)
    setCsvBlockedFilter(false)
    setCsvInvalidDeptFilter(false)
    setCsvInvalidValueFilter(false)
    setCsvError("")
    if (csvFileRef.current) csvFileRef.current.value = ""
  }

  const hasNullSemesterId = data?.some((m) => !m.semesterId) ?? false

  const isDummyMapping = (m: FacultyMapping) =>
    m.faculty.email.toLowerCase().trim() === DUMMY_FACULTY_EMAIL_CLIENT

  const byDept = data?.filter((m) => {
    if (deptFilter === "all") return true
    if (deptFilter === "unassigned") return isDummyMapping(m)
    if (isDummyMapping(m)) return false
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

  const hasUnassigned = data?.some((m) => isDummyMapping(m)) ?? false

  const deptPills = [
    { id: "all", label: "All" },
    ...(hasUnassigned ? [{ id: "unassigned", label: "Unassigned" }] : []),
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
            {!csvRows && !csvImportResult && (
              <div className="space-y-5">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">CSV Format Hints</p>
                  <ul className="text-[11px] text-blue-600/80 dark:text-blue-300/70 space-y-0.5">
                    <li><strong>Section</strong> column must use format: <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">PROGRAM-SECTION</code> or <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">PROGRAM SECTION</code> (e.g., <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">BSIT-32A3</code> or <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">BSIT 32A3</code>)</li>
                    <li><strong>Subject code</strong> must match an existing subject or a new one will be created.</li>
                    <li><strong>Department code</strong> must match an existing department (e.g., <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">CCS</code>).</li>
                    <li><strong>Faculty email</strong> must end with <code className="bg-blue-100/60 dark:bg-blue-800/40 px-1 rounded">...@lyceumalabang.edu.ph</code> — foreign-domain rows are excluded and listed under Wrong Uploads. Blank emails are assigned to <strong>Unassigned Faculty</strong> (placeholder).</li>
                    <li>Re-importing the same <strong>subject code + section</strong> with a real faculty email <strong>replaces the placeholder</strong> automatically. Re-importing over a real teacher does not replace — it reports <strong>Already loaded</strong>.</li>
                    <li>Large files upload in <strong>100-row chunks</strong> with progress — stay on this page until done.</li>
                    <li>Re-uploading the same file maps <strong>0 new rows</strong> (idempotent).</li>
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

                {csvError && <p className="text-xs font-medium text-red-600 text-center">{csvError}</p>}
              </div>
            )}
            {csvRows && csvRows.length > 0 && (
              <div className="flex flex-col h-full min-h-[24rem]">
                {csvImporting && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 cursor-wait" role="dialog" aria-modal="true" aria-label="Importing faculty mappings">
                    <div className="bg-white dark:bg-surface-dim rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl max-w-md w-full mx-4">
                      <div className="w-10 h-10 border-4 border-gold-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm font-semibold text-secondary">Importing faculty mappings...</p>
                      <p className="text-xs text-tertiary">
                        {chunkProgress.totalRows > 0
                          ? `${chunkProgress.doneRows}/${chunkProgress.totalRows} rows (${chunkProgress.doneChunks}/${chunkProgress.totalChunks} chunks)`
                          : "Please wait while we process your data."}
                      </p>
                      {chunkProgress.totalRows > 0 && (
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                          <div
                            className="bg-gold-500 h-2.5 rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.round((Math.max(easedRows, chunkProgress.doneRows) / chunkProgress.totalRows) * 100))}%` }}
                          />
                        </div>
                      )}
                      <p className="text-[11px] text-tertiary/70 text-center">Stay on this page until done — completed chunks resume safely on re-upload.</p>
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
                {step7Running && step7Progress && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 cursor-wait" role="dialog" aria-modal="true" aria-label="Building faculty loading">
                    <div className="bg-white dark:bg-surface-dim rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl max-w-md w-full mx-4">
                      <div className="w-10 h-10 border-4 border-gold-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm font-semibold text-secondary">Building faculty loading...</p>
                      <p className="text-xs text-tertiary">
                        {step7Progress.doneRows}/{step7Progress.totalRows} slots ({step7Progress.doneChunks}/{step7Progress.totalChunks} chunks)
                      </p>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                        <div
                          className="bg-gold-500 h-2.5 rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.round((step7Progress.doneRows / step7Progress.totalRows) * 100))}%` }}
                        />
                      </div>
                      {step7Progress.history.length > 0 && (
                        <div className="w-full max-h-28 overflow-y-auto rounded-lg border border-default px-3 py-2 space-y-0.5 text-left">
                          {step7Progress.history.map((h) => (
                            <p key={h.chunkIndex} className="text-[11px] text-tertiary">
                              {h.ok
                                ? `Chunk ${h.chunkIndex + 1}: ${h.rows} rows → saved ${h.saved}, skipped ${h.skipped}, issues ${h.issues}`
                                : `Chunk ${h.chunkIndex + 1}: ${h.rows} rows → failed`}
                            </p>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-tertiary/70 text-center">Stay on this page until done — re-running is safe and reports existing.</p>
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
                        <span className="badge-red not-italic">Red</span> items are skipped with remarks (Already loaded is idempotent; invalid rows land in Wrong Uploads).
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
                          {csvBlockedFilter ? "Show all rows" : `Show ${blockedCsvRows.length} already-loaded only`}
                        </button>
                      )}
                      {unimportableCsvRows.length > 0 && (
                        <button
                          type="button"
                          onClick={handleCsvRemoveBlocked}
                          className="text-[11px] font-semibold px-3 py-1 rounded-full border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 transition-colors"
                        >
                          {`Remove ${unimportableCsvRows.length} unimportable (${blockedCsvRows.length} loaded · ${invalidDeptRows.length} dept · ${invalidValueRows.length} invalid)`}
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
                          {csvProblemFilter ? "Show all rows" : `Show ${csvProblemRows.length} to-create only`}
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
                      {invalidValueRows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setCsvInvalidValueFilter((p) => !p); setCsvPreviewPage(0) }}
                          className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${
                            csvInvalidValueFilter
                              ? "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
                              : "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                          }`}
                        >
                          {csvInvalidValueFilter ? "Show all rows" : `Show ${invalidValueRows.length} invalid value only`}
                        </button>
                      )}
                    </div>
                  </div>
                  {csvRows && csvRows.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {unimportableCsvRows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const head = [...TEMPLATE_HEADERS.split(", "), "reason"]
                            const lines = unimportableCsvRows.map((r) => {
                              const reason = r.isInvalidValue
                                ? "Invalid value (Excel error)"
                                : r.isInvalidDept
                                  ? "Invalid dept code"
                                  : "Already loaded"
                              return [r.email, r.name, r.section, r.subjectCode, r.subjectName, r.departmentCode, reason].map(escapePreviewCell).join(",")
                            })
                            downloadBlob([head.map(escapePreviewCell).join(","), ...lines].join("\n"), "faculty-blocked-rows.csv")
                          }}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
                        >
                          Download blocked ({unimportableCsvRows.length})
                        </button>
                      )}
                      {readyCsvRows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const lines = readyCsvRows.map((r) =>
                              [r.email, r.name, r.section, r.subjectCode, r.subjectName, r.departmentCode].map(escapePreviewCell).join(","),
                            )
                            downloadBlob([TEMPLATE_HEADERS, ...lines].join("\n"), "faculty-valid-rows.csv")
                          }}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
                        >
                          Download valid ({readyCsvRows.length})
                        </button>
                      )}
                    </div>
                  )}
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
                                  {row.isInvalidValue && <span className="badge-red">Invalid value</span>}
                                  {!row.isInvalidValue && row.isInvalidDept && <span className="badge-red">Dept code</span>}
                                  {!row.isInvalidValue && !row.isInvalidDept && row.isNewSubject && <span className="badge-amber">Subject</span>}
                                  {!row.isInvalidValue && !row.isInvalidDept && row.isNewSection && <span className="badge-amber">Section</span>}
                                  {!row.isInvalidValue && !row.isInvalidDept && row.isNewTeacher && <span className="badge-amber">Teacher</span>}
                                  {!row.isInvalidValue && !row.isInvalidDept && row.isUnassignedFaculty && <span className="badge-amber">Unassigned</span>}
                                  {!row.isInvalidValue && !row.isNewSubject && !row.isNewSection && !row.isNewTeacher && !row.isUnassignedFaculty && !row.isInvalidDept && row.isExistingMapping && <span className="badge-red">Already loaded</span>}
                                  {!row.isInvalidValue && !row.isNewSubject && !row.isNewSection && !row.isNewTeacher && !row.isUnassignedFaculty && !row.isInvalidDept && !row.isExistingMapping && <span className="badge-emerald">Faculty Loading Only</span>}
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
                {csvRows && csvRows.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-tertiary">
                    <span><span className="font-semibold text-secondary">{readyCsvRows.length}</span> ready to upload</span>
                    <span><span className="font-semibold text-amber-600">{csvProblemRows.length}</span> to create (incl. {unassignedCsvRows.length} unassigned)</span>
                    <span><span className="font-semibold text-red-600">{blockedCsvRows.length}</span> already loaded</span>
                    <span><span className="font-semibold text-red-600">{invalidCsvRows.length}</span> invalid ({invalidDeptRows.length} dept · {invalidValueRows.length} value)</span>
                  </div>
                )}
                {csvRows && csvRows.length > 0 && (
                  <StepperTrace
                    steps={IMPORT_STEPS}
                    doneCount={(step2Result ? 1 : 0) + (step3Result ? 1 : 0) + (step4Result ? 1 : 0) + (step5Result ? 1 : 0) + (step6Result ? 1 : 0) + (step7Result ? 1 : 0)}
                    footnote={`Step ${(step7Result ? 6 : step6Result ? 5 : step5Result ? 4 : step4Result ? 3 : step3Result ? 2 : step2Result ? 1 : 0) + 1} of 6.`}
                  />
                )}
                {csvRows && csvRows.length > 0 && (
                  <StepPanel
                    title="Step 1 — Departments"
                    runLabel="Run Step 1"
                    runningLabel="Running Step 1…"
                    running={step2Running}
                    disabled={!activeSemesterId || csvImporting}
                    onRun={handleStep2Departments}
                    summary={
                      step2Result ? (
                        <p className="text-[11px] text-tertiary">
                          {csvRows.length} rows · {new Set(csvRows.map((r) => (r.departmentCode || "").trim().toUpperCase())).size} distinct in file ·{" "}
                          <span className="font-semibold text-emerald-600">{step2Result.inserted}</span> inserted ·{" "}
                          <span className="font-semibold text-blue-600">{step2Result.existing}</span> existing ·{" "}
                          <span className="font-semibold text-red-600">{step2Result.invalid.length}</span> invalid
                        </p>
                      ) : (
                        <p className="text-[11px] text-tertiary">
                          {csvRows.length} rows · {new Set(csvRows.map((r) => (r.departmentCode || "").trim().toUpperCase())).size} distinct codes in file — run Step 2 to resolve.
                        </p>
                      )
                    }
                    invalid={step2Result?.invalid ?? []}
                    invalidKeyPrefix="step2"
                    confirmTitle="Run Step 1 — Departments?"
                    confirmMessage={`Resolve ${new Set(csvRows.map((r) => (r.departmentCode || "").trim().toUpperCase())).size} distinct department codes across ${csvRows.length} rows. Missing departments are created; re-running reports inserted 0.`}
                  />
                )}
                {csvRows && csvRows.length > 0 && (
                  <StepPanel
                    title="Step 2 — Courses"
                    runLabel="Run Step 2"
                    runningLabel="Running Step 2…"
                    running={step3Running}
                    disabled={!activeSemesterId || csvImporting || !step2Result}
                    disabledTitle={!step2Result ? "Run Step 1 first" : undefined}
                    onRun={handleStep3Courses}
                    summary={
                      step3Result ? (
                        <p className="text-[11px] text-tertiary">
                          {csvRows.length} rows · {Object.keys(step3Result.programToCourseId).length + step3Result.invalid.length} distinct pairs in file ·{" "}
                          <span className="font-semibold text-emerald-600">{step3Result.inserted}</span> inserted ·{" "}
                          <span className="font-semibold text-blue-600">{step3Result.existing}</span> existing ·{" "}
                          <span className="font-semibold text-red-600">{step3Result.invalid.length}</span> invalid
                        </p>
                      ) : (
                        <p className="text-[11px] text-tertiary">
                          {step2Result ? "Ready — run Step 2 to resolve course pairs." : "Run Step 1 first — courses need the department map."}
                        </p>
                      )
                    }
                    invalid={step3Result?.invalid ?? []}
                    invalidKeyPrefix="step3-inv"
                    confirmTitle="Run Step 2 — Courses?"
                    confirmMessage="Resolve distinct program pairs against their departments. Missing courses are created visibly marked; re-running reports inserted 0."
                  >
                    {step3Result && Object.keys(step3Result.programToCourseId).length > 0 && (
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {Object.keys(step3Result.programToCourseId).sort().map((program) => (
                          <p key={`step3-${program}`} className="text-[11px] text-secondary">
                            {program} <span className="text-tertiary">— resolved</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </StepPanel>
                )}
                {csvRows && csvRows.length > 0 && (
                  <StepPanel
                    title="Step 3 — Sections"
                    runLabel="Run Step 3"
                    runningLabel="Running Step 3…"
                    running={step4Running}
                    disabled={!activeSemesterId || csvImporting || !step3Result}
                    disabledTitle={!step3Result ? "Run Step 2 first" : undefined}
                    onRun={handleStep4Sections}
                    summary={
                      step4Result ? (
                        <p className="text-[11px] text-tertiary">
                          {csvRows.length} rows · {Object.keys(step4Result.sectionKeyToId).length + step4Result.invalid.length} distinct sections in file ·{" "}
                          <span className="font-semibold text-emerald-600">{step4Result.inserted}</span> inserted ·{" "}
                          <span className="font-semibold text-blue-600">{step4Result.existing}</span> existing ·{" "}
                          <span className="font-semibold text-red-600">{step4Result.invalid.length}</span> invalid
                        </p>
                      ) : (
                        <p className="text-[11px] text-tertiary">
                          {step3Result ? "Ready — run Step 3 to resolve sections." : "Run Step 2 first — sections need the course map."}
                        </p>
                      )
                    }
                    invalid={step4Result?.invalid ?? []}
                    invalidKeyPrefix="step4-inv"
                    confirmTitle="Run Step 3 — Sections?"
                    confirmMessage="Resolve distinct sections against their courses. Sections whose program has no course are flagged, never inserted; re-running reports inserted 0."
                  />
                )}
                {csvRows && csvRows.length > 0 && (
                  <StepPanel
                    title="Step 4 — Subjects"
                    runLabel="Run Step 4"
                    runningLabel="Running Step 4…"
                    running={step5Running}
                    disabled={!activeSemesterId || csvImporting || !step4Result}
                    disabledTitle={!step4Result ? "Run Step 3 first" : undefined}
                    onRun={handleStep5Subjects}
                    summary={
                      step5Result ? (
                        <p className="text-[11px] text-tertiary">
                          {csvRows.length} rows · {Object.keys(step5Result.subjectCodeToId).length + step5Result.invalid.length} distinct subjects in file ·{" "}
                          <span className="font-semibold text-emerald-600">{step5Result.inserted}</span> inserted ·{" "}
                          <span className="font-semibold text-blue-600">{step5Result.existing}</span> existing ·{" "}
                          <span className="font-semibold text-red-600">{step5Result.invalid.length}</span> invalid
                        </p>
                      ) : (
                        <p className="text-[11px] text-tertiary">
                          {step4Result ? "Ready — run Step 4 to resolve subjects." : "Run Step 3 first — subjects follow convention order."}
                        </p>
                      )
                    }
                    invalid={step5Result?.invalid ?? []}
                    invalidKeyPrefix="step5-inv"
                    confirmTitle="Run Step 4 — Subjects?"
                    confirmMessage="Resolve distinct subject codes. Missing subjects are created with name = code; re-running reports inserted 0."
                  />
                )}
                {csvRows && csvRows.length > 0 && (
                  <StepPanel
                    title="Step 5 — Faculty users"
                    runLabel="Run Step 5"
                    runningLabel="Running Step 5…"
                    running={step6Running}
                    disabled={!activeSemesterId || csvImporting || !step5Result}
                    disabledTitle={!step2Result ? "Run Step 1 first" : !step5Result ? "Run Step 4 first" : undefined}
                    onRun={handleStep6FacultyUsers}
                    summary={
                      step6Result ? (
                        <p className="text-[11px] text-tertiary">
                          {csvRows.length} rows · {Object.keys(step6Result.facultyUserMap).length + step6Result.invalid.length} distinct faculty in file ·{" "}
                          <span className="font-semibold text-emerald-600">{step6Result.inserted}</span> inserted ·{" "}
                          <span className="font-semibold text-blue-600">{step6Result.existing}</span> existing ·{" "}
                          <span className="font-semibold text-red-600">{step6Result.invalid.length}</span> invalid
                        </p>
                      ) : (
                        <p className="text-[11px] text-tertiary">
                          {step5Result ? "Ready — run Step 5 to create missing faculty." : "Run Step 4 first — faculty users follow convention order."}
                        </p>
                      )
                    }
                    invalid={step6Result?.invalid ?? []}
                    invalidKeyPrefix="step6-inv"
                    confirmTitle="Run Step 5 — Faculty users?"
                    confirmMessage="Create missing faculty (role FACULTY) with their department. Off-domain emails are flagged, never created; the unassigned placeholder stays dept-agnostic; re-running reports inserted 0."
                  />
                )}
                {csvRows && csvRows.length > 0 && (
                  <StepPanel
                    title="Step 6 — Faculty Loading"
                    runLabel="Run Step 6"
                    runningLabel="Running Step 6…"
                    running={step7Running}
                    disabled={!activeSemesterId || csvImporting || !step4Result || !step5Result || !step6Result}
                    disabledTitle={!step4Result ? "Run Step 3 first" : !step5Result ? "Run Step 4 first" : !step6Result ? "Run Step 5 first" : undefined}
                    onRun={handleStep7Mappings}
                    summary={
                      step7Result ? (
                        <p className="text-[11px] text-tertiary">
                          {csvRows.length} rows · {step7Result.inserted + step7Result.existing + step7Result.invalid.length} distinct slots in file ·{" "}
                          <span className="font-semibold text-emerald-600">{step7Result.inserted}</span> inserted ·{" "}
                          <span className="font-semibold text-blue-600">{step7Result.existing}</span> existing ·{" "}
                          <span className="font-semibold text-red-600">{step7Result.invalid.length}</span> invalid
                        </p>
                      ) : (
                        <p className="text-[11px] text-tertiary">
                          {step6Result ? "Ready — run Step 6 to build faculty loading." : "Run Step 5 first — mappings need the faculty map."}
                        </p>
                      )
                    }
                    invalid={step7Result?.invalid ?? []}
                    invalidKeyPrefix="step7-inv"
                    confirmTitle="Run Step 6 — Faculty Loading?"
                    confirmMessage="Build 903 faculty-loading slots from resolved subjects, sections and faculty. Dummy-held slots are reassigned to the real teacher; slots held by a different real teacher are refused, never overwritten; re-running reports inserted 0."
                  />
                )}
                <div className="sticky bottom-0 pt-2 pb-1 bg-white dark:bg-surface-dim flex justify-center">
                  <IosButton variant="plain" size="sm" type="button" disabled={csvImporting} onClick={handleCsvReset}>Cancel</IosButton>
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
                      {lastImportTotal} rows sent in {lastImportChunks} chunks · {csvImportResult.matched} mapped · {(csvImportResult.skipped?.length ?? 0)} skipped · {csvImportResult.errors.length} errors
                    </p>
                    <p className="text-[11px] text-tertiary">
                      Seed 2026-1 reference: 903 loadings · 21,989 enrollments · exactly 1 active semester. Re-running this file should map 0 new rows and skip all (idempotent).
                    </p>
                    {(() => {
                      const boxUnaccounted =
                        lastImportTotal -
                        csvImportResult.matched -
                        csvImportResult.errors.filter((e) => e.row > 0).length -
                        (csvImportResult.parseErrors?.length ?? 0) -
                        (csvImportResult.skipped?.length ?? 0)
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
                {skippedCsv.split("\n").length > 1 && (
                  <button
                    type="button"
                    onClick={() => downloadBlob(skippedCsv, "faculty-skipped-uploads.csv")}
                    className="w-full flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl border border-default bg-surface-hover hover:bg-surface-dim transition-colors"
                  >
                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m4 4V4" />
                    </svg>
                    Download Skipped (.csv)
                  </button>
                )}
                {(csvImportResult.skipped?.length ?? 0) > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-800/30 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-default">
                      <p className="text-sm font-semibold text-secondary">{csvImportResult.skipped!.length} Skipped (already loaded)</p>
                    </div>
                    <div className="px-5 py-3 space-y-2 max-h-40 overflow-y-auto">
                      {csvImportResult.skipped!.map((e, i) => (
                        <p key={`s-${i}`} className="text-xs text-tertiary">Row {e.row}: {e.email ? `${e.email} — ` : ""}{e.message}</p>
                      ))}
                    </div>
                  </div>
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
                {(!csvImportResult.errors || csvImportResult.errors.length === 0) && (csvImportResult.skipped?.length ?? 0) === 0 && csvImportResult.matched > 0 && (
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
                  if (!isAdmin && pill.id !== currentUserDept && pill.id !== "unassigned") return
                  setDeptFilter(pill.id)
                }}
                disabled={!isAdmin && pill.id !== currentUserDept && pill.id !== "unassigned"}
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
