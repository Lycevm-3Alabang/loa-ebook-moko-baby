"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import LockedTab from "@/components/ui/LockedTab"
import { useApiGet } from "@/lib/api/client"
import { getRemarkColor } from "@/lib/evaluation-utils"
import { downloadDeptPdf } from "@/lib/evaluation-pdf"
import DepartmentSubjectView from "@/features/evaluations/components/DepartmentSubjectView"

interface SubjectRow {
  facultySubjectId: string
  facultyId: string
  facultyName: string
  facultyEmail: string
  subjectId: string
  subjectCode: string
  subjectName: string
  totalRespondents: number
  avgRating: number | null
  remarks: string | null
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  highestRubrics: { key: string; label: string; score: number }[]
  lowestRubrics: { key: string; label: string; score: number }[]
  sentimentScore: number | null
}

interface DepartmentInfo {
  id: string
  name: string
  code: string
}

export default function DeanDepartmentDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const departmentId = params.departmentId as string
  const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId") || ""

  const [search, setSearch] = useState("")
  const [pdfMode, setPdfMode] = useState<"per_subject" | "per_faculty">("per_subject")
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({})
  const [toggling, setToggling] = useState(false)

  const { data: resultsData, error: resultsError } = useApiGet<{ department: DepartmentInfo; subjects: SubjectRow[]; visibilityMap: Record<string, boolean> }>(
    evaluationPeriodId ? `/api/dean/evaluation-results/departments/${encodeURIComponent(departmentId)}?evaluationPeriodId=${encodeURIComponent(evaluationPeriodId)}` : null,
  )
  const department = resultsData?.department ?? null
  const subjects = useMemo(() => resultsData?.subjects ?? [], [resultsData])
  const isLocked = !!resultsError && !!evaluationPeriodId
  const loading = !resultsData && !resultsError && !!evaluationPeriodId

  useEffect(() => {
    const map = resultsData?.visibilityMap ?? {}
    if (Object.keys(map).length > 0 && Object.keys(visibilityMap).length === 0) {
      Promise.resolve().then(() => setVisibilityMap(map))
    }
  }, [resultsData, visibilityMap])

  const deptMetrics = useMemo(() => {
    if (subjects.length === 0) return null
    const uniqueFaculty = new Set(subjects.map((s) => s.facultyId)).size
    const totalResp = subjects.reduce((sum, s) => sum + s.totalRespondents, 0)
    const ratings = subjects.filter((s) => s.avgRating !== null).map((s) => s.avgRating as number)
    const deptAvg = ratings.length > 0
      ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 100) / 100
      : null
    const deptRemark = deptAvg !== null
      ? (deptAvg >= 4.5 ? "Outstanding" : deptAvg >= 3.5 ? "Very Satisfactory" : deptAvg >= 2.5 ? "Satisfactory" : deptAvg >= 1.5 ? "Unsatisfactory" : "Poor")
      : null

    const rubricSums: Record<string, { sum: number; count: number }> = {}
    for (const s of subjects) {
      for (const key of ["professionalManner", "communicationWithStudent", "studentEngagement", "learningMaterials", "timeManagement", "experientialLearning", "respectUniqueness", "assessmentAndFeedback"] as const) {
        const val = s[key as keyof typeof s] as number | null
        if (val !== null) {
          if (!rubricSums[key]) rubricSums[key] = { sum: 0, count: 0 }
          rubricSums[key].sum += val
          rubricSums[key].count += 1
        }
      }
    }
    const rubricAvgs: { key: string; label: string; score: number }[] = Object.entries(rubricSums).map(([key, { sum, count }]) => ({
      key,
      label: key === "professionalManner" ? "Professional Manner"
        : key === "communicationWithStudent" ? "Communication w/ Students"
        : key === "studentEngagement" ? "Student Engagement"
        : key === "learningMaterials" ? "Learning Materials"
        : key === "timeManagement" ? "Time Management"
        : key === "experientialLearning" ? "Experiential Learning"
        : key === "respectUniqueness" ? "Respect for Uniqueness"
        : "Assessment & Feedback",
      score: Math.round(sum / count * 100) / 100,
    }))
    const highest = [...rubricAvgs].sort((a, b) => b.score - a.score).slice(0, 1)
    const lowest = [...rubricAvgs].sort((a, b) => a.score - b.score).slice(0, 1)

    const sentiments = subjects.filter((s) => s.sentimentScore !== null).map((s) => s.sentimentScore as number)
    const overallSentiment = sentiments.length > 0
      ? Math.round(sentiments.reduce((a, b) => a + b, 0) / sentiments.length * 100) / 100
      : null

    return {
      totalSubjects: subjects.length,
      uniqueFaculty,
      totalResp,
      deptAvg,
      deptRemark,
      highest,
      lowest,
      overallSentiment,
    }
  }, [subjects])

  const toggleVisibility = useCallback(async (facultyId: string, visible: boolean) => {
    if (toggling) return
    const prev = visibilityMap[facultyId]
    setVisibilityMap((m) => ({ ...m, [facultyId]: visible }))
    setToggling(true)
    try {
      const res = await fetch("/api/dean/evaluation-results/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationPeriodId, facultyIds: [facultyId], visible }),
      })
      if (!res.ok) setVisibilityMap((m) => ({ ...m, [facultyId]: prev }))
    } catch {
      setVisibilityMap((m) => ({ ...m, [facultyId]: prev }))
    } finally {
      setToggling(false)
    }
  }, [evaluationPeriodId, toggling, visibilityMap])

  const bulkSetVisibility = useCallback(async (visible: boolean) => {
    if (toggling) return
    const facultyIds = [...new Set(subjects.map((s) => s.facultyId))]
    const prev = { ...visibilityMap }
    const update: Record<string, boolean> = {}
    for (const id of facultyIds) update[id] = visible
    setVisibilityMap((m) => ({ ...m, ...update }))
    setToggling(true)
    try {
      const res = await fetch("/api/dean/evaluation-results/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationPeriodId, facultyIds, visible }),
      })
      if (!res.ok) setVisibilityMap(prev)
    } catch {
      setVisibilityMap(prev)
    } finally {
      setToggling(false)
    }
  }, [evaluationPeriodId, subjects, toggling, visibilityMap])

  const handleDeptPdf = useCallback(() => {
    if (!department || subjects.length === 0) return
    downloadDeptPdf({
      departmentName: department.name,
      departmentCode: department.code,
      subjects: subjects.map((s) => ({
        facultyName: s.facultyName,
        facultyEmail: s.facultyEmail,
        subjectCode: s.subjectCode,
        subjectName: s.subjectName,
        totalRespondents: s.totalRespondents,
        avgRating: s.avgRating,
        remarks: s.remarks,
        highestRubrics: s.highestRubrics,
        lowestRubrics: s.lowestRubrics,
        sentimentScore: s.sentimentScore,
      })),
      mode: pdfMode,
    })
  }, [department, subjects, pdfMode])

  return (
    <div className="w-full space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-primary">
          {department?.name ?? "Department"} <span className="text-tertiary font-normal">{department?.code}</span>
        </h1>
        <p className="text-xs text-tertiary mt-1">
          Per-subject evaluation results. Click a row to view individual evaluation details.
        </p>
      </div>

      {isLocked && (
        <LockedTab endpoint="/api/dean/evaluation-results" message="Evaluation Results not ready" />
      )}

      {loading && (
        <div className="space-y-4">
          <Skeleton variant="table-row" />
          <Skeleton variant="table-row" />
        </div>
      )}

      {!loading && !isLocked && subjects.length === 0 && (
        <p className="text-sm text-tertiary text-center py-8">No evaluation data found for this department.</p>
      )}

      {!loading && !isLocked && subjects.length > 0 && deptMetrics && (
        <>
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-secondary">Department Summary</p>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-default overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setPdfMode("per_subject")}
                    className={`px-3 py-1.5 transition-colors ${pdfMode === "per_subject" ? "bg-blue-600 text-white" : "bg-surface text-tertiary hover:text-secondary"}`}
                  >
                    Per Subject
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfMode("per_faculty")}
                    className={`px-3 py-1.5 transition-colors ${pdfMode === "per_faculty" ? "bg-blue-600 text-white" : "bg-surface text-tertiary hover:text-secondary"}`}
                  >
                    Per Faculty
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleDeptPdf}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-tertiary">Subjects</p>
                <p className="text-lg font-bold">{deptMetrics.totalSubjects}</p>
              </div>
              <div>
                <p className="text-[10px] text-tertiary">Faculty</p>
                <p className="text-lg font-bold">{deptMetrics.uniqueFaculty}</p>
              </div>
              <div>
                <p className="text-[10px] text-tertiary">Total Respondents</p>
                <p className="text-lg font-bold">{deptMetrics.totalResp}</p>
              </div>
              <div>
                <p className="text-[10px] text-tertiary">Department Average</p>
                <p className="text-lg font-bold">{deptMetrics.deptAvg?.toFixed(2) ?? "\u2014"}</p>
                {deptMetrics.deptRemark && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getRemarkColor(deptMetrics.deptRemark)}`}>
                    {deptMetrics.deptRemark}
                  </span>
                )}
              </div>
              <div>
                <p className="text-[10px] text-tertiary">Highest Rubric</p>
                {deptMetrics.highest.map((r) => (
                  <p key={r.key} className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {r.label}: {r.score.toFixed(2)}
                  </p>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-tertiary">Lowest Rubric</p>
                {deptMetrics.lowest.map((r) => (
                  <p key={r.key} className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {r.label}: {r.score.toFixed(2)}
                  </p>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-tertiary">Overall Sentiment</p>
                <p className="text-sm font-semibold">
                  {deptMetrics.overallSentiment !== null ? deptMetrics.overallSentiment.toFixed(4) : "\u2014"}
                </p>
              </div>
            </div>
          </div>

          <DepartmentSubjectView
            subjects={subjects}
            departmentId={departmentId}
            evaluationPeriodId={evaluationPeriodId}
            search={search}
            onSearchChange={setSearch}
            visibilityMap={visibilityMap}
            onVisibilityChange={toggleVisibility}
            onBulkVisibilityChange={bulkSetVisibility}
            basePath="/dean/evaluations/results"
          />
        </>
      )}
    </div>
  )
}
