"use client"

import { useState, type ReactNode } from "react"
import Alert from "@/components/ui/Alert"

export interface TraceStep {
  id: string
  label: string
}

export function StepperTrace({ steps, doneCount, footnote }: { steps: TraceStep[]; doneCount: number; footnote?: ReactNode }) {
  const current = Math.min(doneCount, steps.length - 1)
  return (
    <div className="rounded-xl border border-default px-4 py-3">
      <div className="flex items-center gap-1 overflow-x-auto" role="list" aria-label="Import steps">
        {steps.map((step, i) => {
          const done = i < doneCount
          const isCurrent = i === current
          return (
            <div key={step.id} role="listitem" className="flex items-center gap-1.5 shrink-0">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${done ? "bg-green-500 text-white" : isCurrent ? "bg-brand-500 text-white" : "bg-surface-tertiary text-tertiary"}`}>
                {done ? "✓" : i + 1}
              </span>
              <span className={`text-[11px] ${isCurrent ? "font-semibold text-brand-600" : done ? "text-primary" : "text-tertiary"}`}>{step.label}</span>
              {i < steps.length - 1 && <span className={`w-4 h-0.5 mx-1 ${done ? "bg-green-400" : "bg-surface-tertiary"}`} />}
            </div>
          )
        })}
      </div>
      {footnote && <p className="mt-2 text-[11px] text-tertiary">{footnote}</p>}
    </div>
  )
}

export interface StepIssue {
  key: string
  reason: string
}

export function StepPanel({
  title,
  runLabel,
  runningLabel,
  running,
  disabled,
  disabledTitle,
  onRun,
  summary,
  invalid,
  invalidKeyPrefix,
  confirmTitle,
  confirmMessage,
  children,
}: {
  title: string
  runLabel: string
  runningLabel: string
  running: boolean
  disabled: boolean
  disabledTitle?: string
  onRun: () => void
  summary: ReactNode
  invalid: StepIssue[]
  invalidKeyPrefix: string
  confirmTitle: string
  confirmMessage: string
  children?: ReactNode
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  return (
    <div className="rounded-xl border border-default px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-secondary">{title}</p>
        <button
          type="button"
          disabled={disabled || running}
          title={disabledTitle}
          onClick={() => setConfirmOpen(true)}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-default bg-surface-hover hover:bg-surface-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? runningLabel : runLabel}
        </button>
      </div>
      <div className="space-y-1">
        {summary}
        {children}
        {invalid.length > 0 && (
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {invalid.map((e, i) => (
              <p key={`${invalidKeyPrefix}-${i}`} className="text-[11px] text-red-600 dark:text-red-400">
                {e.key || "(blank)"} — {e.reason}
              </p>
            ))}
          </div>
        )}
      </div>
      <Alert
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={onRun}
      />
    </div>
  )
}
