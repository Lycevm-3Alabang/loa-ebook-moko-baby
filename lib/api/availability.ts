import { fetcher, useApiGet } from "@/lib/api/client"
import type { AvailabilityRuleData } from "@/lib/types"

// EC-APPT-001 D-2 (additive, legacy-live): typed wrappers over the legacy
// same-origin `/api/availability-rules` route used by the availability page
// and booking flows today. Backend `/api/v1/*` mapping per
// `endpoints-appointments.md` Final v1.0 §3 lands at the T2 switch.

export interface AvailabilityRuleInput {
  dayOfWeek: number
  isBlocked: boolean
  startTime: string | null
  endTime: string | null
  startDate: string
  endDate: string | null
  facultyId?: string
}

// Backend v1 path constants for the T2 switch (not fetched yet).
export const V1 = {
  list: "/api/v1/availability-rules",
  create: "/api/v1/availability-rules",
} as const

export function availabilityRulesKey(facultyId?: string): string {
  if (facultyId) {
    const q = new URLSearchParams({ facultyId })
    return `/api/availability-rules?${q.toString()}`
  }
  return "/api/availability-rules"
}

export function useAvailabilityRules(facultyId?: string, enabled = true) {
  return useApiGet<{ rules: AvailabilityRuleData[] }>(
    enabled ? availabilityRulesKey(facultyId) : null
  )
}

export async function fetchAvailabilityRules(
  facultyId?: string
): Promise<{ rules: AvailabilityRuleData[] }> {
  return fetcher<{ rules: AvailabilityRuleData[] }>(availabilityRulesKey(facultyId))
}

export async function saveAvailabilityRule(
  input: AvailabilityRuleInput
): Promise<{ rule: AvailabilityRuleData }> {
  const res = await fetch("/api/availability-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({})) as { error?: string; message?: string }
    const err = new Error(parsed.error ?? parsed.message ?? `Request failed (${res.status})`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  return res.json() as Promise<{ rule: AvailabilityRuleData }>
}
