"use client"

import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import type { SubjectDetail, Student } from "./CoveragePage"

interface Props {
  open: boolean
  title: string
  detail: SubjectDetail | "loading" | "error" | null
  onClose: () => void
}

function Bucket({ title, tone, students }: { title: string; tone: string; students: Student[] }) {
  return (
    <div className="rounded-lg border border-default bg-surface p-3">
      <p className={`text-[11px] font-bold uppercase tracking-wider ${tone}`}>{title} ({students.length})</p>
      {students.length === 0 ? (
        <p className="text-xs text-tertiary mt-2">None</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {students.map((s) => (
            <li key={s.id} className="text-xs text-secondary">
              <span className="font-semibold text-primary">{s.name}</span>
              <span className="text-tertiary ml-1">({s.email})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function CoverageDetailModal({ open, title, detail, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose() }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open) return null
  if (typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coverage-modal-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className="relative z-10 w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-xl border border-default bg-surface p-5 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="coverage-modal-title" className="text-sm font-bold text-primary">{title}</h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="text-xs font-semibold text-secondary hover:text-primary"
            aria-label="Close"
          >
            Close
          </button>
        </div>
        {detail === "loading" && <p className="text-xs text-tertiary">Loading...</p>}
        {detail === "error" && <p className="text-xs text-red-600">Failed to load.</p>}
        {detail && detail !== "loading" && detail !== "error" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Bucket title="Participated" tone="text-emerald-600 dark:text-emerald-400" students={detail.participated} />
            <Bucket title="Not Participated" tone="text-amber-600 dark:text-amber-400" students={detail.notParticipated} />
            <Bucket title="Disputed" tone="text-rose-600 dark:text-rose-400" students={detail.disputed} />
            <Bucket title="In-progress" tone="text-blue-600 dark:text-blue-400" students={detail.inProgress} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
