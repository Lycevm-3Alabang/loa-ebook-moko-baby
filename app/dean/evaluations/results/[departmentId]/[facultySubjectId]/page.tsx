"use client"

import { useParams, useSearchParams } from "next/navigation"
import Skeleton from "@/components/ui/Skeleton"
import ErrorState from "@/components/ui/ErrorState"
import { useApiGet } from "@/lib/api/client"
import { getRemarkColor, sectionLabel, CATEGORY_KEYS, CATEGORY_LABELS } from "@/lib/evaluation-utils"
import { SentimentBadge } from "@/features/evaluations/components/evaluation/SentimentBadge"
import { DownloadEvalPdfButton } from "@/features/evaluations/components/DownloadEvalPdfButton"

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
  department: { id: string; name: string; code: string }
  faculty: { id: string; name: string; email: string }
  subject: { id: string; code: string; name: string }
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

export default function DeanGroupDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const departmentId = params.departmentId as string
  const facultySubjectId = params.facultySubjectId as string
  const evaluationPeriodId = searchParams.get("evaluationPeriodId") || searchParams.get("semesterId") || ""

  const { data, error: dataError, isLoading } = useApiGet<GroupDetailData>(
    evaluationPeriodId
      ? `/api/dean/evaluation-results/departments/${encodeURIComponent(departmentId)}/groups/${encodeURIComponent(facultySubjectId)}?evaluationPeriodId=${encodeURIComponent(evaluationPeriodId)}`
      : null,
  )
  const error = dataError?.message || ""
  const loading = isLoading && !!evaluationPeriodId

  const formatScore = (v: number | null) => (v !== null ? v.toFixed(2) : "\u2014")

  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />

  if (loading) {
    return (
      <div className="w-full space-y-6 pb-12">
        <Skeleton variant="card" />
        <Skeleton variant="table-row" />
      </div>
    )
  }

  if (!data) return null

  const sectionText = sectionLabel(data.sectionProgram, data.sectionName)

  return (
    <div className="w-full space-y-8 pb-12">

      <div className="flex items-center justify-between">
        <DownloadEvalPdfButton
          facultyName={data.faculty.name}
          facultyEmail={data.faculty.email}
          subjectCode={data.subject.code}
          subjectName={data.subject.name}
          departmentName={data.department.name}
          departmentCode={data.department.code}
          summary={data.summary}
          evaluations={data.evaluations}
        />
      </div>

      <div className="card p-5 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] text-tertiary">Department</p>
            <p className="text-sm font-semibold">{data.department.name} ({data.department.code})</p>
          </div>
          <div>
            <p className="text-[10px] text-tertiary">Faculty</p>
            <p className="text-sm font-semibold">{data.faculty.name}</p>
            <p className="text-[10px] text-tertiary">{data.faculty.email}</p>
          </div>
          <div>
            <p className="text-[10px] text-tertiary">Subject</p>
            <p className="text-sm font-semibold">{data.subject.code} {data.subject.name}</p>
            {sectionText && <p className="text-[10px] text-tertiary">Section {sectionText}</p>}
          </div>
          <div>
            <p className="text-[10px] text-tertiary">Respondents</p>
            <p className="text-sm font-semibold">{data.summary.totalRespondents}</p>
          </div>
        </div>
      </div>

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
          <div>
            <p className="text-[10px] text-tertiary">Sentiment Score</p>
            <p className="text-sm font-semibold">
              {data.summary.sentimentScore !== null ? data.summary.sentimentScore.toFixed(4) : "\u2014"}
            </p>
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
                <th className="pb-3">Sentiment</th>
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
                    {ev.sentimentLabel ? (
                      <SentimentBadge label={ev.sentimentLabel} />
                    ) : (
                      <span className="text-[10px] text-tertiary">&mdash;</span>
                    )}
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
                    {ev.sentimentLabel && <SentimentBadge label={ev.sentimentLabel} />}
                  </div>
                  <p className="text-xs text-primary whitespace-pre-wrap">{ev.comment}</p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
