"use client"

import { useState, useCallback, useMemo } from "react"
import type { EvalReportData, EvalReportDepartment, EvalReportFaculty } from "../evaluation-report.service"

interface StudentRow {
  id: string
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  generalRating: number | null
  comment: string | null
}

interface Props {
  role: "admin" | "dean" | "faculty"
  evaluationPeriodId: string
  initialData: EvalReportData
}

type CategoryKey = keyof Pick<EvalReportFaculty, "professionalManner" | "communicationWithStudent" | "studentEngagement" | "learningMaterials" | "timeManagement" | "experientialLearning" | "respectUniqueness" | "assessmentAndFeedback">

const CATEGORY_LABELS: { key: CategoryKey; short: string; full: string }[] = [
  { key: "professionalManner", short: "Prof. Manner", full: "Professional Manner" },
  { key: "communicationWithStudent", short: "Comm.", full: "Communication with Students" },
  { key: "studentEngagement", short: "Engag.", full: "Student Engagement" },
  { key: "learningMaterials", short: "Materials", full: "Learning Materials" },
  { key: "timeManagement", short: "Time Mgmt", full: "Time Management" },
  { key: "experientialLearning", short: "Exper.", full: "Experiential Learning" },
  { key: "respectUniqueness", short: "Respect", full: "Respect for Uniqueness" },
  { key: "assessmentAndFeedback", short: "Assessment", full: "Assessment and Feedback" },
]

function remarkLabel(r: string | null): string {
  if (!r) return "—"
  return r
}

function remarkColor(r: string | null): string {
  switch (r) {
    case "Outstanding": return "text-emerald-600 bg-emerald-50"
    case "Very Satisfactory": return "text-blue-600 bg-blue-50"
    case "Satisfactory": return "text-amber-600 bg-amber-50"
    case "Unsatisfactory": return "text-red-600 bg-red-50"
    case "Poor": return "text-red-700 bg-red-100"
    default: return "text-tertiary bg-slate-50"
  }
}

function fmt(n: number | null | string): string {
  if (typeof n === "string") return n
  return n !== null ? n.toFixed(2) : "—"
}

function deptAvg(key: CategoryKey, d: EvalReportDepartment): number | null {
  return d[`avg${key.charAt(0).toUpperCase()}${key.slice(1)}` as keyof EvalReportDepartment] as number | null
}

async function fetchStudentBreakdown(periodId: string, facultyId: string): Promise<StudentRow[]> {
  try {
    const res = await fetch(`/api/dean/evaluation-results/details?periodId=${periodId}&facultyId=${facultyId}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.students || []
  } catch {
    return []
  }
}

function StudentTable({ students }: { students: StudentRow[] }) {
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 15
  const totalPages = Math.ceil(students.length / PAGE_SIZE)
  const slice = students.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (students.length === 0) {
    return <p className="text-sm text-tertiary italic">No student responses available.</p>
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-tertiary font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              {CATEGORY_LABELS.map((c) => (
                <th key={c.key} className="px-2 py-2 text-center" title={c.full}>{c.short}</th>
              ))}
              <th className="px-2 py-2 text-center">General</th>
              <th className="px-2 py-2 text-center">Remark</th>
              <th className="px-3 py-2 text-left">Comment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slice.map((s, i) => (
              <tr key={s.id || i} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-tertiary">{page * PAGE_SIZE + i + 1}</td>
                {CATEGORY_LABELS.map((c) => (
                  <td key={c.key} className="px-2 py-2 text-center font-medium text-primary">{fmt(s[c.key])}</td>
                ))}
                <td className="px-2 py-2 text-center font-bold text-primary">{fmt(s.generalRating)}</td>
                <td className="px-2 py-2 text-center">
                  <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full ${remarkColor(s.generalRating !== null ? (s.generalRating >= 4.5 ? "Outstanding" : s.generalRating >= 3.5 ? "Very Satisfactory" : s.generalRating >= 2.5 ? "Satisfactory" : s.generalRating >= 1.5 ? "Unsatisfactory" : "Poor") : null)}`}>
                    {s.generalRating !== null
                      ? (s.generalRating >= 4.5 ? "O" : s.generalRating >= 3.5 ? "VS" : s.generalRating >= 2.5 ? "S" : s.generalRating >= 1.5 ? "U" : "P")
                      : "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-tertiary max-w-[200px] truncate">{s.comment || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-tertiary">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, students.length)} of {students.length}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="text-xs px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="text-xs px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-primary">{label}</span>
      <div className="flex items-center gap-3">
        <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-400 to-emerald-500 transition-all"
            style={{ width: `${value !== null ? (value / 5) * 100 : 0}%` }}
          />
        </div>
        <span className="text-sm font-semibold text-primary w-10 text-right">{fmt(value)}</span>
      </div>
    </div>
  )
}

export default function EvaluationReportContent({ role, evaluationPeriodId, initialData }: Props) {
  const [drillLevel, setDrillLevel] = useState<0 | 1 | 2>(role === "admin" ? 0 : 1)
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [selectedFaculty, setSelectedFaculty] = useState<EvalReportFaculty | null>(null)
  const [studentData, setStudentData] = useState<StudentRow[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)

  const showDeptOverview = role === "admin" && drillLevel === 0

  const showFacultyTable =
    (role === "admin" && drillLevel >= 1) ||
    (role === "dean") ||
    (role === "faculty" && drillLevel === 1)

  const showStudentBreakdown = drillLevel === 2

  const filteredFaculty = useMemo(() => {
    if (role === "faculty") return initialData.facultyResults
    if (role === "dean") return initialData.facultyResults
    // admin
    if (!selectedDeptId) return []
    return initialData.facultyResults
  }, [initialData.facultyResults, role, selectedDeptId])

  const drillIntoFaculty = useCallback(async (faculty: EvalReportFaculty) => {
    setSelectedFaculty(faculty)
    setDrillLevel(2)
    setLoadingStudents(true)
    const students = await fetchStudentBreakdown(evaluationPeriodId, faculty.facultyId)
    setStudentData(students)
    setLoadingStudents(false)
  }, [evaluationPeriodId])

  const drillIntoDepartment = useCallback((deptId: string) => {
    setSelectedDeptId(deptId)
    setDrillLevel(1)
  }, [])

  const goToStudentBreakdown = useCallback(() => {
    const firstFaculty = initialData.facultyResults[0]
    if (firstFaculty) {
      drillIntoFaculty(firstFaculty)
    }
  }, [initialData.facultyResults, drillIntoFaculty])

  const goBack = useCallback(() => {
    if (drillLevel === 2) {
      setDrillLevel(1)
      setSelectedFaculty(null)
      setStudentData([])
    } else if (drillLevel === 1 && role === "admin") {
      setDrillLevel(0)
      setSelectedDeptId(null)
    }
  }, [drillLevel, role])

  const exportCSV = useCallback(() => {
    let rows: string[][] = []
    let headers: string[] = []

    if (showStudentBreakdown && selectedFaculty) {
      headers = ["Student #", ...CATEGORY_LABELS.map((c) => c.full), "General Rating", "Remark", "Comment"]
      rows = studentData.map((s, i) => [
        String(i + 1),
        ...CATEGORY_LABELS.map((c) => String(s[c.key] ?? "")),
        String(s.generalRating ?? ""),
        s.generalRating !== null ? (s.generalRating >= 4.5 ? "Outstanding" : s.generalRating >= 3.5 ? "Very Satisfactory" : s.generalRating >= 2.5 ? "Satisfactory" : s.generalRating >= 1.5 ? "Unsatisfactory" : "Poor") : "",
        s.comment ?? "",
      ])
    } else if (showFacultyTable) {
      headers = ["Faculty", "Respondents", ...CATEGORY_LABELS.map((c) => c.full), "General Rating", "Remark"]
      rows = filteredFaculty.map((f) => [
        f.facultyName,
        String(f.totalRespondents),
        ...CATEGORY_LABELS.map((c) => String(f[c.key] ?? "")),
        String(f.generalRating ?? ""),
        f.remarks ?? "",
      ])
    } else if (showDeptOverview) {
      headers = ["Department", "Faculty Count", "Respondents", ...CATEGORY_LABELS.map((c) => "Avg " + c.full), "Avg General"]
      rows = initialData.departments.map((d) => [
        d.departmentName,
        String(d.facultyCount),
        String(d.totalRespondents),
        ...CATEGORY_LABELS.map((c) => String(deptAvg(c.key, d) ?? "")),
        String(d.avgGeneralRating ?? ""),
      ])
    }

    const csvContent = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const deptPart = selectedDeptId ? initialData.departments.find((d) => d.departmentId === selectedDeptId)?.departmentName ?? "" : ""
    const facultyPart = selectedFaculty?.facultyName ?? ""
    const name = [deptPart, facultyPart, "eval-report.csv"].filter(Boolean).join("_")
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }, [showStudentBreakdown, showFacultyTable, showDeptOverview, selectedFaculty, selectedDeptId, studentData, filteredFaculty, initialData.departments])

  if (!evaluationPeriodId || initialData.departments.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <p className="text-sm text-tertiary">No evaluation data available for the active semester.</p>
      </div>
    )
  }

  const subtitle = showStudentBreakdown
    ? `Student Breakdown — ${selectedFaculty?.facultyName ?? ""}`
    : showFacultyTable
      ? role === "admin" && selectedDeptId
        ? `Faculty — ${initialData.departments.find((d) => d.departmentId === selectedDeptId)?.departmentName ?? ""}`
        : role === "dean"
          ? initialData.departments[0]?.departmentName ?? "Department"
          : "My Evaluation Results"
      : "Department Overview"

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-primary">Evaluation Reports</h1>
          <p className="text-sm text-tertiary mt-1">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          {(showFacultyTable || showStudentBreakdown) && (
            <button
              onClick={goBack}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-primary font-medium"
            >
              ← Back
            </button>
          )}
          {role === "faculty" && showFacultyTable && (
            <button
              onClick={goToStudentBreakdown}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium"
            >
              View Student Breakdown
            </button>
          )}
          <button
            onClick={exportCSV}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-primary font-medium"
          >
            CSV
          </button>
        </div>
      </div>

      {/* Department Overview (admin only) */}
      {showDeptOverview && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-tertiary font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Department</th>
                <th className="px-3 py-3 text-center">Faculty</th>
                <th className="px-3 py-3 text-center">Resp.</th>
                {CATEGORY_LABELS.map((c) => (
                  <th key={c.key} className="px-2 py-3 text-center" title={c.full}>{c.short}</th>
                ))}
                <th className="px-2 py-3 text-center">General</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialData.departments.map((dept) => (
                <tr
                  key={dept.departmentId}
                  onClick={() => drillIntoDepartment(dept.departmentId)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-primary">{dept.departmentName}</td>
                  <td className="px-3 py-3 text-center text-tertiary">{dept.facultyCount}</td>
                  <td className="px-3 py-3 text-center text-tertiary">{dept.totalRespondents}</td>
                  {CATEGORY_LABELS.map((c) => (
                    <td key={c.key} className="px-2 py-3 text-center font-medium text-primary">{fmt(deptAvg(c.key, dept))}</td>
                  ))}
                  <td className="px-2 py-3 text-center font-bold text-primary">{fmt(dept.avgGeneralRating)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dean department summary */}
      {role === "dean" && showFacultyTable && !showStudentBreakdown && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{initialData.departments[0]?.facultyCount ?? 0}</p>
              <p className="text-xs text-tertiary">Faculty</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{initialData.departments[0]?.totalRespondents ?? 0}</p>
              <p className="text-xs text-tertiary">Responses</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{fmt(initialData.departments[0]?.avgGeneralRating ?? null)}</p>
              <p className="text-xs text-tertiary">Dept Avg</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{initialData.departments[0]?.departmentName ?? ""}</p>
              <p className="text-xs text-tertiary">Department</p>
            </div>
          </div>
        </div>
      )}

      {/* Faculty Table */}
      {showFacultyTable && !showStudentBreakdown && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-tertiary font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Faculty</th>
                <th className="px-3 py-3 text-center">Resp.</th>
                {CATEGORY_LABELS.map((c) => (
                  <th key={c.key} className="px-2 py-3 text-center" title={c.full}>{c.short}</th>
                ))}
                <th className="px-2 py-3 text-center">General</th>
                <th className="px-2 py-3 text-center">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFaculty.map((f) => (
                <tr
                  key={f.facultyId}
                  onClick={() => drillIntoFaculty(f)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-primary">{f.facultyName}</td>
                  <td className="px-3 py-3 text-center text-tertiary">{f.totalRespondents}</td>
                  {CATEGORY_LABELS.map((c) => (
                    <td key={c.key} className="px-2 py-3 text-center font-medium text-primary">{fmt(f[c.key])}</td>
                  ))}
                  <td className="px-2 py-3 text-center font-bold text-primary">{fmt(f.generalRating)}</td>
                  <td className="px-2 py-3 text-center">
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${remarkColor(f.remarks)}`}>
                      {remarkLabel(f.remarks)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Student Breakdown */}
      {showStudentBreakdown && selectedFaculty && (
        <div className="space-y-4">
          {/* Faculty summary card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{fmt(selectedFaculty.generalRating)}</p>
                <p className="text-xs text-tertiary">General Rating</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{selectedFaculty.totalRespondents}</p>
                <p className="text-xs text-tertiary">Respondents</p>
              </div>
              <div className="text-center">
                <span className={`inline-block text-sm font-bold px-3 py-1 rounded-full ${remarkColor(selectedFaculty.remarks)}`}>
                  {remarkLabel(selectedFaculty.remarks)}
                </span>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-4 space-y-1">
              {CATEGORY_LABELS.map((c) => (
                <CategoryBar key={c.key} label={c.full} value={selectedFaculty[c.key]} />
              ))}
            </div>
          </div>

          {/* Student table */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-primary">Anonymous Student Responses</h3>
              <span className="text-xs text-tertiary">{studentData.length} response{studentData.length !== 1 ? "s" : ""}</span>
            </div>
            {loadingStudents ? (
              <p className="text-sm text-tertiary italic">Loading student data...</p>
            ) : (
              <StudentTable students={studentData} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
