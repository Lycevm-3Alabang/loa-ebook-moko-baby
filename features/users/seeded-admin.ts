const SEEDED_ADMIN_ID = "a0000000-0000-0000-0000-000000000001"
const SEEDED_ADMIN_EMAILS = new Set([
  "admin@lyceumalabang.ph",
  "admin@lyceumalabang.edu.ph",
])

export function isSeededAdmin(user: { id: string; email: string }): boolean {
  return user.id === SEEDED_ADMIN_ID || SEEDED_ADMIN_EMAILS.has(user.email.trim().toLowerCase())
}
