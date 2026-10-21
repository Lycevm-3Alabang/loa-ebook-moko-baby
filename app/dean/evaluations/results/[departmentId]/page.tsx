"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import LockedTab from "@/components/ui/LockedTab"
import IosButton from "@/components/ui/IosButton"
import { useApiGet } from "@/lib/api/client"
import { useCrumb } from "@/lib/contexts/breadcrumb"
import { getRemarkColor, departmentLabel, type FacultyAggregate, type DepartmentAggregate } from "@/lib/evaluation-utils"
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
  sectionProgram: string | null
  sectionName: string | null
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

  const { data: resultsData, error: resultsError } = useApiGet<{ department: DepartmentInfo; subjects: SubjectRow[]; visibilityMap: Record<string, boolean>; facultyAggregates: Record<string, FacultyAggregate>; departmentAggregate: DepartmentAggregate | null }>(
    evaluationPeriodId ? `/api/dean/evaluation-results/departments/${encodeURIComponent(departmentId)}?evaluationPeriodId=${encodeURIComponent(evaluationPeriodId)}` : null,
  )
  const department = resultsData?.department ?? null
  const subjects = useMemo(() => resultsData?.subjects ?? [], [resultsData])
  const departmentAggregate = resultsData?.departmentAggregate ?? null
  const isLocked = !!resultsError && !!evaluationPeriodId
  const loading = !resultsData && !resultsError && !!evaluationPeriodId

  useCrumb(
    departmentId,
    department ? { label: `${department.name}${department.code ? ` (${department.code})` : ""}` } : null,
  )

  useEffect(() => {
    const map = resultsData?.visibilityMap ?? {}
    if (Object.keys(map).length > 0 && Object.keys(visibilityMap).length === 0) {
      Promise.resolve().then(() => setVisibilityMap(map))
    }
  }, [resultsData, visibilityMap])

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
          {departmentLabel(department?.name ?? "Department", department?.code)}
        </h1>
        <p className="text-xs text-tertiary mt-1">
          Per-subject evaluation results. Click a row to view individual evaluation details.
        </p>
      </div>

      {isLocked && (
        <LockedTab endpoint="/api/dean/evaluation-results" message={resultsError?.message || "Evaluation Results not ready"} />
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

      {!loading && !isLocked && subjects.length > 0 && departmentAggregate && (
        <>
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-secondary">Department Summary</p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <IosButton
                    variant={pdfMode === "per_subject" ? "primary" : "gray"}
                    size="sm"
                    onClick={() => setPdfMode("per_subject")}
                    aria-pressed={pdfMode === "per_subject"}
                  >
                    Per Subject
                  </IosButton>
                  <IosButton
                    variant={pdfMode === "per_faculty" ? "primary" : "gray"}
                    size="sm"
                    onClick={() => setPdfMode("per_faculty")}
                    aria-pressed={pdfMode === "per_faculty"}
                  >
                    Per Faculty
                  </IosButton>
                </div>
                <IosButton
                  variant="tinted"
                  size="sm"
                  onClick={handleDeptPdf}
                  title={`Download ${pdfMode === "per_faculty" ? "per-faculty" : "per-subject"} PDF`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 012 0V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF
                </IosButton>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-tertiary">Subjects</p>
                <p className="text-lg font-bold">{departmentAggregate.totalSubjects}</p>
              </div>
              <div>
                <p className="text-[10px] text-tertiary">Faculty</p>
                <p className="text-lg font-bold">{departmentAggregate.uniqueFaculty}</p>
              </div>
              <div>
                <p className="text-[10px] text-tertiary">Total Responses</p>
                <p className="text-lg font-bold">{departmentAggregate.totalResponses}</p>
              </div>
              <div>
                <p className="text-[10px] text-tertiary">Department Average</p>
                <p className="text-lg font-bold">{departmentAggregate.avgRating?.toFixed(2) ?? "\u2014"}</p>
                {departmentAggregate.remarks && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getRemarkColor(departmentAggregate.remarks)}`}>
                    {departmentAggregate.remarks}
                  </span>
                )}
              </div>
              <div>
                <p className="text-[10px] text-tertiary">Highest Rubric</p>
                {departmentAggregate.highestRubrics.map((r) => (
                  <p key={r.key} className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {r.label}: {r.score.toFixed(2)}
                  </p>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-tertiary">Lowest Rubric</p>
                {departmentAggregate.lowestRubrics.map((r) => (
                  <p key={r.key} className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {r.label}: {r.score.toFixed(2)}
                  </p>
                ))}
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
            facultyAggregates={resultsData?.facultyAggregates ?? {}}
          />
        </>
      )}
    </div>
  )
}
