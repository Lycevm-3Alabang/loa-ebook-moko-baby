"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import ErrorBoundary from "@/components/ui/ErrorBoundary"
import ErrorState from "@/components/ui/ErrorState"
import LockedTab from "@/components/ui/LockedTab"

interface RubricItem {
  id: string
  text: string
  displayOrder: number
  weight: number
}

interface RubricCategory {
  id: string
  name: string
  displayOrder: number
  items: RubricItem[]
}

function FacultyHeader({
  evaluateeName,
  subjectName,
  subjectCode,
  sectionName,
  disputeLoading,
  onDispute,
  onExit,
}: {
  evaluateeName: string
  subjectName?: string
  subjectCode?: string
  sectionName?: string
  disputeLoading?: boolean
  onDispute?: () => void
  onExit: () => void
}) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-slate-900/90 dark:bg-black/90 backdrop-blur-lg shadow-lg">
      <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 min-h-14 sm:min-h-16">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-white active:opacity-60 transition-all duration-200"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Exit
        </button>

        <div className="min-w-0 flex-1 text-right">
          {!evaluateeName ? (
            <div className="space-y-1.5">
              <div className="h-3.5 w-48 bg-slate-700/60 rounded-full animate-pulse ml-auto" />
              <div className="h-2.5 w-32 bg-slate-700/40 rounded-full animate-pulse ml-auto" />
            </div>
          ) : (
            <div className="text-white">
              <h1 className="text-base font-bold leading-tight">
                Evaluation for <span className="text-brand-400">{subjectName || subjectCode || "this subject"}</span>
              </h1>
              <p className="text-sm font-medium text-white/70 mt-0.5">
                {subjectCode && <span className="text-white/50">{subjectCode}</span>}
                {subjectCode && sectionName && <span className="text-white/40 mx-1">·</span>}
                {sectionName && <span className="text-white/50">Section {sectionName}</span>}
              </p>
              <p className="text-base font-bold text-white">
                Professor: <span className="text-brand-300 font-semibold">{evaluateeName}</span>
              </p>
              {onDispute && (
                <p className="text-right">
                  <button
                    type="button"
                    onClick={onDispute}
                    disabled={disputeLoading}
                    className="text-[11px] text-red-400 hover:text-red-300 underline decoration-dotted underline-offset-2 opacity-70 hover:opacity-100 transition-opacity disabled:opacity-30"
                  >
                    {disputeLoading ? "Reporting..." : "Wrong faculty? Report"}
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default function StandaloneEvaluationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [categories, setCategories] = useState<RubricCategory[]>([])
  const [evaluationId, setEvaluationId] = useState<string | null>(null)
  const [evaluateeName, setEvaluateeName] = useState("")
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState(0)
  const [mobileStepperOpen, setMobileStepperOpen] = useState(false)
  const [pledgeAgreed, setPledgeAgreed] = useState(false)
  const [lockedEndpoint, setLockedEndpoint] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [pageLoading, setPageLoading] = useState(true)
  const [evaluateeId, setEvaluateeId] = useState("")
  const [facultySubjectId, setFacultySubjectId] = useState("")
  const [subjectName, setSubjectName] = useState("")
  const [subjectCode, setSubjectCode] = useState("")
  const [sectionName, setSectionName] = useState("")
  const [disputeLoading, setDisputeLoading] = useState(false)
  const [disputeMessage, setDisputeMessage] = useState("")
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [isLocalhost, setIsLocalhost] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname === "localhost") {
      Promise.resolve().then(() => setIsLocalhost(true))
    }
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/evaluations/${params.id}?include=ratings,rubric`)
        if (res.status === 403) { setLockedEndpoint(`/api/evaluations/${params.id}`); return }
        if (!res.ok) { window.close(); return }
        const data = await res.json()
        const ev = data.evaluation
        if (!ev) { window.close(); return }

        if (ev.status === "SUBMITTED") {
          router.replace(`/student/evaluations/${params.id}`)
          return
        }

        setEvaluateeName(ev.evaluateeName || "Unknown")
        setEvaluationId(ev.id)
        setEvaluateeId(ev.evaluateeId || "")
        setFacultySubjectId(ev.facultySubjectId || "")
        setSubjectName(ev.subjectName || "")
        setSubjectCode(ev.subjectCode || "")
        setSectionName(ev.sectionName || "")

        if (data.ratings?.length > 0) {
          const map: Record<string, number> = {}
          for (const r of data.ratings) map[r.itemId] = r.rating
          setRatings(map)
        }

        if (data.rubric?.length) {
          setCategories(data.rubric)
        } else {
          const cached = localStorage.getItem("eval_rubric_cache")
          if (cached) {
            try { const p = JSON.parse(cached); if (p.categories?.length) setCategories(p.categories) } catch {}
          }
        }
        setPageLoading(false)
      } catch {
        setErrorMessage("Failed to load evaluation")
        setPageLoading(false)
      }
    }
    load()
  }, [params.id, router])

  async function handleDispute() {
    if (!facultySubjectId) return
    setShowDisputeModal(true)
  }

  async function confirmDispute() {
    setDisputeLoading(true)
    try {
      const res = await fetch("/api/evaluations/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facultySubjectId,
          evaluateeId,
          evaluateeName,
          subjectName: subjectName || subjectCode,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setDisputeMessage(data.error || "Failed to report dispute")
        return
      }
      router.replace("/student/evaluations")
    } catch {
      setDisputeMessage("Failed to report dispute")
    } finally {
      setDisputeLoading(false)
    }
  }

  const handleRatingChange = useCallback((itemId: string, value: number) => {
    setRatings((prev) => ({ ...prev, [itemId]: value }))
  }, [])

  const totalItems = useMemo(
    () => categories.reduce((sum, c) => sum + c.items.length, 0),
    [categories],
  )
  const answeredItems = Object.keys(ratings).length
  const allAnswered = answeredItems === totalItems

  const FEEDBACK_STEP = categories.length
  const SUBMIT_STEP = categories.length + 1
  const TOTAL_STEPS = categories.length + 2

  const currentCategory = step < FEEDBACK_STEP ? categories[step] : null
  const currentCategoryAllAnswered = currentCategory
    ? currentCategory.items.every((item) => ratings[item.id] !== undefined)
    : false

  const stepNames = useMemo(() => {
    const names = categories.map((c) => c.name)
    names.push("Feedback", "Submit")
    return names
  }, [categories])

  const isStepCompleted = useCallback(
    (i: number) => {
      if (i < FEEDBACK_STEP) {
        const cat = categories[i]
        return cat ? cat.items.every((item) => ratings[item.id] !== undefined) : false
      }
      if (i === FEEDBACK_STEP) return step > FEEDBACK_STEP
      return false
    },
    [categories, ratings, step, FEEDBACK_STEP],
  )

  async function handleSubmit() {
    if (!evaluationId) return
    if (!comment.trim()) {
      setStep(FEEDBACK_STEP)
      return
    }
    setSubmitting(true)
    try {
      const ratingsArray = Object.entries(ratings).map(([itemId, rating]) => ({ itemId, rating }))
      const ratingsRes = await fetch(`/api/evaluations/${evaluationId}/ratings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratings: ratingsArray }),
      })
      if (ratingsRes.status === 403) { setErrorMessage("Access denied"); setSubmitting(false); return }
      if (!ratingsRes.ok) { setErrorMessage("Failed to save ratings"); setSubmitting(false); return }
      if (comment) {
        const commentRes = await fetch(`/api/evaluations/${evaluationId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment }),
        })
        if (commentRes.status === 403) { setErrorMessage("Access denied"); setSubmitting(false); return }
        if (!commentRes.ok) { setErrorMessage("Failed to save comment"); setSubmitting(false); return }
      }
      const submitRes = await fetch(`/api/evaluations/${evaluationId}/submit`, { method: "POST" })
      if (submitRes.status === 403) { setErrorMessage("Access denied"); setSubmitting(false); return }
      if (!submitRes.ok) { setErrorMessage("Failed to submit evaluation"); setSubmitting(false); return }
      try { new BroadcastChannel("eval-updates").postMessage({ type: "submitted" }) } catch {}
      router.replace("/student/evaluations/thank-you")
    } catch {
      setErrorMessage("Failed to submit evaluation")
    } finally {
      setSubmitting(false)
    }
  }

  function handleExit() {
    if (step > 0 || comment || Object.keys(ratings).length > 0) {
      if (!window.confirm("Exit evaluation? Your progress will be lost and you will need to start from the beginning.")) return
    }
    window.close()
  }

  if (lockedEndpoint) {
    return (
      <div className="h-dvh flex flex-col">
        <FacultyHeader evaluateeName={evaluateeName} subjectName={subjectName} subjectCode={subjectCode} sectionName={sectionName} disputeLoading={disputeLoading} onDispute={handleDispute} onExit={handleExit} />
        <div className="flex-1 flex items-start justify-center pt-24 px-4 overflow-y-auto">
          <LockedTab endpoint={lockedEndpoint} />
        </div>
      </div>
    )
  }

  // ── Loading skeleton ──
  if (pageLoading) {
    return (
      <div className="h-dvh bg-surface-muted flex flex-col">
        <header className="fixed top-0 left-0 right-0 z-50 bg-slate-900/90 dark:bg-black/90 backdrop-blur-lg shadow-lg">
          <div className="flex items-center justify-between px-4 sm:px-6 h-14 sm:h-16">
            <div className="w-14 h-4 bg-slate-700/60 rounded-full animate-pulse" />
            <div className="space-y-1.5 text-right">
              <div className="h-3.5 w-48 bg-slate-700/60 rounded-full animate-pulse ml-auto" />
              <div className="h-2.5 w-32 bg-slate-700/40 rounded-full animate-pulse ml-auto" />
            </div>
          </div>
        </header>
        <div className="flex-1 pt-28 sm:pt-32 pb-12 animate-pulse overflow-y-auto">
          <div className="w-full px-4 sm:px-8">
            <div className="mb-8 space-y-2">
              <div className="h-7 w-72 bg-surface-tertiary rounded-full" />
              <div className="h-4 w-48 bg-surface-tertiary rounded-full" />
            </div>
            <div className="space-y-5">
              {[1, 2, 3].map((n) => (
                <div key={n} className="bg-surface rounded-2xl overflow-hidden shadow-sm border border-default">
                  <div className="h-1.5 bg-surface-tertiary" />
                  <div className="p-5 sm:p-6 space-y-4">
                    <div className="h-5 bg-surface-tertiary rounded w-1/3" />
                    {[1, 2].map((_) => (
                      <div key={_} className="space-y-2">
                        <div className="h-4 bg-surface-tertiary rounded w-full" />
                        <div className="flex items-center gap-2">
                          {[1, 2, 3, 4, 5].map((v) => (
                            <div key={v} className="w-10 h-10 bg-surface-tertiary rounded-xl" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Fill form ──
  const fillContent = errorMessage ? (
    <div className="pt-28 sm:pt-32 pb-12 w-full px-4 sm:px-8">
      <ErrorState message={errorMessage} onRetry={() => window.location.reload()} />
    </div>
  ) : (
    <div className="pt-28 sm:pt-32 pb-12">
      <>
      <div className="md:hidden w-full px-4 sm:px-8 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileStepperOpen(true)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-tertiary active:bg-surface-tertiary transition-all -ml-1"
              aria-label="Open steps"
            >
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-xs font-semibold text-brand-600">{stepNames[step]}</span>
          </div>
          <span className="text-xs text-tertiary">{step + 1}/{TOTAL_STEPS}</span>
        </div>
        <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {mobileStepperOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileStepperOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-surface shadow-2xl animate-ios-slide-in rounded-r-3xl">
            <div className="flex items-center justify-between px-5 h-14 border-b border-default">
              <span className="text-sm font-bold text-primary">Steps</span>
              <button
                type="button"
                onClick={() => setMobileStepperOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-tertiary active:bg-surface-tertiary transition-all"
              >
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 pt-4 pb-6 space-y-1">
              {stepNames.map((name, i) => {
                const done = isStepCompleted(i)
                const isCurrent = i === step
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!done || isCurrent}
                    onClick={() => { setStep(i); setMobileStepperOpen(false) }}
                    className={`flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                      isCurrent
                        ? "bg-brand-50 dark:bg-brand-500/10"
                        : done
                          ? "active:bg-surface-tertiary"
                          : "opacity-50"
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all ${
                          done
                            ? "bg-green-500 text-white"
                            : isCurrent
                              ? "bg-brand-500 text-white"
                              : "bg-surface-tertiary text-tertiary"
                        }`}
                      >
                        {done ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </div>
                      {i < stepNames.length - 1 && (
                        <div className={`w-0.5 h-5 ${done ? "bg-green-400" : isCurrent ? "bg-brand-300" : "bg-surface-tertiary"}`} />
                      )}
                    </div>
                    <span
                      className={`text-sm leading-snug ${
                        isCurrent ? "text-brand-600 font-semibold" : done ? "text-primary" : "text-tertiary"
                      }`}
                    >
                      {name}
                    </span>
                  </button>
                )
              })}
            </div>
            {isLocalhost && categories.length > 0 && (
              <div className="mt-4 px-5 pt-4 border-t border-default space-y-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-tertiary">Dev Skip</p>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => {
                    const r: Record<string, number> = {}
                    for (const cat of categories) for (const item of cat.items) r[item.id] = 1
                    setRatings(r); setStep(FEEDBACK_STEP); setMobileStepperOpen(false)
                  }} className="flex-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">FAIL</button>
                  <button type="button" onClick={() => {
                    const r: Record<string, number> = {}
                    for (const cat of categories) for (const item of cat.items) r[item.id] = 3
                    setRatings(r); setStep(FEEDBACK_STEP); setMobileStepperOpen(false)
                  }} className="flex-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors">PASS</button>
                  <button type="button" onClick={() => {
                    const r: Record<string, number> = {}
                    for (const cat of categories) for (const item of cat.items) r[item.id] = Math.floor(Math.random() * 5) + 1
                    setRatings(r); setStep(FEEDBACK_STEP); setMobileStepperOpen(false)
                  }} className="flex-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors">RANDOM</button>
                </div>
              </div>
            )}
            {evaluateeId && (
              <div className="mt-4 px-5">
                <button
                  type="button"
                  onClick={() => { handleDispute(); setMobileStepperOpen(false) }}
                  disabled={disputeLoading}
                   className="text-sm text-red-600 hover:text-red-800 underline decoration-dotted underline-offset-2 opacity-80 hover:opacity-100 transition-opacity disabled:opacity-30"
                 >
                   {disputeLoading ? "Reporting..." : "Wrong faculty? Report"}
                 </button>
               </div>
             )}
           </div>
         </div>
      )}

      <div className="w-full flex gap-0 px-4 sm:px-8">
        <div className="hidden md:block w-52 lg:w-60 shrink-0 -ml-4">
          <div className="sticky top-24 pl-4 pr-6 lg:pr-8 border-r border-default min-h-[calc(100dvh-10rem)]">
            <div className="flex flex-col gap-0 pt-1">
              {stepNames.map((name, i) => {
                const done = isStepCompleted(i)
                const isCurrent = i === step
                return (
                  <div key={i} className="flex items-start gap-3">
                    <button
                      type="button"
                      disabled={!done || isCurrent}
                      onClick={() => setStep(i)}
                      className="flex items-start gap-3 text-left disabled:cursor-default group"
                    >
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 ${
                            done
                              ? "bg-green-500 text-white"
                              : isCurrent
                                ? "bg-brand-500 text-white"
                                : "bg-surface-tertiary text-tertiary"
                          } ${isCurrent ? "ring-4 ring-brand-500/20" : ""} ${done && !isCurrent ? "group-hover:opacity-80" : ""}`}
                        >
                          {done ? (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            i + 1
                          )}
                        </div>
                        {i < stepNames.length - 1 && (
                          <div className={`w-0.5 h-6 ${done ? "bg-green-400" : isCurrent ? "bg-brand-300" : "bg-surface-tertiary"}`} />
                        )}
                      </div>
                      <span
                        className={`pt-1.5 text-sm leading-snug transition-colors duration-200 ${
                          isCurrent ? "text-brand-600 font-semibold" : done ? "text-green-700 dark:text-green-400 hover:text-green-600 cursor-pointer" : "text-tertiary"
                        }`}
                      >
                        {name}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
            {isLocalhost && categories.length > 0 && (
              <div className="mt-4 pt-4 border-t border-default space-y-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-tertiary">Dev Skip</p>
                <button type="button" onClick={() => {
                  const r: Record<string, number> = {}
                  for (const cat of categories) for (const item of cat.items) r[item.id] = 1
                  setRatings(r); setStep(FEEDBACK_STEP)
                }} className="w-full text-left text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">FAIL &amp; Skip</button>
                <button type="button" onClick={() => {
                  const r: Record<string, number> = {}
                  for (const cat of categories) for (const item of cat.items) r[item.id] = 3
                  setRatings(r); setStep(FEEDBACK_STEP)
                }} className="w-full text-left text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors">PASS &amp; Skip</button>
                <button type="button" onClick={() => {
                  const r: Record<string, number> = {}
                  for (const cat of categories) for (const item of cat.items) r[item.id] = Math.floor(Math.random() * 5) + 1
                  setRatings(r); setStep(FEEDBACK_STEP)
                }} className="w-full text-left text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors">RANDOMIZE &amp; Skip</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-5 md:pl-8 lg:pl-12">
          <div className={`bg-surface rounded-2xl overflow-hidden shadow-sm border border-default ${currentCategory ? '' : 'hidden'}`}>
            <div className="h-1.5 bg-brand-500" />
            <div className="p-5 sm:p-7">
              <div key={step} className="animate-ios-slide-in">
                {currentCategory && (
                  <>
                    <div className="flex items-start justify-between mb-6">
                      <h3 className="text-lg font-bold text-primary tracking-tight">{currentCategory.name}</h3>
                      {currentCategoryAllAnswered && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded-full shrink-0 ml-3 ring-1 ring-green-500/30">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Complete
                        </span>
                      )}
                    </div>
                    <div className="space-y-7">
                      {currentCategory.items.map((item) => (
                        <div key={item.id}>
                          <div className="flex items-start gap-2 mb-3">
                            <span className={`mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200 ${
                              ratings[item.id] !== undefined
                                ? "bg-green-500 text-white scale-100"
                                : "bg-surface-tertiary scale-0"
                            }`}>
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                            <p className={`text-sm leading-relaxed transition-colors duration-200 ${
                              ratings[item.id] !== undefined ? "text-primary font-medium" : "text-secondary"
                            }`}>{item.text}</p>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                              {["Poor", "Fair", "Good", "Very Good", "Excellent"].map((label, i) => {
                                const v = i + 1
                                const isSelected = ratings[item.id] === v
                                return (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => handleRatingChange(item.id, v)}
                                    className={`h-12 sm:h-14 rounded-2xl font-semibold transition-all duration-200 active:scale-95 ${
                                      isSelected
                                        ? "bg-brand-500 text-white shadow-md scale-105 ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-surface sm:ring-offset-4"
                                        : "bg-surface-tertiary text-tertiary hover:bg-surface-hover"
                                    }`}
                                  >
                                    <span className="sm:hidden" title={label}>{v}</span>
                                    <span className="hidden sm:inline text-xs sm:text-sm">{label}</span>
                                  </button>
                                )
              })}
            </div>
          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-1 sm:hidden pt-3 pb-1 border-t border-default/50 mt-4">
                        {["Poor", "Fair", "Good", "Very Good", "Excellent"].map((lbl, i) => (
                          <span key={lbl} className="text-[10px] text-tertiary/50 text-center leading-tight" style={{ maxWidth: '18%' }}>
                            {i + 1}<br /><span className="text-tertiary/40">{lbl}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 mt-8 pt-4 border-t border-default">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    className="btn-ios-gray flex-1"
                  >
                    Previous
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!currentCategoryAllAnswered}
                  className="btn-ios-primary flex-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className={`bg-surface rounded-2xl overflow-hidden shadow-sm border border-default ${step === FEEDBACK_STEP ? '' : 'hidden'}`}>
            <div className="h-1.5 bg-brand-500" />
            <div className="p-5 sm:p-7">
              <div key={step} className="animate-ios-slide-in">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-9 h-9 rounded-full bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center shrink-0">
                    <svg className="w-4.5 h-4.5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-primary tracking-tight">Additional Feedback</h2>
                    <p className="text-xs text-tertiary">Share your thoughts about this evaluation</p>
                  </div>
                </div>
                {!comment.trim() && (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
                  >
                    A written comment is required before you can submit this evaluation.
                  </div>
                )}
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Write your required feedback here..."
                  aria-label="Required evaluation comment"
                  className="w-full border border-default rounded-2xl px-4 py-3.5 text-sm text-primary placeholder:text-tertiary bg-surface-secondary focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 min-h-36 resize-none transition-all duration-200 mt-5"
                />
              </div>
              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-default">
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="btn-ios-gray flex-1"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  className="btn-ios-primary flex-1"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>

          <div className={`bg-surface rounded-2xl overflow-hidden shadow-sm border border-default ${step === SUBMIT_STEP ? '' : 'hidden'}`}>
            <div className="h-1.5 bg-brand-500" />
            <div className="p-5 sm:p-7">
              <div key={step} className="animate-ios-slide-in">
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-14 h-14 bg-brand-50 dark:bg-brand-500/10 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-7 h-7 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-primary tracking-tight">Honesty Pledge</h2>
                  <p className="text-sm text-tertiary mt-1 max-w-xs">Please read and agree before submitting your evaluation.</p>
                </div>

                {disputeMessage && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 mb-4">
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">{disputeMessage}</p>
                    <button onClick={() => setDisputeMessage("")} className="text-emerald-500 hover:text-emerald-700 text-lg leading-none">&times;</button>
                  </div>
                )}

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-6 text-left">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    You are about to submit an evaluation for:
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    <strong>{evaluateeName}</strong>
                    {subjectName ? <span> · {subjectName}{subjectCode ? ` (${subjectCode})` : ""}</span> : ""}
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    Please verify that this is the correct faculty member before proceeding.
                  </p>
                </div>

                <div className="bg-surface-secondary rounded-2xl p-5 space-y-3 text-sm text-secondary leading-relaxed">
                  <p>I hereby affirm that the responses I have provided in this evaluation are my own honest and genuine assessment of the faculty member&apos;s performance.</p>
                  <p>I understand that this evaluation is confidential and will be used to help improve the quality of instruction. I have rated each criterion to the best of my knowledge and belief.</p>
                  <p>I acknowledge that providing false or misleading information may undermine the integrity of the evaluation process.</p>
                </div>

                <label className="flex items-center gap-3 mt-6 cursor-pointer group">
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pledgeAgreed}
                      onChange={(e) => setPledgeAgreed(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-7 rounded-full bg-surface-tertiary peer-checked:bg-brand-500 transition-colors" />
                    <div className="absolute left-1 top-1 w-5 h-5 rounded-full bg-white shadow-sm peer-checked:translate-x-4 transition-transform" />
                  </div>
                  <span className="text-sm text-secondary group-active:text-primary transition-colors">
                    I agree to provide honest and truthful feedback.
                  </span>
                </label>

                <div className="text-center mt-4 pt-4 border-t border-default/50">
                  <button
                    type="button"
                    onClick={handleDispute}
                    disabled={disputeLoading}
                    className="text-sm font-semibold text-red-600 hover:text-red-800 underline decoration-dotted underline-offset-2 opacity-90 hover:opacity-100 transition-opacity disabled:opacity-40"
                  >
                    {disputeLoading ? "Reporting..." : "Wrong faculty? Report incorrect assignment"}
                  </button>
                </div>
              </div>
              {!comment.trim() && (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
                >
                  Return to Additional Feedback and add a comment to enable submission.
                </div>
              )}
              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-default">
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="btn-ios-gray flex-1"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !allAnswered || !pledgeAgreed || !comment.trim()}
                  className="btn-ios-primary flex-1"
                >
                  {submitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      </>
    </div>
  )

  return (
    <ErrorBoundary>
      <div className="h-dvh bg-surface-muted flex flex-col">
        <FacultyHeader evaluateeName={evaluateeName} subjectName={subjectName} subjectCode={subjectCode} sectionName={sectionName} disputeLoading={disputeLoading} onDispute={handleDispute} onExit={handleExit} />
        <div className="flex-1 overflow-y-auto">
          {fillContent}
        </div>

        {showDisputeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDisputeModal(false)} />
            <div className="relative bg-surface rounded-2xl shadow-2xl border border-default max-w-sm w-full p-6 animate-ios-slide-in">
              <h2 className="text-lg font-bold text-primary">Report incorrect assignment</h2>
              <p className="text-sm text-secondary mt-3 leading-relaxed">
                You are reporting that{" "}
                <strong>{evaluateeName}</strong> is not the correct faculty for{" "}
                <strong>{subjectName || subjectCode}</strong>.
              </p>
              <p className="text-xs text-tertiary mt-3 leading-relaxed">
                Your identity will be included with this report. An admin will review and take appropriate action.
              </p>
              <div className="flex items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowDisputeModal(false)}
                  className="btn-ios-gray flex-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowDisputeModal(false)
                    await confirmDispute()
                  }}
                  disabled={disputeLoading}
                  className="btn-ios-primary flex-1 !bg-red-600 hover:!bg-red-700 disabled:opacity-40"
                >
                  {disputeLoading ? "Reporting..." : "Report"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}
