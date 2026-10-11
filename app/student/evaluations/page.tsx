"use client"

import { useState, useEffect, useRef } from "react"
import Skeleton from "@/components/ui/Skeleton"
import { SkeletonCard } from "@/components/ui/Skeleton"
import LockedTab from "@/components/ui/LockedTab"
import ErrorState from "@/components/ui/ErrorState"
import ErrorBoundary from "@/components/ui/ErrorBoundary"

interface PendingItem {
  evaluateeId: string
  evaluateeName: string
  evaluateeEmail: string
  facultySubjectId: string
  subjectId: string
  subjectCode: string
  subjectName: string
  mappingSemesterId: string | null
  mappingSemesterTitle: string | null
  isMappedToActiveSemester: boolean
  eligible: boolean
  ineligibilityReason: "WRONG_TERM" | "NOT_ENROLLED" | null
}

interface ExistingEvaluation {
  id: string
  evaluateeId: string
  evaluateeName: string
  subjectId: string
  subjectCode: string
  subjectName: string
  status: string
  submittedAt: string | null
  createdAt: string
  updatedAt: string
}


export default function StudentEvaluationsPage() {
  const [pending, setPending] = useState<PendingItem[]>([])
  const [evaluations, setEvaluations] = useState<ExistingEvaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [navigatingId, setNavigatingId] = useState<string | null>(null)
  const [outOfRange, setOutOfRange] = useState(false)
  const [lockedEndpoint, setLockedEndpoint] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const evalTabRef = useRef<Window | null>(null)
  const evalTabIdRef = useRef<string | null>(null)
  // const [searchQuery, setSearchQuery] = useState("")
  // const [searchResults, setSearchResults] = useState([])
  // const [searching, setSearching] = useState(false)
  const [disputingFsId, setDisputingFsId] = useState<string | null>(null)
  const [disputeMessage, setDisputeMessage] = useState("")
  // Active evaluation period's term, shown once as page-level context — kept,
  // never stamped on cards. Per-card terms come from each item's own mapping
  // (mappingSemesterTitle): Branch A of findPending applies no semester
  // filter, so cards are NOT all in the active term.
  const [semesterName, setSemesterName] = useState<string | null>(null)
  const [activePeriodName, setActivePeriodName] = useState<string | null>(null)
  const [activeEvalPeriodId, setActiveEvalPeriodId] = useState<string | null>(null)

  function openEvalTab(id: string) {
    if (evalTabRef.current && !evalTabRef.current.closed) {
      if (evalTabIdRef.current === id) {
        evalTabRef.current.focus()
        return
      }
      evalTabRef.current.close()
    }
    evalTabRef.current = window.open(`/evaluate/${id}`, "_blank")
    evalTabIdRef.current = id
  }

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/student/evaluations/bootstrap")
        if (res.status === 403) { setLockedEndpoint("/api/student/evaluations/bootstrap"); return }
        const data = await res.json()

        const active = (data.periods || []).find((p: { isActive: boolean }) => p.isActive)
        setSemesterName(
          (data.periods || []).find(
            (p: { id?: string; semesterTitle?: string }) => p.id === data.activeEvalPeriodId,
          )?.semesterTitle ?? null,
        )
        setActivePeriodName(data.activeEvalPeriodName ?? null)
        setActiveEvalPeriodId(data.activeEvalPeriodId ?? null)
        if (active?.startDate) {
          const now = Date.now()
          const start = new Date(active.startDate).getTime()
          const end = active.endDate
            ? new Date(active.endDate).getTime() + 86_399_999
            : Infinity
          if (now < start || now > end) {
            setOutOfRange(true)
          }
        } else {
          setOutOfRange(true)
        }

        if (data.rubric) {
          localStorage.setItem("eval_rubric_cache", JSON.stringify({ categories: data.rubric, fetchedAt: Date.now() }))
        }

        setPending(data.pending || [])
        setEvaluations(data.evaluations || [])
      } catch {
        setErrorMessage("Failed to load evaluations")
      } finally {
        setLoading(false)
      }
    }
    Promise.resolve().then(loadData)

    try {
      const ch = new BroadcastChannel("eval-updates")
      ch.onmessage = () => loadData()
      return () => ch.close()
    } catch {}
  }, [])

  // useEffect(() => {
  //   const q = searchQuery.trim()
  //   if (q.length < 2) return // keep current suggestions when not typing
  //   const timer = setTimeout(() => {
  //     Promise.resolve().then(async () => {
  //       setSearching(true)
  //       try {
  //         const params = new URLSearchParams({ q })
  //         if (activeSemesterId) params.set("semesterId", activeSemesterId)
  //         const res = await fetch(`/api/faculty/search?${params}`)
  //         if (res.ok) {
  //           const data = await res.json()
  //           setSearchResults(data.faculty || [])
  //         }
  //       } catch {} finally {
  //         setSearching(false)
  //       }
  //     })
  //   }, 300)
  //   return () => clearTimeout(timer)
  // }, [searchQuery, activeSemesterId])

  async function handleDispute(item: PendingItem) {
    if (!confirm(`Report "${item.evaluateeName}" as the wrong faculty for "${item.subjectName || item.subjectCode}"?\n\nThis evaluation will be disabled and an admin will review the assignment.`)) return
    setDisputingFsId(item.facultySubjectId)
    try {
      const res = await fetch("/api/evaluations/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facultySubjectId: item.facultySubjectId,
          evaluateeId: item.evaluateeId,
          evaluateeName: item.evaluateeName,
          subjectName: item.subjectName,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setDisputeMessage(data.error || "Failed to report dispute")
        return
      }
      setPending((prev) => prev.filter((p) => p.facultySubjectId !== item.facultySubjectId))
      setDisputeMessage(`Dispute reported for "${item.subjectName || item.subjectCode}". An admin will review.`)
    } catch {
      setDisputeMessage("Failed to report dispute")
    } finally {
      setDisputingFsId(null)
    }
  }

  const total = pending.length + evaluations.filter((e) => e.status === "DRAFT").length
  const completed = evaluations.filter((e) => e.status === "SUBMITTED").length

  if (lockedEndpoint) {
    return (
      <div className="pb-12 px-5 pt-8">
        <LockedTab endpoint={lockedEndpoint} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="pb-12 px-5 pt-8">
        <Skeleton variant="text" className="w-1/3 h-7 mb-2" />
        <Skeleton variant="text" className="w-1/4 h-4 mb-6" />
        <SkeletonCard count={3} />
      </div>
    )
  }

  return (
    <ErrorBoundary>
    <div className="w-full px-4 sm:px-6 space-y-6 sm:space-y-8 pb-12">
      <div className="animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">
              Faculty Evaluations
              <span className="inline-block ml-2">📝</span>
            </h1>
            {semesterName && (
              <p className="text-xs text-tertiary mt-1">
                Active period{activePeriodName ? `: ${activePeriodName}` : ""} · {semesterName}
              </p>
            )}

          </div>
        </div>
      </div>

      {disputeMessage && (
        <div className="animate-fade-in flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <p className="text-sm text-emerald-700 dark:text-emerald-300">{disputeMessage}</p>
          <button onClick={() => setDisputeMessage("")} className="text-emerald-500 hover:text-emerald-700 text-lg leading-none">&times;</button>
        </div>
      )}

      {errorMessage ? (
        <ErrorState message={errorMessage} onRetry={() => window.location.reload()} />
      ) : (
        <>
        {outOfRange && (
        <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="card p-5 sm:p-6 bg-surface border-l-4 border-l-amber-400">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-xl shrink-0">
                🔒
              </div>
              <div>
                <p className="text-sm font-bold text-primary">Evaluation period is not open</p>
                <p className="text-xs text-tertiary mt-1">
                  The evaluation period has not started yet or has already closed. You&apos;ll be able to submit your evaluations once the window opens.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!outOfRange && total > 0 && (
        <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {[
              { label: "Pending", value: pending.length, color: "from-amber-500 to-orange-500", bg: "bg-amber-50 border-amber-200", icon: "⏳" },
              { label: "Drafts", value: evaluations.filter((e) => e.status === "DRAFT").length, color: "from-blue-500 to-blue-600", bg: "bg-blue-50 border-blue-200", icon: "📄" },
            ].map((s, i) => (
              <div
                key={s.label}
                className="card p-4 bg-surface flex items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                style={{ animationDelay: `${0.12 + i * 0.04}s` }}
              >
                <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center text-lg shrink-0`}>
                  {s.icon}
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-primary leading-none">{s.value}</p>
                  <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mt-1">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!outOfRange && total > 1 && (
        <div className="animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-400 to-emerald-500 transition-all duration-1000 ease-out"
              style={{ width: `${(completed / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {!outOfRange && pending.length > 0 && (
        <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
            <span>⏳</span> Pending Evaluations
            {activePeriodName && (
              <span className="text-xs font-semibold text-tertiary">· {activePeriodName}</span>
            )}
          </h2>
          <div className="space-y-2">
            {pending.map((item) => (
              <button
                key={item.facultySubjectId}
                  onClick={async () => {
                    setNavigatingId(item.evaluateeId)
                    try {
                      const res = await fetch("/api/evaluations", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ evaluateeId: item.evaluateeId, facultySubjectId: item.facultySubjectId }),
                      })
                      if (res.status === 403) { setLockedEndpoint("/api/evaluations"); setNavigatingId(null); return }
                      const data = await res.json()
                      if (data.evaluation?.id) { openEvalTab(data.evaluation.id); setNavigatingId(null) }
                  } catch {
                    setNavigatingId(null)
                  }
                }}
                disabled={navigatingId === item.evaluateeId || !item.eligible}
                aria-disabled={!item.eligible}
                className="card w-full p-4 bg-surface flex items-center justify-between hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-primary">{item.subjectName || item.subjectCode}</p>
                  <p className="text-xs text-tertiary mt-0.5">
                    {item.evaluateeName}{item.subjectCode ? ` · ${item.subjectCode}` : ""}
                  </p>
                  {!item.eligible && (
                    <span className="mt-1 inline-block text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded-full">
                      {item.ineligibilityReason === "WRONG_TERM"
                        ? `⚠️ Wrong term${item.mappingSemesterTitle ? ` (${item.mappingSemesterTitle})` : ""} — contact your admin`
                        : "⚠️ Not enrolled — contact your admin"}
                    </span>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); handleDispute(item) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handleDispute(item) } }}
                    aria-disabled={disputingFsId === item.facultySubjectId}
                    className="mt-1 block text-[11px] text-red-500 hover:text-red-700 underline decoration-dotted underline-offset-2 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30 cursor-pointer"
                    style={disputingFsId === item.facultySubjectId ? { opacity: 0.3, pointerEvents: 'none' } : {}}
                  >
                    <span className="group relative mt-1 inline-block cursor-help">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-tertiary dark:border-slate-600">?</span>
                      <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 hidden w-max max-w-56 whitespace-normal rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-normal text-white shadow-lg group-hover:block dark:bg-slate-700">
                        <span className="block">Semester: {item.mappingSemesterTitle ?? "No semester assigned"} ({item.mappingSemesterId ?? "none"})</span>
                        <span className="block">Evaluation Period: {activePeriodName ?? "—"} ({activeEvalPeriodId ?? "—"})</span>
                      </span>
                    </span>
                    {disputingFsId === item.facultySubjectId ? "Reporting..." : "Wrong faculty?"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {navigatingId === item.evaluateeId ? (
                    <svg className="animate-spin ios-spinner w-4 h-4 text-gold-600" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold-600 bg-gold-50 dark:bg-gold-900/30 px-3 py-1.5 rounded-full">
                      Start
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* {!outOfRange && (
        <div className="animate-fade-in" style={{ animationDelay: "0.22s" }}>
          <h2 className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
            <span>🔍</span> Search Faculty to Evaluate
          </h2>
          <div className="card p-4 bg-surface space-y-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type faculty name or email..."
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all"
              />
              {searching && (
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin ios-spinner w-4 h-4 text-gold-600" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                </svg>
              )}
            </div>
            {filteredSearchResults.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {filteredSearchResults.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => startUnenrolledEval(f.id, "", f.isEnrolled)}
                    disabled={navigatingId === f.id}
                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-left transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-primary">{f.name}</p>
                        {f.isEnrolled && (
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">Enrolled</span>
                        )}
                      </div>
                      <p className="text-xs text-tertiary">{f.email}</p>
                    </div>
                    <div className="shrink-0 ml-3">
                      {navigatingId === f.id ? (
                        <svg className="animate-spin ios-spinner w-4 h-4 text-gold-600" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold-600 bg-gold-50 dark:bg-gold-900/30 px-3 py-1.5 rounded-full whitespace-nowrap">
                          Evaluate
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.trim().length >= 2 && !searching && searchResults.length > 0 && filteredSearchResults.length === 0 && (
              <p className="text-xs text-tertiary text-center py-2">All matching faculty are already listed in Pending Evaluations</p>
            )}
            {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
              <p className="text-xs text-tertiary text-center py-2">No faculty found matching &quot;{searchQuery.trim()}&quot;</p>
            )}
          </div>
        </div>
      )} */}

      {!outOfRange && evaluations.filter((e) => e.status === "DRAFT").length > 0 && (
        <div className="animate-fade-in" style={{ animationDelay: "0.25s" }}>
          <h2 className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
            <span>📋</span> Drafts
          </h2>
          <div className="space-y-2">
            {evaluations.filter((e) => e.status === "DRAFT").map((ev) => (
              <button
                key={ev.id}
                  onClick={async () => {
                    setNavigatingId(ev.id)
                    try {
                      const res = await fetch("/api/evaluations", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: ev.id }),
                      })
                      if (res.status === 403) { setLockedEndpoint("/api/evaluations"); setNavigatingId(null); return }
                      const data = await res.json()
                    if (data.evaluation?.id) {
                      openEvalTab(data.evaluation.id); setNavigatingId(null)
                    }
                  } catch {
                    setNavigatingId(null)
                  }
                }}
                disabled={navigatingId === ev.id}
                className="card w-full p-4 bg-surface flex items-center justify-between hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-primary">{ev.subjectName || ev.evaluateeName}</p>
                  <p className="text-xs text-tertiary mt-0.5">
                    {ev.evaluateeName}{ev.subjectCode ? ` · ${ev.subjectCode}` : ""}
                    {" · "}
                    Draft · {new Date(ev.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {navigatingId === ev.id ? (
                    <svg className="animate-spin ios-spinner w-4 h-4 text-gold-600" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full">
                      Continue
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!outOfRange && total === 0 && (
        <div className="card p-12 sm:p-16 bg-surface text-center animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <div className="w-16 h-16 bg-gold-50 border border-gold-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">📝</span>
          </div>
          <h2 className="text-lg font-bold text-primary mb-2">No pending evaluations</h2>
          <p className="text-sm text-tertiary max-w-md mx-auto">
            You don&apos;t have any pending evaluations right now. Check back when new evaluation periods open.
          </p>
        </div>
      )}
        </>
      )}
    </div>
    </ErrorBoundary>
  )
}
