"use client"

import { useParams, useRouter, useSearchParams } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import IosButton from "@/components/ui/IosButton"
import { useApiGet } from "@/lib/api/client"
import { useCrumb } from "@/lib/contexts/breadcrumb"
import { getRemarkColor, sectionLabel, CATEGORY_KEYS, CATEGORY_LABELS } from "@/lib/evaluation-utils"
import { ExportXlsxButton } from "./ExportXlsxButton"
import ReasonModal from "@/components/ui/ReasonModal"
import { useState } from "react"

interface EvaluationRow {
  evaluationId: string
  submittedAt: string | null
  generalRating: number | null
  professionalManner: number | null
  communicationWithStudent: number | null
  studentEngagement: number | null
  learningMaterials: number | null
  timeManagement: number | null
  experientialLearning: number | null
  respectUniqueness: number | null
  assessmentAndFeedback: number | null
  comment: string | null
  sentimentLabel: string | null
  sentimentScore: number | null
}

interface GroupDetailData {
  department: { id: string; name: string; code: string } | null
  faculty: { id: string; name: string; email: string } | null
  subject: { id: string; code: string; name: string } | null
  sectionProgram: string | null
  sectionName: string | null
  summary: {
    totalRespondents: number
    avgRating: number | null
    remarks: string | null
    highestRubrics: { key: string; label: string; score: number }[]
    lowestRubrics: { key: string; label: string; score: number }[]
    sentimentScore: number | null
  } & Record<string, number | null>
  evaluations: EvaluationRow[]
}

interface EvalDetailItem {
  categoryName: string
  items: { text: string; rating: number }[]
}

interface EvalDetailData {
  evaluationId: string
  submittedAt: string | null
  evaluatorName: string
  categories: EvalDetailItem[]
  comment: string | null
  sentimentLabel: string | null
  sentimentScore: number | null
  isDisabled: boolean
}

export default function GroupDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const departmentId = params.departmentId as string
  const facultySubjectId = params.facultySubjectId as string
  const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId") || ""

  const { data, error: dataError, isLoading } = useApiGet<GroupDetailData>(
    evaluationPeriodId
      ? `/api/admin/evaluation-results/departments/${encodeURIComponent(departmentId)}/groups/${encodeURIComponent(facultySubjectId)}?evaluationPeriodId=${encodeURIComponent(evaluationPeriodId)}`
      : null,
  )
  const error = dataError?.message || ""
  const loading = isLoading && !!evaluationPeriodId

  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string | null>(null)
  const [evalDetail, setEvalDetail] = useState<EvalDetailData | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showInvalidateConfirm, setShowInvalidateConfirm] = useState(false)
  const [invalidating, setInvalidating] = useState(false)

  const department = data?.department ?? null
  const faculty = data?.faculty ?? null
  const subject = data?.subject ?? null

  useCrumb(
    departmentId,
    department
      ? {
          label: `${department.name}${department.code ? ` (${department.code})` : ""}`,
          href: `/admin/evaluations/results/${departmentId}?evaluationPeriodId=${encodeURIComponent(evaluationPeriodId)}`,
        }
      : null,
  )
  useCrumb(
    facultySubjectId,
    faculty && subject ? { label: `${faculty.name} \u2014 ${subject.code} ${subject.name}` } : null,
  )

  const formatScore = (v: number | null) => (v !== null ? v.toFixed(2) : "\u2014")

  async function handleViewEvaluation(evaluationId: string) {
    setSelectedEvaluationId(evaluationId)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/admin/evaluations/${encodeURIComponent(evaluationId)}/details`)
      if (!res.ok) throw new Error("Failed to load evaluation details")
      const data = await res.json()
      setEvalDetail(data)
    } catch {
      setEvalDetail(null)
    }
    setLoadingDetail(false)
  }

  async function handleInvalidateEvaluation(reason: string) {
    if (!selectedEvaluationId) return
    setInvalidating(true)
    try {
      const res = await fetch(
        `/api/admin/evaluations/${encodeURIComponent(selectedEvaluationId)}/invalidate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evaluationPeriodId, reason }),
        }
      )
      if (!res.ok) throw new Error("Failed to invalidate")
      setSelectedEvaluationId(null)
      setEvalDetail(null)
      setShowInvalidateConfirm(false)
      window.location.reload()
    } catch {
      // show error
    }
    setInvalidating(false)
  }

  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />

  if (loading) {
    return (
      <div className="w-full space-y-6 pb-12">
        <Skeleton variant="card" />
        <Skeleton variant="table-row" />
        <Skeleton variant="table-row" />
      </div>
    )
  }

  if (!data) return null

  const sectionText = sectionLabel(data.sectionProgram, data.sectionName)
  // A missing user row must render, not crash the page.
  const facultyName = data.faculty?.name ?? "Unknown"
  const facultyEmail = data.faculty?.email ?? ""
  const subjectCode = data.subject?.code ?? ""
  const subjectName = data.subject?.name ?? ""
  const departmentName = data.department?.name ?? "Department"
  const departmentCode = data.department?.code ?? ""

  return (
    <div className="w-full space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <IosButton
          variant="plain"
          size="xs"
          onClick={() => router.push(`/admin/evaluations/results/${departmentId}?evaluationPeriodId=${encodeURIComponent(evaluationPeriodId)}`)}
        >
          &larr; Back to {departmentName} Evaluation Results
        </IosButton>
        <div className="flex items-center gap-2">
          <ExportXlsxButton
            departmentId={departmentId}
            facultySubjectId={facultySubjectId}
            evaluationPeriodId={evaluationPeriodId}
            subjectCode={subjectCode}
            facultyName={facultyName}
          />
        </div>
      </div>

      {/* Department Header Card */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">Department</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] text-tertiary">Department</p>
            <p className="text-sm font-semibold">{departmentName} ({departmentCode})</p>
          </div>
          <div>
            <p className="text-[10px] text-tertiary">Faculty</p>
            <p className="text-sm font-semibold">{facultyName}</p>
            <p className="text-[10px] text-tertiary">{facultyEmail}</p>
          </div>
          <div>
            <p className="text-[10px] text-tertiary">Subject</p>
            <p className="text-sm font-semibold">{subjectCode} {subjectName}</p>
            {sectionText && <p className="text-[10px] text-tertiary">Section {sectionText}</p>}
          </div>
          <div>
            <p className="text-[10px] text-tertiary">Respondents</p>
            <p className="text-sm font-semibold">{data.summary.totalRespondents}</p>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="card p-5 space-y-4">
        <p className="text-xs font-semibold text-secondary">Aggregate Summary</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] text-tertiary">Average Rating</p>
            <p className="text-lg font-bold">{formatScore(data.summary.avgRating)}</p>
            {data.summary.remarks && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getRemarkColor(data.summary.remarks)}`}>
                {data.summary.remarks}
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] text-tertiary">Highest Rubric</p>
            {data.summary.highestRubrics.map((r) => (
              <p key={r.key} className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {r.label}: {formatScore(r.score)}
              </p>
            ))}
          </div>
          <div>
            <p className="text-[10px] text-tertiary">Lowest Rubric</p>
            {data.summary.lowestRubrics.map((r) => (
              <p key={r.key} className="text-xs font-semibold text-red-600 dark:text-red-400">
                {r.label}: {formatScore(r.score)}
              </p>
            ))}
          </div>
        </div>

        <div className="border-t border-default pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary mb-2">Rubric Scores</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CATEGORY_KEYS.map((key) => (
              <div key={key}>
                <p className="text-[10px] text-tertiary">{CATEGORY_LABELS[key]}</p>
                <p className="text-sm font-semibold">{formatScore(data.summary[key])}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Individual Evaluations Table */}
      <div className="card p-5 space-y-3">
        <p className="text-xs font-semibold text-secondary">
          Individual Evaluations ({data.evaluations.length})
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-tertiary border-b border-default">
                <th className="pb-3 pr-3">#</th>
                <th className="pb-3 pr-3">Date</th>
                <th className="pb-3 pr-3 text-right">General</th>
                {CATEGORY_KEYS.map((key) => (
                  <th key={key} className="pb-3 pr-3 text-right">{CATEGORY_LABELS[key]}</th>
                ))}
                <th className="pb-3 pr-3">Comment</th>
                <th className="pb-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.evaluations.map((ev, idx) => (
                <tr key={ev.evaluationId} className="border-b border-default hover:bg-surface-hover transition-colors">
                  <td className="py-2.5 pr-3 text-xs text-tertiary">{idx + 1}</td>
                  <td className="py-2.5 pr-3 text-xs text-secondary whitespace-nowrap">
                    {ev.submittedAt ? new Date(ev.submittedAt).toLocaleDateString() : "\u2014"}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-sm font-bold">{formatScore(ev.generalRating)}</td>
                  {CATEGORY_KEYS.map((key) => (
                    <td key={key} className="py-2.5 pr-3 text-right text-xs text-secondary">{formatScore(ev[key])}</td>
                  ))}
                  <td className="py-2.5 pr-3 text-xs text-secondary max-w-[200px] truncate" title={ev.comment ?? ""}>
                    {ev.comment ?? "\u2014"}
                  </td>
                  <td className="py-2.5">
                    <IosButton
                      variant="plain"
                      size="xs"
                      onClick={() => handleViewEvaluation(ev.evaluationId)}
                      title="Open this evaluation response"
                    >
                      View
                    </IosButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.evaluations.length === 0 && (
          <p className="text-sm text-tertiary text-center py-4">No evaluation records found.</p>
        )}
      </div>

      {/* Compiled Comments Section */}
      <div className="card p-5 space-y-3">
        <p className="text-xs font-semibold text-secondary">Compiled Comments</p>
        {data.evaluations.filter((ev) => ev.comment).length === 0 ? (
          <p className="text-sm text-tertiary text-center py-4">No comments submitted.</p>
        ) : (
          <div className="space-y-3">
            {data.evaluations
              .filter((ev) => ev.comment)
              .map((ev) => (
                <div key={ev.evaluationId} className="p-3 rounded-lg bg-surface-muted border border-default space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-tertiary">
                      {ev.submittedAt ? new Date(ev.submittedAt).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <p className="text-xs text-primary whitespace-pre-wrap">{ev.comment}</p>
                </div>
              ))}
          </div>
        )}
      </div>

      {selectedEvaluationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setSelectedEvaluationId(null); setEvalDetail(null) }} />
          <div className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto bg-surface rounded-2xl shadow-ios-xl p-6 space-y-4">
            {loadingDetail && <p className="text-sm text-tertiary text-center py-8">Loading...</p>}
            {evalDetail && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-primary">Evaluation Detail</p>
                  <IosButton variant="plain" size="xs" onClick={() => { setSelectedEvaluationId(null); setEvalDetail(null) }}>Close</IosButton>
                </div>
                <p className="text-xs text-tertiary">
                  {facultyName} &mdash; {subjectCode} {subjectName}
                  {evalDetail.submittedAt && ` | ${new Date(evalDetail.submittedAt).toLocaleString()}`}
                </p>
                {evalDetail.categories.map((cat) => (
                  <div key={cat.categoryName} className="space-y-2">
                    <p className="text-xs font-semibold text-secondary uppercase tracking-wider">{cat.categoryName}</p>
                    {cat.items.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-4 px-3 py-2 rounded-lg bg-surface-muted">
                        <p className="text-xs text-secondary flex-1">{item.text}</p>
                        <span className="text-xs font-bold text-primary whitespace-nowrap">{item.rating}/5</span>
                      </div>
                    ))}
                  </div>
                ))}
                {evalDetail.comment && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-secondary">Comment</p>
                    <p className="text-xs text-primary whitespace-pre-wrap p-3 rounded-lg bg-surface-muted">{evalDetail.comment}</p>
                  </div>
                )}
                {!evalDetail.isDisabled && (
                  <div className="border-t border-default pt-3 flex justify-end">
                    <IosButton
                      variant="destructive"
                      size="sm"
                      loading={invalidating}
                      onClick={() => setShowInvalidateConfirm(true)}
                      title="Void this submitted evaluation"
                    >
                      {invalidating ? "Invalidating..." : "Invalidate This Evaluation"}
                    </IosButton>
                  </div>
                )}
                {evalDetail.isDisabled && (
                  <p className="text-xs text-red-600 font-semibold">This evaluation has already been invalidated.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <ReasonModal
        isOpen={showInvalidateConfirm}
        title="Invalidate Evaluation"
        confirmLabel="Invalidate"
        onConfirm={(reason) => handleInvalidateEvaluation(reason)}
        onClose={() => setShowInvalidateConfirm(false)}
      />
    </div>
  )
}
