"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ConsultationsTimeline } from "@/features/appointments/components/ConsultationsTimeline"
import type { CalendarEvent } from "@/features/appointments/components/CalendarView"

interface StudentAppointment {
  id: string
  title: string | null
  date: string
  startTime: string
  endTime: string
  status: string
  teamsLink: string | null
  faculty?: { name: string; email: string } | null
}

interface Props {
  studentName: string
  course: string | null
  appointments: StudentAppointment[]
  hasEvaluations?: boolean
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + "T00:00:00")
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

export default function StudentDashboard({ studentName, course, appointments, hasEvaluations }: Props) {
  const greeting = useMemo(() => getGreeting(), [])

  const stats = useMemo(() => {
    const total = appointments.length
    const pending = appointments.filter((a) => a.status === "PENDING").length
    const approved = appointments.filter((a) => a.status === "APPROVED").length
    const completed = appointments.filter((a) => a.status === "COMPLETED").length
    return { total, pending, approved, completed }
  }, [appointments])

  const nextUp = useMemo(() => {
    const today = new Date().toISOString().split("T")[0]
    const upcoming = appointments
      .filter((a) => a.status === "APPROVED" && a.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    return upcoming[0] || null
  }, [appointments])

  const sortedAppointments = useMemo(
    () => [...appointments].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [appointments]
  )

  const facultyGroups = useMemo(() => {
    const map = new Map<string, StudentAppointment[]>()
    for (const apt of sortedAppointments) {
      const key = apt.faculty?.name || "Unknown Faculty"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(apt)
    }
    return Array.from(map.entries())
      .map(([name, appts]) => ({
        name,
        email: appts[0].faculty?.email || "",
        appointments: appts,
        completed: appts.filter((a) => a.status === "COMPLETED").length,
        total: appts.length,
        pct: Math.round((appts.filter((a) => a.status === "COMPLETED").length / appts.length) * 100),
      }))
      .sort((a, b) => b.total - a.total)
  }, [sortedAppointments])

  const timelineEvents: CalendarEvent[] = useMemo(
    () => appointments
      .filter((a) => a.status === "APPROVED")
      .map((a) => ({
        id: a.id,
        title: a.title || `Consultation with ${a.faculty?.name || "Faculty"}`,
        subtitle: a.faculty?.email,
        date: a.date,
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
        type: "appointment" as const,
        teamsLink: a.teamsLink,
      })),
    [appointments]
  )

  const milestoneColors: Record<string, string> = {
    COMPLETED: "bg-emerald-500 ring-emerald-200",
    APPROVED: "bg-gold-500 ring-gold-200",
    PENDING: "bg-amber-400 ring-amber-100",
    REJECTED: "bg-red-400 ring-red-100",
    CANCELLED: "bg-slate-300 ring-slate-100",
  }

  return (
    <div className="w-full space-y-6 sm:space-y-8 pb-12">
      <div className="animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">
              {greeting}, {studentName.split(" ")[0]}
              <span className="inline-block ml-2 animate-pulse-soft">👋</span>
            </h1>
            <p className="text-sm text-tertiary mt-1 flex items-center gap-2">
              {course && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gold-50 border border-gold-200 text-gold-700 text-xs">
                  {course}
                </span>
              )}
              <span>{stats.total} consultation{stats.total !== 1 ? "s" : ""} &middot; {stats.completed} completed</span>
            </p>
          </div>
          <Link
            href="/student/book"
            className="inline-flex items-center justify-center gap-1.5 px-5 py-3 sm:py-2.5 rounded-lg bg-gold-600 text-white text-sm font-semibold hover:bg-gold-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-sm min-h-[44px] sm:min-h-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Consultation
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 animate-fade-in" style={{ animationDelay: "0.05s" }}>
        {[
          { label: "Total", value: stats.total, color: "from-blue-500 to-blue-600", bg: "bg-blue-50 border-blue-200", icon: "📋" },
          { label: "Pending", value: stats.pending, color: "from-amber-500 to-orange-500", bg: "bg-amber-50 border-amber-200", icon: "⏳" },
          { label: "Approved", value: stats.approved, color: "from-emerald-500 to-teal-500", bg: "bg-emerald-50 border-emerald-200", icon: "✅" },
          { label: "Completed", value: stats.completed, color: "from-violet-500 to-purple-500", bg: "bg-violet-50 border-violet-200", icon: "🎓" },
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

      {nextUp && (
        <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div className="card p-5 sm:p-6 bg-surface border-l-4 border-l-emerald-400 hover:shadow-md transition-shadow duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-2xl shrink-0">
                  📅
                </div>
                <div>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">
                    Next consultation
                    {daysUntil(nextUp.date) === 0
                      ? " &middot; Today!"
                      : daysUntil(nextUp.date) === 1
                        ? " &middot; Tomorrow"
                        : ` &middot; In ${daysUntil(nextUp.date)} days`}
                  </p>
                  <p className="text-sm font-bold text-primary">
                    {nextUp.faculty?.name || "Faculty"}
                  </p>
                  <p className="text-xs text-tertiary mt-1">
                    {nextUp.date} &middot; {nextUp.startTime} &ndash; {nextUp.endTime}
                  </p>
                  {nextUp.title && (
                    <p className="text-xs text-secondary font-medium mt-1">{nextUp.title}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                {nextUp.teamsLink && (
                  <a
                    href={nextUp.teamsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-3 sm:py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 min-h-[44px] sm:min-h-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Join
                  </a>
                )}
                <Link
                  href={`/student/meetings/${nextUp.id}`}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-3 sm:py-2 rounded-lg border border-default text-secondary text-xs font-semibold hover:bg-surface-hover hover:border-strong transition-colors min-h-[44px] sm:min-h-0"
                >
                  Details
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {facultyGroups.length > 0 && (
        <div className="space-y-4 animate-fade-in" style={{ animationDelay: "0.25s" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-primary">Consultations by Faculty</h2>
            <span className="text-2xl">{stats.completed === stats.total ? "🏆" : "📈"}</span>
          </div>

          {facultyGroups.map((group) => (
            <div key={group.name} className="card p-5 sm:p-6 bg-surface">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-sm font-bold text-white shadow-sm shrink-0">
                  {group.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-primary">{group.name}</p>
                  <p className="text-xs text-tertiary truncate">{group.email}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-primary">{group.completed}/{group.total}</p>
                  <p className="text-[10px] font-semibold text-tertiary uppercase tracking-wider">completed</p>
                </div>
              </div>

              <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden mb-4">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold-400 to-emerald-500 transition-all duration-1000 ease-out"
                  style={{ width: `${group.pct}%` }}
                />
              </div>

              <div className="space-y-0">
                {group.appointments.map((apt, i) => {
                  const isCompleted = apt.status === "COMPLETED"
                  const isLast = i === group.appointments.length - 1
                  return (
                    <Link
                      key={apt.id}
                      href={`/student/meetings/${apt.id}`}
                      className="group flex items-start gap-3 relative"
                    >
                      {!isLast && (
                        <div className={`absolute left-[14px] top-7 w-0.5 h-full -z-0 ${
                          isCompleted ? "bg-emerald-200" : "bg-slate-200"
                        }`} />
                      )}
                      <div className="relative z-10 mt-0.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm ring-4 transition-all duration-200 group-hover:scale-110 ${
                          isCompleted
                            ? "bg-emerald-500 text-white ring-emerald-100"
                            : milestoneColors[apt.status] || "bg-slate-300 ring-slate-100"
                        }`}>
                          {isCompleted ? "✓" : i + 1}
                        </div>
                      </div>
                      <div className="flex-1 pb-4 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-tertiary">{apt.date}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] uppercase tracking-wider ${
                            isCompleted
                              ? "bg-emerald-100 text-emerald-700"
                              : apt.status === "APPROVED"
                                ? "bg-gold-100 text-gold-700"
                                : apt.status === "PENDING"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-surface text-tertiary"
                          }`}>
                            {apt.status}
                          </span>
                        </div>
                        {apt.title && (
                          <p className="text-xs text-secondary mt-0.5 group-hover:text-gold-700 transition-colors truncate">{apt.title}</p>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
        <ConsultationsTimeline events={timelineEvents} />
      </section>

      {appointments.length === 0 && (
        <div className="card p-12 sm:p-16 bg-surface text-center animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <div className="w-16 h-16 bg-gold-50 border border-gold-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">📚</span>
          </div>
          <h2 className="text-lg font-bold text-primary mb-2">Get started with ACES</h2>
          <p className="text-sm text-tertiary max-w-md mx-auto mb-6">
            Book a consultation with a faculty advisor or complete your pending evaluations.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/student/book"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gold-600 text-white font-semibold text-sm hover:bg-gold-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Book Your First Consultation
            </Link>
            {hasEvaluations && (
              <Link
                href="/student/evaluations"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-gold-600 text-gold-700 font-semibold text-sm hover:bg-gold-50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                My Evaluations
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
