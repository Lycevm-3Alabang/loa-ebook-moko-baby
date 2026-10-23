"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import LockedTab from "@/components/ui/LockedTab"
import { useApiGet } from "@/lib/api/client"
import { useCrumb } from "@/lib/contexts/breadcrumb"
import { getRemarkColor, departmentLabel, findAttentionRubrics, type FacultyAggregate, type DepartmentAggregate } from "@/lib/evaluation-utils"
import DepartmentSubjectView from "@/features/evaluations/components/DepartmentSubjectView"
import DepartmentZipButton from "@/features/evaluation-results/components/DepartmentZipButton"

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
  const [selectedFacultyIds, setSelectedFacultyIds] = useState<string[]>([])
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({})
  const [toggling, setToggling] = useState(false)

  const { data: resultsData, error: resultsError } = useApiGet<{ department: DepartmentInfo; subjects: SubjectRow[]; members: { id: string; name: string; email: string }[]; visibilityMap: Record<string, boolean>; facultyAggregates: Record<string, FacultyAggregate>; departmentAggregate: DepartmentAggregate | null }>(
    evaluationPeriodId ? `/api/dean/evaluation-results/departments/${encodeURIComponent(departmentId)}?evaluationPeriodId=${encodeURIComponent(evaluationPeriodId)}` : null,
  )
  const department = resultsData?.department ?? null
  const subjects = useMemo(() => resultsData?.subjects ?? [], [resultsData])
  const departmentAggregate = resultsData?.departmentAggregate ?? null
  // The department's own faculty - the members, with or without results.
  const members = useMemo(() => resultsData?.members ?? [], [resultsData])
  const selectedFacultySet = useMemo(() => new Set(selectedFacultyIds), [selectedFacultyIds])
  const allFacultyIds = useMemo(
    () => (members.length > 0 ? members.map((m) => m.id) : [...new Set(subjects.map((s) => s.facultyId))]),
    [members, subjects],
  )
  const allFacultySelected =
    allFacultyIds.length > 0 && allFacultyIds.every((id) => selectedFacultySet.has(id))
  // The weakest rubric, and only when it is critically low.
  const attentionRubrics = useMemo(
    () => findAttentionRubrics(departmentAggregate?.lowestRubrics ?? []),
    [departmentAggregate],
  )
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

  // A new scope starts with nothing ticked (D36).
  useEffect(() => {
    Promise.resolve().then(() => setSelectedFacultyIds([]))
  }, [evaluationPeriodId, departmentId])

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

  const toggleFacultySelection = useCallback((facultyId: string, selected: boolean) => {
    setSelectedFacultyIds((prev) =>
      selected
        ? prev.includes(facultyId) ? prev : [...prev, facultyId]
        : prev.filter((id) => id !== facultyId),
    )
  }, [])

  return (
    <div className="w-full space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-primary">
          {departmentLabel(department?.name ?? "Department", department?.code)}
        </h1>
        <p className="text-xs text-tertiary mt-1">
          Per-faculty evaluation results. Expand a teacher to see their subjects.
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold leading-none text-primary">
                    {departmentAggregate.avgRating?.toFixed(2) ?? "\u2014"}
                  </span>
                  {departmentAggregate.remarks && (
                    <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${getRemarkColor(departmentAggregate.remarks)}`}>
                      {departmentAggregate.remarks}
                    </span>
                  )}
                </div>
                <p className="text-xs text-tertiary mt-1">Department average</p>
              </div>

              <div className="flex items-center gap-2">
                <DepartmentZipButton
                  evaluationPeriodId={evaluationPeriodId}
                  departmentIds={[departmentId]}
                  facultyIds={allFacultySelected ? [] : selectedFacultyIds}
                  disabled={selectedFacultyIds.length === 0}
                  exportApiBase="/api/dean/evaluation-results/export/excel"
                />
              </div>
            </div>

            {(attentionRubrics.length > 0 || departmentAggregate.highestRubrics.length > 0) && (
              <div className="space-y-1 border-t border-default pt-3">
                {attentionRubrics.length > 0 && (
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-xs text-tertiary">Needs attention</span>
                    <span className="text-sm font-semibold text-danger-text text-right">
                      {attentionRubrics.map((r) => `${r.label} ${r.score.toFixed(2)}`).join(", ")}
                    </span>
                  </div>
                )}
                {departmentAggregate.highestRubrics.length > 0 && (
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-xs text-tertiary">Top rubric</span>
                    <span className="text-sm font-semibold text-success-text text-right">
                      {departmentAggregate.highestRubrics.map((r) => `${r.label} ${r.score.toFixed(2)}`).join(", ")}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DepartmentSubjectView
            subjects={subjects}
            members={members}
            departmentId={departmentId}
            evaluationPeriodId={evaluationPeriodId}
            search={search}
            onSearchChange={setSearch}
            visibilityMap={visibilityMap}
            onVisibilityChange={toggleVisibility}
            onBulkVisibilityChange={bulkSetVisibility}
            facultyAggregates={resultsData?.facultyAggregates ?? {}}
            selectedFacultyIds={selectedFacultyIds}
            onFacultySelectionChange={toggleFacultySelection}
          />
        </>
      )}
    </div>
  )
}
