import { fetcher, invalidate, useApiGet, useApiMutate } from "@/lib/api/client"
import type { AppointmentData } from "@/lib/types"

// EC-APPT-001 D-2 (additive, legacy-live): typed wrappers over the legacy
// same-origin `/api/*` appointment routes used by client components today.
// Backend `/api/v1/*` mapping per `endpoints-appointments.md` Final v1.0 +
// `api-endpoints.md` v2.1 lands at the T2 switch; Bearer/refresh lands with T1.
// BFF MUST NOT transform (e-cert D2). 403 telemetry rides `lib/api/client`.

export interface TimeSlotInput {
  date: string
  startTime: string
  endTime: string
}

export type AppointmentAction =
  | "accept"
  | "approve"
  | "decline"
  | "reject"
  | "complete"
  | "cancel"
  | "teams-link"
  | "attendee-accept"
  | "attendee-decline"
  | "student-cancel"
  | "retry-sync"

export interface FacultyBookedSlot {
  date: string
  startTime: string
  endTime: string
}

export interface BatchBookingBody {
  facultyIds: string[]
  studentId?: string
  date?: string
  startTime?: string
  endTime?: string
  timeSlots?: TimeSlotInput[]
  title?: string
  description?: string
  attendeeOptions?: unknown
  teamsLink?: string
  slotLinks?: unknown
  meetingType?: string
}

export interface SingleBookingBody {
  facultyId: string
  sessionGroupId?: string
  date: string
  startTime: string
  endTime: string
  timeSlots?: TimeSlotInput[]
  title?: string | null
  description?: string | null
  attendeeIds?: string[]
  meetingType?: string
}

// Backend v1 path constants for the T2 switch (not fetched yet).
export const V1 = {
  list: "/api/v1/appointments",
  batch: "/api/v1/appointments/batch",
  detail: (id: string) => `/api/v1/appointments/${id}`,
  action: (id: string, action: string) => `/api/v1/appointments/${id}/${action}`,
  studentCancel: (id: string) => `/api/v1/appointments/${id}/student-cancel`,
  facultyBooked: "/api/v1/appointments/faculty-booked",
  retrySync: (id: string) => `/api/v1/appointments/${id}/retry-sync`,
  slotTeamsLink: (slotId: string) => `/api/v1/appointments/slots/${slotId}/teams-link`,
  files: (id: string) => `/api/v1/appointments/${id}/files`,
} as const

export function facultyBookedUrl(facultyId: string, startDate: string, endDate: string): string {
  const q = new URLSearchParams({ facultyId, startDate, endDate })
  return `/api/appointments/faculty-booked?${q.toString()}`
}

export function appointmentDetailKey(id: string | null | undefined): string | null {
  if (!id) return null
  return `/api/appointments/${id}`
}

export function useAppointmentDetail(id: string | null | undefined) {
  return useApiGet<{ appointment: AppointmentData }>(appointmentDetailKey(id))
}

export function useAppointmentAction(id: string) {
  return useApiMutate<{ appointment: AppointmentData }>(`/api/appointments/${id}`)
}

export async function fetchAppointmentDetail(id: string): Promise<{ appointment: AppointmentData }> {
  return fetcher<{ appointment: AppointmentData }>(`/api/appointments/${id}`)
}

export async function fetchFacultyBooked(
  facultyId: string,
  startDate: string,
  endDate: string
): Promise<{ appointments: FacultyBookedSlot[] }> {
  return fetcher<{ appointments: FacultyBookedSlot[] }>(facultyBookedUrl(facultyId, startDate, endDate))
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({})) as { error?: string; message?: string }
    throw new Error(parsed.error ?? parsed.message ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export async function postSingleBooking(
  body: SingleBookingBody
): Promise<{ appointment: AppointmentData; conflicts?: unknown }> {
  const result = await postJson<{ appointment: AppointmentData; conflicts?: unknown }>(
    "/api/appointments",
    body
  )
  await invalidate("/api/appointments")
  return result
}

export async function postBatchBooking(
  body: BatchBookingBody
): Promise<{ appointment: AppointmentData; sessionGroupId?: string; conflicts?: unknown }> {
  const result = await postJson<{
    appointment: AppointmentData
    sessionGroupId?: string
    conflicts?: unknown
  }>("/api/appointments/batch", body)
  await invalidate("/api/appointments")
  return result
}

export async function postAppointmentAction(
  id: string,
  action: AppointmentAction,
  body?: Record<string, unknown>
): Promise<{ appointment: AppointmentData }> {
  const result = await postJson<{ appointment: AppointmentData }>(
    `/api/appointments/${id}/${action}`,
    body
  )
  await invalidate("/api/appointments")
  return result
}

export async function postStudentCancel(id: string): Promise<{ appointment: AppointmentData }> {
  const result = await postJson<{ appointment: AppointmentData }>(
    `/api/appointments/${id}/student-cancel`
  )
  await invalidate("/api/appointments")
  return result
}

export async function postRetrySync(id: string): Promise<{ appointment: AppointmentData }> {
  const result = await postJson<{ appointment: AppointmentData }>(
    `/api/appointments/${id}/retry-sync`
  )
  await invalidate("/api/appointments")
  return result
}

export async function postAppointmentTeamsLink(
  id: string,
  teamsLink: string
): Promise<{ appointment: AppointmentData }> {
  const result = await postJson<{ appointment: AppointmentData }>(
    `/api/appointments/${id}/teams-link`,
    { teamsLink }
  )
  await invalidate("/api/appointments")
  return result
}

export async function postSlotTeamsLink(
  slotId: string,
  teamsLink: string
): Promise<{ success: boolean }> {
  const result = await postJson<{ success: boolean }>(
    `/api/appointments/slots/${slotId}/teams-link`,
    { teamsLink }
  )
  await invalidate("/api/appointments")
  return result
}
