"use client"

import { useState, useMemo } from "react"

export interface Step1Student {
  email: string
  name: string
  departmentId: string | null | undefined
  status: "new" | "registered" | "invalid"
}

// Mirrors the main preview table's page size (each bulk importer owns its own
// constant — same convention as the sibling Bulk* components).
const PREVIEW_PAGE_SIZE = 50

/**
 * Step 1 distinct roster: one read-only row per student email. Filter + paging
 * state lives here; the parent remounts per file via `key={fileRunId}`, which
 * is the reset mechanism — no reset props needed.
 */
export default function Step1StudentRoster({
  students,
  deptCodeOf,
}: {
  students: Step1Student[]
  deptCodeOf: (id: string | null | undefined) => string
}) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) => s.email.includes(q) || s.name.toLowerCase().includes(q))
  }, [students, query])
  const totalPages = Math.ceil(visible.length / PREVIEW_PAGE_SIZE)

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold text-secondary">
          {visible.length} distinct student{visible.length !== 1 ? "s" : ""}
        </p>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0) }}
          placeholder="Filter students…"
          title="Filter this roster by name or email"
          className="text-[11px] px-3 py-1 rounded-full border border-default bg-surface-hover text-secondary outline-none focus:border-gold-400 w-44"
        />
      </div>
      <div className="max-h-56 overflow-y-auto tbl-container tbl">
        <table>
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>Student</th>
              <th>Dept</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(page * PREVIEW_PAGE_SIZE, (page + 1) * PREVIEW_PAGE_SIZE).map((s, i) => (
              <tr key={s.email}>
                <td className="text-tertiary">{page * PREVIEW_PAGE_SIZE + i + 1}</td>
                <td className="text-secondary text-[13px]">
                  {s.name} <span className="text-tertiary">{s.email}</span>
                </td>
                <td className="text-[13px]">{deptCodeOf(s.departmentId)}</td>
                <td>
                  {s.status === "new" ? (
                    <span className="badge-emerald text-[10px]" title="Will be registered as a student record">New</span>
                  ) : s.status === "invalid" ? (
                    <span className="badge-red text-[10px]" title="Cannot be registered — fix in the Step 2 table">Invalid</span>
                  ) : (
                    <span className="text-[11px] text-tertiary">Registered</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-tertiary">Page {page + 1} of {totalPages}</p>
          <div className="flex gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}
              className="px-4 py-1.5 bg-surface-dim text-secondary rounded-full text-xs font-semibold hover:bg-surface-dim/70 disabled:opacity-40 transition-colors">
              Prev
            </button>
            <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}
              className="px-4 py-1.5 bg-surface-dim text-secondary rounded-full text-xs font-semibold hover:bg-surface-dim/70 disabled:opacity-40 transition-colors">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
