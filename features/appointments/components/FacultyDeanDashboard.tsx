"use client"

import { useMemo, useCallback, useState } from "react"
import Link from "next/link"
import { ConsultationsTimeline } from "@/features/appointments/components/ConsultationsTimeline"
import type { CalendarEvent } from "@/features/appointments/components/CalendarView"

interface DashboardAppointment {
  id: string
  title: string | null
  date: string
  startTime: string
  endTime: string
  status: string
  meetingType: string
  teamsLink: string | null
  student?: { name: string; email: string } | null
}

interface Props {
  userName: string
  role: string
  appointments: DashboardAppointment[]
  departmentName?: string
  departmentStats?: {
    facultyCount: number
    /** What the faculty count counts, e.g. "Teaching" vs "Faculty". */
    facultyLabel?: string
    total: number
    pending: number
    completed: number
  }
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function formatTimeRange(date: string, startTime: string, endTime: string) {
  const d = new Date(date + "T00:00:00")
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)

  const prefix =
    diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })

  return `${prefix} &middot; ${startTime} &ndash; ${endTime}`
}

function getWeekDates(): string[] {
  const today = new Date()
  const day = today.getDay()
  const diff = today.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(today.setDate(diff))
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d.toISOString().split("T")[0]
  })
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"]

export default function FacultyDeanDashboard({
  userName,
  role,
  appointments,
  departmentName,
  departmentStats,
}: Props) {
  const greeting = useMemo(() => getGreeting(), [])
  const isDean = role === "DEAN"
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [teamsLinkInput, setTeamsLinkInput] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set())

  const stats = useMemo(() => {
    const today = new Date().toISOString().split("T")[0]
    const todayMeetings = appointments.filter(
      (a) => a.date === today && (a.status === "APPROVED" || a.status === "PENDING")
    ).length
    const pending = appointments.filter((a) => a.status === "PENDING").length
    const thisWeek = appointments.filter((a) => {
      const d = new Date(a.date + "T00:00:00")
      const now = new Date()
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay() + 1)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      return d >= weekStart && d <= weekEnd && (a.status === "APPROVED" || a.status === "COMPLETED")
    }).length
    return { todayMeetings, pending, thisWeek }
  }, [appointments])

  const pendingRequests = useMemo(() => {
    return appointments
      .filter((a) => a.status === "PENDING" && !dismissedIds.has(a.id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  }, [appointments, dismissedIds])

  const weekDates = useMemo(() => getWeekDates(), [])

  const weeklyPreview = useMemo(() => {
    return weekDates.map((date) => ({
      date,
      count: appointments.filter(
        (a) => a.date === date && (a.status === "APPROVED" || a.status === "PENDING")
      ).length,
    }))
  }, [appointments, weekDates])

  const recentActivity = useMemo(() => {
    return appointments
      .filter((a) => a.status === "COMPLETED" || a.status === "REJECTED" || a.status === "CANCELLED")
      .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
      .slice(0, 5)
  }, [appointments])

  const timelineEvents: CalendarEvent[] = useMemo(
    () =>
      appointments
        .filter((a) => a.status === "APPROVED")
        .map((a) => ({
          id: a.id,
          title: a.title || `Meeting with ${a.student?.name || "Attendee"}`,
          subtitle: a.student?.email,
          date: a.date,
          startTime: a.startTime,
          endTime: a.endTime,
          status: a.status,
          type: "appointment" as const,
          teamsLink: a.teamsLink,
        })),
    [appointments]
  )

  const handleDecline = useCallback(async (id: string) => {
    setActionLoading(id)
    setDismissedIds((prev) => new Set(prev).add(id))
    try {
      await fetch(`/api/appointments/${id}/decline`, { method: "POST" })
    } catch {
      setDismissedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
    } finally {
      setActionLoading(null)
    }
  }, [])

  const handleAccept = useCallback(async (id: string) => {
    setActionLoading(id)
    setDismissedIds((prev) => new Set(prev).add(id))
    try {
      await fetch(`/api/appointments/${id}/accept`, { method: "POST" })
    } catch {
      setDismissedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
    } finally {
      setActionLoading(null)
    }
  }, [])

  const handleAcceptWithTeamsLink = useCallback(async (id: string) => {
    setActionLoading(id)
    setDismissedIds((prev) => new Set(prev).add(id))
    try {
      await fetch(`/api/appointments/${id}/teams-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamsLink: teamsLinkInput }),
      })
      await fetch(`/api/appointments/${id}/accept`, { method: "POST" })
      setAcceptingId(null)
      setTeamsLinkInput("")
    } catch {
      setDismissedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
    } finally {
      setActionLoading(null)
    }
  }, [teamsLinkInput])

  return (
    <div className="w-full space-y-6 sm:space-y-8 pb-12">
      <div className="animate-fade-in">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">
              {greeting}, {userName.split(" ")[0]}
              <span className="inline-block ml-2">☕</span>
            </h1>
            <p className="text-sm text-tertiary mt-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                {isDean ? "Dean" : "Faculty"}
              </span>
              {departmentName && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gold-50 border border-gold-200 text-gold-700 text-xs">
                  {departmentName}
                </span>
              )}
              <span>{stats.todayMeetings > 0 ? `${stats.todayMeetings} meeting${stats.todayMeetings !== 1 ? "s" : ""} today` : "No meetings today"} &middot; {stats.pending} pending</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link
              href="/faculty/meetings/new"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-gold-600 text-white text-xs font-semibold hover:bg-gold-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-sm min-h-[44px]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create
            </Link>
            <Link
              href="/faculty/availability"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg border border-default text-secondary text-xs font-semibold hover:bg-surface-hover hover:border-strong transition-all duration-200 min-h-[44px]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Availability
            </Link>
            <Link
              href="/faculty/meetings"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg border border-default text-secondary text-xs font-semibold hover:bg-surface-hover hover:border-strong transition-all duration-200 min-h-[44px]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Meetings
            </Link>

          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 animate-fade-in" style={{ animationDelay: "0.05s" }}>
        {[
          { label: "Today", value: stats.todayMeetings, color: "from-emerald-500 to-teal-500", bg: "bg-emerald-50 border-emerald-200", icon: "📅" },
          { label: "Pending", value: stats.pending, color: "from-amber-500 to-orange-500", bg: "bg-amber-50 border-amber-200", icon: "⏳" },
          { label: "This Week", value: stats.thisWeek, color: "from-blue-500 to-cyan-500", bg: "bg-blue-50 border-blue-200", icon: "📊" },
          { label: "Total", value: appointments.length, color: "from-violet-500 to-purple-500", bg: "bg-violet-50 border-violet-200", icon: "📋" },
        ].map((s, i) => (
          <div
            key={s.label}
            className="card p-4 sm:p-5 bg-surface flex items-center gap-3 sm:gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            style={{ animationDelay: `${0.08 + i * 0.04}s` }}
          >
            <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${s.bg} flex items-center justify-center text-lg shrink-0`}>
              {s.icon}
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-primary leading-none">{s.value}</p>
              <p className="text-xs font-semibold text-tertiary uppercase tracking-wider mt-1.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {pendingRequests.length > 0 && (
        <div className="animate-fade-in" style={{ animationDelay: "0.12s" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-primary">Action Required</span>
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-100 text-amber-700 text-[10px]">
              {pendingRequests.length}
            </span>
          </div>
          <div className="space-y-2">
            {pendingRequests.map((apt) => (
              <div
                key={apt.id}
                className="card p-4 sm:p-5 bg-surface border-l-4 border-l-amber-400 hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-sm font-bold text-white shadow-sm shrink-0">
                      {apt.student?.name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-primary truncate">
                        {apt.student?.name || "Student"}
                      </p>
                      <p className="text-xs text-tertiary mt-0.5">
                        {formatTimeRange(apt.date, apt.startTime, apt.endTime)}
                      </p>
                      {apt.title && (
                        <p className="text-xs text-secondary font-medium mt-0.5 truncate">{apt.title}</p>
                      )}
                      <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider ${
                        apt.meetingType === "CONSULTATION"
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "bg-surface text-secondary border border-default"
                      }`}>
                        {apt.meetingType === "CONSULTATION" ? "Consultation" : "Internal"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto shrink-0">
                    {acceptingId === apt.id ? (
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:items-center">
                        <input
                          type="url"
                          value={teamsLinkInput}
                          onChange={(e) => setTeamsLinkInput(e.target.value)}
                          placeholder="https://teams.microsoft.com/l/meetup-join/..."
                          className="w-full sm:w-64 px-3 py-2.5 sm:py-2 rounded-lg border border-default text-xs focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-400"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcceptWithTeamsLink(apt.id)}
                            disabled={actionLoading === apt.id || !teamsLinkInput.trim()}
                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-4 py-2.5 sm:py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 min-h-[44px] sm:min-h-0"
                          >
                            {actionLoading === apt.id ? "Accepting..." : "Confirm"}
                          </button>
                          <button
                            onClick={() => { setAcceptingId(null); setTeamsLinkInput("") }}
                            className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2.5 sm:py-2 rounded-lg border border-default text-secondary text-xs font-semibold hover:bg-surface-hover transition-colors min-h-[44px] sm:min-h-0"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            if (apt.meetingType === "CONSULTATION") {
                              setAcceptingId(apt.id)
                            } else {
                              handleAccept(apt.id)
                            }
                          }}
                          disabled={actionLoading === apt.id}
                          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-4 py-2.5 sm:py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 min-h-[44px] sm:min-h-0"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Accept
                        </button>
                        <button
                          onClick={() => handleDecline(apt.id)}
                          disabled={actionLoading === apt.id}
                          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-4 py-2.5 sm:py-2 rounded-lg border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50 hover:border-rose-300 transition-colors disabled:opacity-50 min-h-[44px] sm:min-h-0"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Decline
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 animate-fade-in" style={{ animationDelay: "0.28s" }}>
        <div className="card p-5 sm:p-6 bg-surface">
          <p className="text-[10px] font-bold text-tertiary uppercase tracking-widest mb-4">This Week</p>
          <div className="flex gap-2 sm:gap-3">
            {weeklyPreview.map((day, i) => (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-[10px] font-semibold text-tertiary uppercase tracking-wider">{DAY_LABELS[i]}</span>
                <div
                  className={`w-full aspect-square rounded-xl flex items-center justify-center text-sm font-bold transition-colors duration-200 ${
                    day.count === 0
                      ? "bg-surface text-slate-300"
                      : day.count <= 2
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : day.count <= 4
                          ? "bg-gold-50 text-gold-700 border border-gold-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                >
                  {day.count > 0 ? day.count : "–"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {recentActivity.length > 0 && (
          <div className="card p-5 sm:p-6 bg-surface">
            <p className="text-[10px] font-bold text-tertiary uppercase tracking-widest mb-3">Recent Activity</p>
            <div className="space-y-2">
              {recentActivity.map((apt) => (
                <div key={apt.id} className="flex items-start gap-3">
                  <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                    apt.status === "COMPLETED" ? "bg-emerald-500" :
                    apt.status === "REJECTED" ? "bg-rose-400" : "bg-slate-300"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-secondary">
                      <span className="font-semibold">
                        {apt.status === "COMPLETED" ? "Completed" : apt.status === "REJECTED" ? "Declined" : "Cancelled"}
                      </span>
                      {" "}with {apt.student?.name || "Attendee"}
                    </p>
                    <p className="text-[11px] text-tertiary">{apt.date} &middot; {apt.startTime}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isDean && departmentStats && (
        <div className="animate-fade-in" style={{ animationDelay: "0.32s" }}>
          <div className="card p-5 sm:p-6 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/60 dark:from-amber-950/30 dark:to-amber-900/20 dark:border-amber-800/30">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-lg shrink-0 dark:bg-amber-900/40 dark:border-amber-700/30">
                  🏛️
                </div>
                <div>
                  <p className="text-sm font-bold text-primary dark:text-amber-100">Department Pulse</p>
                  <p className="text-xs text-tertiary dark:text-amber-300/70">{departmentName || "Your Department"}</p>
                </div>
              </div>
              <Link
                href={role?.includes("DEAN") ? "/dean/reports/health" : "/admin/consultations/reports/health"}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-surface border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-50 hover:border-amber-300 transition-all duration-200 min-h-[44px] sm:min-h-0 dark:bg-amber-900/20 dark:border-amber-700/30 dark:text-amber-300 dark:hover:bg-amber-900/40 dark:hover:border-amber-600/50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                View Reports
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: departmentStats.facultyLabel ?? "Faculty", value: departmentStats.facultyCount, icon: "👥" },
                { label: "Consultations", value: departmentStats.total, icon: "📋" },
                { label: "Pending", value: departmentStats.pending, icon: "⏳" },
                { label: "Completed", value: departmentStats.completed, icon: "✅" },
              ].map((s) => (
                <div key={s.label} className="bg-white/70 rounded-lg p-3 border border-amber-100/50 dark:bg-amber-950/40 dark:border-amber-800/30">
                  <p className="text-lg font-bold text-primary dark:text-amber-100">{s.value}</p>
                  <p className="text-[10px] font-semibold text-tertiary uppercase tracking-wider mt-0.5 dark:text-amber-300/70">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <section className="animate-fade-in" style={{ animationDelay: "0.38s" }}>
        <ConsultationsTimeline events={timelineEvents} variant="meetings" />
      </section>

      {appointments.length === 0 && (
        <div className="card p-12 sm:p-16 bg-surface text-center animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <div className="w-16 h-16 bg-gold-50 border border-gold-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">📅</span>
          </div>
          <h2 className="text-lg font-bold text-primary mb-2">No meetings yet</h2>
          <p className="text-sm text-tertiary max-w-md mx-auto mb-6">
            Create your first meeting to get started. Students can also book consultation slots with you once you set your availability.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/faculty/meetings/new"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gold-600 text-white font-semibold text-sm hover:bg-gold-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create a Meeting
            </Link>
            <Link
              href="/faculty/availability"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-default text-secondary font-semibold text-sm hover:bg-surface-hover transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Set Availability
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
