import { redirect } from "next/navigation"

// Legacy path — Status was renamed to Coverage. Preserves ?dept= deep links.
export default async function AdminEvaluationStatusRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v)
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : ""
  redirect(`/admin/evaluations/coverage${suffix}`)
}
