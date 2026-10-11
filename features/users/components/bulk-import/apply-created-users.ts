/**
 * S4 — merge one panel run's created users back into the client-held snapshot.
 *
 * `existingUsers` is a mount-time snapshot (`fetchReferenceData`), but the
 * server creates users per request. Without this merge every panel after the
 * first reads stale flags: a CCS-created student still badges "New Student"
 * in CTHM. Same client-held-map model as the faculty steps — only the
 * direction differs (faculty maps travel out in the request body; this one
 * travels back in `created[]`, which the route already returns).
 *
 * Pure: returns new arrays, never mutates. Empty `created[]` returns the same
 * references so callers can skip re-render work.
 */
export interface CreatedUser {
  name: string
  email: string
  role: string
}

const normalizeEmail = (v: string) => v.toLowerCase().trim()

export function applyCreatedUsers<R extends { email: string; isNewStudent: boolean }>(
  existingUsers: { email: string }[],
  previewRows: R[],
  created: CreatedUser[],
): { existingUsers: { email: string }[]; previewRows: R[] } {
  if (created.length === 0) return { existingUsers, previewRows }
  const createdEmails = new Set(
    created.map((c) => normalizeEmail(c.email)).filter((e) => e.length > 0),
  )
  if (createdEmails.size === 0) return { existingUsers, previewRows }
  const known = new Set(existingUsers.map((u) => normalizeEmail(u.email)))
  const additions = [...createdEmails].filter((e) => !known.has(e))
  return {
    existingUsers:
      additions.length > 0
        ? [...existingUsers, ...additions.map((email) => ({ email }))]
        : existingUsers,
    previewRows: previewRows.map((r) =>
      r.isNewStudent && createdEmails.has(normalizeEmail(r.email))
        ? { ...r, isNewStudent: false }
        : r,
    ),
  }
}
