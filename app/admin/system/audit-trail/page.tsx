"use client"

import { useState, useEffect, useCallback, Fragment } from "react"
import LockedTab from "@/components/ui/LockedTab"
import ErrorState from "@/components/ui/ErrorState"
import ErrorBoundary from "@/components/ui/ErrorBoundary"

interface AuditLog {
  id: string
  createdAt: string
  action: string
  email: string | null
  details: string | null
}

interface ListResponse {
  logs: AuditLog[]
  total: number
  page: number
  pageSize: number
}

function ActionBadge({ action }: { action: string }) {
  const colorMap: Record<string, string> = {
    LOGIN: "bg-blue-50 text-blue-700 border-blue-200/50",
    DISABLE_USER: "bg-red-50 text-red-700 border-red-200/50",
    ENABLE_USER: "bg-emerald-50 text-emerald-700 border-emerald-200/50",
    CREATE_USER: "bg-green-50 text-green-700 border-green-200/50",
    PASSWORD_RESET: "bg-amber-50 text-amber-700 border-amber-200/50",
    EMAIL_SENT: "bg-purple-50 text-purple-700 border-purple-200/50",
    EMAIL_FAILED: "bg-red-50 text-red-700 border-red-200/50",
    SERVER_ERROR: "bg-red-600 text-white border-red-600",
  }
  const fallback = "bg-surface text-secondary border-slate-200/50"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorMap[action] || fallback}`}>
      {action.replace(/_/g, " ")}
    </span>
  )
}

export default function AuditTrailPage() {
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [lockedEndpoint, setLockedEndpoint] = useState("")

  const [actionFilter, setActionFilter] = useState("")
  const [actionsList, setActionsList] = useState<string[]>([])
  const [emailFilter, setEmailFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [page, setPage] = useState(1)
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc")
  const pageSize = 25

  const [clearConfirm, setClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setErrorMessage("")
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("pageSize", String(pageSize))
      if (actionFilter) params.set("action", actionFilter)
      if (emailFilter) params.set("email", emailFilter)
      if (dateFrom) params.set("from", new Date(dateFrom).toISOString())
      if (dateTo) params.set("to", new Date(dateTo + "T23:59:59").toISOString())
      params.set("orderBy", "createdAt")
      params.set("orderDir", orderDir)

      const res = await fetch(`/api/admin/audit-logs?${params}`)
      if (res.status === 403) { setLockedEndpoint(`/api/admin/audit-logs?${params}`); return }
      if (!res.ok) throw new Error("Failed to fetch audit logs")
      const json: ListResponse = await res.json()
      setData(json)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, emailFilter, dateFrom, dateTo, orderDir])

  useEffect(() => { Promise.resolve().then(() => fetchLogs()) }, [fetchLogs])

  useEffect(() => {
    fetch("/api/admin/audit-logs?getActions=true")
      .then((r) => r.json())
      .then((d) => setActionsList(d.actions ?? []))
      .catch(() => {})
  }, [])

  const toggleSort = () => {
    setOrderDir((d) => (d === "desc" ? "asc" : "desc"))
    setPage(1)
  }

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  const handleExportCSV = () => {
    const params = new URLSearchParams()
    params.set("export", "csv")
    if (actionFilter) params.set("action", actionFilter)
    if (emailFilter) params.set("email", emailFilter)
    if (dateFrom) params.set("from", new Date(dateFrom).toISOString())
    if (dateTo) params.set("to", new Date(dateTo + "T23:59:59").toISOString())
    params.set("orderBy", "createdAt")
    params.set("orderDir", orderDir)
    window.open(`/api/admin/audit-logs?${params}`, "_blank")
  }

  const handleClearAll = async () => {
    setClearing(true)
    try {
      const res = await fetch("/api/admin/audit-logs", { method: "DELETE" })
      if (res.status === 403) { setLockedEndpoint("/api/admin/audit-logs"); return }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Failed to clear audit logs")
      }
      setClearConfirm(false)
      setPage(1)
      fetchLogs()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to clear audit logs")
    } finally {
      setClearing(false)
    }
  }

  if (lockedEndpoint) {
    return (
      <div className="w-full space-y-6 pb-12">
        <LockedTab endpoint={lockedEndpoint} />
      </div>
    )
  }

  return (
    <ErrorBoundary>
    {errorMessage ? (
      <ErrorState message={errorMessage} onRetry={() => { setErrorMessage(""); fetchLogs() }} />
    ) : (
    <div className="w-full space-y-6 pb-12">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-primary">Audit Trail</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-default hover:bg-surface-hover transition-colors cursor-pointer"
          >
            Export CSV
          </button>
          <button
            onClick={() => setClearConfirm(true)}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-tertiary uppercase tracking-wider">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
            className="input text-xs h-9 min-w-[130px]"
          >
            <option value="">All Actions</option>
            {actionsList.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-tertiary uppercase tracking-wider">Email</label>
          <input
            type="text"
            value={emailFilter}
            onChange={(e) => { setEmailFilter(e.target.value); setPage(1) }}
            placeholder="Filter by email..."
            className="input text-xs h-9 min-w-[180px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-tertiary uppercase tracking-wider">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="input text-xs h-9"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-tertiary uppercase tracking-wider">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="input text-xs h-9"
          />
        </div>
        {(actionFilter || emailFilter || dateFrom || dateTo) && (
          <button
            onClick={() => { setActionFilter(""); setEmailFilter(""); setDateFrom(""); setDateTo(""); setPage(1) }}
            className="px-3 py-2 text-xs font-semibold text-secondary hover:text-primary transition-colors cursor-pointer"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-x-auto bg-surface tbl">
        {loading ? (
          <div className="p-8 text-center text-sm text-tertiary">Loading...</div>
        ) : !data || data.logs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-tertiary">No audit logs found.</p>
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th className="cursor-pointer select-none hover:text-primary transition-colors" onClick={toggleSort}>
                    Timestamp {orderDir === "desc" ? "\u25BC" : "\u25B2"}
                  </th>
                  <th>Action</th>
                  <th>User</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((log) => (
                  <Fragment key={log.id}>
                  <tr>
                    <td className="whitespace-nowrap text-xs text-tertiary font-medium tabular-nums">
                      {new Date(log.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="whitespace-nowrap text-xs text-secondary font-medium">
                      {log.email || "\u2014"}
                    </td>
                    <td className="text-xs text-tertiary max-w-xs">
                      {log.action === "SERVER_ERROR" ? (
                        <button
                          onClick={() => setExpandedId((id) => (id === log.id ? null : log.id))}
                          className="font-semibold text-red-600 hover:underline cursor-pointer"
                        >
                          {expandedId === log.id ? "Hide stack" : "View stack"}
                        </button>
                      ) : (
                        <span className="block truncate">{log.details || "—"}</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === log.id && log.action === "SERVER_ERROR" && (
                    <tr key={`${log.id}-stack`}>
                      <td colSpan={4} className="bg-surface px-4 py-3">
                        <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-secondary max-h-96 overflow-auto">
                          {log.details || "No details recorded."}
                        </pre>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-default bg-surface">
              <p className="text-xs text-tertiary">
                Page <span className="font-semibold">{page}</span> of <span className="font-semibold">{totalPages}</span> &middot; {data.total} total entries
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-hover rounded border border-default transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  &larr; Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-hover rounded border border-default transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Clear All Confirmation Modal */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => !clearing && setClearConfirm(false)}>
          <div className="bg-surface rounded-xl shadow-xl p-6 w-full max-w-md mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary">Clear All Audit Logs</h2>
            <p className="text-sm text-red-600 font-semibold">
              This will permanently delete ALL audit log entries. This action CANNOT be undone.
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <button
                onClick={() => setClearConfirm(false)}
                disabled={clearing}
                className="text-xs font-semibold px-4 py-3 sm:py-2 rounded-lg border border-default hover:bg-surface-hover disabled:opacity-50 cursor-pointer w-full sm:w-auto"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                disabled={clearing}
                className="text-xs font-semibold px-4 py-3 sm:py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer w-full sm:w-auto"
              >
                {clearing ? "Clearing..." : "Yes, Clear All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    )}
    </ErrorBoundary>
  )
}
