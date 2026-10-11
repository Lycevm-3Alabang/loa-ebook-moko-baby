import type { FacultyUserStepItem } from "@/lib/services/etlEvaluation"

/**
 * Given a (potentially duplicate) array of faculty user items, return a new array
 * with duplicates removed. Blank emails collapse to the placeholder.
 *
 * - `items`: array of { email, name, departmentCode } (email already lowercased/trimmed by caller)
 * - `dummyEmail`: the sentinel email that blank rows map to (e.g. DUMMY_FACULTY_EMAIL or DUMMY_FACULTY_EMAIL_CLIENT)
 * Returns: distinct items in the same shape, with the dummy collapsed to one entry
 */
export function distinctFacultyUsers(
  items: FacultyUserStepItem[],
  dummyEmail: string,
): FacultyUserStepItem[] {
  const seen = new Set<string>()
  const distinct: FacultyUserStepItem[] = []

  for (const raw of items) {
    const email = raw.email.length === 0 ? dummyEmail : raw.email
    if (seen.has(email)) continue
    seen.add(email)
    distinct.push({
      email,
      name: email === dummyEmail ? "Unassigned Faculty" : (raw.name ?? ""),
      departmentCode: (raw.departmentCode || "").trim().toUpperCase(),
    })
  }

  return distinct
}