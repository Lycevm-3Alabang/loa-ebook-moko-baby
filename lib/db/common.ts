import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserData } from "@/lib/types"

export interface QueryError {
  code?: string
  message?: string
}

export interface SingleBuilder {
  single(): Promise<{ data: unknown; error: QueryError | null }>
}

export type DbRecord = Record<string, unknown>

export const USER_SELECT = `id, name, email, "departmentId", course, "employeeNo", "semesterId", "isDisabled", "hasLoggedInBefore", "lastLoginAt", "tokenVersion", "onboardingVersion", "createdAt", "deletedAt", userrole(roleName)`
export const USER_SELECT_WITH_PASSWORD = `id, name, email, "passwordHash", "departmentId", course, "employeeNo", "semesterId", "isDisabled", "hasLoggedInBefore", "lastLoginAt", "tokenVersion", "onboardingVersion", "createdAt", "deletedAt", userrole(roleName)`
export const USER_COLUMNS_NO_PASSWORD = `id, name, email, "departmentId", course, "employeeNo", "semesterId", "isDisabled", "hasLoggedInBefore", "lastLoginAt", "tokenVersion", "onboardingVersion", "createdAt", "deletedAt"`
export const USER_BRIEF = "id, name, email"

export function toUserWithRole(item: Record<string, unknown>): UserData {
  const roleArr = (item.userrole as Array<{ roleName: string }>) || []
  const roles = roleArr.map((r) => r.roleName)
  const role = roles.length > 0 ? roles.join("|") : "GUEST"
  return { ...item, role } as unknown as UserData
}

export function toUsersWithRoles(items: DbRecord[]): UserData[] {
  return (items || []).map(toUserWithRole)
}

export async function singleQuery<T>(builder: SingleBuilder): Promise<T | null> {
  const { data, error } = await builder.single()
  if (error) {
    if (error.code === "PGRST116") return null
    throw error
  }
  return data as T
}

export async function singleQueryWithRoles(builder: SingleBuilder): Promise<UserData | null> {
  const { data, error } = await builder.single()
  if (error) {
    if (error.code === "PGRST116") return null
    throw error
  }
  return toUserWithRole(data as DbRecord)
}

export function isMissingUserrole(err: QueryError): boolean {
  return !!(err?.message?.includes('relation "userrole" does not exist') || err?.message?.includes('"userrole"'))
}

export interface RatingWithCategory {
  evaluationId: string
  rating: number
  rubric_items: { categoryId: string; rubric_categories: { name: string } }
}

export async function fetchRatingsWithCategories(
  client: SupabaseClient,
  evaluationIds: string[],
): Promise<RatingWithCategory[]> {
  if (evaluationIds.length === 0) return []

  const { data: ratingRows, error: rErr } = await client
    .from("evaluation_ratings")
    .select("evaluationId, rating, itemId")
    .in("evaluationId", evaluationIds)
  if (rErr) throw rErr
  if (!ratingRows || ratingRows.length === 0) return []

  const itemIds = [
    ...new Set(
      ratingRows
        .map((r) => r.itemId)
        .filter((id): id is string => typeof id === "string" && id !== ""),
    ),
  ]
  // Unresolvable ratings keep the "" category fallback below instead of
  // crashing PostgREST with .in("id", []) or .in("id", [null]).
  if (itemIds.length === 0) {
    return ratingRows.map((r) => ({
      evaluationId: r.evaluationId,
      rating: r.rating,
      rubric_items: {
        categoryId: "",
        rubric_categories: { name: "" },
      },
    }))
  }
  const { data: itemRows, error: iErr } = await client
    .from("rubric_items")
    .select("id, categoryId")
    .in("id", itemIds)
  if (iErr) throw iErr

  const categoryIds = [
    ...new Set(
      (itemRows || [])
        .map((i) => i.categoryId)
        .filter((id): id is string => typeof id === "string" && id !== ""),
    ),
  ]
  const { data: catRows, error: cErr } =
    categoryIds.length === 0
      ? { data: [], error: null }
      : await client.from("rubric_categories").select("id, name").in("id", categoryIds)
  if (cErr) throw cErr

  const catMap = new Map((catRows || []).map((c) => [c.id, c.name]))
  const itemMap = new Map((itemRows || []).map((i) => [i.id, i.categoryId]))

  return ratingRows.map((r) => ({
    evaluationId: r.evaluationId,
    rating: r.rating,
    rubric_items: {
      categoryId: itemMap.get(r.itemId) || "",
      rubric_categories: { name: catMap.get(itemMap.get(r.itemId) || "") || "" },
    },
  }))
}

export const appointmentSelect = `
  *,
  student:users!appointments_studentId_fkey(${USER_BRIEF}),
  faculty:users!appointments_facultyId_fkey(${USER_BRIEF}),
  attendees:appointment_attendees(id, appointmentId, userId, status, isMandatory, user:users(${USER_BRIEF})),
  timeSlots:appointment_time_slots(id, appointmentId, date, startTime, endTime)
`

export const appointmentSelectHistory = `
  id, title, description, actionTaken, date, startTime, endTime, status,
  faculty:users!appointments_facultyId_fkey(${USER_BRIEF}),
  timeSlots:appointment_time_slots(id, appointmentId, date, startTime, endTime)
`
