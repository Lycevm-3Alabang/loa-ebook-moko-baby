"use client"

import { useMemo, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import IosButton from "@/components/ui/IosButton"
import { getRemarkColor, sectionLabel, formatFacultyName, type FacultyAggregate } from "@/lib/evaluation-utils"
import { downloadEvalDetailPdf } from "@/lib/evaluation-pdf"

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

interface Props {
  subjects: SubjectRow[]
  departmentId: string
  evaluationPeriodId: string
  search: string
  onSearchChange: (v: string) => void
  basePath?: string
  visibilityMap?: Record<string, boolean>
  onVisibilityChange?: (facultyId: string, visible: boolean) => void
  onBulkVisibilityChange?: (visible: boolean) => void
  facultyAggregates?: Record<string, FacultyAggregate>
}

type SortDir = "asc" | "desc"

export default function DepartmentSubjectView({ subjects, departmentId, evaluationPeriodId, search, onSearchChange, basePath = "/admin/evaluations/results", visibilityMap = {}, onVisibilityChange, onBulkVisibilityChange, facultyAggregates = {} }: Props) {
  const router = useRouter()
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [expandedFaculty, setExpandedFaculty] = useState<Set<string>>(new Set())

  const formatScore = (v: number | null) => (v !== null ? v.toFixed(2) : "—")

  const filteredSubjects = useMemo(() => {
    if (!search.trim()) return subjects
    const q = search.toLowerCase()
    return subjects.filter(
      (s) =>
        s.facultyName.toLowerCase().includes(q) ||
        // The name as DISPLAYED — an admin reads "Dela Cruz, Juan" and
        // searches for it.
        formatFacultyName(s.facultyName).toLowerCase().includes(q) ||
        s.facultyEmail.toLowerCase().includes(q) ||
        s.subjectCode.toLowerCase().includes(q) ||
        s.subjectName.toLowerCase().includes(q) ||
        sectionLabel(s.sectionProgram, s.sectionName).toLowerCase().includes(q),
    )
  }, [subjects, search])

  const facultyGroups = useMemo(() => {
    const map = new Map<string, { facultyId: string; facultyName: string; facultyEmail: string; subjects: SubjectRow[] }>()
    for (const s of filteredSubjects) {
      if (!map.has(s.facultyId)) {
        map.set(s.facultyId, { facultyId: s.facultyId, facultyName: s.facultyName, facultyEmail: s.facultyEmail, subjects: [] })
      }
      map.get(s.facultyId)!.subjects.push(s)
    }
    // The department's OWN faculty: the server's aggregate map is the member
    // list, so a teacher homed elsewhere who has a subject here has no card.
    return Array.from(map.values()).filter((g) => facultyAggregates[g.facultyId] !== undefined)
  }, [filteredSubjects, facultyAggregates])

  // The cards are read by surname — the order the name is displayed in.
  const sortedGroups = useMemo(() => {
    const sorted = [...facultyGroups]
    sorted.sort((a, b) => {
      const cmp = formatFacultyName(a.facultyName).localeCompare(
        formatFacultyName(b.facultyName),
        undefined,
        { sensitivity: "base" },
      )
      return sortDir === "asc" ? cmp : -cmp
    })
    return sorted
  }, [facultyGroups, sortDir])

  // Several cards can be open at once: with the flat table gone, the page is
  // read by opening the teachers you care about.
  const allExpanded = facultyGroups.length > 0 && facultyGroups.every((g) => expandedFaculty.has(g.facultyId))

  const toggleExpanded = (facultyId: string) => {
    setExpandedFaculty((prev) => {
      const next = new Set(prev)
      if (next.has(facultyId)) next.delete(facultyId)
      else next.add(facultyId)
      return next
    })
  }

  const toggleAllExpanded = () => {
    setExpandedFaculty(allExpanded ? new Set() : new Set(facultyGroups.map((g) => g.facultyId)))
  }

  const apiPrefix = basePath.startsWith("/dean") ? "/api/dean" : "/api/admin"

  const handleConsolidatedPdf = useCallback(async (facultyId: string, _facultyName: string, _facultyEmail: string) => {
    try {
      const res = await fetch(
        `${apiPrefix}/evaluation-results/departments/${encodeURIComponent(departmentId)}/faculty/${encodeURIComponent(facultyId)}?evaluationPeriodId=${encodeURIComponent(evaluationPeriodId)}`,
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }))
        console.error(err.error)
        return
      }
      const data = await res.json()
      await downloadEvalDetailPdf({
        facultyName: data.faculty.name,
        facultyEmail: data.faculty.email,
        subjectCode: data.subject.code,
        subjectName: "Consolidated",
        departmentName: data.department.name,
        departmentCode: data.department.code,
        summary: data.summary,
        evaluations: data.evaluations,
      })
    } catch (e) {
      console.error("Consolidated PDF error:", e)
    }
  }, [apiPrefix, departmentId, evaluationPeriodId])

  const uniqueFacultyIds = useMemo(() => [...new Set(subjects.map((s) => s.facultyId))], [subjects])
  const allVisible = uniqueFacultyIds.length > 0 && uniqueFacultyIds.every((id) => visibilityMap[id])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search faculty, subject..."
          className="input text-xs flex-1 max-w-xs px-3 py-2 rounded-lg border border-strong bg-surface"
        />
        <span className="text-[10px] text-tertiary">
          {facultyGroups.length} facult{facultyGroups.length !== 1 ? "ies" : "y"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <IosButton
            variant="gray"
            size="sm"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            title={sortDir === "asc" ? "Sorted by surname A–Z — click for Z–A" : "Sorted by surname Z–A — click for A–Z"}
          >
            Name {sortDir === "asc" ? "↑" : "↓"}
          </IosButton>
          <IosButton variant="gray" size="sm" onClick={toggleAllExpanded}>
            {allExpanded ? "Collapse all" : "Expand all"}
          </IosButton>
          {onBulkVisibilityChange && uniqueFacultyIds.length > 0 && (
            <button
              type="button"
              onClick={() => onBulkVisibilityChange(!allVisible)}
              title={allVisible ? "Hide evaluation results from all faculty" : "Show evaluation results to all faculty"}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                allVisible
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                  : "bg-surface text-tertiary border border-default hover:bg-surface-hover hover:text-secondary"
              }`}
            >
              {allVisible ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268 2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              )}
              {allVisible ? "All Visible" : "Show All"}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {sortedGroups.map((group) => {
          const agg = facultyAggregates[group.facultyId]
          const facultyAvg = agg?.avgRating ?? null
          const facultyRemark = agg?.remarks ?? null
          const totalResp = agg?.totalRespondents ?? 0
          const isExpanded = expandedFaculty.has(group.facultyId)

          return (
            <div key={group.facultyId} className="card p-4 space-y-2">
              <div
                onClick={() => toggleExpanded(group.facultyId)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(group.facultyId) } }}
                role="button"
                tabIndex={0}
                className="w-full flex items-center justify-between text-left cursor-pointer"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-primary">{formatFacultyName(group.facultyName)}</span>
                  <span className="text-[10px] text-tertiary">{group.facultyEmail}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-lg font-bold">{formatScore(facultyAvg)}</span>
                    {facultyRemark && (
                      <span className={`ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${getRemarkColor(facultyRemark)}`}>
                        {facultyRemark}
                      </span>
                    )}
                  </div>
                  <div className="text-right text-xs text-tertiary">
                    <div>{group.subjects.length} subject{group.subjects.length !== 1 ? "s" : ""}</div>
                    <div>{totalResp} response{totalResp !== 1 ? "s" : ""}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleConsolidatedPdf(group.facultyId, group.facultyName, group.facultyEmail)
                    }}
                    className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                    title="Download consolidated PDF"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </button>
                  {onVisibilityChange && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onVisibilityChange(group.facultyId, !visibilityMap[group.facultyId])
                      }}
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                        visibilityMap[group.facultyId]
                          ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                          : "bg-surface-tertiary text-tertiary hover:bg-amber-100 hover:text-amber-600"
                      }`}
                      title={visibilityMap[group.facultyId] ? "Visible to faculty — click to hide" : "Hidden from faculty — click to show"}
                    >
                      {visibilityMap[group.facultyId] ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268 2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      )}
                    </button>
                  )}
                  <span className="text-tertiary text-xs">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-default pt-3">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-semibold uppercase tracking-wider text-tertiary border-b border-default">
                        <th className="pb-2 pr-3">Subject</th>
                        <th className="pb-2 pr-3">Section</th>
                        <th className="pb-2 pr-3 text-right">Avg Rating</th>
                        <th className="pb-2 pr-3 text-right">Highest</th>
                        <th className="pb-2 pr-3 text-right">Lowest</th>
                        <th className="pb-2 text-right">Resp.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.subjects.map((s) => (
                        <tr
                          key={s.facultySubjectId}
                          onClick={() =>
                            router.push(
                              `${basePath}/${departmentId}/${s.facultySubjectId}?evaluationPeriodId=${encodeURIComponent(evaluationPeriodId)}`,
                            )
                          }
                          className="border-b border-default hover:bg-surface-hover cursor-pointer transition-colors"
                        >
                          <td className="py-2 pr-3 text-xs text-secondary">{s.subjectCode} {s.subjectName}</td>
                          <td className="py-2 pr-3 text-xs text-secondary">{sectionLabel(s.sectionProgram, s.sectionName)}</td>
                          <td className="py-2 pr-3 text-right text-xs font-semibold">{formatScore(s.avgRating)}</td>
                          <td className="py-2 pr-3 text-right text-[10px] text-emerald-600 dark:text-emerald-400">
                            {s.highestRubrics.length > 0 ? `${s.highestRubrics[0].label} (${formatScore(s.highestRubrics[0].score)})` : "—"}
                          </td>
                          <td className="py-2 pr-3 text-right text-[10px] text-red-600 dark:text-red-400">
                            {s.lowestRubrics.length > 0 ? `${s.lowestRubrics[0].label} (${formatScore(s.lowestRubrics[0].score)})` : "—"}
                          </td>
                          <td className="py-2 text-right text-xs text-secondary">{s.totalRespondents}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
