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

const RATINGS_IN_CHUNK_SIZE = 100

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size))
  }
  return chunks
}

export async function fetchRatingsWithCategories(
  client: SupabaseClient,
  evaluationIds: string[],
): Promise<RatingWithCategory[]> {
  if (evaluationIds.length === 0) return []

  // PostgREST caps URL length (~8KB). 1318 UUIDs ≈ 48KB in one .in() → 400
  // Bad Request. Chunk to 100 ids (≈3.7KB) per request.
  const uniqueEvalIds = [...new Set(evaluationIds)]
  const ratingResults = await Promise.all(
    chunkIds(uniqueEvalIds, RATINGS_IN_CHUNK_SIZE).map((ids) =>
      client
        .from("evaluation_ratings")
        .select("evaluationId, rating, itemId")
        .in("evaluationId", ids),
    ),
  )
  for (const res of ratingResults) {
    if (res.error) throw res.error
  }
  const ratingRows = ratingResults.flatMap((res) => res.data || [])
  if (ratingRows.length === 0) return []

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
  const itemResults = await Promise.all(
    chunkIds(itemIds, RATINGS_IN_CHUNK_SIZE).map((ids) =>
      client.from("rubric_items").select("id, categoryId").in("id", ids),
    ),
  )
  for (const res of itemResults) {
    if (res.error) throw res.error
  }
  const itemRows = itemResults.flatMap((res) => res.data || [])

  const categoryIds = [
    ...new Set(
      itemRows
        .map((i) => i.categoryId)
        .filter((id): id is string => typeof id === "string" && id !== ""),
    ),
  ]
  const catResults =
    categoryIds.length === 0
      ? []
      : await Promise.all(
          chunkIds(categoryIds, RATINGS_IN_CHUNK_SIZE).map((ids) =>
            client.from("rubric_categories").select("id, name").in("id", ids),
          ),
        )
  for (const res of catResults) {
    if (res.error) throw res.error
  }
  const catRows = catResults.flatMap((res) => res.data || [])

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
