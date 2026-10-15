"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useApiGet } from "@/lib/api/client"
import UserSearchSelect from "@/features/appointments/components/booking/UserSearchSelect"
import AvailabilityCalendar from "@/features/appointments/components/booking/AvailabilityCalendar"
import SlotSuggestions from "@/features/appointments/components/booking/SlotSuggestions"
import TimeSlotPicker from "@/features/appointments/components/booking/TimeSlotPicker"
import SelectedSlotsOverview from "@/features/appointments/components/booking/SelectedSlotsOverview"
import ConflictBanner from "@/features/appointments/components/booking/ConflictBanner"
import ResultBanner from "@/features/appointments/components/booking/ResultBanner"

function timeToMinutes(h: number, m: number): number {
  return h * 60 + m
}

interface FacultyRule {
  id: string
  dayOfWeek: number
  isBlocked: boolean
  startTime: string | null
  endTime: string | null
  startDate: string
  endDate: string | null
}

interface BasicFaculty {
  id: string
  name: string
  email: string
  hasLoggedInBefore: boolean
  department: string | null
}

interface SimpleUser {
  id: string
  name: string
  email: string
  department: string | null
}

interface Props {
  facultyList: BasicFaculty[]
  userRole: "STUDENT" | "FACULTY" | "DEAN"
  students?: SimpleUser[]
  serverNow?: string
  currentUserId?: string
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function toOurDayOfWeek(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1
}

function fmtDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export default function StudentBooking({ facultyList, userRole, students, serverNow, currentUserId }: Props) {

  const now = useMemo(() => serverNow ? new Date(serverNow) : new Date(), [serverNow])
  const [currentMonth, setCurrentMonth] = useState(now.getMonth())
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const router = useRouter()

  // Faculty selection
  const [primaryFacultyId, setPrimaryFacultyId] = useState<string | null>(
    userRole !== "STUDENT" ? (currentUserId || null) : null
  )
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [primaryDeptFilter, setPrimaryDeptFilter] = useState<string>("all")
  const [attendeeDeptFilter, setAttendeeDeptFilter] = useState<string>("all")
  const [bookedAppointments, setBookedAppointments] = useState<{ date: string; startTime: string; endTime: string }[]>([])

  // Date & slot selection
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [selectedSlots, setSelectedSlots] = useState<{ date: string; start: string; end: string }[]>([])
  const [manualTime, setManualTime] = useState<{ start: string; end: string } | null>(null)

  // Booking form
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [allow24Hours, setAllow24Hours] = useState(false)
  const [showAllBlocks, setShowAllBlocks] = useState(false)

  const todayStr = useMemo(() => fmtDate(now.getFullYear(), now.getMonth(), now.getDate()), [now])
  const selectedDateStr = selectedDay ? fmtDate(currentYear, currentMonth, selectedDay) : null
  const isSelectedToday = selectedDateStr === todayStr

  // Fetch primary faculty's booked (APPROVED) appointments for the visible month
  const bookedUrl = primaryFacultyId
    ? `/api/appointments/faculty-booked?facultyId=${primaryFacultyId}&startDate=${fmtDate(currentYear, currentMonth, 1)}&endDate=${fmtDate(currentYear, currentMonth, getDaysInMonth(currentYear, currentMonth))}`
    : null

  const { data: bookedData } = useApiGet<{ appointments: { date: string; startTime: string; endTime: string }[]; rules: FacultyRule[] }>(bookedUrl)

  useEffect(() => {
    if (bookedData?.appointments && bookedAppointments.length === 0) {
      setBookedAppointments(bookedData.appointments) // eslint-disable-line react-hooks/set-state-in-effect -- sync SWR data
    }
  }, [bookedData, primaryFacultyId, bookedAppointments.length])

  // Fetch primary faculty users (filtered by department)
  const { data: primaryData } = useApiGet<{ users: SimpleUser[] }>(
    `/api/users/primary?department=${primaryDeptFilter}`
  )
  const primaryUsers = useMemo(() => primaryData?.users ?? [], [primaryData])

  // Fetch attendee users (filtered by department)
  const { data: attendeeData } = useApiGet<{ users: SimpleUser[] }>(
    `/api/users/attendees?department=${attendeeDeptFilter}`
  )
  const attendeeUsers = useMemo(() => attendeeData?.users ?? [], [attendeeData])

  const hourOptions = useMemo(() => {
    const base = allow24Hours
      ? Array.from({ length: 24 }, (_, i) => i)
      : Array.from({ length: 16 }, (_, i) => i + 6)

    if (!isSelectedToday) return base

    const currentHour = now.getHours()
    return base.filter((h) => h > currentHour)
  }, [allow24Hours, isSelectedToday, now])

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: number; errors: string[]; sessionGroupId?: string } | null>(null)
  const [showTeamsLinkForm, setShowTeamsLinkForm] = useState(false)
  const [teamsLinkMode, setTeamsLinkMode] = useState<"single" | "per-slot">("single")
  const [singleLink, setSingleLink] = useState("")
  const [slotLinks, setSlotLinks] = useState<Record<string, string>>({})
  const [teamsLinkError, setTeamsLinkError] = useState("")

  const [conflicts, setConflicts] = useState<{ userName: string; message: string; appointments?: { appointmentId: string; title: string | null; meetingType: string; date: string; startTime: string; endTime: string }[] }[]>([])

  const getActiveRule = (dateStr: string) => {
    if (!bookedData?.rules) return null

    const [year, month, day] = dateStr.split('-').map(Number)
    const utcDate = new Date(Date.UTC(year, month - 1, day))
    const dayOfWeek = toOurDayOfWeek(utcDate.getUTCDay())

    return bookedData.rules.find(
      (r) =>
        r.dayOfWeek === dayOfWeek &&
        r.startDate <= dateStr &&
        (r.endDate === null || r.endDate >= dateStr)
    ) || null
  }

  // Free time ranges for selected date — rule window minus booked (APPROVED) appointments
  const freeRanges = useMemo(() => {
    if (!selectedDay || !primaryFacultyId) return []
    const dateStr = fmtDate(currentYear, currentMonth, selectedDay)
    const rule = (() => {
      if (!bookedData?.rules) return null
      const [year, month, day] = dateStr.split('-').map(Number)
      const utcDate = new Date(Date.UTC(year, month - 1, day))
      const dayOfWeek = toOurDayOfWeek(utcDate.getUTCDay())
      return bookedData.rules.find(
        (r) =>
          r.dayOfWeek === dayOfWeek &&
          r.startDate <= dateStr &&
          (r.endDate === null || r.endDate >= dateStr)
      ) || null
    })()

    if (!rule || rule.isBlocked || !rule.startTime || !rule.endTime) return []

    let ranges = [{ start: rule.startTime, end: rule.endTime }]

    const dayBookings = bookedAppointments.filter((a) => a.date === dateStr)
    for (const apt of dayBookings) {
      const newRanges: { start: string; end: string }[] = []
      for (const r of ranges) {
        if (apt.startTime < r.end && apt.endTime > r.start) {
          if (apt.startTime > r.start) {
            newRanges.push({ start: r.start, end: apt.startTime })
          }
          if (apt.endTime < r.end) {
            newRanges.push({ start: apt.endTime, end: r.end })
          }
        } else {
          newRanges.push(r)
        }
      }
      ranges = newRanges
    }

    return ranges.sort((a, b) => a.start.localeCompare(b.start))
  }, [selectedDay, primaryFacultyId, currentYear, currentMonth, bookedAppointments, bookedData])

  // For students: constrain hour options to only hours within free time ranges
  const studentHourOptions = useMemo(() => {
    if (userRole !== "STUDENT" || freeRanges.length === 0) return hourOptions
    const availableHours = new Set<number>()
    for (const range of freeRanges) {
      const startH = parseInt(range.start.split(":")[0])
      const endH = parseInt(range.end.split(":")[0])
      for (let h = startH; h <= endH; h++) {
        availableHours.add(h)
      }
    }
    if (!isSelectedToday) return Array.from(availableHours).sort((a, b) => a - b)
    const currentHour = now.getHours()
    return Array.from(availableHours).filter((h) => h > currentHour).sort((a, b) => a - b)
  }, [hourOptions, freeRanges, userRole, isSelectedToday, now])

  const startHourOpts = studentHourOptions

  // Determine day status for student booking (primary faculty only)
  const getDayStatus = (year: number, month: number, day: number): "available" | "partially" | "not-available" | "blocked" => {
    if (!primaryFacultyId) return "not-available"
    const dateStr = fmtDate(year, month, day)
    const rule = getActiveRule(dateStr)

    if (!rule) return "not-available"
    if (rule.isBlocked) return "not-available"
    if (!rule.startTime || !rule.endTime) return "not-available"

    const dayBookings = bookedAppointments.filter((a) => a.date === dateStr)
    if (dayBookings.length === 0) return "available"

    const ruleStart = timeToMinutes(parseInt(rule.startTime.split(":")[0]), parseInt(rule.startTime.split(":")[1]))
    const ruleEnd = timeToMinutes(parseInt(rule.endTime.split(":")[0]), parseInt(rule.endTime.split(":")[1]))
    const totalAvailableMinutes = ruleEnd - ruleStart

    let bookedMinutes = 0
    for (const apt of dayBookings) {
      const aptStart = timeToMinutes(parseInt(apt.startTime.split(":")[0]), parseInt(apt.startTime.split(":")[1]))
      const aptEnd = timeToMinutes(parseInt(apt.endTime.split(":")[0]), parseInt(apt.endTime.split(":")[1]))
      const overlapStart = Math.max(aptStart, ruleStart)
      const overlapEnd = Math.min(aptEnd, ruleEnd)
      if (overlapStart < overlapEnd) {
        bookedMinutes += overlapEnd - overlapStart
      }
    }

    if (bookedMinutes === 0) return "available"
    if (bookedMinutes >= totalAvailableMinutes) return "not-available"
    return "partially"
  }

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1) }
    else { setCurrentMonth((m) => m - 1) }
    setSelectedDay(null); setSelectedSlots([]); setManualTime(null); setResult(null); setConflicts([])
  }

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1) }
    else { setCurrentMonth((m) => m + 1) }
    setSelectedDay(null); setSelectedSlots([]); setManualTime(null); setResult(null); setConflicts([])
  }

  const selectPrimary = (id: string) => {
    setPrimaryFacultyId(id)
    setAttendeeIds((prev) => prev.filter((x) => x !== id))
    setConflicts([]); setSelectedDay(null); setSelectedSlots([]); setManualTime(null); setResult(null)
  }

  const toggleAttendee = (id: string) => {
    setAttendeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleDayClick = (day: number) => {
    setSelectedDay(day)
    setSelectedSlots([]); setManualTime(null); setResult(null); setConflicts([])
  }

  const handleAddSlot = (slot: { start: string; end: string }) => {
    if (!selectedDay) return
    const dateStr = fmtDate(currentYear, currentMonth, selectedDay)
    const newSlot = { date: dateStr, start: slot.start, end: slot.end }
    setSelectedSlots((prev) => {
      const exists = prev.some((s) => s.date === newSlot.date && s.start === newSlot.start && s.end === newSlot.end)
      if (exists) return prev
      const overlaps = prev.some((s) => {
        if (s.date !== dateStr) return false
        return slot.start < s.end && slot.end > s.start
      })
      if (overlaps) return prev
      return [...prev, newSlot]
    })
    setResult(null)
  }

  const handleRemoveSlot = (index: number) => {
    setSelectedSlots((prev) => prev.filter((_, i) => i !== index))
  }

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedSlots.length === 0 || !primaryFacultyId) return

    setSubmitting(true)

    try {
      const payload: Record<string, unknown> = {
        facultyIds: [primaryFacultyId],
        timeSlots: selectedSlots.map((s) => ({ date: s.date, startTime: s.start, endTime: s.end })),
        title: title.trim(),
        description: description.trim() || undefined,
        attendeeOptions: attendeeIds.map((id) => ({ userId: id, isMandatory: true })),
        meetingType: userRole === "STUDENT" ? "CONSULTATION" : "INTERNAL",
      }

      if ((userRole === "FACULTY" || userRole === "DEAN") && showTeamsLinkForm) {
        setTeamsLinkError("")
        if (teamsLinkMode === "single") {
          if (!singleLink.trim()) {
            setTeamsLinkError("Please provide a Teams meeting link")
            setSubmitting(false)
            return
          }
          payload.teamsLink = singleLink.trim()
        } else {
          const missing = selectedSlots.find((s) => !slotLinks[`${s.date}-${s.start}-${s.end}`]?.trim())
          if (missing) {
            setTeamsLinkError("Please provide a Teams link for each time slot")
            setSubmitting(false)
            return
          }
          const slotLinksMap: Record<string, string> = {}
          for (const s of selectedSlots) {
            slotLinksMap[`${s.date}-${s.start}-${s.end}`] = slotLinks[`${s.date}-${s.start}-${s.end}`].trim()
          }
          payload.slotLinks = slotLinksMap
        }
      }

      const req = JSON.stringify(payload)
      const res = await fetch("/api/appointments/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: req })

      const data = await res.json()
      if (res.ok) {
        const appointmentId = data.appointment?.id
        if (userRole === "STUDENT") {
          router.push(`/student/meetings/${appointmentId}`)
        } else {
          router.push(`/faculty/meetings/${appointmentId}`)
        }
      } else {
        setConflicts(data.conflicts || [])
        setResult({ success: 0, errors: [data.error || "Booking failed"] })
      }
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>
      setResult({
        success: 0,
        errors: [(errObj.message as string) || "An unexpected error occurred. Check server logs."]
      });
    } finally {
      setSubmitting(false)
    }
  }

  // Departments for filter
  const allDepartments = useMemo(() => {
    const depts = new Set<string>()
    for (const f of facultyList) {
      if (f.department) depts.add(f.department)
    }
    return Array.from(depts).sort()
  }, [facultyList])

  const teamsLinkSlots = useMemo(
    () => selectedSlots.map((slot) => ({
      key: `${slot.date}-${slot.start}-${slot.end}`,
      date: slot.date,
      startTime: slot.start,
      endTime: slot.end,
    })),
    [selectedSlots]
  )

  return (
    <div className="space-y-6">
      {/* 1a. Select Primary Faculty (Required) — hidden for Faculty/Dean, they ARE the primary */}
      {userRole === "STUDENT" ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-secondary">
              1. Select Faculty
              <span className="text-red-500 ml-1">*</span>
            </h3>
            {primaryFacultyId && (
              <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Required
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <UserSearchSelect
              userRole={userRole}
              users={primaryUsers}
              excludeIds={primaryFacultyId ? [primaryFacultyId] : []}
              onSelect={(user) => selectPrimary(user.id)}
              placeholder="Search by name or email..."
            />
            {allDepartments.length > 0 && (
              <select
                value={primaryDeptFilter}
                onChange={(e) => setPrimaryDeptFilter(e.target.value)}
                className="input text-xs py-1.5 min-w-0 sm:min-w-[140px] w-full sm:w-auto"
              >
                <option value="all">All Departments</option>
                {allDepartments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>

          {/* Selected primary chip */}
          {primaryFacultyId && (() => {
            const f = facultyList.find((x) => x.id === primaryFacultyId)
            if (!f) return null
            return (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-gold-50 border border-gold-200">
                <div className="w-8 h-8 rounded-full bg-gold-200 flex items-center justify-center text-xs text-gold-700">
                  {f.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary">{f.name}</p>
                  <p className="text-xs text-tertiary">{f.email}</p>
                </div>
                <span className="text-[10px] text-gold-700 bg-gold-100 px-2 py-0.5 rounded-full border border-gold-200">
                  Primary
                </span>
                <button
                  type="button"
                  onClick={() => { setPrimaryFacultyId(null); setAttendeeIds([]) }}
                  className="text-xs text-red-500 hover:text-red-700 font-bold ml-1"
                >
                  &times;
                </button>
              </div>
            )
          })()}
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-secondary">
              1. Primary Faculty
              <span className="text-red-500 ml-1">*</span>
            </h3>
          </div>
          {primaryFacultyId && (() => {
            const f = facultyList.find((x) => x.id === primaryFacultyId)
            if (!f) return null
            return (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-gold-50 border border-gold-200">
                <div className="w-8 h-8 rounded-full bg-gold-200 flex items-center justify-center text-xs text-gold-700">
                  {f.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary">{f.name} <span className="text-xs text-tertiary font-normal">(You)</span></p>
                  <p className="text-xs text-tertiary">{f.email}</p>
                </div>
                <span className="text-[10px] text-gold-700 bg-gold-100 px-2 py-0.5 rounded-full border border-gold-200">
                  Primary
                </span>
              </div>
            )
          })()}
        </section>
      )}

      {/* 1b. Select Attendees (Optional) — shown only after primary is selected */}
      {primaryFacultyId && (
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-secondary">2. Select Attendees <span className="text-tertiary font-normal text-xs">(Optional)</span></h3>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <UserSearchSelect
              userRole={userRole}
              users={attendeeUsers}
              excludeIds={[primaryFacultyId, ...attendeeIds].filter(Boolean) as string[]}
              onSelect={(user) => toggleAttendee(user.id)}
              placeholder="Search by name or email..."
            />
            {allDepartments.length > 0 && (
              <select
                value={attendeeDeptFilter}
                onChange={(e) => setAttendeeDeptFilter(e.target.value)}
                className="input text-xs py-1.5 min-w-0 sm:min-w-[140px] w-full sm:w-auto"
              >
                <option value="all">All Departments</option>
                {allDepartments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>

          {/* Selected attendee chips */}
          {attendeeIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attendeeIds.map((id) => {
                const f = facultyList.find((x) => x.id === id)
                const s = students?.find((x) => x.id === id)
                const person = f || s
                if (!person) return null
                return (
                  <div key={id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-surface border border-default text-xs text-secondary">
                    <span className="font-medium truncate max-w-[120px]">{person.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleAttendee(id)}
                      className="text-red-500 hover:text-red-700 font-bold leading-none ml-0.5"
                    >
                      &times;
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {attendeeIds.length === 0 && userRole === "STUDENT" && (
            <p className="text-xs text-tertiary italic">No additional attendees selected. Only the primary faculty will be invited.</p>
          )}
          {attendeeIds.length === 0 && userRole !== "STUDENT" && (
            <p className="text-xs text-amber-600 font-semibold italic">At least one attendee is required before selecting a date and time.</p>
          )}
        </section>
      )}

      {/* 3. Date & Time — requires at least one attendee for Faculty/Dean */}
      {primaryFacultyId && (userRole === "STUDENT" || attendeeIds.length > 0) && (
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-secondary">3. Pick a Date & Time</h3>

          <AvailabilityCalendar
            currentYear={currentYear}
            currentMonth={currentMonth}
            selectedDay={selectedDay}
            now={now}
            userRole={userRole}
            onDayClick={handleDayClick}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            getDayStatus={getDayStatus}
            showLegend
          />

          {/* Available Slots & Manual Time Entry */}
          {selectedDay && (
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-secondary">
                {fmtDate(currentYear, currentMonth, selectedDay)}
              </h4>

              <SlotSuggestions
                freeRanges={freeRanges}
                selectedDay={selectedDay}
                currentYear={currentYear}
                currentMonth={currentMonth}
                now={now}
                selectedSlots={selectedSlots}
                showAllBlocks={showAllBlocks}
                onToggleShowAll={() => setShowAllBlocks((v) => !v)}
                onSlotClick={(slot) => setManualTime({ start: slot.start, end: slot.end })}
              />

              <TimeSlotPicker
                freeRanges={freeRanges}
                userRole={userRole}
                startHourOpts={startHourOpts}
                manualTime={manualTime}
                onManualTimeChange={setManualTime}
                onAddBlock={handleAddSlot}
                allow24Hours={allow24Hours}
                onToggle24Hours={() => setAllow24Hours((v) => !v)}
              />
            </div>
          )}
        </section>
      )}

      {/* 4. Booking Form */}
      {selectedSlots.length > 0 && primaryFacultyId && (
        <SelectedSlotsOverview
          selectedSlots={selectedSlots}
          primaryFacultyId={primaryFacultyId}
          facultyList={facultyList.map((f) => ({ id: f.id, name: f.name, email: f.email, department: f.department }))}
          attendeeIds={attendeeIds}
          students={students?.map((s) => ({ id: s.id, name: s.name, email: s.email, department: s.department }))}
          onRemoveSlot={handleRemoveSlot}
          title={title}
          onTitleChange={setTitle}
          description={description}
          onDescriptionChange={setDescription}
          userRole={userRole}
          submitting={submitting}
          onBook={handleBook}
          showTeamsLinkForm={showTeamsLinkForm}
          onShowTeamsLinkForm={() => setShowTeamsLinkForm(true)}
          teamsLinkMode={teamsLinkMode}
          onTeamsLinkModeChange={setTeamsLinkMode}
          singleLink={singleLink}
          onSingleLinkChange={setSingleLink}
          slotLinks={slotLinks}
          onSlotLinkChange={(key, value) => setSlotLinks((prev) => ({ ...prev, [key]: value }))}
          teamsLinkSlots={teamsLinkSlots}
          teamsLinkError={teamsLinkError}
        />
      )}

      {/* Conflicts */}
      <ConflictBanner
        conflicts={conflicts}
        userRole={userRole}
        isSuccess={result?.success ? true : false}
      />

      {/* Result */}
      <ResultBanner result={result} />

      {!primaryFacultyId && (
        <div className="card p-12 text-center bg-surface">
          <p className="text-secondary font-semibold text-sm">Select a primary faculty member</p>
          <p className="text-tertiary text-xs mt-1">Pick a faculty member above to see available dates and times.</p>
        </div>
      )}
    </div>
  )
}
