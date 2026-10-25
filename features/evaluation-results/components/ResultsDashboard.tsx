"use client"

import Skeleton from "@/components/ui/Skeleton"
import { getRemarkColor } from "@/lib/evaluation-utils"
import {
  buildResultsDashboard,
  type ResultsDashboardBar,
  type ResultsDashboardRow,
  type ResultsDashboardRubric,
} from "../results-dashboard"

interface ResultsDashboardProps {
  rows: ResultsDashboardRow[]
  attentionByDept: Record<string, ResultsDashboardRubric[]>
  settled: boolean
  missingDepartmentIds: readonly string[]
}

const REMARK_BAR: Record<string, string> = {
  Outstanding: "bg-success",
  "Very Satisfactory": "bg-info",
  Satisfactory: "bg-warning",
  Unsatisfactory: "bg-danger",
  Poor: "bg-danger",
}

const LEGEND: { label: string; dot: string }[] = [
  { label: "Outstanding", dot: "bg-success" },
  { label: "Very Satisfactory", dot: "bg-info" },
  { label: "Satisfactory", dot: "bg-warning" },
  { label: "Unsatisfactory/Poor", dot: "bg-danger" },
  { label: "No results", dot: "bg-surface-secondary border border-strong" },
]

function formatScore(value: number | null): string {
  return value === null ? "\u2014" : value.toFixed(2)
}

function barWidth(value: number | null): string | undefined {
  if (value === null) return undefined
  return `${Math.max(0, Math.min(100, (value / 5) * 100))}%`
}

function barAriaLabel(bar: ResultsDashboardBar): string {
  if (bar.avgRating === null) return `${bar.label}: no results`
  const value = bar.avgRating.toFixed(2)
  return bar.remark ? `${bar.label}: ${value}, ${bar.remark}` : `${bar.label}: ${value}`
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" data-testid="results-dashboard-skeleton" aria-hidden="true">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} variant="metric" className="h-32" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <Skeleton variant="card" className="h-80" />
        </div>
        <div className="lg:col-span-2">
          <Skeleton variant="card" className="h-80" />
        </div>
      </div>
    </div>
  )
}

export default function ResultsDashboard({
  rows,
  attentionByDept,
  settled,
  missingDepartmentIds,
}: ResultsDashboardProps) {
  if (!settled) return <DashboardSkeleton />

  const model = buildResultsDashboard(rows, attentionByDept, missingDepartmentIds)

  if (model.counts.departmentCount === 0) return null

  if (model.counts.loadedCount === 0) {
    return (
      <div
        className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"
        role="status"
      >
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
          Department figures could not be loaded. The dashboard is unavailable. Use Refresh above
          to try again.
        </p>
      </div>
    )
  }

  const attentionNames = model.attentionDepartments.map((department) => department.label)
  const attentionPreview =
    attentionNames.length > 3
      ? `${attentionNames.slice(0, 3).join(", ")} +${attentionNames.length - 3} more`
      : attentionNames.join(", ")

  const coverageSubtext =
    model.counts.missingCount > 0
      ? `${model.counts.unratedCount} with no rating \u00b7 ${model.counts.missingCount} not loaded`
      : model.counts.unratedCount > 0
        ? `${model.counts.unratedCount} with no rating`
        : "Every department has a rating"

  const chartSubtext = `Sorted highest to lowest \u00b7 ${model.counts.ratedCount} rated of ${model.counts.departmentCount} departments${
    model.counts.missingCount > 0 ? ` \u00b7 ${model.counts.missingCount} not loaded` : ""
  }`

  const chartLabel = `Average rating by department: ${model.counts.ratedCount} rated, ${model.counts.unratedCount} with no results`

  return (
    <section aria-label="Results overview" className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className="card flex min-h-[8rem] flex-col justify-between gap-3 p-4"
          data-testid="dashboard-mean-tile"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">
            Mean of department averages
          </p>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-4xl font-bold leading-none tabular-nums text-primary">
              {formatScore(model.mean)}
            </span>
            {model.meanRemark && (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getRemarkColor(model.meanRemark)}`}
              >
                {model.meanRemark}
              </span>
            )}
          </div>
          <p className="text-[11px] text-tertiary">
            {model.counts.ratedCount > 0
              ? `Across ${model.counts.ratedCount} of ${model.counts.departmentCount} departments`
              : "No department has a rating yet"}
          </p>
        </div>

        <div
          className="card flex min-h-[8rem] flex-col justify-between gap-3 p-4"
          data-testid="dashboard-attention-tile"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">
            Needs attention
          </p>
          <span
            className={`text-4xl font-bold leading-none tabular-nums ${
              model.attentionDepartments.length > 0 ? "text-danger-text" : "text-primary"
            }`}
          >
            {model.attentionDepartments.length}
          </span>
          <p
            className="truncate text-[11px] text-tertiary"
            title={attentionNames.length > 0 ? attentionNames.join(", ") : undefined}
          >
            {attentionNames.length > 0 ? attentionPreview : "No critical rubric flagged"}
          </p>
        </div>

        <div
          className="card flex min-h-[8rem] flex-col justify-between gap-3 p-4"
          data-testid="dashboard-coverage-tile"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-tertiary">
            Departments with results
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold leading-none tabular-nums text-primary">
              {model.counts.ratedCount}
            </span>
            <span className="text-lg text-tertiary">of {model.counts.departmentCount}</span>
          </div>
          <p className="text-[11px] text-tertiary">{coverageSubtext}</p>
        </div>
      </div>

      {model.counts.missingCount > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {model.counts.missingCount} department(s) could not be loaded and are excluded from the
          figures above. Use Refresh above to try again.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <section
          className="card p-5 lg:col-span-3"
          data-testid="dashboard-chart"
          aria-labelledby="results-dashboard-chart-title"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="results-dashboard-chart-title" className="text-sm font-bold text-primary">
              Average rating by department
            </h2>
            <p className="text-[11px] text-tertiary">{chartSubtext}</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {LEGEND.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5 text-[10px] text-tertiary"
              >
                <span className={`h-2 w-2 rounded-full ${item.dot}`} aria-hidden="true" />
                {item.label}
              </span>
            ))}
          </div>

          <div
            className="mt-4 space-y-1.5"
            role="list"
            aria-label={chartLabel}
          >
            {model.departmentBars.map((bar) => (
              <div
                key={bar.departmentId}
                role="listitem"
                aria-label={barAriaLabel(bar)}
                title={barAriaLabel(bar)}
                className="grid h-6 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_4.5rem] items-center gap-3"
              >
                <span className="min-w-0 truncate text-xs text-secondary" title={bar.label}>
                  {bar.label}
                </span>
                <div
                  className="h-2.5 overflow-hidden rounded-full bg-surface-secondary"
                  data-testid="dashboard-bar-track"
                  aria-hidden="true"
                >
                  {bar.avgRating !== null && (
                    <div
                      className={`h-full rounded-full ${REMARK_BAR[bar.remark ?? ""] ?? "bg-surface-tertiary"}`}
                      style={{ width: barWidth(bar.avgRating) }}
                      data-testid="dashboard-bar-fill"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <span
                  className={`text-right text-xs tabular-nums ${
                    bar.avgRating === null ? "text-tertiary" : "font-semibold text-primary"
                  }`}
                >
                  {bar.avgRating === null ? "No results" : bar.avgRating.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section
          className="card p-5 lg:col-span-2"
          data-testid="dashboard-weakest"
          aria-labelledby="results-dashboard-weakest-title"
        >
          <h2 id="results-dashboard-weakest-title" className="text-sm font-bold text-primary">
            Most common weakest criterion
          </h2>
          <p className="text-[11px] text-tertiary">
            Across {model.weaknessPopulation} rated departments{" \u00b7 "}ties counted
          </p>

          {model.weakest.length === 0 ? (
            <p className="mt-4 text-sm text-tertiary">No rubric data yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {model.weakest.map((criterion) => (
                <div key={criterion.key} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-secondary" title={criterion.label}>
                      {criterion.label}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-primary">
                      {criterion.count} of {model.weaknessPopulation}
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full bg-surface-secondary"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-info"
                      style={{
                        width: `${model.weaknessPopulation > 0 ? (criterion.count / model.weaknessPopulation) * 100 : 0}%`,
                      }}
                      data-testid="dashboard-weakest-bar"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
